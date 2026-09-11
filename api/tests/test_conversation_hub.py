import importlib
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


@pytest.fixture
def banco(tmp_path, monkeypatch):
    from api.core import db
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "hub.db"))
    monkeypatch.setenv("CLARA_STORAGE", "sqlite")
    importlib.reload(db)
    monkeypatch.setattr(db, "_sync_row", lambda *args: None)
    db.init_db()
    db.upsert_acesso("gestor", "gestor", ["351300"], ativo=True)
    yield db


def conversa(banco, usuario="gestor", ibge="351300"):
    from api.core import conversation_hub as hub
    c = banco.criar_conversa(usuario, "Planejamento de insumos")
    hub.fixar_contexto(c["id"], usuario, ibge, {"periodo": "Semestre", "item": "Soro", "tela": "alertas"})
    return c


def test_contexto_nao_muda_com_painel_ou_canal(banco):
    from api.core import conversation_hub as hub
    c = conversa(banco)
    ctx = hub.fixar_contexto(c["id"], "gestor", "355030", {"periodo": "12 Meses", "item": "Outro"})
    assert ctx["ibge6"] == "351300"
    assert ctx["periodo"] == "Semestre"
    assert ctx["item"] == "Soro"
    with pytest.raises(HTTPException):
        hub.fixar_contexto(c["id"], "intruso", "351300")
    nova = banco.criar_conversa("gestor", "Demo")
    with pytest.raises(HTTPException):
        hub.fixar_contexto(nova["id"], "gestor", "351300", {"modo": "demo"})


class AgenteAcao:
    permitidas = {"gerar_etp"}

    def __init__(self):
        self.execucoes = 0

    def stream_eventos_confirmado(self, ferramenta, argumentos):
        self.execucoes += 1
        yield {"event": "fim", "data": {"resposta": "Rascunho criado", "argumentos": argumentos}}


def test_acao_idempotente_concorrente_e_reaberta(banco):
    from api.core import conversation_hub as hub
    c = conversa(banco)
    a = hub.criar_acao(c["id"], "gestor", {"ferramenta": "gerar_etp", "argumentos": {"item": "Soro"}})
    agente = AgenteAcao()

    def executar():
        try:
            return list(hub.executar_acao(a["id"], c["id"], "gestor", agente))
        except HTTPException as exc:
            assert exc.status_code == 409

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: executar(), range(4)))
    assert agente.execucoes == 1
    assert executar()[-1]["data"]["argumentos"] == {"item": "Soro"}
    assert agente.execucoes == 1
    assert hub.listar_acoes(c["id"], "gestor")[0]["status"] == "concluida"


def test_acao_cancelada_expirada_ou_de_outro_usuario_nao_executa(banco):
    from api.core import conversation_hub as hub
    c = conversa(banco)
    agente = AgenteAcao()
    a = hub.criar_acao(c["id"], "gestor", {"ferramenta": "gerar_etp"})
    with pytest.raises(HTTPException):
        list(hub.executar_acao(a["id"], c["id"], "outro", agente))
    assert hub.transicionar(a["id"], "pendente", "cancelada")
    with pytest.raises(HTTPException):
        list(hub.executar_acao(a["id"], c["id"], "gestor", agente))
    a = hub.criar_acao(c["id"], "gestor", {"ferramenta": "gerar_etp"})
    with banco._conn() as con:
        con.execute("UPDATE clara_acoes SET expira_em=? WHERE id=?", ((datetime.now(timezone.utc) - timedelta(days=1)).isoformat(), a["id"]))
    with pytest.raises(HTTPException) as exc:
        list(hub.executar_acao(a["id"], c["id"], "gestor", agente))
    assert exc.value.status_code == 410
    assert agente.execucoes == 0


def test_falha_depois_do_efeito_nao_permite_repeticao(banco):
    from api.core import conversation_hub as hub
    c = conversa(banco)
    a = hub.criar_acao(c["id"], "gestor", {"ferramenta": "gerar_etp"})

    class Falha(AgenteAcao):
        def stream_eventos_confirmado(self, *args):
            self.execucoes += 1
            raise RuntimeError("interrupção")

    agente = Falha()
    with pytest.raises(RuntimeError):
        list(hub.executar_acao(a["id"], c["id"], "gestor", agente))
    with pytest.raises(HTTPException):
        list(hub.executar_acao(a["id"], c["id"], "gestor", agente))
    assert agente.execucoes == 1


def test_escopo_privado_sem_bloquear_fontes_publicas(banco):
    from api.core.permissoes import carregar_acesso, ferramentas_no_municipio
    acesso = carregar_acesso("gestor")
    assert "gerar_etp" in ferramentas_no_municipio(acesso, "351300")
    outro = ferramentas_no_municipio(acesso, "355030")
    assert "gerar_etp" not in outro
    assert "consultar_estoque" not in outro
    assert "consultar_aquisicoes" in outro
    assert "consultar_epidemiologia" in outro


def test_clara_usa_mesma_fonte_recorte_e_unidade_da_tela(banco, monkeypatch):
    from api.core import operational_router as op
    from api.core.susbot_tools import criar_susbot_tools
    from api.core.susbot_agent import ClaraAgent
    calls = []

    def fonte(ibge, periodo):
        calls.append((ibge, periodo))
        return {"periodo": periodo, "meta": {"fonte": "teste"}, "competencia": {"competencia_referencia": "2026-08"},
                "alertas": [{"insumo_padronizado": "Soro", "unidade_fornecimento": "un", "pontos_risco_aquisicao": 0, "faixa_risco_aquisicao": "BAIXO"},
                            {"insumo_padronizado": "Soro", "unidade_fornecimento": "caixa", "pontos_risco_aquisicao": 4},
                            {"insumo_padronizado": "Soro especial", "unidade_fornecimento": "un"}]}

    monkeypatch.setattr(op, "consultar_risco_aquisicao", fonte)
    ctx = {"periodo": "Semestre", "item": "Soro", "unidade": "un"}
    tools = criar_susbot_tools("351300", {"consultar_aquisicoes"}, ctx)
    resultado = tools["consultar_aquisicoes"](item="Outro")
    assert calls == [("351300", "Semestre")]
    assert len(resultado["dados"]) == 1
    assert resultado["dados"][0]["pontos_risco_aquisicao"] == 0
    agente = ClaraAgent("351300", tools=tools, permitidas={"consultar_aquisicoes"}, contexto_conversa=ctx)
    fim = list(agente.stream_eventos("Explique o alerta de aquisição. Não trate como estoque físico."))[-1]["data"]
    assert fim["plano"]["ferramenta"] == "consultar_aquisicoes"
    assert "não medem estoque" in fim["resposta"]
    assert fim["artefato"]["linhas"][0]["pontos"] == 0


def test_telegram_seleciona_web_resume_e_preserva_contexto(banco, monkeypatch):
    from api.core import channel_router as canal, conversation_hub as hub
    c = conversa(banco)
    banco.adicionar_mensagem(c["id"], "alertas", "Qual a prioridade?", "Revisar aquisição de soro.", None)
    conexao = {"id": "link", "usuario": "gestor", "external_chat_id": "100", "ibge6": "355030", "conversa_atual_id": None}
    enviados, selecionados = [], []
    monkeypatch.setattr(canal, "_telegram_send", lambda chat, texto, **kwargs: enviados.append((texto, kwargs)))
    monkeypatch.setattr(canal, "_responder_callback", lambda _: None)
    monkeypatch.setattr(banco, "get_conexao_canal_por_externo", lambda *args: conexao)
    monkeypatch.setattr(banco, "atualizar_conversa_canal", lambda _, cid: selecionados.append(cid))
    canal._quadro_conversas(conexao)
    dados = enviados[-1][1]["reply_markup"]["inline_keyboard"][0][0]["callback_data"]
    assert len(dados.encode()) <= 64
    callback = {"id": "cb", "from": {"id": 100}, "message": {"chat": {"id": 100, "type": "private"}}, "data": dados}
    canal._processar_callback(callback)
    assert selecionados == [c["id"]]
    assert "351300" in enviados[-1][0] and "Semestre" in enviados[-1][0]
    assert "Revisar aquisição de soro" in enviados[-1][0]
    outro = conversa(banco, "outro")
    canal._processar_callback({**callback, "data": f"clara:abrir:{outro['id']}"})
    assert selecionados == [c["id"]]
    assert hub.obter_contexto(c["id"])["ibge6"] == "351300"


def test_web_confirma_acao_do_telegram_sem_aceitar_argumentos_adulterados(banco, monkeypatch):
    from api.core import susbot_router as web, conversation_hub as hub
    from api.core.auth import require_user
    from api.core.susbot_access import verificar_acesso_susbot
    c = conversa(banco)
    a = hub.criar_acao(c["id"], "gestor", {"ferramenta": "gerar_etp", "argumentos": {"item": "Soro"}})
    agente = AgenteAcao()
    capturado = []

    def factory(ibge, **kwargs):
        capturado.append((ibge, kwargs))
        agente.permitidas = kwargs["permitidas"]
        return agente

    monkeypatch.setattr(web, "criar_susbot_agente", factory)
    monkeypatch.setattr(web, "contexto_para_agente", lambda _: {})
    app = FastAPI()
    app.include_router(web.router)
    app.dependency_overrides[web.require_user] = lambda: {"id": "gestor"}
    app.dependency_overrides[web.verificar_acesso_susbot] = lambda: "teste"
    client = TestClient(app)
    body = {"conversa_id": c["id"], "ibge6": "355030", "confirmar": {"acao_id": a["id"], "ferramenta": "gerar_etp", "argumentos": {"item": "Adulterado"}}}
    for _ in range(2):
        response = client.post("/api/susbot/perguntar", json=body)
        assert response.status_code == 200
        assert '"item": "Soro"' in response.text
        assert 'Adulterado' not in response.text
    assert capturado[0][0] == "351300"
    assert agente.execucoes == 1
    banco.upsert_acesso("gestor", "gestor", ["355030"])
    assert client.post("/api/susbot/perguntar", json=body).status_code == 403
