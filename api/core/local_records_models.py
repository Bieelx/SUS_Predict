"""Contrato público dos registros locais. Identidade/canal nunca vêm da IA."""
from datetime import date
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegistroValores(StrictModel):
    periodo_inicio: date | None = None
    periodo_fim: date | None = None
    valor: Decimal | None = Field(default=None, ge=0, le=1000000000, allow_inf_nan=False)
    dimensoes: dict[str, Any] = Field(default_factory=dict)

    @field_validator("dimensoes")
    @classmethod
    def dimensoes_limitadas(cls, value):
        if len(value) > 12 or any(not isinstance(v, (str, int, float, bool)) or
                                  isinstance(v, str) and len(v) > 200 for v in value.values()):
            raise ValueError("Dimensões devem conter valores simples, com até 200 caracteres.")
        return value


class ItemProposto(RegistroValores):
    indicador: str = Field(min_length=1, max_length=80)


class RelatoRequest(StrictModel):
    unidade_id: UUID
    texto: str = Field(min_length=1, max_length=8000)
    chave_idempotencia: str = Field(min_length=8, max_length=120)
    conversa_id: str | None = Field(default=None, max_length=100)


class EditarRequest(RegistroValores):
    versao_esperada: int = Field(ge=1)
    chave_idempotencia: str = Field(min_length=8, max_length=120)
    motivo: str = Field(default="", max_length=1000)


class AcaoRequest(RegistroValores):
    versao_esperada: int = Field(ge=1)
    chave_idempotencia: str = Field(min_length=8, max_length=120)
    motivo: str = Field(default="", max_length=1000)


class UnidadeRequest(StrictModel):
    nome: str = Field(min_length=2, max_length=200)
    cnes: str | None = Field(default=None, pattern=r"^[0-9]{7}$")
    ibge6: str = Field(pattern=r"^[0-9]{6}$")
    uf: Literal["SP"] = "SP"
    tipo_unidade: str = Field(default="UBS", max_length=50)


class VinculoRequest(StrictModel):
    usuario: str = Field(min_length=1, max_length=200)
    papel: Literal["registrador", "revisor", "gestor_unidade"]
    ativo: bool = True
