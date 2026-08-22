# Databricks notebook source
from pyspark.sql.functions import *

df_bps = spark.table("fiap.silver.BPS")
df_ibge = (
    spark.table("fiap.silver.IBGE_SP")
    .select(
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "NOME_MUNICIPIO",
        "UF"
    )
)

# COMMAND ----------

from pyspark.sql.functions import (
    upper,
    trim,
    regexp_replace
)

def normalizar(coluna):

    coluna = upper(trim(coluna))

    coluna = regexp_replace(coluna, "[ÁÀÃÂÄ]", "A")
    coluna = regexp_replace(coluna, "[ÉÈÊË]", "E")
    coluna = regexp_replace(coluna, "[ÍÌÎÏ]", "I")
    coluna = regexp_replace(coluna, "[ÓÒÕÔÖ]", "O")
    coluna = regexp_replace(coluna, "[ÚÙÛÜ]", "U")
    coluna = regexp_replace(coluna, "Ç", "C")

    coluna = regexp_replace(coluna, "['`]", "")
    coluna = regexp_replace(coluna, "-", " ")
    coluna = regexp_replace(coluna, "\\s+", " ")

    return coluna

# COMMAND ----------

condicao = (

    (normalizar(df_bps["MUNICIPIO_INSTITUICAO"]) ==
     normalizar(df_ibge["NOME_MUNICIPIO"]))

    &

    (df_bps["UF"] == df_ibge["UF"])

)

df_bps = (

    df_bps

    .join(
        df_ibge,
        condicao,
        "left"
    )

    .select(

        df_bps["*"],

        df_ibge["COD_IBGE_COMPLETO"],

        df_ibge["COD_SUS"]

    )

)

# COMMAND ----------

df_bps = (

    df_bps

    .withColumn(
        "MES_REFERENCIA",
        month(col("COMPRA"))
    )

    .withColumn(
        "MES_ANO",
        date_format(col("COMPRA"), "yyyy-MM")
    )

)

# COMMAND ----------

df_bps_agregado = (
    df_bps.groupBy(
        "ANO_REFERENCIA",
        "MES_REFERENCIA",
        "MES_ANO",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO_INSTITUICAO",
        "UF",
        "ESFERA"
    ).agg(

   
        # Compras
        count("*").alias("TOTAL_COMPRAS"),

        # Financeiro
        sum("PRECO_TOTAL").alias("VALOR_TOTAL_COMPRADO"),

        round(
            avg("PRECO_TOTAL"),
            2
        ).alias("VALOR_MEDIO_COMPRA"),

        # Quantidade
        sum("QTD_ITENS_COMPRADOS").alias("QTD_TOTAL_ITENS"),

        # Diversidade
        countDistinct("CODIGO_BR").alias("ITENS_DIFERENTES"),
        countDistinct("FORNECEDOR").alias("TOTAL_FORNECEDORES"),
        countDistinct("FABRICANTE").alias("TOTAL_FABRICANTES"),
        countDistinct("UNIDADE_FORNECIMENTO").alias("TIPOS_UNIDADE_FORNECIMENTO"),


        # Categorias
        sum(
            when(col("TIPO_ITEM") == "Medicamento", 1).otherwise(0)
        ).alias("TOTAL_MEDICAMENTOS"),
        sum(
            when(col("TIPO_ITEM") == "Material Hospitalar", 1).otherwise(0)
        ).alias("TOTAL_MATERIAL_HOSPITALAR"),
        sum(
            when(col("TIPO_ITEM") == "EPI", 1).otherwise(0)
        ).alias("TOTAL_EPI"),
        sum(
            when(col("TIPO_ITEM") == "Laboratório", 1).otherwise(0)
        ).alias("TOTAL_LABORATORIO"),
        sum(
            when(col("TIPO_ITEM") == "Equipamento", 1).otherwise(0)
        ).alias("TOTAL_EQUIPAMENTO"),
        # Modalidade
        sum(
            when(col("MODALIDADE_COMPRA") == "Pregão", 1).otherwise(0)
        ).alias("TOTAL_PREGAO"),
        sum(
            when(col("MODALIDADE_COMPRA") == "Dispensa de Licitação", 1).otherwise(0)
        ).alias("TOTAL_DISPENSA"),
        sum(
            when(col("MODALIDADE_COMPRA") == "Registro de Preços", 1).otherwise(0)
        ).alias("TOTAL_REGISTRO_PRECOS"),
        current_timestamp().alias("DATA_PROCESSAMENTO")
    )

)

# COMMAND ----------

df_bps_agregado = (

    df_bps
    .groupBy(
        "ANO_REFERENCIA",
        "MES_REFERENCIA",
        "MES_ANO",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO_INSTITUICAO",
        "UF",
        "ESFERA"
    ).agg(

        # Compras
        count("*").alias("TOTAL_COMPRAS"),

        # Financeiro
        sum("PRECO_TOTAL").alias("VALOR_TOTAL_COMPRADO"),
        round(
            avg("PRECO_TOTAL"),
            2
        ).alias("VALOR_MEDIO_COMPRA"),


        # Quantidade
        sum("QTD_ITENS_COMPRADOS").alias("QTD_TOTAL_ITENS"),

        # Diversidade
        countDistinct("CODIGO_BR").alias("ITENS_DIFERENTES"),
        countDistinct("FORNECEDOR").alias("TOTAL_FORNECEDORES"),
        countDistinct("FABRICANTE").alias("TOTAL_FABRICANTES"),
        countDistinct("UNIDADE_FORNECIMENTO").alias("TIPOS_UNIDADE_FORNECIMENTO"),

        # Categorias
        sum(
            when(col("TIPO_ITEM") == "Medicamento", 1).otherwise(0)
        ).alias("TOTAL_MEDICAMENTOS"),
        sum(
            when(col("TIPO_ITEM") == "Material Hospitalar", 1).otherwise(0)
        ).alias("TOTAL_MATERIAL_HOSPITALAR"),
        sum(
            when(col("TIPO_ITEM") == "EPI", 1).otherwise(0)
        ).alias("TOTAL_EPI"),
        sum(
            when(col("TIPO_ITEM") == "Laboratório", 1).otherwise(0)
        ).alias("TOTAL_LABORATORIO"),
        sum(
            when(col("TIPO_ITEM") == "Equipamento", 1).otherwise(0)
        ).alias("TOTAL_EQUIPAMENTO"),
        # Modalidade
        sum(
            when(col("MODALIDADE_COMPRA") == "Pregão", 1).otherwise(0)
        ).alias("TOTAL_PREGAO"),
        sum(
            when(col("MODALIDADE_COMPRA") == "Dispensa de Licitação", 1).otherwise(0)
        ).alias("TOTAL_DISPENSA"),
        sum(
            when(col("MODALIDADE_COMPRA") == "Registro de Preços", 1).otherwise(0)
        ).alias("TOTAL_REGISTRO_PRECOS"),
        current_timestamp().alias("DATA_PROCESSAMENTO")
    )

)

# COMMAND ----------

(
    df_bps_agregado
    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("fiap.silver.BPS_AGREGADO")
)

# COMMAND ----------

df_bps.filter(col("COD_IBGE_COMPLETO").isNull()) \
      .select("MUNICIPIO_INSTITUICAO") \
      .distinct() \
      .show(100, False)

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC     MUNICIPIO_INSTITUICAO,
# MAGIC     COUNT(*) AS REGISTROS
# MAGIC FROM fiap.silver.BPS_AGREGADO
# MAGIC GROUP BY MUNICIPIO_INSTITUICAO
# MAGIC ORDER BY REGISTROS DESC;

