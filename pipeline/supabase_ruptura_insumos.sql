-- Execute no SQL Editor do Supabase antes de rodar nb_ruptura_insumos_analysis.py
-- Se as tabelas já existirem, rode apenas os ALTER TABLE necessários.

create table if not exists public.ruptura_insumos_competencia_referencia (
    id_agravo text,
    nome_agravo text,
    competencia_referencia date,
    competencia_maxima_base date,
    motivo_referencia text,
    janela_aquisicao_inicio date,
    janela_aquisicao_fim date,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_kpis_atuais (
    municipios_monitorados bigint,
    total_casos_dengue bigint,
    total_internacoes_sih bigint,
    valor_adquirido_insumos_dengue double precision,
    itens_risco_alto bigint,
    itens_risco_moderado bigint,
    municipios_risco_alto bigint,
    municipios_risco_moderado bigint,
    competencia_referencia date,
    competencia date,
    id_agravo text,
    nome_agravo text,
    janela_aquisicao_inicio date,
    janela_aquisicao_fim date,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_kpis_periodo (
    id_agravo text,
    nome_agravo text,
    periodo text,
    competencia_referencia date,
    periodo_inicio date,
    periodo_fim date,
    periodo_inicio_anterior date,
    periodo_fim_anterior date,
    municipios_monitorados bigint,
    total_casos_dengue bigint,
    total_casos_dengue_anterior bigint,
    total_internacoes_sih bigint,
    valor_adquirido_insumos_dengue double precision,
    valor_adquirido_anterior double precision,
    itens_risco_alto bigint,
    itens_risco_moderado bigint,
    municipios_risco_alto bigint,
    variacao_casos_pct double precision,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_alertas_atuais (
    competencia_referencia date,
    competencia date,
    id_agravo text,
    nome_agravo text,
    janela_aquisicao_inicio date,
    janela_aquisicao_fim date,
    cod_ibge_completo text,
    cod_sus text,
    municipio text,
    insumo_padronizado text,
    categoria_insumo text,
    unidade_fornecimento text,
    faixa_risco_aquisicao text,
    pontos_risco_aquisicao bigint,
    mensagem_analitica text,
    total_casos_dengue bigint,
    total_internacoes_sih bigint,
    incidencia_dengue_100k double precision,
    quantidade_adquirida double precision,
    valor_adquirido double precision,
    total_fornecedores bigint,
    flag_sem_aquisicao_3m bigint,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_resumo_municipal (
    competencia date,
    cod_ibge_completo text,
    cod_sus text,
    municipio text,
    uf text,
    nome_microrregiao text,
    nome_mesorregiao text,
    populacao bigint,
    total_casos_dengue bigint,
    total_internacoes_sih bigint,
    incidencia_dengue_100k double precision,
    valor_adquirido_insumos_dengue double precision,
    insumos_monitorados bigint,
    itens_risco_alto bigint,
    itens_risco_moderado bigint,
    maior_pontuacao_risco bigint,
    faixa_risco_municipio text,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_resumo_periodo (
    id_agravo text,
    nome_agravo text,
    periodo text,
    competencia_referencia date,
    periodo_inicio date,
    periodo_fim date,
    periodo_inicio_anterior date,
    periodo_fim_anterior date,
    cod_ibge_completo text,
    cod_sus text,
    municipio text,
    uf text,
    casos_atual bigint,
    casos_anterior bigint,
    internacoes_atual bigint,
    internacoes_anterior bigint,
    valor_adquirido_atual double precision,
    valor_adquirido_anterior double precision,
    itens_risco_alto_atual bigint,
    itens_risco_alto_anterior bigint,
    itens_risco_moderado_atual bigint,
    variacao_casos_pct double precision,
    variacao_valor_adquirido_pct double precision,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_top_insumos (
    competencia date,
    competencia_referencia date,
    janela_aquisicao_inicio date,
    janela_aquisicao_fim date,
    id_agravo text,
    codigo_br text,
    insumo_padronizado text,
    categoria_insumo text,
    unidade_fornecimento text,
    municipios_monitorados bigint,
    municipios_risco_alto bigint,
    municipios_risco_moderado bigint,
    municipios_sem_aquisicao_3m bigint,
    quantidade_adquirida double precision,
    valor_adquirido double precision,
    preco_unitario_medio double precision,
    maior_pontuacao_risco bigint,
    faixa_risco_aquisicao text,
    data_processamento timestamptz
);

create table if not exists public.ruptura_insumos_serie_mensal (
    competencia date,
    competencia_referencia date,
    id_agravo text,
    cod_ibge_completo text,
    cod_sus text,
    municipio text,
    insumo_padronizado text,
    categoria_insumo text,
    unidade_fornecimento text,
    total_casos_dengue bigint,
    total_internacoes_sih bigint,
    indice_pressao_demanda double precision,
    quantidade_adquirida double precision,
    valor_adquirido double precision,
    pontos_risco_aquisicao bigint,
    faixa_risco_aquisicao text,
    data_processamento timestamptz
);

create index if not exists idx_ruptura_competencia_ref
    on public.ruptura_insumos_competencia_referencia (competencia_referencia);

create index if not exists idx_ruptura_kpis_periodo
    on public.ruptura_insumos_kpis_periodo (periodo, competencia_referencia);

create index if not exists idx_ruptura_resumo_periodo
    on public.ruptura_insumos_resumo_periodo (periodo, cod_ibge_completo);

create index if not exists idx_ruptura_alertas_ref
    on public.ruptura_insumos_alertas_atuais (competencia_referencia, faixa_risco_aquisicao);

create index if not exists idx_ruptura_serie_filtro
    on public.ruptura_insumos_serie_mensal (cod_ibge_completo, insumo_padronizado, competencia);
