"""
Valida SQL gerado pelo LLM antes de executar o fallback de consulta livre do SusBot.

Usa `sqlglot` como parser real para distinguir consultas `SELECT` legítimas de escrita,
DDL, múltiplos statements e tabelas fora da allowlist.
"""

from __future__ import annotations

from typing import Iterable

import sqlglot
from sqlglot import exp

ALLOWLIST_TABELAS = frozenset(
    {
        "estoque",
        "alertas",
        "datasus_runs",
        "datasus_serie",
        "datasus_sexo",
        "datasus_faixa_etaria",
        "datasus_top_causas",
    }
)

_BLOQUEADOS = tuple(
    cls
    for cls in (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Drop,
        exp.Create,
        getattr(exp, "Alter", None),
        getattr(exp, "TruncateTable", None),
    )
    if cls is not None
)


def _iter_nodes(tree: exp.Expression) -> Iterable[exp.Expression]:
    """Normaliza a iteração de nós entre versões do sqlglot."""

    for node in tree.walk():
        yield node[0] if isinstance(node, tuple) else node


def _table_names(tree: exp.Expression) -> set[str]:
    tabelas: set[str] = set()
    for table in tree.find_all(exp.Table):
        nome = (table.name or "").strip().lower()
        if nome:
            tabelas.add(nome)
    return tabelas


def validar_sql(query: str) -> tuple[bool, str]:
    """Valida uma query SQL para uso no fallback do SusBot."""

    texto = (query or "").strip().rstrip(";")
    if not texto:
        return False, "Query vazia"

    try:
        statements = [stmt for stmt in sqlglot.parse(texto, read="sqlite") if stmt is not None]
    except Exception as exc:  # pragma: no cover - mensagem depende da versão do parser
        return False, f"SQL inválido: {exc}"

    if len(statements) != 1:
        return False, "Apenas um único statement é permitido por chamada"

    tree = statements[0]
    if not isinstance(tree, (exp.Select, exp.Union, exp.Except, exp.Intersect)):
        return False, "Apenas consultas SELECT são permitidas"

    for node in _iter_nodes(tree):
        if isinstance(node, _BLOQUEADOS):
            return False, "Apenas consultas SELECT são permitidas (statement de escrita detectado)"

    fora_da_allowlist = _table_names(tree) - ALLOWLIST_TABELAS
    if fora_da_allowlist:
        tabelas = ", ".join(sorted(fora_da_allowlist))
        return False, f"Tabela(s) não permitida(s) (fora da allowlist): {tabelas}"

    return True, ""
