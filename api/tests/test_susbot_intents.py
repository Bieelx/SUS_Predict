import pytest

from api.core.susbot_intents import rotear_intencao


def test_roteia_item_de_estoque_e_extrai_nome():
    rota = rotear_intencao("Quanto dura meu estoque de soro?")

    assert rota is not None
    assert rota.intencao == "consultar_estoque"
    assert rota.plano["argumentos"] == {"somente_risco": False, "item": "soro"}


@pytest.mark.parametrize("pergunta", [
    "Como está o estoque de insumos?",
    "Como está o estoque de insumos em Cotia?",
    "Como está o estoque de medicamentos?",
])
def test_consulta_geral_de_insumos_nao_confunde_categoria_com_item(pergunta):
    rota = rotear_intencao(pergunta)

    assert rota is not None
    assert rota.plano["argumentos"] == {"somente_risco": False}


def test_pergunta_conceitual_vai_para_fallback_generativo():
    assert rotear_intencao("O que é epidemiologia?") is None


def test_roteia_uti_com_escopo_e_periodo():
    rota = rotear_intencao("Como estavam as UTIs de 2021 até 2023?")

    assert rota is not None
    assert rota.intencao == "consultar_epidemiologia"
    assert rota.plano["argumentos"] == {
        "sistema": "SIH",
        "ano_ini": 2021,
        "ano_fim": 2023,
        "escopo_solicitado": "uti",
    }


def test_roteia_leitos_atuais_para_dado_informado_pela_unidade():
    rota = rotear_intencao("Quantos leitos de UTI livres temos?")

    assert rota.plano["ferramenta"] == "consultar_leitos_internacoes"
    assert rota.plano["argumentos"] == {"categoria": "leitos", "tipo_leito": "UTI"}


def test_roteia_internacoes_dengue_atuais_para_dado_da_unidade():
    rota = rotear_intencao("Quantas internações por dengue foram registradas?")

    assert rota.plano["ferramenta"] == "consultar_leitos_internacoes"
    assert rota.plano["argumentos"] == {"categoria": "internacoes_dengue"}


@pytest.mark.parametrize("pergunta", ["Me fale sobre os insumos em Cotia", "Quais insumos estão em risco?", "Explique as aquisições de insumos"])
def test_insumos_da_plataforma_nao_pressupoem_estoque_fisico(pergunta):
    rota = rotear_intencao(pergunta)
    assert rota.plano["ferramenta"] == "consultar_aquisicoes"
    assert rota.plano["argumentos"] == {}


@pytest.mark.parametrize("pergunta", [
    "me diga qual a previsão para os casos de dengue nos proximos meses",
    "qual a projeção de dengue?",
    "quantos casos esperar nos próximos 3 meses?",
])
def test_pergunta_sobre_o_futuro_pede_previsao_e_nao_o_acumulado(pergunta):
    rota = rotear_intencao(pergunta)
    assert rota.plano["ferramenta"] == "consultar_epidemiologia"
    assert rota.plano["argumentos"] == {"sistema": "SINAN", "escopo_solicitado": "previsao"}


@pytest.mark.parametrize("pergunta", [
    "quantos casos de dengue em 2025?",
    "o que é o projeto SUS Predict?",
    "previsão de ruptura de estoque?",
])
def test_pergunta_sobre_o_passado_ou_projeto_nao_vira_previsao(pergunta):
    rota = rotear_intencao(pergunta)
    assert rota is None or rota.plano["argumentos"].get("escopo_solicitado") != "previsao"


@pytest.mark.parametrize("pergunta", [
    "quero atendimento humano",
    "pode me passar pra alguém da equipe?",
    "quero falar com uma pessoa",
])
def test_pedido_de_atendimento_humano_e_reconhecido(pergunta):
    from api.core.susbot_intents import pede_atendimento_humano
    assert pede_atendimento_humano(pergunta) is True
    assert pede_atendimento_humano("como está o estoque de dipirona?") is False
