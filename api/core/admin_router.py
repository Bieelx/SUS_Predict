"""Administração de usuários (docs/09, Fase 4 antecipada).

Tudo aqui exige perfil `admin` resolvido no backend (`require_admin`). O frontend
esconder o menu é cosmético. A chave secreta do Supabase só é usada em
`auth.listar_usuarios_auth`, nunca sai na resposta.

Regras que não são negociáveis (ver testes em test_admin_usuarios.py):
- nunca promove a `admin` (só SQL manual);
- admin não altera a si mesmo;
- nunca deixa o sistema sem admin ativo;
- toda alteração vira linha em `usuarios_acesso_log`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.core import auth as auth_core
from api.core import db
from api.core.identidade import usuario_referencia
from api.core.permissoes import PERFIS, Acesso, require_acesso

router = APIRouter(prefix="/api/admin", tags=["admin"])

PERFIS_ATRIBUIVEIS = frozenset(PERFIS) - {"admin"}


def require_admin(acesso: Acesso = Depends(require_acesso()), user: dict = Depends(auth_core.require_user)) -> dict:
    """Perfil admin ativo, resolvido pela tabela. Devolve {usuario, email} do admin;
    o e-mail vira `atribuido_por` e `por` no log (cai no id se o token não tiver e-mail)."""
    if acesso.perfil != "admin":
        raise HTTPException(403, "Apenas administradores acessam esta área.")
    return {"usuario": acesso.usuario, "email": str(user.get("email") or usuario_referencia(user))}


class PerfilBody(BaseModel):
    perfil: str


class AtivoBody(BaseModel):
    ativo: bool


def _linha(usuario: str, auth: dict | None, acesso: dict | None) -> dict:
    return {
        "usuario": usuario,
        "email": (auth or {}).get("email"),
        "criado_em": (auth or {}).get("criado_em"),
        "ultimo_acesso": (auth or {}).get("ultimo_acesso"),
        "perfil": (acesso or {}).get("perfil"),          # None = sem acesso
        "ativo": bool((acesso or {}).get("ativo")) if acesso else None,
        "atribuido_por": (acesso or {}).get("atribuido_por"),
        "atualizado_em": (acesso or {}).get("atualizado_em"),
        "sem_acesso": acesso is None,
    }


@router.get("/usuarios")
def listar_usuarios(admin: dict = Depends(require_admin)) -> list[dict]:
    """Auth (GoTrue) ⋈ usuarios_acesso. Quem só existe no Auth aparece como sem acesso;
    quem só existe na tabela (seed antigo, dev-*) aparece sem e-mail."""
    auth = {u["id"]: u for u in auth_core.listar_usuarios_auth() if u.get("id")}
    acessos = {a["usuario"]: a for a in db.list_acessos()}
    ids = list(auth) + [u for u in acessos if u not in auth]
    linhas = [_linha(u, auth.get(u), acessos.get(u)) for u in ids]
    # sem acesso primeiro: é o caso de uso principal (liberar quem acabou de criar conta)
    linhas.sort(key=lambda l: (not l["sem_acesso"], (l["email"] or "").lower()))
    return linhas


def _alvo(usuario: str, admin: dict) -> tuple[str, dict | None, str]:
    admin_id, admin_email = admin["usuario"], admin["email"]
    usuario = str(usuario or "").strip()
    if not usuario:
        raise HTTPException(400, "Usuário inválido.")
    if usuario == admin_id:
        raise HTTPException(400, "Você não pode alterar o próprio acesso.")
    # Antes de qualquer escrita: UUID fora do Auth não pode virar linha órfã na tabela
    # nem no log. Uma chamada GET admin/users/{id}, não a listagem paginada.
    if not auth_core.existe_usuario_auth(usuario):
        raise HTTPException(404, "Usuário não existe no Auth do Supabase.")
    return usuario, db.get_acesso(usuario), admin_email


def _protege_ultimo_admin(antes: dict | None, perfil_depois: str, ativo_depois: bool) -> None:
    """Recusa (409) qualquer escrita que deixe zero admins ativos.

    NÃO é código morto. Por HTTP o 409 é inalcançável hoje: o único admin ativo restante
    seria o próprio chamador, e `_alvo` já barra auto-alteração antes de chegar aqui.
    Existe como defesa em profundidade contra corrida (dois admins rebaixando um ao outro
    ao mesmo tempo) e contra chamadas futuras que não passem por `_alvo`. Testado
    diretamente em test_admin_usuarios.py.
    """
    era_admin_ativo = bool(antes) and antes.get("perfil") == "admin" and bool(antes.get("ativo"))
    continua = perfil_depois == "admin" and ativo_depois
    if era_admin_ativo and not continua and db.count_admins_ativos() <= 1:
        raise HTTPException(409, "Operação recusada: o sistema ficaria sem nenhum administrador ativo.")


@router.put("/usuarios/{usuario}/perfil")
def atribuir_perfil(usuario: str, body: PerfilBody, admin: dict = Depends(require_admin)) -> dict:
    perfil = str(body.perfil or "").strip().lower()
    if perfil == "admin":
        raise HTTPException(400, "Perfil admin não pode ser atribuído por esta tela. Use SQL manual.")
    if perfil not in PERFIS_ATRIBUIVEIS:
        raise HTTPException(400, f"Perfil inválido. Use um de: {sorted(PERFIS_ATRIBUIVEIS)}")
    usuario, antes, admin_email = _alvo(usuario, admin)
    ativo = bool(antes.get("ativo")) if antes else True
    _protege_ultimo_admin(antes, perfil, ativo)
    depois = db.upsert_acesso(usuario, perfil, (antes or {}).get("municipios") or [], ativo=ativo, atribuido_por=admin_email)
    db.insert_acesso_log(usuario, "atribuir_perfil", antes, depois, por=admin_email)
    return _linha(usuario, None, depois)


@router.put("/usuarios/{usuario}/ativo")
def definir_ativo(usuario: str, body: AtivoBody, admin: dict = Depends(require_admin)) -> dict:
    usuario, antes, admin_email = _alvo(usuario, admin)
    if antes is None:
        raise HTTPException(404, "Usuário sem acesso cadastrado. Atribua um perfil primeiro.")
    _protege_ultimo_admin(antes, antes["perfil"], body.ativo)
    depois = db.upsert_acesso(usuario, antes["perfil"], antes.get("municipios") or [], ativo=body.ativo, atribuido_por=admin_email)
    db.insert_acesso_log(usuario, "ativar" if body.ativo else "desativar", antes, depois, por=admin_email)
    return _linha(usuario, None, depois)


@router.get("/usuarios/{usuario}/log")
def log_usuario(usuario: str, admin: dict = Depends(require_admin)) -> list[dict]:
    return db.list_acesso_log(usuario)
