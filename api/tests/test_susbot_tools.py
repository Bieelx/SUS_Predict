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
    from api.core.susbot_seed import seed_susbot_municipio
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


def test_consultar_estoque_aceita_nome_parcial(db):
    from api.core.susbot_seed import seed_susbot_municipio
    from api.core.susbot_tools import criar_susbot_tools

    seed_susbot_municipio("3550308")
    tools = criar_susbot_tools("3550308")

    resultado = tools["consultar_estoque"](item="dipirona")

    assert resultado["encontrado"] is True
    assert resultado["dados"][0]["item"] == "Dipirona 500mg"


def test_gerar_etp_aceita_nome_parcial_e_move_alerta(db):
    from api.core.susbot_seed import seed_susbot_municipio
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


def test_consultar_epidemiologia_retorna_cache_salvo(db):
    from api.core.susbot_tools import criar_susbot_tools

    db.save_resultado(
        "run-epi-1",
        {
            "meta": {
                "sistema": "SINAN",
                "uf": "SP",
                "cidade": "São Paulo",
                "ibge": "3550308",
                "ano_ini": 2024,
                "ano_fim": 2025,
                "doenca_cod": "A90",
                "gerado_em": "2026-07-14T00:00:00Z",
            },
            "stats": {"total": 10},
            "serie_temporal": [{"ano": 2024, "total": 3, "tipo": "real"}],
            "serie_com_previsao": [{"ano": 2025, "total": 4, "tipo": "previsto"}],
            "distribuicao_sexo": [{"sexo": "Masculino", "pct": 60}],
            "distribuicao_faixa_etaria": [{"faixa": "15–29", "pct": 40}],
            "top_causas": [{"causa": "Dengue", "pct": 50}],
        },
    )

    tools = criar_susbot_tools("3550308")
    resultado = tools["consultar_epidemiologia"]("sinan", ano_ini=2024, ano_fim=2025, doenca_cod="A90")

    assert resultado["encontrado"] is True
    assert resultado["sistema"] == "SINAN"
    assert resultado["ano_ini"] == 2024
    assert resultado["doenca_cod"] == "A90"
    assert resultado["dados"]["stats"]["total"] == 10
    assert resultado["dados"]["top_causas"][0]["causa"] == "Dengue"


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
