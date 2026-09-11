import importlib

from fastapi import HTTPException
import pytest


def test_login_dev_gera_token_e_require_user_aceita(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
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
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
    monkeypatch.setenv('SUSBOT_DEV_AUTH_SECRET', 'teste-secret-dev')

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException):
        auth_module.require_user('Bearer dev.token.invalido')


def test_auth_sem_supabase_e_sem_flag_dev_falha_fechado(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.delenv('SUS_PREDICT_DEV_AUTH', raising=False)

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    with pytest.raises(HTTPException) as exc:
        auth_module.login('usuario@exemplo.gov.br', 'qualquer-senha')
    assert exc.value.status_code == 503


def test_chave_publicavel_configura_supabase(monkeypatch):
    monkeypatch.setenv('SUPABASE_URL', 'https://exemplo.supabase.co')
    monkeypatch.setenv('SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_teste')
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    assert auth_module._supabase_configurado() is True


def _forjar_token(auth_module, payload):
    import base64, hashlib, hmac, json, time
    payload = {"exp": int(time.time()) + 60, **payload}
    corpo = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
    assinatura = hmac.new(auth_module._dev_secret().encode(), corpo.encode(), hashlib.sha256).digest()
    return f"dev.{corpo}.{base64.urlsafe_b64encode(assinatura).rstrip(b'=').decode()}"


def test_token_dev_nao_assume_id_de_usuario_real(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')
    monkeypatch.delenv('SUSBOT_DEV_AUTH_SECRET', raising=False)

    import api.core.auth as auth_module
    importlib.reload(auth_module)

    forjado = _forjar_token(auth_module, {"id": "uuid-real", "sub": "uuid-real", "email": "x@dev.local"})
    with pytest.raises(HTTPException):
        auth_module.require_user(f"Bearer {forjado}")


def test_token_dev_rejeitado_com_flag_desligada(monkeypatch):
    monkeypatch.delenv('SUPABASE_URL', raising=False)
    monkeypatch.delenv('SUPABASE_PUBLISHABLE_KEY', raising=False)
    monkeypatch.delenv('SUPABASE_ANON_KEY', raising=False)
    monkeypatch.setenv('SUS_PREDICT_DEV_AUTH', 'true')

    import api.core.auth as auth_module
    importlib.reload(auth_module)
    token = auth_module.dev_login('marcia.oliveira@dev.local')['access_token']

    monkeypatch.delenv('SUS_PREDICT_DEV_AUTH')
    with pytest.raises(HTTPException):
        auth_module.require_user(f"Bearer {token}")
