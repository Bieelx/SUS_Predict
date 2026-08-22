# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# MAGIC %md
# MAGIC # Análises para a tela Visão Geral
# MAGIC
# MAGIC Consolida SINAN, SIH e Ruptura de Insumos para o painel executivo.
# MAGIC Filtros previstos no front: **Mês / Trimestre / Ano** + **Cidade**.
# MAGIC Vacinação fica fora deste notebook (pipeline separado).

# COMMAND ----------

# MAGIC %pip install --upgrade supabase

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import json
import math
from datetime import date, datetime
from decimal import Decimal

import numpy as np
import pandas as pd
from pyspark.sql import Window
from pyspark.sql import functions as F
from pyspark.sql.types import DateType, DoubleType, IntegerType, StringType, StructField, StructType
from supabase import create_client

CATALOGO = "fiap"
ID_AGRAVO = "A90"
NOME_AGRAVO = "Dengue"
COD_IBGE_ESTADO = "TODOS"
MESES_SPARKLINE = 12
MESES_EVOLUCAO = 36
MESES_PROJECAO = 6
PESO_EPI = 0.40
PESO_CAPACIDADE = 0.30
PESO_ESTOQUE = 0.30

SUPABASE_URL = ""
SUPABASE_KEY = ""
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def valor_json(valor):
    if valor is None or pd.isna(valor):
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, np.integer):
        return int(valor)
    if isinstance(valor, np.floating):
        return None if np.isnan(valor) or np.isinf(valor) else float(valor)
    if isinstance(valor, float):
        return None if math.isnan(valor) or math.isinf(valor) else valor
    return valor


def enviar_para_supabase(
    tabela_spark,
    nome_tabela_supabase,
    truncate=True,
    chunk_size=1000,
):
    df_pandas = tabela_spark.toPandas()

    if df_pandas.empty:
        print(f"{nome_tabela_supabase}: sem registros; exportação ignorada.")
        return

    df_pandas.columns = [coluna.lower() for coluna in df_pandas.columns]
    dados = [
        {chave: valor_json(valor) for chave, valor in linha.items()}
        for linha in df_pandas.to_dict("records")
    ]
    json.dumps(dados, allow_nan=False)

    if truncate:
        primeira_coluna = df_pandas.columns[0]
        supabase.table(nome_tabela_supabase).delete().not_.is_(
            primeira_coluna, "null"
        ).execute()

    total_lotes = (len(dados) + chunk_size - 1) // chunk_size
    total_inserido = 0
    for indice, inicio in enumerate(range(0, len(dados), chunk_size), start=1):
        supabase.table(nome_tabela_supabase).insert(
            dados[inicio:inicio + chunk_size]
        ).execute()
        total_inserido += min(chunk_size, len(dados) - inicio)
        if total_lotes > 10 and indice % 10 == 0:
            print(
                f"{nome_tabela_supabase}: {total_inserido:,}/{len(dados):,} "
                f"registros enviados..."
            )

    print(f"{nome_tabela_supabase}: {len(dados):,} registros enviados.")


def offset_mes(data_ref, meses):
    return (
        spark.sql(
            f"SELECT add_months(to_date('{str(data_ref)[:10]}'), {int(meses)}) AS dt"
        )
        .collect()[0]["dt"]
    )


def variacao_pct(atual, anterior):
    return F.when(
        F.coalesce(anterior, F.lit(0)) == 0,
        F.lit(None).cast(DoubleType()),
    ).otherwise(
        F.round((atual - anterior) * 100.0 / anterior, 2)
    )


def faixa_risco_indice(coluna):
    return (
        F.when(coluna >= 70, "ALTO")
        .when(coluna >= 45, "MODERADO")
        .otherwise("BAIXO")
    )


def carregar_competencia_referencia():
    linha = spark.table(
        f"{CATALOGO}.gold.RUPTURA_INSUMOS_COMPETENCIA_REFERENCIA"
    ).first()
    if linha is None:
        raise RuntimeError(
            "Execute nb_ruptura_insumos_analysis.py antes da Visão Geral."
        )
    return {
        "competencia_referencia": linha["COMPETENCIA_REFERENCIA"],
        "competencia_maxima": linha["COMPETENCIA_MAXIMA_BASE"],
        "motivo_referencia": linha["MOTIVO_REFERENCIA"],
    }


def calcular_scores_municipio(df_municipio):
    janela_hist = (
        Window.partitionBy("COD_IBGE_COMPLETO")
        .orderBy("COMPETENCIA")
        .rowsBetween(-6, -1)
    )

    df = (
        df_municipio
        .withColumn(
            "CASOS_MEDIANA_6M",
            F.percentile_approx("TOTAL_CASOS_DENGUE", 0.5).over(janela_hist),
        )
        .withColumn(
            "INTERNACOES_MES_ANTERIOR",
            F.lag("TOTAL_INTERNACOES_SIH", 1).over(
                Window.partitionBy("COD_IBGE_COMPLETO").orderBy("COMPETENCIA")
            ),
        )
        .withColumn(
            "RATIO_CASOS_MEDIANA",
            F.when(
                F.coalesce(F.col("CASOS_MEDIANA_6M"), F.lit(0)) > 0,
                F.col("TOTAL_CASOS_DENGUE") / F.col("CASOS_MEDIANA_6M"),
            ).otherwise(F.lit(0.0)),
        )
        .withColumn(
            "SCORE_EPIDEMIOLOGICO",
            F.least(
                F.lit(100.0),
                F.round(
                    F.when(F.col("RATIO_CASOS_MEDIANA") >= 1.5, 90.0)
                    .when(F.col("RATIO_CASOS_MEDIANA") >= 1.2, 75.0)
                    .when(F.col("RATIO_CASOS_MEDIANA") >= 1.0, 60.0)
                    .when(F.col("RATIO_CASOS_MEDIANA") >= 0.5, 40.0)
                    .otherwise(20.0)
                    + F.least(F.col("INCIDENCIA_DENGUE_100K") / 10.0, F.lit(25.0)),
                    2,
                ),
            ),
        )
        .withColumn(
            "RATIO_INTERNACOES",
            F.when(
                F.coalesce(F.col("INTERNACOES_MES_ANTERIOR"), F.lit(0)) > 0,
                F.col("TOTAL_INTERNACOES_SIH") / F.col("INTERNACOES_MES_ANTERIOR"),
            ).otherwise(
                F.when(F.col("TOTAL_INTERNACOES_SIH") > 0, F.lit(1.5)).otherwise(F.lit(0.0))
            ),
        )
        .withColumn(
            "SCORE_CAPACIDADE",
            F.least(
                F.lit(100.0),
                F.round(
                    F.when(F.col("RATIO_INTERNACOES") >= 1.5, 85.0)
                    .when(F.col("RATIO_INTERNACOES") >= 1.2, 70.0)
                    .when(F.col("RATIO_INTERNACOES") >= 1.0, 55.0)
                    .when(F.col("RATIO_INTERNACOES") >= 0.8, 35.0)
                    .otherwise(20.0),
                    2,
                ),
            ),
        )
        .withColumn(
            "SCORE_ESTOQUE_CRITICO",
            F.when(F.col("ITENS_RISCO_ALTO") > 0, F.lit(90.0))
            .when(F.col("ITENS_RISCO_MODERADO") > 0, F.lit(60.0))
            .when(F.col("FAIXA_RISCO_MUNICIPIO") == "MODERADO", F.lit(60.0))
            .when(F.col("FAIXA_RISCO_MUNICIPIO") == "ALTO", F.lit(90.0))
            .otherwise(F.lit(15.0)),
        )
        .withColumn(
            "INDICE_RISCO_REGIONAL",
            F.round(
                F.col("SCORE_EPIDEMIOLOGICO") * PESO_EPI
                + F.col("SCORE_CAPACIDADE") * PESO_CAPACIDADE
                + F.col("SCORE_ESTOQUE_CRITICO") * PESO_ESTOQUE,
                2,
            ),
        )
        .withColumn(
            "MUNICIPIO_EM_ALERTA_SUPRIMENTO",
            F.when(
                F.col("FAIXA_RISCO_MUNICIPIO").isin("ALTO", "MODERADO"),
                F.lit(1),
            ).otherwise(F.lit(0)),
        )
    )
    return df


def agregar_estado(df_municipio_scores):
    return (
        df_municipio_scores
        .groupBy("COMPETENCIA")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
            F.sum("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIOS_ALERTA_SUPRIMENTO"),
            F.sum("POPULACAO").alias("POPULACAO"),
            F.sum(F.col("INDICE_RISCO_REGIONAL") * F.col("POPULACAO")).alias("INDICE_PONDERADO"),
        )
        .withColumn(
            "INDICE_RISCO_REGIONAL",
            F.round(
                F.col("INDICE_PONDERADO")
                / F.when(F.col("POPULACAO") > 0, F.col("POPULACAO")).otherwise(F.lit(1)),
                2,
            ),
        )
        .withColumn("COD_IBGE_COMPLETO", F.lit(COD_IBGE_ESTADO))
        .withColumn("MUNICIPIO", F.lit("São Paulo (estado)"))
        .withColumn("UF", F.lit("SP"))
        .withColumn("FAIXA_RISCO_MUNICIPIO", faixa_risco_indice(F.col("INDICE_RISCO_REGIONAL")))
        .withColumn("ITENS_RISCO_ALTO", F.lit(0))
        .withColumn("ITENS_RISCO_MODERADO", F.lit(0))
        .withColumn("INCIDENCIA_DENGUE_100K", F.lit(0.0))
        .withColumn("SCORE_EPIDEMIOLOGICO", F.lit(None).cast(DoubleType()))
        .withColumn("SCORE_CAPACIDADE", F.lit(None).cast(DoubleType()))
        .withColumn("SCORE_ESTOQUE_CRITICO", F.lit(None).cast(DoubleType()))
        .withColumn("MUNICIPIO_EM_ALERTA_SUPRIMENTO", F.col("MUNICIPIOS_ALERTA_SUPRIMENTO"))
    )


def montar_kpis_linha(df_ref, df_anterior, competencia_referencia, periodo=None):
    df_anterior_renomeado = df_anterior.select(
        F.col("COD_IBGE_COMPLETO"),
        F.col("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE_ANT"),
        F.col("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH_ANT"),
        F.col("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL_ANT"),
    )

    df = (
        df_ref.join(df_anterior_renomeado, "COD_IBGE_COMPLETO", "left")
        .select(
            F.col("COD_IBGE_COMPLETO"),
            F.col("MUNICIPIO"),
            F.col("UF"),
            F.lit(competencia_referencia).alias("COMPETENCIA_REFERENCIA"),
            F.col("COMPETENCIA"),
            F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
            F.col("TOTAL_CASOS_DENGUE").alias("CASOS_NOTIFICADOS"),
            F.coalesce(F.col("TOTAL_CASOS_DENGUE_ANT"), F.lit(0)).alias(
                "CASOS_NOTIFICADOS_ANTERIOR"
            ),
            variacao_pct(
                F.col("TOTAL_CASOS_DENGUE"),
                F.coalesce(F.col("TOTAL_CASOS_DENGUE_ANT"), F.lit(0)),
            ).alias("VARIACAO_CASOS_PCT"),
            F.col("INDICE_RISCO_REGIONAL"),
            F.coalesce(F.col("INDICE_RISCO_REGIONAL_ANT"), F.lit(0.0)).alias(
                "INDICE_RISCO_ANTERIOR"
            ),
            F.round(
                F.col("INDICE_RISCO_REGIONAL")
                - F.coalesce(F.col("INDICE_RISCO_REGIONAL_ANT"), F.lit(0.0)),
                2,
            ).alias("VARIACAO_INDICE_RISCO_PP"),
            F.col("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIOS_ALERTA_SUPRIMENTO"),
            F.col("TOTAL_INTERNACOES_SIH").alias("INTERNACOES_SIH"),
            F.coalesce(F.col("TOTAL_INTERNACOES_SIH_ANT"), F.lit(0)).alias(
                "INTERNACOES_SIH_ANTERIOR"
            ),
            variacao_pct(
                F.col("TOTAL_INTERNACOES_SIH"),
                F.coalesce(F.col("TOTAL_INTERNACOES_SIH_ANT"), F.lit(0)),
            ).alias("VARIACAO_INTERNACOES_PCT"),
            F.current_timestamp().alias("DATA_PROCESSAMENTO"),
        )
    )

    if periodo is not None:
        df = df.withColumn("PERIODO", F.lit(periodo))

    return df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Metadados e base municipal

# COMMAND ----------

meta = carregar_competencia_referencia()
competencia_referencia = meta["competencia_referencia"]
competencia_anterior = offset_mes(competencia_referencia, -1)
competencia_serie_inicio = offset_mes(competencia_referencia, -(MESES_SPARKLINE - 1))
competencia_evolucao_inicio = offset_mes(competencia_referencia, -(MESES_EVOLUCAO - 1))

df_competencia_referencia = (
    spark.createDataFrame(
        [(
            ID_AGRAVO,
            NOME_AGRAVO,
            competencia_referencia,
            meta["competencia_maxima"],
            meta["motivo_referencia"],
        )],
        "ID_AGRAVO STRING, NOME_AGRAVO STRING, COMPETENCIA_REFERENCIA DATE, "
        "COMPETENCIA_MAXIMA_BASE DATE, MOTIVO_REFERENCIA STRING",
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

df_resumo_municipal = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_MUNICIPAL")
df_municipio_scores = calcular_scores_municipio(df_resumo_municipal)
df_estado_scores = agregar_estado(df_municipio_scores)

print(f"Competência de referência: {competencia_referencia}")
print(f"Municípios monitorados: {df_municipio_scores.select('COD_IBGE_COMPLETO').distinct().count():,}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KPIs atuais (cards)

# COMMAND ----------

df_ref_mes = df_municipio_scores.filter(
    F.col("COMPETENCIA") == F.lit(competencia_referencia)
)
df_ant_mes = df_municipio_scores.filter(
    F.col("COMPETENCIA") == F.lit(competencia_anterior)
)

df_ref_estado = df_estado_scores.filter(
    F.col("COMPETENCIA") == F.lit(competencia_referencia)
)
df_ant_estado = df_estado_scores.filter(
    F.col("COMPETENCIA") == F.lit(competencia_anterior)
)

df_kpis_atuais = (
    montar_kpis_linha(df_ref_mes, df_ant_mes, competencia_referencia)
    .unionByName(montar_kpis_linha(df_ref_estado, df_ant_estado, competencia_referencia))
)

(
    df_kpis_atuais.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_ATUAIS")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## KPIs por período (Mês / Trimestre / Ano)

# COMMAND ----------

from pyspark.sql.functions import col

periodos_config = [
    ("Mes", 0, 1, 1),
    ("Trimestre", 2, 5, 3),
    ("Ano", 11, 23, 12),
]

partes_periodo = []

for nome_periodo, meses_atual, meses_anterior_ini, meses_anterior_fim in periodos_config:
    if nome_periodo == "Mes":
        dt_inicio = competencia_referencia
        dt_fim = competencia_referencia
        dt_inicio_anterior = competencia_anterior
        dt_fim_anterior = competencia_anterior
    else:
        dt_inicio = offset_mes(competencia_referencia, -meses_atual)
        dt_fim = competencia_referencia
        dt_inicio_anterior = offset_mes(competencia_referencia, -meses_anterior_ini)
        dt_fim_anterior = offset_mes(competencia_referencia, -meses_anterior_fim)

    df_atual = (
        df_municipio_scores.filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim))
        )
        .groupBy("COD_IBGE_COMPLETO", "MUNICIPIO", "UF")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
            F.max("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIO_EM_ALERTA_SUPRIMENTO"),
            F.avg("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL"),
        )
        .withColumn("COMPETENCIA", F.lit(competencia_referencia))
    )

    df_anterior = (
        df_municipio_scores.filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio_anterior))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim_anterior))
        )
        .groupBy("COD_IBGE_COMPLETO")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
            F.avg("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL"),
        )
    )

    df_periodo = (
        montar_kpis_linha(df_atual, df_anterior, competencia_referencia, periodo=nome_periodo)
        .withColumn("PERIODO_INICIO", F.lit(dt_inicio))
        .withColumn("PERIODO_FIM", F.lit(dt_fim))
        .withColumn("PERIODO_INICIO_ANTERIOR", F.lit(dt_inicio_anterior))
        .withColumn("PERIODO_FIM_ANTERIOR", F.lit(dt_fim_anterior))
    )

    df_atual_estado = (
        df_municipio_scores.filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim))
        )
        .groupBy("COD_IBGE_COMPLETO")
        .agg(
            F.max("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIO_EM_ALERTA_SUPRIMENTO"),
        )
        .agg(
            F.sum("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIO_EM_ALERTA_SUPRIMENTO"),
        )
        .crossJoin(
            spark.createDataFrame(
                [(COD_IBGE_ESTADO, "São Paulo (estado)", "SP")],
                "COD_IBGE_COMPLETO STRING, MUNICIPIO STRING, UF STRING",
            )
        )
        .withColumn("TOTAL_CASOS_DENGUE", F.lit(None))
        .withColumn("TOTAL_INTERNACOES_SIH", F.lit(None))
        .withColumn("INDICE_RISCO_REGIONAL", F.lit(None).cast(DoubleType()))
    )

    totais_estado = (
        df_estado_scores.filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim))
        )
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
            F.avg("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL"),
        )
    )

    df_atual_estado = (
        df_atual_estado.drop("TOTAL_CASOS_DENGUE", "TOTAL_INTERNACOES_SIH", "INDICE_RISCO_REGIONAL")
        .crossJoin(totais_estado)
        .withColumn("COMPETENCIA", F.lit(competencia_referencia))
    )

    df_anterior_estado = (
        df_estado_scores.filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio_anterior))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim_anterior))
        )
        .groupBy("COD_IBGE_COMPLETO")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
            F.avg("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL"),
        )
    )

    df_periodo_estado = (
        montar_kpis_linha(
            df_atual_estado,
            df_anterior_estado,
            competencia_referencia,
            periodo=nome_periodo,
        )
        .withColumn("PERIODO_INICIO", F.lit(dt_inicio))
        .withColumn("PERIODO_FIM", F.lit(dt_fim))
        .withColumn("PERIODO_INICIO_ANTERIOR", F.lit(dt_inicio_anterior))
        .withColumn("PERIODO_FIM_ANTERIOR", F.lit(dt_fim_anterior))
    )

    partes_periodo.append(df_periodo)
    partes_periodo.append(df_periodo_estado)

df_kpis_periodo = partes_periodo[0]
for parte in partes_periodo[1:]:
    df_kpis_periodo = df_kpis_periodo.unionByName(parte)

# competencia existe em kpis_atuais, mas kpis_periodo usa periodo_inicio/fim no Supabase
df_kpis_periodo = df_kpis_periodo.drop("COMPETENCIA")

(
    df_kpis_periodo.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_PERIODO")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Séries para sparklines dos cards

# COMMAND ----------

df_kpis_serie_municipio = (
    df_municipio_scores.filter(
        (F.col("COMPETENCIA") >= F.lit(competencia_serie_inicio))
        & (F.col("COMPETENCIA") <= F.lit(competencia_referencia))
    )
    .select(
        "COD_IBGE_COMPLETO",
        "MUNICIPIO",
        F.col("COMPETENCIA"),
        F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
        F.col("TOTAL_CASOS_DENGUE").alias("CASOS_NOTIFICADOS"),
        F.col("INDICE_RISCO_REGIONAL"),
        F.col("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIOS_ALERTA_SUPRIMENTO"),
        F.col("TOTAL_INTERNACOES_SIH").alias("INTERNACOES_SIH"),
        F.current_timestamp().alias("DATA_PROCESSAMENTO"),
    )
)

df_kpis_serie_estado = (
    df_estado_scores.filter(
        (F.col("COMPETENCIA") >= F.lit(competencia_serie_inicio))
        & (F.col("COMPETENCIA") <= F.lit(competencia_referencia))
    )
    .select(
        "COD_IBGE_COMPLETO",
        "MUNICIPIO",
        F.col("COMPETENCIA"),
        F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
        F.col("TOTAL_CASOS_DENGUE").alias("CASOS_NOTIFICADOS"),
        F.col("INDICE_RISCO_REGIONAL"),
        F.col("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIOS_ALERTA_SUPRIMENTO"),
        F.col("TOTAL_INTERNACOES_SIH").alias("INTERNACOES_SIH"),
        F.current_timestamp().alias("DATA_PROCESSAMENTO"),
    )
)

df_kpis_serie = df_kpis_serie_municipio.unionByName(df_kpis_serie_estado)

(
    df_kpis_serie.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_SERIE")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Risco agregado (gauge + dimensões)

# COMMAND ----------

df_risco_agregado = (
    df_ref_mes.select(
        "COD_IBGE_COMPLETO",
        "MUNICIPIO",
        F.lit(competencia_referencia).alias("COMPETENCIA_REFERENCIA"),
        F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
        "INDICE_RISCO_REGIONAL",
        faixa_risco_indice(F.col("INDICE_RISCO_REGIONAL")).alias("FAIXA_RISCO"),
        "SCORE_EPIDEMIOLOGICO",
        "SCORE_CAPACIDADE",
        "SCORE_ESTOQUE_CRITICO",
        F.current_timestamp().alias("DATA_PROCESSAMENTO"),
    )
    .unionByName(
        df_ref_estado.select(
            "COD_IBGE_COMPLETO",
            "MUNICIPIO",
            F.lit(competencia_referencia).alias("COMPETENCIA_REFERENCIA"),
            F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
            "INDICE_RISCO_REGIONAL",
            faixa_risco_indice(F.col("INDICE_RISCO_REGIONAL")).alias("FAIXA_RISCO"),
            F.lit(None).cast(DoubleType()).alias("SCORE_EPIDEMIOLOGICO"),
            F.lit(None).cast(DoubleType()).alias("SCORE_CAPACIDADE"),
            F.lit(None).cast(DoubleType()).alias("SCORE_ESTOQUE_CRITICO"),
            F.current_timestamp().alias("DATA_PROCESSAMENTO"),
        )
    )
)

(
    df_risco_agregado.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_RISCO_AGREGADO")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mapa por mesorregião

# COMMAND ----------

df_mapa_mesorregiao = (
    df_ref_mes
    .groupBy("NOME_MESORREGIAO")
    .agg(
        F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS"),
        F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES"),
        F.countDistinct("COD_IBGE_COMPLETO").alias("MUNICIPIOS_MONITORADOS"),
        F.sum("MUNICIPIO_EM_ALERTA_SUPRIMENTO").alias("MUNICIPIOS_ALERTA_SUPRIMENTO"),
        F.avg("INDICE_RISCO_REGIONAL").alias("INDICE_RISCO_REGIONAL"),
    )
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn(
        "FAIXA_RISCO",
        faixa_risco_indice(F.col("INDICE_RISCO_REGIONAL")),
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_mapa_mesorregiao.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_MAPA_MESORREGIAO")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ruptura por categoria

# COMMAND ----------

df_alertas = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_ALERTAS_ATUAIS")

total_itens = df_alertas.count()

df_ruptura_categoria = (
    df_alertas.groupBy("CATEGORIA_INSUMO")
    .agg(
        F.count("*").alias("ITENS_MONITORADOS"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "ALTO", 1).otherwise(0)).alias("ITENS_RISCO_ALTO"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "MODERADO", 1).otherwise(0)).alias("ITENS_RISCO_MODERADO"),
        F.countDistinct("COD_IBGE_COMPLETO").alias("MUNICIPIOS_AFETADOS"),
    )
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn(
        "PCT_DISTRIBUICAO",
        F.round(F.col("ITENS_MONITORADOS") * 100.0 / F.lit(max(total_itens, 1)), 2),
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
    .orderBy(F.desc("ITENS_MONITORADOS"))
)

(
    df_ruptura_categoria.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_RUPTURA_CATEGORIA")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Evolução de casos (histórico + tendência simples)

# COMMAND ----------

def gerar_tendencia_simples(pontos, janela=3):
    """Média móvel centrada — evita distorção da regressão linear em séries sazonais."""
    ys = [float(p["casos"] or 0) for p in pontos]
    if not ys:
        return []
    if len(ys) == 1:
        return ys

    tendencias = []
    for indice in range(len(ys)):
        inicio = max(0, indice - janela + 1)
        fatia = ys[inicio:indice + 1]
        tendencias.append(sum(fatia) / len(fatia))
    return tendencias


def montar_evolucao(df_scores, cod_ibge, municipio):
    historico = (
        df_scores.filter(
            (F.col("COD_IBGE_COMPLETO") == F.lit(cod_ibge))
            & (F.col("COMPETENCIA") >= F.lit(competencia_evolucao_inicio))
            & (F.col("COMPETENCIA") <= F.lit(competencia_referencia))
        )
        .orderBy("COMPETENCIA")
        .collect()
    )

    if not historico:
        return []

    pontos = [
        {"competencia": row["COMPETENCIA"], "casos": row["TOTAL_CASOS_DENGUE"] or 0}
        for row in historico
    ]
    tendencias = gerar_tendencia_simples(pontos)

    linhas = []
    for indice, ponto in enumerate(pontos):
        linhas.append((
            cod_ibge,
            municipio,
            ponto["competencia"],
            ID_AGRAVO,
            int(ponto["casos"]),
            float(round(tendencias[indice], 2)),
            "HISTORICO",
        ))

    ultima_competencia = pontos[-1]["competencia"]
    ultimos_casos = [float(p["casos"] or 0) for p in pontos[-3:]]
    media_recente = sum(ultimos_casos) / len(ultimos_casos)
    inclinacao = (
        (float(pontos[-1]["casos"] or 0) - float(pontos[-2]["casos"] or 0))
        if len(pontos) >= 2
        else 0.0
    )
    valor_proj = media_recente
    comp_proj = ultima_competencia
    for _ in range(MESES_PROJECAO):
        comp_proj = offset_mes(comp_proj, 1)
        valor_proj = max(0.0, valor_proj + inclinacao)
        linhas.append((
            cod_ibge,
            municipio,
            comp_proj,
            ID_AGRAVO,
            None,
            float(round(valor_proj, 2)),
            "PROJECAO",
        ))

    return linhas


linhas_evolucao = montar_evolucao(df_estado_scores, COD_IBGE_ESTADO, "São Paulo (estado)")

municipios_principais = (
    df_ref_mes.orderBy(F.desc("TOTAL_CASOS_DENGUE")).limit(20).collect()
)
for linha in municipios_principais:
    linhas_evolucao.extend(
        montar_evolucao(
            df_municipio_scores,
            linha["COD_IBGE_COMPLETO"],
            linha["MUNICIPIO"],
        )
    )

schema_evolucao = StructType([
    StructField("COD_IBGE_COMPLETO", StringType(), False),
    StructField("MUNICIPIO", StringType(), True),
    StructField("COMPETENCIA", DateType(), False),
    StructField("ID_AGRAVO", StringType(), False),
    StructField("CASOS_NOTIFICADOS", IntegerType(), True),
    StructField("CASOS_TENDENCIA", DoubleType(), False),
    StructField("TIPO_SERIE", StringType(), False),
])

df_evolucao_casos = (
    spark.createDataFrame(linhas_evolucao, schema_evolucao)
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

df_evolucao_casos = (
    df_evolucao_casos
    .withColumn(
        "CASOS_NOTIFICADOS",
        F.col("CASOS_NOTIFICADOS").cast("long")
    )
    .withColumn(
        "CASOS_TENDENCIA",
        F.col("CASOS_TENDENCIA").cast("double")
    )
)

# COMMAND ----------

df_evolucao_casos.printSchema()

# COMMAND ----------

display(df_evolucao_casos.filter(F.col("CASOS_NOTIFICADOS") == 13158))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Alertas recentes unificados

# COMMAND ----------

alertas = []

for indice, row in enumerate(
    df_ref_mes.filter(F.col("RATIO_CASOS_MEDIANA") >= 1.5)
    .orderBy(F.desc("TOTAL_CASOS_DENGUE"))
    .limit(8)
    .collect(),
    start=1,
):
    alertas.append({
        "ORDEM": indice,
        "TIPO_ALERTA": "SURTO",
        "SEVERIDADE": "ALTA",
        "TITULO": f"Possível surto de dengue em {row['MUNICIPIO']}",
        "MENSAGEM": (
            f"Casos {float(row['RATIO_CASOS_MEDIANA']):.0%} acima da mediana "
            f"dos últimos 6 meses."
        ),
        "COD_IBGE_COMPLETO": row["COD_IBGE_COMPLETO"],
        "MUNICIPIO": row["MUNICIPIO"],
        "COMPETENCIA_REFERENCIA": competencia_referencia,
        "ID_AGRAVO": ID_AGRAVO,
        "METRICA_VALOR": float(row["TOTAL_CASOS_DENGUE"] or 0),
    })

for indice, row in enumerate(
    df_alertas.filter(F.col("FAIXA_RISCO_AQUISICAO") == "ALTO")
    .orderBy(F.desc("PONTOS_RISCO_AQUISICAO"))
    .limit(8)
    .collect(),
    start=len(alertas) + 1,
):
    alertas.append({
        "ORDEM": indice,
        "TIPO_ALERTA": "INSUMO",
        "SEVERIDADE": "ALTA",
        "TITULO": f"Insumo crítico — {row['INSUMO_PADRONIZADO']}",
        "MENSAGEM": row["MENSAGEM_ANALITICA"] or "Risco alto de insuficiência de aquisição.",
        "COD_IBGE_COMPLETO": row["COD_IBGE_COMPLETO"],
        "MUNICIPIO": row["MUNICIPIO"],
        "COMPETENCIA_REFERENCIA": competencia_referencia,
        "ID_AGRAVO": ID_AGRAVO,
        "METRICA_VALOR": float(row["PONTOS_RISCO_AQUISICAO"] or 0),
    })

for indice, row in enumerate(
    df_ref_mes.filter(F.col("RATIO_INTERNACOES") >= 1.3)
    .orderBy(F.desc("TOTAL_INTERNACOES_SIH"))
    .limit(8)
    .collect(),
    start=len(alertas) + 1,
):
    alertas.append({
        "ORDEM": indice,
        "TIPO_ALERTA": "PRESSAO_HOSPITALAR",
        "SEVERIDADE": "MEDIA",
        "TITULO": f"Pressão hospitalar elevada em {row['MUNICIPIO']}",
        "MENSAGEM": (
            f"Internações SIH {float(row['RATIO_INTERNACOES']):.0%} acima "
            f"do mês anterior."
        ),
        "COD_IBGE_COMPLETO": row["COD_IBGE_COMPLETO"],
        "MUNICIPIO": row["MUNICIPIO"],
        "COMPETENCIA_REFERENCIA": competencia_referencia,
        "ID_AGRAVO": ID_AGRAVO,
        "METRICA_VALOR": float(row["TOTAL_INTERNACOES_SIH"] or 0),
    })

schema_alertas = StructType([
    StructField("ORDEM", IntegerType(), False),
    StructField("TIPO_ALERTA", StringType(), False),
    StructField("SEVERIDADE", StringType(), False),
    StructField("TITULO", StringType(), False),
    StructField("MENSAGEM", StringType(), True),
    StructField("COD_IBGE_COMPLETO", StringType(), True),
    StructField("MUNICIPIO", StringType(), True),
    StructField("COMPETENCIA_REFERENCIA", DateType(), False),
    StructField("ID_AGRAVO", StringType(), False),
    StructField("METRICA_VALOR", DoubleType(), True),
])

df_alertas_recentes = (
    spark.createDataFrame(alertas, schema_alertas)
    .orderBy("ORDEM")
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_alertas_recentes.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.VISAO_GERAL_ALERTAS_RECENTES")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Publicação Supabase

# COMMAND ----------

from pyspark.sql.functions import col

df_competencia_referencia = spark.table(
    f"{CATALOGO}.gold.RUPTURA_INSUMOS_COMPETENCIA_REFERENCIA"
).select(
    "ID_AGRAVO",
    "NOME_AGRAVO",
    "COMPETENCIA_REFERENCIA",
    "COMPETENCIA_MAXIMA_BASE",
    "MOTIVO_REFERENCIA",
    "DATA_PROCESSAMENTO",
)

COLUNAS_KPIS_PERIODO = [
    "COD_IBGE_COMPLETO",
    "MUNICIPIO",
    "UF",
    "PERIODO",
    "COMPETENCIA_REFERENCIA",
    "PERIODO_INICIO",
    "PERIODO_FIM",
    "PERIODO_INICIO_ANTERIOR",
    "PERIODO_FIM_ANTERIOR",
    "ID_AGRAVO",
    "CASOS_NOTIFICADOS",
    "CASOS_NOTIFICADOS_ANTERIOR",
    "VARIACAO_CASOS_PCT",
    "INDICE_RISCO_REGIONAL",
    "INDICE_RISCO_ANTERIOR",
    "VARIACAO_INDICE_RISCO_PP",
    "MUNICIPIOS_ALERTA_SUPRIMENTO",
    "INTERNACOES_SIH",
    "INTERNACOES_SIH_ANTERIOR",
    "VARIACAO_INTERNACOES_PCT",
    "DATA_PROCESSAMENTO",
]

enviar_para_supabase(
    df_competencia_referencia,
    "visao_geral_competencia_referencia",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_ATUAIS"),
    "visao_geral_kpis_atuais",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_PERIODO").select(*[col for col in COLUNAS_KPIS_PERIODO]).withColumn('ID_AGRAVO', col('ID_AGRAVO').cast('bigint')).withColumn('CASOS_NOTIFICADOS', col('CASOS_NOTIFICADOS').cast('bigint')).withColumn('CASOS_NOTIFICADOS_ANTERIOR', col('CASOS_NOTIFICADOS_ANTERIOR').cast('bigint')),
    "visao_geral_kpis_periodo",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_KPIS_SERIE"),
    "visao_geral_kpis_serie",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_RISCO_AGREGADO"),
    "visao_geral_risco_agregado",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_MAPA_MESORREGIAO"),
    "visao_geral_mapa_mesorregiao",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_RUPTURA_CATEGORIA"),
    "visao_geral_ruptura_categoria",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_EVOLUCAO_CASOS"),
    "visao_geral_evolucao_casos",
)
enviar_para_supabase(
    spark.table(f"{CATALOGO}.gold.VISAO_GERAL_ALERTAS_RECENTES"),
    "visao_geral_alertas_recentes",
)

print("Visão Geral publicada com sucesso.")
