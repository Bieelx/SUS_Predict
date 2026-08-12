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
    # Quando a tool encontra dado, a resposta é montada de forma determinística a
    # partir do resultado real — o LLM não narra (evita hedge/alucinação de um
    # modelo rápido ignorando o resultado da ferramenta). llm.stream_resposta não
    # deve ser chamado nesse caminho.
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_seed import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    llm = LLMMock()
    agente = criar_susbot_agente("3550308", tela_origem="visao-geral", usuario="user-1", llm=llm)

    eventos = list(agente.stream_eventos("Quanto dura meu estoque de soro?"))

    assert eventos[0]["event"] == "status"
    assert any(evento["event"] == "referencia" and evento["data"]["rota"] == "/insumos" for evento in eventos)

    tokens = "".join(evento["data"]["texto"] for evento in eventos if evento["event"] == "token")
    assert "Soro fisiológico 1L" in tokens
    assert "cobertura estimada" in tokens
    assert "competência" in tokens
    assert "não comprova a relação caso→insumo" in tokens

    fim = next(evento for evento in eventos if evento["event"] == "fim")
    assert fim["data"]["resposta"] == tokens
    assert fim["data"]["referencia_rota"] == "/insumos"
    assert fim["data"]["resultado_ferramenta"]["encontrado"] is True

    assert llm.planejar_chamadas
    assert not llm.stream_chamadas


def test_stream_do_susbot_usa_llm_quando_nao_ha_ferramenta(db):
    # Pergunta genérica (acao='resposta', sem tool) continua narrada pelo LLM.
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_seed import seed_susbot_municipio

    class LLMSemFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            self.planejar_chamadas.append((pergunta, contexto, ferramentas))
            return {"acao": "resposta", "resposta": "", "referencia_rota": None}

    seed_susbot_municipio("3550308")
    llm = LLMSemFerramenta()
    agente = criar_susbot_agente("3550308", llm=llm)

    eventos = list(agente.stream_eventos("O que é dengue?"))

    tokens = [evento["data"]["texto"] for evento in eventos if evento["event"] == "token"]
    assert tokens == ["Seu estoque ", "dura 12 dias."]
    assert llm.stream_chamadas
    contexto = llm.planejar_chamadas[0][1]
    assert contexto["usuario_autenticado"] is False
    assert "usuario" not in contexto


def test_susbot_usa_historico_sem_expor_identificador_interno(db):
    from api.core.susbot_agent import criar_susbot_agente, montar_historico_recente

    llm = LLMMock()
    historico = montar_historico_recente([{
        "pergunta": "Olá, quem sou eu?",
        "resposta": "Você é o usuário dev-f0f3795a005d7c67.",
    }])
    agente = criar_susbot_agente(
        "351300",
        usuario="dev-f0f3795a005d7c67",
        historico=historico,
        llm=llm,
    )

    eventos = list(agente.stream_eventos("Qual foi nossa última conversa?"))
    resposta = next(evento["data"]["resposta"] for evento in eventos if evento["event"] == "fim")

    assert "Olá, quem sou eu?" in resposta
    assert "dev-f0f3795a005d7c67" not in resposta
    assert "identificador interno ocultado" in resposta
    assert not llm.planejar_chamadas


def test_consulta_de_insumos_em_falta_forca_ferramenta(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_seed import seed_susbot_municipio

    class LLMIgnoraFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            self.planejar_chamadas.append((pergunta, contexto, ferramentas))
            return {"acao": "resposta", "resposta": "não encontrei", "referencia_rota": None}

    seed_susbot_municipio("351300")
    llm = LLMIgnoraFerramenta()
    agente = criar_susbot_agente("351300", llm=llm)

    eventos = list(agente.stream_eventos("Quais insumos estão em falta?"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["ferramenta"] == "consultar_estoque"
    assert fim["data"]["resultado_ferramenta"]["somente_risco"] is True
    assert "Dipirona 500mg" in fim["data"]["resposta"]


def test_internacoes_por_dengue_sao_roteadas_para_sih(db):
    from api.core.susbot_agent import criar_susbot_agente

    class LLMIgnoraFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            return {"acao": "resposta", "resposta": "sem dados"}

    agente = criar_susbot_agente("351300", llm=LLMIgnoraFerramenta())
    eventos = list(agente.stream_eventos("Qual é a situação das internações por dengue?"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["ferramenta"] == "consultar_epidemiologia"
    assert fim["data"]["plano"]["argumentos"]["sistema"] == "SIH"
    assert "base SIH" in fim["data"]["resposta"]


def test_fallback_llm_cai_pro_fallback_quando_primario_falha():
    from api.core.susbot_agent import FallbackSusBotLLM

    class LLMQuebrado:
        def planejar(self, pergunta, contexto, ferramentas):
            raise RuntimeError("quota estourada")

        def stream_resposta(self, pergunta, contexto, plano, resultado_ferramenta):
            raise RuntimeError("quota estourada")
            yield  # pragma: no cover - nunca alcançado, só define o generator

    plano_fallback = {"acao": "resposta", "resposta": "", "referencia_rota": None}

    class LLMReserva:
        def planejar(self, pergunta, contexto, ferramentas):
            return plano_fallback

        def stream_resposta(self, pergunta, contexto, plano, resultado_ferramenta):
            yield "resposta do fallback"

    llm = FallbackSusBotLLM(LLMQuebrado(), LLMReserva())

    assert llm.planejar("pergunta", {}, []) == plano_fallback
    assert list(llm.stream_resposta("pergunta", {}, plano_fallback, None)) == ["resposta do fallback"]


def test_fallback_llm_propaga_erro_sem_fallback_configurado():
    from api.core.susbot_agent import FallbackSusBotLLM

    class LLMQuebrado:
        def planejar(self, pergunta, contexto, ferramentas):
            raise RuntimeError("quota estourada")

    llm = FallbackSusBotLLM(LLMQuebrado(), None)

    with pytest.raises(RuntimeError):
        llm.planejar("pergunta", {}, [])


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
