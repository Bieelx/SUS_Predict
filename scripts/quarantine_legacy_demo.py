"""Isolate exact legacy test fixtures from local operational tables.

Read-only by default. --apply first makes a full SQLite backup, then moves only
exact matches into a quarantine table. Never contacts or modifies Supabase.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from api.tests.susbot_seed_fixture import gerar_alertas_sinteticos, gerar_estoque_sintetico


def quarantine(path: Path, backup_dir: Path, apply: bool = False) -> dict:
    connection = sqlite3.connect(f'file:{path.resolve()}?mode={"rw" if apply else "ro"}', uri=True)
    connection.row_factory = sqlite3.Row
    candidates = []
    try:
        for table, generator in (("estoque", gerar_estoque_sintetico), ("alertas", gerar_alertas_sinteticos)):
            for row in connection.execute(f"SELECT rowid AS quarantine_rowid, * FROM {table}"):
                item = dict(row)
                if any(all(item.get(key) == value for key, value in seed.items()) for seed in generator(item["ibge6"])):
                    candidates.append((table, item))
        result = {"apply": apply, "matches": {table: sum(t == table for t, _ in candidates) for table in ("estoque", "alertas")}}
        if not apply or not candidates:
            return result
        backup_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
        backup_path = backup_dir / f"before-demo-quarantine-{stamp}.sqlite"
        with sqlite3.connect(backup_path) as backup:
            connection.backup(backup)
        backup_path.chmod(0o600)
        result["backup"] = str(backup_path)
        with connection:
            connection.execute("CREATE TABLE IF NOT EXISTS legacy_demo_quarantine (source_table TEXT NOT NULL, payload_json TEXT NOT NULL, quarantined_at TEXT NOT NULL)")
            for table, item in candidates:
                rowid = item.pop("quarantine_rowid")
                # Re-check inside the transaction; preserve concurrently updated rows.
                current = connection.execute(f"SELECT * FROM {table} WHERE rowid = ?", (rowid,)).fetchone()
                if current is None or dict(current) != item:
                    raise RuntimeError("Operational row changed during audit; transaction rolled back.")
                connection.execute("INSERT INTO legacy_demo_quarantine VALUES (?, ?, ?)", (table, json.dumps(item, ensure_ascii=False), stamp))
                connection.execute(f"DELETE FROM {table} WHERE rowid = ?", (rowid,))
        return result
    finally:
        connection.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', type=Path, default=Path('api/sus_predict.db'))
    parser.add_argument('--backup-dir', type=Path, default=Path('.tools/audit-backups'))
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(quarantine(args.database, args.backup_dir, args.apply), ensure_ascii=False))
