from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request

from api.core import susbot_access
from api.core.susbot_router import router as susbot_router


def _request(ip="127.0.0.1", headers=None):
    raw_headers = [
        (str(nome).lower().encode("latin-1"), str(valor).encode("latin-1"))
        for nome, valor in (headers or {}).items()
    ]
    return Request({"type": "http", "method": "POST", "path": "/", "headers": raw_headers, "client": (ip, 1234)})


def test_sem_chaves_configuradas_preserva_desenvolvimento_local(monkeypatch):
    monkeypatch.delenv("SUSBOT_API_KEYS", raising=False)
    assert susbot_access.verificar_acesso_susbot(_request(), None) == "127.0.0.1"


def test_chave_individual_e_obrigatoria_quando_configurada(monkeypatch):
    monkeypatch.setenv("SUSBOT_API_KEYS", "pessoa-a,pessoa-b")
    assert susbot_access.verificar_acesso_susbot(_request(), "pessoa-b") == "pessoa-b"
    try:
        susbot_access.verificar_acesso_susbot(_request(), "errada")
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("chave invalida deveria ser recusada")


def test_header_real_avanca_ate_autenticacao_de_usuario(monkeypatch):
    """Cobre a leitura HTTP real de X-API-Key no endpoint de producao."""

    monkeypatch.setenv("SUSBOT_API_KEYS", "chave-http-valida")
    susbot_access._acessos.clear()
    app = FastAPI()
    app.include_router(susbot_router)

    response = TestClient(app).post(
        "/api/susbot/perguntar",
        headers={"X-API-Key": "chave-http-valida"},
        json={"pergunta": "teste", "ibge6": "351300"},
    )

    assert response.status_code == 401
    assert response.json() == {"detail": "Token ausente"}


def test_fallback_le_header_asgi_quando_parametro_nao_e_injetado(monkeypatch):
    monkeypatch.setenv("SUSBOT_API_KEYS", "chave-fallback")
    susbot_access._acessos.clear()
    request = _request(headers={"X-API-Key": "chave-fallback"})

    assert susbot_access.verificar_acesso_susbot(request, None) == "chave-fallback"


def test_rate_limit_e_por_chave(monkeypatch):
    monkeypatch.setenv("SUSBOT_API_KEYS", "a,b")
    monkeypatch.setenv("SUSBOT_RATE_LIMIT_PER_MINUTE", "1")
    susbot_access._acessos.clear()
    assert susbot_access.verificar_acesso_susbot(_request(), "a") == "a"
    assert susbot_access.verificar_acesso_susbot(_request(), "b") == "b"
    try:
        susbot_access.verificar_acesso_susbot(_request(), "a")
    except HTTPException as exc:
        assert exc.status_code == 429
    else:
        raise AssertionError("segunda chamada deveria ser limitada")
