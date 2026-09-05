"""docs/09 Fase 1: identidade e permissão por ferramenta.

Cobre: ferramenta permitida passa; ferramenta negada é rebaixada nas três barreiras
de forma independente; usuário sem linha recebe 403; usuário inativo recebe 403 na
web e recusa no Telegram; confirmação de ferramenta sem permissão é recusada;
endpoint REST direto respeita a mesma regra.
"""

import asyncio

import pytest
from fastapi import HTTPException

from api.core import permissoes
from api.core.permissoes import (
    MENSAGEM_VISITANTE,
    ORIGEM_PROVISIONAMENTO,
    PERFIS,
    Acesso,
    AcessoNegado,
    carregar_acesso,
    ferramentas_do_perfil,
    mensagem_ferramenta_negada,
    provisionar_acesso,
    require_acesso,
)
from api.core.prompts import MENSAGEM_FORA_DO_ESCOPO, FERRAMENTAS_PLANEJAVEIS, system_prompt_planejador
from api.core.susbot_agent import criar_susbot_agente, validar_plano
from api.core.susbot_tools import criar_susbot_tools
from api.tests.test_susbot_agent import db  # noqa: F401 - fixture


class LLMPlano:
    """LLM falso que sempre propõe a ferramenta pedida — simula Gemini ignorando o enum."""

    def __init__(self, ferramenta, argumentos=None):
        self.ferramenta = ferramenta
        self.argumentos = argumentos or {}
        self.ferramentas_recebidas = None
        self.stream_chamadas = 0

    def planejar(self, pergunta, contexto, ferramentas):
        self.ferramentas_recebidas = list(ferramentas)
        return {"acao": "ferramenta", "ferramenta": self.ferramenta, "argumentos": self.argumentos}

    def stream_resposta(self, *args, **kwargs):
        self.stream_chamadas += 1
        yield "não deveria chegar aqui"


def _fim(eventos):
    return next(e for e in eventos if e["event"] == "fim")["data"]


# ── mapa de perfis ─────────────────────────────────────────────────────────────

def test_mapa_de_perfis_segue_docs_09():
    assert set(PERFIS) == {"gestor", "vigilancia", "farmacia", "admin", "visitante"}
    assert ferramentas_do_perfil("visitante") == {"sobre_o_projeto"}
    for perfil in PERFIS:
        assert "sobre_o_projeto" in ferramentas_do_perfil(perfil)
        assert "executar_sql_fallback" not in ferramentas_do_perfil(perfil)
    assert ferramentas_do_perfil("vigilancia") == {"consultar_epidemiologia", "consultar_alertas", "sobre_o_projeto"}
    assert ferramentas_do_perfil("farmacia") == {"consultar_estoque", "consultar_alertas", "gerar_etp", "sobre_o_projeto"}
    assert ferramentas_do_perfil("admin") == ferramentas_do_perfil("gestor")
    # perfil desconhecido (typo no seed) nao vira gestor por acidente
    assert ferramentas_do_perfil("superuser") == {"sobre_o_projeto"}


# ── carregar_acesso ────────────────────────────────────────────────────────────

def test_sem_linha_e_inativo_negam_e_linha_ativa_resolve(db):
    with pytest.raises(AcessoNegado):
        carregar_acesso("sem-linha")

    db.upsert_acesso("u-vig", "vigilancia", ["351300"], ativo=True, atribuido_por="admin@x")
    acesso = carregar_acesso("u-vig")
    assert acesso == Acesso("u-vig", "vigilancia", ferramentas_do_perfil("vigilancia"), ("351300",))

    db.upsert_acesso("u-vig", "vigilancia", ["351300"], ativo=False, atribuido_por="admin@x")
    with pytest.raises(AcessoNegado):
        carregar_acesso("u-vig")


# ── barreira 1: enum e descricoes do planejador ────────────────────────────────

def test_barreira_1_planejador_so_recebe_ferramentas_permitidas(db):
    permitidas = ferramentas_do_perfil("vigilancia")
    prompt = system_prompt_planejador(permitidas)
    assert "consultar_epidemiologia" in prompt
    assert "- consultar_estoque" not in prompt
    assert "gerar_etp" not in prompt

    llm = LLMPlano("consultar_epidemiologia", {"sistema": "SIH"})
    agente = criar_susbot_agente("3550308", usuario="u", llm=llm, permitidas=permitidas)
    list(agente.stream_eventos("Me mostre os dados da base"))
    assert llm.ferramentas_recebidas == [f for f in FERRAMENTAS_PLANEJAVEIS if f in permitidas]


# ── barreira 2: validar_plano ──────────────────────────────────────────────────

def test_barreira_2_validar_plano_rebaixa_com_motivo_proprio(caplog):
    permitidas = ferramentas_do_perfil("vigilancia")
    plano = {"acao": "ferramenta", "ferramenta": "consultar_estoque", "argumentos": {}}

    with caplog.at_level("WARNING", logger="sus_predict.susbot_agent"):
        rebaixado = validar_plano(plano, origem="teste", tem_historico=False, permitidas=permitidas)
    assert rebaixado["acao"] == "sem_permissao"
    assert rebaixado["ferramenta"] == "consultar_estoque"
    assert "ferramenta sem permissao" in caplog.text
    assert "fora do enum" not in caplog.text

    # permitida passa intacta
    ok = validar_plano({"acao": "ferramenta", "ferramenta": "consultar_alertas", "argumentos": {}},
                       origem="teste", tem_historico=False, permitidas=permitidas)
    assert ok["acao"] == "ferramenta" and ok["ferramenta"] == "consultar_alertas"

    # fora do enum continua fora_do_escopo, com o log antigo
    caplog.clear()
    with caplog.at_level("WARNING", logger="sus_predict.susbot_agent"):
        fora = validar_plano({"acao": "ferramenta", "ferramenta": "executar_sql_fallback"},
                             origem="teste", tem_historico=False, permitidas=permitidas)
    assert fora["acao"] == "fora_do_escopo"
    assert "fora do enum" in caplog.text


def test_barreira_2_no_agente_recusa_em_codigo_sem_llm_de_resposta(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    seed_susbot_municipio("3550308")

    llm = LLMPlano("consultar_estoque")
    # tools=todas de proposito: isola a barreira 2 da barreira 3
    agente = criar_susbot_agente(
        "3550308", usuario="u", llm=llm,
        tools=criar_susbot_tools("3550308"),
        permitidas=ferramentas_do_perfil("vigilancia"),
    )
    eventos = list(agente.stream_eventos("Me mostre os dados de hoje"))
    fim = _fim(eventos)
    assert fim["resposta"] == mensagem_ferramenta_negada("consultar_estoque")
    assert fim["resposta"] != MENSAGEM_FORA_DO_ESCOPO
    assert fim["plano"]["acao"] == "sem_permissao"
    assert fim["resultado_ferramenta"] is None
    assert llm.stream_chamadas == 0


def test_barreira_2_cobre_o_roteador_deterministico(db):
    # "estoque" casa no rotear_intencao sem LLM; vigilancia nao pode estoque.
    agente = criar_susbot_agente(
        "3550308", usuario="u", llm=LLMPlano("sobre_o_projeto"),
        tools=criar_susbot_tools("3550308"),
        permitidas=ferramentas_do_perfil("vigilancia"),
    )
    fim = _fim(list(agente.stream_eventos("Como esta o estoque de dipirona?")))
    assert fim["resposta"] == mensagem_ferramenta_negada("consultar_estoque")
    assert fim["execucao"]["modo"] == "deterministico"


# ── barreira 3: dict de tools ──────────────────────────────────────────────────

def test_barreira_3_dict_de_tools_so_tem_o_que_o_perfil_pode(db):
    tools = criar_susbot_tools("3550308", ferramentas_do_perfil("farmacia"))
    assert set(tools) == {"consultar_estoque", "consultar_alertas", "gerar_etp", "sobre_o_projeto"}
    assert "executar_sql_fallback" not in criar_susbot_tools("3550308", ferramentas_do_perfil("admin"))
    # sem argumento: todas (uso interno/testes)
    assert "executar_sql_fallback" in criar_susbot_tools("3550308")


def test_barreira_3_segura_mesmo_com_1_e_2_furadas(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    seed_susbot_municipio("3550308")

    # permitidas=None (barreiras 1 e 2 liberam tudo), mas o dict de tools e o do perfil.
    llm = LLMPlano("consultar_estoque")
    agente = criar_susbot_agente(
        "3550308", usuario="u", llm=llm,
        tools=criar_susbot_tools("3550308", ferramentas_do_perfil("vigilancia")),
    )
    fim = _fim(list(agente.stream_eventos("Me mostre os dados de hoje")))
    assert fim["resultado_ferramenta"]["encontrado"] is False
    assert fim["resultado_ferramenta"]["motivo"] == mensagem_ferramenta_negada("consultar_estoque")
    assert mensagem_ferramenta_negada("consultar_estoque") in fim["resposta"]
    assert llm.stream_chamadas == 0


def test_ferramenta_permitida_passa_com_as_tres_barreiras(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    seed_susbot_municipio("3550308")

    agente = criar_susbot_agente(
        "3550308", usuario="u", llm=LLMPlano("consultar_estoque"),
        permitidas=ferramentas_do_perfil("farmacia"),
    )
    fim = _fim(list(agente.stream_eventos("Como esta o estoque?")))
    assert fim["resultado_ferramenta"]["encontrado"] is True
    assert fim["plano"]["ferramenta"] == "consultar_estoque"


# ── confirmacao ────────────────────────────────────────────────────────────────

def test_confirmacao_exige_permissao_e_escrita(db):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    seed_susbot_municipio("3550308")

    vigilancia = criar_susbot_agente("3550308", usuario="u", permitidas=ferramentas_do_perfil("vigilancia"))
    eventos = list(vigilancia.stream_eventos_confirmado("gerar_etp", {"item": "Dipirona"}))
    assert eventos[-1]["event"] == "erro"
    assert eventos[-1]["data"]["mensagem"] == mensagem_ferramenta_negada("gerar_etp")
    assert db.get_etp is not None  # sanity
    with db._conn() as con:
        assert con.execute("SELECT count(*) FROM etps").fetchone()[0] == 0

    # leitura nunca e confirmavel, mesmo permitida
    gestor = criar_susbot_agente("3550308", usuario="u", permitidas=ferramentas_do_perfil("gestor"))
    eventos = list(gestor.stream_eventos_confirmado("consultar_estoque", {}))
    assert eventos[-1]["event"] == "erro"

    # farmacia pode
    farmacia = criar_susbot_agente("3550308", usuario="u", permitidas=ferramentas_do_perfil("farmacia"))
    fim = _fim(list(farmacia.stream_eventos_confirmado("gerar_etp", {"item": "Dipirona"})))
    assert fim["resultado_ferramenta"]["encontrado"] is True


# ── web (/perguntar) ───────────────────────────────────────────────────────────

def test_perguntar_sem_linha_vira_visitante_e_inativo_403(db):
    from api.core import susbot_router

    req = susbot_router.PerguntaClaraRequest(pergunta="oi", ibge6="355030")
    susbot_router.perguntar(req, user={"id": "sem-linha", "email": "x@y.z"})
    assert db.get_acesso("sem-linha")["perfil"] == "visitante"

    db.upsert_acesso("inativo", "gestor", [], ativo=False)
    with pytest.raises(HTTPException) as exc:
        susbot_router.perguntar(req, user={"id": "inativo"})
    assert exc.value.status_code == 403


# ── telegram ───────────────────────────────────────────────────────────────────

def test_telegram_recusa_inativo_a_cada_mensagem(db, monkeypatch):
    from api.core import channel_router

    chamadas = []
    monkeypatch.setattr(channel_router, "criar_susbot_agente", lambda *a, **k: chamadas.append(k) or None)
    conexao = {"id": "cx", "usuario": "u-tg", "ibge6": "351300", "conversa_atual_id": None}

    db.upsert_acesso("u-tg", "gestor", ["351300"], ativo=False)
    resposta, resposta_tg = channel_router._processar_pergunta_telegram(conexao, "quais alertas?")
    assert "desativado" in resposta_tg
    assert chamadas == []

    with pytest.raises(AcessoNegado):
        carregar_acesso("sem-linha-tg")
    _r, sem_linha = channel_router._processar_pergunta_telegram({**conexao, "usuario": "sem-linha-tg"}, "oi")
    assert "não foi liberado" in sem_linha
    assert chamadas == []


# ── REST direto ────────────────────────────────────────────────────────────────

def _dep(ferramenta, user):
    return require_acesso(ferramenta)(user=user)


def test_endpoint_rest_direto_respeita_o_mesmo_mapa(db):
    db.upsert_acesso("u-vig", "vigilancia", ["351300"])
    db.upsert_acesso("u-far", "farmacia", ["351300"])
    db.upsert_acesso("u-off", "gestor", ["351300"], ativo=False)

    assert _dep("consultar_epidemiologia", {"id": "u-vig"}).perfil == "vigilancia"
    assert _dep("consultar_estoque", {"id": "u-far"}).perfil == "farmacia"
    assert _dep(None, {"id": "u-vig"}).perfil == "vigilancia"  # /municipios: qualquer perfil ativo

    for ferramenta, user in [
        ("consultar_estoque", {"id": "u-vig"}),        # /ruptura para vigilancia
        ("consultar_epidemiologia", {"id": "u-far"}),  # /epidemiologia para farmacia
        ("consultar_estoque", {"id": "u-off"}),        # inativo
        ("consultar_estoque", {"id": "ninguem"}),      # sem linha -> visitante
    ]:
        with pytest.raises(HTTPException) as exc:
            _dep(ferramenta, user)
        assert exc.value.status_code == 403, (ferramenta, user)


# ── provisionamento automatico ─────────────────────────────────────────────────

@pytest.fixture()
def equipe(monkeypatch):
    monkeypatch.setattr(permissoes, "EQUIPE_AUTORIZADA", permissoes._validar_equipe({
        "Ana.Vig@Fiap.br": "vigilancia",
        "bruno@fiap.br": "farmacia",
    }))


def test_email_na_lista_ganha_perfil_e_caixa_diferente_casa(db, equipe, caplog):
    with caplog.at_level("INFO", logger="sus_predict.permissoes"):
        acesso = provisionar_acesso({"id": "u-ana", "email": "  ANA.VIG@fiap.BR "})
    assert acesso.perfil == "vigilancia"
    linha = db.get_acesso("u-ana")
    assert linha["atribuido_por"] == ORIGEM_PROVISIONAMENTO
    assert linha["ativo"] == 1
    assert "faixa=equipe" in caplog.text and "ana.vig@fiap.br" in caplog.text and "perfil=vigilancia" in caplog.text


def test_email_fora_da_lista_vira_visitante(db, equipe, caplog):
    with caplog.at_level("INFO", logger="sus_predict.permissoes"):
        acesso = provisionar_acesso({"id": "u-x", "email": "alguem@gmail.com"})
    assert acesso.perfil == "visitante"
    assert acesso.ferramentas == {"sobre_o_projeto"}
    assert "faixa=visitante" in caplog.text
    # sem e-mail no token tambem vira visitante, nunca equipe
    assert provisionar_acesso({"id": "u-sem-email"}).perfil == "visitante"


def test_visitante_so_sobre_o_projeto_e_mensagem_propria(db, equipe):
    from api.tests.susbot_seed_fixture import seed_susbot_municipio
    seed_susbot_municipio("3550308")
    acesso = provisionar_acesso({"id": "u-vis", "email": "v@gmail.com"})

    agente = criar_susbot_agente("3550308", usuario="u-vis", llm=LLMPlano("consultar_epidemiologia"),
                                 permitidas=acesso.ferramentas, perfil=acesso.perfil)
    fim = _fim(list(agente.stream_eventos("oi")))
    assert "SUS Predict" in fim["resposta"] and fim["plano"]["ferramenta"] == "sobre_o_projeto"

    fim = _fim(list(agente.stream_eventos("como esta o estoque?")))      # roteador -> estoque
    assert fim["resposta"] == MENSAGEM_VISITANTE
    fim = _fim(list(agente.stream_eventos("me mostre os dados de hoje")))  # LLM -> epidemiologia
    assert fim["resposta"] == MENSAGEM_VISITANTE
    assert MENSAGEM_VISITANTE != MENSAGEM_FORA_DO_ESCOPO
    assert MENSAGEM_VISITANTE != mensagem_ferramenta_negada("consultar_estoque")

    # REST: /municipios passa, todo endpoint de dados 403 com a mensagem de visitante
    assert _dep(None, {"id": "u-vis", "email": "v@gmail.com"}).perfil == "visitante"
    for ferramenta in ("consultar_estoque", "consultar_epidemiologia", "consultar_alertas"):
        with pytest.raises(HTTPException) as exc:
            _dep(ferramenta, {"id": "u-vis", "email": "v@gmail.com"})
        assert exc.value.status_code == 403 and exc.value.detail == MENSAGEM_VISITANTE


def test_linha_existente_nao_e_sobrescrita_nem_reativada(db, equipe):
    # admin rebaixou a Ana para visitante: o proximo login nao desfaz
    db.upsert_acesso("u-ana", "visitante", [], ativo=True, atribuido_por="admin@fiap.br")
    assert provisionar_acesso({"id": "u-ana", "email": "ana.vig@fiap.br"}).perfil == "visitante"
    assert db.get_acesso("u-ana")["atribuido_por"] == "admin@fiap.br"

    # ativo=0 continua 403, nao reativa
    db.upsert_acesso("u-bruno", "farmacia", [], ativo=False, atribuido_por="admin@fiap.br")
    with pytest.raises(AcessoNegado):
        provisionar_acesso({"id": "u-bruno", "email": "bruno@fiap.br"})
    assert db.get_acesso("u-bruno")["ativo"] == 0
    with pytest.raises(HTTPException) as exc:
        _dep(None, {"id": "u-bruno", "email": "bruno@fiap.br"})
    assert exc.value.status_code == 403


def test_admin_na_constante_falha_no_boot():
    with pytest.raises(RuntimeError, match="admin"):
        permissoes._validar_equipe({"chefe@fiap.br": "admin"})
    with pytest.raises(RuntimeError, match="desconhecido"):
        permissoes._validar_equipe({"x@fiap.br": "superuser"})
    # placeholders do repositorio passam na validacao e nao casam com e-mail real
    assert all(p != "admin" for p in permissoes.EQUIPE_AUTORIZADA.values())


def test_telegram_nao_provisiona(db):
    # Telegram nao tem e-mail do token; sem linha continua recusado (o pareamento
    # exige login web antes, onde o provisionamento ja aconteceu).
    from api.core import channel_router
    conexao = {"id": "cx", "usuario": "novo-tg", "ibge6": "351300", "conversa_atual_id": None}
    _r, tg = channel_router._processar_pergunta_telegram(conexao, "oi")
    assert "não foi liberado" in tg
    assert db.get_acesso("novo-tg") is None


def test_endpoints_operacionais_usam_require_acesso():
    from api.core import operational_router
    import inspect

    assert not hasattr(operational_router, "require_user")
    esperado = {
        "municipios": None,
        "epidemiologia": "consultar_epidemiologia",
        "visao_geral": "consultar_alertas",
        "internacoes": "consultar_epidemiologia",
        "vacinacao": "consultar_epidemiologia",
        "ruptura": "consultar_estoque",
    }
    for nome, ferramenta in esperado.items():
        fn = getattr(operational_router, nome)
        dep = inspect.signature(fn).parameters["_acesso"].default
        # a dependency e uma closure de require_acesso(ferramenta)
        assert dep.dependency.__closure__[0].cell_contents == ferramenta, nome
