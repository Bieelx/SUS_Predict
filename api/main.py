"""
SUS Predict — Backend FastAPI
FIAP TCC 2025/2026

Start:
    source venv/bin/activate      # Python 3.12
    pip install -r api/requirements_api.txt
    uvicorn api.main:app --reload --port 8000

Runtime capabilities:
    PROPHET_OK → Prophet available — advanced prediction with confidence intervals
    SQLite     → always active, stores results locally (no Supabase needed)
    Supabase   → optional sync when SUPABASE_URL + a secret key (SUPABASE_SECRET_KEY / SUPABASE_SECRET / SUPABASE_SERVICE_ROLE_KEY) are set
"""

import logging
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("sus_predict")

# ── Core modules ──────────────────────────────────────────────────────────────

from api.core.constants import ANO_MAXIMO_CONFIAVEL, ESTADOS_FALLBACK
from api.core.db import find_latest_by_ibge, init_db, list_runs
from api.core import auth as auth_core
from api.core.operational_router import router as operational_router
from api.core.ibge import buscar_municipios
from api.core.prediction import PROPHET_OK, gerar_predicao
from api.core.susbot_router import router as susbot_router
from api.core.susbot_access import avisar_se_protecao_desativada
from api.core.channel_router import router as channel_router
from api.core.etp_pdf import router as etp_pdf_router
from api.core.admin_router import router as admin_router
from api.core.local_records_router import router as local_records_router
from api.core.local_records_frontend import router as local_records_frontend_router
from api.core.operational_inputs_router import router as operational_inputs_router
from api.core.permissoes import Acesso, require_acesso
from api.core.rate_limit import identidade_requisicao, limitar

# ── App ───────────────────────────────────────────────────────────────────────

# /docs e /openapi.json entregam o mapa completo da API a quem não está logado.
# Fechados por padrão; ligue SUS_PREDICT_DOCS=1 apenas em desenvolvimento.
DOCS_LIBERADAS = os.getenv("SUS_PREDICT_DOCS", "").strip().lower() in {"1", "true", "yes", "on"}

app = FastAPI(
    title="SUS Predict API",
    version="2.1.0",
    docs_url="/docs" if DOCS_LIBERADAS else None,
    redoc_url="/redoc" if DOCS_LIBERADAS else None,
    openapi_url="/openapi.json" if DOCS_LIBERADAS else None,
)


@app.middleware("http")
async def cabecalhos_de_seguranca(request: Request, call_next):
    """Cabeçalhos de defesa em toda resposta: clickjacking, sniffing e HTTPS.

    O header `server: uvicorn` não sai daqui — ele é escrito pelo protocolo. Suba
    o serviço com `uvicorn --no-server-header` para removê-lo.
    """

    resposta = await call_next(request)
    resposta.headers.setdefault("X-Content-Type-Options", "nosniff")
    resposta.headers.setdefault("X-Frame-Options", "DENY")
    resposta.headers.setdefault("Referrer-Policy", "no-referrer")
    resposta.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    if not DOCS_LIBERADAS:
        # A API só devolve JSON. Com as docs ligadas isto quebraria o Swagger UI.
        resposta.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    return resposta
cors_origins = [
    origem.strip()
    for origem in (
        os.getenv("SUSBOT_CORS_ORIGINS")
        or os.getenv("CORS_ALLOWED_ORIGINS")
        or "http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
    if origem.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)

app.include_router(operational_router)
app.include_router(susbot_router)
app.include_router(channel_router)
app.include_router(etp_pdf_router)
app.include_router(admin_router)
app.include_router(local_records_router)
app.include_router(local_records_frontend_router)
app.include_router(operational_inputs_router)

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    avisar_se_protecao_desativada()
    init_db()
    from api.core.channel_queue import iniciar_worker
    iniciar_worker()
    from api.core.clara_proativa import iniciar_agendador
    iniciar_agendador()


@app.on_event("shutdown")
def shutdown():
    from api.core.channel_queue import parar_worker
    parar_worker()


# ── Pydantic models ───────────────────────────────────────────────────────────

class AuthRequest(BaseModel):
    email:    str
    password: str
    nome:     str = ""


class CodigoRequest(BaseModel):
    email:  str
    codigo: str


class RefreshRequest(BaseModel):
    refresh_token: str


class PerfilRequest(BaseModel):
    """Alterações do próprio cadastro. Todos opcionais: manda só o que mudou."""

    nome:         str | None = None
    avatar:       str | None = None   # data URL (image/*) ou "" para remover
    email:        str | None = None
    senha:        str | None = None
    senha_atual:  str = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":     "ok",
        "app":        "SUS Predict API",
        "version":    "2.1.0",
        "prophet_ok": PROPHET_OK,
        "docs":       "/docs",
    }


@app.get("/health")
def health():
    """Sonda publica: nao consulta banco, usuario, segredos ou LLM."""

    return {"status": "ok"}


# Resposta única do cadastro: nunca revela se o e-mail já tem conta (isso deixaria
# qualquer um levantar a lista de usuários) e nunca devolve o registro do GoTrue.
RESPOSTA_CADASTRO = {
    "ok": True,
    "mensagem": (
        "Se o e-mail for válido, enviamos as instruções de confirmação. "
        "Confirme o e-mail e faça login para continuar."
    ),
}
SENHA_MINIMA = 8


@app.post("/api/auth/signup")
def auth_signup(req: AuthRequest, request: Request):
    limitar("signup", identidade_requisicao(request), limite=5)

    # Validado aqui para que erros de formulário não sejam engolidos pela resposta
    # genérica logo abaixo — o usuário precisa saber que a senha é curta demais.
    if "@" not in req.email or len(req.email.strip()) < 5:
        raise HTTPException(400, "Informe um e-mail válido.")
    if len(req.password) < SENHA_MINIMA:
        raise HTTPException(400, f"A senha precisa ter pelo menos {SENHA_MINIMA} caracteres.")

    # Só o nome. Cargo/papel nunca é auto-declarado: perfil de acesso vem do
    # armazenamento de permissões (docs/09), não de user_metadata.
    metadata = {"nome": req.nome} if req.nome else {}
    try:
        auth_core.signup(req.email, req.password, metadata or None)
    except HTTPException as exc:
        # Recusa do GoTrue (e-mail já cadastrado, domínio bloqueado) devolve a mesma
        # resposta do sucesso: de fora, os dois casos são indistinguíveis.
        if exc.status_code in (400, 401, 422):
            log.info("signup recusado pelo GoTrue: %s", exc.detail)
            return RESPOSTA_CADASTRO
        raise
    return RESPOSTA_CADASTRO


@app.post("/api/auth/login")
def auth_login(req: AuthRequest, request: Request):
    """Primeiro fator. A senha correta não devolve sessão: dispara o código por e-mail."""

    limitar("login", identidade_requisicao(request), limite=8)
    sessao = auth_core.login(req.email, req.password)

    if auth_core.is_dev_token(sessao.get("access_token", "")):
        # Demonstração local: não existe caixa de entrada para receber o código.
        return auth_core.sessao_publica(sessao)

    # A sessão emitida pela senha é descartada aqui, sem chegar ao navegador. O
    # token só é entregue em /api/auth/verificar-codigo, contra o código do e-mail.
    auth_core.enviar_codigo_email(req.email)
    return {"codigo_enviado": True, "email": req.email}


@app.post("/api/auth/verificar-codigo")
def auth_verificar_codigo(req: CodigoRequest, request: Request):
    """Segundo fator: troca o código recebido por e-mail pela sessão."""

    limitar("verificar-codigo", identidade_requisicao(request), limite=10)
    sessao = auth_core.verificar_codigo_email(req.email, req.codigo.strip())
    return auth_core.sessao_publica(sessao)


@app.post("/api/auth/refresh")
def auth_refresh(req: RefreshRequest):
    return auth_core.sessao_publica(auth_core.refresh_session(req.refresh_token))


@app.post("/api/auth/dev-login")
def auth_dev_login(req: AuthRequest | None = None):
    email = (req.email if req else "") or "marcia.oliveira@dev.local"
    return auth_core.sessao_publica(auth_core.dev_login(email))


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(auth_core.require_user)):
    # `acesso.perfil` só para o frontend decidir o que mostrar; a autorização real é
    # sempre do backend (require_acesso / require_admin). Só lê, não provisiona.
    from api.core.db import get_acesso
    from api.core.identidade import usuario_referencia
    linha = get_acesso(usuario_referencia(user))
    return {
        **auth_core.usuario_publico(user),
        "acesso": {"perfil": linha.get("perfil"), "ativo": bool(linha.get("ativo"))} if linha else None,
    }


# Data URL de ~150KB cobre um avatar de 256px em JPEG com folga; acima disso o
# user_metadata do GoTrue deixa de ser lugar de guardar imagem (aí é Storage).
AVATAR_MAX_BYTES = 150_000


@app.put("/api/auth/me")
def auth_atualizar_me(
    req: PerfilRequest,
    request: Request,
    authorization: str = Header(default=""),
    user: dict = Depends(auth_core.require_user),
):
    """Edita o próprio cadastro: nome, foto, e-mail e senha."""

    limitar("perfil", identidade_requisicao(request), limite=10)
    token = authorization.removeprefix("Bearer ").strip()

    campos: dict = {}
    metadata: dict = {}

    if req.nome is not None:
        nome = req.nome.strip()
        if len(nome) < 2:
            raise HTTPException(400, "Informe um nome com pelo menos 2 caracteres.")
        metadata["nome"] = nome

    if req.avatar is not None:
        avatar = req.avatar.strip()
        if avatar:
            if not avatar.startswith("data:image/"):
                raise HTTPException(400, "A foto precisa ser uma imagem.")
            if len(avatar.encode("utf-8")) > AVATAR_MAX_BYTES:
                raise HTTPException(400, "A foto é grande demais. Envie uma imagem menor.")
        metadata["avatar"] = avatar  # "" remove

    if metadata:
        # PUT substitui o user_metadata inteiro: mescla com o que já existe para não
        # apagar o nome ao trocar só a foto (e vice-versa).
        campos["data"] = {**(user.get("user_metadata") or {}), **metadata}

    # E-mail e senha são credenciais: só mudam contra a senha atual. O GoTrue não
    # exige isso, então a reconferência é aqui — um token roubado não vira conta roubada.
    troca_credencial = bool(req.email) or bool(req.senha)
    if troca_credencial:
        if not req.senha_atual:
            raise HTTPException(400, "Informe sua senha atual para alterar e-mail ou senha.")
        try:
            auth_core.login(user.get("email") or "", req.senha_atual)
        except HTTPException:
            raise HTTPException(400, "Senha atual incorreta.")

    if req.email:
        email = req.email.strip()
        if "@" not in email or len(email) < 5:
            raise HTTPException(400, "Informe um e-mail válido.")
        if email.lower() != (user.get("email") or "").lower():
            campos["email"] = email

    if req.senha:
        if len(req.senha) < SENHA_MINIMA:
            raise HTTPException(400, f"A senha precisa ter pelo menos {SENHA_MINIMA} caracteres.")
        campos["password"] = req.senha

    if not campos:
        raise HTTPException(400, "Nada para alterar.")

    atualizado = auth_core.atualizar_usuario(token, campos)
    return {
        **auth_core.usuario_publico(atualizado),
        "email_pendente": bool(campos.get("email")),
    }


@app.post("/api/auth/logout", status_code=204)
def auth_logout(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token ausente")
    auth_core.logout(authorization.removeprefix("Bearer ").strip())


@app.get("/api/sistemas")
def get_sistemas(_acesso: Acesso = Depends(require_acesso())):
    return [
        {"codigo":"SIM",   "nome":"SIM — Mortalidade",          "descricao":"Óbitos com causa básica (CID-10)",             "icone":"💀"},
        {"codigo":"SIH",   "nome":"SIH — Internações",          "descricao":"Internações hospitalares financiadas pelo SUS", "icone":"🏥"},
        {"codigo":"SINASC","nome":"SINASC — Nascimentos",       "descricao":"Registros de nascidos vivos por município",     "icone":"👶"},
        {"codigo":"SIA",   "nome":"SIA — Ambulatorial",         "descricao":"Produção ambulatorial do SUS",                 "icone":"🩺"},
        {"codigo":"SINAN", "nome":"SINAN — Doenças Notificáveis","descricao":"Dengue, tuberculose, meningite e +27 agravos","icone":"🦠"},
    ]


@app.get("/api/capacidades")
def get_capacidades(_acesso: Acesso = Depends(require_acesso())):
    return {"prophet_ok": PROPHET_OK}


@app.get("/api/ano_limite")
def get_ano_limite(_acesso: Acesso = Depends(require_acesso())):
    defasagens = {s: 1 for s in ANO_MAXIMO_CONFIAVEL}
    return {
        sistema: {
            "ano_maximo":     ano,
            "defasagem_anos": defasagens.get(sistema, 1),
            "aviso": (
                f"Dados do {sistema} são consolidados com ~{defasagens.get(sistema, 1)} "
                f"ano(s) de defasagem. Selecione anos até {ano} para dados completos."
            ),
        }
        for sistema, ano in ANO_MAXIMO_CONFIAVEL.items()
    }


@app.get("/api/estados")
def get_estados_endpoint(_acesso: Acesso = Depends(require_acesso())):
    return [{"sigla": e["sigla"], "nome": e["nome"]} for e in ESTADOS_FALLBACK]


@app.get("/api/cidades/{uf}")
def get_cidades(uf: str, _acesso: Acesso = Depends(require_acesso())):
    return buscar_municipios(uf.upper())


@app.get("/api/overview/{ibge}")
def get_city_overview(ibge: str, _acesso: Acesso = Depends(require_acesso())):
    """Aggregates latest cached resultado of each system for a city."""
    ibge6 = str(ibge)[:6]
    result = {}
    for sistema in ["SIM", "SIH", "SINASC", "SIA", "SINAN"]:
        cached = find_latest_by_ibge(ibge6, sistema)
        if cached:
            result[sistema] = cached
    return result


@app.get("/api/runs")
def get_runs(_acesso: Acesso = Depends(require_acesso()), sistema: str | None = None, limit: int = 200):
    try:
        runs = list_runs(sistema=sistema, limit=limit)
        return {"ok": True, "runs": runs}
    except Exception as e:
        return {"ok": False, "runs": [], "error": str(e)}
