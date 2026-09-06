"""Limite de tentativas em memória, por processo.

Usado nos endpoints de autenticação para conter força bruta de senha e abuso do
envio de código por e-mail. O Supabase (GoTrue) tem limites próprios; isto é a
camada do nosso lado, que também protege quem chega antes do GoTrue.

ponytail: contador em memória, some no restart e não é compartilhado entre
réplicas. Suficiente para uma instância só. Trocar por Redis se um dia o backend
rodar em mais de um processo.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_janelas: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def identidade_requisicao(request: Request | None) -> str:
    """IP de origem, respeitando o proxy da frente (Railway/Cloudflare)."""

    if request is None:
        return "local"
    encaminhado = request.headers.get("x-forwarded-for", "")
    if encaminhado:
        return encaminhado.split(",")[0].strip()
    return request.client.host if request.client else "local"


def limitar(balde: str, identidade: str, limite: int, janela_s: int = 60) -> None:
    """Deixa passar `limite` chamadas por `janela_s`; estourou, levanta 429."""

    chave = f"{balde}:{identidade}"
    agora = time.monotonic()
    with _lock:
        janela = _janelas[chave]
        while janela and agora - janela[0] >= janela_s:
            janela.popleft()
        if len(janela) >= limite:
            raise HTTPException(
                429,
                "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.",
            )
        janela.append(agora)


def limpar() -> None:
    """Zera o estado. Só para testes."""

    with _lock:
        _janelas.clear()
