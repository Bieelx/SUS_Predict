import pytest


@pytest.fixture(autouse=True)
def _clara_em_sqlite(monkeypatch):
    """O .env real configura Supabase; sem isto os testes gravariam no banco online."""
    monkeypatch.setenv("CLARA_STORAGE", "sqlite")
