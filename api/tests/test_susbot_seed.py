import importlib
import os
import tempfile

import pytest


@pytest.fixture()
def db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)

    from api.core import db as db_module

    importlib.reload(db_module)
    db_module.init_db()
    yield db_module

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def test_seed_e_idempotente_por_municipio(db):
    from api.core.susbot_seed import seed_susbot_municipio

    primeiro = seed_susbot_municipio("3550308")
    estoque_1 = db.get_estoque("355030")
    alertas_1 = db.get_alertas("355030")

    segundo = seed_susbot_municipio("3550308")
    estoque_2 = db.get_estoque("355030")
    alertas_2 = db.get_alertas("355030")

    assert primeiro["seeded"] is True
    assert segundo["seeded"] is False
    assert primeiro["estoque_total"] == segundo["estoque_total"] == len(estoque_1)
    assert primeiro["alertas_total"] == segundo["alertas_total"] == len(alertas_1)
    assert estoque_1 == estoque_2
    assert alertas_1 == alertas_2
    assert len({row["item"] for row in estoque_2}) == len(estoque_2)
    assert len({row["id"] for row in alertas_2}) == len(alertas_2)


def test_seed_variavel_por_municipio(db):
    from api.core.susbot_seed import seed_susbot_municipio

    seed_susbot_municipio("3550308")
    seed_susbot_municipio("3304557")

    estoque_sp = db.get_estoque("355030")
    estoque_rj = db.get_estoque("330455")
    alertas_sp = db.get_alertas("355030")
    alertas_rj = db.get_alertas("330455")

    assert estoque_sp != estoque_rj
    assert alertas_sp != alertas_rj
