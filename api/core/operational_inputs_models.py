"""Contrato estruturado para inputs operacionais confirmados por uma pessoa."""
from typing import Any

from pydantic import Field

from api.core.local_records_models import StrictModel


class RascunhoOperacionalRequest(StrictModel):
    id_estabelecimento: str = Field(min_length=1, max_length=40)
    texto: str = Field(min_length=1, max_length=4000)
    chave_idempotencia: str = Field(min_length=8, max_length=120)


class ConfirmarOperacionalRequest(StrictModel):
    versao_esperada: int = Field(ge=1)
    chave_idempotencia: str = Field(min_length=8, max_length=120)
    payload: dict[str, Any] | None = None


class RejeitarOperacionalRequest(StrictModel):
    versao_esperada: int = Field(ge=1)
    chave_idempotencia: str = Field(min_length=8, max_length=120)
    motivo: str = Field(default="", max_length=1000)
