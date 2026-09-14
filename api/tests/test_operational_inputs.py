"""Contrato da Clara com as tabelas operacionais, isolado do Supabase online."""
import json
import sqlite3
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from api.core.local_records_store import Store
from api.core.operational_inputs_interpreter import interpret_operational_input
from api.core.operational_inputs_service import OperationalInputs

ACTOR = "788b2c75-4984-4a4d-acd1-b30000000001"
OTHER = "788b2c75-4984-4a4d-acd1-b30000000002"
ESTABLISHMENT = "3550302027275"


@pytest.fixture
def svc(tmp_path):
    path = tmp_path / "operational.db"
    with sqlite3.connect(path) as tx:
        tx.executescript('''
          CREATE TABLE usuarios_acesso(usuario TEXT PRIMARY KEY,perfil TEXT,municipios TEXT,ativo BOOLEAN);
          CREATE TABLE ibge_sp(cod_sus TEXT PRIMARY KEY,nome_municipio TEXT);
          CREATE TABLE estabelecimentos(id TEXT PRIMARY KEY,cnes TEXT,no_fantasia TEXT,no_municipio TEXT,
            municipio_ibge6 TEXT,atende_sus BOOLEAN);
          CREATE TABLE clara_inputs_operacionais(id TEXT PRIMARY KEY,user_id TEXT,id_estabelecimento TEXT,tipo TEXT,
            texto_original TEXT,payload_proposto TEXT,payload_confirmado TEXT,status TEXT,versao INTEGER,
            chave_idempotencia TEXT,request_hash TEXT,operacao_chave TEXT,operacao_hash TEXT,tabela_destino TEXT,
            registro_destino_id INTEGER,criado_em TEXT,atualizado_em TEXT,confirmado_em TEXT,confirmado_por TEXT,
            rejeitado_em TEXT,rejeitado_por TEXT,motivo_rejeicao TEXT,UNIQUE(user_id,chave_idempotencia));
          CREATE TABLE vacinacao_usuario(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,nome_vacina TEXT,
            qtd_doses INTEGER,tipo_movimentacao TEXT,id_estabelecimento TEXT,data_atualizacao TEXT);
          CREATE TABLE vacinacao_estabelecimento(id INTEGER PRIMARY KEY AUTOINCREMENT,id_estabelecimento TEXT,
            nome_vacina TEXT,qtd_doses INTEGER,data_atualizacao TEXT,UNIQUE(id_estabelecimento,nome_vacina));
          CREATE TABLE medicamento_usuario(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,nome_medicamento TEXT,
            concentracao TEXT,forma_farmaceutica TEXT,tipo_embalagem TEXT,quantidade_por_embalagem INTEGER,
            qtd_embalagens INTEGER,tipo_movimentacao TEXT,id_estabelecimento TEXT,data_atualizacao TEXT);
          CREATE TABLE medicamento_estabelecimento(id INTEGER PRIMARY KEY AUTOINCREMENT,id_estabelecimento TEXT,
            nome_medicamento TEXT,concentracao TEXT,forma_farmaceutica TEXT,tipo_embalagem TEXT,
            quantidade_por_embalagem INTEGER,qtd_embalagens INTEGER,data_atualizacao TEXT,
            UNIQUE(id_estabelecimento,nome_medicamento,concentracao,forma_farmaceutica,tipo_embalagem,quantidade_por_embalagem));
          CREATE TABLE internacao_usuario(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,id_estabelecimento TEXT,
            tipo_leito TEXT,qtd_leitos_ocupados INTEGER,qtd_leitos_disponiveis INTEGER,data_atualizacao TEXT);
          CREATE TABLE internacao_estabelecimento(id INTEGER PRIMARY KEY AUTOINCREMENT,id_estabelecimento TEXT,
            tipo_leito TEXT,qtd_leitos_ocupados INTEGER,qtd_leitos_disponiveis INTEGER,data_atualizacao TEXT,
            UNIQUE(id_estabelecimento,tipo_leito));
          CREATE TABLE internacao_dengue_usuario(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,id_estabelecimento TEXT,
            qtd_internacoes INTEGER,data_atualizacao TEXT);
          CREATE TABLE internacao_dengue_estabelecimento(id INTEGER PRIMARY KEY AUTOINCREMENT,id_estabelecimento TEXT UNIQUE,
            qtd_internacoes INTEGER,data_atualizacao TEXT);
          CREATE TRIGGER internacao_dengue_consolidar AFTER INSERT ON internacao_dengue_usuario BEGIN
            INSERT INTO internacao_dengue_estabelecimento(id_estabelecimento,qtd_internacoes,data_atualizacao)
            VALUES(NEW.id_estabelecimento,NEW.qtd_internacoes,NEW.data_atualizacao)
            ON CONFLICT(id_estabelecimento) DO UPDATE SET
              qtd_internacoes=qtd_internacoes+excluded.qtd_internacoes,data_atualizacao=excluded.data_atualizacao;
          END;
          CREATE TRIGGER vacinacao_consolidar AFTER INSERT ON vacinacao_usuario BEGIN
            INSERT INTO vacinacao_estabelecimento(id_estabelecimento,nome_vacina,qtd_doses,data_atualizacao)
            VALUES(NEW.id_estabelecimento,NEW.nome_vacina,
              CASE NEW.tipo_movimentacao WHEN 'entrada' THEN NEW.qtd_doses ELSE -NEW.qtd_doses END,NEW.data_atualizacao)
            ON CONFLICT(id_estabelecimento,nome_vacina) DO UPDATE SET
              qtd_doses=qtd_doses+excluded.qtd_doses,data_atualizacao=excluded.data_atualizacao;
          END;
          CREATE TRIGGER internacao_consolidar AFTER INSERT ON internacao_usuario BEGIN
            INSERT INTO internacao_estabelecimento(id_estabelecimento,tipo_leito,qtd_leitos_ocupados,qtd_leitos_disponiveis,data_atualizacao)
            VALUES(NEW.id_estabelecimento,NEW.tipo_leito,NEW.qtd_leitos_ocupados,NEW.qtd_leitos_disponiveis,NEW.data_atualizacao)
            ON CONFLICT(id_estabelecimento,tipo_leito) DO UPDATE SET qtd_leitos_ocupados=excluded.qtd_leitos_ocupados,
              qtd_leitos_disponiveis=excluded.qtd_leitos_disponiveis,data_atualizacao=excluded.data_atualizacao;
          END;
        ''')
        tx.execute("INSERT INTO usuarios_acesso VALUES (?,?,?,true)", (ACTOR, "gestor", json.dumps(["355030"])))
        tx.execute("INSERT INTO usuarios_acesso VALUES (?,?,?,true)", (OTHER, "gestor", json.dumps(["350950"])))
        tx.execute("INSERT INTO ibge_sp VALUES ('355030','São Paulo')")
        tx.execute("INSERT INTO estabelecimentos VALUES (?,?,?,?,?,true)",
                   (ESTABLISHMENT, "2027275", "UBS Vila Albertina", "São Paulo", "355030"))
    def access(actor):
        city = "355030" if actor == ACTOR else "350950"
        return SimpleNamespace(perfil="gestor", municipios=(city,))
    return OperationalInputs(Store(sqlite_path=path), access)


def test_interpreta_os_tres_contratos_sem_confundir_aplicacao_com_saida():
    vaccine = interpret_operational_input("Entrada de 500 doses da vacina COVID-19")
    assert vaccine == {"tipo": "vacinacao", "payload": {
        "nome_vacina": "covid-19", "qtd_doses": 500, "tipo_movimentacao": "entrada"}}
    beds = interpret_operational_input("UTI: 19 leitos ocupados e 1 disponível")
    assert beds["tipo"] == "internacao" and beds["payload"]["qtd_leitos_ocupados"] == 19
    medicine = interpret_operational_input(
        "Saída de 2 embalagens de Paracetamol; concentração 500 mg; forma comprimido; embalagem caixa; 20 unidades por embalagem")
    assert medicine["tipo"] == "medicamento" and medicine["payload"]["qtd_embalagens"] == 2
    with pytest.raises(HTTPException):
        interpret_operational_input("Aplicamos 32 doses contra dengue")


def test_data_informada_vai_para_tabela_operacional(svc):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    yesterday = (datetime.now(ZoneInfo("America/Sao_Paulo")).date() - timedelta(days=1)).isoformat()
    draft = svc.create_draft(
        ACTOR, ESTABLISHMENT, "Ontem recebemos 200 doses da vacina dengue", "reported-date"
    )
    assert draft["payload_proposto"]["data_atualizacao"] == yesterday

    confirmed = svc.confirm(ACTOR, draft["id"], 1, "confirm-reported-date")
    assert confirmed["payload_confirmado"]["data_atualizacao"] == yesterday
    with svc.store.transaction() as tx:
        assert tx.one("SELECT data_atualizacao FROM vacinacao_usuario")["data_atualizacao"] == yesterday


@pytest.mark.parametrize("offset,code", [(1, "periodo_futuro"), (-31, "periodo_muito_antigo")])
def test_data_futura_ou_com_mais_de_30_dias_e_recusada(svc, offset, code):
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    day = (datetime.now(ZoneInfo("America/Sao_Paulo")).date() + timedelta(days=offset)).isoformat()
    with pytest.raises(HTTPException) as exc:
        svc.create_draft(
            ACTOR, ESTABLISHMENT, f"Em {day}, recebemos 10 doses da vacina dengue", f"date-{offset}"
        )
    assert exc.value.detail["codigo"] == code
    assert "data" in exc.value.detail["mensagem"].lower()


def test_correcao_nao_aceita_registro_com_mais_de_24_horas(svc):
    draft = svc.create_draft(ACTOR, ESTABLISHMENT, "Entrada de 30 doses da vacina dengue", "old-correction")
    svc.confirm(ACTOR, draft["id"], 1, "confirm-old-correction")
    with svc.store.transaction() as tx:
        tx.execute(
            "UPDATE clara_inputs_operacionais SET confirmado_em=? WHERE id=?",
            ("2026-01-01T00:00:00+00:00", draft["id"]),
        )

    with pytest.raises(HTTPException) as exc:
        svc.create_correction_draft(ACTOR, "Corrigir: eram 25 doses, não 30", "too-old")
    assert exc.value.detail["codigo"] == "registro_corrigivel_nao_encontrado"


def test_rascunho_nao_altera_saldo_e_confirmacao_aciona_trigger(svc):
    draft = svc.create_draft(ACTOR, ESTABLISHMENT, "Entrada de 500 doses da vacina COVID-19", "message-001")
    with svc.store.transaction() as tx:
        assert tx.one("SELECT count(*) total FROM vacinacao_usuario")["total"] == 0
        assert tx.one("SELECT count(*) total FROM vacinacao_estabelecimento")["total"] == 0
    result = svc.confirm(ACTOR, draft["id"], 1, "confirm-001")
    assert result["status"] == "confirmado"
    assert result["tabela_destino"] == "vacinacao_usuario"
    assert result["payload_confirmado"]["nome_vacina"] == "COVID-19"
    with svc.store.transaction() as tx:
        assert tx.one("SELECT qtd_doses FROM vacinacao_estabelecimento")["qtd_doses"] == 500
    assert svc.confirm(ACTOR, draft["id"], 1, "confirm-001")["replay"] is True


def test_gemini_so_estrutura_relato_complexo_e_o_servico_ainda_valida(svc, monkeypatch):
    from api.core import operational_inputs_service
    monkeypatch.setattr(operational_inputs_service, "interpretar_com_gemini", lambda _: [{
        "tipo": "vacinacao",
        "payload": {"nome_vacina": "dengue", "qtd_doses": 25, "tipo_movimentacao": "entrada"},
        "pendencias": [],
    }])

    draft = svc.create_draft(ACTOR, ESTABLISHMENT, "Chegaram 25 doses para dengue na unidade", "gemini-001")

    assert draft["status"] == "rascunho"
    assert draft["texto_original"] == "Chegaram 25 doses para dengue na unidade"
    assert draft["payload_proposto"]["qtd_doses"] == 25
    with svc.store.transaction() as tx:
        assert tx.one("SELECT count(*) total FROM vacinacao_usuario")["total"] == 0


def test_gemini_com_payload_invalido_nao_cria_rascunho(svc, monkeypatch):
    from api.core import operational_inputs_service
    monkeypatch.setattr(operational_inputs_service, "interpretar_com_gemini", lambda _: [{
        "tipo": "vacinacao", "payload": {"qtd_doses": 25}, "pendencias": [],
    }])

    with pytest.raises(HTTPException) as exc:
        svc.create_draft(ACTOR, ESTABLISHMENT, "Chegaram doses", "gemini-invalid-001")
    assert exc.value.detail["codigo"] == "campos_invalidos"


def _mock_gemini_http(monkeypatch, proposta):
    from api.core import gemini_input_interpreter

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            body = {"candidates": [{"content": {"parts": [{"text": json.dumps(proposta)}]}}]}
            return json.dumps(body).encode()

    monkeypatch.setenv("GEMINI_API_KEY", "fake-key")
    monkeypatch.setenv("SUSBOT_GEMINI_INPUT_ENABLED", "true")
    monkeypatch.setattr(gemini_input_interpreter.urllib.request, "urlopen", lambda *a, **k: Response())
    return gemini_input_interpreter


def test_gemini_retorna_varios_itens_e_internacao_dengue_sem_rede(monkeypatch):
    module = _mock_gemini_http(monkeypatch, {"itens": [
        {"tipo": "vacinacao", "payload": {"nome_vacina": "dengue", "qtd_doses": 30,
         "tipo_movimentacao": "saida"}, "pendencias": []},
        {"tipo": "internacao_dengue", "payload": {"qtd_internacoes": 2}, "pendencias": []},
    ]})

    items = module.interpretar_com_gemini("Aplicamos 30 doses de dengue e internamos 2 pessoas por dengue")

    assert [item["tipo"] for item in items] == ["vacinacao", "internacao_dengue"]
    assert items[1]["payload"]["qtd_internacoes"] == 2


def test_gemini_rejeita_numero_que_nao_aparece_no_relato(monkeypatch):
    module = _mock_gemini_http(monkeypatch, {"itens": [{
        "tipo": "vacinacao", "payload": {"nome_vacina": "dengue", "qtd_doses": 99,
        "tipo_movimentacao": "entrada"}, "pendencias": [],
    }]})

    assert module.interpretar_com_gemini("Recebemos doses de dengue") is None


def test_leitos_substituem_e_municipio_limita_estabelecimento(svc):
    for occupied, available in ((18, 2), (19, 1)):
        draft = svc.create_draft(ACTOR, ESTABLISHMENT,
            f"UTI: {occupied} leitos ocupados e {available} disponíveis", f"beds-{occupied}")
        svc.confirm(ACTOR, draft["id"], 1, f"confirm-beds-{occupied}")
    with svc.store.transaction() as tx:
        row = tx.one("SELECT * FROM internacao_estabelecimento")
        assert (row["qtd_leitos_ocupados"], row["qtd_leitos_disponiveis"]) == (19, 1)
        assert row["tipo_leito"] == "UTI"
    with pytest.raises(HTTPException) as exc:
        svc.create_draft(OTHER, ESTABLISHMENT, "Entrada de 1 doses de dengue", str(uuid4()))
    assert exc.value.detail["codigo"] == "municipio_nao_autorizado"


def test_ferramenta_consulta_leitos_e_internacoes_da_unidade(svc, monkeypatch):
    from api.core import local_records_store
    from api.core.susbot_tools import criar_susbot_tools

    beds = svc.create_draft(ACTOR, ESTABLISHMENT, "UTI: 8 leitos ocupados e 2 disponíveis", "tool-beds")
    svc.confirm(ACTOR, beds["id"], 1, "confirm-tool-beds")
    dengue = svc.create_draft(
        ACTOR, ESTABLISHMENT, "internamos 3 por dengue", "tool-dengue",
        {"tipo": "internacao_dengue", "payload": {"qtd_internacoes": 3}},
    )
    svc.confirm(ACTOR, dengue["id"], 1, "confirm-tool-dengue")
    monkeypatch.setattr(local_records_store, "configured_store", lambda: svc.store)

    result = criar_susbot_tools("3550308")["consultar_leitos_internacoes"]()

    assert result["encontrado"] is True
    assert result["fonte"] == "Dados informados pelas unidades; não é DATASUS."
    assert {item["categoria"] for item in result["dados"]} == {"leitos", "internacoes_dengue"}
    assert all(item["estabelecimento"] == "UBS Vila Albertina" for item in result["dados"])
    assert all(item["data_ultima_atualizacao"] for item in result["dados"])


def test_estabelecimentos_sao_restritos_ao_municipio(svc):
    items = svc.establishments(ACTOR, "Albertina")["itens"]
    assert len(items) == 1 and items[0]["nome_municipio"] == "São Paulo"
    assert svc.establishments(OTHER)["itens"] == []


def test_modo_explicito_da_clara_emite_rascunho_sem_confirmar(svc, monkeypatch, tmp_path):
    from api.core import operational_inputs_router, susbot_router
    monkeypatch.setattr(operational_inputs_router, "service", lambda: svc)
    monkeypatch.setattr(susbot_router, "provisionar_acesso_http", lambda user: None)
    from api.core import db
    monkeypatch.setattr(db, '_SQLITE_PATH', str(tmp_path / 'conversations.db'))
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    app = FastAPI()
    app.include_router(susbot_router.router)
    app.dependency_overrides[susbot_router.require_user] = lambda: {"id": ACTOR}
    app.dependency_overrides[susbot_router.verificar_acesso_susbot] = lambda: "test"
    with TestClient(app) as client:
        response = client.post("/api/susbot/perguntar", json={
            "pergunta": "Entrada de 500 doses da vacina COVID-19",
            "ibge6": "355030",
            "input_operacional": {"id_estabelecimento": ESTABLISHMENT, "chave_idempotencia": "message-sse-001"},
        })
    assert response.status_code == 200, response.text
    assert "event: rascunho_operacional_pronto" in response.text
    assert "Nenhum" not in response.text
    with svc.store.transaction() as tx:
        assert tx.one("SELECT count(*) total FROM vacinacao_usuario")["total"] == 0


def test_overview_le_saldo_e_historico_original_e_isola_municipio(svc):
    # Registros feitos fora da Clara também pertencem ao histórico da unidade.
    with svc.store.transaction() as tx:
        tx.execute("INSERT INTO vacinacao_usuario(user_id,nome_vacina,qtd_doses,tipo_movimentacao,id_estabelecimento,data_atualizacao) VALUES (?,?,?,?,?,?)",
                   (ACTOR, "Influenza", 800, "entrada", ESTABLISHMENT, "2026-09-12T08:00:00Z"))
        tx.execute("INSERT INTO vacinacao_usuario(user_id,nome_vacina,qtd_doses,tipo_movimentacao,id_estabelecimento,data_atualizacao) VALUES (?,?,?,?,?,?)",
                   (ACTOR, "Influenza", 120, "saida", ESTABLISHMENT, "2026-09-12T09:00:00Z"))
    result = svc.overview(ACTOR, ESTABLISHMENT)
    assert result["vacinacao"]["saldo"][0]["qtd_doses"] == 680
    assert len(result["vacinacao"]["historico"]) == 2
    assert result["vacinacao"]["historico"][0]["tipo_movimentacao"] == "saida"
    assert result["internacao"] == {"saldo": [], "historico": []}
    assert result["medicamento"] == {"saldo": [], "historico": []}
    assert result["internacao_dengue"] == {"saldo": [], "historico": []}
    with pytest.raises(HTTPException) as exc:
        svc.overview(OTHER, ESTABLISHMENT)
    assert exc.value.status_code == 403


def test_confirmacao_nao_ignora_payload_vazio(svc):
    draft = svc.create_draft(ACTOR, ESTABLISHMENT, "Entrada de 500 doses da vacina COVID-19", "empty-payload")
    with pytest.raises(HTTPException) as exc:
        svc.confirm(ACTOR, draft["id"], 1, "confirm-empty", {})
    assert exc.value.status_code == 422
    assert svc.overview(ACTOR, ESTABLISHMENT)["vacinacao"]["historico"] == []


def test_tipo_desconhecido_retorna_validacao(svc):
    with pytest.raises(HTTPException) as exc:
        svc.create_draft(ACTOR, ESTABLISHMENT, "Relato", "unknown-kind", {"tipo": "outro", "payload": {}})
    assert exc.value.status_code == 422


def test_clara_consulta_saldo_novo_sem_inventar_consumo(svc, monkeypatch):
    from api.core import db, local_records_store
    from api.core.susbot_tools import criar_susbot_tools
    monkeypatch.setenv("CLARA_REGISTROS_LOCAIS_ENABLED", "true")
    monkeypatch.setattr(local_records_store, "configured_store", lambda: svc.store)
    draft = svc.create_draft(ACTOR, ESTABLISHMENT, "Entrada de 500 doses da vacina COVID-19", "stock-model")
    svc.confirm(ACTOR, draft["id"], 1, "confirm-stock-model")
    rows = db.get_estoque("355030")
    assert rows[0]["quantidade_atual"] == 500
    assert rows[0]["unidade_medida"] == "doses"
    assert rows[0]["consumo_medio_dia"] is None
    assert db.get_estoque("350950") == []
    tool = criar_susbot_tools("355030")["consultar_estoque"]
    result = tool()
    assert result["dados"][0]["id_estabelecimento"] == ESTABLISHMENT
    assert result["dados"][0]["dias_restantes"] is None
    assert tool(somente_risco=True)["risco_disponivel"] is False


def test_audio_com_varios_itens_vira_rascunhos_nas_tabelas_do_time(svc):
    from api.core.operational_inputs_interpreter import interpret_operational_items
    text = ("Claro, hoje eu apliquei 30 doses da vacina da Dengue, também precisa internar 20 pessoas por conta "
            "da Dengue também e tivemos uma entrada de 50 doses de influenza.")
    items = interpret_operational_items(text)
    assert [i["tipo"] for i in items] == ["vacinacao", "internacao_dengue", "vacinacao"]
    assert items[0]["payload"] == {"nome_vacina": "dengue", "qtd_doses": 30, "tipo_movimentacao": "saida"}
    assert items[1]["payload"] == {"qtd_internacoes": 20}
    assert items[2]["payload"]["tipo_movimentacao"] == "entrada"
    assert interpret_operational_items("internamos 3 pessoas") == []


@pytest.mark.parametrize("text,expected_types", [
    ("aplicamos 30 doses de dengue", ["vacinacao"]),
    ("aplicamos 30 doses de dengue, não teve internação", ["vacinacao"]),
    ("não teve internação, recebemos 100 doses de influenza", ["vacinacao"]),
    ("aplicamos 12 doses de covid-19; talvez internemos 2 por dengue", ["vacinacao"]),
    ("UTI: 8 leitos ocupados e 2 disponíveis, não houve internação", ["internacao"]),
    ("recebemos 40 doses de hepatite b. Vamos conferir o restante", ["vacinacao"]),
])
def test_negacao_ou_hipotese_descarta_so_a_oracao(text, expected_types):
    from api.core.operational_inputs_interpreter import interpret_operational_items

    assert [item["tipo"] for item in interpret_operational_items(text)] == expected_types


@pytest.mark.parametrize("text,vaccine", [
    ("aplicamos 12 doses de BCG", "bcg"),
    ("aplicamos 8 doses da tríplice viral", "triplice viral"),
    ("recebemos 40 doses de HPV", "hpv"),
    ("entrada de 25 doses de pentavalente", "pentavalente"),
    ("aplicamos 6 doses de meningocócica ACWY", "meningococica acwy"),
])
def test_extrator_deterministico_aceita_vacinas_do_pni(text, vaccine):
    from api.core.operational_inputs_interpreter import interpret_operational_items

    item = interpret_operational_items(text)[0]
    assert item["tipo"] == "vacinacao"
    assert item["payload"]["nome_vacina"] == vaccine


@pytest.mark.parametrize("text", [
    "não aplicamos 30 doses de dengue",
    "vou receber 100 doses amanhã",
    "vamos aplicar 20 doses de influenza",
    "exemplo: aplicamos 15 doses de dengue",
    "talvez recebemos 50 doses de covid-19",
    "aplicamos aproximadamente 30 doses de dengue",
])
def test_oracao_operacional_negada_ou_hipotetica_e_recusada(text):
    from api.core.operational_inputs_interpreter import interpret_operational_items

    with pytest.raises(HTTPException) as exc:
        interpret_operational_items(text)
    assert exc.value.detail["codigo"] == "input_ambiguo"


def test_saida_maior_que_saldo_e_recusada_e_internacao_dengue_acumula(svc):
    applied = svc.create_draft(ACTOR, ESTABLISHMENT, "aplicamos 30 doses de dengue", "apply-1",
                               {"tipo": "vacinacao", "payload": {"nome_vacina": "dengue", "qtd_doses": 30, "tipo_movimentacao": "saida"}})
    with pytest.raises(HTTPException) as exc:
        svc.confirm(ACTOR, applied["id"], 1, "confirm-apply-1")
    assert exc.value.detail["codigo"] == "saldo_insuficiente"
    for n in (20, 5):
        draft = svc.create_draft(ACTOR, ESTABLISHMENT, f"internamos {n} por dengue", f"dengue-{n}",
                                 {"tipo": "internacao_dengue", "payload": {"qtd_internacoes": n}})
        assert svc.confirm(ACTOR, draft["id"], 1, f"confirm-dengue-{n}")["tabela_destino"] == "internacao_dengue_usuario"
    with svc.store.transaction() as tx:
        assert tx.one("SELECT qtd_internacoes FROM internacao_dengue_estabelecimento")["qtd_internacoes"] == 25
