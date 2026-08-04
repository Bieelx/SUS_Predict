from __future__ import annotations

import pytest
from fastapi import HTTPException

from api.core import demo_router


@pytest.fixture(autouse=True)
def limpar_estado_demo():
    demo_router.limpar_estado_demo()
    yield
    demo_router.limpar_estado_demo()


def test_meta_expoe_transparencia_e_cortes():
    payload = demo_router.meta()

    assert payload["demo"] is True
    assert payload["scenario_id"] == "demo-crise-historica-dengue-2024-campinas"
    assert payload["status_dataset"] == "validado"
    assert payload["municipio"] == "Campinas"
    assert payload["fonte_url"].endswith("dengue24_mes.csv")
    assert payload["cortes"]["mes_inicial"] == "2024-01"
    assert payload["cortes"]["mes_final"] == "2024-12"
    assert payload["transparencia"]["casos_historicos_reais"] is True
    assert payload["estoque_demo"] is True


def test_estado_default_usa_primeiro_corte():
    payload = demo_router.estado()

    assert payload["demo"] is True
    assert payload["cutoff"] == "2024-01"
    assert payload["scenario_id"] == "demo-crise-historica-dengue-2024-campinas"
    assert payload["status"] == "estavel"
    assert payload["alertas"] == []


def test_marcar_alerta_andamento_e_reset_sao_idempotentes():
    payload_andamento = demo_router.marcar_alerta_em_andamento("demo-ruptura-dipirona-500mg", cutoff="2024-07")

    alerta = next(item for item in payload_andamento["alertas"] if item["id"] == "demo-ruptura-dipirona-500mg")
    assert alerta["status"] == "andamento"

    payload_novamente = demo_router.marcar_alerta_em_andamento("demo-ruptura-dipirona-500mg", cutoff="2024-07")
    alerta_novamente = next(item for item in payload_novamente["alertas"] if item["id"] == "demo-ruptura-dipirona-500mg")
    assert alerta_novamente["status"] == "andamento"

    demo_router.reset()
    payload_reset = demo_router.estado("2024-07")
    alerta_reset = next(item for item in payload_reset["alertas"] if item["id"] == "demo-ruptura-dipirona-500mg")
    assert alerta_reset["status"] == "novo"


def test_alerta_em_andamento_nao_contamina_cutoff_anterior():
    demo_router.marcar_alerta_em_andamento("demo-ruptura-dipirona-500mg", cutoff="2024-07")

    payload_julho = demo_router.estado("2024-07")
    alerta_julho = next(item for item in payload_julho["alertas"] if item["id"] == "demo-ruptura-dipirona-500mg")
    assert alerta_julho["status"] == "andamento"

    payload_junho = demo_router.estado("2024-06")
    alerta_junho = next(item for item in payload_junho["alertas"] if item["id"] == "demo-ruptura-dipirona-500mg")
    assert alerta_junho["status"] == "novo"


def test_estado_cutoff_invalido_retorna_http_400():
    with pytest.raises(HTTPException) as exc:
        demo_router.estado("2024-13")

    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc2:
        demo_router.estado("2025-01")

    assert exc2.value.status_code == 400
