"""
Router HTTP do SusBot.

Expõe o endpoint de pergunta via SSE e os endpoints de historico paginado por usuario.
"""

from __future__ import annotations

import json
import math
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.core.auth import require_user
from api.core import db
from api.core.susbot_agent import criar_susbot_agente, montar_historico_recente
from api.core.susbot_memory import (
    apagar_memorias,
    aprender_da_mensagem,
    contexto_para_agente,
    executar_comando_memoria,
    resumo_transparente,
)
from api.core.susbot_seed import seed_susbot_municipio
from api.core.susbot_metrics import obter_metricas
from api.core.susbot_access import verificar_acesso_susbot

log = logging.getLogger("sus_predict.susbot_router")

router = APIRouter(prefix="/api/susbot", tags=["susbot"])


class ConfirmarFerramentaRequest(BaseModel):
    ferramenta: str
    argumentos: dict[str, Any] = {}


class PerguntaSusBotRequest(BaseModel):
    pergunta: str
    conversa_id: str | None = None
    ibge6: str | None = None
    ibge: str | None = None
    tela_origem: str | None = None
    confirmar: ConfirmarFerramentaRequest | None = None


def _usuario_referencia(user: dict[str, Any]) -> str:
    return str(user.get("id") or user.get("email") or user.get("sub") or "").strip()


@router.get("/metricas-uso")
def metricas_uso(user: dict = Depends(require_user)):
    """Contagens anônimas do processo atual para acompanhar economia de LLM."""

    if not _usuario_referencia(user):
        raise HTTPException(401, "Usuario autenticado invalido")
    return obter_metricas()


def _ibge6(req: PerguntaSusBotRequest) -> str:
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
    req: PerguntaSusBotRequest,
    user: dict = Depends(require_user),
    _acesso: str = Depends(verificar_acesso_susbot),
):
    usuario = _usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")

    pergunta = " ".join(str(req.pergunta or "").split()).strip()
    if not pergunta and not req.confirmar:
        raise HTTPException(400, "pergunta ausente")

    ibge6 = _ibge6(req)
    seed_susbot_municipio(ibge6)

    pergunta_registro = pergunta or f"[confirmado] {req.confirmar.ferramenta}" if req.confirmar else pergunta

    conversa = None
    conversa_criada = False
    if req.conversa_id:
        conversa = _verificar_ownership(db.get_conversa(req.conversa_id), usuario)
    else:
        conversa = db.criar_conversa(usuario=usuario, titulo=_titulo_da_pergunta(pergunta_registro))
        conversa_criada = True

    comando_memoria = executar_comando_memoria(usuario, pergunta) if pergunta else None
    if pergunta and comando_memoria is None:
        aprender_da_mensagem(usuario, pergunta, origem=req.tela_origem or "web")

    historico = _historico_da_conversa(usuario, conversa["id"])
    agente = None if comando_memoria else criar_susbot_agente(
        ibge6,
        tela_origem=req.tela_origem,
        usuario=usuario,
        historico=historico,
        memoria_usuario=contexto_para_agente(usuario),
    )

    def _stream() -> Any:
        texto_final = ""
        referencia_rota = None

        try:
            yield _sse(
                "status",
                {
                    "mensagem": "Conversa pronta",
                    "conversa_id": conversa["id"],
                    "conversa_criada": conversa_criada,
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
                eventos = agente.stream_eventos_confirmado(req.confirmar.ferramenta, req.confirmar.argumentos)
            else:
                eventos = agente.stream_eventos(pergunta)
            for evento in eventos:
                yield _sse(evento["event"], evento["data"])
                if evento["event"] == "fim":
                    texto_final = str(evento["data"].get("resposta") or "")
                    referencia_rota = evento["data"].get("referencia_rota")

            try:
                db.adicionar_mensagem(
                    conversa_id=conversa["id"],
                    tela_origem=req.tela_origem,
                    pergunta=pergunta_registro,
                    resposta=texto_final,
                    referencia_rota=referencia_rota,
                )
            except Exception as exc:  # pragma: no cover - não deve falhar nos testes
                log.warning("Falha ao persistir mensagem do SusBot: %s", exc)

        except HTTPException:
            raise
        except Exception as exc:  # pragma: no cover - defesa contra falha do LLM/tool
            log.warning("Falha no stream do SusBot: %s", exc)
            yield _sse("erro", {"mensagem": "Falha ao gerar resposta do SusBot. Tente novamente."})

    headers = {
        "X-Conversa-Id": conversa["id"],
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(_stream(), media_type="text/event-stream", headers=headers)


@router.get("/memoria")
def consultar_memoria(user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return resumo_transparente(usuario)


@router.delete("/memoria")
def excluir_memoria(user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return {"removidos": apagar_memorias(usuario)}


@router.delete("/memoria/{chave}")
def excluir_fato_da_memoria(chave: str, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
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
    usuario = _usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    canal_normalizado = str(canal or "").strip().lower() or None
    if canal_normalizado not in {None, "app", "telegram"}:
        raise HTTPException(400, "canal invalido")

    page, page_size = _clamp_pagination(page, page_size)
    itens = db.listar_conversas(usuario, page=page, page_size=page_size, canal=canal_normalizado)
    total = db.contar_conversas(usuario, canal=canal_normalizado)
    return _resposta_paginada(
        itens, page, page_size, total, usuario=usuario, canal=canal_normalizado,
    )


@router.get("/conversas/{conversa_id}/mensagens")
def listar_mensagens(
    conversa_id: str,
    page: int = 1,
    page_size: int = 30,
    user: dict = Depends(require_user),
):
    usuario = _usuario_referencia(user)
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
