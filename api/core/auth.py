"""
Auth layer: Supabase Auth via REST (GoTrue), mesmo padrão do db.py (urllib, sem SDK).

Requer SUPABASE_URL + SUPABASE_ANON_KEY no .env.
"""
import json
import os
import urllib.error
import urllib.request

from fastapi import Header, HTTPException


def _sb_url() -> str:
    url = os.getenv("SUPABASE_URL", "").strip()
    if not url:
        raise HTTPException(503, "Supabase não configurado (SUPABASE_URL ausente)")
    return url.rstrip("/")


def _anon_key() -> str:
    key = os.getenv("SUPABASE_ANON_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Supabase não configurado (SUPABASE_ANON_KEY ausente)")
    return key


def _gotrue_request(path: str, body: dict, token: str | None = None) -> dict:
    key = _anon_key()
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
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", errors="ignore")
        try:
            msg = json.loads(payload).get("msg") or json.loads(payload).get("error_description") or payload
        except Exception:
            msg = payload
        raise HTTPException(e.code if e.code in (400, 401, 422) else 400, msg)


def signup(email: str, password: str) -> dict:
    return _gotrue_request("signup", {"email": email, "password": password})


def login(email: str, password: str) -> dict:
    return _gotrue_request("token?grant_type=password", {"email": email, "password": password})


def get_user(token: str) -> dict:
    key = _anon_key()
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


def require_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: valida Bearer token, retorna usuário Supabase ou 401."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token ausente")
    token = authorization.removeprefix("Bearer ").strip()
    return get_user(token)
