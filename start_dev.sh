#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║            SUS Predict — Script de desenvolvimento          ║
# ║            Projeto SUS Predict — FIAP TCC 2025/2026         ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Uso: bash start_dev.sh
#
# O script ativa o venv/ do projeto (Python 3.12 + PySUS) automaticamente.
# Se o venv não existir, exibe instruções de criação e encerra.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$ROOT_DIR/venv"
TOOLS_DIR="$ROOT_DIR/.tools"
TUNNEL_PID=""
TUNNEL_LOG=""
TUNNEL_PUBLIC_URL=""
TELEGRAM_WEBHOOK_REGISTERED=""

# ── Cores para o terminal ─────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BOLD='\033[1m';      NC='\033[0m'

ok()   { echo -e "  ${GREEN}✅${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC}  $*"; }
err()  { echo -e "  ${RED}❌${NC}  $*"; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

tem_config_telegram() {
    [ -n "${TELEGRAM_BOT_USERNAME:-}" ] \
        && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] \
        && [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ] \
        && [ -n "${CHANNEL_PAIRING_SECRET:-}" ]
}

obter_cloudflared() {
    local encontrado=""
    encontrado="$(command -v cloudflared 2>/dev/null || true)"
    if [ -n "$encontrado" ]; then
        echo "$encontrado"
        return 0
    fi

    if [ -x "$TOOLS_DIR/cloudflared" ]; then
        echo "$TOOLS_DIR/cloudflared"
        return 0
    fi

    info "cloudflared não encontrado; preparando o túnel na primeira execução..." >&2
    mkdir -p "$TOOLS_DIR"

    case "$(uname -s)" in
        Darwin)
            local arquitetura=""
            case "$(uname -m)" in
                arm64) arquitetura="arm64" ;;
                x86_64|amd64) arquitetura="amd64" ;;
                *)
                    warn "Arquitetura sem download automático de cloudflared: $(uname -m)" >&2
                    return 1
                    ;;
            esac
            local arquivo_tgz="$TOOLS_DIR/cloudflared.download.tgz"
            curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-${arquitetura}.tgz" -o "$arquivo_tgz" || return 1
            tar -xzf "$arquivo_tgz" -C "$TOOLS_DIR" || return 1
            rm -f "$arquivo_tgz"
            chmod +x "$TOOLS_DIR/cloudflared"
            encontrado="$TOOLS_DIR/cloudflared"
            ;;
        Linux)
            local arquitetura=""
            case "$(uname -m)" in
                x86_64|amd64) arquitetura="amd64" ;;
                aarch64|arm64) arquitetura="arm64" ;;
                *)
                    warn "Arquitetura sem download automático de cloudflared: $(uname -m)" >&2
                    return 1
                    ;;
            esac
            local download_tmp="$TOOLS_DIR/cloudflared.download"
            curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arquitetura}" -o "$download_tmp" || return 1
            chmod +x "$download_tmp"
            mv "$download_tmp" "$TOOLS_DIR/cloudflared"
            encontrado="$TOOLS_DIR/cloudflared"
            ;;
        *)
            warn "Instalação automática de cloudflared indisponível neste sistema." >&2
            return 1
            ;;
    esac

    [ -x "$encontrado" ] || return 1
    echo "$encontrado"
}

registrar_webhook_telegram() {
    TUNNEL_PUBLIC_URL="$1" python - <<'PY'
import json
import os
import socket
import sys
import urllib.error
import urllib.request

token = os.environ["TELEGRAM_BOT_TOKEN"]
secret = os.environ["TELEGRAM_WEBHOOK_SECRET"]
public_url = os.environ["TUNNEL_PUBLIC_URL"].rstrip("/")


def chamar_set_webhook(corpo):
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/setWebhook",
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        try:
            return json.loads(exc.read().decode("utf-8"))
        except json.JSONDecodeError:
            raise exc


corpo = {
    "url": f"{public_url}/api/susbot/telegram/webhook",
    "secret_token": secret,
    "allowed_updates": ["message"],
}
try:
    resultado = chamar_set_webhook(corpo)

    # Quick Tunnels podem estar acessíveis no navegador antes de o DNS usado
    # pelo Telegram reconhecê-los. O IP fixado evita deixar o bot sem webhook.
    descricao = resultado.get("description", "")
    if not resultado.get("ok") and "Failed to resolve host" in descricao:
        hostname = public_url.removeprefix("https://").split("/", 1)[0]
        enderecos = socket.getaddrinfo(hostname, 443, socket.AF_INET)
        corpo["ip_address"] = enderecos[0][4][0]
        resultado = chamar_set_webhook(corpo)
except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
    print(f"Falha ao registrar webhook: {exc}", file=sys.stderr)
    raise SystemExit(1)

if not resultado.get("ok"):
    print(
        f"Telegram recusou o webhook: {resultado.get('description', 'erro desconhecido')}",
        file=sys.stderr,
    )
    raise SystemExit(1)
PY
}

remover_webhook_telegram() {
    EXPECTED_TUNNEL_PUBLIC_URL="${1:-}" python - <<'PY'
import json
import os
import urllib.request

token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
expected_public_url = os.environ.get("EXPECTED_TUNNEL_PUBLIC_URL", "").rstrip("/")
expected_webhook = f"{expected_public_url}/api/susbot/telegram/webhook"
if token and expected_public_url:
    try:
        with urllib.request.urlopen(
            f"https://api.telegram.org/bot{token}/getWebhookInfo", timeout=8
        ) as response:
            current_webhook = json.loads(response.read().decode("utf-8"))["result"]["url"]
    except Exception:
        current_webhook = ""

    # Uma instância antiga pode encerrar depois de uma nova iniciar. Nesse caso,
    # ela não é dona do webhook atual e não deve removê-lo.
    if current_webhook != expected_webhook:
        raise SystemExit(0)

    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/deleteWebhook",
        data=json.dumps({"drop_pending_updates": False}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request, timeout=8).close()
    except Exception:
        pass
PY
}

echo ""
echo -e "  ${BOLD}🏥  SUS Predict — Iniciando${NC}"
echo    "  ─────────────────────────────────────────"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  0. VARIÁVEIS DE AMBIENTE (.env)
# ══════════════════════════════════════════════════════════════════════════════

if [ -f "$ROOT_DIR/.env" ]; then
    info "Carregando variáveis de ambiente de .env"
    chmod 600 "$ROOT_DIR/.env" 2>/dev/null || true
    # Carregador simples e robusto (aceita espaços em volta do '=' e valores entre aspas)
    while IFS= read -r line || [ -n "$line" ]; do
        # trim (início e fim)
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [ -z "$line" ] && continue
        [[ "$line" == \#* ]] && continue
        [[ "$line" != *"="* ]] && continue

        key="${line%%=*}"
        val="${line#*=}"

        key="${key#"${key%%[![:space:]]*}"}"
        key="${key%"${key##*[![:space:]]}"}"
        val="${val#"${val%%[![:space:]]*}"}"
        val="${val%"${val##*[![:space:]]}"}"

        # remove aspas ao redor
        if [[ "$val" == \"*\" && "$val" == *\" ]]; then
            val="${val:1:${#val}-2}"
        elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
            val="${val:1:${#val}-2}"
        fi

        export "$key=$val"
    done < "$ROOT_DIR/.env"
    ok ".env carregado (parser robusto)"
else
    warn ".env não encontrado (Supabase sync desativado, se aplicável)"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  1. VERIFICAÇÃO DO VENV (Python 3.12 obrigatório para PySUS)
# ══════════════════════════════════════════════════════════════════════════════

# Detecta caminho do activate (Windows usa Scripts/, Linux/macOS usa bin/)
if [ -f "$VENV/Scripts/activate" ]; then
    ACTIVATE="$VENV/Scripts/activate"
elif [ -f "$VENV/bin/activate" ]; then
    ACTIVATE="$VENV/bin/activate"
else
    err "venv/ não encontrado em: $VENV"
    echo ""
    info "Crie o ambiente virtual com Python 3.12 antes de continuar:"
    echo ""
    echo "    # Windows (Git Bash):"
    echo "    /c/Users/\$USER/AppData/Local/Python/pythoncore-3.12-64/python.exe -m venv venv"
    echo "    source venv/Scripts/activate"
    echo "    pip install -r Requirements.txt"
    echo ""
    echo "    # Linux/macOS:"
    echo "    python3.12 -m venv venv"
    echo "    source venv/bin/activate"
    echo "    pip install -r Requirements.txt"
    echo ""
    exit 1
fi

# Ativa o venv
source "$ACTIVATE"

# Confirma versão do Python
PY_VERSION=$(python --version 2>&1)
ok "Venv ativado — $PY_VERSION"

# Verifica se é realmente 3.12 (PySUS não funciona com 3.13+)
PY_MINOR=$(python -c "import sys; print(sys.version_info.minor)")
PY_MAJOR=$(python -c "import sys; print(sys.version_info.major)")
if [ "$PY_MAJOR" -ne 3 ] || [ "$PY_MINOR" -ne 12 ]; then
    warn "Python $PY_MAJOR.$PY_MINOR detectado. PySUS exige Python 3.12."
    warn "O backend vai rodar, mas PySUS pode não funcionar corretamente."
fi

# ══════════════════════════════════════════════════════════════════════════════
#  1b. CERTIFICADOS SSL (evita erro ao chamar Supabase/APIs externas)
# ══════════════════════════════════════════════════════════════════════════════
# Pythons instalados via python.org no macOS não carregam a cadeia de certificados
# do sistema, causando "SSL: CERTIFICATE_VERIFY_FAILED" em qualquer chamada https
# feita via urllib (ex: api/core/db.py falando com o Supabase).

python -c "import certifi" 2>/dev/null || pip install certifi -q
CERT_PATH=$(python -c "import certifi; print(certifi.where())" 2>/dev/null)
if [ -n "$CERT_PATH" ]; then
    export SSL_CERT_FILE="$CERT_PATH"
    export REQUESTS_CA_BUNDLE="$CERT_PATH"
    ok "Certificados SSL configurados (certifi)"
fi

# ══════════════════════════════════════════════════════════════════════════════
#  2. CAPACIDADES DO BACKEND
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}Verificando capacidades:${NC}"

python -c "import pysus" 2>/dev/null \
    && ok "PySUS disponível   → dados reais do DATASUS" \
    || warn "PySUS não encontrado → backend não conseguirá baixar dados reais"

python -c "from prophet import Prophet" 2>/dev/null \
    && ok "Prophet disponível → previsão com IC 80%" \
    || warn "Prophet não encontrado → usando regressão OLS"

python -c "import fastapi, uvicorn, dotenv, cryptography" 2>/dev/null || {
    echo ""
    info "Instalando dependências do backend (pode demorar na 1ª vez)..."
    info "Prophet compila Stan em C++ — aguarde alguns minutos se for a 1ª instalação."
    pip install -r "$ROOT_DIR/api/requirements_api.txt" -q
    ok "Dependências instaladas"
}

# ══════════════════════════════════════════════════════════════════════════════
#  2b. ENCERRAMENTO SEGURO DOS PROCESSOS
cleanup() {
    echo ""
    echo -e "  ${RED}🛑${NC}  Encerrando serviços..."
    [ -n "${BACKEND_PID:-}"  ] && kill "$BACKEND_PID"  2>/dev/null
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null
    if [ "$TELEGRAM_WEBHOOK_REGISTERED" = "true" ]; then
        info "Removendo webhook temporário do Telegram..."
        remover_webhook_telegram "$TUNNEL_PUBLIC_URL"
    fi
    if [ -n "$TUNNEL_PID" ]; then
        kill "$TUNNEL_PID" 2>/dev/null || true
    fi
    # Mata processos filhos que possam ter ficado
    pkill -f "uvicorn main:app" 2>/dev/null || true
    pkill -f "vite"             2>/dev/null || true
    [ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
    echo    "  👋  Até mais!"
    exit 0
}
trap cleanup INT TERM

# ═════════════════════════════════════════════════════════════════════════════════
#  3. BACKEND FASTAPI
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo -e "  ${BOLD}Iniciando serviços:${NC}"

if lsof -ti:8000 >/dev/null 2>&1; then
    warn "Porta 8000 já em uso — encerrando processo anterior..."
    kill "$(lsof -ti:8000)" 2>/dev/null || true
    sleep 1
fi

cd "$ROOT_DIR/api"
python -m uvicorn main:app --reload --port 8000 --host 0.0.0.0 \
    --log-level warning 2>&1 &
BACKEND_PID=$!
cd "$ROOT_DIR"

# Aguarda o backend responder (até 10s)
info "Aguardando backend na porta 8000..."
for i in $(seq 1 10); do
    if curl -sf http://localhost:8000/ >/dev/null 2>&1; then
        ok "Backend FastAPI   → http://localhost:8000"
        break
    fi
    sleep 1
    if [ "$i" -eq 10 ]; then
        warn "Backend demorou para responder — verifique os logs acima."
    fi
done

# ══════════════════════════════════════════════════════════════════════════════
#  3b. TÚNEL HTTPS + WEBHOOK DO TELEGRAM (desenvolvimento)
# ══════════════════════════════════════════════════════════════════════════════

if [ "${ENABLE_TELEGRAM_TUNNEL:-true}" = "false" ]; then
    info "Túnel do Telegram desativado por ENABLE_TELEGRAM_TUNNEL=false"
elif tem_config_telegram; then
    if [ -z "$TELEGRAM_WEBHOOK_SECRET" ] \
        || [ "${#TELEGRAM_WEBHOOK_SECRET}" -gt 256 ] \
        || [[ "$TELEGRAM_WEBHOOK_SECRET" == *[!A-Za-z0-9_-]* ]]; then
        warn "TELEGRAM_WEBHOOK_SECRET deve usar apenas letras, números, _ ou -. Túnel ignorado."
    elif [ "${#CHANNEL_PAIRING_SECRET}" -lt 32 ]; then
        warn "CHANNEL_PAIRING_SECRET deve ter pelo menos 32 caracteres. Túnel ignorado."
    else
        CLOUDFLARED_BIN="$(obter_cloudflared || true)"
        if [ -n "$CLOUDFLARED_BIN" ]; then
            TUNNEL_LOG="$(mktemp "${TMPDIR:-/tmp}/suspredict-cloudflared.XXXXXX")"
            "$CLOUDFLARED_BIN" tunnel --no-autoupdate --url http://localhost:8000 > "$TUNNEL_LOG" 2>&1 &
            TUNNEL_PID=$!
            info "Criando túnel HTTPS para a API..."
            for i in $(seq 1 25); do
                TUNNEL_PUBLIC_URL="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
                [ -n "$TUNNEL_PUBLIC_URL" ] && break
                if ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
                    break
                fi
                sleep 1
            done

            if [ -n "$TUNNEL_PUBLIC_URL" ]; then
                ok "Túnel HTTPS      → $TUNNEL_PUBLIC_URL"
                info "Validando acesso público ao túnel..."
                TUNNEL_READY=""
                for i in $(seq 1 15); do
                    if curl -sf --max-time 5 "$TUNNEL_PUBLIC_URL/" >/dev/null 2>&1; then
                        TUNNEL_READY="true"
                        break
                    fi
                    sleep 1
                done

                if [ "$TUNNEL_READY" != "true" ]; then
                    warn "Túnel criado, mas ainda não responde publicamente; webhook não registrado."
                elif registrar_webhook_telegram "$TUNNEL_PUBLIC_URL"; then
                    TELEGRAM_WEBHOOK_REGISTERED="true"
                    ok "Webhook Telegram → registrado para @${TELEGRAM_BOT_USERNAME#@}"
                else
                    warn "Túnel ativo, mas o webhook não foi registrado."
                fi
            else
                warn "Não foi possível obter a URL do túnel."
                [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
                TUNNEL_PID=""
            fi
        else
            warn "cloudflared indisponível; backend e frontend continuarão locais."
        fi
    fi
else
    warn "Telegram incompleto no .env; túnel automático não iniciado."
    info "Preencha TELEGRAM_BOT_USERNAME, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET e CHANNEL_PAIRING_SECRET."
fi

# ══════════════════════════════════════════════════════════════════════════════
#  4. FRONTEND REACT
# ══════════════════════════════════════════════════════════════════════════════

if lsof -ti:3000 >/dev/null 2>&1; then
    warn "Porta 3000 já em uso — encerrando processo anterior..."
    kill "$(lsof -ti:3000)" 2>/dev/null || true
    sleep 1
fi

if lsof -ti:3001 >/dev/null 2>&1; then
    warn "Porta 3001 já em uso — encerrando processo anterior..."
    kill "$(lsof -ti:3001)" 2>/dev/null || true
    sleep 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    info "Instalando dependências do frontend (npm install)..."
    cd "$ROOT_DIR/frontend" && npm install --silent
    cd "$ROOT_DIR"
fi

cd "$ROOT_DIR/frontend"
# O processo do Vite não herda segredos exclusivos do backend.
env \
    -u SUPABASE_SECRET_KEY \
    -u SUPABASE_SERVICE_ROLE_KEY \
    -u GEMINI_API_KEY \
    -u SUSBOT_DEV_AUTH_SECRET \
    -u SUS_PREDICT_DEV_PASSWORD \
    npm run dev -- --host --port 3000 --strictPort 2>&1 &
FRONTEND_PID=$!
cd "$ROOT_DIR"

sleep 2
ok "Frontend React    → http://localhost:3000"

# ══════════════════════════════════════════════════════════════════════════════
#  5. RESUMO FINAL
# ══════════════════════════════════════════════════════════════════════════════

echo ""
echo    "  ─────────────────────────────────────────"
echo -e "  ${BOLD}URLs:${NC}"
echo ""
echo    "     🌐  Dashboard  →  http://localhost:3000"
echo    "     📡  API        →  http://localhost:8000"
echo    "     📖  API Docs   →  http://localhost:8000/docs"
[ -n "$TUNNEL_PUBLIC_URL" ] && echo "     🔐  API pública →  $TUNNEL_PUBLIC_URL"
echo ""
echo    "  Pressione Ctrl+C para encerrar tudo."
echo    "  ─────────────────────────────────────────"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  6. MANTER SERVIÇOS EM EXECUÇÃO
# ══════════════════════════════════════════════════════════════════════════════

wait
