# Databricks notebook source
import os
import gc
import pandas as pd
from pyspark.sql.functions import col, to_date, when, substring, date_format, expr, sum, count

UF = "SP"
CATALOGO = "fiap" 

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.bronze")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.silver")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOGO}.gold")

# COMMAND ----------

# MAGIC %sql
# MAGIC --CREATE VOLUME fiap.bronze.arquivos_bps;

# COMMAND ----------

import gc
import subprocess

from pyspark.sql.functions import (
    col,
    trim,
    lit,
    current_timestamp
)

# CONFIGURAÇÕES

ANOS = [2022, 2023, 2024, 2025]
CATALOGO = "fiap"
TABELA_DESTINO = f"{CATALOGO}.bronze.BPS"
VOLUME_PATH = f"/Volumes/{CATALOGO}/bronze/arquivos_bps"
URL_BASE = "https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/BPS/csv"
print(f"Verificando histórico da tabela {TABELA_DESTINO}")

# VERIFICA ANOS JA PROCESSADOS


try:
    df_existente = spark.table(TABELA_DESTINO)
    anos_processados = set(
        row["ANO_REFERENCIA"]
        for row in df_existente.select("ANO_REFERENCIA").distinct().collect()
    )

except Exception:
    print("Tabela não encontrada. Iniciando carga completa.")
    anos_processados = set()


# PROCESSAMENTO

for ano in ANOS:

    print("\n======================================")
    print(f"Processando {ano}")
    print("======================================")

    if ano in anos_processados:
        print(f"{ano} já carregado.")
        continue
    try:
        url = f"{URL_BASE}/{ano}_csv.zip"
        arquivo_zip = f"{VOLUME_PATH}/{ano}.zip"
        arquivo_csv = f"{VOLUME_PATH}/{ano}.csv"

        
        # DOWNLOAD
        

        print("Baixando")
        result = subprocess.run(
            f"wget -q '{url}' -O '{arquivo_zip}'",
            shell=True,
            capture_output=True
        )

        if result.returncode != 0:
            raise Exception(f"Erro ao baixar {url}")

        # EXTRAÇÃO
        print("Extraindo")
        result = subprocess.run(
            f"unzip -o -q '{arquivo_zip}' -d '{VOLUME_PATH}'",
            shell=True,
            capture_output=True
        )

        if result.returncode != 0:
            raise Exception("Erro ao descompactar o ZIP")

       
        # LEITURA
        print("Lendo CSV")
        df = (
            spark.read
                .format("csv")
                .option("header", "true")
                .option("sep", ";")
                .option("quote", '"')
                .option("escape", '"')
                .option("inferSchema", "true")
                .load(arquivo_csv)
        )

        # PADRONIZA COLUNAS

        df = df.select(
            [
                col(c).alias(c.strip().upper())
                for c in df.columns
            ]
        )

        # FILTRO SP
        df = (
            df.filter(trim(col("UF")) == "SP")
        )
        quantidade = df.count()
        print(f"Registros SP: {quantidade:,}")
        if quantidade == 0:
            print("Ano sem registros")
            continue

    
        # AUDITORIA
        df = (
            df.withColumn("ANO_REFERENCIA", lit(ano))
              .withColumn("ARQUIVO_ORIGEM", lit(f"{ano}.csv"))
              .withColumn("DATA_CARGA", current_timestamp())
        )
        modo = "overwrite" if len(anos_processados) == 0 else "append"
        print(f"Gravando Bronze ({modo})...")
        (
            df.write
                .format("delta")
                .mode(modo)
                .option("mergeSchema", "true")
                .saveAsTable(TABELA_DESTINO)
        )
        anos_processados.add(ano)

        print(f"{ano} carregado com sucesso!")

        
        # LIMPEZA
        try:
            dbutils.fs.rm(f"{VOLUME_PATH}/{ano}.zip", True)
        except:
            pass
        try:
            dbutils.fs.rm(f"{VOLUME_PATH}/{ano}.csv", True)
        except:
            pass

        del df

        gc.collect()

    except Exception as e:

        print(f"ERRO NO ANO {ano}")
        print(e)

print("\n========================================")
print("Carga Bronze do BPS finalizada!")
print("========================================")

# COMMAND ----------

# MAGIC %md
# MAGIC ##SILVER

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

CATALOGO = "fiap"
TABELA_ORIGEM = f"{CATALOGO}.bronze.BPS"
TABELA_DESTINO = f"{CATALOGO}.silver.BPS"

print(f"Lendo {TABELA_ORIGEM}")
df = spark.table(TABELA_ORIGEM)
print(f"Registros Bronze: {df.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Remover duplicados

# COMMAND ----------

df = df.dropDuplicates()

print(f"Após remover duplicados: {df.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Padronização dos textos

# COMMAND ----------

colunas_texto = [
    "NOME_INSTITUICAO",
    "ESFERA",
    "MUNICIPIO_INSTITUICAO",
    "UF",
    "DESCRICAO_CATMAT",
    "UNIDADE_FORNECIMENTO",
    "GENERICO",
    "MODALIDADE_COMPRA",
    "TIPO_COMPRA",
    "FORNECEDOR",
    "FABRICANTE"
]

for coluna in colunas_texto:
    df = df.withColumn(coluna, trim(col(coluna)))

# COMMAND ----------

# MAGIC %md
# MAGIC ### Criando Nome do Item

# COMMAND ----------

df = df.withColumn(
    "NOME_ITEM",
    trim(split(col("DESCRICAO_CATMAT"), ",").getItem(0))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### TIPO_ITEM

# COMMAND ----------

df = df.withColumn(
    "TIPO_ITEM",

    when(upper(col("DESCRICAO_CATMAT")).contains("LUVA"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("SERINGA"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("AGULHA"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("CATETER"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("SONDA"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("GAZE"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("CURATIVO"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("EQUIPO"), "Material Hospitalar")
    .when(upper(col("DESCRICAO_CATMAT")).contains("MÁSCARA"), "EPI")
    .when(upper(col("DESCRICAO_CATMAT")).contains("MASCARA"), "EPI")
    .when(upper(col("DESCRICAO_CATMAT")).contains("REAGENTE"), "Laboratório")
    .when(upper(col("DESCRICAO_CATMAT")).contains("ELETRODO"), "Equipamento")
    .otherwise("Medicamento")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Adicionar data de processamento

# COMMAND ----------

df = df.withColumn(
    "DATA_PROCESSAMENTO",
    current_timestamp()
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Selecionar colunas finais

# COMMAND ----------

df_silver = df.select(
    "ANO_COMPRA",
    "COMPRA",
    "INSERCAO",
    "ANO_REFERENCIA",
    "NOME_INSTITUICAO",
    "ESFERA",
    "MUNICIPIO_INSTITUICAO",
    "UF",
    "CODIGO_BR",
    "NOME_ITEM",
    "DESCRICAO_CATMAT",
    "TIPO_ITEM",
    "UNIDADE_FORNECIMENTO",
    "GENERICO",
    "MODALIDADE_COMPRA",
    "TIPO_COMPRA",
    "FORNECEDOR",
    "FABRICANTE",
    "QTD_ITENS_COMPRADOS",
    "PRECO_UNITARIO",
    "PRECO_TOTAL",
    "DATA_PROCESSAMENTO"
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Gravar Silver

# COMMAND ----------

(
    df_silver.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(TABELA_DESTINO)
)

print("Tabela Silver criada com sucesso!")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * FROM fiap.silver.bps

