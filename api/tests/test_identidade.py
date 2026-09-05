from api.core import channel_router, susbot_router
from api.core.identidade import usuario_referencia


def test_usuario_referencia_prefere_id_e_ignora_metadata():
    assert usuario_referencia({"id": "u1", "email": "a@b.c", "user_metadata": {"cargo": "admin"}}) == "u1"
    assert usuario_referencia({"email": "a@b.c"}) == "a@b.c"
    assert usuario_referencia({"sub": "s1"}) == "s1"
    assert usuario_referencia({}) == ""


def test_routers_usam_a_funcao_unica():
    assert not hasattr(susbot_router, "_usuario_referencia")
    assert not hasattr(channel_router, "_usuario_referencia")
    assert susbot_router.usuario_referencia is usuario_referencia
    assert channel_router.usuario_referencia is usuario_referencia


def test_signup_nao_aceita_cargo():
    from api.main import AuthRequest
    assert "cargo" not in AuthRequest.model_fields
    req = AuthRequest(email="a@b.c", password="x", cargo="admin")
    assert not hasattr(req, "cargo")
