-- Rollback da migration 20260912130745_clara_registros_locais.sql
--
-- NÃO é executado automaticamente e NÃO é uma migration: rode manualmente, e
-- somente se o piloto for descartado. Apagar estas tabelas apaga os relatos,
-- registros e o histórico de versões confirmadas — auditoria operacional que a
-- migration foi desenhada para preservar. Exporte antes se houver dado real:
--   select * from public.local_registros_vigentes;
--
-- Só remove objetos criados por aquela migration, todos prefixados `local_`.
-- NÃO toca em public.usuarios_acesso (é da Fase 1, tem outros dependentes),
-- nem em qualquer tabela DataSUS, de estoque, CNES, susbot_* ou canal_*.
--
-- Os índices caem junto com as tabelas; as views são removidas antes por
-- dependerem delas.

BEGIN;

DROP VIEW IF EXISTS public.local_pendencias_confirmacao;
DROP VIEW IF EXISTS public.local_consolidado_diario;
DROP VIEW IF EXISTS public.local_registros_vigentes;

DROP TRIGGER IF EXISTS local_versao_imutavel ON public.local_registro_versoes;
DROP FUNCTION IF EXISTS public.local_proteger_versao();

-- Ordem reversa das chaves estrangeiras.
DROP TABLE IF EXISTS public.local_registro_versoes;
DROP TABLE IF EXISTS public.local_registros;
DROP TABLE IF EXISTS public.local_relatos;
DROP TABLE IF EXISTS public.local_indicador_dimensoes;
DROP TABLE IF EXISTS public.local_indicadores;
DROP TABLE IF EXISTS public.local_usuarios_unidades;
DROP TABLE IF EXISTS public.local_unidades_saude;

COMMIT;

-- Conferência (deve devolver 7 linhas com NULL):
-- select to_regclass('public.local_unidades_saude'), to_regclass('public.local_usuarios_unidades'),
--        to_regclass('public.local_indicadores'), to_regclass('public.local_indicador_dimensoes'),
--        to_regclass('public.local_relatos'), to_regclass('public.local_registros'),
--        to_regclass('public.local_registro_versoes');
