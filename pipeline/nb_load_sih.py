# Databricks notebook source
# MAGIC %md
# MAGIC # **Configurações**

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE CATALOG IF NOT EXISTS fiap

# COMMAND ----------

# MAGIC %pip install --upgrade typing_extensions

# COMMAND ----------

# MAGIC %pip install pysus==0.15.0

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %pip install pysus
# MAGIC
# MAGIC import os
# MAGIC import gc
# MAGIC import pandas as pd
# MAGIC from pysus.online_data import SIH
# MAGIC from pyspark.sql.functions import col, to_date, when, substring, date_format, expr, sum, count
# MAGIC
# MAGIC ANOS = [2020,2021,2022, 2023, 2024, 2025]
# MAGIC MES = list(range(1, 13))
# MAGIC UF = "SP"
# MAGIC CATALOGO = "fiap" 
# MAGIC
# MAGIC spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.bronze")
# MAGIC spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.silver")
# MAGIC spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.gold")

# COMMAND ----------

# MAGIC %md
# MAGIC # **Ingestão SIH**

# COMMAND ----------

# MAGIC %md
# MAGIC ## **BRONZE**

# COMMAND ----------

import time
from pyspark.sql.functions import lit, current_timestamp

ANOS = [2021,2022, 2023, 2024, 2025]
MESES = list(range(1, 13))
UF = "SP"
TABELA = f"{CATALOGO}.bronze.SIH_{UF}"

print(f"Iniciando ingestão para {ANOS}")

#olha o que ja foi carregado
try:
    df_existente = spark.table(TABELA)
    meses_processados = set(
        (row["ANO_REFERENCIA"], row["MES_REFERENCIA"])
        for row in df_existente.select("ANO_REFERENCIA", "MES_REFERENCIA").distinct().collect()
    )
except:
    meses_processados = set()

for ano in ANOS:
    print(f"\n Processando ANO: {ano}")
    
    for mes in MESES:
        if (ano, mes) in meses_processados:
            print(f"Pulando {mes:02d}/{ano} (já existe)")
            continue
        
        try:
            print(f"Baixando {mes:02d}/{ano}...")
            
            dataset_sih = SIH.download(UF, ano, mes, "RD")
            
            if isinstance(dataset_sih, list):
                dataset_sih = dataset_sih[0]
            
            df_sih_pandas = dataset_sih.to_dataframe()
            df_sih_spark_mes = spark.createDataFrame(df_sih_pandas.astype(str))

            df_sih_spark_mes = df_sih_spark_mes \
                .withColumn("MES_REFERENCIA", lit(mes)) \
                .withColumn("ANO_REFERENCIA", lit(ano)) \
                .withColumn("DATA_CARGA", current_timestamp())

            modo_escrita = "overwrite" if not meses_processados else "append"

            df_sih_spark_mes.write.format("delta") \
                .mode(modo_escrita) \
                .option("mergeSchema", "true") \
                .saveAsTable(TABELA)

            print(f" {mes:02d}/{ano} salvo ({len(df_sih_pandas)} registros)")

            #  Atualiza controle
            meses_processados.add((ano, mes))

            del df_sih_pandas, df_sih_spark_mes

            #  pausa leve (evita sobrecarga)
            time.sleep(2)

        except Exception as e:
            print(f"Erro em {mes:02d}/{ano}: {e}")
            time.sleep(5)

print("\n Ingestão finalizada!")

# COMMAND ----------

spark.table("fiap.bronze.SIH_SP").count()

# COMMAND ----------

# MAGIC %md
# MAGIC ## **SILVER**

# COMMAND ----------

from pyspark.sql.functions import (
    col,
    trim,
    when,
    to_date,
    date_format,
    year,
    month
)


# Leitura da Bronze
df_sih = spark.table(f"{CATALOGO}.bronze.SIH_{UF}")
df_ibge = spark.table(f"{CATALOGO}.silver.IBGE_{UF}")


# Limpeza de campos texto

campos_texto = [
    "DIAG_PRINC",
    "DIAG_SECUN",
    "MUNIC_RES",
    "MUNIC_MOV",
    "CNES",
    "SEXO",
    "MORTE",
    "COD_IDADE",
    "IDADE",
    "RACA_COR"
]

for campo in campos_texto:
    df_sih = df_sih.withColumn(campo, trim(col(campo)))

# Filtra apenas internações por Dengue

df_sih = df_sih.filter(
    col("DIAG_PRINC").isin(
        "A90",
        "A920",
        "A928"
    )
)


# Tratamentos
df_sih = (
    df_sih
    # Datas
    .withColumn(
        "DT_INTERNACAO",
        to_date(col("DT_INTER"), "yyyyMMdd")
    )
    .withColumn(
        "DT_ALTA",
        to_date(col("DT_SAIDA"), "yyyyMMdd")
    )
    # Ano/Mês
    .withColumn(
        "ANO_INTERNACAO",
        year(col("DT_INTERNACAO"))
    )
    .withColumn(
        "MES_INTERNACAO",
        month(col("DT_INTERNACAO"))
    )
    .withColumn(
        "MES_ANO_SIH",
        date_format(col("DT_INTERNACAO"), "yyyy-MM")
    )
    # Valores
    .withColumn(
        "VAL_TOT",
        col("VAL_TOT").cast("double")
    )
    # Dias de permanência
    .withColumn(
        "DIAS_PERM",
        col("DIAS_PERM").cast("int")
    )
    # Idade em anos
    .withColumn(
        "IDADE_ANOS",
        when(
            col("COD_IDADE") == "4",
            col("IDADE").cast("int")
        )
    )
    # Indicador de óbito
    .withColumn(
        "OBITO",
        when(col("MORTE") == "1", 1).otherwise(0)
    )
    # Sexo
    .withColumn(
        "SEXO_DESC",
        when(col("SEXO") == "1", "Masculino")
        .when(col("SEXO") == "3", "Feminino")
        .otherwise("Ignorado")
    )
    # Faixa etária
    .withColumn(
        "FAIXA_ETARIA",
        when(col("IDADE_ANOS") <= 9, "0-9 anos")
        .when(col("IDADE_ANOS") <= 19, "10-19 anos")
        .when(col("IDADE_ANOS") <= 39, "20-39 anos")
        .when(col("IDADE_ANOS") <= 59, "40-59 anos")
        .otherwise("60 anos ou mais")
    )
)


# Enriquecimento com IBGE

df_sih = (
    df_sih.alias("s")
    .join(
        df_ibge.alias("i"),
        col("s.MUNIC_MOV") == col("i.COD_SUS"),
        "left"
    )
    .select(
        "s.*",
        col("i.COD_IBGE_COMPLETO"),
        col("i.COD_SUS"),
        col("i.NOME_MUNICIPIO"),
        col("i.NOME_MICRORREGIAO"),
        col("i.NOME_MESORREGIAO"),
        col("i.POPULACAO")
    )
)


# Criação  Silver
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.silver")

(
    df_sih.write
        .format("delta")
        .mode("overwrite")
        .option("overwriteSchema", "true")
        .saveAsTable(f"{CATALOGO}.silver.SIH_{UF}")
)

print(f"Silver criada com {df_sih.count():,} internações.")

# COMMAND ----------

(
    df_sih.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema","true")
    .saveAsTable(f"{CATALOGO}.silver.SIH_{UF}")
)

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * FROM FIAP.SILVER.SIH_SP

