"""API autenticada dos registros da unidade, separada de /api/dados oficiais."""
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from api.core.auth import require_user
from api.core.identidade import usuario_referencia
from api.core.permissoes import carregar_acesso_http
from api.core.local_records_models import RelatoRequest, EditarRequest, AcaoRequest, UnidadeRequest, VinculoRequest
from api.core.local_records_service import LocalRecords
from api.core.local_records_store import configured_store
from api.core.local_records_interpreter import interpret

router = APIRouter(prefix="/api/clara/registros-locais", tags=["registros locais"])


def service():
    return LocalRecords(configured_store(), carregar_acesso_http)


def actor(user=Depends(require_user)):
    return usuario_referencia(user)


@router.get("/unidades")
def units(usuario=Depends(actor), svc=Depends(service)):
    return svc.units(usuario)


@router.post("/unidades", status_code=201)
def create_unit(req: UnidadeRequest, usuario=Depends(actor), svc=Depends(service)):
    return svc.create_unit(usuario, req)


@router.put("/unidades/{unidade_id}/vinculos")
def link(unidade_id: UUID, req: VinculoRequest, usuario=Depends(actor), svc=Depends(service)):
    return svc.link_user(usuario, str(unidade_id), req)


@router.get("/catalogo")
def catalog(unidade_id: UUID, usuario=Depends(actor), svc=Depends(service)):
    return svc.catalog(usuario, str(unidade_id))


def receive_report(req, usuario, svc):
    # Autoriza antes de interpretar; identidade/conversa não são sugeridas pelo texto.
    with svc.store.transaction() as tx:
        svc.authorize(tx, usuario, str(req.unidade_id))
    if req.conversa_id:
        from api.core.conversation_hub import verificar_dono
        verificar_dono(req.conversa_id, usuario)
    proposals = interpret(req.texto)
    return svc.create_report(usuario, str(req.unidade_id), req.texto, req.chave_idempotencia,
                             proposals, req.conversa_id)


@router.post("/relatos", status_code=201)
def report(req: RelatoRequest, usuario=Depends(actor), svc=Depends(service)):
    return receive_report(req, usuario, svc)


@router.get("/registros")
def records(unidade_id: UUID, inicio: date, fim: date,
            aba: Literal["confirmados", "pendentes", "historico"] = "confirmados",
            indicador: str | None = Query(default=None, max_length=80),
            pagina: int = Query(default=1, ge=1, le=10000), tamanho: int = Query(default=30, ge=1, le=100),
            usuario=Depends(actor), svc=Depends(service)):
    return svc.listing(usuario, str(unidade_id), inicio, fim, aba, indicador, pagina, tamanho)


@router.get("/resumo")
def summary(unidade_id: UUID, inicio: date, fim: date, usuario=Depends(actor), svc=Depends(service)):
    return svc.summary(usuario, str(unidade_id), inicio, fim)


@router.get("/registros/{registro_id}")
def detail(registro_id: UUID, usuario=Depends(actor), svc=Depends(service)):
    return svc.detail(usuario, str(registro_id))


@router.post("/registros/{registro_id}/editar")
def edit(registro_id: UUID, req: EditarRequest, usuario=Depends(actor), svc=Depends(service)):
    return svc.mutate(usuario, str(registro_id), "editar", req)


@router.post("/registros/{registro_id}/corrigir")
def correct(registro_id: UUID, req: EditarRequest, usuario=Depends(actor), svc=Depends(service)):
    return svc.mutate(usuario, str(registro_id), "corrigir", req)


@router.post("/registros/{registro_id}/{acao}")
def action(registro_id: UUID, acao: Literal["confirmar", "rejeitar", "cancelar"], req: AcaoRequest,
           usuario=Depends(actor), svc=Depends(service)):
    return svc.mutate(usuario, str(registro_id), acao, req)
