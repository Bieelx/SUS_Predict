"""Identidade do usuário autenticado — único lugar que decide o identificador.

Toda memória, conversa, canal e (na Fase 1) permissão usam este valor. Ele vem
sempre do token validado por `auth.require_user`, nunca do body da requisição.
"""

from __future__ import annotations

from typing import Any


def usuario_referencia(user: dict[str, Any]) -> str:
    """Identificador estável do usuário: id do Supabase, com fallback para email/sub."""

    return str(user.get("id") or user.get("email") or user.get("sub") or "").strip()
