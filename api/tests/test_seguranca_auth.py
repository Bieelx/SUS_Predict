"""Correções de segurança da auditoria de 06/09/2026 e o 2FA por e-mail.

Cobre o que a auditoria encontrou aberto: payload cru do GoTrue no cadastro,
enumeração de e-mail, `/api/cleanup` sem autenticação, docs públicas, ausência de
cabeçalhos de defesa e login sem limite de tentativas.
"""

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest

from api.core import auth as auth_core
from api.core import rate_limit
import api.main as main


@pytest.fixture
def cliente():
    rate_limit.limpar()
    return TestClient(main.app)


# ── Recorte do payload do GoTrue ──────────────────────────────────────────────

SESSAO_GOTRUE = {
    "access_token": "token-de-acesso",
    "refresh_token": "token-de-refresh",
    "token_type": "bearer",
    "expires_in": 3600,
    "user": {
        "id": "uuid-do-usuario",
        "aud": "authenticated",
        "role": "authenticated",
        "email": "marcia@saude.gov.br",
        "phone": "",
        "confirmation_sent_at": "2026-09-06T22:00:00Z",
        "app_metadata": {"provider": "email", "providers": ["email"]},
        "user_metadata": {"nome": "Márcia", "email_verified": False, "sub": "uuid-do-usuario"},
        "identities": [{"identity_id": "id-interno", "provider": "email"}],
        "created_at": "2026-01-02T10:00:00Z",
        "last_sign_in_at": "2026-09-06T21:00:00Z",
        "is_anonymous": False,
    },
}


def test_sessao_publica_entrega_tokens_e_esconde_o_resto():
    publica = auth_core.sessao_publica(SESSAO_GOTRUE)

    assert publica["access_token"] == "token-de-acesso"
    assert publica["refresh_token"] == "token-de-refresh"

    usuario = publica["user"]
    # O que a interface usa continua disponível.
    assert usuario["id"] == "uuid-do-usuario"
    assert usuario["email"] == "marcia@saude.gov.br"
    assert usuario["user_metadata"]["nome"] == "Márcia"
    assert usuario["created_at"] and usuario["last_sign_in_at"]

    # O que era vazamento não sai mais.
    for proibido in ("identities", "app_metadata", "aud", "role", "phone",
                     "confirmation_sent_at", "is_anonymous"):
        assert proibido not in usuario
    assert "sub" not in usuario["user_metadata"]
    assert "email_verified" not in usuario["user_metadata"]


def test_usuario_publico_aceita_token_dev_sem_campos_opcionais():
    publico = auth_core.usuario_publico(auth_core._dev_usuario("teste@dev.local"))
    assert publico["email"] == "teste@dev.local"
    assert publico["id"].startswith("dev-")
    assert "app_metadata" not in publico


# ── Cadastro: resposta única, sem enumeração ──────────────────────────────────

def test_signup_nao_devolve_registro_do_gotrue(cliente, monkeypatch):
    monkeypatch.setattr(auth_core, "signup", lambda *a, **k: SESSAO_GOTRUE["user"])

    resp = cliente.post("/api/auth/signup", json={
        "email": "novo@saude.gov.br", "password": "senha-bem-longa", "nome": "Novo",
    })

    assert resp.status_code == 200
    assert resp.json() == main.RESPOSTA_CADASTRO
    assert "uuid-do-usuario" not in resp.text
    assert "identities" not in resp.text


def test_signup_responde_igual_para_email_ja_cadastrado(cliente, monkeypatch):
    monkeypatch.setattr(auth_core, "signup", lambda *a, **k: SESSAO_GOTRUE["user"])
    novo = cliente.post("/api/auth/signup", json={
        "email": "novo@saude.gov.br", "password": "senha-bem-longa",
    })

    def ja_existe(*a, **k):
        raise HTTPException(400, "User already registered")

    rate_limit.limpar()
    monkeypatch.setattr(auth_core, "signup", ja_existe)
    existente = cliente.post("/api/auth/signup", json={
        "email": "existente@saude.gov.br", "password": "senha-bem-longa",
    })

    # Mesmo status e mesmo corpo: de fora não dá para saber quem já tem conta.
    assert existente.status_code == novo.status_code == 200
    assert existente.json() == novo.json()
    assert "already registered" not in existente.text.lower()


def test_signup_ainda_avisa_senha_curta(cliente):
    resp = cliente.post("/api/auth/signup", json={"email": "a@saude.gov.br", "password": "1234"})
    assert resp.status_code == 400
    assert "8 caracteres" in resp.json()["detail"]


# ── 2FA: senha não basta ──────────────────────────────────────────────────────

def test_login_com_senha_certa_nao_devolve_token(cliente, monkeypatch):
    enviados = []
    monkeypatch.setattr(auth_core, "login", lambda email, senha: SESSAO_GOTRUE)
    monkeypatch.setattr(auth_core, "enviar_codigo_email", lambda email: enviados.append(email))

    resp = cliente.post("/api/auth/login", json={
        "email": "marcia@saude.gov.br", "password": "senha-correta",
    })

    assert resp.status_code == 200
    assert resp.json() == {"codigo_enviado": True, "email": "marcia@saude.gov.br"}
    assert enviados == ["marcia@saude.gov.br"]
    # A sessão emitida pela senha é descartada e nunca chega ao navegador.
    assert "token-de-acesso" not in resp.text
    assert "token-de-refresh" not in resp.text


def test_codigo_correto_devolve_a_sessao(cliente, monkeypatch):
    monkeypatch.setattr(auth_core, "verificar_codigo_email", lambda email, codigo: SESSAO_GOTRUE)

    resp = cliente.post("/api/auth/verificar-codigo", json={
        "email": "marcia@saude.gov.br", "codigo": "482917",
    })

    corpo = resp.json()
    assert resp.status_code == 200
    assert corpo["access_token"] == "token-de-acesso"
    assert "identities" not in resp.text


def test_envio_de_codigo_nunca_cria_conta(monkeypatch):
    chamadas = {}
    monkeypatch.setattr(auth_core, "_supabase_configurado", lambda: True)
    monkeypatch.setattr(auth_core, "_gotrue_request",
                        lambda path, body, token=None: chamadas.update(path=path, body=body) or {})

    auth_core.enviar_codigo_email("desconhecido@exemplo.com")

    assert chamadas["path"] == "otp"
    assert chamadas["body"]["create_user"] is False


# ── Limite de tentativas ──────────────────────────────────────────────────────

def test_login_bloqueia_forca_bruta(cliente, monkeypatch):
    def senha_errada(*a, **k):
        raise HTTPException(400, "Invalid login credentials")

    monkeypatch.setattr(auth_core, "login", senha_errada)
    corpo = {"email": "alvo@saude.gov.br", "password": "chute"}

    codigos = [cliente.post("/api/auth/login", json=corpo).status_code for _ in range(12)]

    assert 429 in codigos, "força bruta deveria ser barrada antes da 12ª tentativa"
    assert codigos.index(429) <= 8


# ── Superfície fechada ────────────────────────────────────────────────────────

def test_docs_e_openapi_fechados_por_padrao(cliente):
    assert main.DOCS_LIBERADAS is False
    assert cliente.get("/docs").status_code == 404
    assert cliente.get("/openapi.json").status_code == 404


def test_cleanup_exige_autenticacao(cliente):
    assert cliente.delete("/api/cleanup/qualquer-job").status_code == 401


@pytest.mark.parametrize("rota", [
    "/api/runs", "/api/overview/351300", "/api/sistemas", "/api/estados",
    "/api/status/abc", "/api/resultado/abc", "/api/export/abc",
    "/api/dengue/sinan/casos",
])
def test_endpoints_de_dados_exigem_token(cliente, rota):
    assert cliente.get(rota).status_code == 401


def test_health_e_raiz_continuam_abertos(cliente):
    assert cliente.get("/health").status_code == 200
    assert cliente.get("/").status_code == 200


def test_cabecalhos_de_seguranca_em_toda_resposta(cliente):
    cabecalhos = cliente.get("/health").headers
    assert cabecalhos["X-Content-Type-Options"] == "nosniff"
    assert cabecalhos["X-Frame-Options"] == "DENY"
    assert cabecalhos["Referrer-Policy"] == "no-referrer"
    assert "max-age=" in cabecalhos["Strict-Transport-Security"]
    assert "frame-ancestors 'none'" in cabecalhos["Content-Security-Policy"]
