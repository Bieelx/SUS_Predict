-- SUS Predict — Armazenamento 1 de docs/09 (Fase 1): quem pode o quê.
-- Rode no SQL Editor do Supabase ANTES do deploy da Fase 1 e ANTES do seed
-- (supabase/seed_usuarios_acesso.sql). Espelho da tabela SQLite de api/core/db.py;
-- o backend escreve aqui via chave secreta (sync best-effort), e lê do SQLite.
--
-- Sem linha = sem acesso (403). Não há perfil padrão implícito.
-- Perfis válidos (validados em código, api/core/permissoes.py): gestor, vigilancia,
-- farmacia, admin, visitante (provisionado no 1º login sem dados). Não usa o enum public.app_role nem a tabela public.user_roles:
-- aquelas pertencem a um painel externo e não se falam com esta (ver docs/09).

create table if not exists public.usuarios_acesso (
  usuario       text primary key,          -- usuario_referencia(): UUID do Auth ou "dev-…"
  perfil        text not null,
  municipios    jsonb not null default '[]'::jsonb,  -- lista de ibge6; ["*"] só para admin (Fase 2)
  ativo         boolean not null default true,
  atribuido_por text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint usuarios_acesso_perfil_chk check (perfil in ('gestor', 'vigilancia', 'farmacia', 'admin', 'visitante'))
);

-- Fecha a chave publicável. O backend usa a chave secreta, que bypassa RLS.
alter table public.usuarios_acesso enable row level security;
revoke all on public.usuarios_acesso from anon, authenticated;
