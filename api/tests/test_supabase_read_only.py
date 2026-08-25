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
