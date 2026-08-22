# Databricks notebook source
# MAGIC %md
# MAGIC # Dimensão de insumos relevantes para dengue
# MAGIC
# MAGIC A seleção abaixo é uma regra analítica inicial. A lista e os fatores devem ser
# MAGIC validados por responsável clínico/farmacêutico antes de uso operacional.

# COMMAND ----------

from pyspark.sql import functions as F

CATALOGO = "fiap"
df_bps = spark.table(f"{CATALOGO}.silver.BPS")

descricao_normalizada = F.upper(
    F.regexp_replace(
        F.translate(
            F.coalesce(F.col("DESCRICAO_CATMAT"), F.col("NOME_ITEM"), F.lit("")),
            "ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ",
            "AAAAAEEEEIIIIOOOOOUUUUC"
        ),
        r"\s+",
        " "
    )
)

df_dim_insumo_dengue = (
    df_bps
    .withColumn("DESCRICAO_NORMALIZADA", descricao_normalizada)
    .withColumn(
        "CATEGORIA_INSUMO",
        F.when(F.col("DESCRICAO_NORMALIZADA").contains("PARACETAMOL"), "ANALGESICO_ANTITERMICO")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("DIPIRONA"), "ANALGESICO_ANTITERMICO")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("CLORETO DE SODIO"), "HIDRATACAO_PARENTERAL")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("SORO FISIOLOGICO"), "HIDRATACAO_PARENTERAL")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("RINGER"), "HIDRATACAO_PARENTERAL")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("SAIS PARA REIDRATACAO"), "HIDRATACAO_ORAL")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("SOLUCAO DE REIDRATACAO ORAL"), "HIDRATACAO_ORAL")
    )
    .filter(F.col("CATEGORIA_INSUMO").isNotNull())
    .withColumn(
        "INSUMO_PADRONIZADO",
        F.when(F.col("DESCRICAO_NORMALIZADA").contains("PARACETAMOL"), "PARACETAMOL")
        .when(F.col("DESCRICAO_NORMALIZADA").contains("DIPIRONA"), "DIPIRONA")
        .when(
            F.col("DESCRICAO_NORMALIZADA").contains("CLORETO DE SODIO")
            | F.col("DESCRICAO_NORMALIZADA").contains("SORO FISIOLOGICO"),
            "CLORETO DE SODIO / SORO FISIOLOGICO"
        )
        .when(F.col("DESCRICAO_NORMALIZADA").contains("RINGER"), "SOLUCAO DE RINGER")
        .otherwise("SAIS / SOLUCAO DE REIDRATACAO ORAL")
    )
    # Índices de pressão, não protocolos de dose ou estimativas de consumo fisico
    .withColumn(
        "FATOR_PRESSAO_CASO",
        F.when(F.col("CATEGORIA_INSUMO") == "HIDRATACAO_PARENTERAL", F.lit(1.5))
        .when(F.col("CATEGORIA_INSUMO") == "HIDRATACAO_ORAL", F.lit(1.2))
        .otherwise(F.lit(1.0))
    )
    .withColumn(
        "FATOR_PRESSAO_INTERNACAO",
        F.when(F.col("CATEGORIA_INSUMO") == "HIDRATACAO_PARENTERAL", F.lit(5.0))
        .when(F.col("CATEGORIA_INSUMO") == "HIDRATACAO_ORAL", F.lit(2.0))
        .otherwise(F.lit(1.5))
    )
    .select(
        F.col("CODIGO_BR").cast("string").alias("CODIGO_BR"),
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        F.upper(F.trim("UNIDADE_FORNECIMENTO")).alias("UNIDADE_FORNECIMENTO"),
        "FATOR_PRESSAO_CASO",
        "FATOR_PRESSAO_INTERNACAO"
    )
    .dropDuplicates(["CODIGO_BR", "UNIDADE_FORNECIMENTO"])
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_dim_insumo_dengue.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.silver.DIM_INSUMO_DENGUE")
)

display(df_dim_insumo_dengue.orderBy("CATEGORIA_INSUMO", "INSUMO_PADRONIZADO"))

# COMMAND ----------

# MAGIC %sql
# MAGIC SELECT INSUMO_PADRONIZADO, CATEGORIA_INSUMO, COUNT(*) AS ITENS
# MAGIC FROM fiap.silver.DIM_INSUMO_DENGUE
# MAGIC GROUP BY 1, 2;

