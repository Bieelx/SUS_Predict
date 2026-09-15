"""Worker durável para webhooks de Telegram e WhatsApp."""

from __future__ import annotations

import logging
import os
import threading

from api.core import db

log = logging.getLogger("sus_predict.channel_queue")
_parar = threading.Event()
_acordar = threading.Event()
_thread: threading.Thread | None = None


def enfileirar(tipo: str, external_id: str, payload: dict) -> bool:
    inserido = db.enfileirar_evento_canal(tipo, external_id, payload)
    if inserido:
        _acordar.set()
    return inserido


def processar_proximo() -> bool:
    """Processa um job; retorna False quando a fila não tem item pronto."""

    job = db.reivindicar_evento_canal(
        lease_segundos=int(os.getenv("CHANNEL_QUEUE_LEASE_SECONDS", "300"))
    )
    if not job:
        return False
    try:
        # Import tardio evita ciclo com o router e deixa os testes substituírem adaptadores.
        from api.core.channel_router import processar_evento_whatsapp, processar_update_telegram

        if job["tipo"] == "telegram":
            processar_update_telegram(job["payload"], registrar_evento=False)
        elif job["tipo"] == "whatsapp":
            processar_evento_whatsapp(job["payload"], registrar_evento=False)
        else:
            raise ValueError(f"Tipo de job desconhecido: {job['tipo']}")
    except Exception as exc:  # a fila precisa sobreviver a qualquer adaptador externo
        log.exception("Falha no job de canal %s", job["id"])
        db.falhar_evento_canal(
            job["id"], str(exc), max_tentativas=int(os.getenv("CHANNEL_QUEUE_MAX_ATTEMPTS", "5"))
        )
    else:
        db.concluir_evento_canal(job["id"])
    return True


def _executar() -> None:
    intervalo = max(0.1, float(os.getenv("CHANNEL_QUEUE_POLL_SECONDS", "1")))
    while not _parar.is_set():
        if not processar_proximo():
            _acordar.wait(intervalo)
            _acordar.clear()


def iniciar_worker() -> None:
    global _thread
    if _thread and _thread.is_alive():
        return
    _parar.clear()
    _thread = threading.Thread(target=_executar, name="fila-canais", daemon=True)
    _thread.start()
    log.info("Worker durável dos canais iniciado")


def parar_worker() -> None:
    _parar.set()
    _acordar.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=5)

