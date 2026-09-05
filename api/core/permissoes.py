"""Permissão por ferramenta (docs/09, Fase 1).

Mapa perfil→ferramentas vive aqui, em código versionado. A tabela
`usuarios_acesso` guarda só a atribuição (usuario → perfil, municipios, ativo).
Nada que passe pela conversa (usuário, LLM, histórico, memória) altera isso.

`carregar_acesso` roda no backend antes de qualquer LLM. Sem linha, ou linha
com ativo=0, é acesso negado — não existe perfil padrão implícito.

Fase 2 (escopo de município) ainda não está implementada: `municipios` é
carregado mas nenhuma validação de ibge6 acontece aqui.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import Depends, HTTPException

from api.core import db
from api.core.auth import require_user
from api.core.identidade import usuario_referencia

log = logging.getLogger("sus_predict.permissoes")

FERRAMENTA_UNIVERSAL = "sobre_o_projeto"
ORIGEM_PROVISIONAMENTO = "provisionamento_automatico"

# `executar_sql_fallback` não entra em nenhum perfil, de propósito.
PERFIS: dict[str, frozenset[str]] = {
    "gestor": frozenset({
        "consultar_estoque", "consultar_alertas", "consultar_epidemiologia", "gerar_etp",
    }),
    "vigilancia": frozenset({"consultar_epidemiologia", "consultar_alertas"}),
    "farmacia": frozenset({"consultar_estoque", "consultar_alertas", "gerar_etp"}),
    "admin": frozenset({
        "consultar_estoque", "consultar_alertas", "consultar_epidemiologia", "gerar_etp",
    }),
    # Faixa 2 do provisionamento: só o texto universal. Nenhum dado, nenhum REST de dados.
    "visitante": frozenset(),
}

# Faixa 1 do provisionamento automático: e-mail → perfil. Só quem está aqui ganha
# perfil de dados no primeiro login; todo o resto vira "visitante". `admin` NUNCA
# entra nesta lista (só por SQL manual) — o boot falha se entrar.
# Chaves são normalizadas (minúsculas, sem espaços nas pontas) em _validar_equipe().
EQUIPE_AUTORIZADA: dict[str, str] = {
    "<EMAIL_PESSOA_1>": "gestor",
    "<EMAIL_PESSOA_2>": "gestor",
    "<EMAIL_PESSOA_3>": "vigilancia",
    "<EMAIL_PESSOA_4>": "farmacia",
    "<EMAIL_PESSOA_5>": "gestor",
}


def normalizar_email(email: str | None) -> str:
    return str(email or "").strip().lower()


def _validar_equipe(equipe: dict[str, str]) -> dict[str, str]:
    """Roda no import (= no boot). Rejeita admin e perfil desconhecido na lista."""

    normalizada: dict[str, str] = {}
    for email, perfil in equipe.items():
        chave = normalizar_email(email)
        perfil_norm = str(perfil or "").strip().lower()
        if perfil_norm == "admin":
            raise RuntimeError(
                f"EQUIPE_AUTORIZADA: '{email}' marcado como admin. Admin nunca é provisionado "
                "automaticamente; atribua por SQL manual (supabase/seed_usuarios_acesso.sql)."
            )
        if perfil_norm not in PERFIS:
            raise RuntimeError(f"EQUIPE_AUTORIZADA: perfil desconhecido '{perfil}' para '{email}'.")
        normalizada[chave] = perfil_norm
    return normalizada


EQUIPE_AUTORIZADA = _validar_equipe(EQUIPE_AUTORIZADA)


class AcessoNegado(Exception):
    """Usuário sem linha em usuarios_acesso ou com ativo=0."""


@dataclass(frozen=True)
class Acesso:
    usuario: str
    perfil: str
    ferramentas: frozenset[str]
    municipios: tuple[str, ...]


def ferramentas_do_perfil(perfil: str) -> frozenset[str]:
    base = PERFIS.get(str(perfil or "").strip().lower())
    if base is None:
        # Perfil desconhecido na tabela (typo no seed): só o texto universal.
        return frozenset({FERRAMENTA_UNIVERSAL})
    return base | {FERRAMENTA_UNIVERSAL}


def carregar_acesso(usuario: str) -> Acesso:
    """Resolve o acesso a partir da tabela. Levanta AcessoNegado se ausente/inativo."""

    usuario = str(usuario or "").strip()
    if not usuario:
        raise AcessoNegado("Usuário não identificado.")
    row = db.get_acesso(usuario)
    if not row:
        raise AcessoNegado("Seu usuário ainda não foi liberado no SusPredict. Fale com o administrador.")
    if not row.get("ativo"):
        raise AcessoNegado("Seu acesso ao SusPredict está desativado. Fale com o administrador.")
    perfil = str(row.get("perfil") or "").strip().lower()
    return Acesso(
        usuario=usuario,
        perfil=perfil,
        ferramentas=ferramentas_do_perfil(perfil),
        municipios=tuple(str(m) for m in (row.get("municipios") or [])),
    )


def carregar_acesso_http(usuario: str) -> Acesso:
    """Mesma resolução, mas em 403 HTTP para os routers."""

    try:
        return carregar_acesso(usuario)
    except AcessoNegado as exc:
        raise HTTPException(403, str(exc)) from exc


MENSAGEM_VISITANTE = (
    "Seu usuário entrou no SusPredict como visitante e ainda não tem acesso aos dados "
    "do município. Peça a liberação do seu perfil ao administrador."
)

_NOMES_AMIGAVEIS = {
    "consultar_estoque": "estoque de insumos",
    "consultar_alertas": "alertas",
    "consultar_epidemiologia": "dados epidemiológicos",
    "gerar_etp": "geração de ETP",
}


def mensagem_ferramenta_negada(ferramenta: str, perfil: str | None = None) -> str:
    """Recusa gerada em código, distinta de fora-do-escopo. Nunca passa pelo LLM.

    Visitante recebe uma mensagem própria, que orienta a pedir liberação.
    """

    if perfil == "visitante":
        return MENSAGEM_VISITANTE
    nome = _NOMES_AMIGAVEIS.get(str(ferramenta or ""), "essa consulta")
    return f"Seu perfil não tem acesso a {nome} no SusPredict. Fale com o administrador."


def provisionar_acesso(user: dict) -> Acesso:
    """Primeiro acesso sem linha: cria a linha (equipe → perfil da lista; senão visitante).

    `user` é o dicionário devolvido pelo token (GoTrue `/auth/v1/user` ou dev-auth); o
    e-mail vem dali, nunca do body. Linha existente nunca é sobrescrita (um rebaixamento
    manual não é desfeito pelo próximo login) e ativo=0 não é reativado.
    """

    usuario = usuario_referencia(user)
    if not usuario:
        raise AcessoNegado("Usuário não identificado.")
    if db.get_acesso(usuario) is None:
        email = normalizar_email(user.get("email"))
        perfil = EQUIPE_AUTORIZADA.get(email) if email else None
        faixa = "equipe" if perfil else "visitante"
        perfil = perfil or "visitante"
        # ponytail: duas requisições simultâneas do mesmo usuário novo gravam a mesma
        # linha; o upsert é idempotente com estes valores. Trocar por INSERT OR IGNORE
        # se um dia o perfil provisionado puder variar entre chamadas.
        db.upsert_acesso(usuario, perfil, [], ativo=True, atribuido_por=ORIGEM_PROVISIONAMENTO)
        log.info("provisionamento automatico: usuario=%s email=%s perfil=%s faixa=%s", usuario, email or "-", perfil, faixa)
    return carregar_acesso(usuario)


def provisionar_acesso_http(user: dict) -> Acesso:
    try:
        return provisionar_acesso(user)
    except AcessoNegado as exc:
        raise HTTPException(403, str(exc)) from exc


def require_acesso(ferramenta: str | None = None):
    """Dependency FastAPI: token válido + linha ativa (+ ferramenta permitida, se informada).

    Provisiona no primeiro acesso (equipe ou visitante). Visitante passa em
    `require_acesso()` sem ferramenta (ex.: /municipios) e leva 403 em qualquer
    endpoint de dados.
    """

    def dependency(user: dict = Depends(require_user)) -> Acesso:
        if not usuario_referencia(user):
            raise HTTPException(401, "Usuario autenticado invalido")
        acesso = provisionar_acesso_http(user)
        if ferramenta and ferramenta not in acesso.ferramentas:
            raise HTTPException(403, mensagem_ferramenta_negada(ferramenta, acesso.perfil))
        return acesso

    return dependency
