# Databricks notebook source
# MAGIC %pip install xlrd==2.0.1

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

# MAGIC %md
# MAGIC # **Configurações**

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE CATALOG IF NOT EXISTS fiap

# COMMAND ----------


import os
import gc
import pandas as pd

from pyspark.sql.functions import col, to_date, when, substring, date_format, expr, sum, count

ANO = 2025
MES = list(range(1, 13))
UF = "SP"
CATALOGO = "fiap" 

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.bronze")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.silver")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.gold")

# COMMAND ----------

# MAGIC %md
# MAGIC # **Ingestão IBGE**
# MAGIC

# COMMAND ----------

# MAGIC %md
# MAGIC ## **BRONZE**

# COMMAND ----------

import requests
import pandas as pd
from pyspark.sql.functions import current_timestamp

# via API do IBGE
#  SP 35
url = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/35/municipios"

response = requests.get(url)
if response.status_code == 200:
    data = response.json()
    
    pdf_ibge = pd.json_normalize(data)
    
    #padroniza colunas 
    pdf_ibge.columns = [c.replace(".", "_").upper() for c in pdf_ibge.columns]
    
    #converte para Spark
    df_ibge_bronze = spark.createDataFrame(pdf_ibge.astype(str))
    
    #metadados
    df_ibge_bronze = df_ibge_bronze.withColumn("DATA_INGESTAO", current_timestamp())
    
    #salvando na Bronze
    df_ibge_bronze.write.format("delta").mode("overwrite").saveAsTable(f"{CATALOGO}.bronze.IBGE_SP")
    print(f"Bronze IBGE criada com {df_ibge_bronze.count()} municípios de SP")
else:
    print("Erro ao acessar API do IBGE")

# COMMAND ----------

df_bronze = spark.table(f"{CATALOGO}.bronze.IBGE_SP")

df_pop = spark.table(f"{CATALOGO}.bronze.IBGE_POPULACAO")

# COMMAND ----------

import pandas as pd

arquivo = "/Volumes/fiap/bronze/arquivos_ibge/POP2025_20260113.xls"

pdf = pd.read_excel(
    arquivo,
    sheet_name="Municípios",
    header=1
)

# Remove coluna vazia
pdf = pdf.drop(columns=["Unnamed: 5"], errors="ignore")

# Renomeia colunas
pdf.columns = [
    "UF",
    "COD_UF",
    "COD_MUNIC",
    "NOME_MUNICIPIO",
    "POPULACAO_ESTIMADA"
]

pdf = pdf.dropna(subset=["COD_MUNIC"])

pdf["COD_UF"] = pdf["COD_UF"].astype(int).astype(str).str.zfill(2)
pdf["COD_MUNIC"] = pdf["COD_MUNIC"].astype(int).astype(str).str.zfill(5)

pdf["COD_IBGE_COMPLETO"] = pdf["COD_UF"] + pdf["COD_MUNIC"]
pdf["POPULACAO"] = pdf["POPULACAO_ESTIMADA"].astype(int)
pdf["ANO_REFERENCIA"] = 2025

pdf.head()
df_pop = spark.createDataFrame(pdf)

# COMMAND ----------

from pyspark.sql.functions import current_timestamp

df_pop = df_pop.withColumn(
    "DATA_PROCESSAMENTO",
    current_timestamp()
)

df_pop.write \
    .format("delta") \
    .mode("overwrite") \
    .saveAsTable(f"{CATALOGO}.bronze.IBGE_POPULACAO")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * FROM fiap.bronze.ibge_populacao

# COMMAND ----------

# MAGIC %md
# MAGIC ## **SILVER**

# COMMAND ----------

from pyspark.sql.functions import col, substring

# Bronze da API (SP)
df_ibge = spark.table(f"{CATALOGO}.bronze.IBGE_SP")

# Bronze da população (Brasil)
df_pop = spark.table(f"{CATALOGO}.bronze.IBGE_POPULACAO")

# Join pelo código IBGE
df_ibge_silver = (
    df_ibge.alias("ibge")
    .join(
        df_pop.alias("pop"),
        col("ibge.ID") == col("pop.COD_IBGE_COMPLETO"),
        "left"
    )
    .select(

    
        col("ibge.ID").alias("COD_IBGE_COMPLETO"),
        substring(col("ibge.ID"),1,6).alias("COD_SUS"),
        col("ibge.NOME").alias("NOME_MUNICIPIO"),
        col("ibge.MICRORREGIAO_NOME").alias("NOME_MICRORREGIAO"),
        col("ibge.MICRORREGIAO_MESORREGIAO_NOME").alias("NOME_MESORREGIAO"),

    
        col("pop.POPULACAO"),
        col("pop.ANO_REFERENCIA"),

       
        col("ibge.MICRORREGIAO_MESORREGIAO_UF_SIGLA").alias("UF"),
        col("ibge.MICRORREGIAO_MESORREGIAO_UF_REGIAO_NOME").alias("REGIAO"),

        
        col("ibge.DATA_INGESTAO").alias("DATA_PROCESSAMENTO")
    )
)

# Salva na Silver
(
    df_ibge_silver.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.IBGE_SP")
)

print(f"Silver criada com {df_ibge_silver.count()} municípios.")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compatibilidade para análises populacionais
# MAGIC
# MAGIC Mantém a população de SP em uma tabela própria sem alterar o schema de
# MAGIC `fiap.silver.IBGE_SP`, já consumido pelos demais notebooks.

# COMMAND ----------

df_populacao_sp = (
    df_ibge_silver
    .select(
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "NOME_MUNICIPIO",
        "POPULACAO",
        "ANO_REFERENCIA",
        "UF",
        "DATA_PROCESSAMENTO"
    )
)

(
    df_populacao_sp.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.IBGE_POPULACAO_SP")
)

print("Tabela fiap.silver.IBGE_POPULACAO_SP criada com sucesso.")

