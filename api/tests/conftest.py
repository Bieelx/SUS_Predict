import pytest


@pytest.fixture(autouse=True)
def _clara_em_sqlite(monkeypatch):
    """O .env real configura Supabase; sem isto os testes gravariam no banco online."""
    monkeypatch.setenv("CLARA_STORAGE", "sqlite")


@pytest.fixture(autouse=True)
def _sem_registros_locais_do_env(monkeypatch):
    """O .env real liga os registros locais e aponta para o Postgres de produção.

    Sem isto a suíte inteira tentava abrir conexão com o Supabase real em qualquer
    consulta de estoque. Os testes que exercitam esse caminho ligam a flag por conta.
    """
    monkeypatch.delenv("CLARA_REGISTROS_LOCAIS_ENABLED", raising=False)
    monkeypatch.delenv("CLARA_REGISTROS_DATABASE_URL", raising=False)


@pytest.fixture(autouse=True)
def _sem_supabase_real(monkeypatch):
    # load_dotenv não sobrescreve a variável existente. Testes que simulam REST
    # definem seu próprio URL e transporte; a suíte não consulta a base real.
    monkeypatch.setenv("SUPABASE_URL", "")
