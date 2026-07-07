"""
Storage layer: SQLite (always) + Supabase (optional sync).

SQLite activates automatically — zero config needed.
Supabase syncs when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
"""
import json
import logging
import os
import sqlite3
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from api.core.constants import IBGE6_COORDS

log = logging.getLogger("sus_predict.db")

_SQLITE_PATH = Path(os.getenv("SQLITE_PATH", str(Path(__file__).parent.parent / "sus_predict.db")))

_SCHEMA = """
PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS datasus_runs (
    run_id          TEXT PRIMARY KEY,
    created_at      TEXT NOT NULL,
    sistema         TEXT NOT NULL,
    uf              TEXT NOT NULL,
    cidade          TEXT NOT NULL,
    ibge6           TEXT,
    ano_ini         INTEGER NOT NULL,
    ano_fim         INTEGER NOT NULL,
    doenca_cod      TEXT,
    modelo          TEXT,
    gerado_em       TEXT,
    raw_bucket      TEXT,
    raw_object_path TEXT,
    raw_bytes       INTEGER
);

CREATE TABLE IF NOT EXISTS datasus_serie (
    run_id  TEXT    NOT NULL,
    ano     INTEGER NOT NULL,
    tipo    TEXT    NOT NULL,
    total   INTEGER,
    lower   INTEGER,
    upper   INTEGER,
    PRIMARY KEY (run_id, ano, tipo)
);

CREATE TABLE IF NOT EXISTS datasus_sexo (
    run_id TEXT NOT NULL,
    sexo   TEXT NOT NULL,
    pct    REAL,
    PRIMARY KEY (run_id, sexo)
);

CREATE TABLE IF NOT EXISTS datasus_faixa_etaria (
    run_id TEXT NOT NULL,
    faixa  TEXT NOT NULL,
    pct    REAL,
    PRIMARY KEY (run_id, faixa)
);

CREATE TABLE IF NOT EXISTS datasus_top_causas (
    run_id TEXT NOT NULL,
    causa  TEXT NOT NULL,
    pct    REAL,
    PRIMARY KEY (run_id, causa)
);

CREATE TABLE IF NOT EXISTS datasus_resultado (
    run_id         TEXT PRIMARY KEY,
    resultado_json TEXT NOT NULL,
    created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_lookup  ON datasus_runs (sistema, uf, cidade, ano_ini, ano_fim);
CREATE INDEX IF NOT EXISTS idx_runs_created ON datasus_runs (created_at DESC);
"""


@contextmanager
def _conn():
    con = sqlite3.connect(str(_SQLITE_PATH), check_same_thread=False, timeout=30)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db() -> None:
    with _conn() as con:
        con.executescript(_SCHEMA)
    log.info(f"SQLite store ready: {_SQLITE_PATH}")


# ── SQLite writes ─────────────────────────────────────────────────────────────

def _upsert_run(con: sqlite3.Connection, run: dict) -> None:
    con.execute("""
        INSERT INTO datasus_runs
            (run_id, created_at, sistema, uf, cidade, ibge6, ano_ini, ano_fim,
             doenca_cod, modelo, gerado_em, raw_bucket, raw_object_path, raw_bytes)
        VALUES
            (:run_id, :created_at, :sistema, :uf, :cidade, :ibge6, :ano_ini, :ano_fim,
             :doenca_cod, :modelo, :gerado_em, :raw_bucket, :raw_object_path, :raw_bytes)
        ON CONFLICT(run_id) DO UPDATE SET
            modelo          = excluded.modelo,
            gerado_em       = excluded.gerado_em,
            raw_bucket      = excluded.raw_bucket,
            raw_object_path = excluded.raw_object_path,
            raw_bytes       = excluded.raw_bytes
    """, {
        "run_id":          run["run_id"],
        "created_at":      run.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "sistema":         run["sistema"],
        "uf":              run["uf"],
        "cidade":          run["cidade"],
        "ibge6":           run.get("ibge6"),
        "ano_ini":         run["ano_ini"],
        "ano_fim":         run["ano_fim"],
        "doenca_cod":      run.get("doenca_cod") or None,
        "modelo":          run.get("modelo"),
        "gerado_em":       run.get("gerado_em"),
        "raw_bucket":      run.get("raw_bucket"),
        "raw_object_path": run.get("raw_object_path"),
        "raw_bytes":       run.get("raw_bytes"),
    })


def _upsert_serie(con: sqlite3.Connection, rows: list[dict]) -> None:
    con.executemany("""
        INSERT INTO datasus_serie (run_id, ano, tipo, total, lower, upper)
        VALUES (:run_id, :ano, :tipo, :total, :lower, :upper)
        ON CONFLICT(run_id, ano, tipo) DO UPDATE SET
            total = excluded.total, lower = excluded.lower, upper = excluded.upper
    """, rows)


def _upsert_sexo(con: sqlite3.Connection, rows: list[dict]) -> None:
    con.executemany("""
        INSERT INTO datasus_sexo (run_id, sexo, pct) VALUES (:run_id, :sexo, :pct)
        ON CONFLICT(run_id, sexo) DO UPDATE SET pct = excluded.pct
    """, rows)


def _upsert_faixa(con: sqlite3.Connection, rows: list[dict]) -> None:
    con.executemany("""
        INSERT INTO datasus_faixa_etaria (run_id, faixa, pct) VALUES (:run_id, :faixa, :pct)
        ON CONFLICT(run_id, faixa) DO UPDATE SET pct = excluded.pct
    """, rows)


def _upsert_causas(con: sqlite3.Connection, rows: list[dict]) -> None:
    con.executemany("""
        INSERT INTO datasus_top_causas (run_id, causa, pct) VALUES (:run_id, :causa, :pct)
        ON CONFLICT(run_id, causa) DO UPDATE SET pct = excluded.pct
    """, rows)


# ── Public API ────────────────────────────────────────────────────────────────

def save_resultado(job_id: str, resultado: dict) -> None:
    """Persist completed resultado in SQLite (all tables + full JSON blob)."""
    meta  = resultado.get("meta", {}) or {}
    ibge6 = str(meta.get("ibge", "") or "")[:6] or None

    run_row = {
        "run_id":     job_id,
        "sistema":    meta.get("sistema"),
        "uf":         meta.get("uf"),
        "cidade":     meta.get("cidade"),
        "ibge6":      ibge6,
        "ano_ini":    meta.get("ano_ini"),
        "ano_fim":    meta.get("ano_fim"),
        "doenca_cod": meta.get("doenca_cod") or None,
        "modelo":     meta.get("modelo"),
        "gerado_em":  meta.get("gerado_em"),
        "raw_bucket": None, "raw_object_path": None, "raw_bytes": None,
    }

    serie_rows = [
        {"run_id": job_id, "ano": i["ano"], "tipo": i["tipo"],
         "total": i.get("total"), "lower": i.get("lower"), "upper": i.get("upper")}
        for i in (resultado.get("serie_com_previsao") or [])
    ]
    sexo_rows  = [{"run_id": job_id, "sexo": i["sexo"], "pct": i["pct"]}
                  for i in (resultado.get("distribuicao_sexo") or [])]
    faixa_rows = [{"run_id": job_id, "faixa": i["faixa"], "pct": i["pct"]}
                  for i in (resultado.get("distribuicao_faixa_etaria") or [])]
    causa_rows = [{"run_id": job_id, "causa": i["causa"], "pct": i["pct"]}
                  for i in (resultado.get("top_causas") or [])]

    with _conn() as con:
        _upsert_run(con, run_row)
        if serie_rows:  _upsert_serie(con, serie_rows)
        if sexo_rows:   _upsert_sexo(con, sexo_rows)
        if faixa_rows:  _upsert_faixa(con, faixa_rows)
        if causa_rows:  _upsert_causas(con, causa_rows)
        con.execute("""
            INSERT INTO datasus_resultado (run_id, resultado_json, created_at)
            VALUES (?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET resultado_json = excluded.resultado_json
        """, (job_id, json.dumps(resultado, ensure_ascii=False), datetime.now(timezone.utc).isoformat()))

    log.info(f"Saved run {job_id} to SQLite")
    _try_supabase_sync(job_id, resultado, run_row, serie_rows, sexo_rows, faixa_rows, causa_rows)


def find_cached(req: dict) -> dict | None:
    """Return cached resultado JSON for identical request params, or None."""
    sistema    = req.get("sistema")
    uf         = req.get("uf")
    cidade     = req.get("cidade")
    ibge6      = str(req.get("ibge") or "")[:6] or None
    ano_ini    = int(req["ano_ini"])
    ano_fim    = int(req["ano_fim"])
    doenca_cod = (req.get("doenca_cod") or "").strip() or None

    with _conn() as con:
        row = con.execute("""
            SELECT r.resultado_json
            FROM datasus_resultado r
            JOIN datasus_runs dr ON dr.run_id = r.run_id
            WHERE dr.sistema = ?
              AND dr.uf = ?
              AND dr.cidade = ?
              AND dr.ano_ini = ?
              AND dr.ano_fim = ?
              AND (dr.ibge6 IS ? OR dr.ibge6 = ?)
              AND (dr.doenca_cod IS ? OR dr.doenca_cod = ?)
            ORDER BY dr.created_at DESC
            LIMIT 1
        """, (sistema, uf, cidade, ano_ini, ano_fim,
              ibge6, ibge6 or "",
              doenca_cod, doenca_cod or "")).fetchone()

    if row:
        try:
            result = json.loads(row["resultado_json"])
            result.setdefault("meta", {})["local_cache"] = True
            return result
        except Exception:
            return None

    return _supabase_find_cached(req)


def list_runs(sistema: str | None = None, limit: int = 200) -> list[dict]:
    """List stored runs, newest first."""
    limit = max(1, min(int(limit), 500))
    with _conn() as con:
        if sistema:
            rows = con.execute("""
                SELECT run_id, sistema, uf, cidade, ibge6, ano_ini, ano_fim,
                       doenca_cod, gerado_em, modelo
                FROM datasus_runs WHERE sistema = ?
                ORDER BY created_at DESC LIMIT ?
            """, (sistema, limit)).fetchall()
        else:
            rows = con.execute("""
                SELECT run_id, sistema, uf, cidade, ibge6, ano_ini, ano_fim,
                       doenca_cod, gerado_em, modelo
                FROM datasus_runs
                ORDER BY created_at DESC LIMIT ?
            """, (limit,)).fetchall()

    out = []
    for row in rows:
        ibge6 = str(row["ibge6"] or "")[:6]
        coords = IBGE6_COORDS.get(ibge6)
        out.append({
            "run_id":    row["run_id"],
            "sistema":   row["sistema"],
            "uf":        row["uf"],
            "cidade":    row["cidade"],
            "ibge6":     ibge6 or None,
            "ano_ini":   row["ano_ini"],
            "ano_fim":   row["ano_fim"],
            "doenca_cod":row["doenca_cod"] or "",
            "gerado_em": row["gerado_em"],
            "modelo":    row["modelo"],
            "lat":       coords["lat"] if coords else None,
            "lon":       coords["lon"] if coords else None,
        })
    return out


def find_latest_by_ibge(ibge6: str, sistema: str) -> dict | None:
    """Return most recent resultado JSON for a city+sistema combo."""
    with _conn() as con:
        row = con.execute("""
            SELECT r.resultado_json
            FROM datasus_resultado r
            JOIN datasus_runs dr ON dr.run_id = r.run_id
            WHERE dr.ibge6 = ? AND dr.sistema = ?
            ORDER BY dr.created_at DESC LIMIT 1
        """, (ibge6, sistema)).fetchone()
    if row:
        try:
            return json.loads(row["resultado_json"])
        except Exception:
            return None
    return None


def delete_run(run_id: str) -> None:
    with _conn() as con:
        for table in ("datasus_serie", "datasus_sexo", "datasus_faixa_etaria",
                      "datasus_top_causas", "datasus_resultado", "datasus_runs"):
            con.execute(f"DELETE FROM {table} WHERE run_id = ?", (run_id,))


# ── Supabase read-only query (curated tables, e.g. sih_dengue_*, sinan_dengue_*) ──

def supabase_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL", "").strip() and os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip())


def sb_select(table: str, eq: dict | None = None, order: str | None = None, limit: int | None = None) -> list[dict]:
    """Read-only SELECT against a Supabase table via PostgREST. Never writes."""
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        raise RuntimeError("Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes)")

    filters = [f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in (eq or {}).items() if v is not None]
    qs = "&".join(["select=*"] + filters)
    url = f"{sb_url.rstrip('/')}/rest/v1/{table}?{qs}"
    if order:
        url += f"&order={order}"
    if limit:
        url += f"&limit={limit}"

    data = _sb_get(url, sb_key)
    return data if isinstance(data, list) else []


# ── Supabase helpers (internal) ───────────────────────────────────────────────

def _sb_headers(key: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def _sb_request(method: str, url: str, key: str,
                body: bytes | None = None, extra: dict | None = None) -> tuple[int, bytes]:
    headers = _sb_headers(key)
    if extra:
        headers.update(extra)
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return resp.getcode(), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read() if hasattr(e, "read") else b""


def _sb_get(url: str, key: str):
    code, payload = _sb_request("GET", url, key, extra={"Accept": "application/json"})
    if code >= 300:
        raise RuntimeError(f"Supabase GET {code}: {payload.decode('utf-8', errors='ignore')[:300]}")
    return json.loads(payload.decode("utf-8")) if payload else None


def _sb_upsert(base_url: str, key: str, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    url = f"{base_url.rstrip('/')}/rest/v1/{table}"
    code, payload = _sb_request("POST", url, key,
        body=json.dumps(rows).encode("utf-8"),
        extra={"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates"})
    if code >= 300:
        raise RuntimeError(f"Supabase upsert {table} {code}: {payload.decode('utf-8', errors='ignore')[:300]}")


def _try_supabase_sync(job_id, resultado, run_row, serie_rows, sexo_rows, faixa_rows, causa_rows) -> None:
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        return
    try:
        _sb_upsert(sb_url, sb_key, "datasus_runs",        [run_row])
        _sb_upsert(sb_url, sb_key, "datasus_serie",       serie_rows)
        _sb_upsert(sb_url, sb_key, "datasus_sexo",        sexo_rows)
        _sb_upsert(sb_url, sb_key, "datasus_faixa_etaria",faixa_rows)
        _sb_upsert(sb_url, sb_key, "datasus_top_causas",  causa_rows)
        log.info(f"Synced {job_id} to Supabase")
    except Exception as e:
        log.warning(f"Supabase sync failed (SQLite ok): {e}")


def _supabase_find_cached(req: dict) -> dict | None:
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        return None
    sb_cache = os.getenv("SUPABASE_ENABLE_CACHE_READ", "true").strip().lower()
    if sb_cache not in ("1", "true", "yes", "y", "on"):
        return None

    try:
        sistema    = req.get("sistema")
        uf         = req.get("uf")
        cidade     = req.get("cidade")
        ibge6      = str(req.get("ibge") or "")[:6] or None
        ano_ini    = int(req["ano_ini"])
        ano_fim    = int(req["ano_fim"])
        doenca_cod = (req.get("doenca_cod") or "").strip() or None

        filters = [
            f"sistema=eq.{urllib.parse.quote(sistema)}",
            f"uf=eq.{urllib.parse.quote(uf)}",
            f"cidade=eq.{urllib.parse.quote(cidade)}",
            f"ano_ini=eq.{ano_ini}",
            f"ano_fim=eq.{ano_fim}",
            f"ibge6={'eq.' + ibge6 if ibge6 else 'is.null'}",
            f"doenca_cod={'eq.' + doenca_cod if doenca_cod else 'is.null'}",
        ]
        url   = f"{sb_url.rstrip('/')}/rest/v1/datasus_runs?select=*&{'&'.join(filters)}&limit=1"
        runs  = _sb_get(url, sb_key)
        if not isinstance(runs, list) or not runs:
            return None

        run    = runs[0]
        run_id = run.get("run_id")
        if not run_id:
            return None

        def _sel(table: str) -> list:
            u = f"{sb_url.rstrip('/')}/rest/v1/{table}?select=*&run_id=eq.{urllib.parse.quote(run_id)}"
            d = _sb_get(u, sb_key)
            return d if isinstance(d, list) else []

        serie_rows  = _sel("datasus_serie")
        sexo_rows   = _sel("datasus_sexo")
        faixa_rows  = _sel("datasus_faixa_etaria")
        causas_rows = _sel("datasus_top_causas")

        serie_prev = sorted(
            [{"ano": r["ano"], "tipo": r["tipo"], "total": r["total"],
              "lower": r.get("lower"), "upper": r.get("upper")} for r in serie_rows],
            key=lambda x: (x["ano"] or 0, 0 if x["tipo"] == "real" else 1),
        )
        serie_real = [s for s in serie_prev if s["tipo"] == "real"]
        total      = sum(int(s["total"] or 0) for s in serie_real)
        anos_n     = ano_fim - ano_ini + 1
        media      = total // anos_n if anos_n > 0 else total
        variacao   = round(
            ((serie_real[-1]["total"] - serie_real[0]["total"]) / serie_real[0]["total"]) * 100, 1
        ) if len(serie_real) >= 2 and serie_real[0]["total"] else 0.0
        prox = next((s["total"] for s in serie_prev if s["tipo"] == "previsto"), None)

        resultado = {
            "meta": {
                "sistema": run["sistema"], "uf": run["uf"], "cidade": run["cidade"],
                "ibge": run.get("ibge6", ""), "ano_ini": run["ano_ini"], "ano_fim": run["ano_fim"],
                "doenca_cod": run.get("doenca_cod") or "", "gerado_em": run.get("gerado_em"),
                "dados_reais": True, "dados_completos": True, "modelo": run.get("modelo"),
                "supabase_cache": True, "local_cache": False, "run_id": run_id,
            },
            "stats": {
                "total": total, "media_anual": media, "variacao_pct": variacao,
                "anos_analisados": anos_n, "prox_previsao": prox,
                "prox_lower": next((s.get("lower") for s in serie_prev if s["tipo"] == "previsto"), None),
                "prox_upper": next((s.get("upper") for s in serie_prev if s["tipo"] == "previsto"), None),
            },
            "serie_temporal": serie_real,
            "serie_com_previsao": serie_prev,
            "distribuicao_sexo":        [{"sexo": r["sexo"],  "pct": r["pct"]} for r in sexo_rows],
            "distribuicao_faixa_etaria":[{"faixa": r["faixa"],"pct": r["pct"]} for r in faixa_rows],
            "top_causas":               [{"causa": r["causa"],"pct": r["pct"]} for r in causas_rows],
        }
        return resultado
    except Exception as e:
        log.warning(f"Supabase cache read failed: {e}")
        return None
