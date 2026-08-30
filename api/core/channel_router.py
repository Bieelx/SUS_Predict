"""Pareamento seguro e adaptador inicial do Telegram para o SusBot."""

from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import os
import re
import secrets
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException
from pydantic import BaseModel

from api.core import db
from api.core.auth import require_user
from api.core.susbot_agent import criar_susbot_agente, montar_historico_recente
from api.core.susbot_memory import (
    aprender_da_mensagem,
    aprender_do_usuario_autenticado,
    contexto_para_agente,
    executar_comando_memoria,
)
from api.core.susbot_seed import seed_susbot_municipio

log = logging.getLogger("sus_predict.channel_router")

router = APIRouter(prefix="/api/susbot", tags=["susbot-canais"])
PROVEDORES_SUPORTADOS = {"telegram"}
PAREAMENTO_TTL_MINUTOS = 10
TELEGRAM_SESSAO_INATIVIDADE_MINUTOS_PADRAO = 30


class CriarPareamentoRequest(BaseModel):
    provedor: str = "telegram"
    ibge6: str


def _usuario_referencia(user: dict[str, Any]) -> str:
    return str(user.get("id") or user.get("email") or user.get("sub") or "").strip()


def _token_hash(token: str) -> str:
    segredo_texto = os.getenv("CHANNEL_PAIRING_SECRET", "").strip()
    if not segredo_texto and _telegram_bot_token():
        raise HTTPException(503, "CHANNEL_PAIRING_SECRET precisa ser configurado")
    segredo = (segredo_texto or "sus-predict-pairing-dev").encode("utf-8")
    return hmac.new(segredo, token.encode("utf-8"), hashlib.sha256).hexdigest()


def _telegram_bot_username() -> str:
    return os.getenv("TELEGRAM_BOT_USERNAME", "").strip().lstrip("@")


def _telegram_bot_token() -> str:
    return os.getenv("TELEGRAM_BOT_TOKEN", "").strip()


def _telegram_sessao_expirada(conexao: dict, agora: datetime | None = None) -> bool:
    ultimo_uso = str(conexao.get("ultimo_uso_em") or "").strip()
    if not ultimo_uso or not conexao.get("conversa_atual_id"):
        return False
    try:
        limite = max(
            1,
            int(os.getenv(
                "TELEGRAM_SESSION_TIMEOUT_MINUTES",
                str(TELEGRAM_SESSAO_INATIVIDADE_MINUTOS_PADRAO),
            )),
        )
        usado_em = datetime.fromisoformat(ultimo_uso.replace("Z", "+00:00"))
        if usado_em.tzinfo is None:
            usado_em = usado_em.replace(tzinfo=timezone.utc)
        return (agora or datetime.now(timezone.utc)) - usado_em >= timedelta(minutes=limite)
    except (TypeError, ValueError):
        log.warning("ultimo_uso_em invalido na conexao Telegram %s", conexao.get("id"))
        return True


def _resumo_pareamento(pareamento: dict) -> dict:
    status = pareamento["status"]
    if status in {"emitido", "reivindicado"} and pareamento["expira_em"] <= datetime.now(timezone.utc).isoformat():
        status = "expirado"
    return {
        "id": pareamento["id"],
        "provedor": pareamento["provedor"],
        "ibge6": pareamento["ibge6"],
        "status": status,
        "external_username": pareamento.get("external_username"),
        "criado_em": pareamento["criado_em"],
        "expira_em": pareamento["expira_em"],
        "reivindicado_em": pareamento.get("reivindicado_em"),
        "confirmado_em": pareamento.get("confirmado_em"),
    }


def _resumo_conexao(conexao: dict) -> dict:
    return {
        "id": conexao["id"],
        "provedor": conexao["provedor"],
        "external_username": conexao.get("external_username"),
        "ibge6": conexao["ibge6"],
        "status": conexao["status"],
        "conectado_em": conexao["conectado_em"],
        "ultimo_uso_em": conexao.get("ultimo_uso_em"),
    }


def _historico_da_conversa(usuario: str, conversa_id: str) -> list[dict[str, str]]:
    conversa = db.get_conversa(conversa_id)
    if not conversa or conversa.get("usuario") != usuario:
        return []
    return montar_historico_recente(db.listar_mensagens(conversa_id, page_size=8))


def _obter_pareamento_do_usuario(pareamento_id: str, usuario: str) -> dict:
    pareamento = db.get_pareamento_canal(pareamento_id)
    if not pareamento:
        raise HTTPException(404, "Pareamento nao encontrado")
    if pareamento["usuario"] != usuario:
        raise HTTPException(403, "Pareamento nao pertence ao usuario autenticado")
    return pareamento


def _dividir_texto_telegram(texto: str, limite: int = 3500) -> list[str]:
    """Divide em blocos legíveis sem cortar palavras ou marcação no meio."""

    texto = str(texto or "").strip()
    if not texto:
        return [""]
    partes: list[str] = []
    atual = ""
    for bloco in re.split(r"(\n\n+)", texto):
        if not bloco:
            continue
        if len(atual) + len(bloco) <= limite:
            atual += bloco
            continue
        if atual.strip():
            partes.append(atual.strip())
            atual = ""
        while len(bloco) > limite:
            corte = bloco.rfind("\n", 0, limite)
            if corte < limite // 2:
                corte = bloco.rfind(" ", 0, limite)
            if corte < limite // 2:
                corte = limite
            partes.append(bloco[:corte].strip())
            bloco = bloco[corte:].lstrip()
        atual = bloco
    if atual.strip() or not partes:
        partes.append(atual.strip())
    return partes


def _markdown_para_html_telegram(texto: str) -> str:
    """Converte o subconjunto de Markdown do SusBot para HTML seguro do Telegram."""

    seguro = html.escape(str(texto or ""), quote=False)
    seguro = re.sub(r"(?m)^#{1,6}\s+(.+)$", r"<b>\1</b>", seguro)
    seguro = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", seguro, flags=re.DOTALL)
    seguro = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", seguro)
    return seguro


def _telegram_send(chat_id: str, texto: str) -> bool:
    token = _telegram_bot_token()
    if not token:
        log.info("TELEGRAM_BOT_TOKEN ausente; mensagem para chat %s nao enviada", chat_id)
        return False

    for parte in _dividir_texto_telegram(texto):
        body = json.dumps({
            "chat_id": chat_id,
            "text": _markdown_para_html_telegram(parte),
            "parse_mode": "HTML",
            "link_preview_options": {"is_disabled": True},
        }).encode("utf-8")
        request = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15):
                pass
        except (urllib.error.URLError, TimeoutError) as exc:
            log.warning("Falha ao enviar mensagem ao Telegram: %s", exc)
            return False
    return True


def _data_curta(valor: str | None) -> str | None:
    if not valor:
        return None
    try:
        return datetime.fromisoformat(str(valor).replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return None


def _numero_compacto(valor: Any) -> str:
    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return str(valor or "indisponível")
    return str(int(numero)) if numero.is_integer() else str(round(numero, 1)).replace(".", ",")


def _formatar_estoque_telegram(resultado: dict[str, Any]) -> str | None:
    if not resultado.get("encontrado"):
        return None
    dados = resultado.get("dados") or []
    if not dados:
        return None

    somente_risco = bool(resultado.get("somente_risco"))
    titulo = "🟠 **Insumos que pedem atenção**" if somente_risco else "📦 **Cobertura do estoque**"
    linhas = [titulo, f"{len(dados)} item(ns) consultado(s)"]
    icones = {"critico": "🔴", "alerta": "🟠", "ok": "🟢", "indisponivel": "⚪"}
    rotulos = {"critico": "crítico", "alerta": "atenção", "ok": "adequado", "indisponivel": "sem cálculo"}
    for item in dados:
        status = str(item.get("status") or "indisponivel")
        dias = item.get("dias_restantes")
        cobertura = f"{_numero_compacto(dias)} dias de cobertura" if dias is not None else "Cobertura indisponível"
        linhas.append(
            f"{icones.get(status, '⚪')} **{item.get('item') or 'Insumo'}**\n"
            f"{cobertura} · {rotulos.get(status, status)}"
        )

    qualidades = [item.get("qualidade") or {} for item in dados]
    datas = sorted({data for data in (_data_curta(q.get("competencia")) for q in qualidades) if data})
    confiancas = sorted({str(q.get("confianca")) for q in qualidades if q.get("confianca")})
    defasagens = [q.get("defasagem_dias") for q in qualidades if q.get("defasagem_dias") is not None]
    metadados = ["📋 **Sobre os dados**", "Fonte: estoque local informado pelo município"]
    if datas:
        metadados.append(f"Atualização: {', '.join(datas)}")
    if confiancas:
        metadados.append(f"Confiança: {', '.join(confiancas)}")
    if defasagens:
        metadados.append(f"Defasagem: até {max(defasagens)} dias")
    metadados.append("⚠️ Cobertura = quantidade atual ÷ consumo médio. Não é previsão de abastecimento.")
    return "\n\n".join(["\n".join(linhas[:2]), *linhas[2:], "\n".join(metadados)])


def _formatar_alertas_telegram(resultado: dict[str, Any]) -> str | None:
    if not resultado.get("encontrado") or not resultado.get("dados"):
        return None
    linhas = ["🚨 **Alertas do município**"]
    icones = {"alta": "🔴", "media": "🟠", "baixa": "🟡"}
    for alerta in resultado["dados"]:
        severidade = str(alerta.get("severidade") or "").lower()
        linhas.append(
            f"{icones.get(severidade, '⚪')} **{alerta.get('tipo') or 'Alerta'}**\n"
            f"{alerta.get('descricao') or 'Sem descrição'}"
        )
    return "\n\n".join(linhas)


def _formatar_resposta_telegram(resposta: str, dados_fim: dict[str, Any] | None) -> str:
    dados_fim = dados_fim or {}
    plano = dados_fim.get("plano") or {}
    resultado = dados_fim.get("resultado_ferramenta") or {}
    ferramenta = str(plano.get("ferramenta") or "")
    if ferramenta == "consultar_estoque":
        return _formatar_estoque_telegram(resultado) or resposta
    if ferramenta == "consultar_alertas":
        return _formatar_alertas_telegram(resultado) or resposta
    return resposta


@router.get("/canais")
def listar_canais(user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return {"itens": [_resumo_conexao(item) for item in db.listar_conexoes_canal(usuario)]}


@router.post("/canais/pareamentos", status_code=201)
def criar_pareamento(req: CriarPareamentoRequest, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    provedor = req.provedor.strip().lower()
    ibge6 = str(req.ibge6 or "").strip()[:6]
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    if usuario.startswith("dev-"):
        raise HTTPException(403, "Conecte uma conta regular do SusPredict antes de vincular o Telegram")
    if provedor not in PROVEDORES_SUPORTADOS:
        raise HTTPException(400, "Provedor ainda nao suportado")
    if len(ibge6) != 6 or not ibge6.isdigit():
        raise HTTPException(400, "ibge6 invalido")

    token = secrets.token_urlsafe(32)
    expira_em = (datetime.now(timezone.utc) + timedelta(minutes=PAREAMENTO_TTL_MINUTOS)).isoformat()
    pareamento = db.criar_pareamento_canal(usuario, provedor, _token_hash(token), ibge6, expira_em)
    username = _telegram_bot_username()
    return {
        **_resumo_pareamento(pareamento),
        "codigo": token,
        "deep_link": f"https://t.me/{username}?start={token}" if username else None,
        "configurado": bool(username),
    }


@router.get("/canais/pareamentos/{pareamento_id}")
def consultar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    return _resumo_pareamento(_obter_pareamento_do_usuario(pareamento_id, usuario))


@router.post("/canais/pareamentos/{pareamento_id}/confirmar")
def confirmar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    pareamento = _obter_pareamento_do_usuario(pareamento_id, usuario)
    if pareamento["status"] != "reivindicado":
        raise HTTPException(409, "Pareamento ainda nao foi reivindicado no canal")
    try:
        conexao = db.confirmar_pareamento_canal(pareamento_id, usuario)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    if not conexao:
        raise HTTPException(410, "Pareamento expirado ou indisponivel")
    aprender_do_usuario_autenticado(usuario, user, origem="perfil_autenticado")
    _telegram_send(conexao["external_chat_id"], "Telegram conectado ao SusPredict. Suas novas conversas aparecerao tambem no historico web.")
    return _resumo_conexao(conexao)


@router.delete("/canais/pareamentos/{pareamento_id}", status_code=204)
def cancelar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    _obter_pareamento_do_usuario(pareamento_id, usuario)
    db.cancelar_pareamento_canal(pareamento_id, usuario)
    return None


@router.delete("/canais/{provedor}", status_code=204)
def revogar_canal(provedor: str, user: dict = Depends(require_user)):
    usuario = _usuario_referencia(user)
    provedor = provedor.strip().lower()
    conexoes = db.listar_conexoes_canal(usuario)
    conexao = next((item for item in conexoes if item["provedor"] == provedor), None)
    if not conexao:
        raise HTTPException(404, "Canal conectado nao encontrado")
    db.revogar_conexao_canal(usuario, provedor)
    _telegram_send(conexao["external_chat_id"], "A conexao com o SusPredict foi removida. Para usar o SusBot novamente, faca um novo pareamento no aplicativo.")
    return None


def _processar_pergunta_telegram(conexao: dict, texto: str) -> tuple[str, str]:
    usuario = conexao["usuario"]
    ibge6 = conexao["ibge6"]
    conversa_id_atual = None if _telegram_sessao_expirada(conexao) else conexao.get("conversa_atual_id")
    conversa = db.get_conversa(conversa_id_atual) if conversa_id_atual else None
    if not conversa or conversa.get("usuario") != usuario:
        titulo = " ".join(texto.split()).strip()[:60] or "Conversa pelo Telegram"
        conversa = db.criar_conversa(usuario, titulo)
        db.atualizar_conversa_canal(conexao["id"], conversa["id"])

    seed_susbot_municipio(ibge6)
    comando_memoria = executar_comando_memoria(usuario, texto)
    if comando_memoria is not None:
        db.adicionar_mensagem(conversa["id"], "telegram", texto, comando_memoria, None)
        db.atualizar_conversa_canal(conexao["id"], conversa["id"])
        return comando_memoria, comando_memoria

    aprender_da_mensagem(usuario, texto, origem="telegram")
    historico = _historico_da_conversa(usuario, conversa["id"])
    agente = criar_susbot_agente(
        ibge6,
        tela_origem="telegram",
        usuario=usuario,
        historico=historico,
        memoria_usuario=contexto_para_agente(usuario),
    )
    resposta = ""
    confirmacao_pendente = False
    referencia = None
    dados_fim: dict[str, Any] | None = None
    for evento in agente.stream_eventos(texto):
        if evento["event"] == "token":
            resposta += str(evento["data"].get("texto") or "")
        elif evento["event"] == "confirmacao_pendente":
            confirmacao_pendente = True
        elif evento["event"] == "fim":
            dados_fim = evento["data"]
            resposta = str(evento["data"].get("resposta") or resposta)
            referencia = evento["data"].get("referencia_rota")

    resposta_base = resposta.strip() or "Nao consegui concluir esta consulta agora. Tente novamente em instantes."
    resposta = resposta_base
    if confirmacao_pendente:
        resposta += "\n\nEsta acao precisa ser confirmada no SusPredict. Nenhuma alteracao foi executada pelo Telegram."
    db.adicionar_mensagem(conversa["id"], "telegram", texto, resposta, referencia)
    db.atualizar_conversa_canal(conexao["id"], conversa["id"])
    resposta_telegram = _formatar_resposta_telegram(resposta_base, dados_fim)
    if confirmacao_pendente:
        resposta_telegram += "\n\n⚠️ Esta ação precisa ser confirmada no SusPredict."
    return resposta, resposta_telegram


def processar_update_telegram(update: dict) -> None:
    update_id = str(update.get("update_id") or "").strip()
    if update_id and not db.registrar_evento_canal("telegram", update_id):
        return
    mensagem = update.get("message") or {}
    chat = mensagem.get("chat") or {}
    remetente = mensagem.get("from") or {}
    texto = str(mensagem.get("text") or "").strip()
    chat_id = str(chat.get("id") or "").strip()
    external_user_id = str(remetente.get("id") or "").strip()
    if not texto or not chat_id or not external_user_id:
        return
    if chat.get("type") != "private":
        _telegram_send(chat_id, "Por seguranca, conecte e use o SusBot apenas em uma conversa privada.")
        return

    if texto.startswith("/start"):
        partes = texto.split(maxsplit=1)
        if len(partes) != 2:
            _telegram_send(chat_id, "Abra SusPredict, entre em SusBot > Canais e gere um novo link de conexao.")
            return
        pareamento = db.reivindicar_pareamento_canal(
            _token_hash(partes[1].strip()),
            "telegram",
            external_user_id,
            chat_id,
            remetente.get("username"),
        )
        if not pareamento:
            _telegram_send(chat_id, "Este link e invalido, expirou ou ja foi usado. Gere um novo no SusPredict.")
            return
        _telegram_send(chat_id, "Conta localizada. Volte ao SusPredict para confirmar a conexao com este Telegram.")
        return

    conexao = db.get_conexao_canal_por_externo("telegram", external_user_id)
    if not conexao:
        _telegram_send(chat_id, "Este Telegram ainda nao esta conectado. Gere um link em SusBot > Canais no SusPredict.")
        return
    if texto.lower() in {"/nova", "/new", "/clear"}:
        db.atualizar_conversa_canal(conexao["id"], None)
        _telegram_send(chat_id, "Nova conversa pronta. Qual decisao voce precisa tomar agora?")
        return
    try:
        _resposta_historico, resposta_telegram = _processar_pergunta_telegram(conexao, texto)
    except Exception as exc:  # pragma: no cover - defesa para webhook externo
        log.exception("Falha ao processar mensagem do Telegram: %s", exc)
        resposta_telegram = "Nao consegui consultar o SusBot agora. Tente novamente em instantes."
    _telegram_send(chat_id, resposta_telegram)


@router.post("/telegram/webhook")
def telegram_webhook(
    update: dict,
    background_tasks: BackgroundTasks,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
):
    segredo = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if not segredo:
        raise HTTPException(503, "TELEGRAM_WEBHOOK_SECRET precisa ser configurado")
    if not hmac.compare_digest(x_telegram_bot_api_secret_token or "", segredo):
        raise HTTPException(403, "Webhook do Telegram nao autorizado")
    background_tasks.add_task(processar_update_telegram, update)
    return {"ok": True}
