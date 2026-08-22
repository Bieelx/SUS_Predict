# Databricks notebook source
# MAGIC %md
# MAGIC # Confirgurações Supabase

# COMMAND ----------

# MAGIC %pip install --upgrade typing_extensions supabase
# MAGIC dbutils.library.restartPython()

# COMMAND ----------

import typing_extensions
from supabase import create_client

print("Importação concluída com sucesso!")

# COMMAND ----------

# Certifique-se de que suas variáveis estão definidas
SUPABASE_URL = ""
SUPABASE_KEY = ""

# Inicialize o cliente
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Teste básico para garantir que a conexão está ativa
print("Cliente Supabase criado com sucesso:", supabase)

# COMMAND ----------

# config
import pandas as pd
import numpy as np


from pyspark.sql.functions import (
    col, count, sum as sql_sum, avg,
    min as sql_min, max as sql_max,
    year, month, quarter, dayofweek,
    datediff, when, desc, asc, round
)

from pyspark.sql.window import Window

from supabase import create_client, Client

# COMMAND ----------

pip install supabase python-dotenv

# COMMAND ----------

from decimal import Decimal
import pandas as pd
import numpy as np
import math
import json

def enviar_para_supabase(
    tabela_spark,
    nome_tabela_supabase,
    truncate=True
):

    try:

        df_pandas = tabela_spark.toPandas()

        # converter datetime/date para string
        for col in df_pandas.columns:

            if pd.api.types.is_datetime64_any_dtype(df_pandas[col]):
                df_pandas[col] = df_pandas[col].astype(str)

            df_pandas[col] = df_pandas[col].apply(
                lambda x: str(x)
                if hasattr(x, "isoformat")
                else x
            )

        # decimal -> float
        for col in df_pandas.columns:
            df_pandas[col] = df_pandas[col].apply(
                lambda x: float(x)
                if isinstance(x, Decimal)
                else x
            )

        # nomes das colunas em lowercase
        df_pandas.columns = [
            col.lower()
            for col in df_pandas.columns
        ]

        # dataframe -> lista de dicts
        dados = df_pandas.to_dict("records")

        # limpeza final de qualquer valor inválido
        for linha in dados:

            for chave, valor in list(linha.items()):

                if isinstance(valor, np.integer):
                    linha[chave] = int(valor)

                elif isinstance(valor, np.floating):

                    if np.isnan(valor) or np.isinf(valor):
                        linha[chave] = None
                    else:
                        linha[chave] = float(valor)

                elif isinstance(valor, float):

                    if math.isnan(valor) or math.isinf(valor):
                        linha[chave] = None

        # validação JSON
        json.dumps(dados, allow_nan=False)

        print(f"\nenviando {nome_tabela_supabase}")
        print(f"total {len(dados):,.0f} registros")

        if truncate:

            try:

                primeira_coluna = df_pandas.columns[0]

                supabase.table(nome_tabela_supabase) \
                    .delete() \
                    .not_.is_(primeira_coluna, "null") \
                    .execute()

                print(f"tabela {nome_tabela_supabase} limpa")

            except Exception as e:
                print(f"não foi possivel limpar: {e}")

        chunk_size = 1000
        total_inserido = 0

        for i in range(0, len(dados), chunk_size):

            chunk = dados[i:i + chunk_size]

            supabase.table(nome_tabela_supabase) \
                .insert(chunk) \
                .execute()

            total_inserido += len(chunk)

            print(
                f"inseridos {len(chunk):,.0f} registros "
                f"({total_inserido:,.0f}/{len(dados):,.0f})"
            )

        print(f"{nome_tabela_supabase} enviado com sucesso\n")

        return True

    except Exception as e:

        print(
            f"erro ao enviar {nome_tabela_supabase}: {e}\n"
        )

        return False

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD01 - Internações no Período

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_interacoes_periodo AS
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC SELECT
# MAGIC     DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     LAST_DAY(dt_ref) AS dt_fim,
# MAGIC     ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-3)) AS dt_fim_anterior
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-6))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-23),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-12))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-71),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-36))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-119),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-60))
# MAGIC FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     COUNT(*) AS internacoes_atual,
# MAGIC
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                           AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC comparativo AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     COUNT(*) AS internacoes_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio_anterior
# MAGIC                           AND p.dt_fim_anterior
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     b.periodo,
# MAGIC
# MAGIC     b.cnes,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN b.cnes = 'TODOS' THEN 'Todos os hospitais'
# MAGIC         ELSE h.nome_hospital
# MAGIC     END AS nome_hospital,
# MAGIC
# MAGIC     h.razao_social,
# MAGIC
# MAGIC     b.dt_inicio AS periodo_inicio,
# MAGIC
# MAGIC     b.dt_fim AS periodo_fim,
# MAGIC
# MAGIC     b.internacoes_atual,
# MAGIC
# MAGIC     c.internacoes_anterior,
# MAGIC
# MAGIC     ROUND(
# MAGIC
# MAGIC         CASE
# MAGIC
# MAGIC             WHEN c.internacoes_anterior = 0 THEN NULL
# MAGIC
# MAGIC             ELSE (
# MAGIC                 (b.internacoes_atual - c.internacoes_anterior)
# MAGIC                 / c.internacoes_anterior
# MAGIC             ) * 100
# MAGIC
# MAGIC         END
# MAGIC
# MAGIC     ,2) AS variacao_percentual,
# MAGIC
# MAGIC     (c.internacoes_anterior IS NOT NULL AND c.internacoes_anterior > 0)
# MAGIC         AS possui_base_comparacao,
# MAGIC
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC LEFT JOIN comparativo c
# MAGIC     ON b.periodo = c.periodo
# MAGIC    AND b.cnes = c.cnes
# MAGIC
# MAGIC LEFT JOIN fiap.silver.DIM_HOSPITAIS h
# MAGIC     ON b.cnes = h.cnes
# MAGIC
# MAGIC ORDER BY
# MAGIC     periodo,
# MAGIC     cnes;

# COMMAND ----------

# Lendo a tabela processada do Databricks
df_interacoes_periodo = spark.table("fiap.silver.sih_dengue_interacoes_periodo")

# Enviando para o Supabase
enviar_para_supabase(df_interacoes_periodo, "sih_dengue_interacoes_periodo")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Card 02 - Permanência média

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_permanencia_media_periodo AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC     FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC         LAST_DAY(dt_ref) AS dt_fim,
# MAGIC         ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC         LAST_DAY(ADD_MONTHS(dt_ref,-3)) AS dt_fim_anterior
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         ADD_MONTHS(dt_ref,-5),
# MAGIC         LAST_DAY(dt_ref),
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         LAST_DAY(ADD_MONTHS(dt_ref,-6))
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         LAST_DAY(dt_ref),
# MAGIC         ADD_MONTHS(dt_ref,-23),
# MAGIC         LAST_DAY(ADD_MONTHS(dt_ref,-12))
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-35),
# MAGIC         LAST_DAY(dt_ref),
# MAGIC         ADD_MONTHS(dt_ref,-71),
# MAGIC         LAST_DAY(ADD_MONTHS(dt_ref,-36))
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-59),
# MAGIC         LAST_DAY(dt_ref),
# MAGIC         ADD_MONTHS(dt_ref,-119),
# MAGIC         LAST_DAY(ADD_MONTHS(dt_ref,-60))
# MAGIC     FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         CASE
# MAGIC             WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC             ELSE s.CNES
# MAGIC         END AS cnes,
# MAGIC
# MAGIC         ROUND(AVG(s.DIAS_PERM),1) AS permanencia_media_atual,
# MAGIC
# MAGIC         p.dt_inicio,
# MAGIC         p.dt_fim,
# MAGIC         p.dt_inicio_anterior,
# MAGIC         p.dt_fim_anterior
# MAGIC
# MAGIC     FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                               AND p.dt_fim
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC         p.dt_inicio,
# MAGIC         p.dt_fim,
# MAGIC         p.dt_inicio_anterior,
# MAGIC         p.dt_fim_anterior,
# MAGIC         ROLLUP(s.CNES)
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC comparativo AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         CASE
# MAGIC             WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC             ELSE s.CNES
# MAGIC         END AS cnes,
# MAGIC
# MAGIC         ROUND(AVG(s.DIAS_PERM),1) AS permanencia_media_anterior
# MAGIC
# MAGIC     FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio_anterior
# MAGIC                               AND p.dt_fim_anterior
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC         ROLLUP(s.CNES)
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     b.periodo,
# MAGIC
# MAGIC     b.cnes,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN b.cnes = 'TODOS'
# MAGIC             THEN 'Todos os hospitais'
# MAGIC         ELSE h.nome_hospital
# MAGIC     END AS nome_hospital,
# MAGIC
# MAGIC     h.razao_social,
# MAGIC
# MAGIC     b.dt_inicio AS periodo_inicio,
# MAGIC
# MAGIC     b.dt_fim AS periodo_fim,
# MAGIC
# MAGIC     b.permanencia_media_atual,
# MAGIC
# MAGIC     c.permanencia_media_anterior,
# MAGIC
# MAGIC     ROUND(
# MAGIC
# MAGIC         CASE
# MAGIC
# MAGIC             WHEN c.permanencia_media_anterior IS NULL THEN NULL
# MAGIC
# MAGIC             ELSE
# MAGIC                 b.permanencia_media_atual -
# MAGIC                 c.permanencia_media_anterior
# MAGIC
# MAGIC         END
# MAGIC
# MAGIC     ,1) AS diferenca_dias,
# MAGIC
# MAGIC     (
# MAGIC         c.permanencia_media_anterior IS NOT NULL
# MAGIC     ) AS possui_base_comparacao,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC LEFT JOIN comparativo c
# MAGIC     ON b.periodo = c.periodo
# MAGIC    AND b.cnes = c.cnes
# MAGIC
# MAGIC LEFT JOIN fiap.silver.DIM_HOSPITAIS h
# MAGIC     ON b.cnes = h.cnes
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     periodo,
# MAGIC     cnes;

# COMMAND ----------

# Lendo a tabela do Databricks
df_permanencia = spark.table("fiap.silver.sih_dengue_permanencia_media_periodo")

# Enviando para o Supabase
enviar_para_supabase(df_permanencia, "sih_dengue_permanencia_media_periodo")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 03 - Taxa de Mortalidade Hospitalar

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_taxa_mortalidade_periodo AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC SELECT
# MAGIC     DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     LAST_DAY(dt_ref) AS dt_fim,
# MAGIC     ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-3)) AS dt_fim_anterior
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-6))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-23),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-12))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-71),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-36))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-119),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-60))
# MAGIC FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     COUNT(*) AS internacoes,
# MAGIC
# MAGIC     SUM(CASE WHEN s.MORTE = 1 THEN 1 ELSE 0 END) AS obitos,
# MAGIC
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                           AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC comparativo AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     COUNT(*) AS internacoes_anterior,
# MAGIC
# MAGIC     SUM(CASE WHEN s.MORTE = 1 THEN 1 ELSE 0 END) AS obitos_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio_anterior
# MAGIC                           AND p.dt_fim_anterior
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     b.periodo,
# MAGIC
# MAGIC     b.cnes,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN b.cnes = 'TODOS'
# MAGIC             THEN 'Todos os hospitais'
# MAGIC         ELSE h.nome_hospital
# MAGIC     END AS nome_hospital,
# MAGIC
# MAGIC     h.razao_social,
# MAGIC
# MAGIC     b.dt_inicio AS periodo_inicio,
# MAGIC
# MAGIC     b.dt_fim AS periodo_fim,
# MAGIC
# MAGIC     b.obitos,
# MAGIC
# MAGIC     b.internacoes,
# MAGIC
# MAGIC     ROUND(
# MAGIC         try_divide(
# MAGIC             b.obitos * 100.0,
# MAGIC             b.internacoes
# MAGIC         ),
# MAGIC     2) AS taxa_mortalidade,
# MAGIC
# MAGIC     ROUND(
# MAGIC         try_divide(
# MAGIC             c.obitos_anterior * 100.0,
# MAGIC             c.internacoes_anterior
# MAGIC         ),
# MAGIC     2) AS taxa_mortalidade_anterior,
# MAGIC
# MAGIC     ROUND(
# MAGIC
# MAGIC         try_divide(
# MAGIC
# MAGIC             (
# MAGIC                 try_divide(b.obitos * 100.0, b.internacoes)
# MAGIC                 -
# MAGIC                 try_divide(c.obitos_anterior * 100.0, c.internacoes_anterior)
# MAGIC             ),
# MAGIC
# MAGIC             try_divide(c.obitos_anterior * 100.0, c.internacoes_anterior)
# MAGIC
# MAGIC         ) * 100
# MAGIC
# MAGIC     ,2) AS variacao_percentual,
# MAGIC
# MAGIC     (
# MAGIC         c.internacoes_anterior IS NOT NULL
# MAGIC         AND c.internacoes_anterior > 0
# MAGIC     ) AS possui_base_comparacao,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC LEFT JOIN comparativo c
# MAGIC     ON b.periodo = c.periodo
# MAGIC    AND b.cnes = c.cnes
# MAGIC
# MAGIC LEFT JOIN fiap.silver.DIM_HOSPITAIS h
# MAGIC     ON b.cnes = h.cnes
# MAGIC
# MAGIC ORDER BY
# MAGIC     periodo,
# MAGIC     cnes;

# COMMAND ----------

# Lendo a tabela processada do Databricks
df_taxa_mortalidade = spark.table("fiap.silver.sih_dengue_taxa_mortalidade_periodo")

# Enviando para o Supabase
enviar_para_supabase(df_taxa_mortalidade, "sih_dengue_taxa_mortalidade_periodo")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 04 - Custo Total SIH

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_custo_total_periodo AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC SELECT
# MAGIC     DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     LAST_DAY(dt_ref) AS dt_fim,
# MAGIC     ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-3)) AS dt_fim_anterior
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-6))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-23),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-12))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-71),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-36))
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     LAST_DAY(dt_ref),
# MAGIC     ADD_MONTHS(dt_ref,-119),
# MAGIC     LAST_DAY(ADD_MONTHS(dt_ref,-60))
# MAGIC FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     SUM(s.VAL_TOT) AS custo_total,
# MAGIC
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                           AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     p.dt_inicio,
# MAGIC     p.dt_fim,
# MAGIC     p.dt_inicio_anterior,
# MAGIC     p.dt_fim_anterior,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC comparativo AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN GROUPING(s.CNES) = 1 THEN 'TODOS'
# MAGIC         ELSE s.CNES
# MAGIC     END AS cnes,
# MAGIC
# MAGIC     SUM(s.VAL_TOT) AS custo_total_anterior
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio_anterior
# MAGIC                           AND p.dt_fim_anterior
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     ROLLUP(s.CNES)
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     b.periodo,
# MAGIC
# MAGIC     b.cnes,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN b.cnes = 'TODOS'
# MAGIC             THEN 'Todos os hospitais'
# MAGIC         ELSE h.nome_hospital
# MAGIC     END AS nome_hospital,
# MAGIC
# MAGIC     h.razao_social,
# MAGIC
# MAGIC     b.dt_inicio AS periodo_inicio,
# MAGIC
# MAGIC     b.dt_fim AS periodo_fim,
# MAGIC
# MAGIC     ROUND(b.custo_total,2) AS custo_total,
# MAGIC
# MAGIC     ROUND(c.custo_total_anterior,2) AS custo_total_anterior,
# MAGIC
# MAGIC     ROUND(
# MAGIC
# MAGIC         try_divide(
# MAGIC             (b.custo_total - c.custo_total_anterior),
# MAGIC             c.custo_total_anterior
# MAGIC         ) * 100
# MAGIC
# MAGIC     ,2) AS variacao_percentual,
# MAGIC
# MAGIC     (
# MAGIC         c.custo_total_anterior IS NOT NULL
# MAGIC         AND c.custo_total_anterior > 0
# MAGIC     ) AS possui_base_comparacao,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC LEFT JOIN comparativo c
# MAGIC
# MAGIC ON b.periodo = c.periodo
# MAGIC AND b.cnes = c.cnes
# MAGIC
# MAGIC LEFT JOIN fiap.silver.DIM_HOSPITAIS h
# MAGIC
# MAGIC ON b.cnes = h.cnes
# MAGIC
# MAGIC ORDER BY
# MAGIC     periodo,
# MAGIC     cnes;

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 05 - Internações x Custo Mensal

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_internacoes_custo_mensal AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC     FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC         LAST_DAY(dt_ref) AS dt_fim
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         ADD_MONTHS(dt_ref,-5),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-35),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-59),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         DATE_TRUNC('MONTH', s.DT_INTERNACAO) AS mes_referencia,
# MAGIC
# MAGIC         s.ANO_INTERNACAO,
# MAGIC
# MAGIC         s.MES_INTERNACAO,
# MAGIC
# MAGIC         s.MES_ANO_SIH,
# MAGIC
# MAGIC         COUNT(*) AS internacoes,
# MAGIC
# MAGIC         ROUND(SUM(s.VAL_TOT),2) AS custo_total,
# MAGIC
# MAGIC         ROUND(AVG(s.VAL_TOT),2) AS custo_medio
# MAGIC
# MAGIC     FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                              AND p.dt_fim
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         DATE_TRUNC('MONTH', s.DT_INTERNACAO),
# MAGIC
# MAGIC         s.ANO_INTERNACAO,
# MAGIC
# MAGIC         s.MES_INTERNACAO,
# MAGIC
# MAGIC         s.MES_ANO_SIH
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     periodo,
# MAGIC
# MAGIC     mes_referencia,
# MAGIC
# MAGIC     MES_ANO_SIH,
# MAGIC
# MAGIC     ANO_INTERNACAO,
# MAGIC
# MAGIC     MES_INTERNACAO,
# MAGIC
# MAGIC     DATE_FORMAT(mes_referencia,'MMM/yyyy') AS mes_exibicao,
# MAGIC
# MAGIC     internacoes,
# MAGIC
# MAGIC     custo_total,
# MAGIC
# MAGIC     ROUND(custo_total/1000,2) AS custo_total_mil,
# MAGIC
# MAGIC     custo_medio,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM base
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     CASE periodo
# MAGIC         WHEN 'Trimestre' THEN 1
# MAGIC         WHEN 'Semestre' THEN 2
# MAGIC         WHEN '12 Meses' THEN 3
# MAGIC         WHEN '3 Anos' THEN 4
# MAGIC         WHEN '5 Anos' THEN 5
# MAGIC     END,
# MAGIC
# MAGIC     mes_referencia;

# COMMAND ----------

# MAGIC %sql
# MAGIC select * from fiap.silver.sih_dengue_internacoes_custo_mensal
# MAGIC where periodo = 'Trimestre'

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 06 - Hospitais com mais Internações

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_top_hospitais AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC SELECT
# MAGIC     DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     LAST_DAY(dt_ref) AS dt_fim
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     s.CNES,
# MAGIC
# MAGIC     COUNT(*) AS internacoes
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                          AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     s.CNES
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC ranking AS (
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     b.*,
# MAGIC
# MAGIC     ROW_NUMBER() OVER (
# MAGIC         PARTITION BY periodo
# MAGIC         ORDER BY internacoes DESC
# MAGIC     ) AS ranking
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     r.periodo,
# MAGIC
# MAGIC     r.ranking,
# MAGIC
# MAGIC     r.CNES,
# MAGIC
# MAGIC     h.nome_hospital,
# MAGIC
# MAGIC     h.razao_social,
# MAGIC
# MAGIC     r.internacoes,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM ranking r
# MAGIC
# MAGIC LEFT JOIN fiap.silver.DIM_HOSPITAIS h
# MAGIC     ON r.CNES = h.CNES
# MAGIC
# MAGIC WHERE r.ranking <= 5
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     periodo,
# MAGIC     ranking;

# COMMAND ----------

# Lendo a tabela processada do Databricks
df_top_hospitais = spark.table("fiap.silver.sih_dengue_top_hospitais")

# Enviando para o Supabase
enviar_para_supabase(df_top_hospitais, "sih_dengue_top_hospitais")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 07 - Internações por Faixa etária

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_internacoes_faixa_etaria AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC SELECT
# MAGIC     DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     LAST_DAY(dt_ref) AS dt_fim
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     LAST_DAY(dt_ref)
# MAGIC FROM referencia
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     s.FAIXA_ETARIA,
# MAGIC
# MAGIC     COUNT(*) AS internacoes,
# MAGIC
# MAGIC     ROUND(
# MAGIC         COUNT(*) * 100.0 /
# MAGIC         SUM(COUNT(*)) OVER(PARTITION BY p.periodo),
# MAGIC         2
# MAGIC     ) AS percentual,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                          AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC     s.FAIXA_ETARIA
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     CASE s.FAIXA_ETARIA
# MAGIC
# MAGIC         WHEN '0-9 anos' THEN 1
# MAGIC         WHEN '10-19 anos' THEN 2
# MAGIC         WHEN '20-39 anos' THEN 3
# MAGIC         WHEN '40-59 anos' THEN 4
# MAGIC         WHEN '60-79 anos' THEN 5
# MAGIC         WHEN '80 anos ou mais' THEN 6
# MAGIC
# MAGIC         ELSE 99
# MAGIC
# MAGIC     END;

# COMMAND ----------

 

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sih_dengue_top_municipios AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         DATE_TRUNC('MONTH', MAX(DT_INTERNACAO)) AS dt_ref
# MAGIC     FROM fiap.silver.SIH_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC         LAST_DAY(dt_ref) AS dt_fim
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         ADD_MONTHS(dt_ref,-5),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-35),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-59),
# MAGIC         LAST_DAY(dt_ref)
# MAGIC     FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         s.MUNIC_RES AS cod_ibge_municipio,
# MAGIC
# MAGIC         i.NOME_MUNICIPIO,
# MAGIC
# MAGIC         COUNT(*) AS internacoes
# MAGIC
# MAGIC     FROM fiap.silver.SIH_SP s
# MAGIC
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     LEFT JOIN fiap.silver.ibge_sp i
# MAGIC         ON CAST(s.MUNIC_RES AS STRING) =
# MAGIC            SUBSTRING(CAST(i.COD_IBGE_COMPLETO AS STRING), 1, 6)
# MAGIC
# MAGIC     WHERE s.DT_INTERNACAO BETWEEN p.dt_inicio
# MAGIC                              AND p.dt_fim
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC         s.MUNIC_RES,
# MAGIC         i.NOME_MUNICIPIO
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC ranking AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         periodo,
# MAGIC
# MAGIC         cod_ibge_municipio,
# MAGIC
# MAGIC         nome_municipio,
# MAGIC
# MAGIC         internacoes,
# MAGIC
# MAGIC         ROW_NUMBER() OVER (
# MAGIC             PARTITION BY periodo
# MAGIC             ORDER BY internacoes DESC
# MAGIC         ) AS ranking
# MAGIC
# MAGIC     FROM base
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     periodo,
# MAGIC
# MAGIC     ranking,
# MAGIC
# MAGIC     cod_ibge_municipio,
# MAGIC
# MAGIC     nome_municipio,
# MAGIC
# MAGIC     internacoes,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM ranking
# MAGIC
# MAGIC WHERE ranking <= 5
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     CASE periodo
# MAGIC         WHEN 'Trimestre' THEN 1
# MAGIC         WHEN 'Semestre' THEN 2
# MAGIC         WHEN '12 Meses' THEN 3
# MAGIC         WHEN '3 Anos' THEN 4
# MAGIC         WHEN '5 Anos' THEN 5
# MAGIC     END,
# MAGIC
# MAGIC     ranking;

# COMMAND ----------

# Lendo a tabela processada do Databricks
df_top_municipios = spark.table("fiap.silver.sih_dengue_top_municipios")

# Enviando para o Supabase
enviar_para_supabase(df_top_municipios, "sih_dengue_top_municipios")
