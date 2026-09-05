import importlib
import asyncio
import os
import tempfile

from fastapi import HTTPException
import pytest
from cryptography.fernet import Fernet


class FakeAgent:
    def __init__(self, rota="/insumos"):
        self.rota = rota

    def stream_eventos(self, pergunta):
        yield {"event": "status", "data": {"mensagem": "Consultando dados"}}
        yield {"event": "token", "data": {"texto": "Resposta: "}}
        yield {"event": "token", "data": {"texto": pergunta[:30]}}
        yield {
            "event": "fim",
            "data": {
                "resposta": f"Resposta: {pergunta[:30]}",
                "referencia_rota": self.rota,
                "plano": {"acao": "ferramenta"},
                "resultado_ferramenta": {"encontrado": True},
            },
        }


@pytest.fixture()
def router(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    monkeypatch.setenv("SUSBOT_MEMORY_KEY", Fernet.generate_key().decode("ascii"))

    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    # docs/09 Fase 1: /perguntar exige linha ativa em usuarios_acesso.
    db_module.upsert_acesso("user-abc", "gestor", ["355030"], ativo=True, atribuido_por="teste")

    import api.core.susbot_router as router_module
    importlib.reload(router_module)

    monkeypatch.setattr(router_module, "criar_susbot_agente", lambda *args, **kwargs: FakeAgent())

    yield router_module, db_module

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


async def _ler_streaming_response(response):
    chunks = []
    async for chunk in response.body_iterator:
        if isinstance(chunk, bytes):
            chunks.append(chunk.decode("utf-8"))
        else:
            chunks.append(chunk)
    return "".join(chunks)


def test_perguntar_cria_reutiliza_e_persiste_historico(router):
    router_module, _db = router
    user = {"id": "user-abc", "email": "user@example.com"}

    payload = {
        "pergunta": "Quanto tempo dura o estoque de soro fisiologico 1L na unidade central?",
        "ibge6": "355030",
        "tela_origem": "insumos",
    }

    resposta = router_module.perguntar(router_module.PerguntaClaraRequest(**payload), user=user)
    texto = asyncio.run(_ler_streaming_response(resposta))
    assert resposta.headers["x-conversa-id"]
    assert "event: fim" in texto

    conversa_id = resposta.headers["x-conversa-id"]

    resposta_reuso = router_module.perguntar(
        router_module.PerguntaClaraRequest(**{**payload, "conversa_id": conversa_id, "pergunta": "E agora, quanto sobra?"}),
        user=user,
    )
    asyncio.run(_ler_streaming_response(resposta_reuso))
    assert resposta_reuso.headers["x-conversa-id"] == conversa_id

    body_conversas = router_module.listar_conversas(page=1, page_size=1, user=user)
    assert body_conversas["total"] == 1
    assert body_conversas["itens"][0]["id"] == conversa_id
    assert body_conversas["itens"][0]["titulo"].startswith("Quanto tempo dura o estoque")

    body_mensagens_1 = router_module.listar_mensagens(conversa_id, page=1, page_size=1, user=user)
    assert body_mensagens_1["total"] == 2
    assert body_mensagens_1["page"] == 1
    assert body_mensagens_1["itens"][0]["pergunta"] == "E agora, quanto sobra?"

    body_mensagens_2 = router_module.listar_mensagens(conversa_id, page=2, page_size=1, user=user)
    assert body_mensagens_2["itens"][0]["pergunta"] == payload["pergunta"]


def test_web_entrega_historico_recente_ao_agente(router, monkeypatch):
    router_module, _db = router
    historicos = []

    def criar_agente_fake(*_args, **kwargs):
        historicos.append(kwargs.get("historico") or [])
        return FakeAgent()

    monkeypatch.setattr(router_module, "criar_susbot_agente", criar_agente_fake)
    user = {"id": "user-abc", "email": "user@example.com"}
    primeira = router_module.perguntar(
        router_module.PerguntaClaraRequest(pergunta="Primeira pergunta", ibge6="355030"),
        user=user,
    )
    asyncio.run(_ler_streaming_response(primeira))
    conversa_id = primeira.headers["x-conversa-id"]

    segunda = router_module.perguntar(
        router_module.PerguntaClaraRequest(
            pergunta="O que perguntei antes?", ibge6="355030", conversa_id=conversa_id,
        ),
        user=user,
    )
    asyncio.run(_ler_streaming_response(segunda))

    assert historicos[0] == []
    assert historicos[1][0]["pergunta"] == "Primeira pergunta"


def test_perguntar_cria_outra_conversa_e_lista_paginado(router):
    router_module, _db = router
    user = {"id": "user-abc", "email": "user@example.com"}

    primeira = router_module.perguntar(
        router_module.PerguntaClaraRequest(pergunta="Primeira conversa", ibge6="355030", tela_origem="visao-geral"),
        user=user,
    )
    segunda = router_module.perguntar(
        router_module.PerguntaClaraRequest(pergunta="Segunda conversa", ibge6="355030", tela_origem="alertas"),
        user=user,
    )

    asyncio.run(_ler_streaming_response(primeira))
    asyncio.run(_ler_streaming_response(segunda))

    assert primeira.headers["x-conversa-id"]
    assert segunda.headers["x-conversa-id"]

    conversas_p1 = router_module.listar_conversas(page=1, page_size=1, user=user)
    conversas_p2 = router_module.listar_conversas(page=2, page_size=1, user=user)

    assert conversas_p1["total"] == 2
    assert conversas_p1["page"] == 1
    assert conversas_p1["page_size"] == 1
    assert conversas_p2["page"] == 2
    assert conversas_p1["itens"][0]["titulo"] == "Segunda conversa"
    assert conversas_p2["itens"][0]["titulo"] == "Primeira conversa"


def test_listagem_de_conversas_pode_filtrar_por_canal(router):
    router_module, db_module = router
    user = {"id": "user-abc"}
    app = db_module.criar_conversa("user-abc", "Conversa app")
    telegram = db_module.criar_conversa("user-abc", "Conversa Telegram")
    db_module.adicionar_mensagem(app["id"], "insumos", "Estoque?", "Ok", None)
    db_module.adicionar_mensagem(telegram["id"], "telegram", "Alertas?", "Ok", None)

    resposta_app = router_module.listar_conversas(canal="app", user=user)
    resposta_telegram = router_module.listar_conversas(canal="telegram", user=user)

    assert [item["id"] for item in resposta_app["itens"]] == [app["id"]]
    assert resposta_app["canal"] == "app"
    assert [item["id"] for item in resposta_telegram["itens"]] == [telegram["id"]]
    assert resposta_telegram["canal"] == "telegram"


def test_ownership_bloqueia_conversa_de_outro_usuario(router):
    router_module, db_module = router
    user = {"id": "user-abc", "email": "user@example.com"}

    conversa = db_module.criar_conversa(usuario="outra-pessoa", titulo="Conversa alheia")

    with pytest.raises(HTTPException) as exc:
        router_module.listar_mensagens(conversa["id"], user=user)

    assert exc.value.status_code == 403


def test_endpoints_de_memoria_usam_apenas_usuario_autenticado(router):
    router_module, _db = router
    from api.core.susbot_memory import aprender_da_mensagem

    gabriel = {"id": "user-gabriel"}
    yasmin = {"id": "user-yasmin"}
    aprender_da_mensagem("user-gabriel", "Meu nome é Gabriel.", "web")
    aprender_da_mensagem("user-yasmin", "Meu nome é Yasmin.", "web")

    memoria_gabriel = router_module.consultar_memoria(user=gabriel)
    memoria_yasmin = router_module.consultar_memoria(user=yasmin)

    assert "Gabriel" in str(memoria_gabriel)
    assert "Yasmin" not in str(memoria_gabriel)
    assert "Yasmin" in str(memoria_yasmin)
    assert "Gabriel" not in str(memoria_yasmin)

    router_module.excluir_memoria(user=gabriel)
    assert router_module.consultar_memoria(user=gabriel)["fatos"] == []
    assert "Yasmin" in str(router_module.consultar_memoria(user=yasmin))


def test_endpoint_de_metricas_expoe_somente_contagens_anonimas(router):
    router_module, _db = router
    from api.core.susbot_metrics import registrar_execucao, resetar_metricas

    resetar_metricas()
    registrar_execucao({
        "modo": "deterministico",
        "intencao": "consultar_estoque",
        "sem_llm": True,
        "llm_planejamento": False,
        "llm_resposta": False,
    })

    resposta = router_module.metricas_uso(user={"id": "user-abc"})

    assert resposta["respostas_total"] == 1
    assert resposta["taxa_respostas_sem_llm"] == 1.0
    assert resposta["dados_pessoais_coletados"] is False
    assert "usuario" not in resposta
