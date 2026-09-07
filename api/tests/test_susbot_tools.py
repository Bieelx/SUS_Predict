import importlib
import os
import tempfile

import pytest


@pytest.fixture()
def db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)

    from api.core import db as db_module

    importlib.reload(db_module)
    db_module.init_db()
    yield db_module

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def test_consultar_estoque_retorna_dias_restantes(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("3550308")
    tools = criar_susbot_tools("3550308")

    resultado = tools["consultar_estoque"](item="Soro fisiológico 1L")

    assert resultado["encontrado"] is True
    assert resultado["ibge6"] == "355030"
    assert resultado["total_itens"] == 1
    assert resultado["dados"][0]["item"] == "Soro fisiológico 1L"
    assert resultado["dados"][0]["dias_restantes"] > 0
    assert resultado["dados"][0]["status"] in {"critico", "alerta", "ok"}
    qualidade = resultado["dados"][0]["qualidade"]
    assert qualidade["tipo_calculo"] == "cobertura_estoque"
    assert qualidade["fonte"] == "Estoque local informado pelo município"
    assert qualidade["competencia"]
    assert qualidade["confianca"] in {"moderada", "reduzida"}
    assert "protocolo caso→insumo ainda não validado pela equipe de dados/domínio" in qualidade["limitacoes"]


def test_consultar_estoque_bloqueia_calculo_sem_consumo_local(db):
    from api.core.susbot_tools import criar_susbot_tools

    db.upsert_estoque([{
        "ibge6": "355030",
        "item": "Item sem consumo",
        "quantidade_atual": 100.0,
        "consumo_medio_dia": 0.0,
        "atualizado_em": "2026-08-11T00:00:00Z",
    }])
    resultado = criar_susbot_tools("3550308")["consultar_estoque"](item="Item sem consumo")

    dado = resultado["dados"][0]
    assert dado["dias_restantes"] is None
    assert dado["status"] == "indisponivel"
    assert dado["qualidade"]["confianca"] == "indisponível"
    assert "consumo médio local" in dado["qualidade"]["entradas_faltantes"]

    etp = criar_susbot_tools("3550308")["gerar_etp"](item="Item sem consumo")
    assert etp["encontrado"] is False
    assert "Cálculo indisponível" in etp["motivo"]


def test_consultar_estoque_aceita_nome_parcial(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("3550308")
    tools = criar_susbot_tools("3550308")

    resultado = tools["consultar_estoque"](item="dipirona")

    assert resultado["encontrado"] is True
    assert resultado["dados"][0]["item"] == "Dipirona 500mg"


def test_consultar_estoque_filtra_itens_em_risco(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("351300")
    resultado = criar_susbot_tools("351300")["consultar_estoque"](somente_risco=True)

    assert resultado["encontrado"] is True
    assert resultado["somente_risco"] is True
    assert resultado["dados"]
    assert all(item["status"] in {"critico", "alerta"} for item in resultado["dados"])


def test_gerar_etp_aceita_nome_parcial_e_move_alerta(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("3550308")
    tools = criar_susbot_tools("3550308")

    alerta_id = "alerta-teste-1"
    db.insert_alertas([{
        "id": alerta_id, "ibge6": "355030", "tipo": "ruptura",
        "item_ou_condicao": "Dipirona 500mg", "severidade": "alta",
        "status": "novo", "descricao": "Ruptura iminente",
    }])

    resultado = tools["gerar_etp"](item="dipirona", alerta_id=alerta_id)

    assert resultado["encontrado"] is True
    assert resultado["item"] == "dipirona"
    assert resultado["etp_id"]
    etp = db.get_etp(resultado["etp_id"])
    assert etp["item"] == "dipirona"
    assert "Dipirona 500mg" in etp["justificativa"]

    alertas = db.get_alertas("355030", status="em_andamento")
    assert any(a["id"] == alerta_id for a in alertas)


def test_consultar_alertas_vazio_retorna_motivo(db):
    from api.core.susbot_tools import criar_susbot_tools

    tools = criar_susbot_tools("3550308")

    resultado = tools["consultar_alertas"](status="novo")

    assert resultado["encontrado"] is False
    assert resultado["ibge6"] == "355030"
    assert "motivo" in resultado
    assert resultado["dados"] == []


def _fake_supabase(monkeypatch, tabelas):
    from api.core import susbot_tools

    chamadas = []

    def fake_select(table, eq=None, order=None, limit=None):
        chamadas.append({"table": table, "eq": eq, "order": order, "limit": limit})
        return tabelas.get(table, [])

    monkeypatch.setattr(susbot_tools.db, "supabase_configured", lambda: True)
    monkeypatch.setattr(susbot_tools.db, "sb_select", fake_select)
    return chamadas


def test_consultar_epidemiologia_sinan_le_tabelas_curadas_do_supabase(db, monkeypatch):
    from api.core.susbot_tools import criar_susbot_tools

    chamadas = _fake_supabase(monkeypatch, {
        "sinan_dengue_municipios_total_casos": [
            {"id": 1, "cod_ibge_municipio": "355030", "periodo": "3 Anos", "casos_atual": 1030, "variacao_pct": 12.5},
        ],
        "sinan_dengue_municipios_incidencia": [{"incidencia_atual": 355.79}],
        "sinan_dengue_municipios_desfecho_clinico_anual": [
            {"ano_referencia": 2024, "casos_leves": 900, "hospitalizacoes": 100, "obitos": 3},
            {"ano_referencia": 2025, "casos_leves": 20, "hospitalizacoes": 7, "obitos": 0},
        ],
    })

    resultado = criar_susbot_tools("3550308")["consultar_epidemiologia"]("sinan", ano_ini=2023, ano_fim=2025)

    assert resultado["encontrado"] is True
    assert resultado["sistema"] == "SINAN"
    assert resultado["granularidade"] == "municipal"
    assert resultado["periodo"] == "3 Anos"
    assert resultado["ano_ini"] == 2023 and resultado["ano_fim"] == 2025
    assert resultado["dados"]["stats"]["casos_atual"] == 1030
    assert resultado["dados"]["stats"]["incidencia_atual"] == 355.79
    assert "cod_ibge_municipio" not in resultado["dados"]["stats"]
    assert resultado["dados"]["serie_temporal"] == [
        {"ano": 2024, "total": 1003, "tipo": "real"},
        {"ano": 2025, "total": 27, "tipo": "real"},
    ]
    # Município, janela e ano vão dentro da query, sem limite.
    assert all(c["limit"] is None for c in chamadas)
    assert all(c["eq"]["cod_ibge_municipio"] == "355030" for c in chamadas)
    anual = next(c for c in chamadas if c["table"] == "sinan_dengue_municipios_desfecho_clinico_anual")
    assert anual["eq"] == {"cod_ibge_municipio": "355030", "ano_referencia__gte": 2023, "ano_referencia__lte": 2025}
    assert all(c["eq"]["periodo"] == "3 Anos" for c in chamadas if c["table"] != anual["table"])


def test_consultar_epidemiologia_sih_responde_consolidado_estadual(db, monkeypatch):
    from api.core.susbot_tools import criar_susbot_tools

    chamadas = _fake_supabase(monkeypatch, {
        "sih_dengue_interacoes_periodo": [{"cnes": "TODOS", "periodo": "12 Meses", "internacoes_atual": 30}],
        "sih_dengue_permanencia_media_periodo": [{"cnes": "TODOS", "permanencia_media_atual": 2.5}],
    })

    resultado = criar_susbot_tools("3550308")["consultar_epidemiologia"]("SIH", escopo_solicitado="uti")

    assert resultado["encontrado"] is True
    assert resultado["granularidade"] == "estadual"
    assert resultado["escopo_solicitado"] == "uti"
    assert resultado["dados"]["stats"]["internacoes_atual"] == 30
    assert resultado["dados"]["stats"]["permanencia_media_atual"] == 2.5
    assert "Estado de SP" in resultado["dados"]["stats"]["abrangencia"]
    assert all(c["eq"] == {"periodo": "12 Meses", "cnes": "TODOS"} for c in chamadas)


def test_consultar_epidemiologia_distingue_base_ausente_de_total_zero(db, monkeypatch):
    from api.core.susbot_tools import criar_susbot_tools

    _fake_supabase(monkeypatch, {})
    resultado = criar_susbot_tools("351300")["consultar_epidemiologia"]("SINAN")

    assert resultado["encontrado"] is False
    assert resultado["base_disponivel"] is False
    assert "não significa que o total seja zero" in resultado["motivo"]
    assert "Epidemiologia" in resultado["acao_sugerida"]


def test_consultar_epidemiologia_sem_supabase_ou_sem_tabela_curada(db, monkeypatch):
    from api.core import susbot_tools
    from api.core.susbot_tools import criar_susbot_tools

    monkeypatch.setattr(susbot_tools.db, "supabase_configured", lambda: False)
    monkeypatch.setattr(susbot_tools.db, "sb_select", lambda *a, **kw: pytest.fail("não deve consultar"))
    tools = criar_susbot_tools("3550308")

    sem_fonte = tools["consultar_epidemiologia"]("SINAN")
    assert sem_fonte["encontrado"] is False and "Supabase" in sem_fonte["motivo"]

    sem_tabela = tools["consultar_epidemiologia"]("SIM")
    assert sem_tabela["encontrado"] is False and "SIM" in sem_tabela["motivo"]

    outra_doenca = tools["consultar_epidemiologia"]("SINAN", doenca_cod="A15")
    assert outra_doenca["encontrado"] is False and "dengue" in outra_doenca["motivo"]


def test_janela_curada():
    from api.core.susbot_tools import _janela_curada

    assert _janela_curada(None, None) == "12 Meses"
    assert _janela_curada(2025, 2025) == "12 Meses"
    assert _janela_curada(2023, 2025) == "3 Anos"
    assert _janela_curada(2020, 2025) == "5 Anos"
    assert _janela_curada(2024, None) == "12 Meses"


def test_estoque_e_etp_sem_fonte_conectada_explicam_ausencia(db):
    from api.core.susbot_tools import criar_susbot_tools

    tools = criar_susbot_tools("3550308")

    estoque = tools["consultar_estoque"](item="dipirona")
    assert estoque["encontrado"] is False
    assert estoque["base_disponivel"] is False
    assert "estoque físico" in estoque["motivo"]
    assert "não é estoque" in estoque["motivo"]
    assert "ainda não foi carregada" not in estoque["motivo"]

    etp = tools["gerar_etp"](item="dipirona")
    assert etp["encontrado"] is False
    assert etp["base_disponivel"] is False
    assert "estoque físico" in etp["motivo"]
    assert "dimensionar compra" in etp["motivo"]


def test_estoque_com_fonte_mas_item_inexistente(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("3550308")
    resultado = criar_susbot_tools("3550308")["consultar_estoque"](item="item-que-nao-existe")

    assert resultado["encontrado"] is False
    assert resultado["base_disponivel"] is True
    assert "nenhum item com nome contendo" in resultado["motivo"]


def test_executar_sql_fallback_respeita_guard(db):
    from api.core.susbot_tools import criar_susbot_tools

    db.upsert_estoque([
        {
            "ibge6": "355030",
            "item": "Soro Fisiologico 1L",
            "quantidade_atual": 100.0,
            "consumo_medio_dia": 10.0,
            "atualizado_em": "2026-07-13T00:00:00Z",
        }
    ])

    tools = criar_susbot_tools("3550308")

    ok = tools["executar_sql_fallback"]("SELECT item, quantidade_atual FROM estoque WHERE ibge6 = '355030'")
    assert ok["encontrado"] is True
    assert ok["colunas"] == ["item", "quantidade_atual"]
    assert ok["total_linhas"] == 1
    assert ok["dados"][0]["item"] == "Soro Fisiologico 1L"

    bloqueado = tools["executar_sql_fallback"]("SELECT * FROM susbot_conversas")
    assert bloqueado["encontrado"] is False
    assert "allowlist" in bloqueado["motivo"].lower() or "não permitida" in bloqueado["motivo"].lower()
