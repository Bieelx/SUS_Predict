"""Router HTTP do modo demo: crise histórica de dengue 2024.

Expõe um contrato estável para o frontend consumir o replay temporal sem
depender de jobs, SQLite ou Supabase.
"""

from __future__ import annotations

import copy
from typing import Any

from fastapi import APIRouter, HTTPException

from api.core.demo_crise_historica import calcular_replay, carregar_dataset, listar_cortes

router = APIRouter(prefix="/api/demo/crise-historica", tags=["demo"])

_ESTADO_ALERTAS: dict[tuple[str, str], str] = {}


def _scenario_id() -> str:
    return str(carregar_dataset()["scenario_id"])


def _cutoff_inicial() -> str:
    return str(listar_cortes()["mes_inicial"])


def _overlay_status(payload: dict[str, Any], scenario_id: str) -> dict[str, Any]:
    resultado = copy.deepcopy(payload)
    for alerta in resultado.get("alertas", []):
        status = _ESTADO_ALERTAS.get((scenario_id, str(alerta.get("id"))))
        if status:
            alerta["status"] = status
    return resultado


def _payload(cutoff: str | None = None) -> dict[str, Any]:
    cutoff_final = cutoff or _cutoff_inicial()
    try:
        payload = calcular_replay(cutoff_final)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    scenario_id = str(payload.get("scenario_id") or _scenario_id())
    return _overlay_status(payload, scenario_id)


def limpar_estado_demo(scenario_id: str | None = None) -> None:
    alvo = scenario_id or _scenario_id()
    chaves = [chave for chave in _ESTADO_ALERTAS if chave[0] == alvo]
    for chave in chaves:
        del _ESTADO_ALERTAS[chave]


@router.get("/meta")
def meta() -> dict[str, Any]:
    dataset = carregar_dataset()
    cortes = listar_cortes()
    return {
        "demo": True,
        "scenario_id": dataset["scenario_id"],
        "status_dataset": dataset["status_dataset"],
        "municipio": dataset["municipio"],
        "uf": dataset["uf"],
        "ibge6": dataset["ibge6"],
        "fonte": dataset["fonte"],
        "fonte_url": dataset.get("fonte_url"),
        "periodo": dataset["periodo"],
        "extraido_em": dataset["extraido_em"],
        "observacoes": dataset["observacoes"],
        "estoque_demo": True,
        "cortes": cortes,
        "transparencia": {
            "casos_historicos_reais": True,
            "estoque_e_precos_demo": True,
            "modo_replay_temporal": True,
        },
    }


@router.get("/estado")
def estado(cutoff: str | None = None) -> dict[str, Any]:
    payload = _payload(cutoff)
    payload["demo"] = True
    return payload


@router.post("/reset")
def reset() -> dict[str, Any]:
    limpar_estado_demo()
    return _payload(_cutoff_inicial())


@router.post("/alertas/{alerta_id}/andamento")
def marcar_alerta_em_andamento(alerta_id: str, cutoff: str | None = None) -> dict[str, Any]:
    payload = _payload(cutoff)
    scenario_id = str(payload.get("scenario_id") or _scenario_id())

    alertas = payload.get("alertas", [])
    if not any(str(alerta.get("id")) == alerta_id for alerta in alertas):
        raise HTTPException(status_code=404, detail="alerta não encontrado no corte atual")

    _ESTADO_ALERTAS[(scenario_id, alerta_id)] = "andamento"
    return _payload(cutoff)
