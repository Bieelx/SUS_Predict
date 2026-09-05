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
-- perfil ∈ gestor | vigilancia | farmacia | admin. municipios: lista de ibge6; a Fase 2
-- ainda não valida nada, por isso fica vazia aqui.

insert into public.usuarios_acesso (usuario, perfil, municipios, ativo, atribuido_por)
values
  -- gabbriel.araujo@outlook.com
  ('971ffd73-af1a-44f5-b7d9-9d2b2665170b', 'admin',  '[]'::jsonb, true, 'gabbriel.araujo@outlook.com'),
  -- ariadinevamaral@gmail.com
  ('77abe361-faa2-4b6d-a40f-fc770aae789e', 'gestor', '[]'::jsonb, true, 'gabbriel.araujo@outlook.com'),
  -- yasminmiguez@outlook.com
  ('340fab46-455e-4d78-abad-10d9660df272', 'gestor', '[]'::jsonb, true, 'gabbriel.araujo@outlook.com')
  -- Para cadastrar alguém novo: copie a linha abaixo, troque UID (Authentication > Users)
  -- e perfil (gestor | vigilancia | farmacia | admin), e acrescente uma vírgula na linha anterior.
  -- ('00000000-0000-0000-0000-000000000000', 'gestor', '[]'::jsonb, true, 'gabbriel.araujo@outlook.com')
on conflict (usuario) do update set
  perfil = excluded.perfil,
  municipios = excluded.municipios,
  ativo = excluded.ativo,
  atribuido_por = excluded.atribuido_por,
  atualizado_em = now();

-- Conferência:
-- select usuario, perfil, municipios, ativo from public.usuarios_acesso order by perfil;
