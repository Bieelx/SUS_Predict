"""API autenticada dos inputs operacionais estruturados pela Clara."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.core.auth import require_user
from api.core.identidade import usuario_referencia
from api.core.local_records_router import service as local_service
from api.core.operational_inputs_models import (
    ConfirmarOperacionalRequest, RascunhoOperacionalRequest, RejeitarOperacionalRequest,
)
from api.core.operational_inputs_service import OperationalInputs

router = APIRouter(prefix="/api/clara/inputs-operacionais", tags=["inputs operacionais"])


def actor(user=Depends(require_user)):
    return usuario_referencia(user)


def service():
    local = local_service()
    return OperationalInputs(local.store, local.access_loader)


@router.get("/estabelecimentos")
def establishments(busca: str = Query(default="", max_length=100), limite: int = Query(default=50, ge=1, le=100),
                   usuario=Depends(actor), svc=Depends(service)):
    return svc.establishments(usuario, busca, limite)


@router.post("/rascunhos", status_code=201)
def create(req: RascunhoOperacionalRequest, usuario=Depends(actor), svc=Depends(service)):
    return svc.create_draft(usuario, req.id_estabelecimento, req.texto, req.chave_idempotencia)


@router.get("/rascunhos")
def listing(status: Literal["rascunho", "confirmado", "rejeitado"] = "rascunho",
            usuario=Depends(actor), svc=Depends(service)):
    return svc.list(usuario, status)


@router.get("/rascunhos/{rascunho_id}")
def detail(rascunho_id: UUID, usuario=Depends(actor), svc=Depends(service)):
    return svc.get(usuario, str(rascunho_id))


@router.post("/rascunhos/{rascunho_id}/confirmar")
def confirm(rascunho_id: UUID, req: ConfirmarOperacionalRequest,
            usuario=Depends(actor), svc=Depends(service)):
    return svc.confirm(usuario, str(rascunho_id), req.versao_esperada, req.chave_idempotencia, req.payload)


@router.post("/rascunhos/{rascunho_id}/rejeitar")
def reject(rascunho_id: UUID, req: RejeitarOperacionalRequest,
           usuario=Depends(actor), svc=Depends(service)):
    return svc.reject(usuario, str(rascunho_id), req.versao_esperada, req.chave_idempotencia, req.motivo)
