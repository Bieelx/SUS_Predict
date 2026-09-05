-- SUS Predict — seed inicial de usuarios_acesso (docs/09, Fase 1).
--
-- ATENÇÃO: a partir do deploy da Fase 1, quem NÃO tiver linha aqui perde acesso à
-- Clara (web e Telegram) e aos endpoints /api/dados/*. Ordem obrigatória:
--   1. supabase/usuarios_acesso.sql  (cria a tabela)
--   2. este arquivo                  (cadastra as 5 pessoas)
--   3. só então reiniciar o serviço no Ubuntu
--
-- Como achar o identificador de cada pessoa: painel do Supabase > Authentication >
-- Users > coluna "UID" (o mesmo valor que usuario_referencia() devolve). No modo dev
-- sem Supabase o id é "dev-<sha256(email)[:16]>" — veja api/core/auth.py::_dev_usuario.
--
-- As 2 linhas de public.user_roles NÃO são migradas: uma é conta de teste e aquela
-- tabela pertence a um painel externo (docs/09).
--
-- Substitua cada <...> antes de rodar. perfil ∈ gestor | vigilancia | farmacia | admin.
-- municipios: lista de ibge6 (6 dígitos). Fase 2 ainda não valida; deixe o município
-- de trabalho de cada um para não ter que voltar aqui depois.

insert into public.usuarios_acesso (usuario, perfil, municipios, ativo, atribuido_por)
values
  ('<UUID_PESSOA_1>', 'admin',      '["351300"]'::jsonb, true, '<SEU_EMAIL_ADMIN>'),
  ('<UUID_PESSOA_2>', 'gestor',     '["351300"]'::jsonb, true, '<SEU_EMAIL_ADMIN>'),
  ('<UUID_PESSOA_3>', 'vigilancia', '["351300"]'::jsonb, true, '<SEU_EMAIL_ADMIN>'),
  ('<UUID_PESSOA_4>', 'farmacia',   '["351300"]'::jsonb, true, '<SEU_EMAIL_ADMIN>'),
  ('<UUID_PESSOA_5>', 'gestor',     '["351300"]'::jsonb, true, '<SEU_EMAIL_ADMIN>')
on conflict (usuario) do update set
  perfil = excluded.perfil,
  municipios = excluded.municipios,
  ativo = excluded.ativo,
  atribuido_por = excluded.atribuido_por,
  atualizado_em = now();

-- Conferência:
-- select usuario, perfil, municipios, ativo from public.usuarios_acesso order by perfil;
