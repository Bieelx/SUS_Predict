"""
Tools parametrizadas do SusBot.

Cada factory fixa o `ibge6` por closure e devolve funções que retornam sempre `dict`.
"""

from __future__ import annotations

from collections.abc import Callable
import sqlite3

from api.core import db
from api.core.sql_guard import validar_sql

_SISTEMAS_VALIDOS = {"SIM", "SIH", "SINASC", "SIA", "SINAN"}


def _normalizar_ibge6(ibge6: str) -> str:
    return str(ibge6 or "").strip()[:6]


def _status_estoque(dias_restantes: float) -> str:
    if dias_restantes <= 7:
        return "critico"
    if dias_restantes <= 15:
        return "alerta"
    return "ok"


def _calcular_dias_restantes(row: dict) -> float:
    consumo = float(row.get("consumo_medio_dia") or 0)
    quantidade = float(row.get("quantidade_atual") or 0)
    if consumo <= 0:
        return 0.0
    return round(quantidade / consumo, 1)


def _enriquecer_estoque(rows: list[dict]) -> list[dict]:
    itens: list[dict] = []
    for row in rows:
        dias_restantes = _calcular_dias_restantes(row)
        itens.append(
            {
                "ibge6": row.get("ibge6"),
                "item": row.get("item"),
                "quantidade_atual": row.get("quantidade_atual"),
                "consumo_medio_dia": row.get("consumo_medio_dia"),
                "atualizado_em": row.get("atualizado_em"),
                "dias_restantes": dias_restantes,
                "status": _status_estoque(dias_restantes),
            }
        )
    return itens


def _resposta_vazia(motivo: str, **extra) -> dict:
    payload = {"encontrado": False, "motivo": motivo}
    payload.update(extra)
    return payload


def criar_susbot_tools(ibge6: str) -> dict[str, Callable]:
    """Cria as tools do SusBot com o município fixado por closure."""

    ibge = _normalizar_ibge6(ibge6)

    def consultar_estoque(item: str | None = None, **_kwargs) -> dict:
        rows = db.get_estoque(ibge, item=item)
        if not rows:
            return _resposta_vazia(
                "Nenhum item de estoque encontrado para este município.",
                ibge6=ibge,
                item=item,
                dados=[],
            )

        dados = _enriquecer_estoque(rows)
        return {
            "encontrado": True,
            "ibge6": ibge,
            "item": item,
            "total_itens": len(dados),
            "dados": dados,
        }

    def consultar_alertas(status: str | None = None, tipo: str | None = None, **_kwargs) -> dict:
        rows = db.get_alertas(ibge, status=status, tipo=tipo)
        if not rows:
            return _resposta_vazia(
                "Nenhum alerta encontrado para os filtros informados.",
                ibge6=ibge,
                status=status,
                tipo=tipo,
                dados=[],
            )

        return {
            "encontrado": True,
            "ibge6": ibge,
            "status": status,
            "tipo": tipo,
            "total_alertas": len(rows),
            "dados": rows,
        }

    def consultar_epidemiologia(
        sistema: str,
        ano_ini: int | None = None,
        ano_fim: int | None = None,
        doenca_cod: str | None = None,
        **_kwargs,
    ) -> dict:
        sistema_norm = str(sistema or "").strip().upper()
        if sistema_norm not in _SISTEMAS_VALIDOS:
            return _resposta_vazia(
                "Sistema inválido para consulta epidemiológica.",
                ibge6=ibge,
                sistema=sistema,
            )

        candidatos = [
            run
            for run in db.list_runs(sistema=sistema_norm, limit=200)
            if str(run.get("ibge6") or "")[:6] == ibge
        ]
        if ano_ini is not None:
            candidatos = [run for run in candidatos if int(run.get("ano_ini") or 0) == int(ano_ini)]
        if ano_fim is not None:
            candidatos = [run for run in candidatos if int(run.get("ano_fim") or 0) == int(ano_fim)]
        if doenca_cod:
            alvo = str(doenca_cod).strip()
            candidatos = [run for run in candidatos if str(run.get("doenca_cod") or "").strip() == alvo]

        if not candidatos:
            return _resposta_vazia(
                "Nenhum resultado epidemiológico encontrado para este município e filtros.",
                ibge6=ibge,
                sistema=sistema_norm,
                ano_ini=ano_ini,
                ano_fim=ano_fim,
                doenca_cod=doenca_cod,
            )

        run = candidatos[0]
        resultado = db.find_cached(
            {
                "sistema": run["sistema"],
                "uf": run["uf"],
                "cidade": run["cidade"],
                "ibge": ibge,
                "ano_ini": run["ano_ini"],
                "ano_fim": run["ano_fim"],
                "doenca_cod": run.get("doenca_cod") or None,
            }
        )
        if not resultado:
            resultado = db.find_latest_by_ibge(ibge, sistema_norm)

        if not resultado:
            return _resposta_vazia(
                "Nenhum resultado epidemiológico disponível para o município.",
                ibge6=ibge,
                sistema=sistema_norm,
            )

        meta = resultado.get("meta") or {}
        if doenca_cod and str(meta.get("doenca_cod") or "").strip() != str(doenca_cod).strip():
            return _resposta_vazia(
                "Resultado encontrado, mas o código de doença solicitado não bate com o cache mais recente.",
                ibge6=ibge,
                sistema=sistema_norm,
                doenca_cod=doenca_cod,
            )

        if ano_ini is not None and int(meta.get("ano_ini") or 0) != int(ano_ini):
            return _resposta_vazia(
                "Resultado encontrado, mas o ano inicial solicitado não bate com o cache mais recente.",
                ibge6=ibge,
                sistema=sistema_norm,
                ano_ini=ano_ini,
                ano_fim=ano_fim,
            )

        if ano_fim is not None and int(meta.get("ano_fim") or 0) != int(ano_fim):
            return _resposta_vazia(
                "Resultado encontrado, mas o ano final solicitado não bate com o cache mais recente.",
                ibge6=ibge,
                sistema=sistema_norm,
                ano_ini=ano_ini,
                ano_fim=ano_fim,
            )

        return {
            "encontrado": True,
            "ibge6": ibge,
            "sistema": sistema_norm,
            "ano_ini": meta.get("ano_ini"),
            "ano_fim": meta.get("ano_fim"),
            "doenca_cod": meta.get("doenca_cod"),
            "dados": {
                "meta": meta,
                "stats": resultado.get("stats") or {},
                "serie_temporal": resultado.get("serie_temporal") or [],
                "serie_com_previsao": resultado.get("serie_com_previsao") or [],
                "distribuicao_sexo": resultado.get("distribuicao_sexo") or [],
                "distribuicao_faixa_etaria": resultado.get("distribuicao_faixa_etaria") or [],
                "top_causas": resultado.get("top_causas") or [],
            },
        }

    def executar_sql_fallback(query: str, **_kwargs) -> dict:
        ok, motivo = validar_sql(query)
        if not ok:
            return _resposta_vazia(motivo, sql=query, dados=[])

        try:
            with db._conn() as con:  # pylint: disable=protected-access
                cursor = con.execute(query)
                rows = cursor.fetchall()
                colunas = [col[0] for col in (cursor.description or [])]
        except sqlite3.Error as exc:
            return _resposta_vazia(f"Falha ao executar SQL: {exc}", sql=query, dados=[])

        dados = [dict(row) for row in rows]
        return {
            "encontrado": bool(dados),
            "sql": query,
            "colunas": colunas,
            "total_linhas": len(dados),
            "dados": dados,
            "motivo": "" if dados else "Consulta executada sem linhas retornadas.",
        }

    return {
        "consultar_estoque": consultar_estoque,
        "consultar_alertas": consultar_alertas,
        "consultar_epidemiologia": consultar_epidemiologia,
        "executar_sql_fallback": executar_sql_fallback,
    }
