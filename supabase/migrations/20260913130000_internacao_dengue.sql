-- Módulo de internações por dengue no mesmo padrão dos módulos do time de dados:
-- histórico *_usuario (nunca apagado) + consolidado *_estabelecimento via trigger.
-- Acumulativo: cada relato soma internações ao total do estabelecimento.
-- Não substitui internacao_usuario, que é a fotografia de leitos.

create table public.internacao_dengue_usuario (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  id_estabelecimento text not null,
  qtd_internacoes integer not null,
  data_atualizacao timestamptz not null default current_timestamp,
  constraint fk_internacao_dengue_usuario foreign key (user_id) references auth.users(id),
  constraint fk_internacao_dengue_estabelecimento foreign key (id_estabelecimento) references public.estabelecimentos(id),
  constraint chk_internacao_dengue_qtd check (qtd_internacoes > 0)
);

create table public.internacao_dengue_estabelecimento (
  id bigint generated always as identity primary key,
  id_estabelecimento text not null,
  qtd_internacoes integer not null default 0,
  data_atualizacao timestamptz not null default current_timestamp,
  constraint fk_internacao_dengue_est_estabelecimento foreign key (id_estabelecimento) references public.estabelecimentos(id),
  constraint chk_internacao_dengue_est_qtd check (qtd_internacoes >= 0),
  constraint uq_internacao_dengue_estabelecimento unique (id_estabelecimento)
);

create or replace function public.atualizar_internacao_dengue_estabelecimento()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into internacao_dengue_estabelecimento (id_estabelecimento, qtd_internacoes, data_atualizacao)
  values (new.id_estabelecimento, new.qtd_internacoes, new.data_atualizacao)
  on conflict (id_estabelecimento)
  do update set
    qtd_internacoes = internacao_dengue_estabelecimento.qtd_internacoes + excluded.qtd_internacoes,
    data_atualizacao = excluded.data_atualizacao;
  return new;
end;
$$;

create trigger trigger_atualizar_internacao_dengue_estabelecimento
after insert on public.internacao_dengue_usuario
for each row execute function public.atualizar_internacao_dengue_estabelecimento();

-- Rascunhos da Clara passam a aceitar o novo destino.
alter table public.clara_inputs_operacionais
  drop constraint clara_inputs_operacionais_tipo_check,
  add constraint clara_inputs_operacionais_tipo_check
    check (tipo in ('vacinacao', 'medicamento', 'internacao', 'internacao_dengue')),
  drop constraint clara_inputs_operacionais_tabela_destino_check,
  add constraint clara_inputs_operacionais_tabela_destino_check
    check (tabela_destino in ('vacinacao_usuario', 'medicamento_usuario', 'internacao_usuario', 'internacao_dengue_usuario'));

-- Mesmo isolamento das demais tabelas operacionais: só o backend escreve.
alter table public.internacao_dengue_usuario enable row level security;
alter table public.internacao_dengue_estabelecimento enable row level security;
revoke all on table public.internacao_dengue_usuario from anon, authenticated;
revoke all on table public.internacao_dengue_estabelecimento from anon, authenticated;
revoke all on sequence public.internacao_dengue_usuario_id_seq from anon, authenticated;
revoke all on sequence public.internacao_dengue_estabelecimento_id_seq from anon, authenticated;
