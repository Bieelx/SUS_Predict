-- Execute no SQL Editor do Supabase antes de rodar nb_visao_geral_analysis.py

create table if not exists public.visao_geral_competencia_referencia (
    id_agravo text,
    nome_agravo text,
    competencia_referencia date,
    competencia_maxima_base date,
    motivo_referencia text,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_kpis_atuais (
    cod_ibge_completo text,
    municipio text,
    uf text,
    competencia_referencia date,
    competencia date,
    id_agravo text,
    casos_notificados bigint,
    casos_notificados_anterior bigint,
    variacao_casos_pct double precision,
    indice_risco_regional double precision,
    indice_risco_anterior double precision,
    variacao_indice_risco_pp double precision,
    municipios_alerta_suprimento bigint,
    internacoes_sih bigint,
    internacoes_sih_anterior bigint,
    variacao_internacoes_pct double precision,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_kpis_periodo (
    cod_ibge_completo text,
    municipio text,
    uf text,
    periodo text,
    competencia_referencia date,
    periodo_inicio date,
    periodo_fim date,
    periodo_inicio_anterior date,
    periodo_fim_anterior date,
    id_agravo text,
    casos_notificados bigint,
    casos_notificados_anterior bigint,
    variacao_casos_pct double precision,
    indice_risco_regional double precision,
    indice_risco_anterior double precision,
    variacao_indice_risco_pp double precision,
    municipios_alerta_suprimento bigint,
    internacoes_sih bigint,
    internacoes_sih_anterior bigint,
    variacao_internacoes_pct double precision,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_kpis_serie (
    cod_ibge_completo text,
    municipio text,
    competencia date,
    id_agravo text,
    casos_notificados bigint,
    indice_risco_regional double precision,
    municipios_alerta_suprimento bigint,
    internacoes_sih bigint,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_risco_agregado (
    cod_ibge_completo text,
    municipio text,
    competencia_referencia date,
    id_agravo text,
    indice_risco_regional double precision,
    faixa_risco text,
    score_epidemiologico double precision,
    score_capacidade double precision,
    score_estoque_critico double precision,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_mapa_mesorregiao (
    nome_mesorregiao text,
    competencia_referencia date,
    id_agravo text,
    total_casos bigint,
    total_internacoes bigint,
    municipios_monitorados bigint,
    municipios_alerta_suprimento bigint,
    indice_risco_regional double precision,
    faixa_risco text,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_ruptura_categoria (
    competencia_referencia date,
    id_agravo text,
    categoria_insumo text,
    itens_monitorados bigint,
    itens_risco_alto bigint,
    itens_risco_moderado bigint,
    municipios_afetados bigint,
    pct_distribuicao double precision,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_evolucao_casos (
    cod_ibge_completo text,
    municipio text,
    competencia date,
    id_agravo text,
    casos_notificados bigint,
    casos_tendencia double precision,
    tipo_serie text,
    data_processamento timestamptz
);

create table if not exists public.visao_geral_alertas_recentes (
    ordem bigint,
    tipo_alerta text,
    severidade text,
    titulo text,
    mensagem text,
    cod_ibge_completo text,
    municipio text,
    competencia_referencia date,
    id_agravo text,
    metrica_valor double precision,
    data_processamento timestamptz
);

create index if not exists idx_visao_geral_kpis_atuais_ibge
    on public.visao_geral_kpis_atuais (cod_ibge_completo);

create index if not exists idx_visao_geral_kpis_periodo
    on public.visao_geral_kpis_periodo (periodo, cod_ibge_completo);

create index if not exists idx_visao_geral_kpis_serie
    on public.visao_geral_kpis_serie (cod_ibge_completo, competencia);

create index if not exists idx_visao_geral_mapa_meso
    on public.visao_geral_mapa_mesorregiao (nome_mesorregiao);

create index if not exists idx_visao_geral_alertas
    on public.visao_geral_alertas_recentes (ordem);
