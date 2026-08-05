"""
SUS Predict — Backend FastAPI
FIAP TCC 2025/2026

Start:
    source ../venv/bin/activate   # Python 3.12 required for PySUS
    pip install -r requirements_api.txt
    uvicorn main:app --reload --port 8000

Runtime capabilities:
    PYSUS_OK   → PySUS available (Python 3.12 + venv/) — downloads real DATASUS data
    PROPHET_OK → Prophet available — advanced prediction with confidence intervals
    SQLite     → always active, stores results locally (no Supabase needed)
    Supabase   → auth e sync quando URL + chaves publishable/secret estão definidas
"""

import gc
import json
import logging
import os
import shutil
import sys
import uuid
from datetime import datetime
from io import BytesIO
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, SecretStr
from starlette.concurrency import run_in_threadpool

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("sus_predict")

# ── Runtime capability detection ──────────────────────────────────────────────

PYSUS_OK = False
try:
    from pysus.online_data.SIH    import download as _sih_dl  # noqa: F401
    from pysus.online_data.SIM    import download as _sim_dl   # noqa: F401
    from pysus.online_data.SINASC import download as _sinasc_dl # noqa: F401
    from pysus.online_data.SINAN  import download as _sinan_dl  # noqa: F401
    from datasus import to_df as _to_df, ESTADOS as _PYSUS_EST  # noqa: F401
    import pandas as pd
    PYSUS_OK = True
    log.info("PySUS disponível — modo de dados reais ativo")
except Exception as _e:
    log.warning(f"PySUS não disponível ({_e}) — inicie com Python 3.12 + venv/")

try:
    import pandas as pd  # garante pandas mesmo sem PySUS
except ImportError:
    pass

# ── Core modules ──────────────────────────────────────────────────────────────

from api.core.aggregation import (
    causas_de_df, faixa_de_df, serie_de_df, sexo_de_df,
)
from api.core.constants import ANO_MAXIMO_CONFIAVEL, ESTADOS_FALLBACK
from api.core.db import delete_run, find_cached, find_latest_by_ibge, init_db, list_runs, save_resultado
from api.core import auth as auth_core
from api.core.demo_router import router as demo_router
from api.core.dengue import router as dengue_router
from api.core.export import csv_gz_bytes, slug_filename, xlsx_bytes
from api.core.ibge import buscar_municipios, get_estados
from api.core.prediction import PROPHET_OK, gerar_predicao
from api.core.susbot_router import router as susbot_router

if PYSUS_OK:
    from api.core.download import baixar_ano, baixar_sinan, limpar_cache_pysus

# ── App ───────────────────────────────────────────────────────────────────────

def _cors_origins() -> list[str]:
    configured = os.getenv("CORS_ALLOWED_ORIGINS", "").strip()
    if configured:
        return [item.strip().rstrip("/") for item in configured.split(",") if item.strip()]
    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]


ALLOWED_ORIGINS = _cors_origins()
API_DOCS_ENABLED = (
    os.getenv("APP_ENV", "development").strip().lower() != "production"
    or os.getenv("ENABLE_API_DOCS", "").strip().lower() in {"1", "true", "yes", "on"}
)
PUBLIC_API_PATHS = {
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/logout",
    "/api/auth/forgot-password",
    "/api/auth/recovery/session",
    "/api/auth/dev-login",
    # Não há rota de signup; deixá-la passar resulta em 404 em vez de autenticar.
    "/api/auth/signup",
}


app = FastAPI(
    title="SUS Predict API",
    version="2.2.0",
    docs_url="/docs" if API_DOCS_ENABLED else None,
    redoc_url="/redoc" if API_DOCS_ENABLED else None,
    openapi_url="/openapi.json" if API_DOCS_ENABLED else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
    expose_headers=["X-Conversa-Id"],
)


@app.middleware("http")
async def proteger_api(request: Request, call_next):
    """
    Falha fechado: toda rota /api exige sessão Admin, salvo o fluxo público de
    autenticação. A validação no backend protege inclusive chamadas diretas que
    contornem o React.
    """
    path = request.url.path.rstrip("/") or "/"
    if request.method == "OPTIONS":
        return await call_next(request)

    origin = request.headers.get("origin", "").rstrip("/")
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin and origin not in ALLOWED_ORIGINS:
        return JSONResponse({"detail": "Origem não autorizada"}, status_code=403)

    if path.startswith("/api/") and path not in PUBLIC_API_PATHS:
        try:
            await run_in_threadpool(auth_core.authenticate_request, request)
        except HTTPException as error:
            response = JSONResponse({"detail": error.detail}, status_code=error.status_code)
            if error.status_code == 401:
                auth_core.clear_session_cookies(response)
            # Esta resposta nasce antes do CORSMiddleware interno; preserve CORS
            # para que o frontend consiga tratar 401/403 sem um falso erro de rede.
            if origin in ALLOWED_ORIGINS:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
            response.headers["Cache-Control"] = "no-store"
            response.headers["X-Content-Type-Options"] = "nosniff"
            return response
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "no-store"
    return response


app.include_router(dengue_router)
app.include_router(demo_router)
app.include_router(susbot_router)

jobs: dict = {}
TEMP_DIR = Path("./temp_data")
TEMP_DIR.mkdir(exist_ok=True)

# ── Startup ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()


# ── Job processor ─────────────────────────────────────────────────────────────

def _tick(job_id: str, pct: int, msg: str) -> None:
    jobs[job_id]["progresso"] = pct
    jobs[job_id]["mensagem"]  = msg
    log.info(f"  [{pct:>3}%] {msg}")


def processar_download(job_id: str, req: dict) -> None:
    sistema    = req["sistema"]
    uf         = req["uf"]
    ibge       = req["ibge"]
    ano_ini    = req["ano_ini"]
    ano_fim    = req["ano_fim"]
    doenca_cod = req.get("doenca_cod", "")
    anos       = list(range(ano_ini, ano_fim + 1))

    try:
        jobs[job_id]["status"] = "running"
        _tick(job_id, 3, "Iniciando pipeline...")

        if not PYSUS_OK:
            raise RuntimeError(
                "PySUS não disponível. Inicie o backend com o venv/ do projeto (Python 3.12). "
                "Execute: source venv/bin/activate && uvicorn api.main:app --port 8000"
            )

        ano_max = ANO_MAXIMO_CONFIAVEL.get(sistema, datetime.now().year - 2)
        anos_invalidos = [a for a in anos if a > ano_max]
        if anos_invalidos:
            raise ValueError(
                f"Os anos {', '.join(map(str, anos_invalidos))} podem conter dados "
                f"preliminares ou incompletos no DATASUS para {sistema}. "
                f"Selecione apenas até {ano_max}."
            )

        _tick(job_id, 5, "Verificando cache local do PySUS...")
        limpar_cache_pysus(sistema, anos, uf=uf, doenca_cod=doenca_cod)

        _tick(job_id, 8, "Conectando ao FTP do DATASUS...")
        frames  = []
        ibge6   = str(ibge)[:6] if ibge else ""
        n_anos  = len(anos)

        for i, ano in enumerate(anos):
            pct   = 10 + int(i / n_anos * 50)
            label = f"SINAN/{doenca_cod.upper()}" if sistema == "SINAN" else f"{sistema} {uf}"
            _tick(job_id, pct, f"Baixando {label} — {ano}...")
            df_ano = baixar_ano(sistema, uf, ano, ibge6=ibge6, doenca_cod=doenca_cod)
            if df_ano is not None:
                frames.append(df_ano)
                log.info(f"    ✔  {ano}: {len(df_ano):,} registros")
            del df_ano
            gc.collect()

        if not frames:
            raise ValueError(
                f"Nenhum dado encontrado no DATASUS para {sistema} "
                f"{'(' + doenca_cod + ') ' if doenca_cod else ''}"
                f"no período {ano_ini}–{ano_fim}. "
                "Verifique se os dados estão disponíveis."
            )

        df = pd.concat(frames, ignore_index=True)
        del frames
        gc.collect()
        _tick(job_id, 62, f"{len(df):,} registros carregados. Processando...")

        _tick(job_id, 65, "Calculando série temporal...")
        serie = serie_de_df(df, ano_ini, ano_fim)

        if all(s["total"] == 0 for s in serie):
            raise ValueError(
                f"Município/UF não gerou dados para {sistema} no período {ano_ini}–{ano_fim}. "
                "Tente ampliar o período ou escolher outro município."
            )

        _tick(job_id, 72, "Ajustando modelo preditivo (Holt/OLS com detecção de surtos)...")
        serie_prev, modelo, surtos = gerar_predicao(serie, anos_previsao=3)
        surto_label = f" — {len(surtos)} ano(s) com surto isolado: {surtos}" if surtos else ""
        _tick(job_id, 85, f"Previsão gerada com {modelo}.{surto_label}")

        _tick(job_id, 88, "Calculando distribuições demográficas...")
        sexo   = sexo_de_df(df, sistema)
        faixas = faixa_de_df(df, sistema)
        causas = causas_de_df(df, sistema) or []

        total    = sum(s["total"] for s in serie)
        anos_n   = ano_fim - ano_ini + 1
        media    = total // anos_n if anos_n > 0 else total
        variacao = round(
            ((serie[-1]["total"] - serie[0]["total"]) / serie[0]["total"]) * 100, 1
        ) if len(serie) >= 2 and serie[0]["total"] > 0 else 0.0
        prox     = next((s["total"] for s in serie_prev if s["tipo"] == "previsto"), None)
        prox_low = next((s.get("lower") for s in serie_prev if s["tipo"] == "previsto"), None)
        prox_up  = next((s.get("upper") for s in serie_prev if s["tipo"] == "previsto"), None)

        resultado = {
            "meta": {
                "sistema":           sistema,
                "uf":                uf,
                "cidade":            req["cidade"],
                "ibge":              ibge,
                "ano_ini":           ano_ini,
                "ano_fim":           ano_fim,
                "doenca_cod":        doenca_cod,
                "gerado_em":         datetime.now().isoformat(),
                "dados_reais":       True,
                "dados_completos":   True,
                "ano_max_confiavel": ano_max,
                "modelo":            modelo,
            },
            "stats": {
                "total":           total,
                "media_anual":     media,
                "variacao_pct":    variacao,
                "anos_analisados": anos_n,
                "prox_previsao":   prox,
                "prox_lower":      prox_low,
                "prox_upper":      prox_up,
            },
            "serie_temporal":            serie,
            "serie_com_previsao":        serie_prev,
            "surtos":                    surtos,
            "distribuicao_sexo":         sexo,
            "distribuicao_faixa_etaria": faixas,
            "top_causas":                causas,
        }

        # Persist locally
        pasta = TEMP_DIR / job_id
        pasta.mkdir(exist_ok=True)
        (pasta / "resultado.json").write_text(
            json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        _tick(job_id, 96, "Salvando resultados...")
        try:
            gz = None
            if not df.empty:
                from api.core.constants import COLS_MINIMAS
                cols = [c for c in (COLS_MINIMAS.get(sistema, []) + ["_ano"]) if c in df.columns]
                gz = csv_gz_bytes(df[cols] if cols else df)
            save_resultado(job_id, resultado)
        except Exception as e:
            log.warning(f"Falha ao salvar resultado (job segue ok): {e}")

        _tick(job_id, 100, "Análise concluída! ✅")
        jobs[job_id].update({"status": "done", "resultado": resultado, "pasta": str(pasta)})

    except Exception as e:
        log.error(f"Job {job_id} falhou: {e}", exc_info=True)
        jobs[job_id].update({"status": "error", "mensagem": str(e)})


# ── Pydantic models ───────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)


class PasswordRecoveryRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)


class RecoverySessionRequest(BaseModel):
    # Tokens do Supabase são opacos para a aplicação. Em particular, refresh
    # tokens válidos podem ser curtos (por exemplo, 12 caracteres); formato e
    # validade devem ser verificados pelo Auth, não por uma suposição local.
    access_token: SecretStr
    refresh_token: SecretStr


class PasswordUpdateRequest(BaseModel):
    password: SecretStr = Field(min_length=12, max_length=128)


class AdminInviteRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    full_name: str = Field(min_length=3, max_length=120)
    job_title: str = Field(default="", max_length=120)


class DownloadRequest(BaseModel):
    sistema:    str
    uf:         str
    cidade:     str
    ibge:       str
    ano_ini:    int
    ano_fim:    int
    doenca_cod: str  = ""
    usar_cache: bool = True


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "status":     "ok",
        "app":        "SUS Predict API",
        "version":    "2.2.0",
        "pysus_ok":   PYSUS_OK,
        "prophet_ok": PROPHET_OK,
        "docs":       "/docs" if API_DOCS_ENABLED else None,
    }


@app.post("/api/auth/login")
def auth_login(req: LoginRequest, response: Response):
    session = auth_core.login(req.email, req.password.get_secret_value())
    user = auth_core.authorize_user(session.get("user") or {}, "admin")
    auth_core.set_session_cookies(response, session)
    return {"user": auth_core.serialize_user(user)}


@app.post("/api/auth/dev-login")
def auth_dev_login(req: LoginRequest, response: Response):
    session = auth_core.dev_login(req.email, req.password.get_secret_value())
    user = auth_core.authorize_user(session.get("user") or {}, "admin")
    auth_core.set_session_cookies(response, session)
    return {"user": auth_core.serialize_user(user)}


@app.post("/api/auth/refresh")
def auth_refresh(request: Request, response: Response):
    session = auth_core.refresh_session(auth_core.refresh_token_from_request(request))
    user = auth_core.authorize_user(session.get("user") or {}, "admin")
    auth_core.set_session_cookies(response, session)
    return {"user": auth_core.serialize_user(user)}


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response):
    auth_core.logout(auth_core.access_token_from_request(request))
    auth_core.clear_session_cookies(response)
    return {"ok": True}


@app.post("/api/auth/forgot-password", status_code=202)
def auth_forgot_password(req: PasswordRecoveryRequest):
    auth_core.request_password_recovery(req.email)
    return {
        "message": "Se houver uma conta para este e-mail, enviaremos as instruções de acesso."
    }


@app.post("/api/auth/recovery/session")
def auth_recovery_session(req: RecoverySessionRequest, response: Response):
    session = auth_core.accept_external_session(
        req.access_token.get_secret_value(),
        req.refresh_token.get_secret_value(),
    )
    auth_core.set_session_cookies(response, session)
    return {"user": auth_core.serialize_user(session["user"])}


@app.post("/api/auth/password")
def auth_update_password(
    req: PasswordUpdateRequest,
    request: Request,
    user: dict = Depends(auth_core.require_admin),
):
    auth_core.update_password(
        auth_core.access_token_from_request(request),
        req.password.get_secret_value(),
    )
    return {"ok": True, "user": auth_core.serialize_user(user)}


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(auth_core.require_admin)):
    return {"user": auth_core.serialize_user(user)}


@app.get("/api/admin/users")
def admin_list_users(
    page: int = 1,
    per_page: int = 50,
    _user: dict = Depends(auth_core.require_admin),
):
    return auth_core.list_admin_users(page, per_page)


@app.post("/api/admin/users/invite", status_code=201)
def admin_invite_user(
    req: AdminInviteRequest,
    user: dict = Depends(auth_core.require_admin),
):
    invited = auth_core.invite_admin(
        actor=user,
        email=req.email,
        full_name=req.full_name,
        job_title=req.job_title,
    )
    return {"user": invited}


@app.get("/api/sistemas")
def get_sistemas():
    return [
        {"codigo":"SIM",   "nome":"SIM — Mortalidade",          "descricao":"Óbitos com causa básica (CID-10)",             "icone":"💀"},
        {"codigo":"SIH",   "nome":"SIH — Internações",          "descricao":"Internações hospitalares financiadas pelo SUS", "icone":"🏥"},
        {"codigo":"SINASC","nome":"SINASC — Nascimentos",       "descricao":"Registros de nascidos vivos por município",     "icone":"👶"},
        {"codigo":"SIA",   "nome":"SIA — Ambulatorial",         "descricao":"Produção ambulatorial do SUS",                 "icone":"🩺"},
        {"codigo":"SINAN", "nome":"SINAN — Doenças Notificáveis","descricao":"Dengue, tuberculose, meningite e +27 agravos","icone":"🦠"},
    ]


@app.get("/api/doencas")
def get_doencas():
    if not PYSUS_OK:
        raise HTTPException(503, "PySUS não disponível. Inicie com Python 3.12 (venv do projeto).")
    try:
        from pysus.ftp.databases.sinan import SINAN as _SINANdb
        db = _SINANdb().load()
        return sorted([{"codigo": k, "nome": v} for k, v in db.diseases.items()], key=lambda x: x["nome"])
    except Exception as e:
        log.warning(f"Erro ao listar doenças SINAN: {e}")
        return []


@app.get("/api/capacidades")
def get_capacidades():
    return {"pysus_ok": PYSUS_OK, "prophet_ok": PROPHET_OK}


@app.get("/api/ano_limite")
def get_ano_limite():
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
def get_estados_endpoint():
    base = list(_PYSUS_EST) if PYSUS_OK else [(e["sigla"], e["nome"]) for e in ESTADOS_FALLBACK]
    return [{"sigla": s, "nome": n} for s, n in base]


@app.get("/api/cidades/{uf}")
def get_cidades(uf: str):
    return buscar_municipios(uf.upper())


@app.post("/api/download")
def iniciar_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    req_dict = req.model_dump()

    if req.usar_cache:
        try:
            cached = find_cached(req_dict)
        except Exception as e:
            cached = None
            log.warning(f"Cache lookup falhou: {e}")

        if cached and cached.get("meta"):
            run_id = cached["meta"].get("run_id") or str(uuid.uuid4())[:8]
            jobs[run_id] = {
                "id": run_id, "status": "done", "progresso": 100,
                "mensagem": "Carregado do cache local.", "resultado": cached,
                "pasta": None, "request": req_dict,
            }
            return {"job_id": run_id, "cache": True}

    job_id = str(uuid.uuid4())[:8]
    jobs[job_id] = {
        "id": job_id, "status": "pending", "progresso": 0,
        "mensagem": "Iniciando...", "resultado": None,
        "pasta": None, "request": req_dict,
    }
    background_tasks.add_task(processar_download, job_id, req_dict)
    return {"job_id": job_id, "cache": False}


@app.get("/api/status/{job_id}")
def get_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job não encontrado")
    j = jobs[job_id]
    return {"id": job_id, "status": j["status"], "progresso": j["progresso"], "mensagem": j["mensagem"]}


@app.get("/api/resultado/{job_id}")
def get_resultado(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job não encontrado")
    if jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Job ainda não concluído")
    return jobs[job_id]["resultado"]


@app.get("/api/overview/{ibge}")
def get_city_overview(ibge: str):
    """Aggregates latest cached resultado of each system for a city."""
    ibge6 = str(ibge)[:6]
    result = {}
    for sistema in ["SIM", "SIH", "SINASC", "SIA", "SINAN"]:
        cached = find_latest_by_ibge(ibge6, sistema)
        if cached:
            result[sistema] = cached
    return result


@app.get("/api/runs")
def get_runs(sistema: str | None = None, limit: int = 200):
    try:
        runs = list_runs(sistema=sistema, limit=limit)
        return {"ok": True, "runs": runs}
    except Exception as e:
        return {"ok": False, "runs": [], "error": str(e)}


@app.get("/api/export/{job_id}")
def export_xlsx_endpoint(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job não encontrado")
    if jobs[job_id]["status"] != "done":
        raise HTTPException(400, "Job ainda não concluído")
    resultado = jobs[job_id].get("resultado")
    if not resultado:
        raise HTTPException(404, "Resultado não encontrado")

    meta     = resultado.get("meta") or {}
    filename = (
        f"sus_predict_{slug_filename(str(meta.get('sistema','SUS')))}"
        f"_{slug_filename(str(meta.get('uf','')))}"
        f"_{slug_filename(str(meta.get('cidade','')))}"
        f"_{meta.get('ano_ini','')}–{meta.get('ano_fim','')}_{job_id}.xlsx"
    ).strip("_")

    content = xlsx_bytes(resultado)
    return StreamingResponse(
        BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.delete("/api/cleanup/{job_id}")
def cleanup(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job não encontrado")
    pasta = jobs[job_id].get("pasta")
    if pasta:
        shutil.rmtree(pasta, ignore_errors=True)
    try:
        delete_run(job_id)
    except Exception as e:
        log.warning(f"Falha ao remover run do SQLite: {e}")
    del jobs[job_id]
    return {"ok": True, "mensagem": "Dados locais deletados com sucesso."}
