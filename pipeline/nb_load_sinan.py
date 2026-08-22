# Databricks notebook source
# MAGIC %md
# MAGIC # **Configurações**

# COMMAND ----------

# MAGIC %sql
# MAGIC CREATE CATALOG IF NOT EXISTS fiap

# COMMAND ----------

# MAGIC %sql
# MAGIC
# MAGIC CREATE SCHEMA IF NOT EXISTS fiap.bronze;
# MAGIC
# MAGIC
# MAGIC CREATE VOLUME IF NOT EXISTS fiap.bronze.arquivos_sinan;

# COMMAND ----------

# MAGIC %md
# MAGIC # Ingestão **SINAN**

# COMMAND ----------

import os
import gc
from pyspark.sql.functions import col, trim, lit, current_timestamp
import subprocess

ANOS = [2020,2021, 2022, 2023, 2024, 2025]
UF = "SP"
CATALOGO = "fiap"
TABELA_DESTINO = f"{CATALOGO}.bronze.SINAN_DENGUE_{UF}"
volume_path = f"/Volumes/{CATALOGO}/bronze/arquivos_sinan"

print(f"Verificando histórico {TABELA_DESTINO}")

#procura o que já foi processado
try:
    df_existente = spark.table(TABELA_DESTINO)
    # conjunto com os anos que ja tem na tabela
    anos_processados = set(
        row["ANO_REFERENCIA"] for row in df_existente.select("ANO_REFERENCIA").distinct().collect()
    )
except Exception:
    print("Tabela não encontrada ou vazia. Iniciando carga")
    anos_processados = set()

#criando no temp para nao dar erro
os.makedirs("/tmp/sinan_download/", exist_ok=True)
dbutils.fs.mkdirs(f"dbfs:{volume_path}")

for ano in ANOS:
    print(f"\n Processando {ano}")

    #verifica se o ano ja foi processsado e existe na tabela
    if ano in anos_processados:
        print(f"pulando {ano} - já existem dados")
        continue

    try:
        url = f"https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/SINAN/Dengue/csv/DENGBR{str(ano)[-2:]}.csv.zip"
        
        diretorio_local = f"/tmp/sinan_{ano}/"
        os.makedirs(diretorio_local, exist_ok=True)
        arquivo_zip = os.path.join(diretorio_local, f"dengue_{ano}.zip")

        #download e extracao
        print(f"Baixando dados de {ano}")
        result = subprocess.run(f"wget -q {url} -O {arquivo_zip}", shell=True, capture_output=True)
        if result.returncode != 0:
            raise Exception(f"Falha ao baixar {ano}")

        os.system(f"unzip -o -q {arquivo_zip} -d {diretorio_local}")

        arquivos = os.listdir(diretorio_local)
        arquivo_csv = [f for f in arquivos if f.endswith(".csv")][0]
        caminho_origem = os.path.join(diretorio_local, arquivo_csv)
        caminho_destino = f"{volume_path}/{arquivo_csv}"

        # manda pro volume
        os.system(f"cp {caminho_origem} {caminho_destino}")

        # leitura e tratamento do sep (, ;)
        df_full = spark.read.format("csv").option("header", "true").option("inferSchema", "false").load(caminho_destino)
        
        if len(df_full.columns) < 5:
            df_full = spark.read.format("csv").option("header", "true").option("sep", ";").load(caminho_destino)

        # padroniza colunas
        df_full = df_full.select([col(c).alias(c.strip().upper()) for c in df_full.columns])

        # Filtro de SP 
        target_col = "SG_UF_NOT" if "SG_UF_NOT" in df_full.columns else ("SG_UF" if "SG_UF" in df_full.columns else None)
        
        if not target_col:
            raise Exception("Coluna UF não encontrada")

        df_sp = df_full.filter(
            (trim(col(target_col)) == "35") | (trim(col(target_col)) == "SP")
        ).withColumn("ANO_REFERENCIA", lit(ano)) \
         .withColumn("DATA_CARGA", current_timestamp())

        count_registros = df_sp.count()
        if count_registros == 0:
            print(f"Aviso: {ano} retornou 0 registros de SP")
            continue

        #se anos_processados estiver vazio e for o primeiro ano da lista, faz o overwrite
        #senao faz append
        modo = "overwrite" if len(anos_processados) == 0 else "append"
        
        print(f"Salvando {count_registros} registros em modo {modo}")
        
        df_sp.write.format("delta") \
            .mode(modo) \
            .option("mergeSchema", "true") \
            .saveAsTable(TABELA_DESTINO)

        #atualiza para o próximo loop
        anos_processados.add(ano)
        print(f"Ano {ano} salvo com sucesso")

        #limpeza
        del df_full, df_sp
        gc.collect()

    except Exception as e:
        print(f"ERRO no ano {ano}: {e}")

print("\n OK Ingestão do SINAN finalizada!")

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT
# MAGIC   ANO_REFERENCIA,
# MAGIC   COUNT(*) AS TOTAL_NOTIFICACOES
# MAGIC FROM fiap.bronze.SINAN_DENGUE_SP
# MAGIC GROUP BY ANO_REFERENCIA
# MAGIC ORDER BY ANO_REFERENCIA

