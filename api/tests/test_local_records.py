"""Regras de domínio exercitadas em transações isoladas, sem Supabase online."""
from datetime import date
from pathlib import Path
import re
import sqlite3
from types import SimpleNamespace
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
import pytest

from api.core.local_records_models import AcaoRequest, EditarRequest
from api.core.local_records_service import LocalRecords
from api.core.local_records_store import Store
from api.core.local_records_interpreter import interpret
from api.core import local_records_router as router

TODAY = date(2026, 9, 12)
UNIT = "10000000-0000-4000-8000-000000000001"


@pytest.fixture
def svc(tmp_path):
    path = tmp_path / "records.db"
    sql = (Path(__file__).parents[2] / "supabase/migrations/20260912130745_clara_registros_locais.sql").read_text()
    # Mesmo DDL de tabelas/seed; emulação apenas dos tipos/operadores PostgreSQL.
    sql = sql.split("-- POSTGRES SECURITY")[0].replace("public.", "").replace("::jsonb", "")
    sql = sql.replace("DEFAULT now()", "DEFAULT CURRENT_TIMESTAMP").replace("jsonb_typeof", "json_type")
    sql = re.sub(r"\w+ ~ '\^\[0-9\]\{\d+\}\$'", "true", sql)
    with sqlite3.connect(path) as tx:
        tx.execute("CREATE TABLE usuarios_acesso(usuario TEXT PRIMARY KEY,perfil TEXT,municipios TEXT,ativo BOOLEAN)")
        tx.executescript(sql)
        for actor in ("writer", "reviewer", "manager", "outsider"):
            tx.execute("INSERT INTO usuarios_acesso VALUES (?,?,?,true)", (actor, "gestor", '["355030"]'))
        tx.execute("INSERT INTO local_unidades_saude VALUES (?,NULL,'UBS teste','UBS','355030','SP',true,'2026-09-12','2026-09-12')", (UNIT,))
        for actor, role in (("writer", "registrador"), ("reviewer", "revisor"), ("manager", "gestor_unidade")):
            tx.execute("INSERT INTO local_usuarios_unidades VALUES (?,?,?,true,'manager','2026-09-12','2026-09-12')", (actor, UNIT, role))
    return LocalRecords(Store(sqlite_path=path), lambda actor: SimpleNamespace(perfil="gestor", municipios=("355030",)))


def proposal(value="32", **dimensions):
    return {"indicador": "doses_vacina_aplicadas", "valor": value, "periodo_inicio": "2026-09-12",
            "periodo_fim": "2026-09-12", "dimensoes": dimensions or {"vacina": "dengue"}}


def create(svc, value="32", actor="writer", items=None, key=None):
    return svc.create_report(actor, UNIT, "Relato de teste", key or str(uuid4()), items or [proposal(value)])


def action(svc, record, kind="confirmar", actor="reviewer", version=1, key=None, reason=""):
    return svc.mutate(actor, record, kind, AcaoRequest(versao_esperada=version, chave_idempotencia=key or str(uuid4()), motivo=reason))


def test_create_confirm_correct_cancel(svc):
    record = create(svc)["registros"][0]["id"]
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"] == []
    confirmed = action(svc, record)
    assert confirmed["confirmada_vigente"]["numero_versao"] == 2
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"][0]["valor"] == "32"
    correction = svc.mutate("reviewer", record, "corrigir", EditarRequest(
        versao_esperada=2, chave_idempotencia=str(uuid4()), motivo="Recontagem", **{k:v for k,v in proposal("30").items() if k != "indicador"}))
    assert correction["atual"]["status"] == "rascunho"
    assert correction["confirmada_vigente"]["valor"] == 32
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"][0]["valor"] == "32"
    action(svc, record, version=3)
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"][0]["valor"] == "30"
    final = action(svc, record, "cancelar", version=4, reason="Registro indevido")
    assert len(final["versoes"]) == 5
    assert final["confirmada_vigente"] is None
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"] == []


def test_message_and_mutation_replays(svc):
    first = create(svc, key="event-123")
    assert create(svc, key="event-123")["relato_id"] == first["relato_id"]
    record = first["registros"][0]["id"]
    action(svc, record, key="confirm-123")
    replay = action(svc, record, key="confirm-123")
    assert replay["replay"] and len(replay["versoes"]) == 2
    with pytest.raises(HTTPException) as exc:
        action(svc, record, key="confirm-123", reason="changed")
    assert exc.value.detail["codigo"] == "idempotencia_conflitante"


def test_scope_roles_revocation_and_ownership(svc):
    record = create(svc)["registros"][0]["id"]
    for actor in ("outsider", "writer"):
        with pytest.raises(HTTPException) as exc:
            action(svc, record, actor=actor)
        assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        svc.summary("writer", UNIT, TODAY, TODAY)
    other = create(svc, actor="reviewer")["registros"][0]["id"]
    with pytest.raises(HTTPException):
        svc.detail("writer", other)
    with svc.store.transaction() as tx:
        tx.execute("UPDATE local_usuarios_unidades SET ativo=false WHERE usuario='reviewer'")
    with pytest.raises(HTTPException):
        action(svc, record)


def test_partial_dimensions_overlap_blocked_and_rollback(svc):
    first = create(svc)["registros"][0]["id"]
    action(svc, first)
    second = create(svc, items=[proposal("8", vacina="dengue", tipo_dose="primeira")])["registros"][0]["id"]
    with pytest.raises(HTTPException) as exc:
        action(svc, second)
    assert exc.value.detail["codigo"] == "possivel_duplicidade"
    assert len(svc.detail("reviewer", second)["versoes"]) == 1
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"][0]["valor"] == "32"


def test_distinct_dimensions_not_duplicate(svc):
    for vaccine in ("dengue", "influenza"):
        record = create(svc, items=[proposal("0", vacina=vaccine)])["registros"][0]["id"]
        action(svc, record)
    summary = svc.summary("manager", UNIT, TODAY, TODAY)
    assert len(summary["itens"]) == 2
    assert all(i["valor"] == "0" for i in summary["itens"])


def test_missing_fields_draft_and_catalog_validation(svc):
    item = proposal()
    item.update(periodo_inicio=None, periodo_fim=None, valor=None, dimensoes={})
    record = create(svc, items=[item])["registros"][0]
    assert "dimensoes.vacina" in record["atual"]["pendencias"]
    with pytest.raises(HTTPException) as exc:
        action(svc, record["id"])
    assert exc.value.detail["codigo"] == "campos_pendentes"
    assert svc.listing("writer", UNIT, TODAY, TODAY, "pendentes")["itens"]
    with pytest.raises(HTTPException):
        create(svc, items=[proposal("1.5")])
    with pytest.raises(HTTPException):
        create(svc, items=[proposal(vacina="inexistente")])


def test_report_atomic_creation(svc):
    before = svc.listing("writer", UNIT, TODAY, TODAY, "historico")["itens"]
    with pytest.raises(HTTPException):
        create(svc, items=[proposal(), {**proposal(), "indicador": "internacoes"}])
    assert svc.listing("writer", UNIT, TODAY, TODAY, "historico")["itens"] == before


def test_stale_version_and_report_status(svc):
    report = create(svc, items=[proposal(), {**proposal(), "indicador": "atendimentos_suspeita_dengue", "dimensoes": {"doenca": "dengue"}}])
    first, second = [r["id"] for r in report["registros"]]
    action(svc, first)
    assert svc.detail("reviewer", first)["relato"]["status"] == "aguardando_confirmacao"
    with pytest.raises(HTTPException) as exc:
        action(svc, first)
    assert exc.value.detail["codigo"] == "versao_desatualizada"
    action(svc, second, "rejeitar")
    assert svc.detail("reviewer", first)["relato"]["status"] == "confirmado"


def test_interpretation_does_not_invent_disease(svc):
    items = interpret("Hoje aplicamos 32 doses da vacina contra dengue, atendemos oito pessoas com suspeita e encaminhamos duas para o hospital.", TODAY)
    assert len(items) == 3
    assert [i["valor"] for i in items] == ["32", "8", "2"]
    assert all(i["periodo_inicio"] == "2026-09-12" for i in items)
    assert items[1]["dimensoes"] == {}
    assert items[2]["dimensoes"] == {"destino": "hospital"}


@pytest.mark.parametrize("text", ["Hoje saíram 32 doses do estoque", "A dengue aumentou", "Internamos 2 pessoas", "Não aplicamos 32 doses", "Hoje aplicamos cerca de 32 doses", "Ontem e hoje aplicamos 32 doses", "Hoje aplicamos 20 ou 30 doses"])
def test_ambiguous_or_unsupported_input_rejected(text):
    with pytest.raises(HTTPException):
        interpret(text, TODAY)


def test_http_contract_and_identity(svc):
    app = FastAPI()
    app.include_router(router.router)
    app.dependency_overrides[router.service] = lambda: svc
    app.dependency_overrides[router.actor] = lambda: "writer"
    with TestClient(app) as client:
        result = client.post("/api/clara/registros-locais/relatos", json={"unidade_id": UNIT, "texto": "Hoje aplicamos 32 doses contra dengue", "chave_idempotencia": "web-12345"})
        assert result.status_code == 201, result.text
        body = result.json()
        record = body["registros"][0]["id"]
        denied = client.post(f"/api/clara/registros-locais/registros/{record}/confirmar", json={"versao_esperada": 1, "chave_idempotencia": "action-12345"})
        assert denied.status_code == 403
        invalid = client.post("/api/clara/registros-locais/relatos", json={"unidade_id": UNIT, "texto": "Hoje aplicamos 32 doses", "chave_idempotencia": "web-12346", "usuario": "manager"})
        assert invalid.status_code == 422


def test_concurrent_confirmation_once_and_duplicate_lock(svc):
    from concurrent.futures import ThreadPoolExecutor
    record = create(svc)["registros"][0]["id"]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(lambda _: action(svc, record, key="same-operation"), range(4)))
    assert sum(not r["replay"] for r in results) == 1
    assert len(svc.detail("reviewer", record)["versoes"]) == 2
    records = [create(svc, items=[proposal("4", vacina="influenza")])["registros"][0]["id"] for _ in range(2)]
    def confirm(record):
        try:
            action(svc, record)
            return "ok"
        except HTTPException as exc:
            return exc.detail["codigo"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(confirm, records)) == ["ok", "possivel_duplicidade"]


def test_rejected_correction_keeps_confirmed_and_inactive_can_cancel(svc):
    record = create(svc)["registros"][0]["id"]
    action(svc, record)
    svc.mutate("reviewer", record, "corrigir", EditarRequest(versao_esperada=2,
        chave_idempotencia=str(uuid4()), motivo="Recontagem", **{k:v for k,v in proposal("30").items() if k != "indicador"}))
    rejected = action(svc, record, "rejeitar", version=3)
    assert rejected["confirmada_vigente"]["valor"] == 32
    assert svc.detail("reviewer", record)["relato"]["status"] == "confirmado"
    with svc.store.transaction() as tx:
        tx.execute("UPDATE local_indicadores SET ativo=false")
    canceled = action(svc, record, "cancelar", version=4, reason="Lançamento indevido")
    assert canceled["confirmada_vigente"] is None


def test_feature_disabled_fails_closed(monkeypatch):
    from api.core.local_records_store import configured_store
    monkeypatch.delenv("CLARA_REGISTROS_LOCAIS_ENABLED", raising=False)
    with pytest.raises(HTTPException) as exc:
        configured_store()
    assert exc.value.status_code == 503


def test_clara_explicit_local_mode_sse(svc, monkeypatch):
    from api.core import susbot_router
    monkeypatch.setattr(router, "service", lambda: svc)
    monkeypatch.setattr(susbot_router, "provisionar_acesso_http", lambda user: None)
    # Rota específica não exige município genérico nem usa planejamento livre.
    app = FastAPI()
    app.include_router(susbot_router.router)
    app.dependency_overrides[susbot_router.require_user] = lambda: {"id": "writer"}
    app.dependency_overrides[susbot_router.verificar_acesso_susbot] = lambda: "test"
    with TestClient(app) as client:
        response = client.post("/api/susbot/perguntar", json={"pergunta": "Hoje aplicamos 32 doses contra dengue",
            "registro_local": {"unidade_id": UNIT, "chave_idempotencia": "sse-12345"}})
    assert response.status_code == 200, response.text
    assert "event: rascunho_local_pronto" in response.text
    assert "event: fim" in response.text
    assert svc.summary("manager", UNIT, TODAY, TODAY)["itens"] == []


def test_frontend_transport_confirm_edited_fields_atomically(svc):
    from api.core import local_records_frontend as transport
    record = create(svc)["registros"][0]["id"]
    app = FastAPI()
    app.include_router(transport.router)
    app.dependency_overrides[transport.service] = lambda: svc
    app.dependency_overrides[transport.actor] = lambda: "reviewer"
    with TestClient(app) as client:
        assert client.get('/api/local/unidades').json()["unidades"][0]["capacidades"]["confirmar"]
        assert len(client.get('/api/local/catalogo', params={"unidade": UNIT}).json()["indicadores"]) == 3
        body = {"versao_esperada": 1, "valor": 30, "dimensoes": {"vacina": "dengue"}}
        response = client.post(f'/api/local/registros/{record}/confirmar', json=body, headers={"Idempotency-Key": "frontend-key"})
        assert response.status_code == 200, response.text
        assert response.json()["registro"]["valor"] == 30
        assert len(response.json()["versoes"]) == 2
        repeated = client.post(f'/api/local/registros/{record}/confirmar', json=body, headers={"Idempotency-Key": "frontend-key"})
        assert repeated.json()["replay"]
        params = {"unidade": UNIT, "inicio": str(TODAY), "fim": str(TODAY)}
        assert client.get('/api/local/registros', params=params).json()["itens"][0]["registro_id"] == record
        # Revisores podem ler registros, mas não recebem agregados sem capacidade.
        assert client.get('/api/local/resumo', params=params).json()["disponivel"] is False
        stale = client.post(f'/api/local/registros/{record}/confirmar', json=body, headers={"Idempotency-Key": "another-key"})
        assert stale.json()["tipo"] == "versao_desatualizada"


def test_large_or_ambiguous_amounts_fail_product_validation(svc):
    for text in ("Hoje aplicamos 1.000 doses contra dengue", "Hoje aplicamos 32,5 doses contra dengue"):
        with pytest.raises(HTTPException):
            interpret(text, TODAY)
    with pytest.raises(HTTPException) as exc:
        create(svc, "1000000001")
    assert exc.value.status_code == 422
