"""
Router HTTP da Clara.

Expõe o endpoint de pergunta via SSE e os endpoints de historico paginado por usuario.
"""

from __future__ import annotations

import json
import math
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ValidationError
from api.core.local_records_models import StrictModel
from uuid import UUID

from api.core.auth import require_user
from api.core.identidade import usuario_referencia
from api.core import db, conversation_hub as hub
from api.core.permissoes import provisionar_acesso_http, ferramentas_no_municipio
from api.core.susbot_agent import criar_susbot_agente, montar_historico_recente
from api.core.susbot_memory import (
    apagar_memorias,
    aprender_da_mensagem,
    aprender_do_usuario_autenticado,
    atualizar_resumo,
    contexto_para_agente,
    executar_comando_memoria,
    resumo_transparente,
    vale_atualizar_resumo,
)
from api.core.susbot_metrics import obter_metricas
from api.core.susbot_access import verificar_acesso_susbot

log = logging.getLogger("sus_predict.susbot_router")

router = APIRouter(prefix="/api/susbot", tags=["susbot"])


class ConfirmarFerramentaRequest(BaseModel):
    acao_id: str
    ferramenta: str | None = None
    argumentos: dict[str, Any] = {}


class ContextoRegistroLocal(StrictModel):
    unidade_id: UUID
    chave_idempotencia: str = Field(min_length=8, max_length=120)


class ContextoInputOperacional(StrictModel):
    id_estabelecimento: str = Field(min_length=1, max_length=40)
    chave_idempotencia: str = Field(min_length=8, max_length=120)


class PerguntaClaraRequest(BaseModel):
    pergunta: str = ""
    conversa_id: str | None = None
    ibge6: str | None = None
    ibge: str | None = None
    tela_origem: str | None = None
    confirmar: ConfirmarFerramentaRequest | None = None
    contexto: dict[str, Any] | None = None
    dados_tela: dict[str, Any] | None = None
    registro_local: ContextoRegistroLocal | None = None
    input_operacional: ContextoInputOperacional | None = None


@router.get("/metricas-uso")
def metricas_uso(user: dict = Depends(require_user)):
    """Contagens anônimas do processo atual para acompanhar economia de LLM."""

    if not usuario_referencia(user):
        raise HTTPException(401, "Usuario autenticado invalido")
    return obter_metricas()


def _ibge6(req: PerguntaClaraRequest) -> str:
    valor = str(req.ibge6 or req.ibge or "").strip()[:6]
    if not valor:
        raise HTTPException(400, "ibge6 ausente")
    return valor


def _titulo_da_pergunta(pergunta: str, limite: int = 60) -> str:
    texto = " ".join(str(pergunta or "").split()).strip()
    if not texto:
        return "Nova conversa"
    if len(texto) <= limite:
        return texto
    return f"{texto[: limite - 3].rstrip()}..."


def _verificar_ownership(conversa: dict | None, usuario: str) -> dict:
    if not conversa:
        raise HTTPException(404, "Conversa nao encontrada")
    if str(conversa.get("usuario") or "").strip() != usuario:
        raise HTTPException(403, "Conversa nao pertence ao usuario autenticado")
    return conversa


def _historico_da_conversa(usuario: str, conversa_id: str) -> list[dict[str, str]]:
    conversa = _verificar_ownership(db.get_conversa(conversa_id), usuario)
    return montar_historico_recente(db.listar_mensagens(conversa["id"], page_size=8))


def _meta_paginacao(page: int, page_size: int, total: int) -> dict[str, Any]:
    total_paginas = max(1, math.ceil(total / page_size)) if total else 1
    return {
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_paginas": total_paginas,
    }


def _resposta_paginada(items: list[dict], page: int, page_size: int, total: int, **extra: Any) -> dict:
    payload = _meta_paginacao(page, page_size, total)
    payload.update(extra)
    payload["itens"] = items
    return payload


def _clamp_pagination(page: int, page_size: int, max_page_size: int = 100) -> tuple[int, int]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or max_page_size), max_page_size))
    return page, page_size


def _sse(evento: str, dados: dict[str, Any]) -> str:
    return f"event: {evento}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n"


@router.post("/perguntar")
def perguntar(
    req: PerguntaClaraRequest,
    _acesso: str = Depends(verificar_acesso_susbot),
    user: dict = Depends(require_user),
):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    # docs/09: acesso resolvido antes de qualquer LLM. Sem linha = provisiona (equipe ou
    # visitante) a partir do e-mail do token; inativo = 403.
    acesso = provisionar_acesso_http(user)

    if (req.contexto or {}).get("intencao") == "input_operacional" and req.input_operacional is None:
        raise HTTPException(422, "Envie input_operacional com id_estabelecimento e chave_idempotencia.")
    if req.input_operacional is not None:
        if req.confirmar:
            raise HTTPException(422, "Confirme o input operacional pela operação estruturada.")
        from api.core.operational_inputs_interpreter import operational_summary
        from api.core.operational_inputs_router import service as operational_service
        from fastapi.encoders import jsonable_encoder
        draft = operational_service().create_draft(usuario, req.input_operacional.id_estabelecimento,
            req.pergunta, req.input_operacional.chave_idempotencia)
        summary = operational_summary(draft)
        events = (_sse("rascunho_operacional_pronto", jsonable_encoder(draft))
                  + _sse("token", {"texto": summary + " Revise e confirme em Registros da unidade."})
                  + _sse("fim", {"resposta": summary, "referencia_rota": "/registros-unidade",
                                 "rascunho_id": str(draft["id"])}))
        return StreamingResponse(iter([events]), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    if (req.contexto or {}).get("intencao") == "registro_local" and req.registro_local is None:
        raise HTTPException(422, "Envie registro_local com unidade_id e chave_idempotencia para registrar com a Clara.")
    if req.registro_local is not None:
        if req.confirmar:
            raise HTTPException(422, "Use a operação estruturada do registro para confirmar.")
        from api.core.local_records_router import service, receive_report
        from api.core.local_records_models import RelatoRequest
        from api.core.local_records_interpreter import report_summary
        from fastapi.encoders import jsonable_encoder
        try:
            relato_request = RelatoRequest(unidade_id=req.registro_local.unidade_id,
                texto=req.pergunta, chave_idempotencia=req.registro_local.chave_idempotencia,
                conversa_id=req.conversa_id)
        except ValidationError:
            raise HTTPException(422, "Informe um relato de até 8000 caracteres e uma referência de conversa válida.") from None
        report = receive_report(relato_request, usuario, service())
        summary = report_summary(report)
        events = (_sse("rascunho_local_pronto", jsonable_encoder(report))
                  + _sse("token", {"texto": summary})
                  + _sse("fim", {"resposta": summary, "referencia_rota": "/registros-unidade",
                                 "relato_id": str(report["relato_id"])}))
        return StreamingResponse(iter([events]), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

    pergunta = " ".join(str(req.pergunta or "").split()).strip()
    if not pergunta and not req.confirmar:
        raise HTTPException(400, "pergunta ausente")

    ibge6 = _ibge6(req)
    if req.confirmar and not req.conversa_id:
        raise HTTPException(422, "A confirmação precisa da conversa de origem.")

    pergunta_registro = pergunta or f"[confirmado] {req.confirmar.ferramenta}" if req.confirmar else pergunta

    conversa = None
    conversa_criada = False
    if req.conversa_id:
        conversa = _verificar_ownership(db.get_conversa(req.conversa_id), usuario)
    else:
        conversa = db.criar_conversa(usuario=usuario, titulo=_titulo_da_pergunta(pergunta_registro))
        conversa_criada = True

    contexto = hub.fixar_contexto(conversa["id"], usuario, ibge6, req.contexto or {"tela": req.tela_origem})
    ibge6 = contexto["ibge6"]
    permitidas = ferramentas_no_municipio(acesso, ibge6)
    if req.confirmar:
        acao = hub.obter_acao(req.confirmar.acao_id, conversa["id"], usuario)
        if acao["dados"]["ferramenta"] not in permitidas:
            raise HTTPException(403, "Seu perfil ou município não permite esta ação.")

    comando_memoria = executar_comando_memoria(usuario, pergunta) if pergunta else None
    if pergunta and comando_memoria is None:
        # Nome do perfil logado (só grava se ainda não houver nome na memória).
        aprender_do_usuario_autenticado(usuario, user, origem="perfil_autenticado")
        aprender_da_mensagem(usuario, pergunta, origem=req.tela_origem or "web")

    historico = _historico_da_conversa(usuario, conversa["id"])
    agente = None if comando_memoria else criar_susbot_agente(
        ibge6,
        tela_origem=req.tela_origem,
        usuario=usuario,
        historico=historico,
        memoria_usuario=contexto_para_agente(usuario),
        permitidas=permitidas,
        contexto_conversa=contexto,
        perfil=acesso.perfil,
        dados_tela=req.dados_tela,
    )

    def _stream() -> Any:
        texto_final = ""
        referencia_rota = None
        proposta = ""
        artefato = None

        try:
            yield _sse(
                "status",
                {
                    "mensagem": "Conversa pronta",
                    "conversa_id": conversa["id"],
                    "conversa_criada": conversa_criada,
                    "contexto": contexto,
                },
            )

            if comando_memoria is not None:
                eventos = [
                    {"event": "token", "data": {"texto": comando_memoria}},
                    {
                        "event": "fim",
                        "data": {"resposta": comando_memoria, "referencia_rota": None},
                    },
                ]
            elif req.confirmar:
                eventos = hub.executar_acao(req.confirmar.acao_id, conversa["id"], usuario, agente)
            else:
                eventos = agente.stream_eventos(pergunta)
            for evento in eventos:
                if evento["event"] == "artefato":
                    artefato = evento["data"]
                if evento["event"] == "confirmacao_pendente":
                    proposta = evento["data"].get("resumo") or "Ação aguardando confirmação."
                    acao = hub.criar_acao(conversa["id"], usuario, evento["data"])
                    evento = {**evento, "data": {**evento["data"], "acao_id": acao["id"]}}
                yield _sse(evento["event"], evento["data"])
                if evento["event"] == "fim":
                    texto_final = str(evento["data"].get("resposta") or "")
                    referencia_rota = evento["data"].get("referencia_rota")

            # Resumo da memória depois da resposta: o texto já chegou ao usuário e o
            # front mostra "guardando na memória" enquanto o LLM reescreve o resumo.
            if agente is not None and pergunta and not req.confirmar and vale_atualizar_resumo(pergunta):
                yield _sse("memoria", {"estado": "salvando"})
                try:
                    mudou = atualizar_resumo(usuario, pergunta, agente._obter_llm())
                except Exception as exc:  # pragma: no cover - LLM sem configuração
                    log.warning("Falha ao atualizar resumo da memória: %s", exc)
                    mudou = False
                yield _sse("memoria", {"estado": "atualizada" if mudou else "sem_mudanca"})

            try:
                if req.confirmar:
                    return  # resultado da ação já está durável; replay não duplica histórico
                mensagem = db.adicionar_mensagem(
                    conversa_id=conversa["id"],
                    tela_origem=req.tela_origem,
                    pergunta=pergunta_registro,
                    resposta=texto_final or proposta,
                    referencia_rota=referencia_rota,
                )
                if artefato:
                    hub.salvar_evidencia(conversa["id"], mensagem["id"], artefato)
            except Exception as exc:  # pragma: no cover - não deve falhar nos testes
                log.warning("Falha ao persistir mensagem da Clara: %s", exc)

        except HTTPException as exc:
            yield _sse("erro", {"mensagem": str(exc.detail)})
        except Exception as exc:  # pragma: no cover - defesa contra falha do LLM/tool
            log.warning("Falha no stream da Clara: %s", exc)
            yield _sse("erro", {"mensagem": "Falha ao gerar resposta da Clara. Tente novamente."})

    headers = {
        "X-Conversa-Id": conversa["id"],
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_stream(), media_type="text/event-stream", headers=headers)


@router.get("/memoria")
def consultar_memoria(user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return resumo_transparente(usuario)


@router.delete("/memoria")
def excluir_memoria(user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return {"removidos": apagar_memorias(usuario)}


@router.delete("/memoria/{chave}")
def excluir_fato_da_memoria(chave: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return {"removidos": apagar_memorias(usuario, chave)}


@router.get("/conversas")
def listar_conversas(
    page: int = 1,
    page_size: int = 20,
    canal: str | None = None,
    user: dict = Depends(require_user),
):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    canal_normalizado = str(canal or "").strip().lower() or None
    if canal_normalizado not in {None, "app", "telegram", "whatsapp"}:
        raise HTTPException(400, "canal invalido")

    page, page_size = _clamp_pagination(page, page_size)
    itens = db.listar_conversas(usuario, page=page, page_size=page_size, canal=canal_normalizado)
    total = db.contar_conversas(usuario, canal=canal_normalizado)
    return _resposta_paginada(
        itens, page, page_size, total, usuario=usuario, canal=canal_normalizado,
    )


@router.delete("/conversas/{conversa_id}", status_code=204)
def excluir_conversa(conversa_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    _verificar_ownership(db.get_conversa(conversa_id), usuario)
    db.deletar_conversa(conversa_id, usuario)
    return None


@router.get("/conversas/{conversa_id}/mensagens")
def listar_mensagens(
    conversa_id: str,
    page: int = 1,
    page_size: int = 30,
    user: dict = Depends(require_user),
):
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")

    conversa = _verificar_ownership(db.get_conversa(conversa_id), usuario)
    page, page_size = _clamp_pagination(page, page_size)
    itens = db.listar_mensagens(conversa_id, page=page, page_size=page_size)
    total = db.contar_mensagens(conversa_id)
    return _resposta_paginada(
        itens,
        page,
        page_size,
        total,
        conversa_id=conversa_id,
        titulo=conversa.get("titulo"),
    )


@router.get("/conversas/{conversa_id}/hub")
def estado_hub(conversa_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    hub.verificar_dono(conversa_id, usuario)
    acesso = provisionar_acesso_http(user)
    contexto = hub.obter_contexto(conversa_id)
    permitidas = ferramentas_no_municipio(acesso, (contexto or {}).get("ibge6", ""))
    acoes = hub.listar_acoes(conversa_id, usuario)
    for acao in acoes:
        acao["permitida"] = acao["dados"]["ferramenta"] in permitidas
    return {"contexto": contexto, "acoes": acoes, "evidencias": hub.listar_evidencias(conversa_id, usuario)}


@router.delete("/conversas/{conversa_id}/acoes/{acao_id}", status_code=204)
def cancelar_acao(conversa_id: str, acao_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    hub.obter_acao(acao_id, conversa_id, usuario)
    if not hub.transicionar(acao_id, "pendente", "cancelada"):
        raise HTTPException(409, "Ação já processada ou cancelada.")
