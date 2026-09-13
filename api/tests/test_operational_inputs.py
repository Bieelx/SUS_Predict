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
