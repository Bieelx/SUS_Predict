# Databricks notebook source
from pyspark.sql.functions import *

df_sinan = spark.table("fiap.silver.SINAN_DENGUE_SP")

# COMMAND ----------

df_sinan_agregado = (

    df_sinan

    .groupBy(

        "ANO_NOTIFIC",
        "MES_NOTIFIC",
        "MES_ANO_SINAN",
        "COD_IBGE_MUNICIPIO"

    )

    .agg(

        # ==========================================
        # Casos
        # ==========================================

        count("*").alias("TOTAL_CASOS"),

        # ==========================================
        # Hospitalizações
        # ==========================================

        sum("FLAG_HOSPITALIZACAO").alias("TOTAL_HOSPITALIZACOES"),

        round(
            avg("FLAG_HOSPITALIZACAO") * 100,
            2
        ).alias("TAXA_HOSPITALIZACAO_PCT"),

        # ==========================================
        # Óbitos
        # ==========================================

        sum("FLAG_OBITO_DENGUE").alias("TOTAL_OBITOS_DENGUE"),

        sum("FLAG_OBITO_GERAL").alias("TOTAL_OBITOS_GERAL"),

        round(
            avg("FLAG_OBITO_DENGUE") * 100,
            2
        ).alias("TAXA_OBITO_DENGUE_PCT"),

        # ==========================================
        # Perfil da população
        # ==========================================

        round(
            avg("IDADE_ANOS"),
            1
        ).alias("IDADE_MEDIA"),

        countDistinct("GENERO").alias("GENEROS_PRESENTES"),

        countDistinct("RACA_COR").alias("RACAS_PRESENTES"),

        # ==========================================
        # Qualidade dos dados
        # ==========================================

        sum("FLAG_DATA_INCONSISTENTE").alias("TOTAL_DATAS_INCONSISTENTES"),

        sum("FLAG_DATA_FUTURA").alias("TOTAL_DATAS_FUTURAS"),

        # ==========================================
        # Auditoria
        # ==========================================

        current_timestamp().alias("DATA_PROCESSAMENTO")

    )

)

# COMMAND ----------

(
    df_sinan_agregado
        .write
        .format("delta")
        .mode("overwrite")
        .option("overwriteSchema","true")
        .saveAsTable("fiap.silver.SINAN_AGREGADO")
)

print("✅ Tabela SINAN_AGREGADO criada com sucesso!")

# COMMAND ----------

display(df_sinan_agregado.count())

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * FROM fiap.silver.SINAN_AGREGADO

