import asyncio
import urllib.error

from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
import pytest

from api.core import auth


@pytest.mark.parametrize(
    "email",
    [
        "",
        "sem-arroba",
        "admin@localhost",
        "@example.com",
        "admin @example.com",
    ],
)
def test_email_invalido_rejeitado(email):
    with pytest.raises(HTTPException) as exc:
        auth.normalize_email(email)
    assert exc.value.status_code == 422


def test_email_valido_e_normalizado():
    assert auth.normalize_email("  Admin.Saude@Example.COM ") == "admin.saude@example.com"


@pytest.mark.parametrize(
    "password",
    [
        "Curta1!",
        "somente-minusculas-123!",
        "SOMENTE-MAIUSCULAS-123!",
        "SemNumero!Senha",
        "SemSimbolo123Senha",
    ],
)
def test_senha_fraca_rejeitada(password):
    with pytest.raises(HTTPException) as exc:
        auth.validate_password(password)
    assert exc.value.status_code == 422


def test_senha_forte_aceita():
    password = "SaudeSegura#2026"
    assert auth.validate_password(password) == password


def test_role_nao_e_confiada_do_user_metadata(monkeypatch):
    monkeypatch.setattr(auth, "get_user_roles", lambda _user_id: [])
    user = {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "admin@example.com",
        "user_metadata": {"role": "admin"},
    }

    with pytest.raises(HTTPException) as exc:
        auth.authorize_user(user)

    assert exc.value.status_code == 403


def test_admin_com_profile_e_role_e_autorizado():
    user = {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "admin@example.com",
        "_roles": ["admin"],
        "_profile": {"full_name": "Admin Saúde", "job_title": "Gestão"},
    }

    authorized = auth.authorize_user(user)
    payload = auth.serialize_user(authorized)

    assert payload["role"] == "admin"
    assert payload["full_name"] == "Admin Saúde"
    assert "app_metadata" not in payload


def test_cookie_de_producao_e_httponly_secure(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    response = JSONResponse({"ok": True})

    auth.set_session_cookies(
        response,
        {
            "access_token": "access-token-seguro",
            "refresh_token": "refresh-token-seguro",
            "expires_in": 3600,
        },
    )

    cookies = "\n".join(
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ).lower()
    assert "httponly" in cookies
    assert "secure" in cookies
    assert "samesite=lax" in cookies
    assert auth.ACCESS_COOKIE in cookies
    assert auth.REFRESH_COOKIE in cookies


def test_recuperacao_nao_revela_se_email_existe(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")

    def fake_request(*_args, **_kwargs):
        raise auth.SupabaseError(400, "User not found")

    monkeypatch.setattr(auth, "_request_json", fake_request)
    assert auth.request_password_recovery("pessoa@example.com") is None


@pytest.mark.parametrize(
    "supabase_status,expected_status",
    [
        (429, 429),
        (500, 503),
        (503, 503),
    ],
)
def test_refresh_preserva_falhas_transitorias(monkeypatch, supabase_status, expected_status):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")

    def fake_request(*_args, **_kwargs):
        raise auth.SupabaseError(supabase_status, "Falha transitória")

    monkeypatch.setattr(auth, "_request_json", fake_request)

    with pytest.raises(HTTPException) as exc:
        auth.refresh_session("refresh-token-valido")

    assert exc.value.status_code == expected_status


def test_validacao_de_token_repete_falha_transitoria_sem_expor_credencial(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setattr(auth.time, "sleep", lambda _seconds: None)
    attempts = []

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        @staticmethod
        def read():
            return (
                b'{"id":"00000000-0000-0000-0000-000000000001",'
                b'"email":"admin@example.com"}'
            )

    def fake_urlopen(_request, timeout):
        attempts.append(timeout)
        if len(attempts) == 1:
            raise urllib.error.URLError("falha DNS temporaria")
        return FakeResponse()

    monkeypatch.setattr(auth.urllib.request, "urlopen", fake_urlopen)

    user = auth.get_user("token-opaco-nao-deve-apare-no-log")

    assert user["email"] == "admin@example.com"
    assert attempts == [10, 10]


def _admin_autorizado():
    return {
        "id": "00000000-0000-0000-0000-000000000001",
        "email": "admin@example.com",
        "_roles": ["admin"],
        "_profile": {
            "full_name": "Admin Saúde",
            "job_title": "Gestão",
        },
    }


def test_convite_informa_quando_smtp_padrao_nao_autoriza_destinatario(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")

    def fake_request(*_args, **_kwargs):
        raise auth.SupabaseError(
            422,
            "Email address not authorized",
            "email_address_not_authorized",
        )

    monkeypatch.setattr(auth, "_request_json", fake_request)

    with pytest.raises(HTTPException) as exc:
        auth.invite_admin(
            actor=_admin_autorizado(),
            email="novo.admin@example.com",
            full_name="Novo Administrador",
        )

    assert exc.value.status_code == 503
    assert "SMTP próprio" in exc.value.detail


def test_convite_preserva_status_de_limite_de_email(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")

    def fake_request(*_args, **_kwargs):
        raise auth.SupabaseError(
            429,
            "Too many emails",
            "over_email_send_rate_limit",
        )

    monkeypatch.setattr(auth, "_request_json", fake_request)

    with pytest.raises(HTTPException) as exc:
        auth.invite_admin(
            actor=_admin_autorizado(),
            email="novo.admin@example.com",
            full_name="Novo Administrador",
        )

    assert exc.value.status_code == 429
    assert "Limite de envio" in exc.value.detail


def test_sessao_de_recuperacao_aceita_refresh_token_opaco_curto(monkeypatch):
    from api import main

    received = {}

    def fake_accept_external_session(access_token, refresh_token):
        received["access_token"] = access_token
        received["refresh_token"] = refresh_token
        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": 3600,
            "user": {
                "id": "00000000-0000-0000-0000-000000000001",
                "email": "admin@example.com",
                "_roles": ["admin"],
                "_profile": {
                    "full_name": "Admin Saúde",
                    "job_title": "Gestão",
                },
            },
        }

    monkeypatch.setattr(
        main.auth_core,
        "accept_external_session",
        fake_accept_external_session,
    )

    result = main.auth_recovery_session(
        main.RecoverySessionRequest(
            access_token="access-token-opaco-valido",
            refresh_token="abc123def456",
        ),
        Response(),
    )

    assert received == {
        "access_token": "access-token-opaco-valido",
        "refresh_token": "abc123def456",
    }
    assert result["user"]["role"] == "admin"


@pytest.mark.parametrize(
    "access_token,refresh_token",
    [
        ("", "abc123def456"),
        ("access-token-opaco-valido", ""),
        ("a" * 8193, "abc123def456"),
        ("access-token-opaco-valido", "r" * 8193),
    ],
)
def test_sessao_de_recuperacao_rejeita_token_estruturalmente_invalido_sem_ecoa_lo(
    access_token,
    refresh_token,
):
    from api import main

    request = main.RecoverySessionRequest(
        access_token=access_token,
        refresh_token=refresh_token,
    )
    with pytest.raises(HTTPException) as exc:
        main.auth_recovery_session(request, Response())

    assert exc.value.status_code == 400
    assert exc.value.detail == "O link de acesso é inválido ou expirou"
    assert access_token not in exc.value.detail or not access_token
    assert refresh_token not in exc.value.detail or not refresh_token


def _request(path, method="GET", origin="", cookie=""):
    headers = []
    if origin:
        headers.append((b"origin", origin.encode("ascii")))
    if cookie:
        headers.append((b"cookie", cookie.encode("latin-1")))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": method,
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


def test_middleware_bloqueia_api_sem_sessao(monkeypatch):
    from api import main

    def reject(_request):
        raise HTTPException(401, "Sessão ausente")

    async def direct_call(function, *args):
        return function(*args)

    async def next_handler(_request):
        return JSONResponse({"ok": True})

    monkeypatch.setattr(main.auth_core, "authenticate_request", reject)
    monkeypatch.setattr(main, "run_in_threadpool", direct_call)

    response = asyncio.run(
        main.proteger_api(
            _request("/api/runs", origin=main.ALLOWED_ORIGINS[0]),
            next_handler,
        )
    )
    assert response.status_code == 401
    assert response.headers["access-control-allow-origin"] == main.ALLOWED_ORIGINS[0]
    assert response.headers["access-control-allow-credentials"] == "true"
    cookies = [
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ]
    assert any(cookie.startswith(f"{auth.ACCESS_COOKIE}=") for cookie in cookies)
    assert not any(cookie.startswith(f"{auth.REFRESH_COOKIE}=") for cookie in cookies)


def test_refresh_invalido_limpa_toda_a_sessao(monkeypatch):
    from api import main

    def reject(_refresh_token):
        raise HTTPException(401, "Sessão expirada")

    monkeypatch.setattr(main.auth_core, "refresh_session", reject)

    response = main.auth_refresh(_request("/api/auth/refresh"), Response())

    assert response.status_code == 401
    cookies = [
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ]
    assert any(cookie.startswith(f"{auth.ACCESS_COOKIE}=") for cookie in cookies)
    assert any(cookie.startswith(f"{auth.REFRESH_COOKIE}=") for cookie in cookies)


def test_refresh_indisponivel_preserva_token_para_nova_tentativa(monkeypatch):
    from api import main

    def unavailable(_refresh_token):
        raise HTTPException(503, "Autenticação temporariamente indisponível")

    monkeypatch.setattr(main.auth_core, "refresh_session", unavailable)

    response = main.auth_refresh(_request("/api/auth/refresh"), Response())

    assert response.status_code == 503
    assert not any(name.lower() == b"set-cookie" for name, _value in response.raw_headers)


def test_refresh_valido_rotaciona_os_dois_cookies(monkeypatch):
    from api import main

    received = []

    def renew(refresh_token):
        received.append(refresh_token)
        return {
            "access_token": "access-token-novo",
            "refresh_token": "refresh-token-novo",
            "expires_in": 3600,
            "user": _admin_autorizado(),
        }

    monkeypatch.setattr(main.auth_core, "refresh_session", renew)
    response = Response()
    request = _request(
        "/api/auth/refresh",
        method="POST",
        cookie=f"{auth.REFRESH_COOKIE}=refresh-token-antigo",
    )

    payload = main.auth_refresh(request, response)

    assert received == ["refresh-token-antigo"]
    assert payload["user"]["role"] == "admin"
    cookies = [
        value.decode("latin-1")
        for name, value in response.raw_headers
        if name.lower() == b"set-cookie"
    ]
    assert any(cookie.startswith(f"{auth.ACCESS_COOKIE}=access-token-novo") for cookie in cookies)
    assert any(cookie.startswith(f"{auth.REFRESH_COOKIE}=refresh-token-novo") for cookie in cookies)


def test_middleware_rejeita_origem_nao_permitida():
    from api import main

    async def next_handler(_request):
        return JSONResponse({"ok": True})

    response = asyncio.run(
        main.proteger_api(
            _request("/api/auth/login", method="POST", origin="https://malicioso.example"),
            next_handler,
        )
    )
    assert response.status_code == 403


def test_middleware_deixa_webhook_validar_o_proprio_segredo(monkeypatch):
    from api import main

    def should_not_authenticate(_request):
        raise AssertionError("O middleware Admin não deve interceptar o webhook")

    async def next_handler(_request):
        return JSONResponse({"ok": True})

    monkeypatch.setattr(main.auth_core, "authenticate_request", should_not_authenticate)

    response = asyncio.run(
        main.proteger_api(
            _request("/api/susbot/telegram/webhook", method="POST"),
            next_handler,
        )
    )

    assert response.status_code == 200
