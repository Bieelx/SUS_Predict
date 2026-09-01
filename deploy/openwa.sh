#!/usr/bin/env bash
# SUS Predict — gateway WhatsApp (OpenWA) no servidor Ubuntu
#
# O OpenWA não publica imagem pronta: o compose dele builda do Dockerfile local.
# Este script clona/atualiza o repo, sobe o container e serve de smoke test da API.
#
# Uso no servidor:
#   bash deploy/openwa.sh up          # clona/atualiza + docker compose up -d --build
#   bash deploy/openwa.sh chave       # mostra a API key gerada no primeiro boot
#   bash deploy/openwa.sh sessao      # cria (ou reaproveita) a sessão e mostra o status
#   bash deploy/openwa.sh qr          # baixa o QR em PNG para parear o número
#   bash deploy/openwa.sh enviar 5511999999999 "teste"
#   bash deploy/openwa.sh webhook http://127.0.0.1:8000/api/susbot/whatsapp/webhook
#   bash deploy/openwa.sh smoke 5511999999999
#   bash deploy/openwa.sh logs
#
# Config em .env na raiz do projeto (ver .env.example, bloco WhatsApp).

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✅${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC}  $*"; }
err()  { echo -e "  ${RED}❌${NC}  $*" >&2; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

OPENWA_REPO="${OPENWA_REPO:-https://github.com/rmyndharis/OpenWA.git}"
OPENWA_DIR="${OPENWA_DIR:-$HOME/openwa}"
OPENWA_BASE_URL="${OPENWA_BASE_URL:-http://127.0.0.1:2785}"
OPENWA_SESSION_NAME="${OPENWA_SESSION_NAME:-clara}"
OPENWA_ENGINE="${OPENWA_ENGINE:-baileys}"
OPENWA_SERVICE="${OPENWA_SERVICE:-openwa-api}"
OPENWA_API_KEY="${OPENWA_API_KEY:-}"
OPENWA_WEBHOOK_SECRET="${OPENWA_WEBHOOK_SECRET:-}"

# jq não vem instalado por padrão no Ubuntu server; python3 vem.
campo() { python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(1)
for chave in sys.argv[1:]:
    if not isinstance(d,dict): sys.exit(1)
    d=d.get(chave)
    if d is None: sys.exit(1)
print(d)' "$@" 2>/dev/null; }

api() {
    local metodo="$1" rota="$2" corpo="${3:-}"
    [ -n "$OPENWA_API_KEY" ] || { err "OPENWA_API_KEY não definida — rode 'bash deploy/openwa.sh chave' e cole no .env"; return 1; }
    if [ -n "$corpo" ]; then
        curl -sS -X "$metodo" "$OPENWA_BASE_URL$rota" \
            -H "X-API-Key: $OPENWA_API_KEY" -H "Content-Type: application/json" -d "$corpo"
    else
        curl -sS -X "$metodo" "$OPENWA_BASE_URL$rota" -H "X-API-Key: $OPENWA_API_KEY"
    fi
}

compose() { (cd "$OPENWA_DIR" && docker compose "$@"); }

cmd_up() {
    command -v docker >/dev/null || { err "docker não encontrado"; return 1; }
    if [ -d "$OPENWA_DIR/.git" ]; then
        info "Atualizando $OPENWA_DIR"
        git -C "$OPENWA_DIR" pull --ff-only || warn "git pull falhou; seguindo com a cópia local"
    else
        info "Clonando OpenWA em $OPENWA_DIR"
        git clone --depth 1 "$OPENWA_REPO" "$OPENWA_DIR" || return 1
    fi

    if [ -f "$OPENWA_DIR/.env" ]; then
        warn "$OPENWA_DIR/.env já existe — mantido como está"
    else
        info "Gerando $OPENWA_DIR/.env"
        cat > "$OPENWA_DIR/.env" <<EOF
# Gerado por deploy/openwa.sh do SUS Predict.
API_PORT=2785
ENGINE_TYPE=$OPENWA_ENGINE
DATABASE_TYPE=sqlite
NODE_ENV=production
# A Clara roda no mesmo host: a entrega do webhook vai para 127.0.0.1, que o
# guard de SSRF do OpenWA bloqueia por padrão. Rede fechada, 2785 só em loopback.
WEBHOOK_SSRF_PROTECT=false
EOF
    fi

    info "Subindo container (o primeiro build demora vários minutos)"
    compose up -d --build || return 1
    ok "OpenWA no ar em $OPENWA_BASE_URL (Swagger em $OPENWA_BASE_URL/api/docs)"
    cmd_chave
}

cmd_chave() {
    local chave
    chave="$(compose exec -T "$OPENWA_SERVICE" cat /app/data/.api-key 2>/dev/null | tr -d '\r\n')"
    if [ -z "$chave" ]; then
        warn "Não consegui ler /app/data/.api-key no serviço '$OPENWA_SERVICE'."
        info "Procure a chave nos logs do primeiro boot: bash deploy/openwa.sh logs | grep -i 'api key'"
        return 1
    fi
    ok "API key: ${BOLD}$chave${NC}"
    info "Cole no .env do projeto: OPENWA_API_KEY=$chave"
}

sessao_id() {
    api GET /api/sessions 2>/dev/null | python3 -c '
import json,sys
alvo=sys.argv[1]
try: dados=json.load(sys.stdin)
except Exception: sys.exit(0)
itens=dados
if isinstance(dados,dict):
    for chave in ("data","items","sessions","results"):
        if isinstance(dados.get(chave),list):
            itens=dados[chave]; break
    else:
        itens=[]
for sessao in itens if isinstance(itens,list) else []:
    if isinstance(sessao,dict) and sessao.get("name")==alvo:
        print(sessao.get("id") or "")
        break
' "$OPENWA_SESSION_NAME"
}

cmd_sessao() {
    local id; id="$(sessao_id)"
    if [ -z "$id" ]; then
        info "Criando sessão '$OPENWA_SESSION_NAME'"
        api POST /api/sessions "{\"name\":\"$OPENWA_SESSION_NAME\"}" >/dev/null || return 1
        id="$(sessao_id)"
        [ -n "$id" ] || { err "Sessão não apareceu na listagem após o POST"; return 1; }
        api POST "/api/sessions/$id/start" >/dev/null
    fi
    ok "Sessão '$OPENWA_SESSION_NAME' = $id"
    info "Status: $(api GET "/api/sessions/$id" | campo status)"
    info "Cole no .env do projeto: OPENWA_SESSION_ID=$id"
}

cmd_qr() {
    local id; id="$(sessao_id)"
    [ -n "$id" ] || { err "Sessão não existe — rode 'bash deploy/openwa.sh sessao'"; return 1; }
    local destino="$OPENWA_DIR/qr-$OPENWA_SESSION_NAME.png"
    api GET "/api/sessions/$id/qr" | python3 -c '
import base64,json,sys
dados=json.load(sys.stdin)
if isinstance(dados.get("data"),dict): dados={**dados,**dados["data"]}
url=str(dados.get("qr") or dados.get("qrCode") or "")
if not url.startswith("data:image"):
    print("status="+str(dados.get("status") or dados), file=sys.stderr); sys.exit(1)
open(sys.argv[1],"wb").write(base64.b64decode(url.split(",",1)[1]))
' "$destino" || { warn "Sem QR disponível (sessão já pareada, ou ainda inicializando)"; return 1; }
    ok "QR salvo em $destino"
    info "Do Mac: scp bieelx@SERVIDOR:$destino . && open qr-$OPENWA_SESSION_NAME.png"
    info "Escaneie em WhatsApp > Aparelhos conectados. O QR expira em ~1 min; rode de novo se passar."
}

cmd_enviar() {
    local numero="${1:-}" texto="${2:-Teste do SUS Predict via OpenWA.}"
    [ -n "$numero" ] || { err "Uso: bash deploy/openwa.sh enviar 5511999999999 \"texto\""; return 1; }
    local id; id="$(sessao_id)"
    [ -n "$id" ] || { err "Sessão não existe — rode 'bash deploy/openwa.sh sessao'"; return 1; }
    local corpo; corpo="$(python3 -c 'import json,sys;print(json.dumps({"chatId":sys.argv[1]+"@c.us","text":sys.argv[2]}))' "$numero" "$texto")"
    local resposta; resposta="$(api POST "/api/sessions/$id/messages/send-text" "$corpo")"
    if echo "$resposta" | grep -qiE '"statusCode":[[:space:]]*[45]|"error"[[:space:]]*:'; then
        err "Falhou: $resposta"; return 1
    fi
    ok "Mensagem enviada para $numero"
}

cmd_webhook() {
    local url="${1:-http://127.0.0.1:8000/api/susbot/whatsapp/webhook}"
    [ -n "$OPENWA_WEBHOOK_SECRET" ] || { err "OPENWA_WEBHOOK_SECRET ausente no .env"; return 1; }
    [ "${#OPENWA_WEBHOOK_SECRET}" -ge 16 ] || { err "OPENWA_WEBHOOK_SECRET precisa de pelo menos 16 caracteres"; return 1; }
    local id; id="$(sessao_id)"
    [ -n "$id" ] || { err "Sessão não existe — rode 'bash deploy/openwa.sh sessao'"; return 1; }
    local corpo; corpo="$(python3 -c 'import json,sys
print(json.dumps({"url":sys.argv[1],"events":["message.received","session.status"],"secret":sys.argv[2],"retryCount":3}))' "$url" "$OPENWA_WEBHOOK_SECRET")"
    local resposta; resposta="$(api POST "/api/sessions/$id/webhooks" "$corpo")"
    local webhook_id; webhook_id="$(echo "$resposta" | campo id)"
    [ -n "$webhook_id" ] || { err "Falhou: $resposta"; return 1; }
    ok "Webhook $webhook_id registrado para $url"
    info "Disparando entrega de teste"
    api POST "/api/sessions/$id/webhooks/$webhook_id/test" >/dev/null && ok "Teste enviado — confira o log da API da Clara"
}

cmd_smoke() {
    local numero="${1:-}"
    [ -n "$numero" ] || { err "Uso: bash deploy/openwa.sh smoke 5511999999999  (seu próprio número)"; return 1; }
    echo -e "\n${BOLD}1/3 sessão${NC}"; cmd_sessao || return 1
    local status; status="$(api GET "/api/sessions/$(sessao_id)" | campo status)"
    if [ "$status" != "ready" ]; then
        warn "Sessão em '$status' — pareie primeiro: bash deploy/openwa.sh qr"
        return 1
    fi
    echo -e "\n${BOLD}2/3 envio${NC}"; cmd_enviar "$numero" "Clara conectada ao WhatsApp. Se você recebeu isto, a fase 1 está de pé." || return 1
    echo -e "\n${BOLD}3/3 webhook${NC}"; cmd_webhook || return 1
    echo -e "\n"; ok "Smoke test completo."
}

cmd_logs() { compose logs -f --tail 200 "$OPENWA_SERVICE"; }

case "${1:-}" in
    up)      cmd_up ;;
    chave)   cmd_chave ;;
    sessao)  cmd_sessao ;;
    qr)      cmd_qr ;;
    enviar)  shift; cmd_enviar "$@" ;;
    webhook) shift; cmd_webhook "$@" ;;
    smoke)   shift; cmd_smoke "$@" ;;
    logs)    cmd_logs ;;
    *)       sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^#\{1,\} \{0,1\}//' ;;
esac
