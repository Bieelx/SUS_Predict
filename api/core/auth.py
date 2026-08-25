"""
Auth layer: Supabase Auth via REST (GoTrue), mesmo padrão do db.py (urllib, sem SDK).

Requer SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (ou a chave legada
SUPABASE_ANON_KEY) no .env.
"""
import json
import os
import base64
import hashlib
import hmac
import urllib.error
import urllib.request
import time

from fastapi import Header, HTTPException


def _sb_url() -> str:
    url = os.getenv("SUPABASE_URL", "").strip()
    if not url:
        raise HTTPException(503, "Supabase não configurado (SUPABASE_URL ausente)")
    return url.rstrip("/")


def _publishable_key() -> str:
    key = (
        os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.getenv("SUPABASE_ANON_KEY", "").strip()
    )
    if not key:
        raise HTTPException(503, "Supabase não configurado (chave publicável ausente)")
    return key


def _supabase_configurado() -> bool:
    return bool(
        os.getenv("SUPABASE_URL", "").strip()
        and (
            os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip()
            or os.getenv("SUPABASE_ANON_KEY", "").strip()
        )
    )


def _dev_auth_habilitado() -> bool:
    return os.getenv("SUS_PREDICT_DEV_AUTH", "").strip().lower() in {"1", "true", "yes", "on"}


def _dev_secret() -> str:
    return os.getenv("SUSBOT_DEV_AUTH_SECRET", "sus-predict-dev-secret").strip() or "sus-predict-dev-secret"


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + padding).encode("ascii"))


def _dev_usuario(email: str) -> dict:
    email = (email or "").strip().lower()
    digest = hashlib.sha256(email.encode("utf-8")).hexdigest()[:16]
    user_id = f"dev-{digest}"
    nome = email.split("@", 1)[0] if email else "usuário dev"
    return {
        "id": user_id,
        "sub": user_id,
        "email": email,
        "role": "authenticated",
        "aud": "authenticated",
        "app_metadata": {"provider": "dev"},
        "user_metadata": {"name": nome},
    }


def _dev_assinar_token(email: str) -> dict:
    agora = int(time.time())
    usuario = _dev_usuario(email)
    payload = {
        **usuario,
        "iat": agora,
        "exp": agora + 7 * 24 * 60 * 60,
        "iss": "sus-predict-dev-auth",
    }
    payload_bytes = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    assinatura = hmac.new(_dev_secret().encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    token = f"dev.{payload_b64}.{_b64url_encode(assinatura)}"
    return {"access_token": token, "token_type": "bearer", "user": usuario}


def _dev_validar_token(token: str) -> dict:
    partes = str(token or "").strip().split(".")
    if len(partes) != 3 or partes[0] != "dev":
        raise HTTPException(401, "Token inválido ou expirado")

    _, payload_b64, assinatura_b64 = partes
    esperado = hmac.new(_dev_secret().encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    try:
        recebido = _b64url_decode(assinatura_b64)
    except Exception as exc:
        raise HTTPException(401, "Token inválido ou expirado") from exc

    if not hmac.compare_digest(esperado, recebido):
        raise HTTPException(401, "Token inválido ou expirado")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(401, "Token inválido ou expirado") from exc

    if int(payload.get("exp") or 0) < int(time.time()):
        raise HTTPException(401, "Token inválido ou expirado")

    return payload


def is_dev_token(token: str) -> bool:
    partes = str(token or "").strip().split(".")
    return len(partes) == 3 and partes[0] == "dev"


def _gotrue_request(path: str, body: dict, token: str | None = None) -> dict:
    key = _publishable_key()
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{_sb_url()}/auth/v1/{path}",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = resp.read().decode("utf-8")
            return json.loads(payload) if payload else {}
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="ignore")
        try:
            msg = json.loads(payload).get("msg") or json.loads(payload).get("error_description") or payload
        except Exception:
            msg = payload
        raise HTTPException(e.code if e.code in (400, 401, 422) else 400, msg)


def signup(email: str, password: str, metadata: dict | None = None) -> dict:
    if not _supabase_configurado():
        if _dev_auth_habilitado():
            return _dev_assinar_token(email)
        raise HTTPException(503, "Supabase Auth não configurado")
    body = {"email": email, "password": password}
    if metadata:
        body["data"] = metadata
    return _gotrue_request("signup", body)


def login(email: str, password: str) -> dict:
    if not _supabase_configurado():
        if _dev_auth_habilitado():
            return _dev_assinar_token(email)
        raise HTTPException(503, "Supabase Auth não configurado")
    return _gotrue_request("token?grant_type=password", {"email": email, "password": password})


def refresh_session(refresh_token: str) -> dict:
    if is_dev_token(refresh_token):
        usuario = _dev_validar_token(refresh_token)
        return _dev_assinar_token(usuario.get("email", ""))
    if not _supabase_configurado():
        raise HTTPException(503, "Supabase Auth não configurado")
    return _gotrue_request(
        "token?grant_type=refresh_token",
        {"refresh_token": refresh_token},
    )


def logout(token: str) -> None:
    if is_dev_token(token):
        _dev_validar_token(token)
        return
    if not _supabase_configurado():
        raise HTTPException(503, "Supabase Auth não configurado")
    _gotrue_request("logout", {}, token=token)


def dev_login(email: str = "marcia.oliveira@dev.local") -> dict:
    """Gera um token local de desenvolvimento sem depender de Supabase."""
    if not _dev_auth_habilitado():
        raise HTTPException(404, "Login de demonstração desabilitado")
    return _dev_assinar_token(email)


def get_user(token: str) -> dict:
    if is_dev_token(token):
        return _dev_validar_token(token)
    if not _supabase_configurado():
        raise HTTPException(401, "Token inválido ou expirado")
    key = _publishable_key()
    req = urllib.request.Request(
        f"{_sb_url()}/auth/v1/user",
        headers={"apikey": key, "Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError:
        raise HTTPException(401, "Token inválido ou expirado")
    except urllib.error.URLError as exc:
        raise HTTPException(503, f"Supabase inacessível: {exc.reason}")


def require_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: valida Bearer token, retorna usuário Supabase ou 401."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token ausente")
    token = authorization.removeprefix("Bearer ").strip()
    return get_user(token)
