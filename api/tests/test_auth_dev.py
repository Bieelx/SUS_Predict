import importlib

from fastapi import HTTPException
import pytest


def test_login_dev_gera_token_e_require_user_aceita(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
    monkeypatch.setenv('SUS_PREDICT_DEV_PASSWORD', 'senha-local-forte')
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev-com-mais-de-32-caracteres')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    resposta = auth_module.login('marcia.oliveira@dev.local', 'senha-local-forte')
    assert resposta['token_type'] == 'bearer'
    assert resposta['access_token'].startswith('dev.')

    usuario = auth_module.get_user(resposta['access_token'])
    assert usuario['email'] == 'marcia.oliveira@dev.local'
    assert usuario['role'] == 'authenticated'
    assert usuario['app_metadata']['provider'] == 'dev'


def test_token_dev_invalido_rejeita(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('APP_ENV', 'development')
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev-com-mais-de-32-caracteres')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException):
        auth_module.get_user('dev.token.invalido')


def test_auth_sem_supabase_falha_fechado(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.delenv('SUS_PREDICT_DEV_AUTH', raising=False)

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException) as exc:
        auth_module.login('admin@example.com', 'qualquer-senha')

    assert exc.value.status_code == 503


def test_dev_auth_rejeitado_em_producao(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
    monkeypatch.setenv('SUS_PREDICT_DEV_PASSWORD', 'senha-local-forte')
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev-com-mais-de-32-caracteres')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException) as exc:
        auth_module.dev_login('admin@dev.local', 'senha-local-forte')

    assert exc.value.status_code == 404
