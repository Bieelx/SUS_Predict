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
VALUES
  ('<UUID_PESSOA_1>', 'admin',      '["351300"]', 1, '<SEU_EMAIL_ADMIN>', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('<UUID_PESSOA_2>', 'gestor',     '["351300"]', 1, '<SEU_EMAIL_ADMIN>', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('<UUID_PESSOA_3>', 'vigilancia', '["351300"]', 1, '<SEU_EMAIL_ADMIN>', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('<UUID_PESSOA_4>', 'farmacia',   '["351300"]', 1, '<SEU_EMAIL_ADMIN>', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  ('<UUID_PESSOA_5>', 'gestor',     '["351300"]', 1, '<SEU_EMAIL_ADMIN>', strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'))
ON CONFLICT(usuario) DO UPDATE SET
  perfil = excluded.perfil,
  municipios = excluded.municipios,
  ativo = excluded.ativo,
  atribuido_por = excluded.atribuido_por,
  atualizado_em = excluded.atualizado_em;
