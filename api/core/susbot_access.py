"""Protecao adicional para a exposicao publica do endpoint do SusBot."""

from __future__ import annotations

import hmac
import logging
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request


log = logging.getLogger("sus_predict.susbot_access")
_acessos: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()
_aviso_protecao_desativada_emitido = False


def _chaves_configuradas() -> tuple[str, ...]:
    return tuple(chave.strip() for chave in os.getenv("SUSBOT_API_KEYS", "").split(",") if chave.strip())


def avisar_se_protecao_desativada() -> None:
    """Registra uma vez por processo quando a camada adicional esta desativada."""

    global _aviso_protecao_desativada_emitido
    if _chaves_configuradas() or _aviso_protecao_desativada_emitido:
        return
    log.warning(
        "ATENCAO: protecao por chave do SusBot DESATIVADA porque "
        "SUSBOT_API_KEYS esta vazia. Use apenas em desenvolvimento local."
    )
    _aviso_protecao_desativada_emitido = True


def verificar_acesso_susbot(
    request: Request,
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> str:
    """Exige chave apenas quando a lista foi configurada e limita por pessoa."""

    chaves = _chaves_configuradas()
    if chaves and not any(hmac.compare_digest(x_api_key or "", chave) for chave in chaves):
        raise HTTPException(status_code=401, detail="Chave do SusBot invalida")

    identidade = x_api_key or (request.client.host if request.client else "local")
    limite = max(1, int(os.getenv("SUSBOT_RATE_LIMIT_PER_MINUTE") or "10"))
    agora = time.monotonic()
    with _lock:
        janela = _acessos[identidade]
        while janela and agora - janela[0] >= 60:
            janela.popleft()
        if len(janela) >= limite:
            raise HTTPException(status_code=429, detail="Limite do SusBot atingido. Aguarde um minuto.")
        janela.append(agora)
    return identidade
