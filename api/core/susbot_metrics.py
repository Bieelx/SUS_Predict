"""Métricas locais e anônimas do roteamento da Clara."""

from __future__ import annotations

from collections import Counter
from threading import Lock
from typing import Any


_lock = Lock()
_contadores: Counter[str] = Counter()
_por_modo: Counter[str] = Counter()
_por_intencao: Counter[str] = Counter()


def registrar_execucao(execucao: dict[str, Any]) -> None:
    """Registra apenas contagens; perguntas, respostas e usuários não entram aqui."""

    with _lock:
        _contadores["respostas_total"] += 1
        _contadores["chamadas_planejamento_llm"] += int(bool(execucao.get("llm_planejamento")))
        _contadores["chamadas_resposta_llm"] += int(bool(execucao.get("llm_resposta")))
        if execucao.get("sem_llm"):
            _contadores["respostas_sem_llm"] += 1
        _por_modo[str(execucao.get("modo") or "desconhecido")] += 1
        _por_intencao[str(execucao.get("intencao") or "nao_classificada")] += 1


def obter_metricas() -> dict[str, Any]:
    with _lock:
        total = _contadores["respostas_total"]
        sem_llm = _contadores["respostas_sem_llm"]
        return {
            **dict(_contadores),
            "taxa_respostas_sem_llm": round(sem_llm / total, 4) if total else 0.0,
            "por_modo": dict(_por_modo),
            "por_intencao": dict(_por_intencao),
            "persistencia": "processo_atual",
            "dados_pessoais_coletados": False,
        }


def resetar_metricas() -> None:
    """Utilitário de teste; não exposto pela API."""

    with _lock:
        _contadores.clear()
        _por_modo.clear()
        _por_intencao.clear()
