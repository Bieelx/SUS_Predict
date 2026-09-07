"""docs/09 Fase 4 (antecipada): tela de administração de usuários.

Cobre: não-admin recebe 403 em todos os endpoints (via HTTP real, com token dev);
admin não é atribuível; auto-alteração recusada; último admin protegido; toda
alteração gera log; usuário do Auth sem linha aparece como "sem acesso"; a
listagem não vaza a chave secreta.
"""

import importlib
import os
import tempfile

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.core import auth as auth_core


@pytest.fixture()
def ambiente(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    monkeypatch.setenv("SUS_PREDICT_DEV_AUTH", "1")
    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    from api.core import admin_router
    importlib.reload(admin_router)
    import api.main as main
    importlib.reload(main)
    # depois do reload de main: ele faz load_dotenv e reporia SUPABASE_* do .env real.
    # Sem Supabase, o Auth não é consultado (existe_usuario_auth -> True) e não há rede.
    for var in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY",
                "SUPABASE_SECRET_KEY", "SUPABASE_SECRET", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(var, raising=False)
    yield db_module, admin_router, TestClient(main.app)
    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def _token(email):
    return {"Authorization": f"Bearer {auth_core.dev_login(email)['access_token']}"}


def _uid(email):
    return auth_core._dev_usuario(email)["id"]


ADMIN, ADMIN2, GESTOR, NOVO = "admin@fiap.br", "admin2@fiap.br", "gestor@fiap.br", "professor@fiap.br"


def _seed(db):
    db.upsert_acesso(_uid(ADMIN), "admin", [], ativo=True, atribuido_por="seed")
    db.upsert_acesso(_uid(GESTOR), "gestor", ["351300"], ativo=True, atribuido_por="seed")


# ── 403 para não-admin, via HTTP (mesmo sabendo a URL) ─────────────────────────

def test_nao_admin_recebe_403_em_todos_os_endpoints(ambiente):
    db, _, client = ambiente
    _seed(db)
    alvo = _uid(NOVO)
    chamadas = [
        ("GET", "/api/admin/usuarios", None),
        ("PUT", f"/api/admin/usuarios/{alvo}/perfil", {"perfil": "gestor"}),
        ("PUT", f"/api/admin/usuarios/{alvo}/ativo", {"ativo": False}),
        ("GET", f"/api/admin/usuarios/{alvo}/log", None),
    ]
    for quem in (GESTOR, "visitante@x.y"):  # gestor e quem nem tem linha (vira visitante)
        for metodo, url, body in chamadas:
            r = client.request(metodo, url, json=body, headers=_token(quem))
            assert r.status_code == 403, (quem, metodo, url, r.text)
    # sem token: 401
    assert client.get("/api/admin/usuarios").status_code == 401
    # nada foi gravado
    assert db.get_acesso(alvo) is None
    assert db.list_acesso_log() == []


# ── listagem ───────────────────────────────────────────────────────────────────

def test_listagem_combina_auth_e_tabela_e_nao_vaza_chave(ambiente, monkeypatch):
    db, _, client = ambiente
    _seed(db)
    segredo = "sb_secret_NAO_PODE_APARECER"
    monkeypatch.setattr(auth_core, "listar_usuarios_auth", lambda: [
        {"id": _uid(NOVO), "email": NOVO, "criado_em": "2026-09-05T10:00:00Z", "ultimo_acesso": None},
        {"id": _uid(GESTOR), "email": GESTOR, "criado_em": "2026-09-01T10:00:00Z", "ultimo_acesso": "2026-09-04T10:00:00Z"},
    ])
    monkeypatch.setenv("SUPABASE_SECRET_KEY", segredo)

    r = client.get("/api/admin/usuarios", headers=_token(ADMIN))
    assert r.status_code == 200, r.text
    assert segredo not in r.text
    por_id = {l["usuario"]: l for l in r.json()}

    novo = por_id[_uid(NOVO)]
    assert novo["sem_acesso"] is True and novo["perfil"] is None and novo["email"] == NOVO
    gestor = por_id[_uid(GESTOR)]
    assert gestor["perfil"] == "gestor" and gestor["ativo"] is True and gestor["ultimo_acesso"] == "2026-09-04T10:00:00Z"
    # admin só na tabela (sem espelho no Auth mockado) ainda aparece
    assert por_id[_uid(ADMIN)]["perfil"] == "admin"
    # sem acesso vem primeiro
    assert r.json()[0]["usuario"] == _uid(NOVO)


def test_listar_usuarios_auth_pagina_ate_o_fim(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_x")
    import json, io
    urls = []

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False

    def fake_urlopen(req, timeout=0):
        urls.append(req.full_url)
        assert "Authorization" not in req.headers and req.headers.get("Apikey") == "sb_secret_x"
        pagina = int(req.full_url.split("page=")[1].split("&")[0])
        users = [{"id": f"u{pagina}-{i}", "email": f"u{pagina}-{i}@x"} for i in range(2 if pagina < 3 else 1)]
        return Resp(json.dumps({"users": users}).encode())

    monkeypatch.setattr(auth_core.urllib.request, "urlopen", fake_urlopen)
    lista = auth_core.listar_usuarios_auth(por_pagina=2)
    assert len(urls) == 3 and "admin/users?page=1&per_page=2" in urls[0]
    assert [u["id"] for u in lista] == ["u1-0", "u1-1", "u2-0", "u2-1", "u3-0"]
    assert set(lista[0]) == {"id", "email", "criado_em", "ultimo_acesso"}


# ── regras de escrita ──────────────────────────────────────────────────────────

def test_atribuir_perfil_libera_sem_acesso_e_gera_log(ambiente):
    db, _, client = ambiente
    _seed(db)
    alvo = _uid(NOVO)
    r = client.put(f"/api/admin/usuarios/{alvo}/perfil", json={"perfil": "Vigilancia"}, headers=_token(ADMIN))
    assert r.status_code == 200, r.text
    linha = db.get_acesso(alvo)
    assert linha["perfil"] == "vigilancia" and linha["ativo"] == 1 and linha["atribuido_por"] == ADMIN

    # troca de perfil preserva municipios e ativo
    db.upsert_acesso(alvo, "vigilancia", ["351300"], ativo=False, atribuido_por=ADMIN)
    r = client.put(f"/api/admin/usuarios/{alvo}/perfil", json={"perfil": "farmacia"}, headers=_token(ADMIN))
    assert r.status_code == 200
    linha = db.get_acesso(alvo)
    assert linha["municipios"] == ["351300"] and linha["ativo"] == 0

    logs = db.list_acesso_log(alvo)
    assert [(l["acao"], l["perfil_antes"], l["perfil_depois"], l["por"]) for l in logs] == [
        ("atribuir_perfil", "vigilancia", "farmacia", ADMIN),
        ("atribuir_perfil", None, "vigilancia", ADMIN),
    ]
    r = client.get(f"/api/admin/usuarios/{alvo}/log", headers=_token(ADMIN))
    assert r.status_code == 200 and len(r.json()) == 2


def test_ativar_desativar_gera_log_e_exige_linha(ambiente):
    db, _, client = ambiente
    _seed(db)
    alvo = _uid(GESTOR)
    r = client.put(f"/api/admin/usuarios/{alvo}/ativo", json={"ativo": False}, headers=_token(ADMIN))
    assert r.status_code == 200 and db.get_acesso(alvo)["ativo"] == 0
    r = client.put(f"/api/admin/usuarios/{alvo}/ativo", json={"ativo": True}, headers=_token(ADMIN))
    assert r.status_code == 200 and db.get_acesso(alvo)["ativo"] == 1
    assert [(l["acao"], l["ativo_antes"], l["ativo_depois"]) for l in db.list_acesso_log(alvo)] == [
        ("ativar", 0, 1), ("desativar", 1, 0),
    ]
    # sem linha: 404, sem log
    r = client.put(f"/api/admin/usuarios/{_uid(NOVO)}/ativo", json={"ativo": True}, headers=_token(ADMIN))
    assert r.status_code == 404 and db.list_acesso_log(_uid(NOVO)) == []


def test_uuid_inexistente_no_auth_da_404_sem_escrever(ambiente, monkeypatch):
    db, _, client = ambiente
    _seed(db)
    consultados = []
    monkeypatch.setattr(auth_core, "existe_usuario_auth", lambda u: consultados.append(u) or False)
    fantasma = "00000000-0000-0000-0000-000000000000"
    for url, body in ((f"/api/admin/usuarios/{fantasma}/perfil", {"perfil": "gestor"}),
                      (f"/api/admin/usuarios/{fantasma}/ativo", {"ativo": True})):
        r = client.put(url, json=body, headers=_token(ADMIN))
        assert r.status_code == 404, r.text
    assert consultados == [fantasma, fantasma]
    assert db.get_acesso(fantasma) is None
    assert db.list_acesso_log() == []
    with db._conn() as con:
        assert con.execute("SELECT count(*) FROM usuarios_acesso").fetchone()[0] == 2  # só o seed


def test_existe_usuario_auth_usa_get_por_id(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_x")
    import io, urllib.error
    urls = []

    class Resp(io.BytesIO):
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def getcode(self): return 200

    def fake_urlopen(req, timeout=0):
        urls.append(req.full_url)
        assert req.headers.get("Apikey") == "sb_secret_x" and "Authorization" not in req.headers
        if req.full_url.endswith("/existe"):
            return Resp(b'{"id":"existe"}')
        raise urllib.error.HTTPError(req.full_url, 404, "nf", {}, io.BytesIO(b""))

    monkeypatch.setattr(auth_core.urllib.request, "urlopen", fake_urlopen)
    assert auth_core.existe_usuario_auth("existe") is True
    assert auth_core.existe_usuario_auth("nao-existe") is False
    assert urls == ["https://exemplo.supabase.co/auth/v1/admin/users/existe",
                    "https://exemplo.supabase.co/auth/v1/admin/users/nao-existe"]


def test_admin_e_atribuivel_a_outro_usuario(ambiente):
    """Fase 4.1: um admin pode promover outra conta a admin (normalizando o valor)."""
    db, _, client = ambiente
    _seed(db)
    for perfil in ("admin", "ADMIN", " Admin "):
        r = client.put(f"/api/admin/usuarios/{_uid(NOVO)}/perfil", json={"perfil": perfil}, headers=_token(ADMIN))
        assert r.status_code == 200, r.text
        assert r.json()["perfil"] == "admin"
        assert db.get_acesso(_uid(NOVO))["perfil"] == "admin"
    assert db.count_admins_ativos() == 2
    assert [l["acao"] for l in db.list_acesso_log(_uid(NOVO))] == ["atribuir_perfil"] * 3


def test_perfil_desconhecido_e_recusado(ambiente):
    db, _, client = ambiente
    _seed(db)
    r = client.put(f"/api/admin/usuarios/{_uid(NOVO)}/perfil", json={"perfil": "superuser"}, headers=_token(ADMIN))
    assert r.status_code == 400
    assert db.get_acesso(_uid(NOVO)) is None and db.list_acesso_log() == []


def test_admin_nao_altera_a_si_mesmo(ambiente):
    db, _, client = ambiente
    _seed(db)
    db.upsert_acesso(_uid(ADMIN2), "admin", [], ativo=True, atribuido_por="seed")  # há outro admin
    eu = _uid(ADMIN)
    r = client.put(f"/api/admin/usuarios/{eu}/perfil", json={"perfil": "gestor"}, headers=_token(ADMIN))
    assert r.status_code == 400
    r = client.put(f"/api/admin/usuarios/{eu}/ativo", json={"ativo": False}, headers=_token(ADMIN))
    assert r.status_code == 400
    assert db.get_acesso(eu)["perfil"] == "admin" and db.get_acesso(eu)["ativo"] == 1
    assert db.list_acesso_log() == []


def test_ultimo_admin_ativo_e_protegido(ambiente):
    """Com dois admins ativos, um pode rebaixar/desativar o outro; sobrando um, ele não
    pode ser removido. Via HTTP o 409 é inalcançável (o único admin ativo seria ele mesmo,
    barrado antes pela auto-alteração), então a guarda é testada na função — defesa em
    profundidade contra corrida e contra chamadas futuras."""
    db, admin_router, client = ambiente
    _seed(db)
    db.upsert_acesso(_uid(ADMIN2), "admin", [], ativo=True, atribuido_por="seed")

    r = client.put(f"/api/admin/usuarios/{_uid(ADMIN2)}/perfil", json={"perfil": "gestor"}, headers=_token(ADMIN))
    assert r.status_code == 200 and db.count_admins_ativos() == 1

    ultimo = db.get_acesso(_uid(ADMIN))
    for perfil, ativo in (("gestor", True), ("admin", False)):
        with pytest.raises(HTTPException) as exc:
            admin_router._protege_ultimo_admin(ultimo, perfil, ativo)
        assert exc.value.status_code == 409
    admin_router._protege_ultimo_admin(ultimo, "admin", True)  # manter admin ativo passa
    assert db.get_acesso(_uid(ADMIN))["perfil"] == "admin"

    # admin desativado não entra na conta nem consegue agir
    db.upsert_acesso(_uid(ADMIN2), "admin", [], ativo=False, atribuido_por="seed")
    assert db.count_admins_ativos() == 1
    assert client.get("/api/admin/usuarios", headers=_token(ADMIN2)).status_code == 403


def test_auth_me_expoe_perfil_sem_provisionar(ambiente):
    db, _, client = ambiente
    _seed(db)
    r = client.get("/api/auth/me", headers=_token(ADMIN))
    assert r.json()["acesso"] == {"perfil": "admin", "ativo": True}
    r = client.get("/api/auth/me", headers=_token(NOVO))
    assert r.json()["acesso"] is None and db.get_acesso(_uid(NOVO)) is None


def test_existe_usuario_auth_sem_supabase_avisa_no_log(monkeypatch, caplog):
    for var in ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY",
                "SUPABASE_SECRET_KEY", "SUPABASE_SECRET", "SUPABASE_SERVICE_ROLE_KEY"):
        monkeypatch.delenv(var, raising=False)
    with caplog.at_level("WARNING", logger="sus_predict.auth"):
        assert auth_core.existe_usuario_auth("dev-abc") is True
    assert any("PULADA" in r.message and "dev-abc" in r.message for r in caplog.records)
