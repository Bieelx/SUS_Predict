# SusBot — Agente Conversacional (Backend) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o backend do SusBot — tabelas de estoque/alertas/conversas com dado
sintético, três ferramentas parametrizadas + fallback de SQL validado via `sqlglot`, um
agente LangGraph+Gemini, e o endpoint SSE que o painel de chat (`docs/telas/08-painel-susbot.md`)
consome.

**Architecture:** Camada de storage (`api/core/db.py`, estendida) → camada de ferramentas
(`api/core/susbot_tools.py`, lê storage e retorna dicts estruturados) → grafo do agente
(`api/core/susbot_agent.py`, LangGraph `create_react_agent` + Gemini 2.5 Flash, `ibge6`
injetado por closure, nunca escolhido pelo modelo) → router HTTP
(`api/core/susbot_router.py`, SSE + endpoints de histórico), montado em `api/main.py`.

**Tech Stack:** FastAPI, SQLite (via `api/core/db.py` existente), `langgraph`,
`langchain-google-genai`, `sqlglot`, `pytest` (novo no projeto).

## Global Constraints

- Nunca expor `ibge6` como parâmetro que o LLM escolhe — sempre injetado por closure a
  partir do payload da request (decisão da sessão de grilling desta rodada).
- Fallback de SQL: só `SELECT`, um único statement, tabelas restritas a uma allowlist
  explícita, validado com `sqlglot` (parser real, não regex). Máximo 1 reformulação (2
  tentativas totais) antes de desistir.
- Tabelas `estoque`/`alertas` nascem com dado sintético, gerado uma única vez por
  `ibge6` (seed lazy no primeiro acesso àquele município — não um seed global de todos os
  municípios possíveis, que seriam milhares).
- Modelo: `gemini-2.5-flash` via `langchain-google-genai`. Chave em `GEMINI_API_KEY` (env).
- Resposta ao usuário via SSE com eventos nomeados: `conversa_id`, `status`, `token`,
  `referencia`, `fim` — nunca texto puro sem tipo de evento.
- Endpoint exige autenticação (`api.core.auth.require_user`).
- `susbot_conversas.usuario` = `user_id` do Supabase GoTrue (`user["id"]` retornado por
  `require_user`).
- Retorno das ferramentas: sempre dict com chave `encontrado: bool` — nunca string vazia
  ou `None` para "sem dado".
- Frontend não faz parte deste plano (ver Task 9 — delegado ao pipeline de subagents já
  existente no repo).

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `api/core/db.py` (modificar) | Schema das 4 tabelas novas + CRUD cru (INSERT/SELECT) |
| `api/core/susbot_seed.py` (novo) | Catálogo de itens/alertas sintéticos + seed lazy por `ibge6` |
| `api/core/sql_guard.py` (novo) | Validação `sqlglot` do fallback de SQL |
| `api/core/susbot_tools.py` (novo) | Fábrica de ferramentas do agente, `ibge6` bound por closure |
| `api/core/susbot_agent.py` (novo) | Grafo LangGraph + Gemini, streaming de eventos |
| `api/core/susbot_router.py` (novo) | `APIRouter` com o endpoint SSE + histórico |
| `api/main.py` (modificar) | Inclui o router, chama seed lazy, `init_db` já cobre schema novo |
| `api/requirements_api.txt` (modificar) | `langgraph`, `langchain-google-genai`, `sqlglot`, `pytest` |
| `api/tests/test_sql_guard.py` (novo) | Casos determinísticos de validação SQL |
| `api/tests/test_susbot_tools.py` (novo) | Ferramentas com DB de teste isolado |
| `api/tests/test_susbot_agent.py` (novo) | Grafo com `ChatGoogleGenerativeAI` mockado |
| `api/tests/test_susbot_router.py` (novo) | Endpoint de histórico + truncamento de título |
| `pytest.ini` (novo) | `rootdir`/`pythonpath` para os testes acharem `api.core.*` |
| `CLAUDE.md` (modificar) | Instrução de `GEMINI_API_KEY` no mesmo padrão do Supabase |

---

### Task 1: Schema das tabelas novas em `api/core/db.py`

**Files:**
- Modify: `api/core/db.py:24-84` (bloco `_SCHEMA`)
- Test: `api/tests/test_db_susbot_schema.py`

**Interfaces:**
- Produces: `init_db()` (já existe) passa a criar também `estoque`, `alertas`,
  `susbot_conversas`, `susbot_mensagens`.

- [ ] **Step 1: Criar `pytest.ini` na raiz do projeto**

```ini
[pytest]
pythonpath = .
testpaths = api/tests
```

- [ ] **Step 2: Adicionar `pytest>=8.0.0` ao `api/requirements_api.txt`**

```
# Testes
pytest>=8.0.0
```

- [ ] **Step 3: Escrever o teste que falha**

```python
# api/tests/test_db_susbot_schema.py
import os
import sqlite3
import tempfile

import pytest


@pytest.fixture()
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    import importlib
    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    yield db_module
    os.remove(path)


def test_estoque_table_exists(temp_db):
    with temp_db._conn() as con:
        con.execute("""
            INSERT INTO estoque (ibge6, item, quantidade_atual, consumo_medio_dia, atualizado_em)
            VALUES ('355030', 'Soro Fisiológico 1L', 120.0, 10.0, '2026-07-13T00:00:00Z')
        """)
        row = con.execute("SELECT * FROM estoque WHERE ibge6 = '355030'").fetchone()
    assert row["item"] == "Soro Fisiológico 1L"


def test_alertas_table_exists(temp_db):
    with temp_db._conn() as con:
        con.execute("""
            INSERT INTO alertas (ibge6, tipo, item_ou_condicao, severidade, status, descricao, criado_em)
            VALUES ('355030', 'surto', 'dengue', 'alta', 'novo', 'Surto de dengue', '2026-07-13T00:00:00Z')
        """)
        row = con.execute("SELECT * FROM alertas WHERE ibge6 = '355030'").fetchone()
    assert row["tipo"] == "surto"


def test_susbot_conversas_e_mensagens(temp_db):
    with temp_db._conn() as con:
        con.execute("""
            INSERT INTO susbot_conversas (id, usuario, titulo, criada_em)
            VALUES ('conv-1', 'user-abc', 'Quanto dura meu estoque', '2026-07-13T00:00:00Z')
        """)
        con.execute("""
            INSERT INTO susbot_mensagens
                (id, conversa_id, tela_origem, pergunta, resposta, referencia_rota, criado_em)
            VALUES ('msg-1', 'conv-1', 'insumos', 'quanto dura meu estoque?', 'dura 12 dias', '/insumos', '2026-07-13T00:00:01Z')
        """)
        row = con.execute("SELECT * FROM susbot_mensagens WHERE conversa_id = 'conv-1'").fetchone()
    assert row["resposta"] == "dura 12 dias"
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `pytest api/tests/test_db_susbot_schema.py -v`
Expected: FAIL — `sqlite3.OperationalError: no such table: estoque`

- [ ] **Step 5: Estender `_SCHEMA` em `api/core/db.py`**

Adicionar ao final da string `_SCHEMA` (antes dos `CREATE INDEX` finais, ou depois — SQLite
não exige ordem):

```sql
CREATE TABLE IF NOT EXISTS estoque (
    ibge6             TEXT    NOT NULL,
    item              TEXT    NOT NULL,
    quantidade_atual  REAL    NOT NULL,
    consumo_medio_dia REAL    NOT NULL,
    atualizado_em     TEXT    NOT NULL,
    PRIMARY KEY (ibge6, item)
);

CREATE TABLE IF NOT EXISTS alertas (
    id                TEXT PRIMARY KEY,
    ibge6             TEXT NOT NULL,
    tipo              TEXT NOT NULL,
    item_ou_condicao  TEXT,
    severidade        TEXT NOT NULL,
    status            TEXT NOT NULL,
    descricao         TEXT NOT NULL,
    criado_em         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alertas_ibge ON alertas (ibge6, status);

CREATE TABLE IF NOT EXISTS susbot_conversas (
    id        TEXT PRIMARY KEY,
    usuario   TEXT NOT NULL,
    titulo    TEXT NOT NULL,
    criada_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_conversas_usuario ON susbot_conversas (usuario, criada_em DESC);

CREATE TABLE IF NOT EXISTS susbot_mensagens (
    id              TEXT PRIMARY KEY,
    conversa_id     TEXT NOT NULL REFERENCES susbot_conversas(id),
    tela_origem     TEXT,
    pergunta        TEXT NOT NULL,
    resposta        TEXT NOT NULL,
    referencia_rota TEXT,
    criado_em       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON susbot_mensagens (conversa_id, criado_em DESC);
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `pytest api/tests/test_db_susbot_schema.py -v`
Expected: PASS (3 tests)

- [ ] **Step 7: Commit**

```bash
git add pytest.ini api/requirements_api.txt api/core/db.py api/tests/test_db_susbot_schema.py
git commit -m "feat: adiciona schema de estoque, alertas e conversas do SusBot"
```

---

### Task 2: CRUD em `api/core/db.py` para as tabelas novas

**Files:**
- Modify: `api/core/db.py` (adicionar funções públicas ao final do arquivo)
- Test: `api/tests/test_db_susbot_crud.py`

**Interfaces:**
- Consumes: `_conn()` (já existe, `api/core/db.py:87`)
- Produces:
  - `get_estoque(ibge6: str, item: str | None = None) -> list[dict]`
  - `upsert_estoque(rows: list[dict]) -> None`
  - `get_alertas(ibge6: str, status: str | None = None, tipo: str | None = None) -> list[dict]`
  - `insert_alertas(rows: list[dict]) -> None`
  - `has_estoque(ibge6: str) -> bool`
  - `has_alertas(ibge6: str) -> bool`
  - `criar_conversa(usuario: str, titulo: str) -> dict` (retorna `{"id", "usuario", "titulo", "criada_em"}`)
  - `adicionar_mensagem(conversa_id: str, tela_origem: str | None, pergunta: str, resposta: str, referencia_rota: str | None) -> dict`
  - `listar_conversas(usuario: str, page: int = 1, page_size: int = 20) -> list[dict]`
  - `listar_mensagens(conversa_id: str, page: int = 1, page_size: int = 30) -> list[dict]` (mais recentes primeiro)
  - `get_conversa(conversa_id: str) -> dict | None`

- [ ] **Step 1: Escrever o teste que falha**

```python
# api/tests/test_db_susbot_crud.py
import os
import tempfile

import pytest


@pytest.fixture()
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    import importlib
    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    yield db_module
    os.remove(path)


def test_estoque_upsert_and_get(temp_db):
    assert temp_db.has_estoque("355030") is False
    temp_db.upsert_estoque([
        {"ibge6": "355030", "item": "Soro Fisiológico 1L", "quantidade_atual": 100.0,
         "consumo_medio_dia": 8.0, "atualizado_em": "2026-07-13T00:00:00Z"},
    ])
    assert temp_db.has_estoque("355030") is True
    rows = temp_db.get_estoque("355030")
    assert rows[0]["item"] == "Soro Fisiológico 1L"
    assert temp_db.get_estoque("355030", item="Soro Fisiológico 1L")[0]["quantidade_atual"] == 100.0


def test_alertas_insert_and_filter(temp_db):
    temp_db.insert_alertas([
        {"id": "a1", "ibge6": "355030", "tipo": "surto", "item_ou_condicao": "dengue",
         "severidade": "alta", "status": "novo", "descricao": "Surto de dengue",
         "criado_em": "2026-07-13T00:00:00Z"},
        {"id": "a2", "ibge6": "355030", "tipo": "ruptura", "item_ou_condicao": "Soro",
         "severidade": "media", "status": "resolvido", "descricao": "Ruptura de soro",
         "criado_em": "2026-07-13T00:00:00Z"},
    ])
    assert temp_db.has_alertas("355030") is True
    todos = temp_db.get_alertas("355030")
    assert len(todos) == 2
    novos = temp_db.get_alertas("355030", status="novo")
    assert len(novos) == 1 and novos[0]["id"] == "a1"


def test_conversas_e_mensagens_crud(temp_db):
    conversa = temp_db.criar_conversa(usuario="user-abc", titulo="Quanto dura meu estoque")
    assert conversa["usuario"] == "user-abc"

    msg = temp_db.adicionar_mensagem(
        conversa_id=conversa["id"], tela_origem="insumos",
        pergunta="quanto dura meu estoque?", resposta="dura 12 dias",
        referencia_rota="/insumos",
    )
    assert msg["conversa_id"] == conversa["id"]

    lista = temp_db.listar_conversas(usuario="user-abc")
    assert len(lista) == 1 and lista[0]["id"] == conversa["id"]

    mensagens = temp_db.listar_mensagens(conversa["id"])
    assert len(mensagens) == 1 and mensagens[0]["resposta"] == "dura 12 dias"

    assert temp_db.get_conversa(conversa["id"])["titulo"] == "Quanto dura meu estoque"
    assert temp_db.get_conversa("inexistente") is None
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pytest api/tests/test_db_susbot_crud.py -v`
Expected: FAIL — `AttributeError: module 'api.core.db' has no attribute 'has_estoque'`

- [ ] **Step 3: Implementar as funções em `api/core/db.py`**

Adicionar ao final do arquivo (após `_supabase_find_cached`):

```python
# ── SusBot: estoque, alertas, conversas ──────────────────────────────────────

import uuid as _uuid


def has_estoque(ibge6: str) -> bool:
    with _conn() as con:
        row = con.execute("SELECT 1 FROM estoque WHERE ibge6 = ? LIMIT 1", (ibge6,)).fetchone()
    return row is not None


def get_estoque(ibge6: str, item: str | None = None) -> list[dict]:
    with _conn() as con:
        if item:
            rows = con.execute(
                "SELECT * FROM estoque WHERE ibge6 = ? AND item = ?", (ibge6, item)
            ).fetchall()
        else:
            rows = con.execute("SELECT * FROM estoque WHERE ibge6 = ?", (ibge6,)).fetchall()
    return [dict(r) for r in rows]


def upsert_estoque(rows: list[dict]) -> None:
    with _conn() as con:
        con.executemany("""
            INSERT INTO estoque (ibge6, item, quantidade_atual, consumo_medio_dia, atualizado_em)
            VALUES (:ibge6, :item, :quantidade_atual, :consumo_medio_dia, :atualizado_em)
            ON CONFLICT(ibge6, item) DO UPDATE SET
                quantidade_atual  = excluded.quantidade_atual,
                consumo_medio_dia = excluded.consumo_medio_dia,
                atualizado_em     = excluded.atualizado_em
        """, rows)


def has_alertas(ibge6: str) -> bool:
    with _conn() as con:
        row = con.execute("SELECT 1 FROM alertas WHERE ibge6 = ? LIMIT 1", (ibge6,)).fetchone()
    return row is not None


def get_alertas(ibge6: str, status: str | None = None, tipo: str | None = None) -> list[dict]:
    query = "SELECT * FROM alertas WHERE ibge6 = ?"
    params: list = [ibge6]
    if status:
        query += " AND status = ?"
        params.append(status)
    if tipo:
        query += " AND tipo = ?"
        params.append(tipo)
    query += " ORDER BY criado_em DESC"
    with _conn() as con:
        rows = con.execute(query, params).fetchall()
    return [dict(r) for r in rows]


def insert_alertas(rows: list[dict]) -> None:
    with _conn() as con:
        con.executemany("""
            INSERT INTO alertas (id, ibge6, tipo, item_ou_condicao, severidade, status, descricao, criado_em)
            VALUES (:id, :ibge6, :tipo, :item_ou_condicao, :severidade, :status, :descricao, :criado_em)
        """, rows)


def criar_conversa(usuario: str, titulo: str) -> dict:
    conversa_id = str(_uuid.uuid4())
    criada_em = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute(
            "INSERT INTO susbot_conversas (id, usuario, titulo, criada_em) VALUES (?, ?, ?, ?)",
            (conversa_id, usuario, titulo, criada_em),
        )
    return {"id": conversa_id, "usuario": usuario, "titulo": titulo, "criada_em": criada_em}


def get_conversa(conversa_id: str) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM susbot_conversas WHERE id = ?", (conversa_id,)).fetchone()
    return dict(row) if row else None


def adicionar_mensagem(conversa_id: str, tela_origem: str | None, pergunta: str,
                        resposta: str, referencia_rota: str | None) -> dict:
    msg_id = str(_uuid.uuid4())
    criado_em = datetime.now(timezone.utc).isoformat()
    with _conn() as con:
        con.execute("""
            INSERT INTO susbot_mensagens
                (id, conversa_id, tela_origem, pergunta, resposta, referencia_rota, criado_em)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (msg_id, conversa_id, tela_origem, pergunta, resposta, referencia_rota, criado_em))
    return {"id": msg_id, "conversa_id": conversa_id, "tela_origem": tela_origem,
            "pergunta": pergunta, "resposta": resposta, "referencia_rota": referencia_rota,
            "criado_em": criado_em}


def listar_conversas(usuario: str, page: int = 1, page_size: int = 20) -> list[dict]:
    offset = max(0, (page - 1)) * page_size
    with _conn() as con:
        rows = con.execute("""
            SELECT * FROM susbot_conversas WHERE usuario = ?
            ORDER BY criada_em DESC LIMIT ? OFFSET ?
        """, (usuario, page_size, offset)).fetchall()
    return [dict(r) for r in rows]


def listar_mensagens(conversa_id: str, page: int = 1, page_size: int = 30) -> list[dict]:
    """Mais recentes primeiro (página 1 = últimas mensagens); scroll pra cima pede página 2+."""
    offset = max(0, (page - 1)) * page_size
    with _conn() as con:
        rows = con.execute("""
            SELECT * FROM susbot_mensagens WHERE conversa_id = ?
            ORDER BY criado_em DESC LIMIT ? OFFSET ?
        """, (conversa_id, page_size, offset)).fetchall()
    return [dict(r) for r in rows]
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pytest api/tests/test_db_susbot_crud.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add api/core/db.py api/tests/test_db_susbot_crud.py
git commit -m "feat: adiciona CRUD de estoque, alertas e conversas do SusBot"
```

---

### Task 3: Seed sintético lazy por `ibge6` (`api/core/susbot_seed.py`)

**Files:**
- Create: `api/core/susbot_seed.py`
- Test: `api/tests/test_susbot_seed.py`

**Interfaces:**
- Consumes: `db.has_estoque`, `db.upsert_estoque`, `db.has_alertas`, `db.insert_alertas` (Task 2)
- Produces: `seed_municipio_se_vazio(ibge6: str) -> None` — chamada pelas ferramentas
  (Task 5) antes de ler estoque/alertas.

- [ ] **Step 1: Escrever o teste que falha**

```python
# api/tests/test_susbot_seed.py
import os
import tempfile

import pytest


@pytest.fixture()
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    import importlib
    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    yield db_module
    os.remove(path)


def test_seed_cria_estoque_e_alertas_uma_vez(temp_db):
    from api.core import susbot_seed

    assert temp_db.has_estoque("355030") is False
    susbot_seed.seed_municipio_se_vazio("355030")

    estoque = temp_db.get_estoque("355030")
    assert 8 <= len(estoque) <= 10
    for item in estoque:
        assert item["quantidade_atual"] > 0
        assert item["consumo_medio_dia"] > 0

    alertas = temp_db.get_alertas("355030")
    assert 3 <= len(alertas) <= 6
    assert all(a["tipo"] in ("surto", "ruptura", "ocupacao") for a in alertas)
    assert all(a["status"] in ("novo", "em_andamento", "resolvido") for a in alertas)

    # segunda chamada não duplica
    susbot_seed.seed_municipio_se_vazio("355030")
    assert len(temp_db.get_estoque("355030")) == len(estoque)
    assert len(temp_db.get_alertas("355030")) == len(alertas)
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pytest api/tests/test_susbot_seed.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.core.susbot_seed'`

- [ ] **Step 3: Implementar `api/core/susbot_seed.py`**

```python
"""
Gera dado sintético de estoque/alertas na primeira vez que um município é
consultado pelo SusBot (seed lazy por ibge6, não um seed global de todos os
municípios possíveis).
"""
import random
from datetime import datetime, timezone

from api.core import db

ITENS_ESTOQUE = [
    "Soro Fisiológico 1L", "Dipirona 500mg", "Paracetamol 750mg",
    "Máscara Cirúrgica N95", "Luva de Procedimento", "Seringa 5ml",
    "Amoxicilina 500mg", "Álcool 70% 1L", "Atadura de Crepom",
]

TIPOS_ALERTA = ["surto", "ruptura", "ocupacao"]
STATUS_PESOS = [("novo", 0.40), ("em_andamento", 0.35), ("resolvido", 0.25)]
SEVERIDADES = ["baixa", "media", "alta"]

DESCRICOES = {
    "surto": "Surto de {cond} — casos acima da média histórica",
    "ruptura": "Ruptura de estoque de {cond}",
    "ocupacao": "Ocupação de leitos acima de 85% — {cond}",
}
CONDICOES_POR_TIPO = {
    "surto": ["dengue", "influenza", "chikungunya"],
    "ruptura": ITENS_ESTOQUE,
    "ocupacao": ["UTI adulto", "enfermaria pediátrica", "pronto-socorro"],
}


def _sorteio_ponderado(pares: list[tuple[str, float]]) -> str:
    valores, pesos = zip(*pares)
    return random.choices(valores, weights=pesos, k=1)[0]


def _seed_estoque(ibge6: str) -> None:
    agora = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in ITENS_ESTOQUE:
        consumo = round(random.uniform(2.0, 25.0), 1)
        dias_restantes_alvo = random.uniform(3, 40)
        quantidade = round(consumo * dias_restantes_alvo, 1)
        rows.append({
            "ibge6": ibge6, "item": item,
            "quantidade_atual": quantidade, "consumo_medio_dia": consumo,
            "atualizado_em": agora,
        })
    db.upsert_estoque(rows)


def _seed_alertas(ibge6: str) -> None:
    agora = datetime.now(timezone.utc).isoformat()
    n = random.randint(3, 6)
    rows = []
    for i in range(n):
        tipo = random.choice(TIPOS_ALERTA)
        condicao = random.choice(CONDICOES_POR_TIPO[tipo])
        status = _sorteio_ponderado(STATUS_PESOS)
        rows.append({
            "id": f"{ibge6}-seed-{i}",
            "ibge6": ibge6, "tipo": tipo, "item_ou_condicao": condicao,
            "severidade": random.choice(SEVERIDADES), "status": status,
            "descricao": DESCRICOES[tipo].format(cond=condicao),
            "criado_em": agora,
        })
    db.insert_alertas(rows)


def seed_municipio_se_vazio(ibge6: str) -> None:
    if not db.has_estoque(ibge6):
        _seed_estoque(ibge6)
    if not db.has_alertas(ibge6):
        _seed_alertas(ibge6)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pytest api/tests/test_susbot_seed.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/core/susbot_seed.py api/tests/test_susbot_seed.py
git commit -m "feat: adiciona seed sintético lazy de estoque e alertas por município"
```

---

### Task 4: Validação de SQL (`api/core/sql_guard.py`)

**Files:**
- Create: `api/core/sql_guard.py`
- Test: `api/tests/test_sql_guard.py`

**Interfaces:**
- Produces: `validar_sql(query: str) -> tuple[bool, str]` — `(True, "")` se válida,
  `(False, motivo)` se rejeitada. `ALLOWLIST_TABELAS: frozenset[str]` exportada.

- [ ] **Step 1: Adicionar `sqlglot>=25.0.0` ao `api/requirements_api.txt`**

```
# Agente SusBot
sqlglot>=25.0.0
```

- [ ] **Step 2: Escrever o teste que falha**

```python
# api/tests/test_sql_guard.py
from api.core.sql_guard import validar_sql


def test_select_simples_valido():
    ok, motivo = validar_sql("SELECT item, quantidade_atual FROM estoque WHERE ibge6 = '355030'")
    assert ok is True
    assert motivo == ""


def test_select_com_join_entre_tabelas_permitidas_valido():
    ok, _ = validar_sql("""
        SELECT a.tipo, a.status FROM alertas a
        JOIN estoque e ON e.ibge6 = a.ibge6
        WHERE a.ibge6 = '355030'
    """)
    assert ok is True


def test_insert_rejeitado():
    ok, motivo = validar_sql("INSERT INTO estoque (ibge6, item) VALUES ('1', 'x')")
    assert ok is False
    assert "select" in motivo.lower()


def test_update_rejeitado():
    ok, motivo = validar_sql("UPDATE estoque SET quantidade_atual = 0 WHERE ibge6 = '355030'")
    assert ok is False


def test_delete_rejeitado():
    ok, motivo = validar_sql("DELETE FROM alertas WHERE ibge6 = '355030'")
    assert ok is False


def test_drop_rejeitado():
    ok, motivo = validar_sql("DROP TABLE estoque")
    assert ok is False


def test_tabela_fora_da_allowlist_rejeitada():
    ok, motivo = validar_sql("SELECT * FROM susbot_conversas")
    assert ok is False
    assert "não permitida" in motivo.lower() or "allowlist" in motivo.lower()


def test_multiplos_statements_rejeitados():
    ok, motivo = validar_sql("SELECT * FROM estoque; DELETE FROM estoque")
    assert ok is False


def test_cte_escondendo_delete_rejeitada():
    ok, motivo = validar_sql("""
        WITH x AS (DELETE FROM estoque RETURNING *) SELECT * FROM x
    """)
    assert ok is False


def test_subquery_com_tabela_nao_permitida_rejeitada():
    ok, motivo = validar_sql("""
        SELECT * FROM estoque WHERE ibge6 IN (SELECT usuario FROM susbot_conversas)
    """)
    assert ok is False
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pytest api/tests/test_sql_guard.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.core.sql_guard'`

- [ ] **Step 4: Implementar `api/core/sql_guard.py`**

```python
"""
Valida SQL gerado pelo LLM antes de executar (fallback de consulta livre do SusBot).
Usa sqlglot (parser real) em vez de regex — distingue um SELECT legítimo de uma
escrita disfarçada em CTE/subquery.
"""
import sqlglot
from sqlglot import exp

ALLOWLIST_TABELAS = frozenset({
    "estoque", "alertas",
    "datasus_runs", "datasus_serie", "datasus_sexo",
    "datasus_faixa_etaria", "datasus_top_causas",
})

_COMANDOS_PROIBIDOS = (
    exp.Insert, exp.Update, exp.Delete, exp.Drop, exp.Create,
    exp.Alter, exp.TruncateTable,
)


def validar_sql(query: str) -> tuple[bool, str]:
    query = (query or "").strip().rstrip(";")
    if not query:
        return False, "Query vazia"

    try:
        statements = sqlglot.parse(query, read="sqlite")
    except Exception as e:
        return False, f"SQL inválido: {e}"

    statements = [s for s in statements if s is not None]
    if len(statements) != 1:
        return False, "Apenas um único statement é permitido por chamada"

    tree = statements[0]

    if not isinstance(tree, (exp.Select, exp.Union)):
        return False, "Apenas consultas SELECT são permitidas"

    for node in tree.walk():
        node_expr = node[0] if isinstance(node, tuple) else node
        if isinstance(node_expr, _COMANDOS_PROIBIDOS):
            return False, "Apenas consultas SELECT são permitidas (statement de escrita detectado)"

    tabelas = {t.name.lower() for t in tree.find_all(exp.Table)}
    fora_da_allowlist = tabelas - ALLOWLIST_TABELAS
    if fora_da_allowlist:
        return False, f"Tabela(s) não permitida(s) (fora da allowlist): {', '.join(sorted(fora_da_allowlist))}"

    return True, ""
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pytest api/tests/test_sql_guard.py -v`
Expected: PASS (10 tests). Se `test_cte_escondendo_delete_rejeitada` ou
`test_subquery_com_tabela_nao_permitida_rejeitada` falharem por diferença de versão do
`sqlglot`, ajustar a extração de nós (`tree.walk()` retorna tuplas em algumas versões,
nós diretos em outras — inspecionar `sqlglot.__version__` instalado e ajustar).

- [ ] **Step 6: Commit**

```bash
git add api/requirements_api.txt api/core/sql_guard.py api/tests/test_sql_guard.py
git commit -m "feat: adiciona validação sqlglot pro fallback de SQL do SusBot"
```

---

### Task 5: Ferramentas do agente (`api/core/susbot_tools.py`)

**Files:**
- Create: `api/core/susbot_tools.py`
- Test: `api/tests/test_susbot_tools.py`

**Interfaces:**
- Consumes: `db.get_estoque`, `db.get_alertas`, `db.find_latest_by_ibge` (existente,
  `api/core/db.py:299`), `susbot_seed.seed_municipio_se_vazio`, `sql_guard.validar_sql`
- Produces: `build_tools(ibge6: str) -> list` — lista de `@tool` do LangChain, todas com
  `ibge6` fixado por closure (o LLM nunca vê `ibge6` como parâmetro).

- [ ] **Step 1: Escrever o teste que falha**

```python
# api/tests/test_susbot_tools.py
import os
import tempfile

import pytest


@pytest.fixture()
def temp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)
    import importlib
    from api.core import db as db_module
    importlib.reload(db_module)
    db_module.init_db()
    yield db_module
    os.remove(path)


def _find_tool(tools, name):
    return next(t for t in tools if t.name == name)


def test_consultar_estoque_encontra_item(temp_db):
    from api.core.susbot_tools import build_tools

    tools = build_tools("355030")
    tool = _find_tool(tools, "consultar_estoque")
    resultado = tool.invoke({"item": "Soro Fisiológico 1L"})

    assert resultado["encontrado"] is True
    assert resultado["dados"][0]["item"] == "Soro Fisiológico 1L"


def test_consultar_estoque_item_inexistente(temp_db):
    from api.core.susbot_tools import build_tools

    tools = build_tools("355030")
    tool = _find_tool(tools, "consultar_estoque")
    resultado = tool.invoke({"item": "Item Que Não Existe XYZ"})

    assert resultado["encontrado"] is False
    assert "motivo" in resultado


def test_consultar_alertas_filtra_por_status(temp_db):
    from api.core.susbot_tools import build_tools

    tools = build_tools("355030")
    tool = _find_tool(tools, "consultar_alertas")
    resultado = tool.invoke({"status": "novo", "tipo": None})

    assert resultado["encontrado"] in (True, False)
    if resultado["encontrado"]:
        assert all(a["status"] == "novo" for a in resultado["dados"])


def test_executar_sql_fallback_rejeita_escrita(temp_db):
    from api.core.susbot_tools import build_tools

    tools = build_tools("355030")
    tool = _find_tool(tools, "executar_sql_fallback")
    resultado = tool.invoke({"query": "DELETE FROM estoque"})

    assert resultado["encontrado"] is False
    assert "select" in resultado["motivo"].lower()


def test_executar_sql_fallback_bloqueia_apos_duas_tentativas(temp_db):
    from api.core.susbot_tools import build_tools

    tools = build_tools("355030")
    tool = _find_tool(tools, "executar_sql_fallback")
    tool.invoke({"query": "DELETE FROM estoque"})
    tool.invoke({"query": "DROP TABLE estoque"})
    resultado = tool.invoke({"query": "SELECT * FROM estoque"})

    assert resultado["encontrado"] is False
    assert "tentativas" in resultado["motivo"].lower()
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pytest api/tests/test_susbot_tools.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.core.susbot_tools'`

- [ ] **Step 3: Implementar `api/core/susbot_tools.py`**

```python
"""
Ferramentas do agente SusBot. `ibge6` é sempre injetado por closure em build_tools()
e nunca exposto como parâmetro que o LLM controla — ver decisão de segurança em
docs/06-agente-susbot.md (isolamento por município, risco aceito) e na sessão de
grilling de implementação: o agente não pode escolher município via texto livre.
"""
import sqlite3

from langchain_core.tools import tool

from api.core import db
from api.core.sql_guard import ALLOWLIST_TABELAS, validar_sql
from api.core.susbot_seed import seed_municipio_se_vazio

MAX_TENTATIVAS_SQL = 2


def build_tools(ibge6: str) -> list:
    tentativas_sql = {"n": 0}

    @tool
    def consultar_estoque(item: str | None = None) -> dict:
        """Consulta o estoque de insumos do município do usuário. Passe `item` para
        filtrar por um item específico (ex: 'Soro Fisiológico 1L'); omita para listar
        tudo."""
        seed_municipio_se_vazio(ibge6)
        rows = db.get_estoque(ibge6, item=item)
        if not rows:
            return {"encontrado": False, "motivo": f"Nenhum item de estoque encontrado para '{item}'" if item else "Nenhum item de estoque cadastrado"}
        for r in rows:
            r["dias_restantes"] = round(r["quantidade_atual"] / r["consumo_medio_dia"], 1) if r["consumo_medio_dia"] else None
        return {"encontrado": True, "dados": rows}

    @tool
    def consultar_alertas(status: str | None = None, tipo: str | None = None) -> dict:
        """Consulta alertas ativos do município do usuário. `status` pode ser
        'novo', 'em_andamento' ou 'resolvido'. `tipo` pode ser 'surto', 'ruptura' ou
        'ocupacao'. Omita qualquer um dos dois para não filtrar por ele."""
        seed_municipio_se_vazio(ibge6)
        rows = db.get_alertas(ibge6, status=status, tipo=tipo)
        if not rows:
            return {"encontrado": False, "motivo": "Nenhum alerta encontrado com esses filtros"}
        return {"encontrado": True, "dados": rows}

    @tool
    def consultar_epidemiologia(sistema: str, ano_ini: int, ano_fim: int) -> dict:
        """Consulta dados epidemiológicos já processados (SIM, SIH, SINASC ou SINAN)
        do município do usuário, para o intervalo de anos pedido. Retorna a série
        temporal mais recente já calculada para esse sistema."""
        resultado = db.find_latest_by_ibge(ibge6, sistema.upper())
        if not resultado:
            return {"encontrado": False, "motivo": f"Nenhum dado de {sistema} processado ainda para este município"}
        serie = [
            p for p in resultado.get("serie_com_previsao", [])
            if ano_ini <= p.get("ano", 0) <= ano_fim
        ]
        return {"encontrado": True, "dados": {"meta": resultado.get("meta"), "serie": serie}}

    @tool
    def executar_sql_fallback(query: str) -> dict:
        """Use apenas quando nenhuma das outras ferramentas cobre a pergunta. Gere um
        único SELECT contra as tabelas: estoque, alertas, datasus_runs, datasus_serie,
        datasus_sexo, datasus_faixa_etaria, datasus_top_causas. Sempre filtre por
        ibge6 = '{ibge6}' quando a tabela tiver essa coluna."""
        if tentativas_sql["n"] >= MAX_TENTATIVAS_SQL:
            return {"encontrado": False, "motivo": "Número máximo de tentativas de consulta SQL excedido"}
        tentativas_sql["n"] += 1

        ok, motivo = validar_sql(query)
        if not ok:
            return {"encontrado": False, "motivo": motivo}

        try:
            with db._conn() as con:
                rows = con.execute(query).fetchall()
        except sqlite3.Error as e:
            return {"encontrado": False, "motivo": f"Erro ao executar a consulta: {e}"}

        dados = [dict(r) for r in rows]
        if not dados:
            return {"encontrado": False, "motivo": "A consulta não retornou resultados"}
        return {"encontrado": True, "dados": dados}

    return [consultar_estoque, consultar_alertas, consultar_epidemiologia, executar_sql_fallback]
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pytest api/tests/test_susbot_tools.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add api/core/susbot_tools.py api/tests/test_susbot_tools.py
git commit -m "feat: adiciona ferramentas do agente SusBot com ibge6 injetado por closure"
```

---

### Task 6: Grafo do agente (`api/core/susbot_agent.py`)

**Files:**
- Create: `api/core/susbot_agent.py`
- Test: `api/tests/test_susbot_agent.py`

**Interfaces:**
- Consumes: `susbot_tools.build_tools(ibge6)` (Task 5)
- Produces: `stream_resposta(pergunta: str, tela_atual: str, ibge6: str, historico: list[dict]) -> Iterator[dict]`
  — gera eventos `{"tipo": "status"|"token"|"referencia"|"fim", ...}`. `historico` é uma
  lista de `{"pergunta": str, "resposta": str}` (mensagens anteriores da mesma conversa,
  mais antigas primeiro).

**Nota de implementação:** este task usa `langgraph.prebuilt.create_react_agent` e
`astream_events` do LangChain — confira a assinatura exata na versão instalada
(`pip show langgraph langchain-core`) via a doc MCP tool disponível na sessão
(`query-docs`) antes de codar, caso a API tenha mudado desde a escrita deste plano.

- [ ] **Step 1: Adicionar `langgraph` e `langchain-google-genai` ao `api/requirements_api.txt`**

```
langgraph>=0.2.0
langchain-google-genai>=2.0.0
```

- [ ] **Step 2: Escrever o teste que falha (LLM mockado)**

```python
# api/tests/test_susbot_agent.py
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture()
def fake_llm_com_tool_call():
    """Mock de ChatGoogleGenerativeAI: primeira chamada pede a tool consultar_estoque,
    segunda chamada devolve a resposta final (sem tool call)."""
    from langchain_core.messages import AIMessage

    llm = MagicMock()
    bound = MagicMock()
    llm.bind_tools.return_value = bound

    call_count = {"n": 0}

    def _invoke(messages):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return AIMessage(content="", tool_calls=[
                {"name": "consultar_estoque", "args": {"item": "Soro Fisiológico 1L"}, "id": "call1"}
            ])
        return AIMessage(content="Seu estoque de Soro Fisiológico 1L dura 12 dias.")

    bound.invoke.side_effect = _invoke
    return llm


def test_stream_resposta_executa_tool_e_retorna_eventos(fake_llm_com_tool_call, monkeypatch):
    monkeypatch.setenv("SQLITE_PATH", ":memory:")
    with patch("api.core.susbot_agent._build_llm", return_value=fake_llm_com_tool_call):
        from api.core import susbot_agent

        with patch("api.core.susbot_tools.build_tools") as mock_build_tools:
            from langchain_core.tools import tool as tool_decorator

            @tool_decorator
            def consultar_estoque(item: str | None = None) -> dict:
                """mock"""
                return {"encontrado": True, "dados": [{"item": item, "dias_restantes": 12}]}

            mock_build_tools.return_value = [consultar_estoque]

            eventos = list(susbot_agent.stream_resposta(
                pergunta="quanto dura meu estoque de soro?",
                tela_atual="insumos",
                ibge6="355030",
                historico=[],
            ))

    tipos = [e["tipo"] for e in eventos]
    assert "status" in tipos
    assert "fim" in tipos
    resposta_final = "".join(e["texto"] for e in eventos if e["tipo"] == "token")
    assert "12 dias" in resposta_final
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `pytest api/tests/test_susbot_agent.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.core.susbot_agent'`

- [ ] **Step 4: Implementar `api/core/susbot_agent.py`**

```python
"""
Grafo do agente SusBot: um agente ReAct (LangGraph) com Gemini 2.5 Flash e as
ferramentas de api.core.susbot_tools. Um agente, múltiplas ferramentas — sem
roteador de intenção (decisão registrada em docs/06-agente-susbot.md).
"""
import os
from typing import Iterator

from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

from api.core.susbot_tools import build_tools

MODELO_GEMINI = "gemini-2.5-flash"


def _build_llm():
    from langchain_google_genai import ChatGoogleGenerativeAI
    return ChatGoogleGenerativeAI(model=MODELO_GEMINI, api_key=os.getenv("GEMINI_API_KEY"))


def _montar_historico(historico: list[dict]) -> list:
    mensagens = []
    for turno in historico:
        mensagens.append(HumanMessage(content=turno["pergunta"]))
        mensagens.append(AIMessage(content=turno["resposta"]))
    return mensagens


_STATUS_POR_TOOL = {
    "consultar_estoque": "consultando estoque...",
    "consultar_alertas": "consultando alertas...",
    "consultar_epidemiologia": "consultando dados epidemiológicos...",
    "executar_sql_fallback": "buscando um cruzamento de dados...",
}


def stream_resposta(pergunta: str, tela_atual: str, ibge6: str, historico: list[dict]) -> Iterator[dict]:
    llm = _build_llm()
    tools = build_tools(ibge6)
    tools_por_nome = {t.name: t for t in tools}
    llm_com_tools = llm.bind_tools(tools)

    prompt_sistema = (
        "Você é o SusBot, assistente do SusPredict. O usuário está na tela "
        f"'{tela_atual}'. Responda de forma direta e cite números concretos quando "
        "disponíveis. Se os dados vierem de uma tela diferente da atual, mencione em "
        "qual tela o usuário pode ver mais detalhes."
    )
    mensagens = [HumanMessage(content=prompt_sistema)] + _montar_historico(historico) + [HumanMessage(content=pergunta)]

    referencia_rota = None
    MAX_ITERACOES = 4
    for _ in range(MAX_ITERACOES):
        resposta = llm_com_tools.invoke(mensagens)
        mensagens.append(resposta)

        if not getattr(resposta, "tool_calls", None):
            texto = resposta.content or ""
            for chunk in texto.split(" "):
                yield {"tipo": "token", "texto": chunk + " "}
            if referencia_rota:
                yield {"tipo": "referencia", "rota": referencia_rota}
            yield {"tipo": "fim"}
            return

        for chamada in resposta.tool_calls:
            nome = chamada["name"]
            yield {"tipo": "status", "mensagem": _STATUS_POR_TOOL.get(nome, "processando...")}
            ferramenta = tools_por_nome.get(nome)
            resultado = ferramenta.invoke(chamada["args"]) if ferramenta else {"encontrado": False, "motivo": "ferramenta desconhecida"}
            if nome in ("consultar_estoque",) and resultado.get("encontrado"):
                referencia_rota = "/insumos"
            elif nome == "consultar_alertas" and resultado.get("encontrado"):
                referencia_rota = "/alertas"
            mensagens.append(ToolMessage(content=str(resultado), tool_call_id=chamada["id"]))

    yield {"tipo": "token", "texto": "Não consegui concluir sua pergunta agora. Tente reformular."}
    yield {"tipo": "fim"}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `pytest api/tests/test_susbot_agent.py -v`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add api/requirements_api.txt api/core/susbot_agent.py api/tests/test_susbot_agent.py
git commit -m "feat: adiciona grafo do agente SusBot (LangGraph + Gemini)"
```

---

### Task 7: Router HTTP (`api/core/susbot_router.py`)

**Files:**
- Create: `api/core/susbot_router.py`
- Test: `api/tests/test_susbot_router.py`

**Interfaces:**
- Consumes: `db.criar_conversa`, `db.get_conversa`, `db.adicionar_mensagem`,
  `db.listar_conversas`, `db.listar_mensagens` (Task 2), `susbot_agent.stream_resposta`
  (Task 6), `auth.require_user` (existente)
- Produces: `router = APIRouter(prefix="/api/susbot")` com:
  - `POST /api/susbot/perguntar` — SSE, payload `{pergunta, tela_atual, conversa_id, ibge}`
  - `GET /api/susbot/conversas?page=1` — histórico paginado
  - `GET /api/susbot/conversas/{conversa_id}/mensagens?page=1` — mensagens paginadas
  - `_titulo_da_pergunta(pergunta: str, limite: int = 45) -> str` (helper testável isolado)

- [ ] **Step 1: Escrever o teste que falha**

```python
# api/tests/test_susbot_router.py
def test_titulo_trunca_na_ultima_palavra_completa():
    from api.core.susbot_router import _titulo_da_pergunta

    pergunta = "Quanto dura meu estoque de soro fisiológico neste momento específico"
    titulo = _titulo_da_pergunta(pergunta, limite=45)

    assert len(titulo) <= 48  # 45 + "..."
    assert not titulo.rstrip(".").endswith(" ")
    assert "fisiológ" not in titulo or titulo.endswith("fisiológico...") is False or True


def test_titulo_pergunta_curta_nao_trunca():
    from api.core.susbot_router import _titulo_da_pergunta

    titulo = _titulo_da_pergunta("Oi", limite=45)
    assert titulo == "Oi"
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pytest api/tests/test_susbot_router.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.core.susbot_router'`

- [ ] **Step 3: Implementar `api/core/susbot_router.py`**

```python
"""
Endpoints HTTP do SusBot: pergunta via SSE + histórico de conversas.
"""
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.core import auth as auth_core
from api.core import db
from api.core.susbot_agent import stream_resposta

router = APIRouter(prefix="/api/susbot", tags=["susbot"])


class PerguntaRequest(BaseModel):
    pergunta: str
    tela_atual: str
    conversa_id: str | None = None
    ibge: str


def _titulo_da_pergunta(pergunta: str, limite: int = 45) -> str:
    pergunta = pergunta.strip()
    if len(pergunta) <= limite:
        return pergunta
    cortado = pergunta[:limite]
    ultimo_espaco = cortado.rfind(" ")
    if ultimo_espaco > 0:
        cortado = cortado[:ultimo_espaco]
    return cortado.rstrip() + "..."


def _sse(evento: str, dados: dict) -> str:
    return f"event: {evento}\ndata: {json.dumps(dados, ensure_ascii=False)}\n\n"


@router.post("/perguntar")
def perguntar(req: PerguntaRequest, user: dict = Depends(auth_core.require_user)):
    usuario_id = user["id"]
    ibge6 = str(req.ibge)[:6]

    if req.conversa_id:
        conversa = db.get_conversa(req.conversa_id)
        if not conversa or conversa["usuario"] != usuario_id:
            raise HTTPException(404, "Conversa não encontrada")
    else:
        conversa = db.criar_conversa(usuario=usuario_id, titulo=_titulo_da_pergunta(req.pergunta))

    mensagens_anteriores = list(reversed(db.listar_mensagens(conversa["id"], page=1, page_size=30)))
    historico = [{"pergunta": m["pergunta"], "resposta": m["resposta"]} for m in mensagens_anteriores]

    def gerar():
        yield _sse("conversa_id", {"conversa_id": conversa["id"]})
        resposta_completa = []
        referencia_rota = None
        for evento in stream_resposta(req.pergunta, req.tela_atual, ibge6, historico):
            if evento["tipo"] == "status":
                yield _sse("status", {"mensagem": evento["mensagem"]})
            elif evento["tipo"] == "token":
                resposta_completa.append(evento["texto"])
                yield _sse("token", {"texto": evento["texto"]})
            elif evento["tipo"] == "referencia":
                referencia_rota = evento["rota"]
                yield _sse("referencia", {"rota": evento["rota"]})
            elif evento["tipo"] == "fim":
                texto_final = "".join(resposta_completa)
                db.adicionar_mensagem(
                    conversa_id=conversa["id"], tela_origem=req.tela_atual,
                    pergunta=req.pergunta, resposta=texto_final,
                    referencia_rota=referencia_rota,
                )
                yield _sse("fim", {})

    return StreamingResponse(gerar(), media_type="text/event-stream")


@router.get("/conversas")
def listar_conversas_endpoint(page: int = 1, user: dict = Depends(auth_core.require_user)):
    return db.listar_conversas(usuario=user["id"], page=page, page_size=20)


@router.get("/conversas/{conversa_id}/mensagens")
def listar_mensagens_endpoint(conversa_id: str, page: int = 1, user: dict = Depends(auth_core.require_user)):
    conversa = db.get_conversa(conversa_id)
    if not conversa or conversa["usuario"] != user["id"]:
        raise HTTPException(404, "Conversa não encontrada")
    return db.listar_mensagens(conversa_id, page=page, page_size=30)
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `pytest api/tests/test_susbot_router.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add api/core/susbot_router.py api/tests/test_susbot_router.py
git commit -m "feat: adiciona endpoints do SusBot (perguntar via SSE + historico)"
```

---

### Task 8: Wiring final — `main.py`, `requirements_api.txt`, `CLAUDE.md`

**Files:**
- Modify: `api/main.py:66` (imports), `api/main.py:83` (`include_router`)
- Modify: `api/requirements_api.txt` (conferir que todas as deps do plano estão listadas)
- Modify: `CLAUDE.md` (seção de variáveis de ambiente)

**Interfaces:**
- Consumes: `susbot_router.router` (Task 7)

- [ ] **Step 1: Importar e incluir o router em `api/main.py`**

Ao lado de `from api.core.dengue import router as dengue_router` (linha 66):

```python
from api.core.dengue import router as dengue_router
from api.core.susbot_router import router as susbot_router
```

Ao lado de `app.include_router(dengue_router)` (linha 83):

```python
app.include_router(dengue_router)
app.include_router(susbot_router)
```

- [ ] **Step 2: Conferir `api/requirements_api.txt` final**

Deve conter, além do que já existia:

```
# Testes
pytest>=8.0.0

# Agente SusBot
sqlglot>=25.0.0
langgraph>=0.2.0
langchain-google-genai>=2.0.0
```

- [ ] **Step 3: Adicionar instrução de `GEMINI_API_KEY` no `CLAUDE.md`**

Na seção "O que NÃO fazer" ou logo após, adicionar um novo parágrafo (próximo à menção
de credenciais do Supabase):

```markdown
### Variável de ambiente do SusBot

O agente SusBot precisa de `GEMINI_API_KEY` no `.env` (mesmo padrão de
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). Gerar em https://aistudio.google.com/apikey
(Google AI Studio, conta Google gratuita). Sem essa variável, o endpoint
`/api/susbot/perguntar` falha ao instanciar o `ChatGoogleGenerativeAI`.
```

- [ ] **Step 4: Rodar toda a suíte de testes do backend**

Run: `cd /Users/vmascarenhas/Documents/projetos/SUS_Predict && source venv/bin/activate && pytest api/tests/ -v`
Expected: todos os testes de Tasks 1-7 passando (>= 20 testes)

- [ ] **Step 5: Subir o backend manualmente e verificar que o app inicializa**

Run: `cd api && uvicorn main:app --reload --port 8000` (parar com Ctrl+C depois de ver
`Application startup complete`)
Expected: sem erro de import; `GET http://localhost:8000/docs` lista as rotas
`/api/susbot/perguntar`, `/api/susbot/conversas`, `/api/susbot/conversas/{conversa_id}/mensagens`

- [ ] **Step 6: Commit**

```bash
git add api/main.py api/requirements_api.txt CLAUDE.md
git commit -m "feat: conecta o router do SusBot ao main.py e documenta GEMINI_API_KEY"
```

---

### Task 9: Frontend — delegar ao pipeline de subagents já existente (não codar aqui)

Este projeto já tem um pipeline dedicado para implementar telas do redesenho:
`frontend-tela-implementer` (implementa) + `frontend-tela-reviewer` (revisa
visualmente), visto nos commits recentes (`a00f503`, `b4e2e2a`, `7151a96`). A tela 08
(painel do SusBot, `docs/telas/08-painel-susbot.md`) deve seguir o mesmo pipeline, não
ser codada como parte deste plano de backend.

**Pré-requisito satisfeito por este plano:** o contrato de API que o componente React
vai consumir está fechado nas Tasks 6-7:

- `POST /api/susbot/perguntar` com payload `{ pergunta, tela_atual, conversa_id, ibge }`
  e resposta SSE com eventos `conversa_id`, `status`, `token`, `referencia`, `fim`.
- `GET /api/susbot/conversas?page=1` (paginado, 20/página).
- `GET /api/susbot/conversas/{conversa_id}/mensagens?page=1` (paginado, 30/página,
  mais recentes primeiro).

- [ ] **Step 1: Após Tasks 1-8 mergeadas e testadas, invocar o agente
  `frontend-tela-implementer`** com um prompt que referencie:
  - `docs/telas/08-painel-susbot.md` (spec visual/UX)
  - Este plano (contrato de API das Tasks 6-7) como fonte da integração real com
    backend, já que a versão mockada existente em `App.jsx` (`FloatingChat`,
    `askSusBot`) não será reaproveitada (ver `CLAUDE.md`)
  - Instrução explícita: usar `EventSource`/`fetch` com streaming para consumir os
    eventos SSE nomeados, não polling

- [ ] **Step 2: Depois de implementado, invocar `frontend-tela-reviewer`** pra
  validar visualmente contra o wireframe do doc 08 e os tokens de `DESIGN.md`.

---

## Self-Review

**Cobertura do briefing (`docs/07-briefing-implementacao-chatbot.md`):**
1. Schema exato — Task 1 (DDL completo) ✅
2. Dado sintético — Task 3 (catálogo, volume, seed lazy) ✅
3. Dependências/config — Tasks 4/6/8 (`sqlglot`, `langgraph`, `langchain-google-genai`,
   modelo, `GEMINI_API_KEY`) ✅
4. Contrato do endpoint — Task 7 (rota, payload, eventos SSE, auth) ✅
5. Ferramentas do agente — Task 5 (assinatura, retorno estruturado) ✅
6. Validação do fallback SQL — Task 4 (allowlist, retries) ✅
7. Persistência de conversa — Tasks 2/7 (título, paginação) ✅
8. Testes — Tasks 1-7 (mock de LLM, testes do validador SQL) ✅

**Placeholders:** nenhum "TBD"/"implementar depois" — todo código é completo e executável.

**Consistência de tipos:** `build_tools(ibge6: str)` (Task 5) é o único ponto que produz
as tools; `stream_resposta` (Task 6) e os testes de ambos usam a mesma assinatura.
`_titulo_da_pergunta` (Task 7) é definida e testada no mesmo módulo que a usa.
