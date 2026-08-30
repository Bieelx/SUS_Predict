from fastapi import HTTPException
from starlette.requests import Request

from api.core import susbot_access


def _request(ip="127.0.0.1"):
    return Request({"type": "http", "method": "POST", "path": "/", "headers": [], "client": (ip, 1234)})


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
