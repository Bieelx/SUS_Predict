"""
Auth layer: Supabase Auth via REST (GoTrue), mesmo padrão do db.py (urllib, sem SDK).

Requer SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (ou a chave legada
SUPABASE_ANON_KEY) no .env.
"""
import json
import logging
import os
import base64
import hashlib
import hmac
import urllib.error
import urllib.parse
import urllib.request
import time

from fastapi import Header, HTTPException

log = logging.getLogger("sus_predict.auth")


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


def _gotrue_request(path: str, body: dict, token: str | None = None, method: str = "POST") -> dict:
    key = _publishable_key()
    headers = {"apikey": key, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        f"{_sb_url()}/auth/v1/{path}",
        data=json.dumps(body).encode("utf-8"),
        headers=headers,
        method=method,
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


def enviar_codigo_email(email: str) -> None:
    """Dispara o código de verificação por e-mail (GoTrue `POST /auth/v1/otp`).

    `create_user: False` garante que este caminho nunca cria conta: quem não tem
    cadastro não vira usuário por tentar entrar. Não devolve nada — a resposta ao
    navegador é sempre a mesma, exista ou não o e-mail.

    O e-mail sai com o código apenas se o template "Magic Link" do
    projeto usar `{{ .Token }}`. Ver docs/10-autenticacao-2fa.md.
    """

    if not _supabase_configurado():
        raise HTTPException(503, "Supabase Auth não configurado")
    _gotrue_request("otp", {"email": email, "create_user": False})


# O GoTrue guarda o código em colunas diferentes conforme quem o gerou: `/otp` para
# usuário existente grava como magiclink, cadastro novo grava como signup. Verificar com
# o tipo errado devolve "Token has expired or is invalid" mesmo com o código certo, então
# tentamos os tipos em ordem em vez de fixar um.
TIPOS_VERIFICACAO = ("email", "magiclink", "signup")


def verificar_codigo_email(email: str, codigo: str) -> dict:
    """Troca o código do e-mail pela sessão real (GoTrue `POST /auth/v1/verify`).

    O tamanho do código vem da configuração do projeto (6 a 10 dígitos); nada aqui
    depende dele.
    """

    if not _supabase_configurado():
        raise HTTPException(503, "Supabase Auth não configurado")

    ultimo_erro: HTTPException | None = None
    for tipo in TIPOS_VERIFICACAO:
        try:
            return _gotrue_request("verify", {"email": email, "token": codigo, "type": tipo})
        except HTTPException as exc:
            ultimo_erro = exc
            continue

    # Mensagem própria: a do GoTrue ("Token has expired or is invalid") não ajuda quem
    # acabou de receber o código e não sabe que pedir outro invalida o anterior.
    log.info("verificação de código falhou para %s: %s", email, getattr(ultimo_erro, "detail", ""))
    raise HTTPException(
        400,
        "Código inválido ou expirado. Vale o código do e-mail mais recente, uma vez só. "
        "Peça um novo código se precisar.",
    )


# Campos que o frontend realmente lê do usuário (App.jsx, Perfil.jsx). Tudo que o
# GoTrue manda além disso — identities, app_metadata, aud, phone, is_anonymous —
# fica no backend e nunca chega à aba Network.
_CAMPOS_USUARIO = ("id", "email", "created_at", "last_sign_in_at")
_CAMPOS_METADATA = ("nome", "full_name", "name", "avatar")


def usuario_publico(usuario: dict | None) -> dict:
    """Recorta o usuário do GoTrue para os campos que a interface usa."""

    usuario = usuario or {}
    metadata = usuario.get("user_metadata") or {}
    recorte = {campo: usuario.get(campo) for campo in _CAMPOS_USUARIO if usuario.get(campo)}
    recorte.setdefault("id", usuario.get("sub") or "")
    recorte["user_metadata"] = {
        campo: metadata[campo] for campo in _CAMPOS_METADATA if metadata.get(campo)
    }
    return recorte


def sessao_publica(sessao: dict) -> dict:
    """Recorta a sessão do GoTrue: tokens + usuário enxuto, nada além disso."""

    sessao = sessao or {}
    publica = {
        "access_token": sessao.get("access_token") or "",
        "token_type": sessao.get("token_type") or "bearer",
        "user": usuario_publico(sessao.get("user")),
    }
    if sessao.get("refresh_token"):
        publica["refresh_token"] = sessao["refresh_token"]
    if sessao.get("expires_in"):
        publica["expires_in"] = sessao["expires_in"]
    return publica


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


def atualizar_usuario(token: str, campos: dict) -> dict:
    """`PUT /auth/v1/user`: nome/avatar (user_metadata), e-mail ou senha.

    Trocar o e-mail não tem efeito imediato — o GoTrue manda confirmação para o
    endereço novo (e para o antigo, se "Secure email change" estiver ligado) e só
    troca depois que o link é aberto. Quem chama trata isso como pedido, não fato.
    """

    if is_dev_token(token):
        raise HTTPException(400, "A sessão de demonstração não permite alterar o cadastro.")
    if not _supabase_configurado():
        raise HTTPException(503, "Supabase Auth não configurado")
    return _gotrue_request("user", campos, token=token, method="PUT")


def require_user(authorization: str = Header(default="")) -> dict:
    """FastAPI dependency: valida Bearer token, retorna usuário Supabase ou 401."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Token ausente")
    token = authorization.removeprefix("Bearer ").strip()
    return get_user(token)


# ── Admin API do GoTrue (só backend, chave secreta) ───────────────────────────

def _secret_key() -> str:
    from api.core.db import _supabase_read_key  # mesma chave do sync; nunca vai ao frontend
    return _supabase_read_key()


def listar_usuarios_auth(por_pagina: int = 200) -> list[dict]:
    """Todos os usuários do Auth via `GET /auth/v1/admin/users` (paginação por offset).

    GoTrue devolve `{"users": [...]}` por página (`page`/`per_page`, default 50) e um
    header `Link` para a próxima; aqui a paginação é por tamanho do lote: pede a
    próxima página enquanto a atual vier cheia. Sem Supabase (modo dev) devolve [].
    Só campos que o painel usa saem daqui — o payload cru do GoTrue não é repassado.
    """
    if not _supabase_configurado() or not _secret_key():
        return []
    from api.core.db import _sb_headers
    key = _secret_key()
    usuarios: list[dict] = []
    pagina = 1
    while True:
        req = urllib.request.Request(
            f"{_sb_url()}/auth/v1/admin/users?page={pagina}&per_page={por_pagina}",
            headers=_sb_headers(key),
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = json.loads(resp.read().decode("utf-8") or "{}")
        except urllib.error.HTTPError as e:
            raise HTTPException(503, f"GoTrue admin/users respondeu {e.code}")
        except urllib.error.URLError as exc:
            raise HTTPException(503, f"Supabase inacessível: {exc.reason}")
        lote = payload.get("users") if isinstance(payload, dict) else payload
        lote = lote or []
        for u in lote:
            usuarios.append({
                "id": str(u.get("id") or ""),
                "email": u.get("email"),
                "criado_em": u.get("created_at"),
                "ultimo_acesso": u.get("last_sign_in_at"),
            })
        if len(lote) < por_pagina:
            return usuarios
        pagina += 1


def existe_usuario_auth(usuario: str) -> bool:
    """`GET /auth/v1/admin/users/{id}`: uma chamada, 200 se existe, 404 se não.

    Bem mais barato que paginar `admin/users` a cada PUT. Sem Supabase (dev-auth) não
    há Auth para conferir: devolve True e a tabela é a única fonte.
    """
    if not _supabase_configurado() or not _secret_key():
        logging.getLogger("sus_predict.auth").warning(
            "existe_usuario_auth(%s): Supabase não configurado — validação no Auth PULADA "
            "(aceitável só em dev-auth; em produção isto é erro de configuração)", usuario,
        )
        return True
    from api.core.db import _sb_headers
    usuario = str(usuario or "").strip()
    if not usuario:
        return False
    req = urllib.request.Request(
        f"{_sb_url()}/auth/v1/admin/users/{urllib.parse.quote(usuario, safe='')}",
        headers=_sb_headers(_secret_key()),
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.getcode() == 200
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return False
        raise HTTPException(503, f"GoTrue admin/users/{{id}} respondeu {e.code}")
    except urllib.error.URLError as exc:
        raise HTTPException(503, f"Supabase inacessível: {exc.reason}")
