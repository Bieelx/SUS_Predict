# Databricks notebook source
from pyspark.sql.functions import *

df_sih = spark.table("fiap.silver.SIH_SP")

# COMMAND ----------

df_sih_agregado = (

    df_sih
    .groupBy(
        "ANO_INTERNACAO",
        "MES_INTERNACAO",
        "MES_ANO_SIH",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "NOME_MUNICIPIO",
        "NOME_MICRORREGIAO",
        "NOME_MESORREGIAO"
    )
    .agg(
        # Informações do município
        first(
            "POPULACAO",
            ignorenulls=True
        ).alias("POPULACAO"),
        # Internações
        count("*").alias("TOTAL_INTERNACOES"),
        countDistinct("CNES").alias("HOSPITAIS_UTILIZADOS"),
        # Custos
        round(
            sum("VAL_TOT"),
            2
        ).alias("VALOR_TOTAL_GASTO"),
        round(
            avg("VAL_TOT"),
            2
        ).alias("CUSTO_MEDIO_INTERNACAO"),
        # Permanência
        round(
            avg("DIAS_PERM"),
            2
        ).alias("MEDIA_DIAS_PERMANENCIA"),

        sum("DIAS_PERM").alias("TOTAL_DIAS_INTERNACAO"),
        # Mortalidade
        sum("OBITO").alias("TOTAL_OBITOS"),
        round(
            avg("OBITO") * 100,
            2
        ).alias("TAXA_OBITOS_PCT"),
        # Perfil clínico
        countDistinct("DIAG_PRINC").alias("CID_DIFERENTES"),
        countDistinct("FAIXA_ETARIA").alias("FAIXAS_ETARIAS_ATINGIDAS"),
        current_timestamp().alias("DATA_PROCESSAMENTO")

    )

)

# COMMAND ----------

(
    df_sih_agregado
    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("fiap.silver.SIH_AGREGADO")
)

print("Tabela SIH_AGREGADO criada com sucesso!")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT *
# MAGIC FROM fiap.silver.SIH_AGREGADO
# MAGIC ORDER BY
# MAGIC     ANO_INTERNACAO DESC,
# MAGIC     MES_INTERNACAO DESC,
# MAGIC     TOTAL_INTERNACOES DESC
# MAGIC LIMIT 20;

