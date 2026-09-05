-- SUS Predict — docs/09 Fase 4 (antecipada em 05/09/2026): trilha append-only das
-- alterações administrativas em usuarios_acesso. Rode no SQL Editor do Supabase
-- antes do deploy da tela de administração. O backend grava aqui via chave
-- secreta (sync best-effort); a leitura é do SQLite.
--
-- Só INSERT. Nunca UPDATE/DELETE por código.

create table if not exists public.usuarios_acesso_log (
  id            text primary key,
  usuario       text not null,
  acao          text not null,           -- atribuir_perfil | ativar | desativar
  perfil_antes  text,
  perfil_depois text,
  ativo_antes   boolean,
  ativo_depois  boolean,
  por           text not null,           -- e-mail do admin que fez a ação
  quando        timestamptz not null default now()
);

create index if not exists idx_usuarios_acesso_log_usuario on public.usuarios_acesso_log (usuario, quando desc);

-- RLS ligada e NENHUMA policy: sem policy, RLS nega tudo para anon/authenticated
-- (a chave publicável do frontend não lê nem uma linha). A chave secreta / service_role
-- bypassa RLS por definição, então é o único caminho de leitura e escrita — que é o
-- backend. O REVOKE é cinto e suspensório: mesmo que alguém crie uma policy permissiva
-- por engano, sem GRANT o PostgREST continua devolvendo 42501.
alter table public.usuarios_acesso_log enable row level security;
revoke all on public.usuarios_acesso_log from public, anon, authenticated;

-- Conferência (com a chave publicável deve dar 401/42501 ou 404, nunca 200 com linhas):
-- curl -H "apikey: $SUPABASE_PUBLISHABLE_KEY" "$SUPABASE_URL/rest/v1/usuarios_acesso_log?select=*&limit=1"
