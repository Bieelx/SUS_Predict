"""Motor puro do modo demo: crise histórica de dengue 2024.

Lida com o dataset versionado, o corte temporal mensal e o replay
determinístico do estado da demo sem depender de FastAPI, banco ou rede.
"""

from __future__ import annotations

import copy
import json
import math
import re
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path

_DATASET_PATH = Path(__file__).resolve().parent.parent / "data" / "demo_crise_historica_dengue_2024.json"
_MES_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _parse_mes(mes: str) -> date:
    if not _MES_RE.match(mes):
        raise ValueError(f"cutoff inválido: esperado YYYY-MM, recebido {mes!r}")
    ano, mes_num = mes.split("-")
    return date(int(ano), int(mes_num), 1)


def _format_mes(dt: date) -> str:
    return dt.strftime("%Y-%m")


def _formatar_moeda(valor: float) -> str:
    texto = f"{valor:,.2f}"
    return f"R$ {texto.replace(',', 'X').replace('.', ',').replace('X', '.')}"


def _avancar_mes(mes: str, passos: int = 1) -> str:
    atual = _parse_mes(mes)
    total_meses = atual.year * 12 + (atual.month - 1) + passos
    ano, mes_num = divmod(total_meses, 12)
    return f"{ano:04d}-{mes_num + 1:02d}"


def _normalizar_mes(row: dict) -> dict:
    return {"mes": row["mes"], "casos": int(row["casos"])}


def _validar_dataset(dataset: dict) -> dict:
    obrigatorios = {
        "scenario_id",
        "status_dataset",
        "municipio",
        "uf",
        "ibge6",
        "fonte",
        "periodo",
        "extraido_em",
        "observacoes",
        "premissas",
        "serie_mensal",
        "estoque_demo",
    }
    faltando = sorted(obrigatorios - set(dataset))
    if faltando:
        raise ValueError(f"dataset demo incompleto: faltando {', '.join(faltando)}")

    periodo = dataset["periodo"]
    if not isinstance(periodo, dict) or "inicio" not in periodo or "fim" not in periodo:
        raise ValueError("dataset demo inválido: periodo precisa ter inicio/fim")

    serie = dataset["serie_mensal"]
    if not isinstance(serie, list) or not serie:
        raise ValueError("dataset demo inválido: serie_mensal precisa ser uma lista não vazia")

    serie_norm = []
    ultimo_mes = None
    vistos: set[str] = set()
    for row in serie:
        if not isinstance(row, dict) or "mes" not in row or "casos" not in row:
            raise ValueError("dataset demo inválido: serie_mensal exige mes/casos")
        mes = row["mes"]
        if not _MES_RE.match(mes):
            raise ValueError(f"dataset demo inválido: mês fora do padrão YYYY-MM: {mes!r}")
        if mes in vistos:
            raise ValueError(f"dataset demo inválido: mês duplicado em serie_mensal: {mes}")
        if ultimo_mes is not None and mes <= ultimo_mes:
            raise ValueError("dataset demo inválido: serie_mensal precisa estar ordenada em ordem crescente")
        vistos.add(mes)
        ultimo_mes = mes
        serie_norm.append(_normalizar_mes(row))

    estoque = dataset["estoque_demo"]
    if not isinstance(estoque, list) or not estoque:
        raise ValueError("dataset demo inválido: estoque_demo precisa ser uma lista não vazia")

    estoque_norm = []
    for row in estoque:
        if not isinstance(row, dict):
            raise ValueError("dataset demo inválido: item de estoque precisa ser dict")
        for campo in (
            "item",
            "unidade",
            "quantidade_inicial",
            "consumo_base_por_caso",
            "consumo_basal_diario",
            "preco_unitario",
            "estoque_demo",
        ):
            if campo not in row:
                raise ValueError(f"dataset demo inválido: estoque_demo sem campo {campo}")
        if not row["estoque_demo"]:
            raise ValueError("dataset demo inválido: todos os itens do cenário precisam marcar estoque_demo=true")
        estoque_norm.append({
            "item": str(row["item"]),
            "unidade": str(row["unidade"]),
            "quantidade_inicial": float(row["quantidade_inicial"]),
            "consumo_base_por_caso": float(row["consumo_base_por_caso"]),
            "consumo_basal_diario": float(row["consumo_basal_diario"]),
            "preco_unitario": float(row["preco_unitario"]),
            "estoque_demo": True,
        })

    premissas = dataset["premissas"]
    if not isinstance(premissas, dict):
        raise ValueError("dataset demo inválido: premissas precisa ser um objeto")

    return {
        **dataset,
        "serie_mensal": serie_norm,
        "estoque_demo": estoque_norm,
        "premissas": {
            "limiar_surto_crescimento_pct": float(premissas["limiar_surto_crescimento_pct"]),
            "limiar_surto_previsao_multiplo": float(premissas["limiar_surto_previsao_multiplo"]),
            "limiar_ruptura_atencao_dias": float(premissas["limiar_ruptura_atencao_dias"]),
            "limiar_ruptura_critica_dias": float(premissas["limiar_ruptura_critica_dias"]),
            "multiplicador_compra_emergencial": float(premissas["multiplicador_compra_emergencial"]),
            "janela_planejamento_dias": int(premissas["janela_planejamento_dias"]),
            "janela_previsao_meses": int(premissas["janela_previsao_meses"]),
            "dias_por_mes": int(premissas["dias_por_mes"]),
        },
    }


@lru_cache(maxsize=1)
def _carregar_dataset_cache() -> dict:
    with _DATASET_PATH.open("r", encoding="utf-8") as arquivo:
        return _validar_dataset(json.load(arquivo))


def carregar_dataset() -> dict:
    """Carrega e normaliza o dataset demo sem expor a referência interna."""

    return copy.deepcopy(_carregar_dataset_cache())


def listar_cortes(cutoff: str | None = None) -> dict:
    """Lista os cortes mensais disponíveis e o índice atual quando houver cutoff."""

    dataset = carregar_dataset()
    serie = dataset["serie_mensal"]
    mes_inicial = serie[0]["mes"]
    mes_final = serie[-1]["mes"]
    indice_atual = None

    if cutoff is not None:
        _parse_mes(cutoff)
        indices = [idx for idx, row in enumerate(serie) if row["mes"] == cutoff]
        if not indices:
            raise ValueError(f"cutoff fora do intervalo da demo: {cutoff}")
        indice_atual = indices[0]

    return {
        "mes_inicial": mes_inicial,
        "mes_final": mes_final,
        "indice_atual": indice_atual,
        "cortes": [{"mes": row["mes"], "indice": idx} for idx, row in enumerate(serie)],
    }


def _crescimento_pct(atual: int, anterior: int | None) -> float | None:
    if anterior in (None, 0):
        return None
    return round(((atual - anterior) / anterior) * 100, 1)


def _prever_meses(serie_visivel: list[dict], horizonte: int) -> list[dict]:
    if not serie_visivel:
        return []

    if len(serie_visivel) == 1:
        delta_base = max(1, round(serie_visivel[-1]["casos"] * 0.15))
    else:
        ultimos = serie_visivel[-3:]
        deltas = [max(0, b["casos"] - a["casos"]) for a, b in zip(ultimos, ultimos[1:])]
        delta_base = max(1, round(sum(deltas) / max(len(deltas), 1)))

    previsao = []
    ultimo = serie_visivel[-1]["casos"]
    mes_atual = serie_visivel[-1]["mes"]
    for passo in range(1, horizonte + 1):
        mes = _avancar_mes(mes_atual, passo)
        if passo == 1:
            casos = max(0, round(ultimo + delta_base))
        else:
            casos = max(0, round(previsao[-1]["casos_previstos"] + delta_base * (1 + 0.12 * (passo - 1))))
        lower = max(0, round(casos * 0.82))
        upper = max(0, round(casos * 1.18))
        previsao.append({
            "mes": mes,
            "casos_previstos": casos,
            "lower": lower,
            "upper": upper,
            "tipo": "previsto",
        })

    return previsao


def _simular_estoque(
    estoque_demo: list[dict],
    serie_visivel: list[dict],
    previsao: list[dict],
    premissas: dict,
) -> tuple[list[dict], dict]:
    dias_por_mes = int(premissas["dias_por_mes"])
    janela_planejamento_dias = int(premissas.get("janela_planejamento_dias", 90))
    limiar_atencao = float(premissas["limiar_ruptura_atencao_dias"])
    limiar_critica = float(premissas["limiar_ruptura_critica_dias"])
    multiplicador_emergencial = float(premissas["multiplicador_compra_emergencial"])

    meses_base = [(row["mes"], row["casos"]) for row in serie_visivel]
    meses_futuros = [(row["mes"], row["casos_previstos"]) for row in previsao]

    resumo_itens = []
    marcos = {
        "etp_recomendado_em": None,
        "mes_acao_recomendado": None,
        "ruptura_estimada_em": None,
        "mes_ruptura_prevista": None,
        "antecedencia_operacional_dias": None,
        "quantidade_planejada": None,
        "custo_planejado": None,
        "custo_emergencial": None,
        "percentual_emergencial": round((multiplicador_emergencial - 1) * 100, 1),
        "economia_estimada": 0.0,
    }

    pior_item = None
    pior_dias = math.inf

    for item in estoque_demo:
        quantidade = float(item["quantidade_inicial"])
        quantidade_restante = quantidade

        for _, casos in meses_base:
            consumo_mes = float(item["consumo_basal_diario"]) * dias_por_mes + float(item["consumo_base_por_caso"]) * casos
            quantidade_restante = max(0.0, quantidade_restante - consumo_mes)

        consumo_dia_atual = float(item["consumo_basal_diario"]) + (
            float(item["consumo_base_por_caso"]) * serie_visivel[-1]["casos"] / dias_por_mes
        )
        quantidade_pos_corte = quantidade_restante
        dias_hoje = round(quantidade_pos_corte / max(consumo_dia_atual, 0.01), 1)
        status = "ok"
        if dias_hoje <= limiar_critica:
            status = "critico"
        elif dias_hoje <= limiar_atencao:
            status = "atencao"

        mes_recomendado = None
        mes_ruptura = None
        dias_recomendacao = None
        dias_ruptura = None
        if dias_hoje <= limiar_atencao:
            mes_recomendado = serie_visivel[-1]["mes"]
            dias_recomendacao = dias_hoje
        if dias_hoje <= limiar_critica:
            mes_ruptura = serie_visivel[-1]["mes"]
            dias_ruptura = dias_hoje

        quantidade_futura = quantidade_pos_corte
        for mes, casos in meses_futuros:
            consumo_dia_futuro = float(item["consumo_basal_diario"]) + (
                float(item["consumo_base_por_caso"]) * casos / dias_por_mes
            )
            consumo_mes = float(item["consumo_basal_diario"]) * dias_por_mes + float(item["consumo_base_por_caso"]) * casos
            quantidade_futura = max(0.0, quantidade_futura - consumo_mes)
            dias_futuro = round(quantidade_futura / max(consumo_dia_futuro, 0.01), 1)
            if mes_recomendado is None and dias_futuro <= limiar_atencao:
                mes_recomendado = mes
                dias_recomendacao = dias_futuro
            if mes_ruptura is None and dias_futuro <= limiar_critica:
                mes_ruptura = mes
                dias_ruptura = dias_futuro

        if dias_recomendacao is None:
            dias_recomendacao = dias_hoje
        if dias_ruptura is None and mes_ruptura is not None:
            dias_ruptura = dias_hoje

        quantidade_planejada = round(consumo_dia_atual * janela_planejamento_dias)
        custo_planejado = round(quantidade_planejada * float(item["preco_unitario"]), 2)
        custo_emergencial = round(custo_planejado * multiplicador_emergencial, 2)
        economia_estimada = round(custo_emergencial - custo_planejado, 2)
        antecedencia_operacional_dias = None
        if mes_recomendado == serie_visivel[-1]["mes"]:
            antecedencia_operacional_dias = max(0, int(round(dias_hoje)))
        elif dias_recomendacao is not None and dias_ruptura is not None:
            antecedencia_operacional_dias = max(0, int(round(dias_recomendacao - dias_ruptura)))

        resumo_itens.append({
            "item": item["item"],
            "unidade": item["unidade"],
            "estoque_demo": True,
            "quantidade_inicial": round(quantidade, 1),
            "quantidade_restante": round(quantidade_pos_corte, 1),
            "consumo_basal_diario": round(float(item["consumo_basal_diario"]), 2),
            "consumo_base_por_caso": round(float(item["consumo_base_por_caso"]), 2),
            "consumo_previsto_dia": round(consumo_dia_atual, 2),
            "dias_restantes": dias_hoje,
            "status": status,
            "preco_unitario": round(float(item["preco_unitario"]), 2),
            "custo_planejado": custo_planejado,
            "custo_emergencial": custo_emergencial,
            "economia_estimada": economia_estimada,
            "evidencia": {
                "mes_referencia": serie_visivel[-1]["mes"],
                "casos_referencia": serie_visivel[-1]["casos"],
                "mes_acao_recomendado": mes_recomendado,
                "mes_ruptura_prevista": mes_ruptura,
                "antecedencia_operacional_dias": antecedencia_operacional_dias,
            },
        })

        if dias_hoje < pior_dias:
            pior_dias = dias_hoje
            pior_item = {
                "item": item["item"],
                "dias_restantes": dias_hoje,
                "quantidade_restante": round(quantidade_pos_corte, 1),
                "preco_unitario": round(float(item["preco_unitario"]), 2),
                "economia_estimada": economia_estimada,
                "mes_recomendado": mes_recomendado,
                "mes_ruptura": mes_ruptura,
                "dias_recomendacao": dias_recomendacao,
                "dias_ruptura": dias_ruptura,
                "consumo_previsto_dia": round(consumo_dia_atual, 2),
                "custo_planejado": custo_planejado,
                "custo_emergencial": custo_emergencial,
                "antecedencia_operacional_dias": antecedencia_operacional_dias,
            }

    resumo_itens.sort(key=lambda row: (row["dias_restantes"], row["item"]))

    if pior_item is not None:
        if pior_item["mes_recomendado"] is not None:
            marcos["etp_recomendado_em"] = pior_item["mes_recomendado"]
            marcos["mes_acao_recomendado"] = pior_item["mes_recomendado"]
        if pior_item["mes_ruptura"] is not None:
            marcos["ruptura_estimada_em"] = pior_item["mes_ruptura"]
            marcos["mes_ruptura_prevista"] = pior_item["mes_ruptura"]
            marcos["antecedencia_operacional_dias"] = pior_item.get("antecedencia_operacional_dias")
        marcos["economia_estimada"] = pior_item["economia_estimada"]
        marcos["quantidade_planejada"] = round(pior_item["consumo_previsto_dia"] * janela_planejamento_dias, 1)
        marcos["custo_planejado"] = pior_item["custo_planejado"]
        marcos["custo_emergencial"] = pior_item["custo_emergencial"]

    return resumo_itens, marcos


def _montar_alertas(crescimento_pct: float | None, previsao: list[dict], itens: list[dict], premissas: dict) -> list[dict]:
    alertas = []
    limiar_crescimento = float(premissas["limiar_surto_crescimento_pct"])
    limiar_multiplo = float(premissas["limiar_surto_previsao_multiplo"])

    if crescimento_pct is not None and crescimento_pct >= limiar_crescimento:
        alertas.append({
            "id": "demo-surto-dengue",
            "tipo": "surto",
            "severidade": "alta" if crescimento_pct >= 60 else "media",
            "status": "novo",
            "titulo": "Surto de dengue em aceleração",
            "descricao": f"Crescimento mensal de {crescimento_pct:.1f}% no último corte visível.",
            "item_ou_condicao": "dengue",
            "evidencia": {
                "crescimento_pct": crescimento_pct,
                "previsao_proximo_mes": previsao[0]["casos_previstos"] if previsao else None,
            },
        })

    if previsao:
        atual = previsao[0]["casos_previstos"]
        ultimo_visivel = itens[0]["evidencia"]["casos_referencia"] if itens else None
        if ultimo_visivel and atual / max(ultimo_visivel, 1) >= limiar_multiplo:
            alertas.append({
                "id": "demo-surto-previsao",
                "tipo": "surto",
                "severidade": "alta",
                "status": "novo",
                "titulo": "Previsão aponta pico crescente",
                "descricao": f"Previsão do próximo mês chega a {atual} casos.",
                "item_ou_condicao": "dengue",
                "evidencia": {
                    "multiplo_previsto": round(atual / max(ultimo_visivel, 1), 2),
                    "casos_previstos": atual,
                },
            })

    for item in itens:
        if item["dias_restantes"] <= 60:
            alertas.append({
                "id": f"demo-ruptura-{item['item'].lower().replace(' ', '-')}",
                "tipo": "ruptura",
                "severidade": "alta" if item["dias_restantes"] <= 30 else "media",
                "status": "novo",
                "titulo": f"Risco de ruptura: {item['item']}",
                "descricao": f"Cobertura estimada de {item['dias_restantes']:.1f} dias.",
                "item_ou_condicao": item["item"],
                "evidencia": {
                    "dias_restantes": item["dias_restantes"],
                    "consumo_previsto_dia": item["consumo_previsto_dia"],
                    "estoque_demo": True,
                },
            })

    return alertas


def _briefing_susbot(status: str, crescimento_pct: float | None, item_critico: dict | None, prova_valor: dict) -> list[str]:
    linhas = []
    if crescimento_pct is None:
        linhas.append("O replay ainda esta em fase inicial e a tendencia epidemiologica segue sem sinal forte.")
    else:
        linhas.append(f"A dengue entrou em tendencia de alta de {crescimento_pct:.1f}% no ultimo corte visivel.")

    if item_critico is not None:
        linhas.append(
            f"{item_critico['item']} e o insumo mais sensivel, com {item_critico['dias_restantes']:.1f} dias de cobertura."
        )
    else:
        linhas.append("Ainda nao ha item critico na simulacao de estoque demo.")

    if prova_valor["etp_recomendado_em"] is not None:
        trecho_custo = ""
        if prova_valor.get("custo_planejado") is not None and prova_valor.get("custo_emergencial") is not None:
            trecho_custo = (
                f" Compra planejada: {_formatar_moeda(float(prova_valor['custo_planejado']))}"
                f" vs. emergencial: {_formatar_moeda(float(prova_valor['custo_emergencial']))}."
            )
        linhas.append(
            f"Recomendamos abrir o ETP em {prova_valor['etp_recomendado_em']} para ganhar {prova_valor['antecedencia_operacional_dias']} dias antes da ruptura.{trecho_custo}"
        )
    else:
        linhas.append("O sistema segue monitorando a curva e o estoque demo antes de acionar o ETP.")

    linhas.append("Casos historicos sao reais; estoque e precos sao cenário demo fictício.")
    return linhas[:4]


def calcular_replay(cutoff: str) -> dict:
    """Calcula o payload da demo para um corte mensal YYYY-MM."""

    dataset = carregar_dataset()
    _parse_mes(cutoff)
    cortes = listar_cortes(cutoff)
    serie = dataset["serie_mensal"]
    meses_disponiveis = [row["mes"] for row in serie]
    if cutoff not in meses_disponiveis:
        raise ValueError(f"cutoff fora do intervalo da demo: {cutoff}")

    indice_corte = meses_disponiveis.index(cutoff)
    serie_visivel = serie[: indice_corte + 1]
    serie_futura_real = serie[indice_corte + 1 :]

    crescimento_pct = _crescimento_pct(serie_visivel[-1]["casos"], serie_visivel[-2]["casos"] if len(serie_visivel) >= 2 else None)
    previsao = _prever_meses(serie_visivel, dataset["premissas"]["janela_previsao_meses"])
    insumos, prova_valor = _simular_estoque(
        dataset["estoque_demo"],
        serie_visivel,
        previsao,
        dataset["premissas"],
    )

    status = "estavel"
    if crescimento_pct is not None and crescimento_pct >= dataset["premissas"]["limiar_surto_crescimento_pct"]:
        status = "atencao"
    if any(item["dias_restantes"] <= dataset["premissas"]["limiar_ruptura_critica_dias"] for item in insumos):
        status = "critico"
    elif any(item["dias_restantes"] <= dataset["premissas"]["limiar_ruptura_atencao_dias"] for item in insumos):
        status = "atencao"

    alertas = _montar_alertas(crescimento_pct, previsao, insumos, dataset["premissas"])
    item_critico = insumos[0] if insumos else None
    briefing = _briefing_susbot(status, crescimento_pct, item_critico, prova_valor)

    serie_visivel_payload = []
    for idx, row in enumerate(serie_visivel):
        serie_visivel_payload.append({
            "mes": row["mes"],
            "casos": row["casos"],
            "tipo": "real",
            "crescimento_pct": _crescimento_pct(row["casos"], serie_visivel[idx - 1]["casos"] if idx > 0 else None),
        })

    serie_futura_payload = [{
        "mes": row["mes"],
        "casos": row["casos"],
        "tipo": "real_oculto",
    } for row in serie_futura_real]

    return {
        "demo": True,
        "scenario_id": dataset["scenario_id"],
        "status_dataset": dataset["status_dataset"],
        "cutoff": cutoff,
        "meta": {
            "municipio": dataset["municipio"],
            "uf": dataset["uf"],
            "ibge6": dataset["ibge6"],
            "fonte": dataset["fonte"],
            "fonte_url": dataset.get("fonte_url"),
            "periodo": dataset["periodo"],
            "extraido_em": dataset["extraido_em"],
            "observacoes": dataset["observacoes"],
            "status_dataset": dataset["status_dataset"],
            "cortes": {
                "mes_inicial": cortes["mes_inicial"],
                "mes_final": cortes["mes_final"],
                "indice_atual": cortes["indice_atual"],
            },
        },
        "status": status,
        "epidemiologia": {
            "casos_ultimo_mes": serie_visivel[-1]["casos"],
            "crescimento_pct": crescimento_pct,
            "previsao_proximo_mes": previsao[0]["casos_previstos"] if previsao else None,
            "limiares": {
                "crescimento_pct": dataset["premissas"]["limiar_surto_crescimento_pct"],
                "multiplo_previsao": dataset["premissas"]["limiar_surto_previsao_multiplo"],
            },
        },
        "serie_visivel": serie_visivel_payload,
        "serie_futura_real": serie_futura_payload,
        "previsao": previsao,
        "insumos": insumos,
        "alertas": alertas,
        "prova_valor": prova_valor,
        "susbot_briefing": briefing,
    }
