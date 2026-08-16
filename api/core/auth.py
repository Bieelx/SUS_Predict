"""
Autenticação e autorização do SUS Predict.

O FastAPI funciona como BFF: o navegador recebe somente cookies de sessão
HttpOnly e nunca recebe a chave administrativa do Supabase. As senhas são
entregues ao Supabase Auth por HTTPS e não são armazenadas pela aplicação.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from fastapi import Header, HTTPException, Request, Response


log = logging.getLogger("sus_predict.auth")

ACCESS_COOKIE = "sus_predict_access"
REFRESH_COOKIE = "sus_predict_refresh"
PASSWORD_MIN_LENGTH = 12
PASSWORD_MAX_LENGTH = 128

_EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+"
    r"[A-Za-z]{2,63}$"
)


@dataclass
class SupabaseError(Exception):
    status: int
    message: str
    code: str = ""


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _sb_url() -> str:
    url = os.getenv("SUPABASE_URL", "").strip()
    if not url:
        raise HTTPException(503, "Autenticação indisponível: SUPABASE_URL ausente")
    return url.rstrip("/")


def _public_key() -> str:
    key = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )
    if not key:
        raise HTTPException(
            503,
            "Autenticação indisponível: SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY ausente",
        )
    return key


def _admin_key() -> str:
    key = (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )
    if not key:
        raise HTTPException(
            503,
            "Administração indisponível: SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY ausente",
        )
    return key


def _admin_bearer(key: str) -> str | None:
    """Chaves secret novas não são JWT; service_role legado ainda é."""
    return None if key.startswith("sb_secret_") else key


def supabase_configurado() -> bool:
    return bool(
        os.getenv("SUPABASE_URL", "").strip()
        and (
            os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
            or os.getenv("SUPABASE_ANON_KEY", "").strip()
        )
    )


def dev_auth_enabled() -> bool:
    """O bypass local só existe quando explicitamente habilitado fora de produção."""
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    return app_env != "production" and _env_flag("SUS_PREDICT_DEV_AUTH", False)


def _dev_secret() -> str:
    secret = os.getenv("SUSBOT_DEV_AUTH_SECRET", "").strip()
    if len(secret) < 32:
        raise HTTPException(503, "SUSBOT_DEV_AUTH_SECRET deve possuir ao menos 32 caracteres")
    return secret


def normalize_email(value: str) -> str:
    email = str(value or "").strip().lower()
    if len(email) > 254 or not _EMAIL_RE.fullmatch(email):
        raise HTTPException(422, "Informe um e-mail válido")
    return email


def validate_password(value: str) -> str:
    password = str(value or "")
    requirements: list[str] = []
    if len(password) < PASSWORD_MIN_LENGTH:
        requirements.append(f"pelo menos {PASSWORD_MIN_LENGTH} caracteres")
    if len(password) > PASSWORD_MAX_LENGTH:
        requirements.append(f"no máximo {PASSWORD_MAX_LENGTH} caracteres")
    if not re.search(r"[a-z]", password):
        requirements.append("uma letra minúscula")
    if not re.search(r"[A-Z]", password):
        requirements.append("uma letra maiúscula")
    if not re.search(r"\d", password):
        requirements.append("um número")
    if not re.search(r"[^A-Za-z0-9\s]", password):
        requirements.append("um símbolo")
    if requirements:
        raise HTTPException(422, "A senha deve conter " + ", ".join(requirements))
    return password


def _parse_error(error: urllib.error.HTTPError) -> SupabaseError:
    payload = error.read().decode("utf-8", errors="ignore")
    message = ""
    code = ""
    try:
        parsed = json.loads(payload)
        message = str(
            parsed.get("msg")
            or parsed.get("message")
            or parsed.get("error_description")
            or parsed.get("error")
            or ""
        )
        code = str(parsed.get("code") or parsed.get("error_code") or "")
    except Exception:
        message = payload
    return SupabaseError(error.code, message[:500], code[:100])


def _request_json(
    method: str,
    path: str,
    *,
    body: dict[str, Any] | list[dict[str, Any]] | None = None,
    api_key: str,
    bearer: str | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    retries: int = 0,
) -> Any:
    request_headers = {
        "apikey": api_key,
        "Accept": "application/json",
    }
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    if bearer:
        request_headers["Authorization"] = f"Bearer {bearer}"
    if headers:
        request_headers.update(headers)

    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(
        f"{_sb_url()}{path}",
        data=data,
        headers=request_headers,
        method=method,
    )
    attempts = max(1, min(int(retries) + 1, 3))
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = response.read()
                return json.loads(payload.decode("utf-8")) if payload else {}
        except urllib.error.HTTPError as error:
            parsed = _parse_error(error)
            if parsed.status >= 500 and attempt + 1 < attempts:
                log.info(
                    "Supabase respondeu %s; repetindo requisição segura (%s/%s)",
                    parsed.status,
                    attempt + 2,
                    attempts,
                )
                time.sleep(0.25 * (attempt + 1))
                continue
            raise parsed from error
        except (urllib.error.URLError, TimeoutError) as error:
            if attempt + 1 < attempts:
                log.info(
                    "Falha transitória ao acessar Supabase; repetindo requisição segura (%s/%s): %s",
                    attempt + 2,
                    attempts,
                    error,
                )
                time.sleep(0.25 * (attempt + 1))
                continue
            log.warning("Falha de comunicação com Supabase Auth: %s", error)
            raise HTTPException(
                503,
                "Serviço de autenticação temporariamente indisponível",
            ) from error

    raise HTTPException(503, "Serviço de autenticação temporariamente indisponível")


def _rest_select(table: str, params: dict[str, str]) -> list[dict[str, Any]]:
    key = _admin_key()
    query = urllib.parse.urlencode(params, safe="(),.*")
    result = _request_json(
        "GET",
        f"/rest/v1/{table}?{query}",
        api_key=key,
        bearer=_admin_bearer(key),
        timeout=10,
        retries=1,
    )
    return result if isinstance(result, list) else []


def _rest_upsert(table: str, rows: list[dict[str, Any]], conflict: str) -> list[dict[str, Any]]:
    key = _admin_key()
    result = _request_json(
        "POST",
        f"/rest/v1/{table}?on_conflict={urllib.parse.quote(conflict, safe=',')}",
        body=rows,
        api_key=key,
        bearer=_admin_bearer(key),
        headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    return result if isinstance(result, list) else []


def _rest_insert(table: str, rows: list[dict[str, Any]]) -> None:
    key = _admin_key()
    _request_json(
        "POST",
        f"/rest/v1/{table}",
        body=rows,
        api_key=key,
        bearer=_admin_bearer(key),
        headers={"Prefer": "return=minimal"},
    )


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


def _dev_user(email: str) -> dict[str, Any]:
    email = normalize_email(email)
    digest = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]
    user_id = f"dev-{digest}"
    return {
        "id": user_id,
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {"provider": "dev"},
        "user_metadata": {"full_name": email.split("@", 1)[0]},
        "_profile": {
            "id": user_id,
            "full_name": email.split("@", 1)[0],
            "job_title": "Desenvolvimento",
        },
        "_roles": ["admin"],
    }


def _dev_sign_in(email: str, password: str) -> dict[str, Any]:
    if not dev_auth_enabled():
        raise HTTPException(404, "Recurso não encontrado")
    expected_password = os.getenv("SUS_PREDICT_DEV_PASSWORD", "")
    if not expected_password or not hmac.compare_digest(password, expected_password):
        raise HTTPException(401, "E-mail ou senha inválidos")

    now = int(time.time())
    user = _dev_user(email)
    payload = {
        **{key: value for key, value in user.items() if not key.startswith("_")},
        "app_role": "admin",
        "iat": now,
        "exp": now + 8 * 60 * 60,
        "iss": "sus-predict-dev-auth",
    }
    encoded = _b64url_encode(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    )
    signature = hmac.new(
        _dev_secret().encode("utf-8"),
        encoded.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return {
        "access_token": f"dev.{encoded}.{_b64url_encode(signature)}",
        "expires_in": 8 * 60 * 60,
        "token_type": "bearer",
        "user": user,
    }


def _dev_validate_token(token: str) -> dict[str, Any]:
    if not dev_auth_enabled():
        raise HTTPException(401, "Sessão inválida ou expirada")
    parts = str(token or "").strip().split(".")
    if len(parts) != 3 or parts[0] != "dev":
        raise HTTPException(401, "Sessão inválida ou expirada")

    _, payload_b64, signature_b64 = parts
    expected = hmac.new(
        _dev_secret().encode("utf-8"),
        payload_b64.encode("ascii"),
        hashlib.sha256,
    ).digest()
    try:
        received = _b64url_decode(signature_b64)
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as error:
        raise HTTPException(401, "Sessão inválida ou expirada") from error

    if not hmac.compare_digest(expected, received):
        raise HTTPException(401, "Sessão inválida ou expirada")
    if int(payload.get("exp") or 0) <= int(time.time()):
        raise HTTPException(401, "Sessão inválida ou expirada")

    payload["_profile"] = {
        "id": payload["id"],
        "full_name": payload.get("user_metadata", {}).get("full_name", "Desenvolvedor"),
        "job_title": "Desenvolvimento",
    }
    payload["_roles"] = ["admin"]
    return payload


def is_dev_token(token: str) -> bool:
    parts = str(token or "").strip().split(".")
    return len(parts) == 3 and parts[0] == "dev"


def login(email: str, password: str) -> dict[str, Any]:
    email = normalize_email(email)
    if dev_auth_enabled() and email.endswith("@dev.local"):
        return _dev_sign_in(email, password)
    if not supabase_configurado():
        raise HTTPException(503, "Autenticação Supabase não configurada")
    try:
        return _request_json(
            "POST",
            "/auth/v1/token?grant_type=password",
            body={"email": email, "password": password},
            api_key=_public_key(),
        )
    except SupabaseError as error:
        if error.status == 429:
            raise HTTPException(429, "Muitas tentativas. Aguarde antes de tentar novamente") from error
        raise HTTPException(401, "E-mail ou senha inválidos") from error


def dev_login(email: str, password: str) -> dict[str, Any]:
    return _dev_sign_in(email, password)


def refresh_session(refresh_token: str) -> dict[str, Any]:
    if not refresh_token:
        raise HTTPException(401, "Sessão expirada")
    try:
        return _request_json(
            "POST",
            "/auth/v1/token?grant_type=refresh_token",
            body={"refresh_token": refresh_token},
            api_key=_public_key(),
        )
    except SupabaseError as error:
        if error.status == 429:
            raise HTTPException(429, "Muitas tentativas. Aguarde antes de renovar a sessão") from error
        if error.status >= 500:
            raise HTTPException(
                503,
                "Serviço de autenticação temporariamente indisponível",
            ) from error
        raise HTTPException(401, "Sessão expirada") from error


def get_user(token: str) -> dict[str, Any]:
    if not token:
        raise HTTPException(401, "Sessão ausente")
    if is_dev_token(token):
        return _dev_validate_token(token)
    try:
        result = _request_json(
            "GET",
            "/auth/v1/user",
            api_key=_public_key(),
            bearer=token,
            timeout=10,
            retries=1,
        )
    except SupabaseError as error:
        if error.status >= 500:
            raise HTTPException(
                503,
                "Serviço de autenticação temporariamente indisponível",
            ) from error
        raise HTTPException(401, "Sessão inválida ou expirada") from error
    if not isinstance(result, dict) or not result.get("id"):
        raise HTTPException(401, "Sessão inválida ou expirada")
    return result


def get_profile(user_id: str) -> dict[str, Any] | None:
    try:
        rows = _rest_select(
            "profiles",
            {
                "select": "id,full_name,job_title,created_at,updated_at",
                "id": f"eq.{user_id}",
                "limit": "1",
            },
        )
    except SupabaseError as error:
        log.error("Falha ao consultar perfil no Supabase: status=%s", error.status)
        raise HTTPException(503, "Não foi possível validar o perfil de acesso") from error
    return rows[0] if rows else None


def get_user_roles(user_id: str) -> list[str]:
    if str(user_id).startswith("dev-") and dev_auth_enabled():
        return ["admin"]
    try:
        rows = _rest_select(
            "user_roles",
            {
                "select": "role",
                "user_id": f"eq.{user_id}",
            },
        )
    except SupabaseError as error:
        log.error("Falha ao consultar roles no Supabase: status=%s", error.status)
        raise HTTPException(503, "Não foi possível validar as permissões de acesso") from error
    return sorted({str(row.get("role") or "") for row in rows if row.get("role")})


def authorize_user(user: dict[str, Any], required_role: str = "admin") -> dict[str, Any]:
    user_id = str(user.get("id") or user.get("sub") or "").strip()
    if not user_id:
        raise HTTPException(401, "Sessão inválida ou expirada")

    roles = user.get("_roles")
    if not isinstance(roles, list):
        roles = get_user_roles(user_id)
    if required_role not in roles:
        raise HTTPException(403, "Usuário sem permissão de Administrador")

    profile = user.get("_profile")
    if not isinstance(profile, dict):
        profile = get_profile(user_id)
    if not profile:
        raise HTTPException(403, "Perfil de acesso não configurado")

    user["_roles"] = roles
    user["_profile"] = profile
    return user


def serialize_user(user: dict[str, Any]) -> dict[str, Any]:
    profile = user.get("_profile") if isinstance(user.get("_profile"), dict) else {}
    roles = user.get("_roles") if isinstance(user.get("_roles"), list) else []
    metadata = user.get("user_metadata") if isinstance(user.get("user_metadata"), dict) else {}
    full_name = (
        profile.get("full_name")
        or metadata.get("full_name")
        or metadata.get("name")
        or str(user.get("email") or "").split("@", 1)[0]
    )
    return {
        "id": str(user.get("id") or user.get("sub") or ""),
        "email": str(user.get("email") or ""),
        "full_name": str(full_name or ""),
        "job_title": str(profile.get("job_title") or ""),
        "role": "admin" if "admin" in roles else None,
        "roles": roles,
        "created_at": user.get("created_at") or profile.get("created_at"),
        "last_sign_in_at": user.get("last_sign_in_at"),
    }


def _token_from_request(request: Request, authorization: str = "") -> str:
    header = authorization or request.headers.get("Authorization", "")
    if header.startswith("Bearer "):
        return header.removeprefix("Bearer ").strip()
    return request.cookies.get(ACCESS_COOKIE, "").strip()


def access_token_from_request(request: Request) -> str:
    return _token_from_request(request)


def refresh_token_from_request(request: Request) -> str:
    return request.cookies.get(REFRESH_COOKIE, "").strip()


def authenticate_request(request: Request, *, require_role: str = "admin") -> dict[str, Any]:
    existing = getattr(request.state, "user", None)
    if isinstance(existing, dict):
        return existing
    user = get_user(_token_from_request(request))
    user = authorize_user(user, require_role)
    request.state.user = user
    return user


def require_user(
    request: Request,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    """Dependency FastAPI; o middleware já preenche request.state na maioria das rotas."""
    existing = getattr(request.state, "user", None)
    if isinstance(existing, dict):
        return existing
    return get_user(_token_from_request(request, authorization))


def require_admin(
    request: Request,
    authorization: str = Header(default=""),
) -> dict[str, Any]:
    user = require_user(request, authorization)
    return authorize_user(user, "admin")


def _cookie_secure() -> bool:
    if os.getenv("APP_ENV", "development").strip().lower() == "production":
        return True
    if _cookie_samesite() == "none":
        return True
    configured = os.getenv("AUTH_COOKIE_SECURE")
    if configured is not None:
        return _env_flag("AUTH_COOKIE_SECURE")
    return os.getenv("FRONTEND_URL", "").strip().lower().startswith("https://")


def _cookie_samesite() -> str:
    value = os.getenv("AUTH_COOKIE_SAMESITE", "lax").strip().lower()
    return value if value in {"lax", "strict", "none"} else "lax"


def set_session_cookies(response: Response, session: dict[str, Any]) -> None:
    access_token = str(session.get("access_token") or "")
    refresh_token = str(session.get("refresh_token") or "")
    if not access_token:
        raise HTTPException(502, "Resposta inválida do serviço de autenticação")

    common = {
        "httponly": True,
        "secure": _cookie_secure(),
        "samesite": _cookie_samesite(),
        "path": "/",
    }
    response.set_cookie(
        ACCESS_COOKIE,
        access_token,
        max_age=max(60, int(session.get("expires_in") or 3600)),
        **common,
    )
    if refresh_token:
        response.set_cookie(
            REFRESH_COOKIE,
            refresh_token,
            max_age=30 * 24 * 60 * 60,
            **common,
        )


def clear_session_cookies(response: Response) -> None:
    common = {
        "httponly": True,
        "secure": _cookie_secure(),
        "samesite": _cookie_samesite(),
        "path": "/",
    }
    response.delete_cookie(ACCESS_COOKIE, **common)
    response.delete_cookie(REFRESH_COOKIE, **common)


def clear_access_cookie(response: Response) -> None:
    """Remove somente a credencial expirada e preserva a renovação da sessão."""
    response.delete_cookie(
        ACCESS_COOKIE,
        httponly=True,
        secure=_cookie_secure(),
        samesite=_cookie_samesite(),
        path="/",
    )


def logout(access_token: str) -> None:
    if not access_token or is_dev_token(access_token):
        return
    try:
        _request_json(
            "POST",
            "/auth/v1/logout?scope=global",
            body={},
            api_key=_public_key(),
            bearer=access_token,
        )
    except (SupabaseError, HTTPException) as error:
        # O cookie local deve ser removido mesmo se a sessão já expirou.
        log.info("Logout remoto não concluído (sessão possivelmente expirada): %s", error)


def request_password_recovery(email: str) -> None:
    email = normalize_email(email)
    redirect_to = os.getenv(
        "AUTH_REDIRECT_URL",
        f"{os.getenv('FRONTEND_URL', 'http://localhost:3000').rstrip('/')}/",
    ).strip()
    try:
        _request_json(
            "POST",
            f"/auth/v1/recover?redirect_to={urllib.parse.quote(redirect_to, safe='')}",
            body={"email": email},
            api_key=_public_key(),
        )
    except SupabaseError as error:
        if error.status == 429:
            raise HTTPException(429, "Muitas solicitações. Tente novamente mais tarde") from error
        # Resposta intencionalmente genérica para evitar enumeração de contas.
        log.info("Recuperação solicitada sem confirmação do Supabase: status=%s", error.status)


def accept_external_session(access_token: str, refresh_token: str) -> dict[str, Any]:
    # Não imponha formato/tamanho mínimo a tokens opacos do provedor. Faça
    # apenas limites estruturais e deixe o Supabase validar a credencial.
    if (
        not access_token
        or not refresh_token
        or len(access_token) > 8192
        or len(refresh_token) > 8192
    ):
        raise HTTPException(400, "O link de acesso é inválido ou expirou")
    user = authorize_user(get_user(access_token), "admin")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": 3600,
        "token_type": "bearer",
        "user": user,
    }


def update_password(access_token: str, password: str) -> dict[str, Any]:
    password = validate_password(password)
    try:
        result = _request_json(
            "PUT",
            "/auth/v1/user",
            body={"password": password},
            api_key=_public_key(),
            bearer=access_token,
        )
    except SupabaseError as error:
        if error.status in {400, 422}:
            raise HTTPException(422, "A senha não atende à política configurada") from error
        raise HTTPException(400, "Não foi possível alterar a senha") from error
    return result if isinstance(result, dict) else {}


def _record_admin_action(
    actor_id: str,
    action: str,
    target_user_id: str | None,
    details: dict[str, Any] | None = None,
) -> None:
    try:
        _rest_insert(
            "admin_audit_log",
            [
                {
                    "actor_id": actor_id,
                    "action": action,
                    "target_user_id": target_user_id,
                    "details": details or {},
                }
            ],
        )
    except Exception as error:  # pragma: no cover - auditoria não desfaz convite já enviado
        log.warning("Falha ao registrar auditoria administrativa: %s", error)


def invite_admin(
    *,
    actor: dict[str, Any],
    email: str,
    full_name: str,
    job_title: str = "",
) -> dict[str, Any]:
    actor = authorize_user(actor, "admin")
    email = normalize_email(email)
    full_name = " ".join(str(full_name or "").split()).strip()
    job_title = " ".join(str(job_title or "").split()).strip()
    if len(full_name) < 3 or len(full_name) > 120:
        raise HTTPException(422, "Informe o nome completo do usuário")
    if len(job_title) > 120:
        raise HTTPException(422, "O cargo deve possuir no máximo 120 caracteres")

    redirect_to = os.getenv(
        "AUTH_REDIRECT_URL",
        f"{os.getenv('FRONTEND_URL', 'http://localhost:3000').rstrip('/')}/",
    ).strip()
    key = _admin_key()
    try:
        result = _request_json(
            "POST",
            f"/auth/v1/invite?redirect_to={urllib.parse.quote(redirect_to, safe='')}",
            body={
                "email": email,
                "data": {"full_name": full_name, "job_title": job_title},
            },
            api_key=key,
            bearer=_admin_bearer(key),
        )
    except SupabaseError as error:
        if error.code == "email_address_not_authorized":
            raise HTTPException(
                503,
                "O SMTP padrão do Supabase não permite convidar este endereço. "
                "Configure um SMTP próprio em Authentication → Emails → SMTP Settings.",
            ) from error
        if error.status == 429 or error.code in {
            "over_email_send_rate_limit",
            "over_request_rate_limit",
        }:
            raise HTTPException(
                429,
                "Limite de envio de e-mails atingido. Aguarde ou configure um SMTP próprio.",
            ) from error
        if error.status in {400, 409, 422}:
            raise HTTPException(409, "Não foi possível convidar este e-mail") from error
        raise HTTPException(502, "Falha ao enviar o convite") from error

    invited = result.get("user") if isinstance(result, dict) and isinstance(result.get("user"), dict) else result
    user_id = str((invited or {}).get("id") or "")
    if not user_id:
        raise HTTPException(502, "Supabase não retornou o usuário convidado")

    actor_id = str(actor.get("id") or actor.get("sub") or "")
    try:
        _rest_upsert(
            "user_roles",
            [{"user_id": user_id, "role": "admin", "granted_by": actor_id}],
            "user_id,role",
        )
    except (SupabaseError, HTTPException) as error:
        log.error("Convite criado, mas role não atribuída ao usuário %s: %s", user_id, error)
        raise HTTPException(
            502,
            "Convite enviado, mas a permissão não pôde ser atribuída. Revise o usuário no Supabase",
        ) from error

    _record_admin_action(
        actor_id,
        "user.invited",
        user_id,
        {"email": email, "role": "admin"},
    )
    return {
        "id": user_id,
        "email": email,
        "full_name": full_name,
        "job_title": job_title,
        "role": "admin",
        "invited_at": (invited or {}).get("invited_at"),
        "created_at": (invited or {}).get("created_at"),
    }


def list_admin_users(page: int = 1, per_page: int = 50) -> dict[str, Any]:
    page = max(1, int(page))
    per_page = max(1, min(int(per_page), 100))
    key = _admin_key()
    try:
        result = _request_json(
            "GET",
            f"/auth/v1/admin/users?page={page}&per_page={per_page}",
            api_key=key,
            bearer=_admin_bearer(key),
        )
    except SupabaseError as error:
        raise HTTPException(502, "Não foi possível listar os usuários") from error

    auth_users = result.get("users", []) if isinstance(result, dict) else []
    try:
        profiles = _rest_select(
            "profiles",
            {"select": "id,full_name,job_title,created_at,updated_at"},
        )
        role_rows = _rest_select("user_roles", {"select": "user_id,role"})
    except SupabaseError as error:
        raise HTTPException(502, "Não foi possível completar a listagem de usuários") from error
    profile_by_id = {str(row.get("id")): row for row in profiles}
    roles_by_id: dict[str, list[str]] = {}
    for row in role_rows:
        roles_by_id.setdefault(str(row.get("user_id")), []).append(str(row.get("role")))

    items = []
    for user in auth_users if isinstance(auth_users, list) else []:
        user_id = str(user.get("id") or "")
        profile = profile_by_id.get(user_id, {})
        roles = sorted(set(roles_by_id.get(user_id, [])))
        items.append(
            {
                "id": user_id,
                "email": str(user.get("email") or ""),
                "full_name": str(profile.get("full_name") or ""),
                "job_title": str(profile.get("job_title") or ""),
                "role": "admin" if "admin" in roles else None,
                "roles": roles,
                "invited_at": user.get("invited_at"),
                "confirmed_at": user.get("confirmed_at") or user.get("email_confirmed_at"),
                "last_sign_in_at": user.get("last_sign_in_at"),
                "created_at": user.get("created_at"),
            }
        )

    return {
        "items": items,
        "page": page,
        "per_page": per_page,
        "total": int(result.get("total") or len(items)) if isinstance(result, dict) else len(items),
    }
