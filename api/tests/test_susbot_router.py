import importlib
import asyncio
import os
import tempfile

from fastapi import HTTPException
import pytest


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

    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()

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

    resposta = router_module.perguntar(router_module.PerguntaSusBotRequest(**payload), user=user)
    texto = asyncio.run(_ler_streaming_response(resposta))
    assert resposta.headers["x-conversa-id"]
    assert "event: fim" in texto

    conversa_id = resposta.headers["x-conversa-id"]

    resposta_reuso = router_module.perguntar(
        router_module.PerguntaSusBotRequest(**{**payload, "conversa_id": conversa_id, "pergunta": "E agora, quanto sobra?"}),
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


def test_perguntar_cria_outra_conversa_e_lista_paginado(router):
    router_module, _db = router
    user = {"id": "user-abc", "email": "user@example.com"}

    primeira = router_module.perguntar(
        router_module.PerguntaSusBotRequest(pergunta="Primeira conversa", ibge6="355030", tela_origem="visao-geral"),
        user=user,
    )
    segunda = router_module.perguntar(
        router_module.PerguntaSusBotRequest(pergunta="Segunda conversa", ibge6="355030", tela_origem="alertas"),
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


def test_ownership_bloqueia_conversa_de_outro_usuario(router):
    router_module, db_module = router
    user = {"id": "user-abc", "email": "user@example.com"}

    conversa = db_module.criar_conversa(usuario="outra-pessoa", titulo="Conversa alheia")

    with pytest.raises(HTTPException) as exc:
        router_module.listar_mensagens(conversa["id"], user=user)

    assert exc.value.status_code == 403
