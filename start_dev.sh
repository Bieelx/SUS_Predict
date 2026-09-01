#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════╗
# ║            SUS Predict — Script de desenvolvimento          ║
# ║            Projeto SUS Predict — FIAP TCC 2025/2026         ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Uso: bash start_dev.sh
#
# Sobe APENAS o frontend (Vite). O backend roda fixo no servidor Ubuntu —
# o Vite encaminha /backend para SUSBOT_PROXY_TARGET (frontend/.env.local).
#
# Funciona em macOS, Linux e Windows (Git Bash / MSYS2).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONT_DIR="$ROOT_DIR/frontend"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BOLD='\033[1m';      NC='\033[0m'

ok()   { echo -e "  ${GREEN}✅${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC}  $*"; }
err()  { echo -e "  ${RED}❌${NC}  $*"; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

echo ""
echo -e "  ${BOLD}🏥  SUS Predict — Frontend${NC}"
echo    "  ─────────────────────────────────────────"
echo ""

command -v npm >/dev/null 2>&1 || { err "npm não encontrado. Instale o Node.js (>= 18)."; exit 1; }

if [ -f "$FRONT_DIR/.env.local" ]; then
    # Só para exibir o alvo do proxy; quem lê o arquivo de fato é o Vite (loadEnv).
    TARGET="$(sed -n 's/^[[:space:]]*SUSBOT_PROXY_TARGET[[:space:]]*=[[:space:]]*//p' "$FRONT_DIR/.env.local" | tail -n1 | tr -d '"'"'"'\r')"
    [ -n "$TARGET" ] && ok "Backend remoto → $TARGET" || warn "SUSBOT_PROXY_TARGET vazio em frontend/.env.local"
else
    warn "frontend/.env.local não encontrado — copie de frontend/.env.example e preencha SUSBOT_PROXY_TARGET."
fi

if [ ! -d "$FRONT_DIR/node_modules" ]; then
    info "Instalando dependências do frontend (npm install)..."
    npm install --prefix "$FRONT_DIR" --silent
fi

echo ""
echo    "  ─────────────────────────────────────────"
echo -e "  ${BOLD}Dashboard${NC}  →  http://localhost:3000"
echo    "  Pressione Ctrl+C para encerrar."
echo    "  ─────────────────────────────────────────"
echo ""

# exec: o Ctrl+C vai direto pro Vite, sem trap nem PID pra gerenciar.
# ponytail: sem checagem de porta (lsof não existe no Git Bash) — o --strictPort
# do Vite já falha com mensagem clara se a 3000 estiver ocupada.
cd "$FRONT_DIR"
exec npm run dev -- --host --port 3000 --strictPort
