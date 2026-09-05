from api.core import db


def test_chave_secreta_moderna_configura_apenas_consulta(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    assert db.supabase_configured() is True
    assert db._supabase_read_key() == "sb_secret_teste"
    assert db._sb_headers("sb_secret_teste") == {"apikey": "sb_secret_teste"}


def test_select_usa_get_e_nao_ativa_rotina_de_escrita(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    requisicoes = []
    escritas = []

    def fake_get(url, key):
        requisicoes.append((url, key))
        return [{"casos": 10}]

    monkeypatch.setattr(db, "_sb_get", fake_get)
    monkeypatch.setattr(db, "_sb_upsert", lambda *args, **kwargs: escritas.append((args, kwargs)))

    assert db.sb_select("tabela_curada", {"periodo": "12 Meses"}) == [{"casos": 10}]
    db._sync_row("qualquer_tabela", {"id": 1})

    assert requisicoes == [
        ("https://exemplo.supabase.co/rest/v1/tabela_curada?select=*&periodo=eq.12%20Meses", "sb_secret_teste")
    ]
    assert escritas == []


def test_select_pagina_alem_do_limite_do_postgrest(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    urls = []

    def fake_get(url, key):
        urls.append(url)
        if "offset=" not in url:
            return [{"i": n} for n in range(1000)]
        return [{"i": 1000}]

    monkeypatch.setattr(db, "_sb_get", fake_get)

    assert len(db.sb_select("serie_grande")) == 1001
    assert urls[1].endswith("&offset=1000")


def test_chave_secreta_no_nome_curto_do_env_tambem_configura(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_SECRET", "sb_secret_curto")

    assert db.supabase_configured() is True
