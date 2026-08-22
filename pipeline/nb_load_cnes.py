# Databricks notebook source
# MAGIC %md
# MAGIC # Carga Bronze e dimensão de estabelecimentos CNES — SP

# COMMAND ----------

from pyspark.sql.functions import col, current_timestamp, lpad, trim

CATALOGO = "fiap"
ARQUIVO_CNES = "/Volumes/workspace/bronze/arquivos_cnes/cnes_estabelecimentos.csv"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.bronze")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.silver")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze
# MAGIC
# MAGIC O arquivo de origem deve ser disponibilizado no Volume antes da execução.

# COMMAND ----------

df_cnes_origem = (
    spark.read
    .option("header", "true")
    .option("delimiter", ";")
    .option("encoding", "ISO-8859-1")
    .option("quote", '"')
    .csv(ARQUIVO_CNES)
)

df_cnes_bronze = (
    df_cnes_origem
    .filter(trim(col("CO_UF")) == "35")
    .withColumn("DATA_PROCESSAMENTO", current_timestamp())
)

(
    df_cnes_bronze.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.bronze.CNES_SP")
)

print(f"Bronze CNES_SP criada com {df_cnes_bronze.count():,} registros.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dimensão de hospitais

# COMMAND ----------

df_dim_hospitais = (
    df_cnes_bronze
    .select(
        lpad(trim(col("CO_CNES")), 7, "0").alias("CNES"),
        trim(col("NO_FANTASIA")).alias("NOME_HOSPITAL"),
        trim(col("NO_RAZAO_SOCIAL")).alias("RAZAO_SOCIAL"),
        trim(col("CO_UF")).alias("UF"),
        current_timestamp().alias("DATA_REFERENCIA")
    )
    .filter(col("CNES").isNotNull())
    .filter(col("NOME_HOSPITAL").isNotNull())
    .dropDuplicates(["CNES"])
)

(
    df_dim_hospitais.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.DIM_HOSPITAIS")
)

print("Tabela fiap.silver.DIM_HOSPITAIS criada com sucesso.")

