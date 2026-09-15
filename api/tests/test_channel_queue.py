import importlib
import os
import tempfile


def test_fila_e_duravel_idempotente_e_recupera_falha(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    from api.core import db
    importlib.reload(db)
    db.init_db()
    try:
        payload = {"update_id": 123, "message": {"text": "oi"}}
        assert db.enfileirar_evento_canal("telegram", "123", payload) is True
        assert db.enfileirar_evento_canal("telegram", "123", payload) is False

        primeiro = db.reivindicar_evento_canal()
        assert primeiro["payload"] == payload
        assert primeiro["tentativas"] == 1

        db.falhar_evento_canal(primeiro["id"], "falha transitória", max_tentativas=2)
        # Força o vencimento do pequeno backoff para testar a nova reivindicação.
        with db._conn() as con:  # pylint: disable=protected-access
            con.execute("UPDATE fila_canais SET disponivel_em = '2000-01-01' WHERE id = ?", (primeiro["id"],))
        segundo = db.reivindicar_evento_canal()
        assert segundo["id"] == primeiro["id"]
        assert segundo["tentativas"] == 2
        db.concluir_evento_canal(segundo["id"])

        with db._conn() as con:  # pylint: disable=protected-access
            linha = con.execute("SELECT status, payload_json FROM fila_canais WHERE id = ?", (segundo["id"],)).fetchone()
        assert tuple(linha) == ("concluido", "{}")
    finally:
        os.remove(path)

