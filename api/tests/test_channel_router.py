import importlib
import os
import tempfile

import pytest
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


def test_clear_inicia_nova_conversa(canais):
    router_module, db_module, mensagens = canais
    _parear(canais)

    router_module.processar_update_telegram(_update(30, "Primeira pergunta"))
    router_module.processar_update_telegram(_update(31, "/clear"))
    router_module.processar_update_telegram(_update(32, "Pergunta depois do clear"))

    assert "Nova conversa pronta" in mensagens[-2][1]
    assert len(db_module.listar_conversas("user-abc")) == 2


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
