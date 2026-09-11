import importlib
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone

import pytest
from cryptography.fernet import Fernet
from fastapi import BackgroundTasks, HTTPException


class FakeAgent:
    def stream_eventos(self, pergunta):
        yield {"event": "token", "data": {"texto": "Leitura municipal: "}}
        yield {"event": "token", "data": {"texto": pergunta}}
        yield {
            "event": "fim",
            "data": {"resposta": f"Leitura municipal: {pergunta}", "referencia_rota": "/alertas"},
        }


@pytest.fixture()
def canais(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    monkeypatch.setenv("CHANNEL_PAIRING_SECRET", "segredo-de-teste")
    monkeypatch.setenv("TELEGRAM_BOT_USERNAME", "SusPredictTesteBot")
    monkeypatch.setenv("TELEGRAM_WEBHOOK_SECRET", "webhook-secreto")
    monkeypatch.setenv("SUSBOT_MEMORY_KEY", Fernet.generate_key().decode("ascii"))
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN", raising=False)

    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    # docs/09 Fase 1: sem linha em usuarios_acesso o Telegram recusa a mensagem.
    db_module.upsert_acesso("user-abc", "gestor", ["351300"], ativo=True, atribuido_por="teste")

    import api.core.channel_router as router_module
    importlib.reload(router_module)
    mensagens_enviadas = []
    monkeypatch.setattr(router_module, "_telegram_send", lambda chat_id, texto, **kwargs: mensagens_enviadas.append((chat_id, texto)) or True)
    monkeypatch.setattr(router_module, "_whatsapp_send", lambda chat_id, texto: mensagens_enviadas.append((chat_id, texto)) or True)
    monkeypatch.setenv("WHATSAPP_BOT_NUMBER", "+55 11 91234-5678")
    monkeypatch.setenv("OPENWA_WEBHOOK_SECRET", "segredo-openwa-de-teste")
    monkeypatch.setattr(router_module, "criar_susbot_agente", lambda *args, **kwargs: FakeAgent())

    yield router_module, db_module, mensagens_enviadas

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _user(id="user-abc"):
    return {"id": id, "email": f"{id}@example.com"}


def _update(update_id, texto, user_id="778899", username="marcia", chat_type="private"):
    return {
        "update_id": update_id,
        "message": {
            "text": texto,
            "from": {"id": int(user_id), "username": username},
            "chat": {"id": int(user_id), "type": chat_type},
        },
    }


def _audio_update(update_id, user_id="778899", username="marcia", chat_type="private"):
    return {
        "update_id": update_id,
        "message": {
            "voice": {
                "file_id": "arquivo-voz-123",
                "duration": 8,
                "file_size": 2048,
                "mime_type": "audio/ogg",
            },
            "from": {"id": int(user_id), "username": username},
            "chat": {"id": int(user_id), "type": chat_type},
        },
    }


def _parear(canais):
    router_module, _db, _mensagens = canais
    criado = router_module.criar_pareamento(
        router_module.CriarPareamentoRequest(provedor="telegram", ibge6="351300"),
        user=_user(),
    )
    router_module.processar_update_telegram(_update(1, f"/start {criado['codigo']}"))
    reivindicado = router_module.consultar_pareamento(criado["id"], user=_user())
    conexao = router_module.confirmar_pareamento(criado["id"], user=_user())
    return criado, reivindicado, conexao


def test_pareamento_tem_token_unico_confirmacao_bilateral_e_revogacao(canais):
    router_module, db_module, mensagens = canais
    criado, reivindicado, conexao = _parear(canais)

    assert criado["status"] == "emitido"
    assert criado["codigo"] not in str(db_module.get_pareamento_canal(criado["id"]))
    assert criado["deep_link"].startswith("https://t.me/SusPredictTesteBot?start=")
    assert reivindicado["status"] == "reivindicado"
    assert reivindicado["external_username"] == "marcia"
    assert conexao["status"] == "ativo"
    assert conexao["provedor"] == "telegram"
    assert any(texto.startswith("Telegram conectado") for _, texto in mensagens)
    # Sem conversas ainda: saudação convida a começar, sem oferecer "continuar".
    assert "Sou a Clara" in mensagens[-1][1]

    itens = router_module.listar_canais(user=_user())["itens"]
    assert len(itens) == 1
    assert itens[0]["external_username"] == "marcia"

    router_module.revogar_canal("telegram", user=_user())
    assert router_module.listar_canais(user=_user())["itens"] == []


def test_conta_demo_nao_pode_criar_vinculo_persistente(canais):
    router_module, _db, _mensagens = canais

    with pytest.raises(HTTPException) as exc:
        router_module.criar_pareamento(
            router_module.CriarPareamentoRequest(provedor="telegram", ibge6="351300"),
            user=_user("dev-usuario-demo"),
        )

    assert exc.value.status_code == 403
    assert "conta regular" in str(exc.value.detail)


def test_token_e_evento_do_telegram_nao_podem_ser_reutilizados(canais):
    router_module, _db, mensagens = canais
    criado = router_module.criar_pareamento(
        router_module.CriarPareamentoRequest(ibge6="351300"), user=_user(),
    )
    update = _update(44, f"/start {criado['codigo']}")
    router_module.processar_update_telegram(update)
    router_module.processar_update_telegram(update)
    assert len(mensagens) == 1

    router_module.processar_update_telegram(_update(45, f"/start {criado['codigo']}"))
    assert "invalido" in mensagens[-1][1]


def test_mensagem_telegram_entra_no_mesmo_historico_do_usuario(canais):
    router_module, db_module, mensagens = canais
    _parear(canais)

    router_module.processar_update_telegram(_update(2, "Qual e o alerta mais urgente?"))
    conversas = db_module.listar_conversas("user-abc")
    assert len(conversas) == 1
    historico = db_module.listar_mensagens(conversas[0]["id"])
    assert historico[0]["tela_origem"] == "telegram"
    assert historico[0]["pergunta"] == "Qual e o alerta mais urgente?"
    assert "Leitura municipal" in mensagens[-1][1]

    router_module.processar_update_telegram(_update(3, "/nova"))
    router_module.processar_update_telegram(_update(4, "E o estoque?"))
    assert len(db_module.listar_conversas("user-abc")) == 2


def test_audio_telegram_e_transcrito_e_processado_como_texto(canais, monkeypatch):
    router_module, db_module, mensagens = canais
    _parear(canais)
    resultado = router_module.ResultadoTranscricao(
        texto="Como está o estoque de soro fisiológico?",
        idioma="pt",
        confianca_idioma=0.99,
        duracao_segundos=8,
    )
    monkeypatch.setattr(router_module, "_transcrever_audio_telegram", lambda _mensagem: resultado)

    router_module.processar_update_telegram(_audio_update(80))

    conversa = db_module.listar_conversas("user-abc")[0]
    historico = db_module.listar_mensagens(conversa["id"])
    assert historico[0]["pergunta"] == resultado.texto
    assert historico[0]["tela_origem"] == "telegram"
    assert any("Estou transcrevendo" in texto for _chat, texto in mensagens)
    assert any("Entendi seu áudio" in texto and resultado.texto in texto for _chat, texto in mensagens)
    assert "Leitura municipal" in mensagens[-1][1]


def test_audio_de_usuario_nao_pareado_nao_e_baixado(canais, monkeypatch):
    router_module, _db, mensagens = canais
    chamado = False

    def transcrever(_mensagem):
        nonlocal chamado
        chamado = True

    monkeypatch.setattr(router_module, "_transcrever_audio_telegram", transcrever)
    router_module.processar_update_telegram(_audio_update(81, user_id="998877"))

    assert chamado is False
    assert "ainda nao esta conectado" in mensagens[-1][1]


def test_audio_invalido_retorna_orientacao_sem_chamar_agente(canais, monkeypatch):
    router_module, db_module, mensagens = canais
    _parear(canais)

    def falhar(_mensagem):
        raise router_module.AudioInvalido("O áudio ultrapassa o limite de duração permitido.")

    monkeypatch.setattr(router_module, "_transcrever_audio_telegram", falhar)
    router_module.processar_update_telegram(_audio_update(82))

    assert db_module.listar_conversas("user-abc") == []
    assert "limite de duração" in mensagens[-1][1]


def test_clear_inicia_nova_conversa(canais):
    router_module, db_module, mensagens = canais
    _parear(canais)

    router_module.processar_update_telegram(_update(30, "Primeira pergunta"))
    router_module.processar_update_telegram(_update(31, "/clear"))
    router_module.processar_update_telegram(_update(32, "Pergunta depois do clear"))

    assert "Nova conversa pronta" in mensagens[-2][1]
    assert len(db_module.listar_conversas("user-abc")) == 2


def test_inatividade_do_telegram_oferece_conversas_sem_perder_historico(canais, monkeypatch):
    router_module, db_module, _mensagens = canais
    monkeypatch.setenv("TELEGRAM_SESSION_TIMEOUT_MINUTES", "30")
    _parear(canais)

    router_module.processar_update_telegram(_update(60, "Primeira pergunta"))
    conexao = db_module.get_conexao_canal_por_externo("telegram", "778899")
    primeira_conversa_id = conexao["conversa_atual_id"]
    uso_antigo = (datetime.now(timezone.utc) - timedelta(minutes=31)).isoformat()
    with db_module._conn() as con:
        con.execute(
            "UPDATE canal_conexoes SET ultimo_uso_em = ? WHERE id = ?",
            (uso_antigo, conexao["id"]),
        )

    router_module.processar_update_telegram(_update(61, "Pergunta depois da pausa"))

    conexao_atualizada = db_module.get_conexao_canal_por_externo("telegram", "778899")
    assert conexao_atualizada["conversa_atual_id"] == primeira_conversa_id
    assert db_module.contar_conversas("user-abc", canal="telegram") == 1
    assert "Como quer seguir?" in _mensagens[-1][1]
    assert db_module.contar_mensagens(primeira_conversa_id) == 1


def test_telegram_mantem_conversa_dentro_da_janela_de_atividade(canais, monkeypatch):
    router_module, db_module, _mensagens = canais
    monkeypatch.setenv("TELEGRAM_SESSION_TIMEOUT_MINUTES", "30")
    _parear(canais)

    router_module.processar_update_telegram(_update(70, "Primeira pergunta"))
    primeira = db_module.get_conexao_canal_por_externo("telegram", "778899")["conversa_atual_id"]
    router_module.processar_update_telegram(_update(71, "Segunda pergunta"))
    segunda = db_module.get_conexao_canal_por_externo("telegram", "778899")["conversa_atual_id"]

    assert segunda == primeira
    assert db_module.contar_conversas("user-abc", canal="telegram") == 1
    assert db_module.contar_mensagens(primeira) == 2


def test_telegram_entrega_historico_recente_ao_agente(canais, monkeypatch):
    router_module, _db, _mensagens = canais
    historicos = []

    def criar_agente_fake(*_args, **kwargs):
        historicos.append(kwargs.get("historico") or [])
        return FakeAgent()

    monkeypatch.setattr(router_module, "criar_susbot_agente", criar_agente_fake)
    _parear(canais)
    router_module.processar_update_telegram(_update(40, "Primeira pergunta"))
    router_module.processar_update_telegram(_update(41, "O que eu perguntei antes?"))

    assert historicos[0] == []
    assert historicos[1][0]["pergunta"] == "Primeira pergunta"


def test_telegram_aprende_e_exibe_memoria_do_usuario(canais):
    router_module, _db, mensagens = canais
    _parear(canais)

    router_module.processar_update_telegram(
        _update(50, "Meu nome é Gabriel e trabalho com vigilância epidemiológica."),
    )
    router_module.processar_update_telegram(_update(51, "/memoria"))

    assert "Gabriel" in mensagens[-1][1]
    assert "vigilância epidemiológica" not in mensagens[-1][1]


def test_webhook_exige_segredo_configurado(canais):
    router_module, _db, _mensagens = canais
    with pytest.raises(HTTPException) as exc:
        router_module.telegram_webhook(
            _update(9, "oi"),
            BackgroundTasks(),
            x_telegram_bot_api_secret_token="incorreto",
        )
    assert exc.value.status_code == 403

    resposta = router_module.telegram_webhook(
        _update(10, "oi"),
        BackgroundTasks(),
        x_telegram_bot_api_secret_token="webhook-secreto",
    )
    assert resposta == {"ok": True}


def test_integracao_real_recusa_segredos_ausentes(canais, monkeypatch):
    router_module, _db, _mensagens = canais
    monkeypatch.delenv("TELEGRAM_WEBHOOK_SECRET", raising=False)
    with pytest.raises(HTTPException) as exc:
        router_module.telegram_webhook(_update(11, "oi"), BackgroundTasks())
    assert exc.value.status_code == 503

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token-real-configurado")
    monkeypatch.delenv("CHANNEL_PAIRING_SECRET", raising=False)
    with pytest.raises(HTTPException) as exc:
        router_module.criar_pareamento(
            router_module.CriarPareamentoRequest(ibge6="351300"), user=_user(),
        )
    assert exc.value.status_code == 503


def test_grupos_nao_podem_parear(canais):
    router_module, _db, mensagens = canais
    criado = router_module.criar_pareamento(
        router_module.CriarPareamentoRequest(ibge6="351300"), user=_user(),
    )
    router_module.processar_update_telegram(_update(20, f"/start {criado['codigo']}", chat_type="group"))
    assert "conversa privada" in mensagens[-1][1]
    assert router_module.consultar_pareamento(criado["id"], user=_user())["status"] == "emitido"


def test_formatacao_de_estoque_para_telegram_remove_repeticao(canais):
    router_module, _db, _mensagens = canais
    resultado = {
        "encontrado": True,
        "somente_risco": False,
        "dados": [
            {
                "item": "Dipirona 500mg",
                "dias_restantes": 14.0,
                "status": "alerta",
                "qualidade": {
                    "competencia": "2026-07-14T09:00:00Z",
                    "confianca": "reduzida",
                    "defasagem_dias": 28,
                },
            },
            {
                "item": "Soro fisiológico 1L",
                "dias_restantes": 22.0,
                "status": "ok",
                "qualidade": {
                    "competencia": "2026-07-14T10:00:00Z",
                    "confianca": "reduzida",
                    "defasagem_dias": 28,
                },
            },
        ],
    }

    texto = router_module._formatar_resposta_telegram(  # pylint: disable=protected-access
        "resposta longa do agente",
        {"plano": {"ferramenta": "consultar_estoque"}, "resultado_ferramenta": resultado},
    )

    assert "📦 **Cobertura do estoque**" in texto
    assert "🟠 **Dipirona 500mg**" in texto
    assert "14 dias de cobertura · atenção" in texto
    assert "🟢 **Soro fisiológico 1L**" in texto
    assert texto.count("Fonte: estoque local") == 1
    assert texto.count("Atualização: 14/07/2026") == 1
    assert "2026-07-14T" not in texto


def test_envio_telegram_usa_html_seguro_e_parse_mode(monkeypatch):
    import api.core.channel_router as router_module

    requisicoes = []

    class RespostaFake:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    def urlopen_fake(request, timeout):
        requisicoes.append((request, timeout))
        return RespostaFake()

    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "token-de-teste")
    monkeypatch.setattr(router_module.urllib.request, "urlopen", urlopen_fake)

    assert router_module._telegram_send("123", "**Estoque <local>**\n`seguro`") is True
    payload = json.loads(requisicoes[0][0].data.decode("utf-8"))

    assert payload["parse_mode"] == "HTML"
    assert payload["text"] == "<b>Estoque &lt;local&gt;</b>\n<code>seguro</code>"
    assert payload["link_preview_options"]["is_disabled"] is True


def test_divisao_de_mensagem_longa_preserva_blocos(canais):
    router_module, _db, _mensagens = canais
    texto = "\n\n".join([f"**Item {indice}**\nDetalhes do item" for indice in range(250)])

    partes = router_module._dividir_texto_telegram(texto)  # pylint: disable=protected-access

    assert len(partes) > 1
    assert all(len(parte) <= 3500 for parte in partes)
    assert "".join(partes).replace("\n", "") == texto.replace("\n", "")


# ─── WhatsApp (OpenWA) ────────────────────────────────────────────────────────

WA_CHAT = "5511998877665@c.us"


def _wa_evento(msg_id, texto, chat=WA_CHAT, **extra):
    return {
        "event": "message.received",
        "idempotencyKey": f"msg_clara_{msg_id}",
        "data": {"id": msg_id, "from": chat, "body": texto, "type": "text", "fromMe": False,
                 "isGroup": False, "kind": "individual", "contact": {"pushname": "Marcia"}, **extra},
    }


def _parear_whatsapp(canais):
    router_module, _db, _mensagens = canais
    criado = router_module.criar_pareamento(
        router_module.CriarPareamentoRequest(provedor="whatsapp", ibge6="351300"), user=_user(),
    )
    router_module.processar_evento_whatsapp(_wa_evento("m-par", f"conectar {criado['codigo']}"))
    return criado, router_module.confirmar_pareamento(criado["id"], user=_user())


def test_whatsapp_pareia_por_link_wa_me_e_conversa_no_mesmo_historico(canais):
    router_module, db_module, mensagens = canais
    criado, conexao = _parear_whatsapp(canais)

    assert criado["deep_link"].startswith("https://wa.me/5511912345678?text=conectar%20")
    assert conexao["provedor"] == "whatsapp"
    assert conexao["external_username"] == "Marcia"
    assert any(texto.startswith("WhatsApp conectado") for _, texto in mensagens)
    assert mensagens[-1][1].endswith(", Marcia! Sou a Clara. Qual decisão você precisa tomar hoje?")

    router_module.processar_evento_whatsapp(_wa_evento("m-1", "Qual e o alerta mais urgente?"))
    conversa = db_module.listar_conversas("user-abc", canal="whatsapp")[0]
    assert db_module.listar_mensagens(conversa["id"])[0]["tela_origem"] == "whatsapp"
    assert mensagens[-1] == (WA_CHAT, "Leitura municipal: Qual e o alerta mais urgente?")

    router_module.processar_evento_whatsapp(_wa_evento("m-2", "0"))
    assert "Nova conversa pronta" in mensagens[-1][1]
    assert db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["conversa_atual_id"] is None


def _wa_voto(chave, opcao, chat=WA_CHAT):
    return {"event": "message.reaction", "idempotencyKey": chave,
            "data": {"messageId": "true_poll", "chatId": chat, "reaction": opcao, "senderId": chat}}


def test_whatsapp_quadro_vira_enquete_e_voto_seleciona_conversa(canais, monkeypatch):
    router_module, db_module, mensagens = canais
    enquetes = []
    monkeypatch.setattr(router_module, "_whatsapp_poll", lambda chat, titulo, opcoes: enquetes.append(opcoes) or True)
    _parear_whatsapp(canais)
    router_module.processar_evento_whatsapp(_wa_evento("v-1", "Estoque de dipirona"))
    conversa = db_module.listar_conversas("user-abc", canal="whatsapp")[0]
    db_module.atualizar_conversa_canal(db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["id"], None)

    router_module.processar_evento_whatsapp(_wa_evento("v-2", "/conversas"))
    opcoes = enquetes[-1]
    assert opcoes[0].startswith("1. ") and opcoes[-1] == "0. Nova conversa"

    router_module.processar_evento_whatsapp(_wa_voto("r-emoji", "👍"))
    router_module.processar_evento_whatsapp(_wa_voto("r-1", opcoes[0]))
    assert db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["conversa_atual_id"] == conversa["id"]

    router_module.processar_evento_whatsapp(_wa_voto("r-velho", "1. 01/01/2020 · sumiu"))
    assert "desatualizada" in mensagens[-1][1]

    router_module.processar_evento_whatsapp(_wa_voto("r-nova", "0. Nova conversa"))
    assert db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["conversa_atual_id"] is None
    router_module.processar_evento_whatsapp(_wa_voto("r-intruso", opcoes[0], chat="5500000000000@c.us"))
    assert db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["conversa_atual_id"] is None


def test_saudacao_por_horario_de_brasilia_e_menu_inicial(canais, monkeypatch):
    router_module, db_module, mensagens = canais
    conexao = {"usuario": "user-abc", "provedor": "whatsapp", "external_username": "Márcia Souza"}
    utc = lambda h: datetime(2026, 9, 11, h, 0, tzinfo=timezone.utc)  # Brasília = UTC-3
    assert router_module._saudacao(conexao, utc(11)) == "Bom dia, Márcia!"
    assert router_module._saudacao(conexao, utc(15)) == "Boa tarde, Márcia!"
    assert router_module._saudacao(conexao, utc(23)) == "Boa noite, Márcia!"
    assert router_module._saudacao({**conexao, "provedor": "telegram"}, utc(2)) == "Boa noite!"

    enquetes = []
    monkeypatch.setattr(router_module, "_whatsapp_poll", lambda chat, titulo, opcoes: enquetes.append((titulo, opcoes)) or True)
    _parear_whatsapp(canais)
    router_module.processar_evento_whatsapp(_wa_evento("s-1", "Estoque de dipirona"))
    router_module.processar_evento_whatsapp(_wa_evento("s-2", "/start"))
    assert enquetes[-1][1] == [router_module.MENU_NOVA, router_module.MENU_CONTINUAR]
    assert enquetes[-1][0].endswith("Como quer seguir?")

    router_module.processar_evento_whatsapp(_wa_voto("s-v1", router_module.MENU_CONTINUAR))
    assert enquetes[-1][1][-1] == "0. Nova conversa"
    router_module.processar_evento_whatsapp(_wa_voto("s-v2", router_module.MENU_NOVA))
    assert db_module.get_conexao_canal_por_externo("whatsapp", WA_CHAT)["conversa_atual_id"] is None


def test_whatsapp_ignora_nao_pareado_grupo_proprio_e_duplicado(canais):
    router_module, db_module, mensagens = canais
    router_module.processar_evento_whatsapp(_wa_evento("x-1", "oi"))
    assert "ainda nao esta conectado" in mensagens[-1][1]

    _parear_whatsapp(canais)
    total = len(mensagens)
    router_module.processar_evento_whatsapp(_wa_evento("x-2", "oi", chat="1203@g.us", isGroup=True, kind="group"))
    router_module.processar_evento_whatsapp(_wa_evento("x-3", "oi", fromMe=True))
    router_module.processar_evento_whatsapp({"event": "session.status", "data": {}})
    assert len(mensagens) == total

    router_module.processar_evento_whatsapp(_wa_evento("x-4", "Pergunta"))
    router_module.processar_evento_whatsapp(_wa_evento("x-4", "Pergunta"))
    assert db_module.contar_mensagens(db_module.listar_conversas("user-abc")[0]["id"]) == 1


def test_whatsapp_webhook_valida_assinatura_hmac(canais):
    import asyncio
    import hashlib
    import hmac as hmac_lib

    router_module, _db, _mensagens = canais
    corpo = json.dumps(_wa_evento("w-1", "oi")).encode()

    class RequestFake:
        def __init__(self, assinatura):
            self.headers = {"x-openwa-signature": assinatura}

        async def body(self):
            return corpo

    with pytest.raises(HTTPException) as exc:
        asyncio.run(router_module.whatsapp_webhook(RequestFake("sha256=errado"), BackgroundTasks()))
    assert exc.value.status_code == 403

    assinatura = "sha256=" + hmac_lib.new(b"segredo-openwa-de-teste", corpo, hashlib.sha256).hexdigest()
    tarefas = BackgroundTasks()
    assert asyncio.run(router_module.whatsapp_webhook(RequestFake(assinatura), tarefas)) == {"ok": True}
    assert len(tarefas.tasks) == 1


def test_markdown_para_whatsapp_usa_negrito_simples(canais):
    router_module, _db, _mensagens = canais
    assert router_module._markdown_para_whatsapp("## Estoque\n**Dipirona** `ok`") == "*Estoque*\n*Dipirona* `ok`"
