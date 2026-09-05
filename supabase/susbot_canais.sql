-- SUS Predict — tabelas operacionais da Clara e dos canais no Supabase.
-- Achado lateral de docs/09: api/core/db.py::_sync_row já faz upsert nestas tabelas,
-- mas nenhum SQL versionado as criava — o sync falhava em silêncio.
-- Rode no SQL Editor do Supabase. Espelha o schema SQLite de api/core/db.py.
--
-- Colunas fora da chave são NULLABLE de propósito: o sync manda linhas parciais
-- (ex.: só {id, status, cancelado_em} em canal_pareamentos) e o upsert do
-- PostgREST monta o INSERT antes de resolver o conflito — NOT NULL quebraria.

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

-- canal_eventos é dedupe de webhook; fica só no SQLite (não é sincronizada).

create table if not exists public.susbot_memorias (
  id                text primary key,
  owner_ref         text,
  fact_ref          text,
  payload_encrypted text,   -- Fernet; a chave fica no servidor
  criado_em         timestamptz,
  atualizado_em     timestamptz,
  unique (owner_ref, fact_ref)
);

create index if not exists idx_alertas_ibge_status on public.alertas (ibge6, status);
create index if not exists idx_etps_ibge on public.etps (ibge6, criado_em desc);
create index if not exists idx_conversas_usuario on public.susbot_conversas (usuario, criada_em desc);
create index if not exists idx_mensagens_conversa on public.susbot_mensagens (conversa_id, criado_em desc);
create index if not exists idx_memorias_owner on public.susbot_memorias (owner_ref, atualizado_em desc);

-- Fecha a chave publicável em todas. O backend usa a chave secreta (bypassa RLS).
do $$
declare t text;
begin
  foreach t in array array['estoque','alertas','etps','susbot_conversas','susbot_mensagens',
                           'canal_pareamentos','canal_conexoes','susbot_memorias']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
