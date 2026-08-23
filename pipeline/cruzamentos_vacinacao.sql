
-- ------------------------------------------------------------
-- CARD 01 
-- ------------------------------------------------------------
create table if not exists public.vacinacao_dengue_municipios (
  id integer generated always as identity primary key,
  id_agravo text,
  periodo text,
  cod_ibge_municipio text,
  doses_aplicadas integer,
  data_referencia timestamp without time zone
);

create index if not exists idx_vac_municipios_periodo_cod
  on public.vacinacao_dengue_municipios (periodo, cod_ibge_municipio);

-- ------------------------------------------------------------
-- CARD 02 )
-- ------------------------------------------------------------
create table if not exists public.vacinacao_x_incidencia_dengue (
  id integer generated always as identity primary key,
  id_agravo text,
  periodo text,
  cod_ibge_municipio text,
  nome_municipio text,
  casos_atual double precision,
  incidencia_atual double precision,
  doses_aplicadas integer,
  data_referencia timestamp without time zone
);

create index if not exists idx_vac_incidencia_periodo_cod
  on public.vacinacao_x_incidencia_dengue (periodo, cod_ibge_municipio);

-- limpa e recarrega (idempotente - pode rodar de novo sem duplicar)
truncate table public.vacinacao_x_incidencia_dengue;

insert into public.vacinacao_x_incidencia_dengue
  (id_agravo, periodo, cod_ibge_municipio, nome_municipio, casos_atual, incidencia_atual, doses_aplicadas, data_referencia)
select
  coalesce(i.id_agravo, 'Dengue')            as id_agravo,
  i.periodo,
  i.cod_ibge_municipio,
  i.nome_municipio,
  i.casos_atual,
  i.incidencia_atual,
  coalesce(v.doses_aplicadas, 0)             as doses_aplicadas,
  now()                                      as data_referencia
from public.sinan_dengue_municipios_incidencia i
left join public.vacinacao_dengue_municipios v
  on v.cod_ibge_municipio = i.cod_ibge_municipio
 and v.periodo = i.periodo;


-- ------------------------------------------------------------
-- CARD 03
-- ------------------------------------------------------------
create table if not exists public.vacinacao_x_sih_dengue (
  id integer generated always as identity primary key,
  id_agravo text,
  periodo text,
  cod_ibge_municipio text,
  nome_municipio text,
  doses_aplicadas integer,
  internacoes_atual double precision,
  custo_total double precision,
  taxa_mortalidade double precision,
  possui_amostragem_suficiente boolean,
  data_referencia timestamp without time zone
);

create index if not exists idx_vac_sih_periodo_cod
  on public.vacinacao_x_sih_dengue (periodo, cod_ibge_municipio);

truncate table public.vacinacao_x_sih_dengue;

insert into public.vacinacao_x_sih_dengue
  (id_agravo, periodo, cod_ibge_municipio, nome_municipio, doses_aplicadas,
   internacoes_atual, custo_total, taxa_mortalidade, possui_amostragem_suficiente, data_referencia)
select
  'Dengue'                                          as id_agravo,
  v.periodo,
  v.cod_ibge_municipio,
  null::text                                        as nome_municipio,
  v.doses_aplicadas,
  sih_i.internacoes_atual,
  sih_c.custo_total,
  sih_m.taxa_mortalidade,
  (coalesce(sih_i.internacoes_atual, 0) >= 20)       as possui_amostragem_suficiente,
  now()                                              as data_referencia
from public.vacinacao_dengue_municipios v
left join public.sih_dengue_interacoes_periodo sih_i
  on sih_i.periodo = v.periodo and sih_i.cnes = 'TODOS'
left join public.sih_dengue_custo_total_periodo sih_c
  on sih_c.periodo = v.periodo and sih_c.cnes = 'TODOS'
left join public.sih_dengue_taxa_mortalidade_periodo sih_m
  on sih_m.periodo = v.periodo and sih_m.cnes = 'TODOS';


create table if not exists public.vacinacao_dengue_faixa_etaria_doses (
  id integer generated always as identity primary key,
  id_agravo text,
  periodo text,
  cod_ibge_municipio text,
  faixa_etaria text,
  doses_aplicadas integer,
  data_referencia timestamp without time zone
);

create index if not exists idx_vac_faixa_doses_periodo_cod
  on public.vacinacao_dengue_faixa_etaria_doses (periodo, cod_ibge_municipio, faixa_etaria);


-- ------------------------------------------------------------
-- CARD 04 
-- ------------------------------------------------------------
create table if not exists public.vacinacao_dengue_faixa_etaria (
  id integer generated always as identity primary key,
  id_agravo text,
  periodo text,
  cod_ibge_municipio text,
  nome_municipio text,
  faixa_etaria text,
  casos double precision,
  doses_aplicadas integer,
  data_referencia timestamp without time zone
);

create index if not exists idx_vac_faixa_periodo_cod
  on public.vacinacao_dengue_faixa_etaria (periodo, cod_ibge_municipio);

truncate table public.vacinacao_dengue_faixa_etaria;

insert into public.vacinacao_dengue_faixa_etaria
  (id_agravo, periodo, cod_ibge_municipio, nome_municipio, faixa_etaria, casos, doses_aplicadas, data_referencia)
select
  coalesce(f.id_agravo, 'Dengue')            as id_agravo,
  f.periodo,
  f.cod_ibge_municipio,
  f.nome_municipio,
  f.faixa_etaria,
  f.casos,
  coalesce(d.doses_aplicadas, 0)             as doses_aplicadas,
  now()                                      as data_referencia
from public.sinan_dengue_municipios_faixa_etaria f
left join public.vacinacao_dengue_faixa_etaria_doses d
  on d.cod_ibge_municipio = f.cod_ibge_municipio
 and d.periodo = f.periodo


 and (
   case d.faixa_etaria
     when '0-9'   then '0-9 anos'
     when '10-19' then '10-19 anos'
     when '20-39' then '20-39 anos'
     when '40-59' then '40-59 anos'
     when '60-79' then '60-79 anos'
     when '80+'   then '80 anos ou mais'
     else d.faixa_etaria
   end
 ) = f.faixa_etaria;


-- ------------------------------------------------------------
-- Apoio ibge_sp
-- ------------------------------------------------------------
create table if not exists public.ibge_sp (
  id integer generated always as identity primary key,
  cod_ibge_completo text,
  cod_sus text,
  nome_municipio text,
  nome_microrregiao text,
  nome_mesorregiao text,
  data_referencia timestamp without time zone
);

create index if not exists idx_ibge_sp_cod_sus
  on public.ibge_sp (cod_sus);
