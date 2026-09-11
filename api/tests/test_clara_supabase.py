"""Clara com Supabase configurado: tudo passa pelo PostgREST, nada no SQLite."""

import pytest

from api.core import db


@pytest.fixture()
def remoto(monkeypatch, tmp_path):
    monkeypatch.setenv("SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_teste")
    monkeypatch.delenv("CLARA_STORAGE", raising=False)
    monkeypatch.setenv("SQLITE_PATH", str(tmp_path / "nao-usar.db"))
    monkeypatch.setattr(db, "_SQLITE_PATH", tmp_path / "nao-usar.db")
    chamadas = []
    respostas = []

    def falso(method, path, body=None, prefer=None):
        chamadas.append((method, path, body, prefer))
        return (respostas.pop(0) if respostas else []), {}

    monkeypatch.setattr(db, "_rest", falso)
    yield chamadas, respostas
    assert not (tmp_path / "nao-usar.db").exists(), "Clara remota não pode tocar o SQLite"


def test_evento_duplicado_de_webhook_nao_reprocessa(remoto):
    chamadas, respostas = remoto
    respostas.extend([[{"provedor": "telegram", "external_id": "1"}], []])

    assert db.registrar_evento_canal("telegram", "1") is True
    assert db.registrar_evento_canal("telegram", "1") is False
    assert "ignore-duplicates" in chamadas[0][3]


def test_upsert_de_memoria_nao_sobrescreve_id_nem_criado_em(remoto):
    chamadas, respostas = remoto
    respostas.append([{"id": "x", "owner_ref": "o", "fact_ref": "f", "payload_encrypted": "p",
                       "criado_em": "c", "atualizado_em": "a"}])

    db.upsert_memoria_usuario("o", "f", "p")

    _, path, body, prefer = chamadas[0]
    assert "on_conflict=owner_ref,fact_ref" in path and "merge-duplicates" in prefer
    assert "id" not in body and "criado_em" not in body


def test_conta_externa_de_outro_usuario_vira_value_error(remoto, monkeypatch):
    def recusa(*_args, **_kwargs):
        raise RuntimeError('Supabase POST rpc/clara_confirmar_pareamento 400: {"message":"conta_externa_em_uso"}')

    monkeypatch.setattr(db, "_rest", recusa)
    with pytest.raises(ValueError):
        db.confirmar_pareamento_canal("p1", "user-abc")


def test_sem_chave_no_ambiente_nao_gera_chave_local(remoto, monkeypatch, tmp_path):
    monkeypatch.delenv("SUSBOT_MEMORY_KEY", raising=False)
    monkeypatch.setenv("SUSBOT_MEMORY_KEY_FILE", str(tmp_path / "chave.key"))
    from api.core import susbot_memory

    with pytest.raises(RuntimeError, match="SUSBOT_MEMORY_KEY"):
        susbot_memory._memory_key()
    assert not (tmp_path / "chave.key").exists()
