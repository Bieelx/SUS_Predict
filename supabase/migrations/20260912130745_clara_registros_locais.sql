-- Aplicar primeiro em desenvolvimento, após usuarios_acesso.sql.
-- Não é executada pelo startup. Cadastro/estoque existente não é alterado.
CREATE TABLE public.local_unidades_saude (
    id uuid PRIMARY KEY,
    cnes text UNIQUE CHECK (cnes IS NULL OR cnes ~ '^[0-9]{7}$'),
    nome text NOT NULL,
    tipo_unidade text NOT NULL,
    ibge6 text NOT NULL CHECK (ibge6 ~ '^[0-9]{6}$'),
    uf text NOT NULL CHECK (uf = 'SP'),
    ativa boolean NOT NULL DEFAULT true,
    criada_em timestamptz NOT NULL,
    atualizada_em timestamptz NOT NULL
);
CREATE INDEX local_unidades_municipio ON public.local_unidades_saude(ibge6,ativa);
CREATE TABLE public.local_usuarios_unidades (
    usuario text NOT NULL REFERENCES public.usuarios_acesso(usuario),
    unidade_id uuid NOT NULL REFERENCES public.local_unidades_saude(id),
    papel text NOT NULL CHECK (papel IN ('registrador','revisor','gestor_unidade')),
    ativo boolean NOT NULL DEFAULT true,
    atribuido_por text NOT NULL REFERENCES public.usuarios_acesso(usuario),
    criado_em timestamptz NOT NULL,
    atualizado_em timestamptz NOT NULL,
    PRIMARY KEY(usuario,unidade_id)
);
CREATE TABLE public.local_indicadores (
    id uuid PRIMARY KEY,
    codigo text UNIQUE NOT NULL,
    nome text NOT NULL,
    definicao text NOT NULL,
    unidade_medida text NOT NULL,
    periodicidade text NOT NULL CHECK (periodicidade='diaria'),
    agregacao text NOT NULL CHECK (agregacao='soma'),
    aceita_zero boolean NOT NULL,
    valor_minimo numeric NOT NULL DEFAULT 0,
    valor_maximo numeric,
    versao_definicao integer NOT NULL CHECK (versao_definicao>0),
    ativo boolean NOT NULL DEFAULT true,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.local_indicador_dimensoes (
    id uuid PRIMARY KEY,
    indicador_id uuid NOT NULL REFERENCES public.local_indicadores(id),
    codigo text NOT NULL,
    nome text NOT NULL,
    tipo_dado text NOT NULL CHECK (tipo_dado='texto'),
    obrigatoria boolean NOT NULL,
    valores_permitidos jsonb,
    ordem integer NOT NULL DEFAULT 0,
    ativa boolean NOT NULL DEFAULT true,
    UNIQUE(indicador_id,codigo)
);
CREATE TABLE public.local_relatos (
    id uuid PRIMARY KEY,
    unidade_id uuid NOT NULL REFERENCES public.local_unidades_saude(id),
    usuario text NOT NULL REFERENCES public.usuarios_acesso(usuario),
    canal text NOT NULL CHECK (canal IN ('web','telegram','whatsapp')),
    external_event_id text NOT NULL,
    -- Referência lógica: conversas ainda podem viver em outro armazenamento.
    -- Exclusão de conversa não apaga auditoria do relato local.
    conversa_id text,
    tipo_entrada text NOT NULL CHECK (tipo_entrada IN ('texto','audio')),
    texto_original text,
    transcricao text,
    status text NOT NULL CHECK (status IN ('recebido','interpretado','aguardando_confirmacao','confirmado','rejeitado','erro')),
    request_hash text NOT NULL,
    recebido_em timestamptz NOT NULL,
    atualizado_em timestamptz NOT NULL,
    UNIQUE(usuario,canal,external_event_id),
    UNIQUE(id,unidade_id,usuario)
);
CREATE TABLE public.local_registros (
    id uuid PRIMARY KEY,
    relato_id uuid NOT NULL,
    item_relato integer NOT NULL CHECK (item_relato>0),
    unidade_id uuid NOT NULL REFERENCES public.local_unidades_saude(id),
    indicador_id uuid NOT NULL REFERENCES public.local_indicadores(id),
    criado_por text NOT NULL REFERENCES public.usuarios_acesso(usuario),
    criado_em timestamptz NOT NULL,
    UNIQUE(relato_id,item_relato),
    FOREIGN KEY(relato_id,unidade_id,criado_por) REFERENCES public.local_relatos(id,unidade_id,usuario)
);
CREATE INDEX local_registros_unidade ON public.local_registros(unidade_id,criado_em);
CREATE TABLE public.local_registro_versoes (
    id uuid PRIMARY KEY,
    registro_id uuid NOT NULL REFERENCES public.local_registros(id),
    numero_versao integer NOT NULL CHECK (numero_versao>0),
    -- Rascunhos incompletos são persistidos; confirmados exigem estes campos.
    periodo_inicio date,
    periodo_fim date,
    valor numeric CHECK (valor>=0 AND valor=trunc(valor) AND valor<=1000000000),
    dimensoes jsonb NOT NULL CHECK (jsonb_typeof(dimensoes)='object'),
    chave_fechamento text,
    status text NOT NULL CHECK (status IN ('rascunho','confirmado','rejeitado','cancelado')),
    vigente boolean NOT NULL,
    criada_por text NOT NULL REFERENCES public.usuarios_acesso(usuario),
    confirmada_por text REFERENCES public.usuarios_acesso(usuario),
    motivo_alteracao text NOT NULL,
    criada_em timestamptz NOT NULL,
    confirmada_em timestamptz,
    operacao_id text NOT NULL,
    request_hash text NOT NULL,
    pendencias jsonb NOT NULL,
    versao_definicao integer NOT NULL,
    UNIQUE(registro_id,numero_versao),
    UNIQUE(registro_id,criada_por,operacao_id),
    CHECK (periodo_inicio IS NULL OR periodo_fim IS NULL OR periodo_inicio=periodo_fim),
    CHECK (status <> 'confirmado' OR (periodo_inicio IS NOT NULL AND periodo_fim IS NOT NULL AND valor IS NOT NULL
        AND confirmada_por IS NOT NULL AND confirmada_em IS NOT NULL AND chave_fechamento IS NOT NULL AND pendencias='[]'::jsonb)),
    CHECK (status <> 'cancelado' OR length(trim(motivo_alteracao))>0)
);
CREATE UNIQUE INDEX local_versao_vigente ON public.local_registro_versoes(registro_id) WHERE vigente=true;
CREATE UNIQUE INDEX local_fechamento_vigente ON public.local_registro_versoes(chave_fechamento) WHERE vigente=true AND status='confirmado';
CREATE INDEX local_versoes_periodo ON public.local_registro_versoes(status,periodo_inicio,periodo_fim);

-- Seed governado do piloto. Nomes canônicos; outras vacinas exigem atualização do catálogo.
INSERT INTO public.local_indicadores
 (id,codigo,nome,definicao,unidade_medida,periodicidade,agregacao,aceita_zero,versao_definicao) VALUES
 ('00000000-0000-4000-8000-000000000001','doses_vacina_aplicadas','Doses de vacina aplicadas','Doses administradas pela unidade no dia. Não representa saída de estoque.','dose','diaria','soma',true,1),
 ('00000000-0000-4000-8000-000000000002','atendimentos_suspeita_dengue','Atendimentos por suspeita de dengue','Atendimentos, não pessoas únicas ou casos confirmados.','atendimento','diaria','soma',true,1),
 ('00000000-0000-4000-8000-000000000003','encaminhamentos_dengue','Encaminhamentos relacionados à dengue','Encaminhamentos realizados pela unidade, não internações confirmadas ou pessoas únicas.','encaminhamento','diaria','soma',true,1);
INSERT INTO public.local_indicador_dimensoes (id,indicador_id,codigo,nome,tipo_dado,obrigatoria,valores_permitidos,ordem) VALUES
 ('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','vacina','Vacina','texto',true,'["dengue","covid-19","influenza","hepatite b","febre amarela"]',1),
 ('00000000-0000-4000-8000-000000000012','00000000-0000-4000-8000-000000000001','tipo_dose','Tipo de dose','texto',false,'["primeira","segunda","reforço"]',2),
 ('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000002','doenca','Doença','texto',true,'["dengue"]',1),
 ('00000000-0000-4000-8000-000000000014','00000000-0000-4000-8000-000000000003','doenca','Doença','texto',true,'["dengue"]',1),
 ('00000000-0000-4000-8000-000000000015','00000000-0000-4000-8000-000000000003','destino','Destino','texto',false,NULL,2);

-- POSTGRES SECURITY
-- Conteúdo de todas as versões é imutável; somente a vigência pode mudar.
CREATE FUNCTION public.local_proteger_versao() RETURNS trigger LANGUAGE plpgsql
SET search_path = public AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Versões não podem ser apagadas'; END IF;
    IF (to_jsonb(NEW)-'vigente') IS DISTINCT FROM (to_jsonb(OLD)-'vigente') THEN
        RAISE EXCEPTION 'Conteúdo de versão é imutável';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.local_proteger_versao() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER local_versao_imutavel BEFORE UPDATE OR DELETE ON public.local_registro_versoes
FOR EACH ROW EXECUTE FUNCTION public.local_proteger_versao();

ALTER TABLE public.local_unidades_saude ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_usuarios_unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_indicador_dimensoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_relatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_registros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.local_registro_versoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.local_unidades_saude,public.local_usuarios_unidades,public.local_indicadores,
 public.local_indicador_dimensoes,public.local_relatos,public.local_registros,public.local_registro_versoes FROM PUBLIC,anon,authenticated;

CREATE VIEW public.local_registros_vigentes WITH (security_invoker=true) AS
SELECT r.id AS registro_id,r.relato_id,r.unidade_id,r.indicador_id,i.codigo,i.nome,i.unidade_medida,
 u.nome AS unidade_nome,u.cnes,u.ibge6,v.id AS versao_id,v.periodo_inicio,v.periodo_fim,v.valor,v.dimensoes,
 v.status,v.criada_por,v.confirmada_por,v.criada_em,v.confirmada_em,l.canal
FROM public.local_registros r JOIN public.local_registro_versoes v ON v.registro_id=r.id
JOIN public.local_indicadores i ON i.id=r.indicador_id JOIN public.local_unidades_saude u ON u.id=r.unidade_id
JOIN public.local_relatos l ON l.id=r.relato_id WHERE v.vigente=true;
CREATE VIEW public.local_consolidado_diario WITH (security_invoker=true) AS
SELECT unidade_id,codigo,periodo_inicio AS data,dimensoes,sum(valor) AS valor,count(DISTINCT unidade_id) AS quantidade_unidades_cobertas
FROM public.local_registros_vigentes WHERE status='confirmado' GROUP BY unidade_id,codigo,periodo_inicio,dimensoes;
-- Correção pendente é deliberadamente não vigente enquanto há confirmado efetivo.
CREATE VIEW public.local_pendencias_confirmacao WITH (security_invoker=true) AS
SELECT v.*,r.unidade_id,r.relato_id,r.indicador_id FROM public.local_registro_versoes v
JOIN public.local_registros r ON r.id=v.registro_id
WHERE v.status='rascunho' AND v.numero_versao=(SELECT max(x.numero_versao) FROM public.local_registro_versoes x WHERE x.registro_id=r.id);
REVOKE ALL ON public.local_registros_vigentes,public.local_consolidado_diario,public.local_pendencias_confirmacao FROM PUBLIC,anon,authenticated;
