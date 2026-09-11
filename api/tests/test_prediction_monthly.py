from api.core.prediction import gerar_predicao_mensal
import pytest


def _monthly_series(years=3):
    seasonal = [8, 12, 25, 60, 90, 55, 24, 12, 8, 6, 5, 7]
    rows = []
    for year_offset in range(years):
        for month, base in enumerate(seasonal, start=1):
            rows.append({
                "mes": f"{2022 + year_offset}-{month:02d}-01",
                "total": base + year_offset * 2,
            })
    return rows


def test_previsao_mensal_retorna_tres_meses_com_intervalo():
    forecast, model, diagnostics = gerar_predicao_mensal(_monthly_series(), 3)

    assert [item["mes"] for item in forecast] == [
        "2025-01-01", "2025-02-01", "2025-03-01",
    ]
    assert all(item["limite_inferior"] <= item["casos_previstos"] <= item["limite_superior"] for item in forecast)
    assert all(item["tipo"] == "previsto" for item in forecast)
    assert "Holt-Winters" in model
    assert diagnostics["nivel_intervalo"] == 80
    assert diagnostics["sazonalidade_meses"] == 12


def test_previsao_mensal_preenche_mes_sem_notificacao():
    series = _monthly_series()
    series = [item for item in series if item["mes"] != "2023-09-01"]

    forecast, _, diagnostics = gerar_predicao_mensal(series, 3)

    assert len(forecast) == 3
    assert diagnostics["pontos_treino"] == 36
    assert diagnostics["meses_imputados"] == ["2023-09-01"]


def test_previsao_mensal_curta_usa_fallback():
    forecast, model, diagnostics = gerar_predicao_mensal(_monthly_series(years=1), 3)

    assert len(forecast) == 3
    assert "série mensal curta" in model
    assert diagnostics["sazonalidade_meses"] is None


@pytest.mark.parametrize("horizonte", [1, 6, 12])
def test_previsao_mensal_aceita_horizonte_de_um_a_doze_meses(horizonte):
    forecast, _, _ = gerar_predicao_mensal(_monthly_series(), horizonte)

    assert len(forecast) == horizonte


@pytest.mark.parametrize("horizonte", [0, 13])
def test_previsao_mensal_rejeita_horizonte_fora_do_limite(horizonte):
    with pytest.raises(ValueError, match="entre 1 e 12"):
        gerar_predicao_mensal(_monthly_series(), horizonte)


def test_previsao_mensal_compara_modelo_com_referencia_sazonal():
    _, model, diagnostics = gerar_predicao_mensal(_monthly_series(), 6)

    assert model in {
        "Sazonal ingênuo (referência de 12m)",
        "Holt-Winters aditivo (log1p, sazonalidade 12m)",
    }
    assert diagnostics["criterio_selecao"] == "menor RMSE histórico de um passo"
    assert diagnostics["rmse_holt_winters_log"] >= 0
    assert diagnostics["rmse_sazonal_ingenuo_log"] >= 0
