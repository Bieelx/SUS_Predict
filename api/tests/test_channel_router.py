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

    import api.core.channel_router as router_module
    importlib.reload(router_module)
    mensagens_enviadas = []
    monkeypatch.setattr(router_module, "_telegram_send", lambda chat_id, texto: mensagens_enviadas.append((chat_id, texto)) or True)
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
    assert mensagens[-1][1].startswith("Telegram conectado")

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


def test_inatividade_do_telegram_inicia_nova_conversa(canais, monkeypatch):
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
    assert conexao_atualizada["conversa_atual_id"] != primeira_conversa_id
    assert db_module.contar_conversas("user-abc", canal="telegram") == 2
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
    assert "vigilância epidemiológica" in mensagens[-1][1]


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
