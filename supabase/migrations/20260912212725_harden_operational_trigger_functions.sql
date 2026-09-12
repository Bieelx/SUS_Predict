-- Endurece somente a execução das funções existentes; não altera
-- tabelas, triggers, linhas ou a lógica de consolidação entregue pelo time.
alter function public.atualizar_vacinacao_estabelecimento()
  set search_path = public, pg_temp;
alter function public.atualizar_medicamento_estabelecimento()
  set search_path = public, pg_temp;
alter function public.atualizar_internacao_estabelecimento()
  set search_path = public, pg_temp;

-- O IBGE também é consultado exclusivamente pelo backend. RLS já estava
-- habilitada, mas os grants padrão ainda deixavam o objeto descobrível.
revoke all on table public.ibge_sp from anon, authenticated;
