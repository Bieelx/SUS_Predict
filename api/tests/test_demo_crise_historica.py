from __future__ import annotations

import pytest

from api.core.demo_crise_historica import calcular_replay, carregar_dataset, listar_cortes, _simular_estoque


def test_loader_e_idempotente_e_ordenado():
    primeiro = carregar_dataset()
    segundo = carregar_dataset()

    assert primeiro == segundo
    meses = [row["mes"] for row in primeiro["serie_mensal"]]
    assert meses == sorted(meses)
    assert len(meses) == len(set(meses))
    assert primeiro["status_dataset"] == "validado"
    assert sum(row["casos"] for row in primeiro["serie_mensal"]) == 121473
    assert primeiro["serie_mensal"][0] == {"mes": "2024-01", "casos": 3973}
    assert primeiro["serie_mensal"][-1] == {"mes": "2024-12", "casos": 343}
    assert primeiro["estoque_demo"][0]["quantidade_inicial"] == 170000.0
    assert primeiro["estoque_demo"][1]["quantidade_inicial"] == 155000.0
    assert all(item["estoque_demo"] for item in primeiro["estoque_demo"])


def test_listar_cortes_expoe_indice_atual():
    cortes = listar_cortes("2024-03")

    assert cortes["mes_inicial"] == "2024-01"
    assert cortes["mes_final"] == "2024-12"
    assert cortes["indice_atual"] == 2
    assert cortes["cortes"][2] == {"mes": "2024-03", "indice": 2}


def test_cutoff_invalido_retorna_erro_controlado():
    with pytest.raises(ValueError, match="cutoff"):
        calcular_replay("2024-13")

    with pytest.raises(ValueError, match="fora do intervalo"):
        calcular_replay("2025-01")


def test_cutoff_marca_apenas_meses_visiveis():
    payload = calcular_replay("2024-03")

    assert [row["mes"] for row in payload["serie_visivel"]] == ["2024-01", "2024-02", "2024-03"]
    assert payload["serie_futura_real"][0]["mes"] == "2024-04"
    assert payload["meta"]["cortes"]["indice_atual"] == 2


def test_replay_muda_com_o_cutoff_sem_usar_futuro():
    mar = calcular_replay("2024-03")
    jul = calcular_replay("2024-07")

    assert mar["epidemiologia"]["casos_ultimo_mes"] == 28156
    assert jul["epidemiologia"]["casos_ultimo_mes"] == 1988
    assert len(mar["serie_visivel"]) == 3
    assert len(jul["serie_visivel"]) == 7
    assert mar["previsao"][0]["mes"] == "2024-04"
    assert jul["previsao"][0]["mes"] == "2024-08"


def test_alertas_e_prova_de_valor_no_corte_de_risco():
    payload = calcular_replay("2024-05")

    assert payload["status"] == "critico"
    assert {alerta["tipo"] for alerta in payload["alertas"]} == {"ruptura"}
    assert payload["prova_valor"]["etp_recomendado_em"] == "2024-05"
    assert payload["prova_valor"]["mes_acao_recomendado"] == "2024-05"
    assert payload["prova_valor"]["mes_ruptura_prevista"] == "2024-05"
    assert payload["prova_valor"]["antecedencia_operacional_dias"] == 6
    assert payload["prova_valor"]["percentual_emergencial"] == 35.0
    assert payload["prova_valor"]["custo_emergencial"] > payload["prova_valor"]["custo_planejado"]
    assert payload["prova_valor"]["economia_estimada"] > 0


def test_insumos_ordenados_por_menor_cobertura():
    payload = calcular_replay("2024-05")

    dias = [item["dias_restantes"] for item in payload["insumos"]]
    assert dias == sorted(dias)
    assert payload["insumos"][0]["estoque_demo"] is True
    assert payload["susbot_briefing"][-1] == "Casos historicos sao reais; estoque e precos sao cenário demo fictício."


def test_simulacao_usa_premissas_do_dataset():
    serie_visivel = [{"mes": "2024-01", "casos": 1000}]
    previsao = [{"mes": "2024-02", "casos_previstos": 1000, "lower": 800, "upper": 1200, "tipo": "previsto"}]
    estoque_demo = [{
        "item": "Teste",
        "unidade": "un",
        "quantidade_inicial": 1500,
        "consumo_base_por_caso": 1,
        "consumo_basal_diario": 0,
        "preco_unitario": 10,
        "estoque_demo": True,
    }]

    premissas_criticas = {
        "dias_por_mes": 30,
        "limiar_ruptura_atencao_dias": 40,
        "limiar_ruptura_critica_dias": 20,
        "multiplicador_compra_emergencial": 1.5,
        "limiar_surto_crescimento_pct": 30,
        "limiar_surto_previsao_multiplo": 1.5,
    }
    itens, prova = _simular_estoque(estoque_demo, serie_visivel, previsao, premissas_criticas)
    assert itens[0]["status"] == "critico"
    assert itens[0]["custo_emergencial"] == pytest.approx(itens[0]["custo_planejado"] * 1.5)
    assert prova["percentual_emergencial"] == 50.0
    assert prova["etp_recomendado_em"] == "2024-01"
    assert prova["antecedencia_operacional_dias"] == 15

    premissas_suaves = {
        **premissas_criticas,
        "limiar_ruptura_atencao_dias": 10,
        "limiar_ruptura_critica_dias": 5,
        "multiplicador_compra_emergencial": 2.0,
    }
    estoque_demo_suave = [{
        **estoque_demo[0],
        "quantidade_inicial": 3000,
    }]
    itens_suaves, prova_suave = _simular_estoque(estoque_demo_suave, serie_visivel, previsao, premissas_suaves)
    assert itens_suaves[0]["status"] == "ok"
    assert itens_suaves[0]["custo_emergencial"] == pytest.approx(itens_suaves[0]["custo_planejado"] * 2.0)
    assert prova_suave["percentual_emergencial"] == 100.0
    assert prova_suave["etp_recomendado_em"] is None
