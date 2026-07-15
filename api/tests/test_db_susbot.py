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


def test_schema_e_crud_de_estoque_e_alertas(db):
    db.upsert_estoque([
        {
            "ibge6": "355030",
            "item": "Soro Fisiologico 1L",
            "quantidade_atual": 120.0,
            "consumo_medio_dia": 10.0,
            "atualizado_em": "2026-07-13T00:00:00Z",
        },
        {
            "ibge6": "355030",
            "item": "Gaze Esteril",
            "quantidade_atual": 80.0,
            "consumo_medio_dia": 4.0,
            "atualizado_em": "2026-07-13T00:00:00Z",
        },
    ])
    db.insert_alertas([
        {
            "id": "alerta-1",
            "ibge6": "355030",
            "tipo": "surto",
            "item_ou_condicao": "dengue",
            "severidade": "alta",
            "status": "novo",
            "descricao": "Surto de dengue",
            "criado_em": "2026-07-13T00:00:00Z",
        },
        {
            "id": "alerta-2",
            "ibge6": "355030",
            "tipo": "ruptura",
            "item_ou_condicao": "Soro Fisiologico 1L",
            "severidade": "media",
            "status": "resolvido",
            "descricao": "Reposicao feita",
            "criado_em": "2026-07-13T00:00:01Z",
        },
    ])

    assert db.has_estoque("355030") is True
    assert db.has_alertas("355030") is True

    estoque = db.get_estoque("355030", item="Soro Fisiologico 1L")
    assert len(estoque) == 1
    assert estoque[0]["quantidade_atual"] == 120.0

    alertas_novos = db.get_alertas("355030", status="novo")
    assert len(alertas_novos) == 1
    assert alertas_novos[0]["id"] == "alerta-1"


def test_crud_de_conversas_e_mensagens(db):
    conversa = db.criar_conversa(usuario="user-abc", titulo="Quanto dura meu estoque")

    mensagem = db.adicionar_mensagem(
        conversa_id=conversa["id"],
        tela_origem="insumos",
        pergunta="quanto dura meu estoque?",
        resposta="Seu estoque dura 12 dias.",
        referencia_rota="/insumos",
    )

    assert mensagem["conversa_id"] == conversa["id"]
    assert db.get_conversa(conversa["id"])["titulo"] == "Quanto dura meu estoque"

    conversas = db.listar_conversas("user-abc")
    assert len(conversas) == 1
    assert conversas[0]["id"] == conversa["id"]

    mensagens = db.listar_mensagens(conversa["id"])
    assert len(mensagens) == 1
    assert mensagens[0]["resposta"] == "Seu estoque dura 12 dias."
