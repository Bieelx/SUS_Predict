-- ============================================================
--  SUS Predict — Schema do Supabase
--  Execute no SQL Editor do Supabase (https://supabase.com/dashboard)
--  Projeto: DataSusScrapper / FIAP TCC 2025-2026
-- ============================================================

-- ── 1. datasus_runs  (metadados de cada consulta) ──────────────
CREATE TABLE IF NOT EXISTS public.datasus_runs (
    run_id           TEXT        PRIMARY KEY,
    sistema          TEXT        NOT NULL,          -- SIM | SIH | SINASC | SIA | SINAN | CNES
    uf               TEXT,
    cidade           TEXT,
    ibge6            TEXT,                          -- código IBGE 6 dígitos
    ano_ini          INTEGER,
    ano_fim          INTEGER,
    doenca_cod       TEXT,                          -- só para SINAN (ex: "DENG")
    modelo           TEXT,                          -- "prophet" | "holt" | "ols"
    gerado_em        TIMESTAMPTZ,
    raw_bucket       TEXT,                          -- bucket Storage (se upload feito)
    raw_object_path  TEXT,                          -- caminho do .csv.gz no bucket
    raw_bytes        BIGINT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. datasus_serie  (série temporal real + previsão) ─────────
CREATE TABLE IF NOT EXISTS public.datasus_serie (
    id      BIGSERIAL   PRIMARY KEY,
    run_id  TEXT        NOT NULL REFERENCES public.datasus_runs(run_id) ON DELETE CASCADE,
    ano     INTEGER     NOT NULL,
    tipo    TEXT        NOT NULL,   -- "real" | "previsto"
    total   NUMERIC,
    lower   NUMERIC,               -- limite inferior IC 80% (Prophet)
    upper   NUMERIC,               -- limite superior IC 80% (Prophet)
    UNIQUE (run_id, ano, tipo)
);

-- ── 3. datasus_sexo  (distribuição % por sexo) ─────────────────
CREATE TABLE IF NOT EXISTS public.datasus_sexo (
    id      BIGSERIAL   PRIMARY KEY,
    run_id  TEXT        NOT NULL REFERENCES public.datasus_runs(run_id) ON DELETE CASCADE,
    sexo    TEXT        NOT NULL,
    pct     NUMERIC,
    UNIQUE (run_id, sexo)
);

-- ── 4. datasus_faixa_etaria  (distribuição % por faixa) ────────
CREATE TABLE IF NOT EXISTS public.datasus_faixa_etaria (
    id      BIGSERIAL   PRIMARY KEY,
    run_id  TEXT        NOT NULL REFERENCES public.datasus_runs(run_id) ON DELETE CASCADE,
    faixa   TEXT        NOT NULL,
    pct     NUMERIC,
    UNIQUE (run_id, faixa)
);

-- ── 5. datasus_top_causas  (top causas de óbito/internação) ────
CREATE TABLE IF NOT EXISTS public.datasus_top_causas (
    id      BIGSERIAL   PRIMARY KEY,
    run_id  TEXT        NOT NULL REFERENCES public.datasus_runs(run_id) ON DELETE CASCADE,
    causa   TEXT        NOT NULL,
    pct     NUMERIC,
    UNIQUE (run_id, causa)
);

-- ── 6. datasus_raw_objects  (referências de brutos no Storage) ─
CREATE TABLE IF NOT EXISTS public.datasus_raw_objects (
    id           BIGSERIAL   PRIMARY KEY,
    run_id       TEXT        NOT NULL REFERENCES public.datasus_runs(run_id) ON DELETE CASCADE,
    ano          INTEGER,
    bucket       TEXT        NOT NULL,
    object_path  TEXT        NOT NULL,
    bytes        BIGINT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (run_id, object_path)
);

-- ── Índices úteis ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_runs_sistema   ON public.datasus_runs(sistema);
CREATE INDEX IF NOT EXISTS idx_runs_uf        ON public.datasus_runs(uf);
CREATE INDEX IF NOT EXISTS idx_runs_ibge6     ON public.datasus_runs(ibge6);
CREATE INDEX IF NOT EXISTS idx_runs_created   ON public.datasus_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_serie_run_id   ON public.datasus_serie(run_id);
CREATE INDEX IF NOT EXISTS idx_sexo_run_id    ON public.datasus_sexo(run_id);
CREATE INDEX IF NOT EXISTS idx_faixa_run_id   ON public.datasus_faixa_etaria(run_id);
CREATE INDEX IF NOT EXISTS idx_causas_run_id  ON public.datasus_top_causas(run_id);
CREATE INDEX IF NOT EXISTS idx_raw_run_id     ON public.datasus_raw_objects(run_id);

-- ── Row Level Security (RLS) ────────────────────────────────────
-- Habilita RLS em todas as tabelas (boa prática mesmo usando service role)
ALTER TABLE public.datasus_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasus_serie          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasus_sexo           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasus_faixa_etaria   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasus_top_causas     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasus_raw_objects    ENABLE ROW LEVEL SECURITY;

-- Política: service_role tem acesso total (necessário para o backend)
-- A service role key bypassa RLS por padrão no Supabase — sem necessidade
-- de policies adicionais para o backend. Se quiser expor leitura pública:
-- CREATE POLICY "leitura publica" ON public.datasus_runs FOR SELECT USING (true);
