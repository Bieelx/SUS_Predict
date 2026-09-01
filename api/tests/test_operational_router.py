from fastapi import HTTPException
import pytest

from api.core import operational_router as operational


MUNICIPIO = {
    "cod_ibge_completo": "3513009",
    "nome_municipio": "Cotia",
}


def _fake_select_factory(tabelas):
    chamadas = []

    def fake_select(table, eq=None, order=None, limit=None):
        chamadas.append({"table": table, "eq": eq, "order": order, "limit": limit})
        if table == "ibge_sp":
            return [MUNICIPIO]
        return tabelas.get(table, [])

    return fake_select, chamadas


def test_epidemiologia_consolida_tabelas_reais_sem_escrita(monkeypatch):
    fake_select, chamadas = _fake_select_factory({
        "sinan_dengue_municipios_total_casos": [{"casos_atual": 1030, "data_referencia": "2026-06-28"}],
        "sinan_dengue_municipios_incidencia": [{"incidencia_atual": 355.79}],
    })
    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.epidemiologia("351300", "12 Meses", {})

    assert resposta["meta"]["dados_reais"] is True
    assert resposta["municipio"]["ibge7"] == "3513009"
    assert resposta["casos"]["casos_atual"] == 1030
    assert resposta["incidencia"]["incidencia_atual"] == 355.79
    assert all(chamada["table"].startswith("sinan_") or chamada["table"] == "ibge_sp" for chamada in chamadas)


def test_visao_geral_estadual_usa_tabelas_documentadas(monkeypatch):
    fake_select, chamadas = _fake_select_factory({
        "visao_geral_kpis_atuais": [{"cod_ibge_completo": "TODOS", "casos_notificados": 3847}],
        "visao_geral_kpis_serie": [{"competencia": "2025-12-01", "casos_notificados": 3847}],
        "visao_geral_risco_agregado": [{"indice_risco_regional": 38.2}],
    })
    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.visao_geral("TODOS", "Mes", {})

    assert resposta["municipio"]["ibge7"] == "TODOS"
    assert resposta["kpis"]["casos_notificados"] == 3847
    assert resposta["risco"]["indice_risco_regional"] == 38.2
    assert any(chamada["table"] == "visao_geral_kpis_atuais" for chamada in chamadas)


def test_vacinacao_explica_escopo_estadual_e_nao_causal(monkeypatch):
    fake_select, _ = _fake_select_factory({
        "vacinacao_dengue_municipios": [{"doses_aplicadas": 156}],
        "vacinacao_x_sih_dengue": [{"internacoes_atual": 40, "possui_amostragem_suficiente": False}],
    })
    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.vacinacao("3513009", "12 Meses", {})

    assert resposta["doses"]["doses_aplicadas"] == 156
    assert resposta["hospitalar_estadual"]["possui_amostragem_suficiente"] is False
    assert any("estadual" in texto for texto in resposta["limitacoes"])
    assert any("causalidade" in texto for texto in resposta["limitacoes"])


def test_internacoes_filtra_indicadores_por_estabelecimento(monkeypatch):
    fake_select, _ = _fake_select_factory({
        "sih_dengue_interacoes_periodo": [
            {"cnes": "TODOS", "internacoes_atual": 30},
            {"cnes": "123", "razao_social": "Hospital Teste", "internacoes_atual": 7},
        ],
        "sih_dengue_permanencia_media_periodo": [{"cnes": "123", "permanencia_media_atual": 2.5}],
        "sih_dengue_taxa_mortalidade_periodo": [{"cnes": "123", "taxa_mortalidade": 1.2}],
    })
    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.internacoes("12 Meses", "123", {})

    assert resposta["cnes"] == "123"
    assert resposta["consolidado"]["internacoes_atual"] == 7
    assert resposta["permanencia"]["permanencia_media_atual"] == 2.5
    assert resposta["mortalidade"]["taxa_mortalidade"] == 1.2
    assert resposta["estabelecimentos"] == [{"cnes": "123", "razao_social": "Hospital Teste"}]


def test_epidemiologia_inclui_previsao_mensal_de_90_dias(monkeypatch):
    sazonal = []
    for year in range(2022, 2025):
        for month in range(1, 13):
            sazonal.append({
                "mes_ano": f"{year}-{month:02d}-01T00:00:00",
                "casos_atual": month * 3 + (year - 2022),
                "periodo": "5 Anos",
                "data_referencia": "2025-01-15",
            })

    def fake_select(table, eq=None, order=None, limit=None):
        if table == "ibge_sp":
            return [MUNICIPIO]
        if table == "sinan_dengue_municipios_sazonalidade":
            return sazonal if eq.get("periodo") == "5 Anos" else sazonal[-11:]
        return []

    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.epidemiologia("351300", "12 Meses", {})
    previsao = resposta["previsao_3_meses"]

    assert previsao["disponivel"] is True
    assert previsao["horizonte_meses"] == 3
    assert len(previsao["serie"]) == 3
    assert previsao["serie"][0]["mes"] == "2025-01-01"
    assert previsao["intervalo_confianca_pct"] == 80
    assert "Holt-Winters" in previsao["modelo"]


def test_ruptura_deduplica_por_insumo_e_unidade_usando_maior_risco(monkeypatch):
    fake_select, _ = _fake_select_factory({
        "ruptura_insumos_alertas_atuais": [
            {"insumo_padronizado": "Soro", "unidade_fornecimento": "bolsa", "pontos_risco_aquisicao": 4},
            {"insumo_padronizado": "Soro", "unidade_fornecimento": "bolsa", "pontos_risco_aquisicao": 9},
            {"insumo_padronizado": "Dipirona", "unidade_fornecimento": "comprimido", "pontos_risco_aquisicao": 6},
        ],
    })
    monkeypatch.setattr(operational, "_select", fake_select)

    resposta = operational.ruptura("351300", "12 Meses", {})

    assert [item["pontos_risco_aquisicao"] for item in resposta["alertas"]] == [9, 6]
    assert resposta["metodologia"]["tipo"] == "risco de aquisição"
    assert "estoque físico" in resposta["metodologia"]["nao_e"]


@pytest.mark.parametrize("valor", ["1 mês", "", "12 meses"])
def test_periodo_invalido_falha_antes_da_consulta(valor):
    with pytest.raises(HTTPException) as exc:
        operational.internacoes(valor, {})
    assert exc.value.status_code == 400
