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
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

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

    assert not llm.planejar_chamadas
    assert not llm.stream_chamadas
    assert fim["data"]["execucao"]["modo"] == "deterministico"
    assert fim["data"]["execucao"]["sem_llm"] is True


def test_stream_do_susbot_usa_llm_quando_nao_ha_ferramenta(db):
    # acao='resposta' so e aceita pra reformular algo ja dito: precisa de historico.
    from api.core.susbot_agent import criar_susbot_agente
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    class LLMSemFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            self.planejar_chamadas.append((pergunta, contexto, ferramentas))
            return {"acao": "resposta", "resposta": "", "referencia_rota": None}

    seed_susbot_municipio("3550308")
    llm = LLMSemFerramenta()
    historico = [{"pergunta": "estoque de soro?", "resposta": "Seu estoque dura 12 dias."}]
    agente = criar_susbot_agente("3550308", llm=llm, historico=historico)

    eventos = list(agente.stream_eventos("Pode repetir de forma mais simples?"))

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


def test_memoria_pessoal_identifica_usuario_e_recusa_outro_perfil(db):
    from api.core.susbot_agent import criar_susbot_agente

    llm = LLMMock()
    agente = criar_susbot_agente(
        "351300",
        usuario="user-gabriel",
        memoria_usuario={
            "fatos": {"nome": "Gabriel", "area_atuacao": "vigilância epidemiológica"},
            "topicos_frequentes": ["estoque", "alertas"],
        },
        llm=llm,
    )

    resposta_propria = next(
        evento["data"]["resposta"]
        for evento in agente.stream_eventos("Quem sou eu?")
        if evento["event"] == "fim"
    )
    resposta_terceiro = next(
        evento["data"]["resposta"]
        for evento in agente.stream_eventos("Em que área a Yasmin trabalha?")
        if evento["event"] == "fim"
    )

    assert "Gabriel" in resposta_propria
    assert "vigilância epidemiológica" in resposta_propria
    assert "estoque" in resposta_propria
    assert "Não tenho acesso" in resposta_terceiro
    assert not llm.planejar_chamadas


def test_consulta_de_insumos_em_falta_forca_ferramenta(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

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
    assert not llm.planejar_chamadas


def test_consulta_operacional_nao_inicializa_provedor_llm(db, monkeypatch):
    from api.core import susbot_agent
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    seed_susbot_municipio("351300")

    def falhar_se_inicializar():
        raise AssertionError("LLM não deveria ser inicializado nesta rota")

    monkeypatch.setattr(susbot_agent, "_montar_llm_com_fallback", falhar_se_inicializar)
    agente = susbot_agent.criar_susbot_agente("351300")
    eventos = list(agente.stream_eventos("Quais insumos estão em falta?"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["execucao"]["sem_llm"] is True
    assert fim["data"]["execucao"]["llm_planejamento"] is False


def test_consulta_epidemiologica_extrai_periodo_sem_llm(db):
    from api.core.susbot_agent import criar_susbot_agente

    llm = LLMMock()
    agente = criar_susbot_agente("351300", llm=llm)
    eventos = list(agente.stream_eventos("Internações entre 2022 e 2024"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["argumentos"]["ano_ini"] == 2022
    assert fim["data"]["plano"]["argumentos"]["ano_fim"] == 2024
    assert not llm.planejar_chamadas


def test_metricas_contabilizam_rotas_com_e_sem_llm(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.core.susbot_metrics import obter_metricas, resetar_metricas
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    class LLMSemFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            self.planejar_chamadas.append((pergunta, contexto, ferramentas))
            return {"acao": "resposta", "resposta": "", "referencia_rota": None}

    resetar_metricas()
    seed_susbot_municipio("351300")
    historico = [{"pergunta": "estoque?", "resposta": "Dipirona em risco."}]
    agente = criar_susbot_agente("351300", llm=LLMSemFerramenta(), historico=historico)
    list(agente.stream_eventos("Quais insumos estão em falta?"))
    list(agente.stream_eventos("Pode explicar melhor o que você disse?"))

    metricas = obter_metricas()
    assert metricas["respostas_total"] == 2
    assert metricas["respostas_sem_llm"] == 1
    assert metricas["chamadas_planejamento_llm"] == 1
    assert metricas["chamadas_resposta_llm"] == 1
    assert metricas["taxa_respostas_sem_llm"] == 0.5
    assert metricas["dados_pessoais_coletados"] is False


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


def test_consulta_de_utis_nao_e_confundida_com_perfil_de_outro_usuario(db):
    from api.core.susbot_agent import criar_susbot_agente

    class LLMIgnoraFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            return {"acao": "resposta", "resposta": "sem dados"}

    agente = criar_susbot_agente(
        "351300",
        usuario="user-gabriel",
        memoria_usuario={"fatos": {"nome": "Gabriel"}},
        llm=LLMIgnoraFerramenta(),
    )
    eventos = list(agente.stream_eventos("Me fale sobre a situação atual das UTIs em Cotia"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["ferramenta"] == "consultar_epidemiologia"
    assert fim["data"]["plano"]["argumentos"]["sistema"] == "SIH"
    assert fim["data"]["plano"]["argumentos"]["escopo_solicitado"] == "uti"
    assert "Não tenho acesso à memória" not in fim["data"]["resposta"]


def test_consulta_de_insumos_nao_e_confundida_com_perfil_de_outro_usuario(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    class LLMIgnoraFerramenta(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            return {"acao": "resposta", "resposta": "sem dados"}

    seed_susbot_municipio("351300")
    agente = criar_susbot_agente(
        "351300",
        usuario="user-gabriel",
        memoria_usuario={"fatos": {"nome": "Gabriel"}},
        llm=LLMIgnoraFerramenta(),
    )
    eventos = list(agente.stream_eventos("Me fale sobre os insumos de Cotia"))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["ferramenta"] == "consultar_estoque"
    assert "Amoxicilina 500mg" in fim["data"]["resposta"]
    assert "Não tenho acesso à memória" not in fim["data"]["resposta"]


@pytest.mark.parametrize("pergunta", [
    "Como está o estoque de insumos?",
    "Como está o estoque de insumos em Cotia?",
    "Me fale sobre os insumos em Cotia",
])
def test_consulta_generica_de_insumos_retorna_estoque_completo(db, pergunta):
    from api.core.susbot_agent import criar_susbot_agente
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    seed_susbot_municipio("351300")
    llm = LLMMock()
    agente = criar_susbot_agente("351300", llm=llm)

    eventos = list(agente.stream_eventos(pergunta))
    fim = next(evento for evento in eventos if evento["event"] == "fim")

    assert fim["data"]["plano"]["argumentos"] == {"somente_risco": False}
    assert fim["data"]["resultado_ferramenta"]["total_itens"] == 8
    assert "Amoxicilina 500mg" in fim["data"]["resposta"]
    assert fim["data"]["execucao"]["sem_llm"] is True
    assert not llm.planejar_chamadas


def test_fallback_llm_cai_pro_fallback_quando_primario_falha():
    from api.core.susbot_agent import FallbackClaraLLM

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

    llm = FallbackClaraLLM(LLMQuebrado(), LLMReserva())

    assert llm.planejar("pergunta", {}, []) == plano_fallback
    assert list(llm.stream_resposta("pergunta", {}, plano_fallback, None)) == ["resposta do fallback"]


def test_fallback_llm_propaga_erro_sem_fallback_configurado():
    from api.core.susbot_agent import FallbackClaraLLM

    class LLMQuebrado:
        def planejar(self, pergunta, contexto, ferramentas):
            raise RuntimeError("quota estourada")

    llm = FallbackClaraLLM(LLMQuebrado(), None)

    with pytest.raises(RuntimeError):
        llm.planejar("pergunta", {}, [])


def test_stream_sse_formata_eventos_em_blocos(db):
    from api.core.susbot_agent import criar_susbot_agente
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    agente = criar_susbot_agente("3550308", llm=LLMMock())

    sse = "".join(agente.stream_sse("Quanto dura meu estoque de soro?"))

    assert "event: status" in sse
    assert "event: token" in sse
    assert "event: referencia" in sse
    assert "event: fim" in sse


@pytest.mark.parametrize(
    "pergunta",
    ["qual o seu nome?", "quem é você", "como você se chama?", "com quem eu estou falando"],
)
def test_identidade_responde_clara_sem_llm(db, pergunta):
    """Nome da Clara não pode depender do LLM nem do histórico da conversa."""

    from api.core.susbot_agent import criar_susbot_agente

    class LLMProibido(LLMMock):
        def planejar(self, pergunta, contexto, ferramentas):
            raise AssertionError("pergunta de identidade não deve chamar o LLM")

    agente = criar_susbot_agente(
        "351300",
        usuario="user-gabriel",
        historico=[{"pergunta": "oi", "resposta": "Meu nome é SusBot."}],
        llm=LLMProibido(),
    )
    eventos = list(agente.stream_eventos(pergunta))
    resposta = next(e for e in eventos if e["event"] == "fim")["data"]["resposta"]

    assert "Clara" in resposta
    assert "SusBot" not in resposta
