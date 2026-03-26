-- SUS Predict / DATASUS -> Supabase (Postgres)
-- Rode no SQL editor do Supabase.

create table if not exists public.datasus_runs (
  run_id text primary key,
  created_at timestamptz not null default now(),

  sistema text not null,
  uf text not null,
  cidade text not null,
  ibge6 text,
  ano_ini int not null,
  ano_fim int not null,
  doenca_cod text,

  modelo text,
  gerado_em timestamptz,

  raw_bucket text,
  raw_object_path text,
  raw_bytes bigint
);

-- Objetos brutos (Storage) associados ao run (ex: por ano, por sistema, etc.)
create table if not exists public.datasus_raw_objects (
  run_id text not null references public.datasus_runs(run_id) on delete cascade,
  ano int,
  bucket text not null,
  object_path text not null,
  bytes bigint,
  created_at timestamptz not null default now(),
  primary key (run_id, object_path)
);

create table if not exists public.datasus_serie (
  run_id text not null references public.datasus_runs(run_id) on delete cascade,
  ano int not null,
  tipo text not null, -- real | previsto
  total bigint,
  lower bigint,
  upper bigint,
  primary key (run_id, ano, tipo)
);

create table if not exists public.datasus_sexo (
  run_id text not null references public.datasus_runs(run_id) on delete cascade,
  sexo text not null,
  pct numeric,
  primary key (run_id, sexo)
);

create table if not exists public.datasus_faixa_etaria (
  run_id text not null references public.datasus_runs(run_id) on delete cascade,
  faixa text not null,
  pct numeric,
  primary key (run_id, faixa)
);

create table if not exists public.datasus_top_causas (
  run_id text not null references public.datasus_runs(run_id) on delete cascade,
  causa text not null,
  pct numeric,
  primary key (run_id, causa)
);

-- Índices úteis
create index if not exists datasus_runs_city_idx on public.datasus_runs (uf, cidade);
create index if not exists datasus_serie_ano_idx on public.datasus_serie (ano);
create index if not exists datasus_raw_objects_run_idx on public.datasus_raw_objects (run_id);
