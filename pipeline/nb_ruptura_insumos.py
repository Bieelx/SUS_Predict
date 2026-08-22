# Databricks notebook source
# MAGIC %md
# MAGIC # Base Gold — risco de suprimento para dengue
# MAGIC
# MAGIC A tabela mede risco de insuficiência de aquisição; não mede estoque físico,
# MAGIC consumo real, saldo disponível ou ruptura confirmada.

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window

CATALOGO = "fiap"

df_ibge = spark.table(f"{CATALOGO}.silver.IBGE_SP")
df_cnes = spark.table(f"{CATALOGO}.silver.CNES_AGREGADO")
df_sinan = spark.table(f"{CATALOGO}.silver.SINAN_DENGUE_SP")
df_sih = spark.table(f"{CATALOGO}.silver.SIH_AGREGADO")
df_bps = spark.table(f"{CATALOGO}.silver.BPS_INSUMO_DENGUE_MENSAL")
df_dim_insumo = spark.table(f"{CATALOGO}.silver.DIM_INSUMO_DENGUE")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Padronização da demanda por município e mês

# COMMAND ----------

df_sinan_mensal = (
    df_sinan.alias("s")
    .join(
        df_ibge.alias("i"),
        F.lpad(F.trim(F.col("s.COD_IBGE_MUNICIPIO").cast("string")), 6, "0")
        == F.lpad(F.trim(F.col("i.COD_SUS").cast("string")), 6, "0"),
        "left"
    )
    .groupBy(
        F.col("s.MES_ANO_SINAN").alias("MES_ANO"),
        F.col("i.COD_IBGE_COMPLETO"),
        F.col("i.COD_SUS")
    )
    .agg(
        F.count(F.lit(1)).alias("TOTAL_CASOS_DENGUE"),
        F.sum(F.col("s.FLAG_HOSPITALIZACAO")).alias("TOTAL_HOSPITALIZACOES_SINAN"),
        F.sum(F.col("s.FLAG_OBITO_DENGUE")).alias("TOTAL_OBITOS_DENGUE")
    )
)

df_sih_mensal = (
    df_sih
    .select(
        F.col("MES_ANO_SIH").alias("MES_ANO"),
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        F.col("TOTAL_INTERNACOES").alias("TOTAL_INTERNACOES_SIH"),
        F.col("HOSPITAIS_UTILIZADOS").alias("HOSPITAIS_UTILIZADOS_SIH"),
        F.col("VALOR_TOTAL_GASTO").alias("VALOR_TOTAL_GASTO_SIH"),
        F.col("TOTAL_OBITOS").alias("TOTAL_OBITOS_SIH")
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Malha município × mês × insumo
# MAGIC
# MAGIC A malha preserva meses sem aquisição, que são relevantes para o indicador.

# COMMAND ----------

df_meses_observados = (
    df_sinan_mensal.select("MES_ANO")
    .unionByName(df_sih_mensal.select("MES_ANO"))
    .unionByName(df_bps.select("MES_ANO"))
    .filter(F.col("MES_ANO").isNotNull())
    .distinct()
)

df_meses = (
    df_meses_observados
    .agg(
        F.min(F.to_date(F.concat(F.col("MES_ANO"), F.lit("-01")))).alias("DATA_INICIO"),
        F.max(F.to_date(F.concat(F.col("MES_ANO"), F.lit("-01")))).alias("DATA_FIM")
    )
    .select(
        F.explode(
            F.sequence(
                F.col("DATA_INICIO"),
                F.col("DATA_FIM"),
                F.expr("INTERVAL 1 MONTH")
            )
        ).alias("COMPETENCIA")
    )
    .select(F.date_format("COMPETENCIA", "yyyy-MM").alias("MES_ANO"))
)

df_municipios = df_ibge.select(
    "COD_IBGE_COMPLETO",
    "COD_SUS",
    F.col("NOME_MUNICIPIO").alias("MUNICIPIO"),
    "UF",
    "NOME_MICRORREGIAO",
    "NOME_MESORREGIAO",
    "POPULACAO"
)

df_itens = (
    df_dim_insumo
    .select(
        "CODIGO_BR",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "UNIDADE_FORNECIMENTO",
        "FATOR_PRESSAO_CASO",
        "FATOR_PRESSAO_INTERNACAO"
    )
    .distinct()
)

df_malha = (
    df_municipios.crossJoin(df_meses)
    .crossJoin(df_itens)
)

# COMMAND ----------

df_base = (
    df_malha.alias("m")
    .join(
        df_bps.alias("b"),
        [
            "MES_ANO",
            "COD_IBGE_COMPLETO",
            "COD_SUS",
            "CODIGO_BR",
            "INSUMO_PADRONIZADO",
            "CATEGORIA_INSUMO",
            "UNIDADE_FORNECIMENTO",
            "FATOR_PRESSAO_CASO",
            "FATOR_PRESSAO_INTERNACAO"
        ],
        "left"
    )
    .join(df_sinan_mensal.alias("sin"), ["MES_ANO", "COD_IBGE_COMPLETO", "COD_SUS"], "left")
    .join(df_sih_mensal.alias("sih"), ["MES_ANO", "COD_IBGE_COMPLETO", "COD_SUS"], "left")
    .join(df_cnes.alias("c"), ["COD_IBGE_COMPLETO", "COD_SUS"], "left")
    .select(
        F.to_date(F.concat(F.col("MES_ANO"), F.lit("-01"))).alias("COMPETENCIA"),
        F.year(F.to_date(F.concat(F.col("MES_ANO"), F.lit("-01")))).alias("ANO_REFERENCIA"),
        F.month(F.to_date(F.concat(F.col("MES_ANO"), F.lit("-01")))).alias("MES_REFERENCIA"),
        "MES_ANO",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        F.col("m.MUNICIPIO").alias("MUNICIPIO"),
        F.col("m.UF").alias("UF"),
        F.col("m.NOME_MICRORREGIAO").alias("NOME_MICRORREGIAO"),
        F.col("m.NOME_MESORREGIAO").alias("NOME_MESORREGIAO"),
        F.col("m.POPULACAO").alias("POPULACAO"),
        "CODIGO_BR",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "UNIDADE_FORNECIMENTO",
        "FATOR_PRESSAO_CASO",
        "FATOR_PRESSAO_INTERNACAO",
        F.coalesce(F.col("b.TOTAL_REGISTROS_COMPRA"), F.lit(0)).alias("TOTAL_REGISTROS_COMPRA"),
        F.coalesce(F.col("b.QUANTIDADE_ADQUIRIDA"), F.lit(0.0)).alias("QUANTIDADE_ADQUIRIDA"),
        F.coalesce(F.col("b.VALOR_ADQUIRIDO"), F.lit(0.0)).alias("VALOR_ADQUIRIDO"),
        F.col("b.PRECO_UNITARIO_MEDIO"),
        F.coalesce(F.col("b.TOTAL_FORNECEDORES"), F.lit(0)).alias("TOTAL_FORNECEDORES"),
        F.coalesce(F.col("b.TOTAL_FABRICANTES"), F.lit(0)).alias("TOTAL_FABRICANTES"),
        F.coalesce(F.col("sin.TOTAL_CASOS_DENGUE"), F.lit(0)).alias("TOTAL_CASOS_DENGUE"),
        F.coalesce(F.col("sin.TOTAL_HOSPITALIZACOES_SINAN"), F.lit(0)).alias("TOTAL_HOSPITALIZACOES_SINAN"),
        F.coalesce(F.col("sin.TOTAL_OBITOS_DENGUE"), F.lit(0)).alias("TOTAL_OBITOS_DENGUE"),
        F.coalesce(F.col("sih.TOTAL_INTERNACOES_SIH"), F.lit(0)).alias("TOTAL_INTERNACOES_SIH"),
        F.coalesce(F.col("sih.HOSPITAIS_UTILIZADOS_SIH"), F.lit(0)).alias("HOSPITAIS_UTILIZADOS_SIH"),
        F.coalesce(F.col("sih.VALOR_TOTAL_GASTO_SIH"), F.lit(0.0)).alias("VALOR_TOTAL_GASTO_SIH"),
        F.coalesce(F.col("sih.TOTAL_OBITOS_SIH"), F.lit(0)).alias("TOTAL_OBITOS_SIH"),
        F.col("c.TOTAL_ESTABELECIMENTOS"),
        F.col("c.TOTAL_HOSPITALARES"),
        F.col("c.TOTAL_AMBULATORIAIS"),
        F.col("c.TOTAL_SERVICOS_APOIO")
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Indicadores de pressão e risco de aquisição

# COMMAND ----------

janela_item = (
    Window.partitionBy("COD_IBGE_COMPLETO", "CODIGO_BR", "UNIDADE_FORNECIMENTO")
    .orderBy("COMPETENCIA")
)
janela_3m_anterior = janela_item.rowsBetween(-3, -1)

df_base = (
    df_base
    .withColumn(
        "INCIDENCIA_DENGUE_100K",
        F.round(
            F.when(F.col("POPULACAO") > 0, F.col("TOTAL_CASOS_DENGUE") * 100000 / F.col("POPULACAO")),
            2
        )
    )
    .withColumn(
        "INDICE_PRESSAO_DEMANDA",
        F.round(
            F.col("TOTAL_CASOS_DENGUE") * F.col("FATOR_PRESSAO_CASO")
            + F.col("TOTAL_INTERNACOES_SIH") * F.col("FATOR_PRESSAO_INTERNACAO"),
            2
        )
    )
    .withColumn("CASOS_MES_ANTERIOR", F.lag("TOTAL_CASOS_DENGUE", 1).over(janela_item))
    .withColumn(
        "VARIACAO_CASOS_PCT",
        F.round(
            F.when(
                F.col("CASOS_MES_ANTERIOR") > 0,
                (F.col("TOTAL_CASOS_DENGUE") - F.col("CASOS_MES_ANTERIOR"))
                * 100 / F.col("CASOS_MES_ANTERIOR")
            ),
            2
        )
    )
    .withColumn("QUANTIDADE_ADQUIRIDA_3M", F.sum("QUANTIDADE_ADQUIRIDA").over(janela_3m_anterior))
    .withColumn("VALOR_ADQUIRIDO_3M", F.sum("VALOR_ADQUIRIDO").over(janela_3m_anterior))
    .withColumn(
        "FLAG_SEM_AQUISICAO_3M",
        F.when(
            (F.coalesce(F.col("QUANTIDADE_ADQUIRIDA_3M"), F.lit(0)) == 0)
            & (F.col("INDICE_PRESSAO_DEMANDA") > 0),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "PONTOS_RISCO_AQUISICAO",
        F.when(F.col("FLAG_SEM_AQUISICAO_3M") == 1, F.lit(3)).otherwise(F.lit(0))
        + F.when(F.col("VARIACAO_CASOS_PCT") >= 50, F.lit(2)).otherwise(F.lit(0))
        + F.when(F.col("TOTAL_INTERNACOES_SIH") > 0, F.lit(1)).otherwise(F.lit(0))
        + F.when(
            (F.col("TOTAL_FORNECEDORES") <= 1) & (F.col("QUANTIDADE_ADQUIRIDA") > 0),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "FAIXA_RISCO_AQUISICAO",
        F.when(F.col("PONTOS_RISCO_AQUISICAO") >= 5, "ALTO")
        .when(F.col("PONTOS_RISCO_AQUISICAO") >= 3, "MODERADO")
        .when(F.col("PONTOS_RISCO_AQUISICAO") >= 1, "BAIXO")
        .otherwise("SEM_ALERTA")
    )
    .withColumn(
        "MENSAGEM_ANALITICA",
        F.when(
            F.col("FLAG_SEM_AQUISICAO_3M") == 1,
            F.lit(
                "Sem aquisição registrada nos três meses-calendário anteriores "
                "à competência analisada, com pressão de demanda no mês."
            )
        )
        .when(
            F.col("VARIACAO_CASOS_PCT") >= 50,
            F.lit("Crescimento relevante de casos em relação ao mês anterior.")
        )
        .otherwise(F.lit("Sem sinal crítico segundo as regras configuradas."))
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

# COMMAND ----------

(
    df_base.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
)

print("Tabela fiap.gold.BASE_RUPTURA_INSUMOS criada com sucesso.")

