import importlib

from fastapi import HTTPException
import pytest


def test_login_dev_gera_token_e_require_user_aceita(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    resposta = auth_module.login('marcia.oliveira@dev.local', 'dev')
    assert resposta['token_type'] == 'bearer'
    assert resposta['access_token'].startswith('dev.')

    usuario = auth_module.require_user(f"Bearer {resposta['access_token']}")
    assert usuario['email'] == 'marcia.oliveira@dev.local'
    assert usuario['role'] == 'authenticated'
    assert usuario['app_metadata']['provider'] == 'dev'


def test_token_dev_invalido_rejeita(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException):
        auth_module.require_user('Bearer dev.token.invalido')
