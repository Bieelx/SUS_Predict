# Databricks notebook source
# MAGIC %md
# MAGIC # BPS por insumo relevante para dengue
# MAGIC
# MAGIC Granularidade: município de aquisição × mês × item × unidade de fornecimento.

# COMMAND ----------

from pyspark.sql import functions as F

CATALOGO = "fiap"

df_bps = spark.table(f"{CATALOGO}.silver.BPS")
df_ibge = spark.table(f"{CATALOGO}.silver.IBGE_SP").select(
    "COD_IBGE_COMPLETO", "COD_SUS", "NOME_MUNICIPIO", "UF"
)
df_dim = spark.table(f"{CATALOGO}.silver.DIM_INSUMO_DENGUE")

def normalizar_texto(coluna):
    return F.upper(
        F.regexp_replace(
            F.translate(
                F.trim(coluna),
                "ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ",
                "AAAAAEEEEIIIIOOOOOUUUUC"
            ),
            r"\s+",
            " "
        )
    )


# COMMAND ----------

df_bps_municipio = (
    df_bps.alias("b")
    .join(
        df_ibge.alias("i"),
        (normalizar_texto(F.col("b.MUNICIPIO_INSTITUICAO"))
         == normalizar_texto(F.col("i.NOME_MUNICIPIO")))
        & (F.upper(F.trim(F.col("b.UF"))) == F.upper(F.trim(F.col("i.UF")))),
        "inner"
    )
    .select(
        F.col("b.*"),
        F.col("i.COD_IBGE_COMPLETO"),
        F.col("i.COD_SUS"),
        F.col("i.NOME_MUNICIPIO").alias("MUNICIPIO")
    )
)

df_bps_insumo = (
    df_bps_municipio.alias("b")
    .join(
        df_dim.alias("d"),
        (F.col("b.CODIGO_BR").cast("string") == F.col("d.CODIGO_BR"))
        & (F.upper(F.trim(F.col("b.UNIDADE_FORNECIMENTO"))) == F.col("d.UNIDADE_FORNECIMENTO")),
        "inner"
    )
    .withColumn("DATA_COMPRA", F.to_date(F.col("b.COMPRA")))
    .withColumn("MES_REFERENCIA", F.month("DATA_COMPRA"))
    .withColumn("ANO_REFERENCIA", F.year("DATA_COMPRA"))
    .withColumn("MES_ANO", F.date_format("DATA_COMPRA", "yyyy-MM"))
    .filter(F.col("DATA_COMPRA").isNotNull())
)

# COMMAND ----------

df_bps_insumo_mensal = (
    df_bps_insumo
    .groupBy(
        "ANO_REFERENCIA",
        "MES_REFERENCIA",
        "MES_ANO",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO",
        "UF",
        "b.CODIGO_BR",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "b.UNIDADE_FORNECIMENTO",
        "FATOR_PRESSAO_CASO",
        "FATOR_PRESSAO_INTERNACAO"
    )
    .agg(
        F.count("*").alias("TOTAL_REGISTROS_COMPRA"),
        F.sum(F.col("QTD_ITENS_COMPRADOS").cast("double")).alias("QUANTIDADE_ADQUIRIDA"),
        F.round(F.sum(F.col("PRECO_TOTAL").cast("double")), 2).alias("VALOR_ADQUIRIDO"),
        F.round(F.avg(F.col("PRECO_UNITARIO").cast("double")), 2).alias("PRECO_UNITARIO_MEDIO"),
        F.countDistinct("FORNECEDOR").alias("TOTAL_FORNECEDORES"),
        F.countDistinct("FABRICANTE").alias("TOTAL_FABRICANTES"),
        F.countDistinct("MODALIDADE_COMPRA").alias("TOTAL_MODALIDADES_COMPRA")
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_bps_insumo_mensal.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.BPS_INSUMO_DENGUE_MENSAL")
)

display(df_bps_insumo_mensal.orderBy(F.desc("MES_ANO"), F.desc("VALOR_ADQUIRIDO")))

