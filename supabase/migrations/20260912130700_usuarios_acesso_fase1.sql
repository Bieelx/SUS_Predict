-- Pré-requisito da migration 20260912130745_clara_registros_locais.sql.
--
-- Consolida, nesta ordem, o que o SETUP.md pedia em três arquivos soltos:
--   supabase/usuarios_acesso.sql, usuarios_acesso_log.sql, seed_usuarios_acesso.sql
-- Virou migration porque as tabelas `local_*` têm chave estrangeira para
-- public.usuarios_acesso: sem ela, a migration seguinte falha no primeiro
-- CREATE TABLE. O timestamp é anterior ao dela de propósito.
--
-- Idempotente (IF NOT EXISTS + ON CONFLICT), então reaplicar não quebra nada.
-- O produto continua LENDO os perfis do SQLite do servidor (api/core/db.py);
-- esta cópia no Postgres é o espelho de auditoria — que hoje falha em silêncio,
-- porque a tabela não existe — e é a fonte que o serviço de registros locais
-- consulta dentro da própria transação.

create table if not exists public.usuarios_acesso (
  usuario       text primary key,
  perfil        text not null,
  municipios    jsonb not null default '[]'::jsonb,
  ativo         boolean not null default true,
  atribuido_por text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_acesso_perfil_chk
    check (perfil in ('gestor', 'vigilancia', 'farmacia', 'admin', 'visitante'))
);

alter table public.usuarios_acesso enable row level security;
revoke all on public.usuarios_acesso from public, anon, authenticated;

create table if not exists public.usuarios_acesso_log (
  id            bigserial primary key,
  usuario       text not null,
  campo         text not null,
  de            text,
  para          text,
  quem          text not null,
  quando        timestamptz not null default now()
);

alter table public.usuarios_acesso_log enable row level security;
revoke all on public.usuarios_acesso_log from public, anon, authenticated;

create index if not exists usuarios_acesso_log_usuario on public.usuarios_acesso_log(usuario, quando desc);

-- Seed do grupo. UIDs conforme supabase/seed_usuarios_acesso.sql.
--
-- ATENÇÃO — `municipios` não é decorativo: o serviço de registros locais recusa
-- (403 municipio_nao_autorizado) se o ibge6 da unidade não estiver nesta lista.
-- O curinga "*" só é aceito para perfil admin (local_records_service.authorize),
-- por isso as gestoras levam "*" E o ibge6 do piloto: assim o curinga pedido
-- não as bloqueia enquanto a unidade for de São Paulo (355030). Acrescente
-- outros ibge6 à lista quando o piloto abranger mais municípios.
-- O mesmo valor precisa existir no SQLite do Ubuntu.
insert into public.usuarios_acesso (usuario, perfil, municipios, ativo, atribuido_por)
values
  -- gabbriel.araujo@outlook.com
  ('971ffd73-af1a-44f5-b7d9-9d2b2665170b', 'admin',  '["*"]'::jsonb,            true, 'gabbriel.araujo@outlook.com'),
  -- ariadinevamaral@gmail.com
  ('77abe361-faa2-4b6d-a40f-fc770aae789e', 'gestor', '["*","355030"]'::jsonb,   true, 'gabbriel.araujo@outlook.com'),
  -- yasminmiguez@outlook.com
  ('340fab46-455e-4d78-abad-10d9660df272', 'gestor', '["*","355030"]'::jsonb,   true, 'gabbriel.araujo@outlook.com')
on conflict (usuario) do update set
  perfil        = excluded.perfil,
  municipios    = excluded.municipios,
  ativo         = excluded.ativo,
  atribuido_por = excluded.atribuido_por,
  atualizado_em = now();

-- Conferência:
-- select usuario, perfil, municipios, ativo from public.usuarios_acesso order by perfil;
