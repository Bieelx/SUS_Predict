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
    "Me fale sobre os insumos em Cotia",
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
