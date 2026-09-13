-- Internações relatadas pela unidade (contagem diária), separadas da fotografia de leitos.
INSERT INTO public.local_indicadores
 (id,codigo,nome,definicao,unidade_medida,periodicidade,agregacao,aceita_zero,versao_definicao) VALUES
 ('00000000-0000-4000-8000-000000000004','internacoes_dengue','Internações relacionadas à dengue','Internações informadas pela unidade no dia, não ocupação de leitos nem casos confirmados.','internacao','diaria','soma',true,1);
INSERT INTO public.local_indicador_dimensoes (id,indicador_id,codigo,nome,tipo_dado,obrigatoria,valores_permitidos,ordem) VALUES
 ('00000000-0000-4000-8000-000000000016','00000000-0000-4000-8000-000000000004','doenca','Doença','texto',true,'["dengue"]',1);
