"""Transações locais isoladas das séries DataSUS. Nenhum fallback de produção."""
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
import os
import sqlite3
import uuid

from fastapi import HTTPException


def _serializavel(valor):
    """Converte o que o psycopg devolve e o json.dumps nao aceita.

    Colunas timestamptz voltam como `datetime`; SQLite devolve texto. Sem essa
    normalizacao a resposta da Clara morria no `json.dumps` do SSE (leitos,
    internacoes, estoque) com "Object of type datetime is not JSON
    serializable" — o erro chegava na tela como falha generica. Datas seguem a
    convencao do backend (ISO 8601).
    """

    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, uuid.UUID):
        return str(valor)
    return valor


def _linha(row):
    return {chave: _serializavel(valor) for chave, valor in dict(row).items()}


class Session:
    def __init__(self, connection, postgres):
        self.connection, self.postgres = connection, postgres

    def execute(self, sql, values=()):
        return self.connection.execute(sql.replace("?", "%s") if self.postgres else sql, values)

    def one(self, sql, values=()):
        row = self.execute(sql, values).fetchone()
        return _linha(row) if row else None

    def all(self, sql, values=()):
        return [_linha(row) for row in self.execute(sql, values).fetchall()]

    def lock_unit(self, unit):
        # Serializa também confirmações concorrentes com dimensões sobrepostas.
        # A autorização é relida depois do lock, na mesma transação.
        suffix = " FOR UPDATE" if self.postgres else ""
        return self.one("SELECT * FROM local_unidades_saude WHERE id=?" + suffix, (unit,))


class Store:
    def __init__(self, dsn=None, sqlite_path=None):
        self.dsn, self.sqlite_path = dsn, sqlite_path

    @contextmanager
    def transaction(self):
        if self.sqlite_path:
            con = sqlite3.connect(str(self.sqlite_path), timeout=15)
            con.row_factory = sqlite3.Row
            con.execute("PRAGMA foreign_keys=ON")
            try:
                con.execute("BEGIN IMMEDIATE")
                yield Session(con, False)
                con.commit()
            except Exception:
                con.rollback()
                raise
            finally:
                con.close()
        else:
            import psycopg
            from psycopg.rows import dict_row
            try:
                with psycopg.connect(self.dsn, row_factory=dict_row, connect_timeout=10,
                                     prepare_threshold=None, options="-c search_path=public -c statement_timeout=15000") as con:
                    yield Session(con, True)
            except (psycopg.OperationalError, psycopg.ProgrammingError) as exc:
                raise HTTPException(503, {"codigo": "servico_indisponivel",
                                         "mensagem": "Registros locais indisponíveis."}) from exc
            except psycopg.IntegrityError as exc:
                raise HTTPException(409, {"codigo": "conflito",
                                         "mensagem": "Conflito ao salvar. Consulte o estado atual."}) from exc


def configured_store():
    if os.getenv("CLARA_REGISTROS_LOCAIS_ENABLED", "").lower() not in {"1", "true"}:
        raise HTTPException(503, {"codigo": "recurso_desabilitado", "mensagem": "Registros locais ainda não habilitados."})
    dsn = os.getenv("CLARA_REGISTROS_DATABASE_URL", "").strip()
    if not dsn:
        raise HTTPException(503, {"codigo": "servico_indisponivel", "mensagem": "Armazenamento de registros locais não configurado."})
    return Store(dsn=dsn)
