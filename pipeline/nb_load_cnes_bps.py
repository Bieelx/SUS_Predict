# Databricks notebook source
from pyspark.sql.functions import col, lpad, trim

CATALOGO = "fiap"

# COMMAND ----------

# Bronze CNES
df_cnes = (
    spark.table(f"{CATALOGO}.bronze.CNES_SP")
    .filter(trim(col("CO_UF")) == "35")
)

# Silver IBGE
df_ibge = spark.table(f"{CATALOGO}.silver.IBGE_SP")


# CNES tratado
df_cnes = (
    df_cnes
    .select(
        lpad(trim(col("CO_CNES")), 7, "0").alias("CNES"),
        lpad(trim(col("CO_IBGE")), 6, "0").alias("COD_SUS"),
        col("NO_FANTASIA").alias("NOME_ESTABELECIMENTO"),
        col("NO_RAZAO_SOCIAL").alias("RAZAO_SOCIAL"),
        col("NU_CNPJ").alias("CNPJ"),
        col("NU_CNPJ_MANTENEDORA").alias("CNPJ_MANTENEDORA"),
        col("DS_ESFERA_ADMINISTRATIVA").alias("ESFERA_ADMINISTRATIVA"),
        col("TP_GESTAO").alias("TIPO_GESTAO"),
        col("TP_UNIDADE").alias("TIPO_UNIDADE"),
        col("CO_ATIVIDADE").alias("COD_ATIVIDADE"),
        col("CO_CEP").alias("CEP"),
        col("NO_LOGRADOURO").alias("LOGRADOURO"),
        col("NU_ENDERECO").alias("NUMERO"),
        col("NO_BAIRRO").alias("BAIRRO"),
        col("NU_TELEFONE").alias("TELEFONE"),
        col("NU_LATITUDE").alias("LATITUDE"),
        col("NU_LONGITUDE").alias("LONGITUDE"),
        col("ST_ATEND_HOSPITALAR").alias("ATENDIMENTO_HOSPITALAR"),
        col("ST_ATEND_AMBULATORIAL").alias("ATENDIMENTO_AMBULATORIAL"),
        col("ST_SERVICO_APOIO").alias("SERVICO_APOIO"),
        col("DATA_PROCESSAMENTO")
    )
)


# JOIN

df_silver = (
    df_cnes.alias("c")
    .join(
        df_ibge.alias("i"),
        col("c.COD_SUS") == col("i.COD_SUS"),
        "left"
    )
    .select(
        col("c.CNES").alias("CNES"),
        col("i.COD_IBGE_COMPLETO").alias("COD_IBGE_COMPLETO"),
        col("c.COD_SUS").alias("COD_SUS"),
        col("i.NOME_MUNICIPIO").alias("NOME_MUNICIPIO"),
        col("i.NOME_MICRORREGIAO").alias("NOME_MICRORREGIAO"),
        col("i.NOME_MESORREGIAO").alias("NOME_MESORREGIAO"),
        col("i.POPULACAO").alias("POPULACAO"),
        col("c.NOME_ESTABELECIMENTO").alias("NOME_ESTABELECIMENTO"),
        col("c.RAZAO_SOCIAL").alias("RAZAO_SOCIAL"),
        col("c.CNPJ").alias("CNPJ"),
        col("c.CNPJ_MANTENEDORA").alias("CNPJ_MANTENEDORA"),
        col("c.ESFERA_ADMINISTRATIVA").alias("ESFERA_ADMINISTRATIVA"),
        col("c.TIPO_GESTAO").alias("TIPO_GESTAO"),
        col("c.TIPO_UNIDADE").alias("TIPO_UNIDADE"),
        col("c.COD_ATIVIDADE").alias("COD_ATIVIDADE"),
        col("c.CEP").alias("CEP"),
        col("c.LOGRADOURO").alias("LOGRADOURO"),
        col("c.NUMERO").alias("NUMERO"),
        col("c.BAIRRO").alias("BAIRRO"),
        col("c.TELEFONE").alias("TELEFONE"),
        col("c.LATITUDE").alias("LATITUDE"),
        col("c.LONGITUDE").alias("LONGITUDE"),
        col("c.ATENDIMENTO_HOSPITALAR").alias("ATENDIMENTO_HOSPITALAR"),
        col("c.ATENDIMENTO_AMBULATORIAL").alias("ATENDIMENTO_AMBULATORIAL"),
        col("c.SERVICO_APOIO").alias("SERVICO_APOIO"),
        col("c.DATA_PROCESSAMENTO").alias("DATA_PROCESSAMENTO")
    )
)

display(df_silver)

# COMMAND ----------

(
    df_silver.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.CNES_SP")
)

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT * FROM fiap.silver.CNES_SP

