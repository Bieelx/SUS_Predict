import importlib
import os
import tempfile

import pytest


@pytest.fixture()
def db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)

    from api.core import db as db_module

    importlib.reload(db_module)
    db_module.init_db()
    yield db_module

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


class LLMMock:
    def __init__(self):
        self.planejar_chamadas = []
        self.stream_chamadas = []

    def planejar(self, pergunta, contexto, ferramentas):
        self.planejar_chamadas.append((pergunta, contexto, ferramentas))
        return {
            "acao": "ferramenta",
            "ferramenta": "consultar_estoque",
            "argumentos": {"item": "Soro fisiológico 1L"},
            "referencia_rota": "/insumos",
        }

    def stream_resposta(self, pergunta, contexto, plano, resultado_ferramenta):
        self.stream_chamadas.append((pergunta, contexto, plano, resultado_ferramenta))
        yield "Seu estoque "
        yield "dura 12 dias."


def test_stream_do_susbot_emite_tool_token_referencia_e_fim(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_seed import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    llm = LLMMock()
    agente = criar_susbot_agente("3550308", tela_origem="visao-geral", usuario="user-1", llm=llm)

    eventos = list(agente.stream_eventos("Quanto dura meu estoque de soro?"))

    assert eventos[0]["event"] == "status"
    assert any(evento["event"] == "referencia" and evento["data"]["rota"] == "/insumos" for evento in eventos)
    assert [evento["data"]["texto"] for evento in eventos if evento["event"] == "token"] == [
        "Seu estoque ",
        "dura 12 dias.",
    ]

    fim = next(evento for evento in eventos if evento["event"] == "fim")
    assert fim["data"]["resposta"] == "Seu estoque dura 12 dias."
    assert fim["data"]["referencia_rota"] == "/insumos"
    assert fim["data"]["resultado_ferramenta"]["encontrado"] is True

    assert llm.planejar_chamadas
    assert llm.stream_chamadas
    assert llm.stream_chamadas[0][3]["encontrado"] is True


def test_stream_sse_formata_eventos_em_blocos(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_seed import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    agente = criar_susbot_agente("3550308", llm=LLMMock())

    sse = "".join(agente.stream_sse("Quanto dura meu estoque de soro?"))

    assert "event: status" in sse
    assert "event: token" in sse
    assert "event: referencia" in sse
    assert "event: fim" in sse
