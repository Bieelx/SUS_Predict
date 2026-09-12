-- Rascunhos conversacionais da Clara para os módulos operacionais entregues
-- pelo time de dados. As tabelas existentes permanecem intactas: a confirmação
-- insere no histórico *_usuario e os triggers existentes atualizam o consolidado.

create table public.clara_inputs_operacionais (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  id_estabelecimento text not null references public.estabelecimentos(id),
  tipo text not null check (tipo in ('vacinacao', 'medicamento', 'internacao')),
  texto_original text not null check (length(btrim(texto_original)) between 1 and 4000),
  payload_proposto jsonb not null check (jsonb_typeof(payload_proposto) = 'object'),
  payload_confirmado jsonb check (payload_confirmado is null or jsonb_typeof(payload_confirmado) = 'object'),
  status text not null default 'rascunho'
    check (status in ('rascunho', 'confirmado', 'rejeitado', 'erro')),
  versao integer not null default 1 check (versao > 0),
  chave_idempotencia text not null check (length(chave_idempotencia) between 8 and 120),
  request_hash text not null check (length(request_hash) = 64),
  operacao_chave text,
  operacao_hash text,
  tabela_destino text check (tabela_destino in ('vacinacao_usuario', 'medicamento_usuario', 'internacao_usuario')),
  registro_destino_id bigint,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  confirmado_em timestamptz,
  confirmado_por uuid references auth.users(id),
  rejeitado_em timestamptz,
  rejeitado_por uuid references auth.users(id),
  motivo_rejeicao text,
  unique (user_id, chave_idempotencia),
  check ((status = 'confirmado') = (confirmado_em is not null)),
  check (status <> 'confirmado' or (confirmado_por is not null and payload_confirmado is not null
    and tabela_destino is not null and registro_destino_id is not null)),
  check (status <> 'rejeitado' or (rejeitado_em is not null and rejeitado_por is not null))
);

create index clara_inputs_operacionais_usuario_status_criado_idx
  on public.clara_inputs_operacionais (user_id, status, criado_em desc);
create index clara_inputs_operacionais_estabelecimento_criado_idx
  on public.clara_inputs_operacionais (id_estabelecimento, criado_em desc);

comment on table public.clara_inputs_operacionais is
  'Rascunhos auditáveis da Clara; não é saldo nem substitui os históricos operacionais.';
comment on column public.clara_inputs_operacionais.payload_proposto is
  'Estrutura extraída do texto, ainda sem efeito operacional.';
comment on column public.clara_inputs_operacionais.payload_confirmado is
  'Estrutura efetivamente inserida na tabela *_usuario após confirmação humana.';

alter table public.clara_inputs_operacionais enable row level security;
revoke all on table public.clara_inputs_operacionais from anon, authenticated;

-- O frontend usa somente a API autenticada. Impede leitura de user_id e escrita
-- direta que contornaria autorização, revisão e idempotência do backend.
alter table public.estabelecimentos enable row level security;
alter table public.vacinacao_usuario enable row level security;
alter table public.vacinacao_estabelecimento enable row level security;
alter table public.medicamento_usuario enable row level security;
alter table public.medicamento_estabelecimento enable row level security;
alter table public.internacao_usuario enable row level security;
alter table public.internacao_estabelecimento enable row level security;

revoke all on table public.estabelecimentos from anon, authenticated;
revoke all on table public.vacinacao_usuario from anon, authenticated;
revoke all on table public.vacinacao_estabelecimento from anon, authenticated;
revoke all on table public.medicamento_usuario from anon, authenticated;
revoke all on table public.medicamento_estabelecimento from anon, authenticated;
revoke all on table public.internacao_usuario from anon, authenticated;
revoke all on table public.internacao_estabelecimento from anon, authenticated;

revoke all on sequence public.vacinacao_usuario_id_seq from anon, authenticated;
revoke all on sequence public.vacinacao_estabelecimento_id_seq from anon, authenticated;
revoke all on sequence public.medicamento_usuario_id_seq from anon, authenticated;
revoke all on sequence public.medicamento_estabelecimento_id_seq from anon, authenticated;
revoke all on sequence public.internacao_usuario_id_seq from anon, authenticated;
revoke all on sequence public.internacao_estabelecimento_id_seq from anon, authenticated;
