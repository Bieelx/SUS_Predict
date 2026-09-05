"""Barreira de escopo da Clara: so responde com dado de ferramenta ou texto fixo.

Ollama nao e chamado: o adapter local e exercitado com urlopen mockado e o
ClaraAgent com um LLM falso.
"""

import json

import pytest

from api.core.local_llm import LocalClaraLLM
from api.core.prompts import (
    MENSAGEM_FORA_DO_ESCOPO,
    SYSTEM_PROMPT_RESPOSTA,
    TEXTO_SOBRE_O_PROJETO,
    montar_mensagem_resposta,
)
from api.core.susbot_agent import criar_susbot_agente, validar_plano
from api.tests.test_local_llm import FakeResponse
from api.tests.test_susbot_agent import db  # noqa: F401 - fixture


def _ollama_devolve(monkeypatch, plano: dict, capturado: dict | None = None):
    def urlopen(req, timeout):
        if capturado is not None:
            capturado.setdefault("chamadas", []).append(json.loads(req.data))
        corpo = {"message": {"content": json.dumps(plano)}}
        return FakeResponse(json.dumps(corpo).encode())

    monkeypatch.setattr("urllib.request.urlopen", urlopen)


class LLMPlanoFixo:
    def __init__(self, plano):
        self.plano = plano
        self.stream_chamadas = []

    def planejar(self, pergunta, contexto, ferramentas):
        return self.plano

    def stream_resposta(self, pergunta, contexto, plano, resultado_ferramenta):
        self.stream_chamadas.append(plano)
        yield "texto inventado pelo LLM"


@pytest.mark.parametrize("pergunta", ["Qual a dose maxima de dipirona para adulto?", "Oi, tudo bem? Bom dia!"])
def test_farmacologia_e_saudacao_viram_fora_do_escopo(monkeypatch, pergunta):
    _ollama_devolve(monkeypatch, {"acao": "fora_do_escopo"})
    plano = LocalClaraLLM().planejar(pergunta, {}, [])
    assert plano["acao"] == "fora_do_escopo"
    assert validar_plano(plano, origem="teste", tem_historico=False)["acao"] == "fora_do_escopo"


def test_pergunta_de_estoque_chama_consultar_estoque(monkeypatch):
    _ollama_devolve(monkeypatch, {"acao": "chamar_ferramenta", "ferramenta": "consultar_estoque", "argumentos": {"somente_risco": True}})
    plano = validar_plano(LocalClaraLLM().planejar("tem remedio acabando?", {}, []), origem="teste", tem_historico=False)
    assert plano["acao"] == "ferramenta"
    assert plano["ferramenta"] == "consultar_estoque"
    assert plano["argumentos"] == {"somente_risco": True}


def test_pergunta_sobre_o_projeto_chama_sobre_o_projeto(monkeypatch):
    _ollama_devolve(monkeypatch, {"acao": "chamar_ferramenta", "ferramenta": "sobre_o_projeto"})
    plano = validar_plano(LocalClaraLLM().planejar("o que e o SUS Predict?", {}, []), origem="teste", tem_historico=False)
    assert plano == {"acao": "ferramenta", "ferramenta": "sobre_o_projeto", "argumentos": {}, "resposta": "", "referencia_rota": None}


def test_fora_do_escopo_nao_chama_geracao_e_emite_recusa_padronizada(db):  # noqa: F811
    llm = LLMPlanoFixo({"acao": "fora_do_escopo"})
    agente = criar_susbot_agente("3550308", llm=llm)

    eventos = list(agente.stream_eventos("Qual a dose maxima de dipirona?"))

    assert not llm.stream_chamadas
    tokens = "".join(e["data"]["texto"] for e in eventos if e["event"] == "token")
    fim = next(e for e in eventos if e["event"] == "fim")
    assert tokens == MENSAGEM_FORA_DO_ESCOPO
    assert fim["data"]["resposta"] == MENSAGEM_FORA_DO_ESCOPO
    assert fim["data"]["plano"]["acao"] == "fora_do_escopo"
    assert fim["data"]["resultado_ferramenta"] is None
    assert fim["data"]["execucao"]["llm_resposta"] is False


def test_sobre_o_projeto_devolve_texto_curado_sem_llm(db):  # noqa: F811
    llm = LLMPlanoFixo({"acao": "chamar_ferramenta", "ferramenta": "sobre_o_projeto"})
    agente = criar_susbot_agente("3550308", llm=llm)
    fim = next(e for e in agente.stream_eventos("o que voce faz?") if e["event"] == "fim")
    assert fim["data"]["resposta"] == TEXTO_SOBRE_O_PROJETO
    assert not llm.stream_chamadas


def test_ferramenta_vazia_nao_inventa_dados(db):  # noqa: F811
    llm = LLMPlanoFixo({"acao": "chamar_ferramenta", "ferramenta": "consultar_alertas"})
    tools = {"consultar_alertas": lambda **_: {"encontrado": False, "motivo": "Sem alertas ativos."}}
    agente = criar_susbot_agente("3550308", llm=llm, tools=tools)
    fim = next(e for e in agente.stream_eventos("quais alertas?") if e["event"] == "fim")
    assert fim["data"]["resposta"].startswith("Sem alertas ativos.")
    assert "inventado" not in fim["data"]["resposta"]
    assert not llm.stream_chamadas


def test_ferramenta_preenchida_com_acao_diferente_e_ignorada(caplog):
    with caplog.at_level("WARNING", logger="sus_predict.susbot_agent"):
        plano = validar_plano(
            {"acao": "responder", "ferramenta": "gerar_etp", "argumentos": {"item": "x"}},
            origem="GroqClaraLLM", tem_historico=True,
        )
    assert plano["acao"] == "resposta"
    assert plano["ferramenta"] is None
    assert plano["argumentos"] == {}
    assert "ignorado" in caplog.text and "GroqClaraLLM" in caplog.text


def test_responder_sem_historico_e_rebaixado_com_log_da_origem(caplog):
    with caplog.at_level("WARNING", logger="sus_predict.susbot_agent"):
        plano = validar_plano({"acao": "responder"}, origem="GeminiClaraLLM", tem_historico=False)
    assert plano["acao"] == "fora_do_escopo"
    assert "GeminiClaraLLM" in caplog.text


@pytest.mark.parametrize("plano", [{"acao": "explicar"}, {"acao": "chamar_ferramenta", "ferramenta": "executar_sql_fallback"}])
def test_acao_ou_ferramenta_fora_do_enum_rebaixam(plano):
    assert validar_plano(plano, origem="teste", tem_historico=True)["acao"] == "fora_do_escopo"


def test_prompt_de_resposta_ancora_nos_dados():
    assert "exclusivamente" in SYSTEM_PROMPT_RESPOSTA
    assert "não encontrou a informação" in SYSTEM_PROMPT_RESPOSTA
    assert "Nunca invente números, datas, nomes, valores, códigos" in SYSTEM_PROMPT_RESPOSTA
    msg = montar_mensagem_resposta("p", {}, {"acao": "ferramenta"}, {"encontrado": True, "dados": [1]})
    assert "=== DADOS DA FERRAMENTA (inicio) ===" in msg
    assert msg.index("PERGUNTA DO USUARIO") < msg.index("=== DADOS DA FERRAMENTA (inicio) ===")


def test_sessao_nova_com_pergunta_de_dominio_nao_e_rebaixada(db):  # noqa: F811
    """Primeira mensagem da conversa (historico vazio): pergunta legitima vai para a ferramenta."""
    from api.tests.susbot_seed_fixture import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    # Caso 1: roteador local resolve sem LLM (caminho do /start numa demo).
    llm = LLMPlanoFixo({"acao": "fora_do_escopo"})
    agente = criar_susbot_agente("3550308", llm=llm, historico=[])
    fim = next(e for e in agente.stream_eventos("quanto de dipirona tem em estoque?") if e["event"] == "fim")
    assert fim["data"]["plano"]["acao"] == "ferramenta"
    assert fim["data"]["plano"]["ferramenta"] == "consultar_estoque"
    assert fim["data"]["resposta"] != MENSAGEM_FORA_DO_ESCOPO

    # Caso 2: formulacao que escapa do roteador e chega ao LLM, ainda sem historico.
    llm = LLMPlanoFixo({"acao": "chamar_ferramenta", "ferramenta": "consultar_estoque", "argumentos": {"item": "dipirona"}})
    agente = criar_susbot_agente("3550308", llm=llm, historico=[])
    fim = next(e for e in agente.stream_eventos("e a dipirona, como anda?") if e["event"] == "fim")
    assert fim["data"]["plano"]["acao"] == "ferramenta"
    assert fim["data"]["execucao"]["llm_planejamento"] is True
    assert fim["data"]["resposta"] != MENSAGEM_FORA_DO_ESCOPO


@pytest.mark.parametrize("pergunta", [
    "oi", "Olá!", "bom dia", "Boa tarde.", "boa noite", "tudo bem?", "E aí?", "Oi Clara, tudo bem?",
    "Olá, bom dia!", "oi, tudo bom", "opa", "beleza?",
])
def test_saudacao_pura_resolve_em_sobre_o_projeto_sem_llm(db, pergunta):  # noqa: F811
    from api.core.susbot_intents import rotear_intencao

    rota = rotear_intencao(pergunta)
    assert rota is not None and rota.plano["ferramenta"] == "sobre_o_projeto"

    llm = LLMPlanoFixo({"acao": "fora_do_escopo"})
    agente = criar_susbot_agente("3550308", llm=llm, historico=[])
    fim = next(e for e in agente.stream_eventos(pergunta) if e["event"] == "fim")
    assert fim["data"]["resposta"] == TEXTO_SOBRE_O_PROJETO
    assert fim["data"]["execucao"]["sem_llm"] is True
    assert not llm.stream_chamadas


@pytest.mark.parametrize("pergunta, ferramenta", [
    ("bom dia, quanto de dipirona tem em estoque?", "consultar_estoque"),
    ("Oi! Quais alertas estão abertos?", "consultar_alertas"),
    ("boa tarde, internações de 2023 a 2024", "consultar_epidemiologia"),
])
def test_saudacao_seguida_de_pergunta_vai_para_a_ferramenta_certa(pergunta, ferramenta):
    from api.core.susbot_intents import rotear_intencao

    rota = rotear_intencao(pergunta)
    assert rota is not None
    assert rota.plano["ferramenta"] == ferramenta


@pytest.mark.parametrize("pergunta", ["qual seu time?", "você gosta de música?", "oi, me conta uma piada", "bom dia, qual a capital da França?"])
def test_social_que_nao_e_saudacao_continua_recusada(db, pergunta):  # noqa: F811
    from api.core.susbot_intents import rotear_intencao

    assert rotear_intencao(pergunta) is None
    llm = LLMPlanoFixo({"acao": "fora_do_escopo"})
    agente = criar_susbot_agente("3550308", llm=llm, historico=[])
    fim = next(e for e in agente.stream_eventos(pergunta) if e["event"] == "fim")
    assert fim["data"]["resposta"] == MENSAGEM_FORA_DO_ESCOPO
