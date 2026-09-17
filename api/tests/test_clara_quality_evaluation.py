"""Avaliação offline da Clara com gabarito, sem chamar provedores externos."""

import json

import pytest

from api.core.susbot_agent import _normalizar_plano, _resposta_numericamente_fiel
from api.core.susbot_intents import rotear_intencao


def _casos_de_ferramenta():
    casos = []
    itens = ("dipirona", "soro", "amoxicilina", "luvas", "seringas")
    for item in itens:
        for molde in (
            "Como está o estoque de {item}?",
            "Temos {item} no estoque?",
            "O estoque de {item} está baixo?",
            "Qual é o saldo do medicamento {item}?",
        ):
            casos.append((molde.format(item=item), "consultar_estoque"))

    for termo in ("compras", "aquisições"):
        for complemento in (
            "do município", "recentes", "de medicamentos", "de insumos", "em risco",
            "com preço alto", "para dengue", "deste ano", "da saúde", "planejadas",
        ):
            casos.append((f"Mostre as {termo} {complemento}", "consultar_aquisicoes"))

    for doenca in ("dengue", "covid", "influenza", "hepatite", "febre amarela"):
        for molde in (
            "Quantos casos de {doenca} tivemos?",
            "Mostre a epidemiologia de {doenca}",
            "Houve notificações de {doenca} em 2024?",
            "Compare os casos de {doenca} entre 2023 e 2024",
        ):
            casos.append((molde.format(doenca=doenca), "consultar_epidemiologia"))

    for termo in ("internações", "hospitalizações", "gastos hospitalares"):
        for ano in range(2020, 2025):
            casos.append((f"Mostre {termo} no SIH em {ano}", "consultar_epidemiologia"))

    for termo in ("mortes", "óbitos", "casos de mortalidade"):
        for ano in (2020, 2021, 2022, 2023, 2024):
            casos.append((f"Quantos registros de {termo} constam no SIM em {ano}?", "consultar_epidemiologia"))

    for item in itens:
        for verbo in ("Gere", "Crie"):
            casos.append((f"{verbo} um ETP para {item}", "gerar_etp"))
    return casos


CASOS_FERRAMENTA = _casos_de_ferramenta()


def test_avaliacao_tem_ao_menos_cem_formulacoes_distintas():
    assert len(CASOS_FERRAMENTA) >= 100
    assert len({pergunta for pergunta, _ in CASOS_FERRAMENTA}) == len(CASOS_FERRAMENTA)


@pytest.mark.parametrize("pergunta,esperada", CASOS_FERRAMENTA)
def test_acerto_de_ferramenta_supera_98_por_cento(pergunta, esperada):
    rota = rotear_intencao(pergunta)
    assert rota is not None
    assert rota.plano["ferramenta"] == esperada


@pytest.mark.parametrize("indice", range(100))
def test_json_do_planejador_e_normalizado_em_cem_variacoes(indice):
    ferramenta = "consultar_estoque" if indice % 2 else "consultar_epidemiologia"
    aliases = ("ferramenta", "chamar_ferramenta", "tool", "consulta")
    plano = json.dumps({
        "acao": aliases[indice % len(aliases)],
        "ferramenta": ferramenta,
        "argumentos": {"amostra": indice},
    })
    if indice % 3 == 0:
        plano = f"```json\n{plano}\n```"
    normalizado = _normalizar_plano(plano)
    assert normalizado["acao"] == "ferramenta"
    assert normalizado["ferramenta"] == ferramenta
    assert normalizado["argumentos"] == {"amostra": indice}


@pytest.mark.parametrize("item", ("dipirona", "soro", "luvas", "seringas", "amoxicilina"))
def test_escrita_nunca_e_executada_sem_confirmacao(item):
    from api.core.susbot_agent import criar_susbot_agente

    agente = criar_susbot_agente("355030", perfil="gestor")
    executou = []
    agente.tools["gerar_etp"] = lambda **argumentos: executou.append(argumentos)
    eventos = list(agente.stream_eventos(f"Gere um ETP para {item}"))

    assert executou == []
    assert any(evento["event"] == "confirmacao_pendente" for evento in eventos)
    assert next(e for e in eventos if e["event"] == "fim")["data"]["aguardando_confirmacao"] is True


@pytest.mark.parametrize("inventado", ("43", "99", "1.234", "20,5%", "2025"))
def test_numero_divergente_nunca_passa_na_checagem(inventado):
    fonte = {"quantidade": 42, "competencia": "2024"}
    assert _resposta_numericamente_fiel(f"O resultado foi {inventado}.", None, fonte) is False


@pytest.mark.parametrize("frase", (
    "queda de 89,65% frente ao ano anterior",
    "cerca de 89,7% a menos",
    "foram 65 mil casos em 2025",
    "incidência de 546,13 por 100 mil habitantes",
))
def test_reescrita_legitima_do_numero_passa_na_checagem(frase):
    fonte = {"stats": {"variacao_pct": -89.65, "casos_atual": 65016, "incidencia_atual": 546.13,
                       "periodo_inicio": "2025-02-01T00:00:00"}}
    assert _resposta_numericamente_fiel(frase, None, fonte) is True


def test_reserva_de_epidemiologia_e_texto_humano():
    from api.core.susbot_agent import _narrativa_de_reserva

    resultado = {"encontrado": True, "sistema": "SINAN", "dados": {"stats": {
        "janela": "12 Meses", "id_agravo": "Dengue", "nome_municipio": "São Paulo",
        "periodo_inicio": "2025-02-01T00:00:00", "periodo_fim": "2026-01-01T00:00:00",
        "casos_atual": 65016, "casos_anterior": 628351, "variacao_pct": -89.65,
        "possui_base_comparacao": True, "incidencia_atual": 546.13,
        "hospitalizacoes_atual": 2807, "obitos_atual": 37, "observacao": "OK",
    }}}
    texto = _narrativa_de_reserva("consultar_epidemiologia", resultado)
    assert "65.016 casos" in texto and "queda de 89,65%" in texto and "2.807 hospitalizações" in texto
    assert "possui base comparacao" not in texto and "True" not in texto
