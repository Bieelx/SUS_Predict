# Databricks notebook source
# MAGIC %md
# MAGIC # SINAN Dengue — camada Silver
# MAGIC
# MAGIC Padroniza datas, município e indicadores clínicos sem alterar a Bronze.

# COMMAND ----------

from pyspark.sql import functions as F

CATALOGO = "fiap"
TABELA_ORIGEM = f"{CATALOGO}.bronze.SINAN_DENGUE_SP"
TABELA_DESTINO = f"{CATALOGO}.silver.SINAN_DENGUE_SP"

df_bronze = spark.table(TABELA_ORIGEM)
colunas_origem = {coluna.upper(): coluna for coluna in df_bronze.columns}


def coluna_origem(*candidatas, tipo="string"):
    """Retorna a primeira coluna disponível, evitando falha entre layouts anuais."""
    for candidata in candidatas:
        if candidata.upper() in colunas_origem:
            return F.col(colunas_origem[candidata.upper()])
    return F.lit(None).cast(tipo)


def data_origem(*candidatas):
    valor = F.trim(coluna_origem(*candidatas))
    return F.coalesce(
        F.try_to_date(valor, "yyyyMMdd"),
        F.try_to_date(valor, "dd/MM/yyyy"),
        F.try_to_date(valor, "yyyy-MM-dd") # Máscara explícita e segura
    )



# COMMAND ----------

df_sinan = (
    df_bronze
    .withColumn("DATA_NOTIFICACAO", data_origem("DT_NOTIFIC", "DATA_NOTIFICACAO"))
    .withColumn("DATA_SINTOMAS", data_origem("DT_SIN_PRI", "DT_SINTO", "DATA_SINTOMAS"))
    .withColumn(
        "COD_IBGE_MUNICIPIO",
        F.lpad(
            F.regexp_replace(
                F.trim(coluna_origem("ID_MUNICIP", "CO_MUNICIPIO", "COD_MUN_NOT")),
                r"\.0$",
                ""
            ),
            6,
            "0"
        )
    )
    .withColumn("ANO_NOTIFIC", F.year("DATA_NOTIFICACAO"))
    .withColumn("MES_NOTIFIC", F.month("DATA_NOTIFICACAO"))
    .withColumn(
    "MES_ANO_SINAN", 
    F.concat_ws("-", F.year("DATA_NOTIFICACAO"), F.lpad(F.month("DATA_NOTIFICACAO"), 2, "0"))
)

    .withColumn("IDADE_ANOS", coluna_origem("NU_IDADE_N", "IDADE_ANOS", tipo="int").cast("double"))
    .withColumn(
        "GENERO",
        F.when(F.trim(coluna_origem("CS_SEXO", "SEXO")) == "M", "Masculino")
        .when(F.trim(coluna_origem("CS_SEXO", "SEXO")) == "F", "Feminino")
        .otherwise("Ignorado")
    )
    .withColumn("RACA_COR", F.coalesce(F.trim(coluna_origem("CS_RACA", "RACA_COR")), F.lit("Ignorado")))
)

# Os códigos clínicos devem ser validados com o dicionário SINAN da versão carregada.
df_sinan = (
    df_sinan
    .withColumn(
        "FLAG_HOSPITALIZACAO",
        F.when(
            F.upper(F.trim(coluna_origem("HOSPITALIZ", "HOSPITALIZACAO"))).isin("1", "S", "SIM"),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "FLAG_OBITO_DENGUE",
        F.when(
            F.upper(F.trim(coluna_origem("EVOLUCAO", "EVOLUCAO_CASO"))).isin(
                "2", "OBITO PELO AGRAVO", "ÓBITO PELO AGRAVO"
            ),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "FLAG_OBITO_GERAL",
        F.when(
            F.upper(F.trim(coluna_origem("EVOLUCAO", "EVOLUCAO_CASO"))).isin(
                "2", "3", "OBITO PELO AGRAVO", "ÓBITO PELO AGRAVO",
                "OBITO POR OUTRAS CAUSAS", "ÓBITO POR OUTRAS CAUSAS"
            ),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "FLAG_DATA_INCONSISTENTE",
        F.when(
            F.col("DATA_SINTOMAS").isNotNull()
            & F.col("DATA_NOTIFICACAO").isNotNull()
            & (F.col("DATA_SINTOMAS") > F.col("DATA_NOTIFICACAO")),
            F.lit(1)
        ).otherwise(F.lit(0))
    )
    .withColumn(
        "FLAG_DATA_FUTURA",
        F.when(F.col("DATA_NOTIFICACAO") > F.current_date(), F.lit(1)).otherwise(F.lit(0))
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

# Mantém uma linha por notificação quando houver identificador disponível.
chave_notificacao = [
    coluna for coluna in ["NU_NOTIFIC", "ID_NOTIFIC"]
    if coluna in df_sinan.columns
]
if chave_notificacao:
    df_sinan = df_sinan.dropDuplicates(chave_notificacao)

# COMMAND ----------

colunas_final = [
    "ANO_REFERENCIA",
    "DATA_CARGA",
    "DATA_NOTIFICACAO",
    "DATA_SINTOMAS",
    "ANO_NOTIFIC",
    "MES_NOTIFIC",
    "MES_ANO_SINAN",
    "COD_IBGE_MUNICIPIO",
    "IDADE_ANOS",
    "GENERO",
    "RACA_COR",
    "FLAG_HOSPITALIZACAO",
    "FLAG_OBITO_DENGUE",
    "FLAG_OBITO_GERAL",
    "FLAG_DATA_INCONSISTENTE",
    "FLAG_DATA_FUTURA",
    "DATA_PROCESSAMENTO"
]

(
    df_sinan.select(*[coluna for coluna in colunas_final if coluna in df_sinan.columns])
    .write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(TABELA_DESTINO)
)

print(f"Silver SINAN criada com {df_sinan.count():,} notificações.")

