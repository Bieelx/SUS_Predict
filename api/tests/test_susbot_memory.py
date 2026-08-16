import importlib
import os
import tempfile

import pytest
from cryptography.fernet import Fernet


@pytest.fixture()
def memoria(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    monkeypatch.setenv("SUSBOT_MEMORY_KEY", Fernet.generate_key().decode("ascii"))

    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()

    import api.core.susbot_memory as memory_module
    importlib.reload(memory_module)
    yield memory_module, db_module

    try:
        os.remove(path)
    except FileNotFoundError:
        pass


def test_memoria_isola_gabriel_e_yasmin_e_criptografa_payload(memoria):
    memory_module, db_module = memoria

    memory_module.aprender_da_mensagem(
        "user-gabriel", "Meu nome é Gabriel e trabalho com vigilância epidemiológica.", "telegram",
    )
    memory_module.aprender_da_mensagem(
        "user-yasmin", "Meu nome é Yasmin e trabalho com compras públicas.", "web",
    )

    gabriel = memory_module.contexto_para_agente("user-gabriel")
    yasmin = memory_module.contexto_para_agente("user-yasmin")

    assert gabriel["fatos"]["nome"] == "Gabriel"
    assert gabriel["fatos"]["area_atuacao"] == "vigilância epidemiológica"
    assert "Yasmin" not in str(gabriel)
    assert yasmin["fatos"]["nome"] == "Yasmin"
    assert yasmin["fatos"]["area_atuacao"] == "compras públicas"
    assert "Gabriel" not in str(yasmin)

    with db_module._conn() as con:  # pylint: disable=protected-access
        rows = con.execute("SELECT owner_ref, fact_ref, payload_encrypted FROM susbot_memorias").fetchall()
    armazenamento_bruto = " ".join(" ".join(map(str, row)) for row in rows)
    assert "Gabriel" not in armazenamento_bruto
    assert "Yasmin" not in armazenamento_bruto
    assert "vigilância" not in armazenamento_bruto
    assert "user-gabriel" not in armazenamento_bruto
    assert "user-yasmin" not in armazenamento_bruto


def test_exclusao_de_gabriel_nao_apaga_yasmin(memoria):
    memory_module, _db = memoria
    memory_module.aprender_da_mensagem("user-gabriel", "Meu nome é Gabriel.", "telegram")
    memory_module.aprender_da_mensagem("user-yasmin", "Meu nome é Yasmin.", "telegram")

    removidos = memory_module.apagar_memorias("user-gabriel")

    assert removidos == 1
    assert memory_module.contexto_para_agente("user-gabriel")["fatos"] == {}
    assert memory_module.contexto_para_agente("user-yasmin")["fatos"]["nome"] == "Yasmin"


def test_dados_sensiveis_nao_sao_memorizados(memoria):
    memory_module, _db = memoria

    aprendidos = memory_module.aprender_da_mensagem(
        "user-gabriel", "Meu nome é Gabriel e minha senha é segredo123.", "telegram",
    )
    memory_module.aprender_da_mensagem(
        "user-gabriel", "Tenho diabetes e meu prontuário é ABC123.", "telegram",
    )

    assert aprendidos == []
    assert memory_module.listar_memorias("user-gabriel") == []


def test_assuntos_frequentes_sao_agregados_sem_salvar_pergunta(memoria):
    memory_module, db_module = memoria
    memory_module.aprender_da_mensagem("user-gabriel", "Como está o estoque de insumos?", "telegram")
    memory_module.aprender_da_mensagem("user-gabriel", "Quais itens do estoque estão em ruptura?", "telegram")
    memory_module.aprender_da_mensagem("user-gabriel", "Existem alertas novos?", "telegram")

    contexto = memory_module.contexto_para_agente("user-gabriel")
    assert contexto["topicos_frequentes"][0] == "estoque"

    with db_module._conn() as con:  # pylint: disable=protected-access
        bruto = " ".join(row[0] for row in con.execute("SELECT payload_encrypted FROM susbot_memorias"))
    assert "Como está o estoque" not in bruto


def test_comandos_permitem_ver_e_esquecer(memoria):
    memory_module, _db = memoria
    memory_module.aprender_da_mensagem("user-gabriel", "Meu nome é Gabriel.", "telegram")

    assert "Gabriel" in memory_module.executar_comando_memoria("user-gabriel", "/memoria")
    assert "esquecida" in memory_module.executar_comando_memoria("user-gabriel", "/esquecer nome")
    assert memory_module.contexto_para_agente("user-gabriel")["fatos"] == {}
