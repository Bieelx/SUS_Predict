-- Extensão aditiva do hub. Execute depois de susbot_canais.sql.
-- Somente o backend acessa estas tabelas; ownership é verificado por rota.
begin;
create table if not exists public.clara_contextos (
  conversa_id text primary key references public.susbot_conversas(id) on delete cascade,
  contexto jsonb not null
);
create table if not exists public.clara_acoes (
  id text primary key,
  conversa_id text not null references public.susbot_conversas(id) on delete cascade,
  status text not null check (status in ('pendente','executando','concluida','cancelada','expirada','falhou','verificar_resultado')),
  dados jsonb not null,
  criado_em timestamptz not null,
  expira_em timestamptz not null,
  resultado jsonb
);
create index if not exists clara_acoes_conversa on public.clara_acoes(conversa_id);
alter table public.clara_contextos enable row level security;
alter table public.clara_acoes enable row level security;
revoke all on public.clara_contextos, public.clara_acoes from public, anon, authenticated;
grant select, insert, update, delete on public.clara_contextos, public.clara_acoes to service_role;
create table if not exists public.clara_evidencias (
  mensagem_id text primary key references public.susbot_mensagens(id) on delete cascade,
  conversa_id text not null references public.susbot_conversas(id) on delete cascade,
  artefato jsonb not null
);
create index if not exists clara_evidencias_conversa on public.clara_evidencias(conversa_id);
alter table public.clara_evidencias enable row level security;
revoke all on public.clara_evidencias from public, anon, authenticated;
grant select, insert, update, delete on public.clara_evidencias to service_role;
commit;
