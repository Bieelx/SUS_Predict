# Databricks notebook source
from pyspark.sql.functions import (
    col,
    count,
    countDistinct,
    sum,
    when,
    first,
    current_timestamp
)

# COMMAND ----------

df_cnes = spark.table("fiap.silver.CNES_SP")

# COMMAND ----------

df_cnes_agregado = (
    df_cnes
    .groupBy(
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "NOME_MUNICIPIO",
        "NOME_MICRORREGIAO",
        "NOME_MESORREGIAO"
    )
    .agg(
        # Dados do município
        first("POPULACAO", ignorenulls=True).alias("POPULACAO"),

        # Estrutura da rede
        countDistinct("CNES").alias("TOTAL_ESTABELECIMENTOS"),
        sum(
            when(col("ATENDIMENTO_HOSPITALAR") == "1.0", 1).otherwise(0)
        ).alias("TOTAL_HOSPITALARES"),
        sum(
            when(col("ATENDIMENTO_AMBULATORIAL") == "1.0", 1).otherwise(0)
        ).alias("TOTAL_AMBULATORIAIS"),
        sum(
            when(col("SERVICO_APOIO") == "1.0", 1).otherwise(0)
        ).alias("TOTAL_SERVICOS_APOIO"),
        # Diversidade da rede
        countDistinct("TIPO_UNIDADE").alias("TIPOS_UNIDADE"),
        countDistinct("COD_ATIVIDADE").alias("ATIVIDADES_DIFERENTES"),
       
        # Cobertura geográfica
        count(
            when(
                col("LATITUDE").isNotNull() &
                col("LONGITUDE").isNotNull(),
                1
            )
        ).alias("ESTABELECIMENTOS_GEOLOCALIZADOS"),
        # Auditoria
        current_timestamp().alias("DATA_PROCESSAMENTO")

    )
)

# COMMAND ----------

display(df_cnes_agregado)

# COMMAND ----------

(
    df_cnes_agregado
    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable("fiap.silver.CNES_AGREGADO")
)

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * from fiap.silver.CNES_AGREGADO;

