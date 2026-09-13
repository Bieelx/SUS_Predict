from api.core.clara_model_policy import RACIOCINIO_AVANCADO, RACIOCINIO_LEVE, perfil_para_plano


def test_etp_e_a_unica_tarefa_avancada_na_politica_inicial():
    assert perfil_para_plano({"ferramenta": "gerar_etp"}) == RACIOCINIO_AVANCADO
    assert perfil_para_plano({"ferramenta": "consultar_estoque"}) == RACIOCINIO_LEVE

