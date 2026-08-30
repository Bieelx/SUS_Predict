"""Protecao adicional para a exposicao publica do endpoint do SusBot."""

from __future__ import annotations

import hmac
import os
import threading
import time
from collections import defaultdict, deque

from fastapi import Header, HTTPException, Request


_acessos: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def _chaves_configuradas() -> tuple[str, ...]:
    return tuple(chave.strip() for chave in os.getenv("SUSBOT_API_KEYS", "").split(",") if chave.strip())


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
