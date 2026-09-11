"""Pareamento seguro e adaptadores de Telegram e WhatsApp para a Clara."""

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
import urllib.parse
import urllib.request
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from api.core import db, conversation_hub as hub
from api.core.audio_transcription import (
    AudioInvalido,
    ResultadoTranscricao,
    TranscricaoIndisponivel,
    transcrever_audio,
    validar_metadados_audio,
)
from api.core.auth import require_user
from api.core.identidade import usuario_referencia
from api.core.permissoes import AcessoNegado, carregar_acesso, ferramentas_no_municipio
from api.core.channel_media import MidiaCanalIndisponivel, baixar_audio_openwa, baixar_audio_telegram
from api.core.susbot_agent import criar_susbot_agente, montar_historico_recente
from api.core.susbot_memory import (
    aprender_da_mensagem,
    aprender_do_usuario_autenticado,
    atualizar_resumo,
    contexto_para_agente,
    executar_comando_memoria,
)

log = logging.getLogger("sus_predict.channel_router")

router = APIRouter(prefix="/api/susbot", tags=["susbot-canais"])
PROVEDORES_SUPORTADOS = {"telegram", "whatsapp"}
NOMES_CANAL = {"telegram": "Telegram", "whatsapp": "WhatsApp"}
PAREAMENTO_TTL_MINUTOS = 10
TELEGRAM_SESSAO_INATIVIDADE_MINUTOS_PADRAO = 30


class CriarPareamentoRequest(BaseModel):
    provedor: str = "telegram"
    ibge6: str


def _token_hash(token: str) -> str:
    segredo_texto = os.getenv("CHANNEL_PAIRING_SECRET", "").strip()
    if not segredo_texto and (_telegram_bot_token() or _openwa_config()[1]):
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
    """Converte o subconjunto de Markdown da Clara para HTML seguro do Telegram."""

    seguro = html.escape(str(texto or ""), quote=False)
    seguro = re.sub(r"(?m)^#{1,6}\s+(.+)$", r"<b>\1</b>", seguro)
    seguro = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", seguro, flags=re.DOTALL)
    seguro = re.sub(r"`([^`\n]+)`", r"<code>\1</code>", seguro)
    return seguro


def _telegram_send(chat_id: str, texto: str, reply_markup: dict | None = None) -> bool:
    token = _telegram_bot_token()
    if not token:
        log.info("TELEGRAM_BOT_TOKEN ausente; mensagem para chat %s nao enviada", chat_id)
        return False

    for parte in _dividir_texto_telegram(texto):
        body = json.dumps({
            **({"reply_markup": reply_markup} if reply_markup else {}),
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


def _transcrever_audio_telegram(mensagem: dict[str, Any]) -> ResultadoTranscricao:
    audio = mensagem.get("voice") or mensagem.get("audio") or {}
    if not isinstance(audio, dict):
        raise AudioInvalido("A mensagem de áudio recebida é inválida.")

    file_id = str(audio.get("file_id") or "").strip()
    mime_type = str(audio.get("mime_type") or "audio/ogg").strip()
    duracao = audio.get("duration")
    tamanho = audio.get("file_size")
    validar_metadados_audio(
        tamanho_bytes=tamanho,
        duracao_segundos=duracao,
        mime_type=mime_type,
    )
    conteudo = baixar_audio_telegram(_telegram_bot_token(), file_id)
    return transcrever_audio(
        conteudo,
        mime_type=mime_type,
        duracao_segundos=duracao,
    )


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
    usuario = usuario_referencia(user)
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    return {"itens": [_resumo_conexao(item) for item in db.listar_conexoes_canal(usuario)]}


@router.post("/canais/pareamentos", status_code=201)
def criar_pareamento(req: CriarPareamentoRequest, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    provedor = req.provedor.strip().lower()
    ibge6 = str(req.ibge6 or "").strip()[:6]
    if not usuario:
        raise HTTPException(401, "Usuario autenticado invalido")
    if provedor not in PROVEDORES_SUPORTADOS:
        raise HTTPException(400, "Provedor ainda nao suportado")
    if usuario.startswith("dev-"):
        raise HTTPException(403, f"Conecte uma conta regular do SusPredict antes de vincular o {NOMES_CANAL[provedor]}")
    if len(ibge6) != 6 or not ibge6.isdigit():
        raise HTTPException(400, "ibge6 invalido")

    token = secrets.token_urlsafe(32)
    expira_em = (datetime.now(timezone.utc) + timedelta(minutes=PAREAMENTO_TTL_MINUTOS)).isoformat()
    pareamento = db.criar_pareamento_canal(usuario, provedor, _token_hash(token), ibge6, expira_em)
    if provedor == "whatsapp":
        numero = _whatsapp_numero()
        deep_link = f"https://wa.me/{numero}?text={urllib.parse.quote(f'conectar {token}')}" if numero else None
    else:
        username = _telegram_bot_username()
        deep_link = f"https://t.me/{username}?start={token}" if username else None
    return {
        **_resumo_pareamento(pareamento),
        "codigo": token,
        "deep_link": deep_link,
        "configurado": bool(deep_link),
    }


@router.get("/canais/pareamentos/{pareamento_id}")
def consultar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    return _resumo_pareamento(_obter_pareamento_do_usuario(pareamento_id, usuario))


@router.post("/canais/pareamentos/{pareamento_id}/confirmar")
def confirmar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
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
    nome = NOMES_CANAL.get(conexao["provedor"], conexao["provedor"])
    _enviar(conexao["provedor"], conexao["external_chat_id"], f"{nome} conectado ao SusPredict. Suas novas conversas aparecerao tambem no historico web.")
    _quadro_conversas(conexao)
    return _resumo_conexao(conexao)


@router.delete("/canais/pareamentos/{pareamento_id}", status_code=204)
def cancelar_pareamento(pareamento_id: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    _obter_pareamento_do_usuario(pareamento_id, usuario)
    db.cancelar_pareamento_canal(pareamento_id, usuario)
    return None


@router.delete("/canais/{provedor}", status_code=204)
def revogar_canal(provedor: str, user: dict = Depends(require_user)):
    usuario = usuario_referencia(user)
    provedor = provedor.strip().lower()
    conexoes = db.listar_conexoes_canal(usuario)
    conexao = next((item for item in conexoes if item["provedor"] == provedor), None)
    if not conexao:
        raise HTTPException(404, "Canal conectado nao encontrado")
    db.revogar_conexao_canal(usuario, provedor)
    _enviar(provedor, conexao["external_chat_id"], "A conexao com o SusPredict foi removida. Para usar a Clara novamente, faca um novo pareamento no aplicativo.")
    return None


def _processar_pergunta_canal(conexao: dict, texto: str) -> tuple[str, str]:
    usuario = conexao["usuario"]
    ibge6 = conexao["ibge6"]
    canal = conexao["provedor"]
    nome = NOMES_CANAL.get(canal, canal)
    # docs/09: acesso carregado a cada mensagem — desativar na tabela vale na proxima.
    try:
        acesso = carregar_acesso(usuario)
    except AcessoNegado as exc:
        log.warning("%s recusado (usuario=%s): %s", nome, usuario, exc)
        return str(exc), str(exc)
    conversa_id_atual = None if _telegram_sessao_expirada(conexao) else conexao.get("conversa_atual_id")
    conversa = db.get_conversa(conversa_id_atual) if conversa_id_atual else None
    if not conversa or conversa.get("usuario") != usuario:
        titulo = " ".join(texto.split()).strip()[:60] or f"Conversa pelo {nome}"
        conversa = db.criar_conversa(usuario, titulo)
        db.atualizar_conversa_canal(conexao["id"], conversa["id"])

    comando_memoria = executar_comando_memoria(usuario, texto)
    if comando_memoria is not None:
        db.adicionar_mensagem(conversa["id"], canal, texto, comando_memoria, None)
        db.atualizar_conversa_canal(conexao["id"], conversa["id"])
        return comando_memoria, comando_memoria

    contexto = hub.fixar_contexto(conversa["id"], usuario, ibge6, {"tela": canal})
    ibge6 = contexto["ibge6"]
    aprender_da_mensagem(usuario, texto, origem=canal)
    historico = _historico_da_conversa(usuario, conversa["id"])
    agente = criar_susbot_agente(
        ibge6,
        tela_origem=canal,
        usuario=usuario,
        historico=historico,
        memoria_usuario=contexto_para_agente(usuario),
        permitidas=ferramentas_no_municipio(acesso, ibge6),
        contexto_conversa=contexto,
        perfil=acesso.perfil,
    )
    resposta = ""
    confirmacao_pendente = False
    proposta = ""
    referencia = None
    dados_fim: dict[str, Any] | None = None
    for evento in agente.stream_eventos(texto):
        if evento["event"] == "token":
            resposta += str(evento["data"].get("texto") or "")
        elif evento["event"] == "confirmacao_pendente":
            confirmacao_pendente = True
            hub.criar_acao(conversa["id"], usuario, evento["data"])
            proposta = evento["data"].get("resumo") or "Ação aguardando revisão no SusPredict."
        elif evento["event"] == "fim":
            dados_fim = evento["data"]
            resposta = str(evento["data"].get("resposta") or resposta)
            referencia = evento["data"].get("referencia_rota")

    try:
        atualizar_resumo(usuario, texto, agente._obter_llm())
    except Exception as exc:  # pragma: no cover - LLM sem configuração
        log.warning("Falha ao atualizar resumo da memória (%s): %s", canal, exc)
    resposta_base = resposta.strip() or proposta or "Nao consegui concluir esta consulta agora. Tente novamente em instantes."
    resposta = resposta_base
    if confirmacao_pendente:
        resposta += f"\n\nEsta acao precisa ser confirmada no SusPredict. Nenhuma alteracao foi executada pelo {nome}."
    mensagem = db.adicionar_mensagem(conversa["id"], canal, texto, resposta, referencia)
    if (dados_fim or {}).get("artefato"):
        hub.salvar_evidencia(conversa["id"], mensagem["id"], dados_fim["artefato"])
    db.atualizar_conversa_canal(conexao["id"], conversa["id"])
    resposta_canal = _formatar_resposta_telegram(resposta_base, dados_fim)
    if confirmacao_pendente:
        resposta_canal += "\n\n⚠️ Esta ação precisa ser confirmada no SusPredict."
    return resposta, resposta_canal


def _quadro_conversas(conexao: dict) -> None:
    conversas = db.listar_conversas(conexao["usuario"], page_size=6)
    rotulos = [f"{_data_curta(c.get('atualizada_em')) or ''} · {c['titulo'][:42] or 'Conversa sem título'}" for c in conversas]
    if conexao["provedor"] == "whatsapp":
        # ponytail: lista numerada em texto; botões interativos não são confiáveis no Baileys.
        linhas = [f"{indice}. {rotulo}" for indice, rotulo in enumerate(rotulos, start=1)]
        linhas.append("0. Nova conversa")
        _enviar("whatsapp", conexao["external_chat_id"],
                "**Suas conversas recentes**\n" + "\n".join(linhas)
                + "\n\nResponda só com o número para continuar um assunto. Depois da seleção, envie sua pergunta.")
        return
    botoes = [[{"text": rotulo, "callback_data": f"clara:abrir:{c['id']}"}] for c, rotulo in zip(conversas, rotulos)]
    botoes.append([{"text": "Nova conversa", "callback_data": "clara:nova"}])
    _telegram_send(conexao["external_chat_id"],
                   "**Suas conversas recentes**\nEscolha um assunto para ver o resumo e continuar, ou comece uma nova conversa. Depois da seleção, envie sua pergunta.",
                   reply_markup={"inline_keyboard": botoes})


def _responder_callback(callback_id: str) -> None:
    token = _telegram_bot_token()
    if not token:
        return
    request = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/answerCallbackQuery",
        data=json.dumps({"callback_query_id": callback_id}).encode(),
        headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except (urllib.error.URLError, TimeoutError):
        log.warning("Não foi possível encerrar o indicador do botão Telegram")


def _selecionar_conversa(conexao: dict, conversa_id: str | None) -> None:
    """Troca a conversa ativa do canal; `None` inicia uma nova."""

    chat_id = conexao["external_chat_id"]
    provedor = conexao["provedor"]
    try:
        carregar_acesso(conexao["usuario"])
        if conversa_id is None:
            db.atualizar_conversa_canal(conexao["id"], None)
            _enviar(provedor, chat_id, "Nova conversa pronta. Qual assunto você quer começar?")
            return
        conversa = hub.verificar_dono(conversa_id, conexao["usuario"])
        if not hub.obter_contexto(conversa_id):
            _enviar(provedor, chat_id, "Esta conversa antiga ainda não tem município e período registrados. Abra-a no SusPredict para definir o contexto antes de continuar aqui.")
            return
        db.atualizar_conversa_canal(conexao["id"], conversa_id)
        _enviar(provedor, chat_id, hub.resumo_conversa(conversa))
    except (HTTPException, AcessoNegado):
        _enviar(provedor, chat_id, "Esta conversa não está disponível para seu acesso. Use /conversas para atualizar a lista.")


def _processar_callback(callback: dict) -> None:
    _responder_callback(str(callback.get("id") or ""))
    remetente = str((callback.get("from") or {}).get("id") or "")
    chat = (callback.get("message") or {}).get("chat") or {}
    conexao = db.get_conexao_canal_por_externo("telegram", remetente)
    if not conexao or chat.get("type") != "private" or str(chat.get("id")) != conexao["external_chat_id"]:
        return
    comando = str(callback.get("data") or "")
    if comando == "clara:nova":
        _selecionar_conversa(conexao, None)
    elif comando.startswith("clara:abrir:"):
        _selecionar_conversa(conexao, comando.removeprefix("clara:abrir:"))


def _processar_mensagem_canal(
    provedor: str,
    chat_id: str,
    external_user_id: str,
    username: str | None,
    texto: str,
    token_pareamento: str | None,
    transcrever: Callable[[], ResultadoTranscricao] | None,
) -> None:
    """Fluxo comum a Telegram e WhatsApp depois que o adaptador normalizou a mensagem.

    `token_pareamento` é o código quando a mensagem é um pedido de pareamento
    (string vazia = comando sem código). `transcrever` só existe para áudio.
    """

    nome = NOMES_CANAL[provedor]

    def enviar(mensagem: str) -> None:
        _enviar(provedor, chat_id, mensagem)

    if token_pareamento is not None:
        if not token_pareamento:
            enviar("Abra SusPredict, entre em Clara > Canais e gere um novo link de conexao.")
            return
        pareamento = db.reivindicar_pareamento_canal(
            _token_hash(token_pareamento), provedor, external_user_id, chat_id, username,
        )
        if not pareamento:
            enviar("Este link e invalido, expirou ou ja foi usado. Gere um novo no SusPredict.")
            return
        enviar(f"Conta localizada. Volte ao SusPredict para confirmar a conexao com este {nome}.")
        return

    conexao = db.get_conexao_canal_por_externo(provedor, external_user_id)
    if not conexao:
        enviar(f"Este {nome} ainda nao esta conectado. Gere um link em Clara > Canais no SusPredict.")
        return
    try:
        carregar_acesso(conexao["usuario"])
    except AcessoNegado:
        enviar("Seu acesso está desativado. Fale com o administrador.")
        return
    comando = texto.lower()
    if provedor == "whatsapp" and re.fullmatch(r"[0-6]", comando):
        indice = int(comando)
        if indice == 0:
            _selecionar_conversa(conexao, None)
            return
        conversas = db.listar_conversas(conexao["usuario"], page_size=6)
        if indice <= len(conversas):
            _selecionar_conversa(conexao, conversas[indice - 1]["id"])
            return
    if comando in {"/start", "/conversas", "/continuar", "/menu"} or (_telegram_sessao_expirada(conexao) and not comando.startswith("/nova")):
        _quadro_conversas(conexao)
        return
    if comando in {"/nova", "/new", "/clear"}:
        db.atualizar_conversa_canal(conexao["id"], None)
        enviar("Nova conversa pronta. Qual decisao voce precisa tomar agora?")
        return
    if transcrever is not None:
        enviar("🎙️ Recebi seu áudio. Estou transcrevendo com processamento local…")
        try:
            texto = transcrever().texto
        except AudioInvalido as exc:
            enviar(f"Não consegui usar este áudio: {exc}")
            return
        except (MidiaCanalIndisponivel, TranscricaoIndisponivel) as exc:
            log.warning("Falha ao preparar áudio do %s para transcrição: %s", nome, exc)
            enviar("Não consegui transcrever este áudio agora. Você pode tentar novamente ou enviar a pergunta em texto.")
            return

        resumo = texto if len(texto) <= 600 else f"{texto[:597].rstrip()}…"
        enviar(f"🎙️ Entendi seu áudio como:\n\n“{resumo}”\n\nVou analisar a pergunta.")
    try:
        _resposta_historico, resposta_canal = _processar_pergunta_canal(conexao, texto)
    except Exception as exc:  # pragma: no cover - defesa para webhook externo
        log.exception("Falha ao processar mensagem do %s: %s", nome, exc)
        resposta_canal = "Nao consegui consultar a Clara agora. Tente novamente em instantes."
    enviar(resposta_canal)


def processar_update_telegram(update: dict) -> None:
    update_id = str(update.get("update_id") or "").strip()
    if update_id and not db.registrar_evento_canal("telegram", update_id):
        return
    if update.get("callback_query"):
        _processar_callback(update["callback_query"])
        return
    mensagem = update.get("message") or {}
    chat = mensagem.get("chat") or {}
    remetente = mensagem.get("from") or {}
    texto = str(mensagem.get("text") or "").strip()
    tem_audio = isinstance(mensagem.get("voice") or mensagem.get("audio"), dict)
    chat_id = str(chat.get("id") or "").strip()
    external_user_id = str(remetente.get("id") or "").strip()
    if (not texto and not tem_audio) or not chat_id or not external_user_id:
        return
    if chat.get("type") != "private":
        _telegram_send(chat_id, "Por seguranca, conecte e use a Clara apenas em uma conversa privada.")
        return

    token = None
    if texto.startswith("/start "):
        partes = texto.split(maxsplit=1)
        token = partes[1].strip() if len(partes) == 2 else ""
    _processar_mensagem_canal(
        "telegram", chat_id, external_user_id, remetente.get("username"), texto, token,
        (lambda: _transcrever_audio_telegram(mensagem)) if tem_audio else None,
    )


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


# ─── WhatsApp (gateway OpenWA, ver deploy/openwa.sh) ──────────────────────────


def _whatsapp_numero() -> str:
    return re.sub(r"\D", "", os.getenv("WHATSAPP_BOT_NUMBER", ""))


def _openwa_config() -> tuple[str, str, str]:
    return (
        os.getenv("OPENWA_BASE_URL", "http://127.0.0.1:2785").strip().rstrip("/"),
        os.getenv("OPENWA_API_KEY", "").strip(),
        os.getenv("OPENWA_SESSION_ID", "").strip(),
    )


def _markdown_para_whatsapp(texto: str) -> str:
    """WhatsApp usa *negrito* e não tem títulos; o `código` inline já é nativo."""

    texto = re.sub(r"(?m)^#{1,6}\s+(.+)$", r"*\1*", str(texto or ""))
    return re.sub(r"\*\*(.+?)\*\*", r"*\1*", texto, flags=re.DOTALL)


def _whatsapp_send(chat_id: str, texto: str) -> bool:
    base_url, api_key, sessao = _openwa_config()
    if not api_key or not sessao:
        log.info("OPENWA_API_KEY/OPENWA_SESSION_ID ausentes; mensagem para %s nao enviada", chat_id)
        return False
    for parte in _dividir_texto_telegram(texto):
        request = urllib.request.Request(
            f"{base_url}/api/sessions/{urllib.parse.quote(sessao, safe='')}/messages/send-text",
            data=json.dumps({"chatId": chat_id, "text": _markdown_para_whatsapp(parte)}).encode("utf-8"),
            headers={"Content-Type": "application/json", "X-API-Key": api_key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=15):
                pass
        except (urllib.error.URLError, TimeoutError) as exc:
            log.warning("Falha ao enviar mensagem ao WhatsApp: %s", exc)
            return False
    return True


def _enviar(provedor: str, chat_id: str, texto: str) -> bool:
    if provedor == "whatsapp":
        return _whatsapp_send(chat_id, texto)
    return _telegram_send(chat_id, texto)


def _transcrever_audio_whatsapp(mensagem: dict[str, Any]) -> ResultadoTranscricao:
    midia = mensagem.get("media") if isinstance(mensagem.get("media"), dict) else {}
    mime_type = str(midia.get("mimetype") or "audio/ogg").strip()
    validar_metadados_audio(tamanho_bytes=midia.get("sizeBytes"), duracao_segundos=None, mime_type=mime_type)
    base_url, api_key, sessao = _openwa_config()
    conteudo = baixar_audio_openwa(
        base_url, api_key, sessao,
        str(mensagem.get("chatId") or mensagem.get("from") or ""),
        str(mensagem.get("id") or ""),
        midia.get("data"),
    )
    return transcrever_audio(conteudo, mime_type=mime_type, duracao_segundos=None)


def processar_evento_whatsapp(evento: dict) -> None:
    if evento.get("event") != "message.received":
        return
    mensagem = evento.get("data") if isinstance(evento.get("data"), dict) else {}
    chave = str(evento.get("idempotencyKey") or mensagem.get("id") or "").strip()
    if chave and not db.registrar_evento_canal("whatsapp", chave):
        return
    chat_id = str(mensagem.get("from") or "").strip()
    # ponytail: grupos, status e mensagens do próprio número são ignorados em silêncio —
    # responder num grupo exporia a Clara a quem não pareou.
    if mensagem.get("fromMe") or mensagem.get("isGroup") or mensagem.get("kind", "individual") != "individual" or not chat_id:
        return
    texto = str(mensagem.get("body") or "").strip()
    tem_audio = mensagem.get("type") in {"voice", "audio"}
    if not texto and not tem_audio:
        return

    contato = mensagem.get("contact") if isinstance(mensagem.get("contact"), dict) else {}
    username = (contato.get("pushname") or contato.get("name") or mensagem.get("senderPhone")
                or chat_id.split("@", 1)[0])
    pedido = re.fullmatch(r"conectar(?:\s+(\S+))?", texto, flags=re.IGNORECASE)
    _processar_mensagem_canal(
        "whatsapp", chat_id, chat_id, str(username)[:80], texto,
        (pedido.group(1) or "") if pedido else None,
        (lambda: _transcrever_audio_whatsapp(mensagem)) if tem_audio else None,
    )


@router.post("/whatsapp/webhook")
async def whatsapp_webhook(request: Request, background_tasks: BackgroundTasks):
    segredo = os.getenv("OPENWA_WEBHOOK_SECRET", "").strip()
    if not segredo:
        raise HTTPException(503, "OPENWA_WEBHOOK_SECRET precisa ser configurado")
    corpo = await request.body()
    esperado = "sha256=" + hmac.new(segredo.encode("utf-8"), corpo, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(request.headers.get("x-openwa-signature", ""), esperado):
        raise HTTPException(403, "Webhook do WhatsApp nao autorizado")
    try:
        evento = json.loads(corpo)
    except ValueError as exc:
        raise HTTPException(400, "Payload invalido") from exc
    if isinstance(evento, dict):
        background_tasks.add_task(processar_evento_whatsapp, evento)
    return {"ok": True}
