#!/usr/bin/env bash
# SUS Predict — Quick Tunnel persistente para o backend do servidor Ubuntu
#
# Uso no servidor:
#   cd /home/bieelx/suspredict
#   tmux new -s susbot-tunnel
#   bash deploy/tunnel_susbot.sh
#
# Desanexe do tmux com Ctrl+B, D. O túnel continuará ativo após fechar o SSH.
# Este script chama `sudo systemctl restart susbot`; o usuário precisa ter
# permissão para reiniciar o serviço (interativamente ou via sudoers).
# Ele não inicia o backend, o frontend ou o Ollama.
#
# A URL atual fica em ~/.susbot_tunnel_url e pode ser consultada do Mac com:
#   ssh bieelx@10.0.0.156 "cat ~/.susbot_tunnel_url"

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="$ROOT_DIR/.tools"
ENV_FILE="$ROOT_DIR/.env"
STATE_FILE="${SUSBOT_TUNNEL_STATE_FILE:-$HOME/.susbot_tunnel_url}"
BACKEND_URL="http://127.0.0.1:8000"
TUNNEL_PID=""
TUNNEL_LOG=""
TUNNEL_PUBLIC_URL=""
TELEGRAM_WEBHOOK_REGISTERED=""

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✅${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC}  $*"; }
err()  { echo -e "  ${RED}❌${NC}  $*" >&2; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

carregar_env() {
    [ -f "$ENV_FILE" ] || { err ".env não encontrado em $ENV_FILE"; return 1; }
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line#"${line%%[![:space:]]*}"}"
        line="${line%"${line##*[![:space:]]}"}"
        [ -z "$line" ] && continue
        [[ "$line" == \#* || "$line" != *"="* ]] && continue
        local key="${line%%=*}" val="${line#*=}"
        key="${key#"${key%%[![:space:]]*}"}"; key="${key%"${key##*[![:space:]]}"}"
        val="${val#"${val%%[![:space:]]*}"}"; val="${val%"${val##*[![:space:]]}"}"
        if [[ "$val" == \"*\" && "$val" == *\" ]]; then
            val="${val:1:${#val}-2}"
        elif [[ "$val" == \'*\' && "$val" == *\' ]]; then
            val="${val:1:${#val}-2}"
        fi
        [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] && export "$key=$val"
    done < "$ENV_FILE"
}

tem_config_telegram() {
    [ -n "${TELEGRAM_BOT_USERNAME:-}" ] && [ -n "${TELEGRAM_BOT_TOKEN:-}" ] \
        && [ -n "${TELEGRAM_WEBHOOK_SECRET:-}" ] && [ -n "${CHANNEL_PAIRING_SECRET:-}" ]
}

config_telegram_valida() {
    [[ "${TELEGRAM_BOT_USERNAME:-}" =~ ^@?[A-Za-z0-9_]{5,32}$ ]] \
        && [[ "${TELEGRAM_BOT_TOKEN:-}" =~ ^[0-9]+:[A-Za-z0-9_-]{20,}$ ]] \
        && [ "${#TELEGRAM_WEBHOOK_SECRET}" -le 256 ] \
        && [[ "$TELEGRAM_WEBHOOK_SECRET" =~ ^[A-Za-z0-9_-]+$ ]] \
        && [ "${#CHANNEL_PAIRING_SECRET}" -ge 32 ]
}

obter_cloudflared() {
    local encontrado="" arquitetura="" download_tmp=""
    encontrado="$(command -v cloudflared 2>/dev/null || true)"
    if [ -n "$encontrado" ]; then echo "$encontrado"; return 0; fi
    if [ -x "$TOOLS_DIR/cloudflared" ]; then echo "$TOOLS_DIR/cloudflared"; return 0; fi
    info "cloudflared não encontrado; baixando para .tools/..." >&2
    mkdir -p "$TOOLS_DIR"
    case "$(uname -m)" in
        x86_64|amd64) arquitetura="amd64" ;;
        aarch64|arm64) arquitetura="arm64" ;;
        *) warn "Arquitetura sem download automático: $(uname -m)" >&2; return 1 ;;
    esac
    download_tmp="$TOOLS_DIR/cloudflared.download"
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arquitetura}" -o "$download_tmp" || return 1
    chmod +x "$download_tmp"
    mv "$download_tmp" "$TOOLS_DIR/cloudflared"
    echo "$TOOLS_DIR/cloudflared"
}

registrar_webhook_telegram() {
    TUNNEL_PUBLIC_URL="$1" python3 - <<'PY'
import json, os, socket, sys, urllib.error, urllib.request
token = os.environ["TELEGRAM_BOT_TOKEN"]
secret = os.environ["TELEGRAM_WEBHOOK_SECRET"]
public_url = os.environ["TUNNEL_PUBLIC_URL"].rstrip("/")
def call(body):
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/setWebhook", data=json.dumps(body).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        try: return json.loads(exc.read().decode())
        except json.JSONDecodeError: raise exc
body = {"url": f"{public_url}/api/susbot/telegram/webhook", "secret_token": secret, "allowed_updates": ["message"]}
try:
    result = call(body)
    if not result.get("ok") and "Failed to resolve host" in result.get("description", ""):
        hostname = public_url.removeprefix("https://").split("/", 1)[0]
        body["ip_address"] = socket.getaddrinfo(hostname, 443, socket.AF_INET)[0][4][0]
        result = call(body)
except (OSError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
    print(f"Falha ao registrar webhook: {type(exc).__name__}", file=sys.stderr)
    raise SystemExit(1)
if not result.get("ok"):
    print(f"Telegram recusou o webhook: {result.get('description', 'erro desconhecido')}", file=sys.stderr)
    raise SystemExit(1)
PY
}

remover_webhook_telegram() {
    EXPECTED_TUNNEL_PUBLIC_URL="${1:-}" python3 - <<'PY'
import json, os, urllib.request
token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
public_url = os.environ.get("EXPECTED_TUNNEL_PUBLIC_URL", "").rstrip("/")
expected = f"{public_url}/api/susbot/telegram/webhook"
if token and public_url:
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getWebhookInfo", timeout=8) as response:
            current = json.loads(response.read().decode())["result"]["url"]
    except Exception:
        current = ""
    if current != expected: raise SystemExit(0)
    request = urllib.request.Request(f"https://api.telegram.org/bot{token}/deleteWebhook", data=json.dumps({"drop_pending_updates": False}).encode(), headers={"Content-Type": "application/json"}, method="POST")
    try: urllib.request.urlopen(request, timeout=8).close()
    except Exception: pass
PY
}

atualizar_cors() {
    NEW_TUNNEL_URL="$1" ENV_FILE="$ENV_FILE" python3 - <<'PY'
import os, re, shutil, stat, tempfile, time
path = os.environ["ENV_FILE"]
new_url = os.environ["NEW_TUNNEL_URL"].rstrip("/")
mode = stat.S_IMODE(os.stat(path).st_mode)
backup = f"{path}.bak.{time.strftime('%Y%m%d-%H%M%S')}"
shutil.copy2(path, backup)
with open(path, encoding="utf-8") as fh: lines = fh.readlines()
key = "SUSBOT_CORS_ORIGINS"
found = False
for index, line in enumerate(lines):
    match = re.match(r"^(\s*" + key + r"\s*=\s*)(.*?)(\r?\n)?$", line)
    if not match: continue
    found = True
    raw = match.group(2).strip()
    quote = raw[0] if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "\"'" else ""
    value = raw[1:-1] if quote else raw
    origins, seen = [], set()
    for origin in [part.strip() for part in value.split(",")] + [new_url]:
        if not origin or re.fullmatch(r"https://[-a-z0-9]+\.trycloudflare\.com/?", origin): continue
        normalized = origin.rstrip("/")
        if normalized not in seen: seen.add(normalized); origins.append(normalized)
    origins.append(new_url)
    rendered = ",".join(origins)
    lines[index] = f"{match.group(1)}{quote}{rendered}{quote}{match.group(3) or ''}"
    break
if not found:
    if lines and not lines[-1].endswith(("\n", "\r")): lines[-1] += "\n"
    lines.append(f"{key}={new_url}\n")
directory = os.path.dirname(path)
fd, temporary = tempfile.mkstemp(prefix=".env.tunnel.", dir=directory, text=True)
try:
    with os.fdopen(fd, "w", encoding="utf-8") as fh: fh.writelines(lines)
    os.chmod(temporary, mode)
    os.replace(temporary, path)
finally:
    if os.path.exists(temporary): os.unlink(temporary)
print(backup)
PY
}

aguardar_health() {
    local tentativas="${1:-30}"
    for ((i=1; i<=tentativas; i++)); do
        curl -fsS --max-time 3 "$BACKEND_URL/health" >/dev/null 2>&1 && return 0
        sleep 1
    done
    return 1
}

cleanup() {
    local exit_code="${1:-0}"
    trap - INT TERM
    echo ""
    info "Encerrando Quick Tunnel..."
    if [ "$TELEGRAM_WEBHOOK_REGISTERED" = "true" ]; then remover_webhook_telegram "$TUNNEL_PUBLIC_URL"; fi
    [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
    [ -n "$TUNNEL_LOG" ] && rm -f "$TUNNEL_LOG"
    if [ -n "$TUNNEL_PUBLIC_URL" ] && [ -f "$STATE_FILE" ] \
        && [ "$(head -n 1 "$STATE_FILE" 2>/dev/null || true)" = "$TUNNEL_PUBLIC_URL" ]; then
        rm -f "$STATE_FILE"
    fi
    exit "$exit_code"
}
trap cleanup INT TERM

echo ""
echo -e "  ${BOLD}SUS Predict — Quick Tunnel do servidor${NC}"
echo "  ─────────────────────────────────────────"

carregar_env || exit 1
if ! aguardar_health 1; then
    err "Backend indisponível em $BACKEND_URL/health. Verifique: sudo systemctl status susbot"
    exit 1
fi
ok "Backend respondeu em $BACKEND_URL/health"

CLOUDFLARED_BIN="$(obter_cloudflared || true)"
[ -n "$CLOUDFLARED_BIN" ] || { err "Não foi possível obter o cloudflared."; exit 1; }
TUNNEL_LOG="$(mktemp "${TMPDIR:-/tmp}/susbot-cloudflared.XXXXXX")"
chmod 600 "$TUNNEL_LOG"
"$CLOUDFLARED_BIN" tunnel --no-autoupdate --url "$BACKEND_URL" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!
info "Criando Quick Tunnel..."
for _ in $(seq 1 30); do
    TUNNEL_PUBLIC_URL="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)"
    [ -n "$TUNNEL_PUBLIC_URL" ] && break
    kill -0 "$TUNNEL_PID" 2>/dev/null || break
    sleep 1
done
[ -n "$TUNNEL_PUBLIC_URL" ] || { err "O cloudflared não forneceu uma URL."; cleanup 1; }

info "Validando acesso público..."
PUBLIC_READY=""
for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$TUNNEL_PUBLIC_URL/health" >/dev/null 2>&1; then PUBLIC_READY=true; break; fi
    kill -0 "$TUNNEL_PID" 2>/dev/null || break
    sleep 1
done
[ "$PUBLIC_READY" = "true" ] || { err "O túnel não respondeu publicamente em /health."; cleanup 1; }
ok "Túnel público validado"

BACKUP_FILE="$(atualizar_cors "$TUNNEL_PUBLIC_URL")" || { err "Falha ao atualizar SUSBOT_CORS_ORIGINS."; cleanup 1; }
ok "CORS atualizado; backup criado em $BACKUP_FILE"
info "Reiniciando susbot.service (sudo pode solicitar sua senha)..."
if ! sudo systemctl restart susbot; then err "Falha ao reiniciar susbot.service."; cleanup 1; fi
if ! aguardar_health 30; then err "O backend não voltou a responder após o restart."; cleanup 1; fi
ok "Backend reiniciado e saudável"

if ! tem_config_telegram; then
    warn "Telegram não configurado; webhook não será registrado. O túnel continuará ativo."
elif ! config_telegram_valida; then
    warn "Configuração do Telegram inválida; confira username, token e secrets. Nenhum valor foi exibido."
elif registrar_webhook_telegram "$TUNNEL_PUBLIC_URL"; then
    TELEGRAM_WEBHOOK_REGISTERED=true
    ok "Webhook do Telegram registrado"
else
    warn "Não foi possível registrar o webhook; o túnel continuará ativo."
fi

umask 077
printf '%s\n' "$TUNNEL_PUBLIC_URL" > "$STATE_FILE"
chmod 600 "$STATE_FILE"

echo ""
echo "  ══════════════════════════════════════════════════════════════"
echo -e "  ${BOLD}${GREEN}URL VIGENTE: $TUNNEL_PUBLIC_URL${NC}"
echo "  Estado salvo em: $STATE_FILE"
echo "  No Mac, defina SUSBOT_PROXY_TARGET=$TUNNEL_PUBLIC_URL"
echo "  ══════════════════════════════════════════════════════════════"
echo "  Mantenha esta sessão tmux ativa. Ctrl+C encerra o túnel."
echo ""

wait "$TUNNEL_PID"
EXIT_CODE=$?
warn "cloudflared encerrou com código $EXIT_CODE."
cleanup "$EXIT_CODE"
