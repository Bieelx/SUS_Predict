"""Copia conversas, canais e memória da Clara do SQLite do servidor para o Supabase.

Rodar UMA vez no servidor, depois de aplicar supabase/susbot_canais.sql:

    venv/bin/python scripts/migrar_clara_supabase.py [--database api/sus_predict.db]

Idempotente (upsert por chave primária). Não apaga nada do SQLite: confira as
contagens impressas e só então remova o arquivo. As memórias continuam cifradas
com a mesma chave Fernet — ela precisa estar em SUSBOT_MEMORY_KEY no .env.
"""

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(ROOT / ".env")

from api.core import db  # noqa: E402

# Ordem respeita as FKs (mensagens e conexões apontam para conversas).
TABELAS = ["susbot_conversas", "susbot_mensagens", "canal_pareamentos",
           "canal_conexoes", "canal_eventos", "susbot_memorias"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", type=Path, default=ROOT / "api" / "sus_predict.db")
    args = parser.parse_args()
    if not db.supabase_configured():
        print("SUPABASE_URL e chave secreta ausentes no .env")
        return 1

    con = sqlite3.connect(args.database)
    con.row_factory = sqlite3.Row
    falhou = False
    for tabela in TABELAS:
        linhas = [dict(r) for r in con.execute(f"SELECT * FROM {tabela}")]
        for i in range(0, len(linhas), 500):
            db._rest("POST", tabela, linhas[i:i + 500], prefer="resolution=merge-duplicates")
        remoto = db._rest_count(tabela)
        ok = remoto >= len(linhas)
        falhou |= not ok
        print(f"{'ok ' if ok else 'ERRO'} {tabela}: sqlite={len(linhas)} supabase={remoto}")
    return 1 if falhou else 0


if __name__ == "__main__":
    raise SystemExit(main())
