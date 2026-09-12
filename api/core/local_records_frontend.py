"""Apresentação /api/local acordada em docs/16, sobre o mesmo serviço transacional."""
from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import Field

from api.core.local_records_models import RegistroValores, EditarRequest, AcaoRequest
from api.core.local_records_router import service, actor

router = APIRouter(prefix="/api/local", tags=["registros locais frontend"])


def call(operation):
    try:
        return operation()
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {}
        code = detail.get("codigo")
        kind = {"versao_desatualizada": "versao_desatualizada", "possivel_duplicidade": "duplicidade",
                "idempotencia_conflitante": "campos_invalidos"}.get(code)
        kind = kind or {401: "nao_autenticado", 403: "nao_autorizado", 404: "nao_encontrado",
                        422: "campos_invalidos", 503: "indisponivel"}.get(exc.status_code, "campos_invalidos")
        return JSONResponse(status_code=exc.status_code, content={"tipo": kind,
            "detail": detail.get("mensagem", "Operação indisponível."),
            "erros": detail.get("campos"), "registro": {"registro_id": detail["registro_id"]} if detail.get("registro_id") else None})


def present(svc, usuario, record, effective=False):
    data = svc.detail(usuario, str(record))
    with svc.store.transaction() as tx:
        unit, link, _ = svc.authorize(tx, usuario, data["unidade_id"])
    latest = data["atual"]
    version = data["confirmada_vigente"] if effective else latest
    if version is None:
        raise HTTPException(409, {"codigo": "versao_desatualizada", "mensagem": "O registro mudou durante a consulta. Atualize a lista."})
    review = link["papel"] in {"revisor", "gestor_unidade"}
    pending_correction = bool(data["confirmada_vigente"] and latest["status"] == "rascunho")
    cap = {"confirmar": review and latest["status"] == "rascunho",
           "corrigir": review and bool(data["confirmada_vigente"]) and not pending_correction,
           "cancelar": review and bool(data["confirmada_vigente"]),
           "editar_rascunho": latest["status"] == "rascunho" and (review or data["criado_por"] == usuario and not data["confirmada_vigente"]),
           "ver_relato": True}
    report = data["relato"]
    result = {"registro_id": data["id"], "relato_id": data["relato_id"], "versao_id": version["id"],
              "numero_versao": version["numero_versao"], "unidade": {**unit, "municipio": "IBGE " + unit["ibge6"]},
              "indicador": {"codigo": data["indicador"], "nome": data["indicador_nome"], "unidade_medida": data["unidade_medida"]},
              **{k: version[k] for k in ("periodo_inicio", "periodo_fim", "valor", "dimensoes", "status", "vigente", "motivo_alteracao")},
              "autor": data["criado_por"], "confirmador": version["confirmada_por"],
              "confirmado_em": version["confirmada_em"], "criado_em": data["criado_em"],
              "capacidades": cap, "correcao_em_elaboracao": pending_correction,
              "origem": {"canal": report["canal"], "recebido_em": report["recebido_em"], "relato_status": report["status"]},
              "pendencias": [{"campo": k, "mensagem": "Informe " + k.replace("dimensoes.", "") + "."} for k in version["pendencias"]]}
    return {"registro": result, "versoes": [{**v, "autor": v["criada_por"], "data": v["criada_em"], "motivo": v["motivo_alteracao"]} for v in data["versoes"]],
            "relato": {**report, "texto": report["texto_original"] or report["transcricao"]},
            "confirmada_vigente": data["confirmada_vigente"]}


@router.get("/unidades")
def units(usuario=Depends(actor), svc=Depends(service)):
    def execute():
        units = svc.units(usuario)["itens"]
        for unit in units:
            review = unit["capacidades"]["revisar"]
            unit["capacidades"].update(confirmar=review, corrigir=review, cancelar=review)
            unit["municipio"] = "IBGE " + unit["ibge6"]
        return {"unidades": units}
    return call(execute)


@router.get("/catalogo")
def catalog(unidade: UUID, usuario=Depends(actor), svc=Depends(service)):
    return call(lambda: {"indicadores": svc.catalog(usuario, str(unidade))["itens"]})


@router.get("/registros")
def listing(unidade: UUID, inicio: date, fim: date,
            aba: Literal["confirmados", "pendentes", "historico"] = "confirmados",
            indicador: str | None = None, status: Literal["rascunho", "confirmado", "rejeitado", "cancelado"] | None = None,
            cursor: int = Query(default=1, ge=1, le=10000), usuario=Depends(actor), svc=Depends(service)):
    def execute():
        if status:
            raise HTTPException(422, {"codigo": "filtro_indisponivel", "mensagem": "Use as abas para filtrar o estado nesta versão."})
        rows = svc.listing(usuario, str(unidade), inicio, fim, aba, indicador, cursor)
        return {"itens": [present(svc, usuario, r["id"], effective=aba == "confirmados")["registro"] for r in rows["itens"]],
                "proximo_cursor": rows["proxima_pagina"]}
    return call(execute)


@router.get("/resumo")
def summary(unidade: UUID, inicio: date, fim: date, indicador: str | None = None,
            usuario=Depends(actor), svc=Depends(service)):
    def execute():
        with svc.store.transaction() as tx:
            _, _, caps = svc.authorize(tx, usuario, str(unidade))
        if not caps["consolidar"]:
            return {"indicadores": [], "disponivel": False, "motivo": "Consolidação não autorizada para este papel."}
        rows = svc.summary(usuario, str(unidade), inicio, fim)["itens"]
        groups = {}
        for row in rows:
            if indicador and row["indicador"] != indicador:
                continue
            item = groups.setdefault(row["indicador"], {"codigo": row["indicador"], "nome": row["nome"],
                "unidade_medida": row["unidade_medida"], "total_confirmado": None, "total_seguro": False, "grupos": [],
                "cobertura": {"unidades_informaram": 1}})
            item["grupos"].append({"rotulo": " · ".join(row["dimensoes"].values()) or "Sem dimensão informada", "valor": Decimal(row["valor"])})
        return {"indicadores": list(groups.values()), "disponivel": True}
    return call(execute)


@router.get("/registros/{registro_id}")
def detail(registro_id: UUID, usuario=Depends(actor), svc=Depends(service)):
    return call(lambda: present(svc, usuario, str(registro_id)))


class FrontendMutation(RegistroValores):
    versao_esperada: int = Field(ge=1)
    motivo: str = Field(default="", max_length=1000)


def mutate(svc, usuario, registro, action, body, key):
    # Completar datas omitidas no transporte com a versão que foi revisada,
    # nunca com a data atual ou com uma versão concorrente mais recente.
    data = svc.detail(usuario, registro)
    base = next((v for v in data["versoes"] if v["numero_versao"] == body.versao_esperada), None)
    if not base:
        raise HTTPException(409, {"codigo": "versao_desatualizada", "mensagem": "Revise a versão atual."})
    fields = body.model_dump(mode="json", exclude_unset=True)
    fields["chave_idempotencia"] = key
    if action in {"editar", "corrigir"}:
        for field in ("periodo_inicio", "periodo_fim", "valor", "dimensoes"):
            fields.setdefault(field, base[field])
        request = EditarRequest(**fields)
    else:
        request = AcaoRequest(**fields)
    result = svc.mutate(usuario, registro, action, request)
    return {**present(svc, usuario, registro), "replay": result["replay"], "versao_resultado": result["versao_resultado"]}


@router.put("/registros/{registro_id}/rascunho")
def edit(registro_id: UUID, req: FrontendMutation,
         idempotency_key: str = Header(min_length=8, max_length=120), usuario=Depends(actor), svc=Depends(service)):
    return call(lambda: mutate(svc, usuario, str(registro_id), "editar", req, idempotency_key))


@router.post("/registros/{registro_id}/{acao}")
def action(registro_id: UUID, acao: Literal["confirmar", "corrigir", "rejeitar", "cancelar"], req: FrontendMutation,
           idempotency_key: str = Header(min_length=8, max_length=120), usuario=Depends(actor), svc=Depends(service)):
    return call(lambda: mutate(svc, usuario, str(registro_id), acao, req, idempotency_key))
