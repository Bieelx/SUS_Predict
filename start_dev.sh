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

# ── Cores para o terminal ─────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'
CYAN='\033[0;36m';  BOLD='\033[1m';      NC='\033[0m'

ok()   { echo -e "  ${GREEN}✅${NC}  $*"; }
warn() { echo -e "  ${YELLOW}⚠️ ${NC}  $*"; }
err()  { echo -e "  ${RED}❌${NC}  $*"; }
info() { echo -e "  ${CYAN}→${NC}  $*"; }

echo ""
echo -e "  ${BOLD}🏥  SUS Predict — Iniciando${NC}"
echo    "  ─────────────────────────────────────────"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  0. VARIÁVEIS DE AMBIENTE (.env)
# ══════════════════════════════════════════════════════════════════════════════

if [ -f "$ROOT_DIR/.env" ]; then
    info "Carregando variáveis de ambiente de .env"
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

python -c "import fastapi, uvicorn" 2>/dev/null || {
    echo ""
    info "Instalando dependências do backend (pode demorar na 1ª vez)..."
    info "Prophet compila Stan em C++ — aguarde alguns minutos se for a 1ª instalação."
    pip install -r "$ROOT_DIR/api/requirements_api.txt" -q
    ok "Dependências instaladas"
}

# ══════════════════════════════════════════════════════════════════════════════
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
#  4. FRONTEND REACT
# ══════════════════════════════════════════════════════════════════════════════

if lsof -ti:3000 >/dev/null 2>&1; then
    warn "Porta 3000 já em uso — encerrando processo anterior..."
    kill "$(lsof -ti:3000)" 2>/dev/null || true
    sleep 1
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
    info "Instalando dependências do frontend (npm install)..."
    cd "$ROOT_DIR/frontend" && npm install --silent
    cd "$ROOT_DIR"
fi

cd "$ROOT_DIR/frontend"
npm run dev -- --host 2>&1 &
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
echo ""
echo    "  Pressione Ctrl+C para encerrar tudo."
echo    "  ─────────────────────────────────────────"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
#  6. CLEANUP AO SAIR
# ══════════════════════════════════════════════════════════════════════════════

cleanup() {
    echo ""
    echo -e "  ${RED}🛑${NC}  Encerrando serviços..."
    [ -n "$BACKEND_PID"  ] && kill "$BACKEND_PID"  2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    # Mata processos filhos que possam ter ficado
    pkill -f "uvicorn main:app" 2>/dev/null || true
    pkill -f "vite"             2>/dev/null || true
    echo    "  👋  Até mais!"
    exit 0
}
trap cleanup INT TERM

wait
