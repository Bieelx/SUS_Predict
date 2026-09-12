-- Seed SQLite (banco primário de leitura da Clara no Ubuntu). Mesmas 5 linhas do
-- supabase/seed_usuarios_acesso.sql, sintaxe SQLite. Rodar ANTES de reiniciar o serviço:
--   sqlite3 "$SQLITE_PATH" < scripts_seed_usuarios_acesso_sqlite.sql
-- (SQLITE_PATH é o mesmo que o backend usa; ver api/core/db.py)
-- A tabela é criada pelo init_db() no startup; se o serviço ainda não subiu com a
-- Fase 1, o CREATE abaixo garante que exista.

CREATE TABLE IF NOT EXISTS usuarios_acesso (
    usuario        TEXT PRIMARY KEY,
    perfil         TEXT NOT NULL,
    municipios     TEXT NOT NULL DEFAULT '[]',
    ativo          INTEGER NOT NULL DEFAULT 1,
    atribuido_por  TEXT,
    criado_em      TEXT NOT NULL,
    atualizado_em  TEXT NOT NULL
);

INSERT INTO usuarios_acesso (usuario, perfil, municipios, ativo, atribuido_por, criado_em, atualizado_em)
-- `municipios` precisa ser idêntico ao que está no Postgres (migration
-- 20260912130700): o serviço de registros locais valida o ibge6 da unidade nas
-- DUAS cópias e recusa com 403 se faltar em qualquer uma. O curinga "*" só é
-- aceito para perfil admin, por isso as gestoras levam "*" e o ibge6 do piloto.
VALUES
  -- gabbriel.araujo@outlook.com
  ('971ffd73-af1a-44f5-b7d9-9d2b2665170b', 'admin',  '["*"]', 1, 'gabbriel.araujo@outlook.com', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- ariadinevamaral@gmail.com
  ('77abe361-faa2-4b6d-a40f-fc770aae789e', 'gestor', '["*","355030"]', 1, 'gabbriel.araujo@outlook.com', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- yasminmiguez@outlook.com
  ('340fab46-455e-4d78-abad-10d9660df272', 'gestor', '["*","355030"]', 1, 'gabbriel.araujo@outlook.com', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  -- Para cadastrar alguém novo: copie a linha abaixo, troque UID e perfil, e acrescente
  -- uma vírgula na linha anterior.
  -- ('00000000-0000-0000-0000-000000000000', 'gestor', '[]', 1, 'gabbriel.araujo@outlook.com', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(usuario) DO UPDATE SET
  perfil = excluded.perfil,
  municipios = excluded.municipios,
  ativo = excluded.ativo,
  atribuido_por = excluded.atribuido_por,
  atualizado_em = excluded.atualizado_em;
