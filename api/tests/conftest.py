import pytest


@pytest.fixture(autouse=True)
def _clara_em_sqlite(monkeypatch):
    """O .env real configura Supabase; sem isto os testes gravariam no banco online."""
    monkeypatch.setenv("CLARA_STORAGE", "sqlite")


@pytest.fixture(autouse=True)
def _sem_supabase_real(monkeypatch):
    # load_dotenv não sobrescreve a variável existente. Testes que simulam REST
    # definem seu próprio URL e transporte; a suíte não consulta a base real.
    monkeypatch.setenv("SUPABASE_URL", "")
