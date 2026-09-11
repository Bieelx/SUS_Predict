-- SUS Predict — tabelas operacionais da Clara e dos canais no Supabase.
-- Com SUPABASE_URL + chave secreta configurados, conversas, mensagens, memória
-- pessoal e canais da Clara vivem SÓ aqui (api/core/db.py::_clara_remoto) —
-- nada fica no SQLite do servidor. Rode no SQL Editor do Supabase; é idempotente.
--
-- Colunas fora da chave são NULLABLE de propósito: o backend faz PATCH parcial
-- (ex.: só {status, cancelado_em} em canal_pareamentos).

create table if not exists public.estoque (
  ibge6             text not null,
  item              text not null,
  quantidade_atual  double precision,
  consumo_medio_dia double precision,
  atualizado_em     timestamptz,
  primary key (ibge6, item)
);

create table if not exists public.alertas (
  id               text primary key,
  ibge6            text,
  tipo             text,
  item_ou_condicao text,
  severidade       text,
  status           text,
  descricao        text,
  criado_em        timestamptz
);

create table if not exists public.etps (
  id            text primary key,
  ibge6         text,
  item          text,
  alerta_id     text,
  justificativa text,
  origem        text,
  criado_em     timestamptz
);

create table if not exists public.susbot_conversas (
  id        text primary key,
  usuario   text,
  titulo    text,
  criada_em timestamptz
);

create table if not exists public.susbot_mensagens (
  id              text primary key,
  conversa_id     text references public.susbot_conversas(id) on delete cascade,
  tela_origem     text,
  pergunta        text,
  resposta        text,
  referencia_rota text,
  criado_em       timestamptz
);

create table if not exists public.canal_pareamentos (
  id                text primary key,
  usuario           text,
  provedor          text,
  token_hash        text unique,
  ibge6             text,
  status            text,
  external_user_id  text,
  external_chat_id  text,
  external_username text,
  criado_em         timestamptz,
  expira_em         timestamptz,
  reivindicado_em   timestamptz,
  confirmado_em     timestamptz,
  cancelado_em      timestamptz
);

create table if not exists public.canal_conexoes (
  id                 text primary key,
  usuario            text,
  provedor           text,
  external_user_id   text,
  external_chat_id   text,
  external_username  text,
  ibge6              text,
  conversa_atual_id  text references public.susbot_conversas(id) on delete set null,
  status             text,
  conectado_em       timestamptz,
  ultimo_uso_em      timestamptz,
  revogado_em        timestamptz,
  unique (usuario, provedor),
  unique (provedor, external_user_id)
);

-- Dedupe de webhook (Telegram/WhatsApp): o insert que não conflita é o que processa.
create table if not exists public.canal_eventos (
  provedor      text not null,
  external_id   text not null,
  processado_em timestamptz not null default now(),
  primary key (provedor, external_id)
);

create table if not exists public.susbot_memorias (
  id                text primary key,
  owner_ref         text,     -- HMAC do usuário; o id real nunca chega aqui
  fact_ref          text,
  payload_encrypted text,     -- Fernet; a chave fica só no servidor (SUSBOT_MEMORY_KEY)
  criado_em         timestamptz,
  atualizado_em     timestamptz,
  unique (owner_ref, fact_ref)
);

-- Upsert de memória manda só owner_ref/fact_ref/payload/atualizado_em: id e
-- criado_em nascem aqui no insert e não são sobrescritos no update.
alter table public.susbot_memorias alter column id set default gen_random_uuid()::text;
alter table public.susbot_memorias alter column criado_em set default now();

create index if not exists idx_alertas_ibge_status on public.alertas (ibge6, status);
create index if not exists idx_etps_ibge on public.etps (ibge6, criado_em desc);
create index if not exists idx_conversas_usuario on public.susbot_conversas (usuario, criada_em desc);
create index if not exists idx_mensagens_conversa on public.susbot_mensagens (conversa_id, criado_em desc);
create index if not exists idx_pareamentos_usuario on public.canal_pareamentos (usuario, provedor, criado_em desc);
create index if not exists idx_conexoes_usuario on public.canal_conexoes (usuario, status);
create index if not exists idx_memorias_owner on public.susbot_memorias (owner_ref, atualizado_em desc);

-- Histórico: canal de origem, última atividade e total de mensagens por conversa.
create or replace view public.susbot_conversas_resumo with (security_invoker = true) as
select
  c.id, c.usuario, c.titulo, c.criada_em,
  coalesce((
    select case when m.tela_origem in ('telegram', 'whatsapp') then m.tela_origem else 'app' end
    from public.susbot_mensagens m
    where m.conversa_id = c.id
    order by m.criado_em, m.id
    limit 1
  ), 'app') as canal,
  coalesce((select max(m.criado_em) from public.susbot_mensagens m where m.conversa_id = c.id),
           c.criada_em) as atualizada_em,
  (select count(*) from public.susbot_mensagens m where m.conversa_id = c.id)::int as total_mensagens
from public.susbot_conversas c;

-- Confirmação de pareamento numa transação só (lê, resolve conflito, grava conexão).
create or replace function public.clara_confirmar_pareamento(p_id text, p_usuario text)
returns setof public.canal_conexoes
language plpgsql
security invoker
set search_path = public
as $$
declare
  p public.canal_pareamentos;
  c public.canal_conexoes;
  agora timestamptz := now();
begin
  select * into p from canal_pareamentos
  where id = p_id and usuario = p_usuario and status = 'reivindicado' and expira_em > agora
  for update;
  if not found then
    return;
  end if;

  select * into c from canal_conexoes
  where provedor = p.provedor and external_user_id = p.external_user_id and usuario <> p_usuario;
  if found then
    if c.status = 'ativo' then
      raise exception 'conta_externa_em_uso';
    end if;
    delete from canal_conexoes where id = c.id;
  end if;

  insert into canal_conexoes
    (id, usuario, provedor, external_user_id, external_chat_id, external_username, ibge6, status, conectado_em)
  values
    (gen_random_uuid()::text, p_usuario, p.provedor, p.external_user_id, p.external_chat_id,
     p.external_username, p.ibge6, 'ativo', agora)
  on conflict (usuario, provedor) do update set
    external_user_id  = excluded.external_user_id,
    external_chat_id  = excluded.external_chat_id,
    external_username = excluded.external_username,
    ibge6             = excluded.ibge6,
    conversa_atual_id = null,
    status            = 'ativo',
    conectado_em      = excluded.conectado_em,
    ultimo_uso_em     = null,
    revogado_em       = null;

  update canal_pareamentos set status = 'confirmado', confirmado_em = agora where id = p_id;

  return query select * from canal_conexoes where usuario = p_usuario and provedor = p.provedor;
end $$;

-- Fecha tudo para as chaves publicáveis (anon/authenticated). Só o backend, com a
-- chave secreta (service_role, bypassa RLS), lê e escreve. Sem policy = sem acesso.
do $$
declare t text;
begin
  foreach t in array array['estoque','alertas','etps','susbot_conversas','susbot_mensagens',
                           'canal_pareamentos','canal_conexoes','canal_eventos','susbot_memorias']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

revoke all on public.susbot_conversas_resumo from public, anon, authenticated;
grant select on public.susbot_conversas_resumo to service_role;

revoke all on function public.clara_confirmar_pareamento(text, text) from public, anon, authenticated;
grant execute on function public.clara_confirmar_pareamento(text, text) to service_role;

notify pgrst, 'reload schema';
