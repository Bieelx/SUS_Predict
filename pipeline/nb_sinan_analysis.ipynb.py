# Databricks notebook source
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

#carregando dados
df = spark.table("fiap.silver.SINAN_DENGUE_SP")

print(f"\n Dados carregados:")
print(f"total de registros: {df.count():,.0f}")
print(f"período: {df.select(sql_min('DATA_NOTIFICACAO')).collect()[0][0]} a {df.select(sql_max('DATA_NOTIFICACAO')).collect()[0][0]}")
print(f"total de colunas: {len(df.columns)}")

#esquema
print(f"\n colunas e dados:")
df.printSchema()

# COMMAND ----------

# MAGIC %pip install sqlalchemy psycopg2-binary

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
# MAGIC ##Gold

# COMMAND ----------

# MAGIC %md
# MAGIC ##visualizações

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL AS
# MAGIC SELECT
# MAGIC     CAST(DATE_TRUNC('month', s.DATA_NOTIFICACAO) AS DATE) AS mes_ano,
# MAGIC     YEAR(s.DATA_NOTIFICACAO) AS ano,
# MAGIC     MONTH(s.DATA_NOTIFICACAO) AS mes,
# MAGIC
# MAGIC     s.COD_IBGE_MUNICIPIO,
# MAGIC     i.NOME_MUNICIPIO,
# MAGIC     i.NOME_MICRORREGIAO,
# MAGIC     i.NOME_MESORREGIAO,
# MAGIC
# MAGIC     COUNT(*) AS casos,
# MAGIC     SUM(s.FLAG_HOSPITALIZACAO) AS hospitalizacoes,
# MAGIC     SUM(s.FLAG_OBITO_DENGUE) AS obitos,
# MAGIC
# MAGIC     ROUND(
# MAGIC         SUM(s.FLAG_HOSPITALIZACAO) * 100.0 / COUNT(*),
# MAGIC         2
# MAGIC     ) AS taxa_hospitalizacao_pct,
# MAGIC
# MAGIC     ROUND(
# MAGIC         SUM(s.FLAG_OBITO_DENGUE) * 100.0 / COUNT(*),
# MAGIC         4
# MAGIC     ) AS taxa_mortalidade_pct
# MAGIC
# MAGIC FROM fiap.silver.SINAN_DENGUE_SP s
# MAGIC
# MAGIC INNER JOIN fiap.silver.IBGE_SP i
# MAGIC ON CAST(s.COD_IBGE_MUNICIPIO AS BIGINT) =
# MAGIC    CAST(i.COD_SUS AS BIGINT)
# MAGIC
# MAGIC GROUP BY
# MAGIC     CAST(DATE_TRUNC('month', s.DATA_NOTIFICACAO) AS DATE),
# MAGIC     YEAR(s.DATA_NOTIFICACAO),
# MAGIC     MONTH(s.DATA_NOTIFICACAO),
# MAGIC     s.COD_IBGE_MUNICIPIO,
# MAGIC     i.NOME_MUNICIPIO,
# MAGIC     i.NOME_MICRORREGIAO,
# MAGIC     i.NOME_MESORREGIAO

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 01

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_TOTAL_CASOS AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT MAX(mes_ano) AS dt_ref
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC         dt_ref AS dt_fim,
# MAGIC         ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC         ADD_MONTHS(dt_ref,-3) AS dt_fim_anterior,
# MAGIC         TRUE AS possui_comparacao
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         ADD_MONTHS(dt_ref,-5),
# MAGIC         dt_ref,
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         ADD_MONTHS(dt_ref,-6),
# MAGIC         TRUE
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         ADD_MONTHS(dt_ref,-11),
# MAGIC         dt_ref,
# MAGIC         ADD_MONTHS(dt_ref,-23),
# MAGIC         ADD_MONTHS(dt_ref,-12),
# MAGIC         TRUE
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-35),
# MAGIC         dt_ref,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         ADD_MONTHS(dt_ref,-59),
# MAGIC         dt_ref,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC     FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC atual AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         'Dengue' AS id_agravo,
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC
# MAGIC         m.nome_municipio,
# MAGIC
# MAGIC         p.dt_inicio,
# MAGIC         p.dt_fim,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_atual
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     INNER JOIN periodos p
# MAGIC         ON m.mes_ano BETWEEN p.dt_inicio
# MAGIC                          AND p.dt_fim
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio,
# MAGIC         m.nome_municipio,
# MAGIC         p.dt_inicio,
# MAGIC         p.dt_fim
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC anterior AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_anterior
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     INNER JOIN periodos p
# MAGIC         ON p.possui_comparacao = TRUE
# MAGIC        AND m.mes_ano BETWEEN p.dt_inicio_anterior
# MAGIC                         AND p.dt_fim_anterior
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     a.id_agravo,
# MAGIC
# MAGIC     a.periodo,
# MAGIC
# MAGIC     a.cod_ibge_municipio,
# MAGIC
# MAGIC     a.nome_municipio,
# MAGIC
# MAGIC     a.dt_inicio AS periodo_inicio,
# MAGIC
# MAGIC     a.dt_fim AS periodo_fim,
# MAGIC
# MAGIC     a.casos_atual,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN a.periodo IN ('3 Anos','5 Anos')
# MAGIC         THEN NULL
# MAGIC         ELSE COALESCE(b.casos_anterior,0)
# MAGIC     END AS casos_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC
# MAGIC         WHEN a.periodo IN ('3 Anos','5 Anos')
# MAGIC         THEN NULL
# MAGIC
# MAGIC         WHEN COALESCE(b.casos_anterior,0) = 0
# MAGIC         THEN NULL
# MAGIC
# MAGIC         ELSE ROUND(
# MAGIC             (
# MAGIC                 (a.casos_atual - b.casos_anterior)
# MAGIC                 * 100.0
# MAGIC             ) / b.casos_anterior,
# MAGIC             2
# MAGIC         )
# MAGIC
# MAGIC     END AS variacao_pct,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN a.periodo IN ('3 Anos','5 Anos')
# MAGIC         THEN FALSE
# MAGIC
# MAGIC         WHEN COALESCE(b.casos_anterior,0) = 0
# MAGIC         THEN FALSE
# MAGIC
# MAGIC         ELSE TRUE
# MAGIC     END AS possui_base_comparacao,
# MAGIC
# MAGIC     CURRENT_DATE() AS data_referencia
# MAGIC
# MAGIC FROM atual a
# MAGIC
# MAGIC LEFT JOIN anterior b
# MAGIC
# MAGIC     ON a.periodo = b.periodo
# MAGIC    AND a.cod_ibge_municipio = b.cod_ibge_municipio
# MAGIC
# MAGIC ORDER BY
# MAGIC
# MAGIC     periodo,
# MAGIC     casos_atual DESC
# MAGIC ;

# COMMAND ----------

# Lendo a tabela do Databricks
df_total_casos = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_TOTAL_CASOS")

# Enviando para o Supabase
enviar_para_supabase(df_total_casos, "sinan_dengue_municipios_total_casos")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 02

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_TAXA_HOSPITALIZACAO AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT MAX(mes_ano) AS dt_ref
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC municipios_sp AS (
# MAGIC
# MAGIC     SELECT DISTINCT
# MAGIC         cod_ibge_municipio,
# MAGIC         nome_municipio
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         2 AS meses_atual,
# MAGIC         5 AS meses_anterior_inicio,
# MAGIC         3 AS meses_anterior_fim,
# MAGIC         TRUE AS possui_comparacao
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         5,
# MAGIC         11,
# MAGIC         6,
# MAGIC         TRUE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         11,
# MAGIC         23,
# MAGIC         12,
# MAGIC         TRUE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         35,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         59,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC atual AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC         m.nome_municipio,
# MAGIC
# MAGIC         ADD_MONTHS(r.dt_ref,-p.meses_atual) AS periodo_inicio,
# MAGIC         r.dt_ref AS periodo_fim,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_atual,
# MAGIC         SUM(m.hospitalizacoes) AS hospitalizacoes_atual,
# MAGIC
# MAGIC         ROUND(
# MAGIC             SUM(m.hospitalizacoes) * 100.0 /
# MAGIC             NULLIF(SUM(m.casos),0),
# MAGIC             2
# MAGIC         ) AS taxa_hosp_atual,
# MAGIC
# MAGIC         CASE
# MAGIC             WHEN SUM(m.casos) >= 20
# MAGIC             THEN TRUE
# MAGIC             ELSE FALSE
# MAGIC         END AS possui_amostragem_suficiente
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     CROSS JOIN referencia r
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE m.mes_ano BETWEEN
# MAGIC           ADD_MONTHS(r.dt_ref,-p.meses_atual)
# MAGIC           AND r.dt_ref
# MAGIC
# MAGIC     GROUP BY
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio,
# MAGIC         m.nome_municipio,
# MAGIC         r.dt_ref,
# MAGIC         p.meses_atual
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC anterior AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_anterior,
# MAGIC         SUM(m.hospitalizacoes) AS hospitalizacoes_anterior,
# MAGIC
# MAGIC         ROUND(
# MAGIC             SUM(m.hospitalizacoes) * 100.0 /
# MAGIC             NULLIF(SUM(m.casos),0),
# MAGIC             2
# MAGIC         ) AS taxa_hosp_anterior
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     CROSS JOIN referencia r
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE p.possui_comparacao = TRUE
# MAGIC
# MAGIC       AND m.mes_ano BETWEEN
# MAGIC           ADD_MONTHS(r.dt_ref,-p.meses_anterior_inicio)
# MAGIC           AND ADD_MONTHS(r.dt_ref,-p.meses_anterior_fim)
# MAGIC
# MAGIC     GROUP BY
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     a.periodo,
# MAGIC
# MAGIC     a.cod_ibge_municipio,
# MAGIC     a.nome_municipio,
# MAGIC
# MAGIC     a.periodo_inicio,
# MAGIC     a.periodo_fim,
# MAGIC
# MAGIC     a.casos_atual,
# MAGIC     a.hospitalizacoes_atual,
# MAGIC     a.taxa_hosp_atual,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.casos_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS casos_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.hospitalizacoes_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS hospitalizacoes_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.taxa_hosp_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS taxa_hosp_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC              AND b.taxa_hosp_anterior IS NOT NULL
# MAGIC         THEN ROUND(
# MAGIC             a.taxa_hosp_atual -
# MAGIC             b.taxa_hosp_anterior,
# MAGIC             2
# MAGIC         )
# MAGIC         ELSE NULL
# MAGIC     END AS variacao_pp,
# MAGIC
# MAGIC     p.possui_comparacao
# MAGIC         AS possui_base_comparacao,
# MAGIC
# MAGIC     a.possui_amostragem_suficiente,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN a.possui_amostragem_suficiente = FALSE
# MAGIC         THEN 'Baixa amostragem'
# MAGIC         ELSE 'OK'
# MAGIC     END AS observacao,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM atual a
# MAGIC
# MAGIC INNER JOIN periodos p
# MAGIC     ON a.periodo = p.periodo
# MAGIC
# MAGIC LEFT JOIN anterior b
# MAGIC     ON a.periodo = b.periodo
# MAGIC    AND a.cod_ibge_municipio = b.cod_ibge_municipio
# MAGIC
# MAGIC ORDER BY
# MAGIC     periodo,
# MAGIC     nome_municipio;
# MAGIC
# MAGIC

# COMMAND ----------

# Lendo a tabela do Databricks
df_taxa_hosp = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_TAXA_HOSPITALIZACAO")

# Enviando para o Supabase (garantindo que o tratamento de nulos/NaN esteja na sua função enviar_para_supabase)
enviar_para_supabase(df_taxa_hosp, "sinan_dengue_municipios_taxa_hospitalizacao")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 03

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_TAXA_OBITO AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT MAX(mes_ano) AS dt_ref
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         'Trimestre' AS periodo,
# MAGIC         2 AS meses_atual,
# MAGIC         5 AS meses_anterior_inicio,
# MAGIC         3 AS meses_anterior_fim,
# MAGIC         TRUE AS possui_comparacao
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         'Semestre',
# MAGIC         5,
# MAGIC         11,
# MAGIC         6,
# MAGIC         TRUE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '12 Meses',
# MAGIC         11,
# MAGIC         23,
# MAGIC         12,
# MAGIC         TRUE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '3 Anos',
# MAGIC         35,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT
# MAGIC         '5 Anos',
# MAGIC         59,
# MAGIC         NULL,
# MAGIC         NULL,
# MAGIC         FALSE
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC atual AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC         m.nome_municipio,
# MAGIC
# MAGIC         ADD_MONTHS(r.dt_ref,-p.meses_atual) AS periodo_inicio,
# MAGIC         r.dt_ref AS periodo_fim,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_atual,
# MAGIC         SUM(m.obitos) AS obitos_atual,
# MAGIC
# MAGIC         ROUND(
# MAGIC             SUM(m.obitos) * 100.0 /
# MAGIC             NULLIF(SUM(m.casos),0),
# MAGIC             4
# MAGIC         ) AS taxa_obito_atual,
# MAGIC
# MAGIC         CASE
# MAGIC             WHEN SUM(m.casos) >= 50
# MAGIC             THEN TRUE
# MAGIC             ELSE FALSE
# MAGIC         END AS possui_amostragem_suficiente
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     CROSS JOIN referencia r
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE m.mes_ano BETWEEN
# MAGIC           ADD_MONTHS(r.dt_ref,-p.meses_atual)
# MAGIC           AND r.dt_ref
# MAGIC
# MAGIC     GROUP BY
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio,
# MAGIC         m.nome_municipio,
# MAGIC         r.dt_ref,
# MAGIC         p.meses_atual
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC anterior AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         p.periodo,
# MAGIC
# MAGIC         m.cod_ibge_municipio,
# MAGIC
# MAGIC         SUM(m.casos) AS casos_anterior,
# MAGIC         SUM(m.obitos) AS obitos_anterior,
# MAGIC
# MAGIC         ROUND(
# MAGIC             SUM(m.obitos) * 100.0 /
# MAGIC             NULLIF(SUM(m.casos),0),
# MAGIC             4
# MAGIC         ) AS taxa_obito_anterior
# MAGIC
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC
# MAGIC     CROSS JOIN referencia r
# MAGIC     CROSS JOIN periodos p
# MAGIC
# MAGIC     WHERE p.possui_comparacao = TRUE
# MAGIC
# MAGIC       AND m.mes_ano BETWEEN
# MAGIC           ADD_MONTHS(r.dt_ref,-p.meses_anterior_inicio)
# MAGIC           AND ADD_MONTHS(r.dt_ref,-p.meses_anterior_fim)
# MAGIC
# MAGIC     GROUP BY
# MAGIC         p.periodo,
# MAGIC         m.cod_ibge_municipio
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     'Dengue' AS id_agravo,
# MAGIC
# MAGIC     a.periodo,
# MAGIC
# MAGIC     a.cod_ibge_municipio,
# MAGIC     a.nome_municipio,
# MAGIC
# MAGIC     a.periodo_inicio,
# MAGIC     a.periodo_fim,
# MAGIC
# MAGIC     a.casos_atual,
# MAGIC     a.obitos_atual,
# MAGIC
# MAGIC     a.taxa_obito_atual,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.casos_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS casos_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.obitos_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS obitos_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC         THEN b.taxa_obito_anterior
# MAGIC         ELSE NULL
# MAGIC     END AS taxa_obito_anterior,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN p.possui_comparacao
# MAGIC              AND b.taxa_obito_anterior IS NOT NULL
# MAGIC         THEN ROUND(
# MAGIC             a.taxa_obito_atual -
# MAGIC             b.taxa_obito_anterior,
# MAGIC             4
# MAGIC         )
# MAGIC         ELSE NULL
# MAGIC     END AS variacao_pp,
# MAGIC
# MAGIC     p.possui_comparacao AS possui_base_comparacao,
# MAGIC
# MAGIC     a.possui_amostragem_suficiente,
# MAGIC
# MAGIC     CASE
# MAGIC         WHEN a.possui_amostragem_suficiente = FALSE
# MAGIC         THEN 'Baixa amostragem'
# MAGIC         ELSE 'OK'
# MAGIC     END AS observacao,
# MAGIC
# MAGIC     CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM atual a
# MAGIC
# MAGIC INNER JOIN periodos p
# MAGIC     ON a.periodo = p.periodo
# MAGIC
# MAGIC LEFT JOIN anterior b
# MAGIC     ON a.periodo = b.periodo
# MAGIC    AND a.cod_ibge_municipio = b.cod_ibge_municipio
# MAGIC
# MAGIC ORDER BY
# MAGIC     periodo,
# MAGIC     nome_municipio;
# MAGIC
# MAGIC

# COMMAND ----------

# Lendo a tabela do Databricks
df_taxa_obito = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_TAXA_OBITO")

# Enviando para o Supabase
enviar_para_supabase(df_taxa_obito, "sinan_dengue_municipios_taxa_obito")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CARD 04

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_INCIDENCIA AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC SELECT MAX(mes_ano) AS dt_ref
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio_atual,
# MAGIC     dt_ref AS dt_fim_atual,
# MAGIC     ADD_MONTHS(dt_ref,-5) AS dt_inicio_anterior,
# MAGIC     ADD_MONTHS(dt_ref,-3) AS dt_fim_anterior,
# MAGIC     TRUE AS possui_base_comparacao
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     dt_ref,
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     ADD_MONTHS(dt_ref,-6),
# MAGIC     TRUE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     dt_ref,
# MAGIC     ADD_MONTHS(dt_ref,-23),
# MAGIC     ADD_MONTHS(dt_ref,-12),
# MAGIC     TRUE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     dt_ref,
# MAGIC     NULL,
# MAGIC     NULL,
# MAGIC     FALSE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     dt_ref,
# MAGIC     NULL,
# MAGIC     NULL,
# MAGIC     FALSE
# MAGIC FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC atual AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     m.nome_municipio,
# MAGIC     SUM(m.casos) AS casos_atual
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE m.mes_ano BETWEEN p.dt_inicio_atual
# MAGIC                     AND p.dt_fim_atual
# MAGIC
# MAGIC GROUP BY
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     m.nome_municipio
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC anterior AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     SUM(m.casos) AS casos_anterior
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE p.possui_base_comparacao = TRUE
# MAGIC   AND m.mes_ano BETWEEN p.dt_inicio_anterior
# MAGIC                    AND p.dt_fim_anterior
# MAGIC
# MAGIC GROUP BY
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio
# MAGIC
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC
# MAGIC 'Dengue' AS id_agravo,
# MAGIC
# MAGIC p.periodo,
# MAGIC
# MAGIC a.cod_ibge_municipio,
# MAGIC
# MAGIC a.nome_municipio,
# MAGIC
# MAGIC p.dt_inicio_atual AS periodo_inicio,
# MAGIC
# MAGIC p.dt_fim_atual AS periodo_fim,
# MAGIC
# MAGIC a.casos_atual,
# MAGIC
# MAGIC pop.populacao,
# MAGIC
# MAGIC ROUND(
# MAGIC     a.casos_atual * 100000.0 /
# MAGIC     pop.populacao,
# MAGIC     2
# MAGIC ) AS incidencia_atual,
# MAGIC
# MAGIC CASE
# MAGIC     WHEN p.possui_base_comparacao
# MAGIC     THEN COALESCE(an.casos_anterior,0)
# MAGIC     ELSE NULL
# MAGIC END AS casos_anterior,
# MAGIC
# MAGIC CASE
# MAGIC     WHEN p.possui_base_comparacao
# MAGIC     THEN ROUND(
# MAGIC         COALESCE(an.casos_anterior,0) * 100000.0 /
# MAGIC         pop.populacao,
# MAGIC         2
# MAGIC     )
# MAGIC     ELSE NULL
# MAGIC END AS incidencia_anterior,
# MAGIC
# MAGIC CASE
# MAGIC     WHEN p.possui_base_comparacao
# MAGIC     THEN ROUND(
# MAGIC         (
# MAGIC             a.casos_atual * 100000.0 /
# MAGIC             pop.populacao
# MAGIC         )
# MAGIC         -
# MAGIC         (
# MAGIC             COALESCE(an.casos_anterior,0) * 100000.0 /
# MAGIC             pop.populacao
# MAGIC         ),
# MAGIC         2
# MAGIC     )
# MAGIC     ELSE NULL
# MAGIC END AS variacao_pp,
# MAGIC
# MAGIC p.possui_base_comparacao,
# MAGIC
# MAGIC CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC
# MAGIC FROM atual a
# MAGIC
# MAGIC INNER JOIN periodos p
# MAGIC ON a.periodo = p.periodo
# MAGIC
# MAGIC LEFT JOIN anterior an
# MAGIC ON a.periodo = an.periodo
# MAGIC AND a.cod_ibge_municipio = an.cod_ibge_municipio
# MAGIC
# MAGIC LEFT JOIN fiap.silver.IBGE_POPULACAO_SP pop
# MAGIC ON a.cod_ibge_municipio = pop.cod_ibge_municipio
# MAGIC
# MAGIC ORDER BY
# MAGIC periodo,
# MAGIC incidencia_atual DESC;
# MAGIC

# COMMAND ----------

# Lendo a tabela consolidada do Databricks
df_incidencia_consolidada = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_INCIDENCIA")

# Enviando para o Supabase
enviar_para_supabase(df_incidencia_consolidada, "sinan_dengue_municipios_incidencia")

# COMMAND ----------

# MAGIC %md
# MAGIC # Sazonalidade - Casos Mensais

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_SAZONALIDADE AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC SELECT MAX(mes_ano) AS dt_ref
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     dt_ref AS dt_fim,
# MAGIC     TRUE AS possui_comparacao
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     dt_ref,
# MAGIC     TRUE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     dt_ref,
# MAGIC     TRUE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     dt_ref,
# MAGIC     FALSE
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     dt_ref,
# MAGIC     FALSE
# MAGIC FROM referencia
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC atual AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     m.nome_municipio,
# MAGIC     m.mes_ano,
# MAGIC     SUM(m.casos) AS casos_atual
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE m.mes_ano BETWEEN p.dt_inicio
# MAGIC                     AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     m.nome_municipio,
# MAGIC     m.mes_ano
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC ano_anterior AS (
# MAGIC
# MAGIC SELECT
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     ADD_MONTHS(m.mes_ano,12) AS mes_ano,
# MAGIC     SUM(m.casos) AS casos_ano_anterior
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE p.possui_comparacao = TRUE
# MAGIC   AND m.mes_ano BETWEEN
# MAGIC       ADD_MONTHS(p.dt_inicio,-12)
# MAGIC       AND ADD_MONTHS(p.dt_fim,-12)
# MAGIC
# MAGIC GROUP BY
# MAGIC     p.periodo,
# MAGIC     m.cod_ibge_municipio,
# MAGIC     ADD_MONTHS(m.mes_ano,12)
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC media_historica AS (
# MAGIC
# MAGIC SELECT
# MAGIC     cod_ibge_municipio,
# MAGIC     MONTH(mes_ano) AS mes_num,
# MAGIC     AVG(casos) AS media_historica
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC GROUP BY
# MAGIC     cod_ibge_municipio,
# MAGIC     MONTH(mes_ano)
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC 'Dengue' AS id_agravo,
# MAGIC
# MAGIC a.periodo,
# MAGIC
# MAGIC a.cod_ibge_municipio,
# MAGIC
# MAGIC a.nome_municipio,
# MAGIC
# MAGIC a.mes_ano,
# MAGIC
# MAGIC a.casos_atual,
# MAGIC
# MAGIC CASE
# MAGIC     WHEN a.periodo IN ('Trimestre','Semestre','12 Meses')
# MAGIC     THEN aa.casos_ano_anterior
# MAGIC     ELSE NULL
# MAGIC END AS casos_ano_anterior,
# MAGIC
# MAGIC CASE
# MAGIC     WHEN a.periodo IN ('Trimestre','Semestre','12 Meses')
# MAGIC     THEN ROUND(mh.media_historica,2)
# MAGIC     ELSE NULL
# MAGIC END AS media_historica,
# MAGIC
# MAGIC CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC
# MAGIC FROM atual a
# MAGIC
# MAGIC LEFT JOIN ano_anterior aa
# MAGIC ON a.periodo = aa.periodo
# MAGIC AND a.cod_ibge_municipio = aa.cod_ibge_municipio
# MAGIC AND a.mes_ano = aa.mes_ano
# MAGIC
# MAGIC LEFT JOIN media_historica mh
# MAGIC ON a.cod_ibge_municipio = mh.cod_ibge_municipio
# MAGIC AND MONTH(a.mes_ano) = mh.mes_num
# MAGIC
# MAGIC ORDER BY
# MAGIC periodo,
# MAGIC nome_municipio,
# MAGIC mes_ano;
# MAGIC

# COMMAND ----------

# Lendo a tabela consolidada do Databricks
df_sazonalidade_consolidada = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_SAZONALIDADE")

# Enviando para o Supabase
enviar_para_supabase(df_sazonalidade_consolidada, "sinan_dengue_municipios_sazonalidade")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Distribuição por Cidade

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_DISTRIBUICAO_CIDADE AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC SELECT MAX(mes_ano) AS dt_ref
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     dt_ref AS dt_fim
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     p.periodo,
# MAGIC     m.nome_municipio,
# MAGIC     SUM(m.casos) AS casos
# MAGIC
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL m
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE m.mes_ano BETWEEN p.dt_inicio
# MAGIC                     AND p.dt_fim
# MAGIC
# MAGIC GROUP BY
# MAGIC     p.periodo,
# MAGIC     m.nome_municipio
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC ranking AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     *,
# MAGIC     ROW_NUMBER() OVER (
# MAGIC         PARTITION BY periodo
# MAGIC         ORDER BY casos DESC
# MAGIC     ) AS ranking
# MAGIC
# MAGIC FROM base
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC top5 AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     periodo,
# MAGIC     nome_municipio,
# MAGIC     casos,
# MAGIC     ranking
# MAGIC
# MAGIC FROM ranking
# MAGIC
# MAGIC WHERE ranking <= 5
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC outros AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     periodo,
# MAGIC     'Outros' AS nome_municipio,
# MAGIC     SUM(casos) AS casos,
# MAGIC     6 AS ranking
# MAGIC
# MAGIC FROM ranking
# MAGIC
# MAGIC WHERE ranking > 5
# MAGIC
# MAGIC GROUP BY periodo
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC resultado AS (
# MAGIC
# MAGIC
# MAGIC SELECT * FROM top5
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT * FROM outros
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC total AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     periodo,
# MAGIC     SUM(casos) AS total_casos
# MAGIC
# MAGIC FROM resultado
# MAGIC
# MAGIC GROUP BY periodo
# MAGIC
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC
# MAGIC 'Dengue' AS id_agravo,
# MAGIC
# MAGIC r.periodo,
# MAGIC
# MAGIC r.nome_municipio,
# MAGIC
# MAGIC r.casos,
# MAGIC
# MAGIC ROUND(
# MAGIC     (r.casos / t.total_casos) * 100,
# MAGIC     2
# MAGIC ) AS percentual,
# MAGIC
# MAGIC r.ranking,
# MAGIC
# MAGIC CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC FROM resultado r
# MAGIC
# MAGIC INNER JOIN total t
# MAGIC ON r.periodo = t.periodo
# MAGIC
# MAGIC ORDER BY
# MAGIC periodo,
# MAGIC ranking;
# MAGIC

# COMMAND ----------

# Lendo a tabela consolidada do Databricks
df_distribuicao_cidade = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_DISTRIBUICAO_CIDADE")

# Enviando para o Supabase
enviar_para_supabase(df_distribuicao_cidade, "sinan_dengue_municipios_distribuicao_cidade")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Distribuição por gênero

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.sinan_dengue_municipios_distribuicao_genero AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC
# MAGIC     SELECT
# MAGIC         MAX(mes_ano_sinan) AS dt_ref
# MAGIC     FROM fiap.silver.SINAN_DENGUE_SP
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC     SELECT 'Trimestre' AS periodo,
# MAGIC            ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC            dt_ref AS dt_fim
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT 'Semestre',
# MAGIC            ADD_MONTHS(dt_ref,-5),
# MAGIC            dt_ref
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT '12 Meses',
# MAGIC            ADD_MONTHS(dt_ref,-11),
# MAGIC            dt_ref
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT '3 Anos',
# MAGIC            ADD_MONTHS(dt_ref,-35),
# MAGIC            dt_ref
# MAGIC     FROM referencia
# MAGIC
# MAGIC     UNION ALL
# MAGIC
# MAGIC     SELECT '5 Anos',
# MAGIC            ADD_MONTHS(dt_ref,-59),
# MAGIC            dt_ref
# MAGIC     FROM referencia
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC municipios_sp AS (
# MAGIC
# MAGIC     SELECT DISTINCT
# MAGIC         cod_ibge_municipio,
# MAGIC         nome_municipio
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         s.id_agravo,
# MAGIC         p.periodo,
# MAGIC         s.cod_ibge_municipio,
# MAGIC         s.genero,
# MAGIC
# MAGIC         COUNT(*) AS casos
# MAGIC
# MAGIC     FROM fiap.silver.SINAN_DENGUE_SP s
# MAGIC
# MAGIC     INNER JOIN periodos p
# MAGIC         ON s.mes_ano_sinan BETWEEN p.dt_inicio AND p.dt_fim
# MAGIC
# MAGIC     WHERE s.genero IN ('Feminino','Masculino')
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         s.id_agravo,
# MAGIC         p.periodo,
# MAGIC         s.cod_ibge_municipio,
# MAGIC         s.genero
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC totais AS (
# MAGIC
# MAGIC     SELECT
# MAGIC
# MAGIC         id_agravo,
# MAGIC         periodo,
# MAGIC         cod_ibge_municipio,
# MAGIC
# MAGIC         SUM(casos) AS total_casos
# MAGIC
# MAGIC     FROM base
# MAGIC
# MAGIC     GROUP BY
# MAGIC
# MAGIC         id_agravo,
# MAGIC         periodo,
# MAGIC         cod_ibge_municipio
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     b.id_agravo,
# MAGIC
# MAGIC     b.periodo,
# MAGIC
# MAGIC     b.cod_ibge_municipio,
# MAGIC
# MAGIC     m.nome_municipio,
# MAGIC
# MAGIC     b.genero,
# MAGIC
# MAGIC     b.casos,
# MAGIC
# MAGIC     ROUND(
# MAGIC         (b.casos / t.total_casos) * 100,
# MAGIC         2
# MAGIC     ) AS percentual,
# MAGIC
# MAGIC     CURRENT_DATE() AS data_referencia
# MAGIC
# MAGIC FROM base b
# MAGIC
# MAGIC INNER JOIN totais t
# MAGIC
# MAGIC     ON b.id_agravo = t.id_agravo
# MAGIC    AND b.periodo = t.periodo
# MAGIC    AND b.cod_ibge_municipio = t.cod_ibge_municipio
# MAGIC
# MAGIC INNER JOIN municipios_sp m
# MAGIC
# MAGIC     ON b.cod_ibge_municipio = m.cod_ibge_municipio
# MAGIC ;

# COMMAND ----------

# Lendo a tabela do Databricks
df_genero = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_DISTRIBUICAO_GENERO")

# Enviando para o Supabase
enviar_para_supabase(df_genero, "sinan_dengue_municipios_distribuicao_genero")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Desfecho Clínico por Ano

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_DESFECHO_CLINICO_ANUAL AS
# MAGIC
# MAGIC WITH municipios_sp AS (
# MAGIC
# MAGIC     SELECT DISTINCT
# MAGIC         cod_ibge_municipio,
# MAGIC         nome_municipio
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     s.id_agravo,
# MAGIC
# MAGIC     s.cod_ibge_municipio,
# MAGIC
# MAGIC     m.nome_municipio,
# MAGIC
# MAGIC     s.ano_referencia,
# MAGIC
# MAGIC     SUM(
# MAGIC         CASE
# MAGIC             WHEN COALESCE(s.flag_obito_dengue,0) = 0
# MAGIC              AND COALESCE(s.flag_obito_geral,0) = 0
# MAGIC             THEN 1
# MAGIC             ELSE 0
# MAGIC         END
# MAGIC     ) AS casos_leves,
# MAGIC
# MAGIC     SUM(
# MAGIC         CASE
# MAGIC             WHEN COALESCE(s.flag_hospitalizacao,0) = 1
# MAGIC             THEN 1
# MAGIC             ELSE 0
# MAGIC         END
# MAGIC     ) AS hospitalizacoes,
# MAGIC
# MAGIC     SUM(
# MAGIC         CASE
# MAGIC             WHEN COALESCE(s.flag_obito_dengue,0) = 1
# MAGIC               OR COALESCE(s.flag_obito_geral,0) = 1
# MAGIC             THEN 1
# MAGIC             ELSE 0
# MAGIC         END
# MAGIC     ) AS obitos,
# MAGIC
# MAGIC     CURRENT_DATE() AS data_referencia
# MAGIC
# MAGIC FROM fiap.silver.SINAN_DENGUE_SP s
# MAGIC
# MAGIC INNER JOIN municipios_sp m
# MAGIC     ON s.cod_ibge_municipio = m.cod_ibge_municipio
# MAGIC
# MAGIC GROUP BY
# MAGIC
# MAGIC     s.id_agravo,
# MAGIC     s.cod_ibge_municipio,
# MAGIC     m.nome_municipio,
# MAGIC     s.ano_referencia
# MAGIC ;

# COMMAND ----------

# Lendo a tabela do Databricks
df_desfecho_anual = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_DESFECHO_CLINICO_ANUAL")

# Enviando para o Supabase
enviar_para_supabase(df_desfecho_anual, "sinan_dengue_municipios_desfecho_clinico_anual")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gráfico faixa etária

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE OR REPLACE TABLE fiap.silver.SINAN_DENGUE_MUNICIPIOS_FAIXA_ETARIA AS
# MAGIC
# MAGIC WITH referencia AS (
# MAGIC SELECT MAX(mes_ano) AS dt_ref
# MAGIC FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC ),
# MAGIC
# MAGIC periodos AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC     'Trimestre' AS periodo,
# MAGIC     ADD_MONTHS(dt_ref,-2) AS dt_inicio,
# MAGIC     dt_ref AS dt_fim
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     'Semestre',
# MAGIC     ADD_MONTHS(dt_ref,-5),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '12 Meses',
# MAGIC     ADD_MONTHS(dt_ref,-11),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '3 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-35),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC UNION ALL
# MAGIC
# MAGIC SELECT
# MAGIC     '5 Anos',
# MAGIC     ADD_MONTHS(dt_ref,-59),
# MAGIC     dt_ref
# MAGIC FROM referencia
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC base AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     p.periodo,
# MAGIC
# MAGIC     s.cod_ibge_municipio,
# MAGIC
# MAGIC     m.nome_municipio,
# MAGIC
# MAGIC CASE
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 0 AND 9
# MAGIC         THEN '0-9 anos'
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 10 AND 19
# MAGIC         THEN '10-19 anos'
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 20 AND 39
# MAGIC         THEN '20-39 anos'
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 40 AND 59
# MAGIC         THEN '40-59 anos'
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 60 AND 79
# MAGIC         THEN '60-79 anos'
# MAGIC
# MAGIC     ELSE '80 anos ou mais'
# MAGIC
# MAGIC END AS faixa_etaria,
# MAGIC
# MAGIC CASE
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 0 AND 9
# MAGIC         THEN 1
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 10 AND 19
# MAGIC         THEN 2
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 20 AND 39
# MAGIC         THEN 3
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 40 AND 59
# MAGIC         THEN 4
# MAGIC
# MAGIC     WHEN s.idade_anos BETWEEN 60 AND 79
# MAGIC         THEN 5
# MAGIC
# MAGIC     ELSE 6
# MAGIC
# MAGIC END AS ordem_faixa
# MAGIC
# MAGIC FROM fiap.silver.SINAN_DENGUE_SP s
# MAGIC
# MAGIC INNER JOIN (
# MAGIC     SELECT DISTINCT
# MAGIC         cod_ibge_municipio,
# MAGIC         nome_municipio
# MAGIC     FROM fiap.gold.SINAN_DENGUE_MUNICIPIOS_MENSAL
# MAGIC ) m
# MAGIC     ON s.cod_ibge_municipio = m.cod_ibge_municipio
# MAGIC
# MAGIC CROSS JOIN periodos p
# MAGIC
# MAGIC WHERE s.data_notif_date BETWEEN p.dt_inicio
# MAGIC                             AND p.dt_fim
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC casos_faixa AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     periodo,
# MAGIC     cod_ibge_municipio,
# MAGIC     nome_municipio,
# MAGIC     faixa_etaria,
# MAGIC     ordem_faixa,
# MAGIC
# MAGIC     COUNT(*) AS casos
# MAGIC
# MAGIC FROM base
# MAGIC
# MAGIC GROUP BY
# MAGIC     periodo,
# MAGIC     cod_ibge_municipio,
# MAGIC     nome_municipio,
# MAGIC     faixa_etaria,
# MAGIC     ordem_faixa
# MAGIC
# MAGIC
# MAGIC ),
# MAGIC
# MAGIC totais AS (
# MAGIC
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC     periodo,
# MAGIC     cod_ibge_municipio,
# MAGIC
# MAGIC     SUM(casos) AS total_casos
# MAGIC
# MAGIC FROM casos_faixa
# MAGIC
# MAGIC GROUP BY
# MAGIC     periodo,
# MAGIC     cod_ibge_municipio
# MAGIC
# MAGIC
# MAGIC )
# MAGIC
# MAGIC SELECT
# MAGIC
# MAGIC
# MAGIC 'Dengue' AS id_agravo,
# MAGIC
# MAGIC c.periodo,
# MAGIC
# MAGIC c.cod_ibge_municipio,
# MAGIC
# MAGIC c.nome_municipio,
# MAGIC
# MAGIC c.faixa_etaria,
# MAGIC
# MAGIC c.casos,
# MAGIC
# MAGIC ROUND(
# MAGIC     (c.casos / t.total_casos) * 100,
# MAGIC     2
# MAGIC ) AS percentual,
# MAGIC
# MAGIC c.ordem_faixa,
# MAGIC
# MAGIC CURRENT_TIMESTAMP() AS data_referencia
# MAGIC
# MAGIC
# MAGIC FROM casos_faixa c
# MAGIC
# MAGIC INNER JOIN totais t
# MAGIC ON c.periodo = t.periodo
# MAGIC AND c.cod_ibge_municipio = t.cod_ibge_municipio
# MAGIC
# MAGIC ORDER BY
# MAGIC periodo,
# MAGIC nome_municipio,
# MAGIC ordem_faixa;
# MAGIC

# COMMAND ----------

# Lendo a tabela consolidada do Databricks
df_faixa_etaria = spark.table("fiap.silver.SINAN_DENGUE_MUNICIPIOS_FAIXA_ETARIA")

# Enviando para o Supabase
enviar_para_supabase(df_faixa_etaria, "sinan_dengue_municipios_faixa_etaria")
