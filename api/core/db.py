"""
Storage layer: SQLite (always) + Supabase (optional sync).

SQLite activates automatically — zero config needed.
Supabase syncs when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
"""
import json
import logging
import os
import sqlite3
import uuid
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

CREATE TABLE IF NOT EXISTS estoque (
    ibge6             TEXT NOT NULL,
    item              TEXT NOT NULL,
    quantidade_atual  REAL NOT NULL,
    consumo_medio_dia REAL NOT NULL,
    atualizado_em     TEXT NOT NULL,
    PRIMARY KEY (ibge6, item)
);

CREATE TABLE IF NOT EXISTS alertas (
    id               TEXT PRIMARY KEY,
    ibge6            TEXT NOT NULL,
    tipo             TEXT NOT NULL,
    item_ou_condicao TEXT,
    severidade       TEXT NOT NULL,
    status           TEXT NOT NULL,
    descricao        TEXT NOT NULL,
    criado_em        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS etps (
    id            TEXT PRIMARY KEY,
    ibge6         TEXT NOT NULL,
    item          TEXT NOT NULL,
    alerta_id     TEXT,
    justificativa TEXT NOT NULL,
    origem        TEXT NOT NULL,
    criado_em     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS susbot_conversas (
    id        TEXT PRIMARY KEY,
    usuario   TEXT NOT NULL,
    titulo    TEXT NOT NULL,
    criada_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS susbot_mensagens (
    id              TEXT PRIMARY KEY,
    conversa_id     TEXT NOT NULL REFERENCES susbot_conversas(id) ON DELETE CASCADE,
    tela_origem     TEXT,
    pergunta        TEXT NOT NULL,
    resposta        TEXT NOT NULL,
    referencia_rota TEXT,
    criado_em       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canal_pareamentos (
    id                TEXT PRIMARY KEY,
    usuario           TEXT NOT NULL,
    provedor          TEXT NOT NULL,
    token_hash        TEXT NOT NULL UNIQUE,
    ibge6             TEXT NOT NULL,
    status            TEXT NOT NULL,
    external_user_id  TEXT,
    external_chat_id  TEXT,
    external_username TEXT,
    criado_em         TEXT NOT NULL,
    expira_em         TEXT NOT NULL,
    reivindicado_em   TEXT,
    confirmado_em     TEXT,
    cancelado_em      TEXT
);

CREATE TABLE IF NOT EXISTS canal_conexoes (
    id                 TEXT PRIMARY KEY,
    usuario            TEXT NOT NULL,
    provedor           TEXT NOT NULL,
    external_user_id   TEXT NOT NULL,
    external_chat_id   TEXT NOT NULL,
    external_username  TEXT,
    ibge6              TEXT NOT NULL,
    conversa_atual_id  TEXT REFERENCES susbot_conversas(id) ON DELETE SET NULL,
    status             TEXT NOT NULL,
    conectado_em       TEXT NOT NULL,
    ultimo_uso_em      TEXT,
    revogado_em        TEXT,
    UNIQUE (usuario, provedor),
    UNIQUE (provedor, external_user_id)
);

CREATE TABLE IF NOT EXISTS canal_eventos (
    provedor      TEXT NOT NULL,
    external_id   TEXT NOT NULL,
    processado_em TEXT NOT NULL,
    PRIMARY KEY (provedor, external_id)
);

CREATE TABLE IF NOT EXISTS susbot_memorias (
    id                 TEXT PRIMARY KEY,
    owner_ref          TEXT NOT NULL,
    fact_ref           TEXT NOT NULL,
    payload_encrypted  TEXT NOT NULL,
    criado_em          TEXT NOT NULL,
    atualizado_em      TEXT NOT NULL,
    UNIQUE (owner_ref, fact_ref)
);

CREATE INDEX IF NOT EXISTS idx_runs_lookup  ON datasus_runs (sistema, uf, cidade, ano_ini, ano_fim);
CREATE INDEX IF NOT EXISTS idx_runs_created ON datasus_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_ibge_status ON alertas (ibge6, status);
CREATE INDEX IF NOT EXISTS idx_etps_ibge ON etps (ibge6, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_conversas_usuario ON susbot_conversas (usuario, criada_em DESC);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON susbot_mensagens (conversa_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pareamentos_usuario ON canal_pareamentos (usuario, provedor, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pareamentos_token ON canal_pareamentos (token_hash);
CREATE INDEX IF NOT EXISTS idx_conexoes_usuario ON canal_conexoes (usuario, status);
CREATE INDEX IF NOT EXISTS idx_memorias_owner ON susbot_memorias (owner_ref, atualizado_em DESC);
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


def _clamp_page(page: int, page_size: int, max_page_size: int) -> tuple[int, int, int]:
    page = max(1, int(page or 1))
    page_size = max(1, min(int(page_size or max_page_size), max_page_size))
    offset = (page - 1) * page_size
    return page, page_size, offset


def _row_dict(row: sqlite3.Row | None) -> dict | None:
    return dict(row) if row is not None else None


def upsert_estoque(rows: list[dict]) -> None:
    if not rows:
        return

    payload = []
    for row in rows:
        payload.append({
            "ibge6": str(row["ibge6"])[:6],
            "item": row["item"],
            "quantidade_atual": row["quantidade_atual"],
            "consumo_medio_dia": row["consumo_medio_dia"],
            "atualizado_em": row.get("atualizado_em") or datetime.now(timezone.utc).isoformat(),
        })

    with _conn() as con:
        con.executemany("""
            INSERT INTO estoque (ibge6, item, quantidade_atual, consumo_medio_dia, atualizado_em)
            VALUES (:ibge6, :item, :quantidade_atual, :consumo_medio_dia, :atualizado_em)
            ON CONFLICT(ibge6, item) DO UPDATE SET
                quantidade_atual  = excluded.quantidade_atual,
                consumo_medio_dia = excluded.consumo_medio_dia,
                atualizado_em     = excluded.atualizado_em
        """, payload)

    for row in payload:
        _sync_row("estoque", row)


def get_estoque(ibge6: str, item: str | None = None) -> list[dict]:
    with _conn() as con:
        if item:
            rows = con.execute("""
                SELECT ibge6, item, quantidade_atual, consumo_medio_dia, atualizado_em
                FROM estoque
                WHERE ibge6 = ? AND item = ?
                ORDER BY item ASC
            """, (str(ibge6)[:6], item)).fetchall()
        else:
            rows = con.execute("""
                SELECT ibge6, item, quantidade_atual, consumo_medio_dia, atualizado_em
                FROM estoque
                WHERE ibge6 = ?
                ORDER BY item ASC
            """, (str(ibge6)[:6],)).fetchall()
    return [dict(row) for row in rows]


def has_estoque(ibge6: str) -> bool:
    with _conn() as con:
        row = con.execute("""
            SELECT 1
            FROM estoque
            WHERE ibge6 = ?
            LIMIT 1
        """, (str(ibge6)[:6],)).fetchone()
    return row is not None


def insert_alertas(rows: list[dict]) -> None:
    if not rows:
        return

    payload = []
    for row in rows:
        payload.append({
            "id": row.get("id") or str(uuid.uuid4()),
            "ibge6": str(row["ibge6"])[:6],
            "tipo": row["tipo"],
            "item_ou_condicao": row.get("item_ou_condicao"),
            "severidade": row["severidade"],
            "status": row["status"],
            "descricao": row["descricao"],
            "criado_em": row.get("criado_em") or datetime.now(timezone.utc).isoformat(),
        })

    with _conn() as con:
        con.executemany("""
            INSERT INTO alertas (id, ibge6, tipo, item_ou_condicao, severidade, status, descricao, criado_em)
            VALUES (:id, :ibge6, :tipo, :item_ou_condicao, :severidade, :status, :descricao, :criado_em)
            ON CONFLICT(id) DO UPDATE SET
                ibge6            = excluded.ibge6,
                tipo             = excluded.tipo,
                item_ou_condicao = excluded.item_ou_condicao,
                severidade       = excluded.severidade,
                status           = excluded.status,
                descricao        = excluded.descricao,
                criado_em        = excluded.criado_em
        """, payload)

    for row in payload:
        _sync_row("alertas", row)


def get_alertas(ibge6: str, status: str | None = None, tipo: str | None = None) -> list[dict]:
    sql = [
        "SELECT id, ibge6, tipo, item_ou_condicao, severidade, status, descricao, criado_em",
        "FROM alertas",
        "WHERE ibge6 = ?",
    ]
    params: list = [str(ibge6)[:6]]
    if status:
        sql.append("AND status = ?")
        params.append(status)
    if tipo:
        sql.append("AND tipo = ?")
        params.append(tipo)
    sql.append("ORDER BY criado_em DESC, id DESC")

    with _conn() as con:
        rows = con.execute("\n".join(sql), params).fetchall()
    return [dict(row) for row in rows]


def has_alertas(ibge6: str) -> bool:
    with _conn() as con:
        row = con.execute("""
            SELECT 1
            FROM alertas
            WHERE ibge6 = ?
            LIMIT 1
        """, (str(ibge6)[:6],)).fetchone()
    return row is not None


def atualizar_status_alerta(alerta_id: str, status: str) -> None:
    with _conn() as con:
        con.execute("UPDATE alertas SET status = ? WHERE id = ?", (status, alerta_id))
        row = con.execute("SELECT * FROM alertas WHERE id = ?", (alerta_id,)).fetchone()
    if row:
        _sync_row("alertas", dict(row))


def criar_etp(
    ibge6: str,
    item: str,
    justificativa: str,
    alerta_id: str | None = None,
    origem: str = "susbot",
) -> dict:
    row = {
        "id": str(uuid.uuid4()),
        "ibge6": str(ibge6)[:6],
        "item": item,
        "alerta_id": alerta_id,
        "justificativa": justificativa,
        "origem": origem,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    }
    with _conn() as con:
        con.execute("""
            INSERT INTO etps (id, ibge6, item, alerta_id, justificativa, origem, criado_em)
            VALUES (:id, :ibge6, :item, :alerta_id, :justificativa, :origem, :criado_em)
        """, row)

    # Gerar ETP sempre move o alerta relacionado para "em_andamento" (docs/telas/03).
    if alerta_id:
        atualizar_status_alerta(alerta_id, "em_andamento")

    _sync_row("etps", row)
    return row


def get_etp(etp_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("""
            SELECT id, ibge6, item, alerta_id, justificativa, origem, criado_em
            FROM etps WHERE id = ?
        """, (etp_id,)).fetchone()
    return dict(row) if row else None


def criar_conversa(usuario: str, titulo: str) -> dict:
    conversa = {
        "id": str(uuid.uuid4()),
        "usuario": usuario,
        "titulo": titulo,
        "criada_em": datetime.now(timezone.utc).isoformat(),
    }
    with _conn() as con:
        con.execute("""
            INSERT INTO susbot_conversas (id, usuario, titulo, criada_em)
            VALUES (:id, :usuario, :titulo, :criada_em)
        """, conversa)
    _sync_row("susbot_conversas", conversa)
    return conversa


def get_conversa(conversa_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("""
            SELECT id, usuario, titulo, criada_em
            FROM susbot_conversas
            WHERE id = ?
        """, (conversa_id,)).fetchone()
    return _row_dict(row)


def _normalizar_canal_conversa(canal: str | None) -> str | None:
    valor = str(canal or "").strip().lower()
    return valor if valor in {"app", "telegram"} else None


def listar_conversas(
    usuario: str,
    page: int = 1,
    page_size: int = 20,
    canal: str | None = None,
) -> list[dict]:
    page, page_size, offset = _clamp_page(page, page_size, 100)
    canal_normalizado = _normalizar_canal_conversa(canal)
    with _conn() as con:
        rows = con.execute("""
            WITH conversas_enriquecidas AS (
                SELECT
                    c.id,
                    c.usuario,
                    c.titulo,
                    c.criada_em,
                    COALESCE((
                        SELECT CASE
                            WHEN m.tela_origem = 'telegram' THEN 'telegram'
                            ELSE 'app'
                        END
                        FROM susbot_mensagens m
                        WHERE m.conversa_id = c.id
                        ORDER BY m.criado_em ASC, m.id ASC
                        LIMIT 1
                    ), 'app') AS canal,
                    COALESCE((
                        SELECT MAX(m.criado_em)
                        FROM susbot_mensagens m
                        WHERE m.conversa_id = c.id
                    ), c.criada_em) AS atualizada_em,
                    (
                        SELECT COUNT(*)
                        FROM susbot_mensagens m
                        WHERE m.conversa_id = c.id
                    ) AS total_mensagens
                FROM susbot_conversas c
                WHERE c.usuario = ?
            )
            SELECT id, usuario, titulo, criada_em, canal, atualizada_em, total_mensagens
            FROM conversas_enriquecidas
            WHERE (? IS NULL OR canal = ?)
            ORDER BY atualizada_em DESC, id DESC
            LIMIT ? OFFSET ?
        """, (usuario, canal_normalizado, canal_normalizado, page_size, offset)).fetchall()
    return [dict(row) for row in rows]


def contar_conversas(usuario: str, canal: str | None = None) -> int:
    canal_normalizado = _normalizar_canal_conversa(canal)
    with _conn() as con:
        row = con.execute("""
            WITH conversas_enriquecidas AS (
                SELECT
                    c.id,
                    COALESCE((
                        SELECT CASE
                            WHEN m.tela_origem = 'telegram' THEN 'telegram'
                            ELSE 'app'
                        END
                        FROM susbot_mensagens m
                        WHERE m.conversa_id = c.id
                        ORDER BY m.criado_em ASC, m.id ASC
                        LIMIT 1
                    ), 'app') AS canal
                FROM susbot_conversas c
                WHERE c.usuario = ?
            )
            SELECT COUNT(*) AS total
            FROM conversas_enriquecidas
            WHERE (? IS NULL OR canal = ?)
        """, (usuario, canal_normalizado, canal_normalizado)).fetchone()
    return int(row["total"] if row else 0)


def adicionar_mensagem(
    conversa_id: str,
    tela_origem: str | None,
    pergunta: str,
    resposta: str,
    referencia_rota: str | None,
) -> dict:
    if not get_conversa(conversa_id):
        raise ValueError(f"Conversa não encontrada: {conversa_id}")

    mensagem = {
        "id": str(uuid.uuid4()),
        "conversa_id": conversa_id,
        "tela_origem": tela_origem,
        "pergunta": pergunta,
        "resposta": resposta,
        "referencia_rota": referencia_rota,
        "criado_em": datetime.now(timezone.utc).isoformat(),
    }
    with _conn() as con:
        con.execute("""
            INSERT INTO susbot_mensagens
                (id, conversa_id, tela_origem, pergunta, resposta, referencia_rota, criado_em)
            VALUES
                (:id, :conversa_id, :tela_origem, :pergunta, :resposta, :referencia_rota, :criado_em)
        """, mensagem)
    _sync_row("susbot_mensagens", mensagem)
    return mensagem


def listar_mensagens(conversa_id: str, page: int = 1, page_size: int = 30) -> list[dict]:
    page, page_size, offset = _clamp_page(page, page_size, 100)
    with _conn() as con:
        rows = con.execute("""
            SELECT id, conversa_id, tela_origem, pergunta, resposta, referencia_rota, criado_em
            FROM susbot_mensagens
            WHERE conversa_id = ?
            ORDER BY criado_em DESC, id DESC
            LIMIT ? OFFSET ?
        """, (conversa_id, page_size, offset)).fetchall()
    return [dict(row) for row in rows]


def contar_mensagens(conversa_id: str) -> int:
    with _conn() as con:
        row = con.execute(
            "SELECT COUNT(*) AS total FROM susbot_mensagens WHERE conversa_id = ?",
            (conversa_id,),
        ).fetchone()
    return int(row["total"] if row else 0)


# ── Pareamento e continuidade entre canais ──────────────────────────────────

def criar_pareamento_canal(
    usuario: str,
    provedor: str,
    token_hash: str,
    ibge6: str,
    expira_em: str,
) -> dict:
    agora = datetime.now(timezone.utc).isoformat()
    pareamento = {
        "id": str(uuid.uuid4()),
        "usuario": usuario,
        "provedor": provedor,
        "token_hash": token_hash,
        "ibge6": str(ibge6)[:6],
        "status": "emitido",
        "criado_em": agora,
        "expira_em": expira_em,
    }
    with _conn() as con:
        con.execute("""
            UPDATE canal_pareamentos
            SET status = 'cancelado', cancelado_em = ?
            WHERE usuario = ? AND provedor = ? AND status IN ('emitido', 'reivindicado')
        """, (agora, usuario, provedor))
        con.execute("""
            INSERT INTO canal_pareamentos
                (id, usuario, provedor, token_hash, ibge6, status, criado_em, expira_em)
            VALUES
                (:id, :usuario, :provedor, :token_hash, :ibge6, :status, :criado_em, :expira_em)
        """, pareamento)
    _sync_row("canal_pareamentos", pareamento)
    return pareamento


def get_pareamento_canal(pareamento_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("""
            SELECT id, usuario, provedor, ibge6, status, external_user_id,
                   external_chat_id, external_username, criado_em, expira_em,
                   reivindicado_em, confirmado_em, cancelado_em
            FROM canal_pareamentos WHERE id = ?
        """, (pareamento_id,)).fetchone()
    return _row_dict(row)


def reivindicar_pareamento_canal(
    token_hash: str,
    provedor: str,
    external_user_id: str,
    external_chat_id: str,
    external_username: str | None = None,
) -> dict | None:
    agora = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        row = con.execute("""
            SELECT id FROM canal_pareamentos
            WHERE token_hash = ? AND provedor = ? AND status = 'emitido' AND expira_em > ?
        """, (token_hash, provedor, agora)).fetchone()
        if not row:
            return None
        atualizado = con.execute("""
            UPDATE canal_pareamentos
            SET status = 'reivindicado', external_user_id = ?, external_chat_id = ?,
                external_username = ?, reivindicado_em = ?
            WHERE id = ? AND status = 'emitido'
        """, (external_user_id, external_chat_id, external_username, agora, row["id"]))
        if atualizado.rowcount != 1:
            return None
        resultado = con.execute("""
            SELECT id, usuario, provedor, ibge6, status, external_user_id,
                   external_chat_id, external_username, criado_em, expira_em,
                   reivindicado_em, confirmado_em, cancelado_em
            FROM canal_pareamentos WHERE id = ?
        """, (row["id"],)).fetchone()
    out = _row_dict(resultado)
    if out:
        _sync_row("canal_pareamentos", out)
    return out


def confirmar_pareamento_canal(pareamento_id: str, usuario: str) -> dict | None:
    agora = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        pareamento = con.execute("""
            SELECT * FROM canal_pareamentos
            WHERE id = ? AND usuario = ? AND status = 'reivindicado' AND expira_em > ?
        """, (pareamento_id, usuario, agora)).fetchone()
        if not pareamento:
            return None

        conflito = con.execute("""
            SELECT id, status FROM canal_conexoes
            WHERE provedor = ? AND external_user_id = ? AND usuario <> ?
        """, (pareamento["provedor"], pareamento["external_user_id"], usuario)).fetchone()
        if conflito and conflito["status"] == "ativo":
            raise ValueError("Esta conta externa ja esta conectada a outro usuario")
        if conflito:
            con.execute("DELETE FROM canal_conexoes WHERE id = ?", (conflito["id"],))

        conexao_id = str(uuid.uuid4())
        con.execute("""
            INSERT INTO canal_conexoes
                (id, usuario, provedor, external_user_id, external_chat_id,
                 external_username, ibge6, status, conectado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo', ?)
            ON CONFLICT(usuario, provedor) DO UPDATE SET
                external_user_id = excluded.external_user_id,
                external_chat_id = excluded.external_chat_id,
                external_username = excluded.external_username,
                ibge6 = excluded.ibge6,
                conversa_atual_id = NULL,
                status = 'ativo',
                conectado_em = excluded.conectado_em,
                ultimo_uso_em = NULL,
                revogado_em = NULL
        """, (
            conexao_id, usuario, pareamento["provedor"], pareamento["external_user_id"],
            pareamento["external_chat_id"], pareamento["external_username"],
            pareamento["ibge6"], agora,
        ))
        con.execute("""
            UPDATE canal_pareamentos SET status = 'confirmado', confirmado_em = ?
            WHERE id = ?
        """, (agora, pareamento_id))
        conexao = con.execute("""
            SELECT * FROM canal_conexoes WHERE usuario = ? AND provedor = ?
        """, (usuario, pareamento["provedor"])).fetchone()
        pareamento_atualizado = con.execute(
            "SELECT * FROM canal_pareamentos WHERE id = ?", (pareamento_id,)
        ).fetchone()
    out = _row_dict(conexao)
    if out:
        _sync_row("canal_conexoes", out)
    if pareamento_atualizado:
        _sync_row("canal_pareamentos", dict(pareamento_atualizado))
    return out


def cancelar_pareamento_canal(pareamento_id: str, usuario: str) -> bool:
    agora = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        cursor = con.execute("""
            UPDATE canal_pareamentos SET status = 'cancelado', cancelado_em = ?
            WHERE id = ? AND usuario = ? AND status IN ('emitido', 'reivindicado')
        """, (agora, pareamento_id, usuario))
    if cursor.rowcount == 1:
        _sync_row("canal_pareamentos", {"id": pareamento_id, "status": "cancelado", "cancelado_em": agora})
    return cursor.rowcount == 1


def listar_conexoes_canal(usuario: str) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT id, usuario, provedor, external_user_id, external_chat_id,
                   external_username, ibge6, conversa_atual_id, status,
                   conectado_em, ultimo_uso_em, revogado_em
            FROM canal_conexoes
            WHERE usuario = ? AND status = 'ativo'
            ORDER BY conectado_em DESC
        """, (usuario,)).fetchall()
    return [dict(row) for row in rows]


def get_conexao_canal_por_externo(provedor: str, external_user_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("""
            SELECT * FROM canal_conexoes
            WHERE provedor = ? AND external_user_id = ? AND status = 'ativo'
        """, (provedor, external_user_id)).fetchone()
    return _row_dict(row)


def revogar_conexao_canal(usuario: str, provedor: str) -> bool:
    agora = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        cursor = con.execute("""
            UPDATE canal_conexoes
            SET status = 'revogado', revogado_em = ?, conversa_atual_id = NULL
            WHERE usuario = ? AND provedor = ? AND status = 'ativo'
        """, (agora, usuario, provedor))
        row = con.execute(
            "SELECT id FROM canal_conexoes WHERE usuario = ? AND provedor = ?", (usuario, provedor)
        ).fetchone()
    if cursor.rowcount == 1 and row:
        _sync_row("canal_conexoes", {
            "id": row["id"], "status": "revogado", "revogado_em": agora, "conversa_atual_id": None,
        })
    return cursor.rowcount == 1


def atualizar_conversa_canal(conexao_id: str, conversa_id: str | None) -> None:
    agora = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute("""
            UPDATE canal_conexoes
            SET conversa_atual_id = ?, ultimo_uso_em = ? WHERE id = ? AND status = 'ativo'
        """, (conversa_id, agora, conexao_id))
    _sync_row("canal_conexoes", {
        "id": conexao_id, "conversa_atual_id": conversa_id, "ultimo_uso_em": agora,
    })


def registrar_evento_canal(provedor: str, external_id: str) -> bool:
    with _conn() as con:
        cursor = con.execute("""
            INSERT OR IGNORE INTO canal_eventos (provedor, external_id, processado_em)
            VALUES (?, ?, ?)
        """, (provedor, external_id, datetime.now(timezone.utc).isoformat()))
    return cursor.rowcount == 1


# ── Memória pessoal criptografada da Clara ──────────────────────────────────────

def upsert_memoria_usuario(owner_ref: str, fact_ref: str, payload_encrypted: str) -> dict:
    agora = datetime.now(timezone.utc).isoformat()
    memoria_id = str(uuid.uuid4())
    with _conn() as con:
        con.execute("""
            INSERT INTO susbot_memorias
                (id, owner_ref, fact_ref, payload_encrypted, criado_em, atualizado_em)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(owner_ref, fact_ref) DO UPDATE SET
                payload_encrypted = excluded.payload_encrypted,
                atualizado_em = excluded.atualizado_em
        """, (memoria_id, owner_ref, fact_ref, payload_encrypted, agora, agora))
        row = con.execute("""
            SELECT id, owner_ref, fact_ref, payload_encrypted, criado_em, atualizado_em
            FROM susbot_memorias WHERE owner_ref = ? AND fact_ref = ?
        """, (owner_ref, fact_ref)).fetchone()
    _sync_row("susbot_memorias", dict(row))
    return dict(row)


def listar_memorias_usuario(owner_ref: str) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT id, owner_ref, fact_ref, payload_encrypted, criado_em, atualizado_em
            FROM susbot_memorias
            WHERE owner_ref = ?
            ORDER BY atualizado_em DESC, id DESC
        """, (owner_ref,)).fetchall()
    return [dict(row) for row in rows]


def deletar_memoria_usuario(owner_ref: str, fact_ref: str | None = None) -> int:
    with _conn() as con:
        if fact_ref:
            cursor = con.execute(
                "DELETE FROM susbot_memorias WHERE owner_ref = ? AND fact_ref = ?",
                (owner_ref, fact_ref),
            )
        else:
            cursor = con.execute("DELETE FROM susbot_memorias WHERE owner_ref = ?", (owner_ref,))
    eq = {"owner_ref": owner_ref, **({"fact_ref": fact_ref} if fact_ref else {})}
    _sync_delete("susbot_memorias", eq)
    return int(cursor.rowcount)


# ── Supabase read-only query (curated tables, e.g. sih_dengue_*, sinan_dengue_*) ──

def _supabase_read_key() -> str:
    """Return the backend-only key used by read contracts.

    Modern ``sb_secret_`` keys are preferred. The legacy service-role JWT is
    kept as a compatibility fallback for existing deployments.
    """
    return (
        os.getenv("SUPABASE_SECRET_KEY", "").strip()
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    )


def supabase_configured() -> bool:
    return bool(os.getenv("SUPABASE_URL", "").strip() and _supabase_read_key())


def sb_select(table: str, eq: dict | None = None, order: str | None = None, limit: int | None = None) -> list[dict]:
    """Read-only SELECT against a Supabase table via PostgREST. Never writes."""
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = _supabase_read_key()
    if not sb_url or not sb_key:
        raise RuntimeError(
            "Supabase não configurado (SUPABASE_URL e chave secreta de leitura ausentes)"
        )

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
    headers = {"apikey": key}
    # Modern sb_secret_ keys are not JWTs and must not be sent as Bearer tokens.
    # Legacy anon/service-role keys remain compatible with PostgREST this way.
    if not key.startswith(("sb_secret_", "sb_publishable_")):
        headers["Authorization"] = f"Bearer {key}"
    return headers


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


def _sb_delete(base_url: str, key: str, table: str, eq: dict) -> None:
    filters = "&".join(f"{k}=eq.{urllib.parse.quote(str(v))}" for k, v in eq.items())
    url = f"{base_url.rstrip('/')}/rest/v1/{table}?{filters}"
    code, payload = _sb_request("DELETE", url, key)
    if code >= 300:
        raise RuntimeError(f"Supabase delete {table} {code}: {payload.decode('utf-8', errors='ignore')[:300]}")


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


def _sync_row(table: str, row: dict) -> None:
    """Best-effort upsert of a single row to Supabase. No-op if not configured, never raises."""
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        return
    try:
        _sb_upsert(sb_url, sb_key, table, [row])
    except Exception as e:
        log.warning(f"Supabase sync failed for {table} (SQLite ok): {e}")


def _sync_delete(table: str, eq: dict) -> None:
    """Best-effort delete from Supabase. No-op if not configured, never raises."""
    sb_url = os.getenv("SUPABASE_URL", "").strip()
    sb_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not sb_url or not sb_key:
        return
    try:
        _sb_delete(sb_url, sb_key, table, eq)
    except Exception as e:
        log.warning(f"Supabase delete sync failed for {table} (SQLite ok): {e}")


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
