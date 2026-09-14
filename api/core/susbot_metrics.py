"""Métricas locais e anônimas do roteamento da Clara."""

from __future__ import annotations

from collections import Counter
import json
from pathlib import Path
from threading import Lock
from typing import Any


_lock = Lock()
_contadores: Counter[str] = Counter()
_por_modo: Counter[str] = Counter()
_por_intencao: Counter[str] = Counter()
_fallbacks_por_etapa: Counter[str] = Counter()
_ARQUIVO_AVALIACAO = Path(__file__).resolve().parents[1] / "evals" / "clara_quality_baseline.json"


def _avaliacao_offline() -> dict[str, Any] | None:
    """Carrega o último baseline versionado; falha de leitura não derruba a Clara."""

    try:
        return json.loads(_ARQUIVO_AVALIACAO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def registrar_execucao(execucao: dict[str, Any]) -> None:
    """Registra apenas contagens; perguntas, respostas e usuários não entram aqui."""

    with _lock:
        _contadores["respostas_total"] += 1
        _contadores["chamadas_planejamento_llm"] += int(bool(execucao.get("llm_planejamento")))
        _contadores["chamadas_resposta_llm"] += int(bool(execucao.get("llm_resposta")))
        if execucao.get("sem_llm"):
            _contadores["respostas_sem_llm"] += 1
        if execucao.get("aguardando_confirmacao"):
            _contadores["escritas_bloqueadas_confirmacao"] += 1
        if execucao.get("resposta_reserva"):
            _contadores["respostas_por_template_seguro"] += 1
        _por_modo[str(execucao.get("modo") or "desconhecido")] += 1
        _por_intencao[str(execucao.get("intencao") or "nao_classificada")] += 1


def registrar_falha_fidelidade() -> None:
    """Conta descarte de resposta com número sem guardar seu conteúdo."""

    with _lock:
        _contadores["respostas_descartadas_fidelidade"] += 1


def registrar_fallback_llm(etapa: str) -> None:
    """Conta a troca de provedor, sem registrar prompt, modelo ou usuário."""

    etapa_segura = etapa if etapa in {"planejamento", "completar", "resposta"} else "desconhecida"
    with _lock:
        _contadores["fallbacks_llm"] += 1
        _fallbacks_por_etapa[etapa_segura] += 1


def obter_metricas() -> dict[str, Any]:
    with _lock:
        total = _contadores["respostas_total"]
        sem_llm = _contadores["respostas_sem_llm"]
        return {
            **dict(_contadores),
            "taxa_respostas_sem_llm": round(sem_llm / total, 4) if total else 0.0,
            "por_modo": dict(_por_modo),
            "por_intencao": dict(_por_intencao),
            "fallbacks_por_etapa": dict(_fallbacks_por_etapa),
            "avaliacao_offline": _avaliacao_offline(),
            "persistencia": "processo_atual",
            "dados_pessoais_coletados": False,
        }


def resetar_metricas() -> None:
    """Utilitário de teste; não exposto pela API."""

    with _lock:
        _contadores.clear()
        _por_modo.clear()
        _por_intencao.clear()
        _fallbacks_por_etapa.clear()
