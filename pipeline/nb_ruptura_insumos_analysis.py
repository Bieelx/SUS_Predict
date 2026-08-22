# Databricks notebook source
# /// script
# [tool.databricks.environment]
# environment_version = "5"
# ///
# MAGIC %md
# MAGIC # Análises para a tela de risco de suprimento
# MAGIC
# MAGIC Define a competência de referência coerente (como SINAN/SIH), gera cards por
# MAGIC período, exporta para o Supabase e não altera notebooks de analysis existentes.

# COMMAND ----------

# MAGIC %pip install --upgrade supabase

# COMMAND ----------

dbutils.library.restartPython()

# COMMAND ----------

import json
import math
from datetime import date, datetime
from decimal import Decimal

import numpy as np
import pandas as pd
from pyspark.sql import functions as F
from pyspark.sql.types import DateType
from supabase import create_client

CATALOGO = "fiap"
ID_AGRAVO = "A90"
NOME_AGRAVO = "Dengue"
RATIO_MINIMO_SINAN = 0.5
MESES_HISTORICO = 6
MESES_JANELA_SERIE = 24

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")

SUPABASE_URL = ""
SUPABASE_KEY = ""
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def valor_json(valor):
    if valor is None or pd.isna(valor):
        return None
    if isinstance(valor, Decimal):
        return float(valor)
    if isinstance(valor, (datetime, date)):
        return valor.isoformat()
    if isinstance(valor, np.integer):
        return int(valor)
    if isinstance(valor, np.floating):
        return None if np.isnan(valor) or np.isinf(valor) else float(valor)
    if isinstance(valor, float):
        return None if math.isnan(valor) or math.isinf(valor) else valor
    return valor


def limpar_supabase_em_lotes(
    nome_tabela,
    coluna_filtro,
    valores_filtro,
    coluna_lote,
    valores_lote,
    tamanho_lote=15,
    log_a_cada=50,
):
    total_operacoes = 0
    valores_lote = [valor for valor in valores_lote if valor is not None]
    valores_filtro = [valor for valor in valores_filtro if valor is not None]
    total_previsto = (
        len(valores_filtro) * ((len(valores_lote) + tamanho_lote - 1) // tamanho_lote)
    )

    for valor_filtro in valores_filtro:
        for inicio in range(0, len(valores_lote), tamanho_lote):
            lote = valores_lote[inicio:inicio + tamanho_lote]
            supabase.table(nome_tabela).delete().eq(
                coluna_filtro, valor_filtro
            ).in_(coluna_lote, lote).execute()
            total_operacoes += 1
            if log_a_cada and total_operacoes % log_a_cada == 0:
                print(
                    f"{nome_tabela}: limpeza {total_operacoes:,}/"
                    f"{total_previsto:,} lotes..."
                )

    return total_operacoes


def enviar_serie_mensal_supabase(tabela_spark, nome_tabela="ruptura_insumos_serie_mensal"):
    df_pandas = tabela_spark.toPandas()

    if df_pandas.empty:
        print(f"{nome_tabela}: sem registros; exportação ignorada.")
        return

    df_pandas.columns = [coluna.lower() for coluna in df_pandas.columns]
    dados = [
        {chave: valor_json(valor) for chave, valor in linha.items()}
        for linha in df_pandas.to_dict("records")
    ]
    json.dumps(dados, allow_nan=False)

    competencias = sorted(
        {
            valor_json(valor)
            for valor in df_pandas["competencia"].tolist()
            if valor_json(valor) is not None
        }
    )
    municipios = sorted(
        {
            valor_json(valor)
            for valor in df_pandas["cod_ibge_completo"].tolist()
            if valor_json(valor) is not None
        }
    )

    print(
        f"{nome_tabela}: limpando {len(competencias)} competências × "
        f"{len(municipios)} municípios em micro-lotes..."
    )
    operacoes = limpar_supabase_em_lotes(
        nome_tabela,
        "competencia",
        competencias,
        "cod_ibge_completo",
        municipios,
        tamanho_lote=10,
    )
    print(f"{nome_tabela}: {operacoes:,} lotes de limpeza concluídos.")

    chunk_size = 500
    total_inserido = 0
    total_lotes = (len(dados) + chunk_size - 1) // chunk_size
    for indice, inicio in enumerate(range(0, len(dados), chunk_size), start=1):
        supabase.table(nome_tabela).insert(
            dados[inicio:inicio + chunk_size]
        ).execute()
        total_inserido += min(chunk_size, len(dados) - inicio)
        if indice % 10 == 0:
            print(
                f"{nome_tabela}: {total_inserido:,}/{len(dados):,} "
                f"registros enviados ({indice}/{total_lotes} lotes)..."
            )

    print(f"{nome_tabela}: {len(dados):,} registros enviados.")


def enviar_para_supabase(
    tabela_spark,
    nome_tabela_supabase,
    truncate=True,
    chunk_size=1000,
    delete_por_coluna=None,
):
    df_pandas = tabela_spark.toPandas()

    if df_pandas.empty:
        print(f"{nome_tabela_supabase}: sem registros; exportação ignorada.")
        return

    df_pandas.columns = [coluna.lower() for coluna in df_pandas.columns]
    dados = [
        {chave: valor_json(valor) for chave, valor in linha.items()}
        for linha in df_pandas.to_dict("records")
    ]
    json.dumps(dados, allow_nan=False)

    if truncate:
        if delete_por_coluna and delete_por_coluna in df_pandas.columns:
            valores = sorted(
                {
                    valor_json(valor)
                    for valor in df_pandas[delete_por_coluna].tolist()
                    if valor_json(valor) is not None
                }
            )
            print(
                f"{nome_tabela_supabase}: removendo {len(valores):,} "
                f"valores distintos de {delete_por_coluna}..."
            )
            for valor in valores:
                supabase.table(nome_tabela_supabase).delete().eq(
                    delete_por_coluna, valor
                ).execute()
        else:
            primeira_coluna = df_pandas.columns[0]
            supabase.table(nome_tabela_supabase).delete().not_.is_(
                primeira_coluna, "null"
            ).execute()

    total_inserido = 0
    total_lotes = (len(dados) + chunk_size - 1) // chunk_size
    for indice, inicio in enumerate(range(0, len(dados), chunk_size), start=1):
        supabase.table(nome_tabela_supabase).insert(
            dados[inicio:inicio + chunk_size]
        ).execute()
        total_inserido += min(chunk_size, len(dados) - inicio)
        if total_lotes > 10 and indice % 10 == 0:
            print(
                f"{nome_tabela_supabase}: {total_inserido:,}/{len(dados):,} "
                f"registros enviados..."
            )

    print(f"{nome_tabela_supabase}: {len(dados):,} registros enviados.")


def mediana(valores):
    if not valores:
        return 0
    ordenados = sorted(valores)
    meio = len(ordenados) // 2
    if len(ordenados) % 2 == 0:
        return (ordenados[meio - 1] + ordenados[meio]) / 2
    return ordenados[meio]


def escolher_competencia_referencia(registros_mensais):
    """Retorna o último mês coerente, descartando competências parciais."""
    if not registros_mensais:
        return None, None, "Sem histórico mensal disponível."

    competencia_maxima = registros_mensais[-1]["competencia"]

    for indice in range(len(registros_mensais) - 1, -1, -1):
        atual = registros_mensais[indice]
        historico = [
            item["vol_sinan"]
            for item in registros_mensais[max(0, indice - MESES_HISTORICO):indice]
            if item["vol_sinan"] > 0
        ]

        if not historico:
            if atual["vol_sinan"] > 0:
                return atual["competencia"], competencia_maxima, "Primeiro mês com casos registrados."
            continue

        if atual["vol_sinan"] >= RATIO_MINIMO_SINAN * mediana(historico):
            motivo = (
                f"SINAN >= {int(RATIO_MINIMO_SINAN * 100)}% da mediana dos "
                f"{len(historico)} meses anteriores."
            )
            return atual["competencia"], competencia_maxima, motivo

    if len(registros_mensais) > 1:
        return (
            registros_mensais[-2]["competencia"],
            competencia_maxima,
            "Último mês descartado por volume SINAN abaixo do limiar; usado mês anterior.",
        )

    return (
        registros_mensais[-1]["competencia"],
        competencia_maxima,
        "Somente um mês disponível na base.",
    )


def offset_mes(data_ref, meses):
    """Calcula add_months via Spark para evitar tipos inválidos no Delta."""
    return (
        spark.sql(
            f"SELECT add_months(to_date('{str(data_ref)[:10]}'), {int(meses)}) AS dt"
        )
        .collect()[0]["dt"]
    )


def obter_metadados_competencia(df_base, persistir=True):
    """
    Calcula ou reutiliza a competência de referência coerente.
    Pode ser chamada em qualquer célula do notebook sem depender de variáveis
    definidas em células anteriores.
    """
    tabela_meta = f"{CATALOGO}.gold.RUPTURA_INSUMOS_COMPETENCIA_REFERENCIA"

    if not persistir:
        pass
    else:
        try:
            linha = spark.table(tabela_meta).first()
            if linha is not None:
                return {
                    "competencia_referencia": linha["COMPETENCIA_REFERENCIA"],
                    "competencia_maxima": linha["COMPETENCIA_MAXIMA_BASE"],
                    "motivo_referencia": linha["MOTIVO_REFERENCIA"],
                    "janela_aquisicao_inicio": linha["JANELA_AQUISICAO_INICIO"],
                    "janela_aquisicao_fim": linha["JANELA_AQUISICAO_FIM"],
                    "df_competencia_referencia": spark.table(tabela_meta),
                }
        except Exception:
            pass

    df_municipio_mes = (
        df_base
        .groupBy("COMPETENCIA", "MES_ANO", "COD_IBGE_COMPLETO")
        .agg(
            F.first("TOTAL_CASOS_DENGUE", ignorenulls=True).alias("TOTAL_CASOS_DENGUE"),
            F.first("TOTAL_INTERNACOES_SIH", ignorenulls=True).alias("TOTAL_INTERNACOES_SIH"),
            F.sum("VALOR_ADQUIRIDO").alias("VALOR_ADQUIRIDO")
        )
    )

    df_volume_estado_mes = (
        df_municipio_mes
        .groupBy("COMPETENCIA", "MES_ANO")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("VOL_SINAN"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("VOL_SIH"),
            F.sum("VALOR_ADQUIRIDO").alias("VOL_BPS")
        )
        .orderBy("COMPETENCIA")
    )

    registros_mensais = [
        {
            "competencia": linha["COMPETENCIA"],
            "mes_ano": linha["MES_ANO"],
            "vol_sinan": linha["VOL_SINAN"] or 0,
            "vol_sih": linha["VOL_SIH"] or 0,
            "vol_bps": linha["VOL_BPS"] or 0,
        }
        for linha in df_volume_estado_mes.collect()
    ]

    competencia_referencia, competencia_maxima, motivo_referencia = escolher_competencia_referencia(
        registros_mensais
    )

    janela_inicio = offset_mes(competencia_referencia, -3)
    janela_fim = offset_mes(competencia_referencia, -1)

    comp_ref_col = F.lit(competencia_referencia)
    df_competencia_referencia = (
        spark.createDataFrame(
            [(
                ID_AGRAVO,
                NOME_AGRAVO,
                competencia_referencia,
                competencia_maxima,
                motivo_referencia,
            )],
            "ID_AGRAVO STRING, NOME_AGRAVO STRING, COMPETENCIA_REFERENCIA DATE, "
            "COMPETENCIA_MAXIMA_BASE DATE, MOTIVO_REFERENCIA STRING",
        )
        .withColumn("JANELA_AQUISICAO_INICIO", F.add_months(comp_ref_col, -3).cast(DateType()))
        .withColumn("JANELA_AQUISICAO_FIM", F.add_months(comp_ref_col, -1).cast(DateType()))
        .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
    )

    if persistir:
        (
            df_competencia_referencia.write
            .format("delta")
            .mode("overwrite")
            .option("overwriteSchema", "true")
            .saveAsTable(tabela_meta)
        )

    return {
        "competencia_referencia": competencia_referencia,
        "competencia_maxima": competencia_maxima,
        "motivo_referencia": motivo_referencia,
        "janela_aquisicao_inicio": janela_inicio,
        "janela_aquisicao_fim": janela_fim,
        "df_competencia_referencia": df_competencia_referencia,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Competência de referência coerente

# COMMAND ----------

meta = obter_metadados_competencia(df_base, persistir=True)
competencia_referencia = meta["competencia_referencia"]
competencia_maxima = meta["competencia_maxima"]
motivo_referencia = meta["motivo_referencia"]
janela_aquisicao_inicio = F.lit(meta["janela_aquisicao_inicio"])
janela_aquisicao_fim = F.lit(meta["janela_aquisicao_fim"])
df_competencia_referencia = meta["df_competencia_referencia"]

print(f"Competência de referência: {competencia_referencia}")
print(f"Competência máxima na base: {competencia_maxima}")
print(f"Janela de aquisição: {meta['janela_aquisicao_inicio']} a {meta['janela_aquisicao_fim']}")
print(f"Motivo: {motivo_referencia}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Alertas na competência de referência

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
meta = obter_metadados_competencia(df_base, persistir=True)
competencia_referencia = meta["competencia_referencia"]
janela_aquisicao_inicio = F.lit(meta["janela_aquisicao_inicio"])
janela_aquisicao_fim = F.lit(meta["janela_aquisicao_fim"])
df_competencia_referencia = meta["df_competencia_referencia"]

df_alertas = (
    df_base
    .filter(F.col("COMPETENCIA") == F.lit(competencia_referencia))
    .filter(F.col("FAIXA_RISCO_AQUISICAO").isin("ALTO", "MODERADO"))
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn("NOME_AGRAVO", F.lit(NOME_AGRAVO))
    .withColumn("JANELA_AQUISICAO_INICIO", janela_aquisicao_inicio)
    .withColumn("JANELA_AQUISICAO_FIM", janela_aquisicao_fim)
    .select(
        "COMPETENCIA_REFERENCIA",
        "COMPETENCIA",
        "ID_AGRAVO",
        "NOME_AGRAVO",
        "JANELA_AQUISICAO_INICIO",
        "JANELA_AQUISICAO_FIM",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "UNIDADE_FORNECIMENTO",
        "FAIXA_RISCO_AQUISICAO",
        "PONTOS_RISCO_AQUISICAO",
        "MENSAGEM_ANALITICA",
        "TOTAL_CASOS_DENGUE",
        "TOTAL_INTERNACOES_SIH",
        "INCIDENCIA_DENGUE_100K",
        "QUANTIDADE_ADQUIRIDA",
        "VALOR_ADQUIRIDO",
        "TOTAL_FORNECEDORES",
        "FLAG_SEM_AQUISICAO_3M",
        "DATA_PROCESSAMENTO"
    )
    .orderBy(F.desc("PONTOS_RISCO_AQUISICAO"), F.desc("TOTAL_CASOS_DENGUE"))
)

(
    df_alertas.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_ALERTAS_ATUAIS")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resumo municipal mensal

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")

df_resumo_municipal = (
    df_base
    .groupBy(
        "COMPETENCIA",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO",
        "UF",
        "NOME_MICRORREGIAO",
        "NOME_MESORREGIAO"
    )
    .agg(
        F.first("POPULACAO", ignorenulls=True).alias("POPULACAO"),
        F.first("TOTAL_CASOS_DENGUE", ignorenulls=True).alias("TOTAL_CASOS_DENGUE"),
        F.first("TOTAL_INTERNACOES_SIH", ignorenulls=True).alias("TOTAL_INTERNACOES_SIH"),
        F.first("INCIDENCIA_DENGUE_100K", ignorenulls=True).alias("INCIDENCIA_DENGUE_100K"),
        F.sum("VALOR_ADQUIRIDO").alias("VALOR_ADQUIRIDO_INSUMOS_DENGUE"),
        F.countDistinct("CODIGO_BR").alias("INSUMOS_MONITORADOS"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "ALTO", 1).otherwise(0)).alias("ITENS_RISCO_ALTO"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "MODERADO", 1).otherwise(0)).alias("ITENS_RISCO_MODERADO"),
        F.max("PONTOS_RISCO_AQUISICAO").alias("MAIOR_PONTUACAO_RISCO")
    )
    .withColumn(
        "FAIXA_RISCO_MUNICIPIO",
        F.when(F.col("ITENS_RISCO_ALTO") > 0, "ALTO")
        .when(F.col("ITENS_RISCO_MODERADO") > 0, "MODERADO")
        .otherwise("SEM_ALERTA")
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_resumo_municipal.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_MUNICIPAL")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## KPIs do mês de referência

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
df_resumo_municipal = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_MUNICIPAL")
meta = obter_metadados_competencia(df_base, persistir=True)
competencia_referencia = meta["competencia_referencia"]
janela_aquisicao_inicio = F.lit(meta["janela_aquisicao_inicio"])
janela_aquisicao_fim = F.lit(meta["janela_aquisicao_fim"])

kpi_sem_aquisicao_3m = (
    df_base
    .filter(F.col("COMPETENCIA") == F.lit(competencia_referencia))
    .agg(F.sum("FLAG_SEM_AQUISICAO_3M").alias("ITENS_SEM_AQUISICAO_3M"))
)

df_kpis_atuais = (
    df_resumo_municipal
    .filter(F.col("COMPETENCIA") == F.lit(competencia_referencia))
    .agg(
        F.countDistinct("COD_IBGE_COMPLETO").alias("MUNICIPIOS_MONITORADOS"),
        F.sum("TOTAL_CASOS_DENGUE").alias("TOTAL_CASOS_DENGUE"),
        F.sum("TOTAL_INTERNACOES_SIH").alias("TOTAL_INTERNACOES_SIH"),
        F.sum("VALOR_ADQUIRIDO_INSUMOS_DENGUE").alias("VALOR_ADQUIRIDO_INSUMOS_DENGUE"),
        F.sum("ITENS_RISCO_ALTO").alias("ITENS_RISCO_ALTO"),
        F.sum("ITENS_RISCO_MODERADO").alias("ITENS_RISCO_MODERADO"),
        F.sum(F.when(F.col("FAIXA_RISCO_MUNICIPIO") == "ALTO", 1).otherwise(0)).alias("MUNICIPIOS_RISCO_ALTO"),
        F.sum(F.when(F.col("FAIXA_RISCO_MUNICIPIO") == "MODERADO", 1).otherwise(0)).alias("MUNICIPIOS_RISCO_MODERADO")
    )
    .crossJoin(kpi_sem_aquisicao_3m)
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("COMPETENCIA", F.lit(competencia_referencia))
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn("NOME_AGRAVO", F.lit(NOME_AGRAVO))
    .withColumn("JANELA_AQUISICAO_INICIO", janela_aquisicao_inicio)
    .withColumn("JANELA_AQUISICAO_FIM", janela_aquisicao_fim)
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_kpis_atuais.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_KPIS_ATUAIS")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resumo por período (Trimestre, Semestre, 12 meses)

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
df_resumo_municipal = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_MUNICIPAL")
meta = obter_metadados_competencia(df_base, persistir=True)
competencia_referencia = meta["competencia_referencia"]

periodos_config = [
    ("Trimestre", 2, 5, 3),
    ("Semestre", 5, 11, 6),
    ("12 Meses", 11, 23, 12),
]

dt_ref = competencia_referencia
linhas_periodo = []

for nome_periodo, meses_atual, meses_anterior_ini, meses_anterior_fim in periodos_config:
    dt_inicio = offset_mes(dt_ref, -meses_atual)
    dt_fim = offset_mes(dt_ref, 0)
    dt_inicio_anterior = offset_mes(dt_ref, -meses_anterior_ini)
    dt_fim_anterior = offset_mes(dt_ref, -meses_anterior_fim)

    df_atual = (
        df_resumo_municipal
        .filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim))
        )
        .groupBy("COD_IBGE_COMPLETO", "COD_SUS", "MUNICIPIO", "UF")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("CASOS_ATUAL"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("INTERNACOES_ATUAL"),
            F.sum("VALOR_ADQUIRIDO_INSUMOS_DENGUE").alias("VALOR_ADQUIRIDO_ATUAL"),
            F.sum("ITENS_RISCO_ALTO").alias("ITENS_RISCO_ALTO_ATUAL"),
            F.sum("ITENS_RISCO_MODERADO").alias("ITENS_RISCO_MODERADO_ATUAL"),
        )
    )

    df_anterior = (
        df_resumo_municipal
        .filter(
            (F.col("COMPETENCIA") >= F.lit(dt_inicio_anterior))
            & (F.col("COMPETENCIA") <= F.lit(dt_fim_anterior))
        )
        .groupBy("COD_IBGE_COMPLETO")
        .agg(
            F.sum("TOTAL_CASOS_DENGUE").alias("CASOS_ANTERIOR"),
            F.sum("TOTAL_INTERNACOES_SIH").alias("INTERNACOES_ANTERIOR"),
            F.sum("VALOR_ADQUIRIDO_INSUMOS_DENGUE").alias("VALOR_ADQUIRIDO_ANTERIOR"),
            F.sum("ITENS_RISCO_ALTO").alias("ITENS_RISCO_ALTO_ANTERIOR"),
        )
    )

    df_periodo = (
        df_atual.alias("a")
        .join(df_anterior.alias("b"), "COD_IBGE_COMPLETO", "left")
        .select(
            F.lit(ID_AGRAVO).alias("ID_AGRAVO"),
            F.lit(NOME_AGRAVO).alias("NOME_AGRAVO"),
            F.lit(nome_periodo).alias("PERIODO"),
            F.lit(dt_ref).alias("COMPETENCIA_REFERENCIA"),
            F.lit(dt_inicio).alias("PERIODO_INICIO"),
            F.lit(dt_fim).alias("PERIODO_FIM"),
            F.lit(dt_inicio_anterior).alias("PERIODO_INICIO_ANTERIOR"),
            F.lit(dt_fim_anterior).alias("PERIODO_FIM_ANTERIOR"),
            "COD_IBGE_COMPLETO",
            "COD_SUS",
            "MUNICIPIO",
            "UF",
            F.coalesce(F.col("a.CASOS_ATUAL"), F.lit(0)).alias("CASOS_ATUAL"),
            F.coalesce(F.col("b.CASOS_ANTERIOR"), F.lit(0)).alias("CASOS_ANTERIOR"),
            F.coalesce(F.col("a.INTERNACOES_ATUAL"), F.lit(0)).alias("INTERNACOES_ATUAL"),
            F.coalesce(F.col("b.INTERNACOES_ANTERIOR"), F.lit(0)).alias("INTERNACOES_ANTERIOR"),
            F.coalesce(F.col("a.VALOR_ADQUIRIDO_ATUAL"), F.lit(0.0)).alias("VALOR_ADQUIRIDO_ATUAL"),
            F.coalesce(F.col("b.VALOR_ADQUIRIDO_ANTERIOR"), F.lit(0.0)).alias("VALOR_ADQUIRIDO_ANTERIOR"),
            F.coalesce(F.col("a.ITENS_RISCO_ALTO_ATUAL"), F.lit(0)).alias("ITENS_RISCO_ALTO_ATUAL"),
            F.coalesce(F.col("b.ITENS_RISCO_ALTO_ANTERIOR"), F.lit(0)).alias("ITENS_RISCO_ALTO_ANTERIOR"),
            F.coalesce(F.col("a.ITENS_RISCO_MODERADO_ATUAL"), F.lit(0)).alias("ITENS_RISCO_MODERADO_ATUAL"),
        )
        .withColumn(
            "VARIACAO_CASOS_PCT",
            F.round(
                F.when(
                    F.col("CASOS_ANTERIOR") > 0,
                    (F.col("CASOS_ATUAL") - F.col("CASOS_ANTERIOR")) * 100 / F.col("CASOS_ANTERIOR")
                ),
                2
            )
        )
        .withColumn(
            "VARIACAO_VALOR_ADQUIRIDO_PCT",
            F.round(
                F.when(
                    F.col("VALOR_ADQUIRIDO_ANTERIOR") > 0,
                    (F.col("VALOR_ADQUIRIDO_ATUAL") - F.col("VALOR_ADQUIRIDO_ANTERIOR"))
                    * 100 / F.col("VALOR_ADQUIRIDO_ANTERIOR")
                ),
                2
            )
        )
        .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
    )

    linhas_periodo.append(df_periodo)

df_resumo_periodo = linhas_periodo[0]
for dataframe in linhas_periodo[1:]:
    df_resumo_periodo = df_resumo_periodo.unionByName(dataframe)

(
    df_resumo_periodo.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_PERIODO")
)

df_kpis_periodo = (
    df_resumo_periodo
    .groupBy(
        "ID_AGRAVO",
        "NOME_AGRAVO",
        "PERIODO",
        "COMPETENCIA_REFERENCIA",
        "PERIODO_INICIO",
        "PERIODO_FIM",
        "PERIODO_INICIO_ANTERIOR",
        "PERIODO_FIM_ANTERIOR"
    )
    .agg(
        F.countDistinct("COD_IBGE_COMPLETO").alias("MUNICIPIOS_MONITORADOS"),
        F.sum("CASOS_ATUAL").alias("TOTAL_CASOS_DENGUE"),
        F.sum("CASOS_ANTERIOR").alias("TOTAL_CASOS_DENGUE_ANTERIOR"),
        F.sum("INTERNACOES_ATUAL").alias("TOTAL_INTERNACOES_SIH"),
        F.sum("VALOR_ADQUIRIDO_ATUAL").alias("VALOR_ADQUIRIDO_INSUMOS_DENGUE"),
        F.sum("VALOR_ADQUIRIDO_ANTERIOR").alias("VALOR_ADQUIRIDO_ANTERIOR"),
        F.sum("ITENS_RISCO_ALTO_ATUAL").alias("ITENS_RISCO_ALTO"),
        F.sum("ITENS_RISCO_MODERADO_ATUAL").alias("ITENS_RISCO_MODERADO"),
        F.sum(F.when(F.col("ITENS_RISCO_ALTO_ATUAL") > 0, 1).otherwise(0)).alias("MUNICIPIOS_RISCO_ALTO"),
    )
    .withColumn(
        "VARIACAO_CASOS_PCT",
        F.round(
            F.when(
                F.col("TOTAL_CASOS_DENGUE_ANTERIOR") > 0,
                (F.col("TOTAL_CASOS_DENGUE") - F.col("TOTAL_CASOS_DENGUE_ANTERIOR"))
                * 100 / F.col("TOTAL_CASOS_DENGUE_ANTERIOR")
            ),
            2
        )
    )
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_kpis_periodo.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_KPIS_PERIODO")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Série mensal e top insumos

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
meta = obter_metadados_competencia(df_base, persistir=True)
competencia_referencia = meta["competencia_referencia"]
janela_aquisicao_inicio = F.lit(meta["janela_aquisicao_inicio"])
janela_aquisicao_fim = F.lit(meta["janela_aquisicao_fim"])
competencia_minima_serie = offset_mes(competencia_referencia, -(MESES_JANELA_SERIE - 1))

df_serie_insumo = (
    df_base
    .filter(F.col("COMPETENCIA") >= F.lit(competencia_minima_serie))
    .groupBy(
        "COMPETENCIA",
        "COD_IBGE_COMPLETO",
        "COD_SUS",
        "MUNICIPIO",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "UNIDADE_FORNECIMENTO"
    )
    .agg(
        F.first("TOTAL_CASOS_DENGUE", ignorenulls=True).alias("TOTAL_CASOS_DENGUE"),
        F.first("TOTAL_INTERNACOES_SIH", ignorenulls=True).alias("TOTAL_INTERNACOES_SIH"),
        F.first("INDICE_PRESSAO_DEMANDA", ignorenulls=True).alias("INDICE_PRESSAO_DEMANDA"),
        F.sum("QUANTIDADE_ADQUIRIDA").alias("QUANTIDADE_ADQUIRIDA"),
        F.sum("VALOR_ADQUIRIDO").alias("VALOR_ADQUIRIDO"),
        F.max("PONTOS_RISCO_AQUISICAO").alias("PONTOS_RISCO_AQUISICAO")
    )
    .withColumn(
        "FAIXA_RISCO_AQUISICAO",
        F.when(F.col("PONTOS_RISCO_AQUISICAO") >= 5, "ALTO")
        .when(F.col("PONTOS_RISCO_AQUISICAO") >= 3, "MODERADO")
        .when(F.col("PONTOS_RISCO_AQUISICAO") >= 1, "BAIXO")
        .otherwise("SEM_ALERTA")
    )
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
)

(
    df_serie_insumo.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_SERIE_MENSAL")
)

print(
    f"Série mensal materializada com janela de {MESES_JANELA_SERIE} meses: "
    f"{df_serie_insumo.count():,} registros."
)

df_top_insumos = (
    df_base
    .filter(F.col("COMPETENCIA") == F.lit(competencia_referencia))
    .groupBy(
        "COMPETENCIA",
        "CODIGO_BR",
        "INSUMO_PADRONIZADO",
        "CATEGORIA_INSUMO",
        "UNIDADE_FORNECIMENTO"
    )
    .agg(
        F.countDistinct("COD_IBGE_COMPLETO").alias("MUNICIPIOS_MONITORADOS"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "ALTO", 1).otherwise(0)).alias("MUNICIPIOS_RISCO_ALTO"),
        F.sum(F.when(F.col("FAIXA_RISCO_AQUISICAO") == "MODERADO", 1).otherwise(0)).alias("MUNICIPIOS_RISCO_MODERADO"),
        F.sum("FLAG_SEM_AQUISICAO_3M").alias("MUNICIPIOS_SEM_AQUISICAO_3M"),
        F.sum("QUANTIDADE_ADQUIRIDA").alias("QUANTIDADE_ADQUIRIDA"),
        F.sum("VALOR_ADQUIRIDO").alias("VALOR_ADQUIRIDO"),
        F.avg("PRECO_UNITARIO_MEDIO").alias("PRECO_UNITARIO_MEDIO"),
        F.max("PONTOS_RISCO_AQUISICAO").alias("MAIOR_PONTUACAO_RISCO")
    )
    .withColumn(
        "FAIXA_RISCO_AQUISICAO",
        F.when(F.col("MAIOR_PONTUACAO_RISCO") >= 5, "ALTO")
        .when(F.col("MAIOR_PONTUACAO_RISCO") >= 3, "MODERADO")
        .when(F.col("MAIOR_PONTUACAO_RISCO") >= 1, "BAIXO")
        .otherwise("SEM_ALERTA")
    )
    .withColumn("COMPETENCIA_REFERENCIA", F.lit(competencia_referencia))
    .withColumn("JANELA_AQUISICAO_INICIO", janela_aquisicao_inicio)
    .withColumn("JANELA_AQUISICAO_FIM", janela_aquisicao_fim)
    .withColumn("ID_AGRAVO", F.lit(ID_AGRAVO))
    .withColumn("DATA_PROCESSAMENTO", F.current_timestamp())
    .orderBy(
        F.desc("MUNICIPIOS_RISCO_ALTO"),
        F.desc("MUNICIPIOS_SEM_AQUISICAO_3M"),
        F.desc("MAIOR_PONTUACAO_RISCO")
    )
)

(
    df_top_insumos.write
    .format("delta")
    .mode("overwrite")
    .option("overwriteSchema", "true")
    .saveAsTable(f"{CATALOGO}.gold.RUPTURA_INSUMOS_TOP_INSUMOS")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Publicação Supabase

# COMMAND ----------

df_base = spark.table(f"{CATALOGO}.gold.BASE_RUPTURA_INSUMOS")
meta = obter_metadados_competencia(df_base, persistir=True)
df_competencia_referencia = meta["df_competencia_referencia"]
df_kpis_atuais = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_KPIS_ATUAIS")
df_kpis_periodo = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_KPIS_PERIODO")
df_alertas = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_ALERTAS_ATUAIS")
df_resumo_municipal = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_MUNICIPAL")
df_resumo_periodo = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_RESUMO_PERIODO")
df_top_insumos = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_TOP_INSUMOS")
df_serie_insumo = spark.table(f"{CATALOGO}.gold.RUPTURA_INSUMOS_SERIE_MENSAL")

enviar_para_supabase(df_competencia_referencia, "ruptura_insumos_competencia_referencia")
enviar_para_supabase(df_kpis_atuais, "ruptura_insumos_kpis_atuais")
enviar_para_supabase(df_kpis_periodo, "ruptura_insumos_kpis_periodo")
enviar_para_supabase(df_alertas, "ruptura_insumos_alertas_atuais")
enviar_para_supabase(df_resumo_municipal, "ruptura_insumos_resumo_municipal")
enviar_para_supabase(df_resumo_periodo, "ruptura_insumos_resumo_periodo")
enviar_para_supabase(df_top_insumos, "ruptura_insumos_top_insumos")
enviar_serie_mensal_supabase(df_serie_insumo)

print("Análises de ruptura publicadas com sucesso.")
