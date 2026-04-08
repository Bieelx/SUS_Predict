"""
╔══════════════════════════════════════════════════════════════╗
║         SUS Predict — Schema de Colunas por Sistema          ║
║         Baseado em: Colunas SUSPredict.xlsx                  ║
║         Projeto SUS Predict — FIAP TCC 2025/2026             ║
╚══════════════════════════════════════════════════════════════╝

Arquitetura Medalhão:
  Bronze → dados brutos do DATASUS, sem transformações
  Silver → colunas selecionadas, tipadas e com valores tratados (este schema)
  Gold   → agregações prontas para dashboards (calculadas em runtime)

Chaves de join entre tabelas (Silver):
  SINAN.ID_MUNICIP  ↔  SIH.MUNIC_RES    (código IBGE 6 dígitos — padrão DATASUS)
  SINAN.ID_MUNICIP  ↔  IBGE.ID[:6]      (remove dígito verificador do código de 7 dígitos)
  SIH.MUNIC_RES     ↔  IBGE.ID[:6]
"""

# ══════════════════════════════════════════════════════════════════════════════
#  SINAN — Mapeamento de campos brutos → colunas Silver
# ══════════════════════════════════════════════════════════════════════════════
# Formato: "campo_bruto_no_pysus": "nome_saida_silver"
# Campos sem renomeação ainda precisam estar aqui para serem selecionados.

SINAN_CAMPO_MAP: dict[str, str] = {
    "ID_MN_RESI":  "ID_MUNICIP",       # chave de join com SIH e IBGE
    "ID_AGRAVO":   "ID_AGRAVO",
    "DT_NOTIFIC":  "DT_NOTIFIC",
    "DT_SIN_PRI":  "DT_SIN_PRI",
    "DATA_INTER":  "DATA_INTERNACAO",  # data de internação (quando ocorreu)
    "DT_OBITO":    "DATA_OBITO",       # data de óbito (quando ocorreu)
    "NU_IDADE_N":  "NU_IDADE_N",       # passa por tratamento de unidade abaixo
    "CS_SEXO":     "CS_SEXO",
    "CS_RACA":     "CS_RACA",
    "CS_ESCOL_N":  "CS_ESCOL_N",
    "CLASSI_FIN":  "CLASSI_FIN",
    "EVOLUCAO":    "RESUL_SORO",       # evolução clínica final
    "HOSPITALIZ":  "HOSPITALIZ",
    "FEBRE":       "FEBRE",
    "VOMITO":      "VOMITO",
    "CEFALEIA":    "CEFALEIA",
    "DIABETES":    "CON_DIABET",
    "HIPERTENSA":  "CON_HIPERT",
    "ALRM_SANG":   "ALAM_SANG",
    "GRAV_INSUF":  "GRAV_INSUF",
}

# Mapeamentos de valores codificados → rótulos legíveis (Silver)
SINAN_VALOR_MAP: dict[str, dict] = {
    "CS_SEXO": {
        "M": "Masculino",
        "F": "Feminino",
    },
    "CS_RACA": {
        "1": "Branca",
        "2": "Preta",
        "3": "Amarela",
        "4": "Parda",
        "5": "Indigena",
        "9": "Sem Informação",
    },
    "CS_ESCOL_N": {
        "0": "Analfabeto",
        "1": "1ª a 4ª série incompleta",
        "2": "4ª série completa",
        "3": "5ª a 8ª série incompleta",
        "4": "Ensino médio incompleto",
        "5": "Ensino médio completo",
        "6": "Superior incompleto",
        "7": "Superior completo",
        "8": "Não se aplica",
        "9": "Ignorado",
    },
    "CLASSI_FIN": {
        "10": "Dengue",
        "11": "Dengue com sinais de alarme",
        "12": "Dengue Grave",
        "8":  "Descartado",
        "9":  "Em Investigação",
        # Legado (versões anteriores ao CID-10 revisado)
        "1":  "Dengue",
        "2":  "Dengue Hemorrágica",
    },
    "RESUL_SORO": {  # campo bruto: EVOLUCAO
        "1": "Cura",
        "2": "Óbito pelo agravo",
        "3": "Óbito por outras causas",
        "9": "Em aberto",
    },
    "HOSPITALIZ": {
        "1": "Sim",
        "2": "Não",
        "9": "Desconhecido",
    },
    # Sintomas e comorbidades: mesma codificação
    "FEBRE":     {"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "VOMITO":    {"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "CEFALEIA":  {"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "CON_DIABET":{"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "CON_HIPERT":{"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "ALAM_SANG": {"1": "Sim", "2": "Não", "9": "Desconhecido"},
    "GRAV_INSUF":{"1": "Sim", "2": "Não", "9": "Desconhecido"},
}


# ══════════════════════════════════════════════════════════════════════════════
#  SIH — Colunas a manter (nomes originais preservados)
# ══════════════════════════════════════════════════════════════════════════════

SIH_COLUNAS: list[str] = [
    "ANO_CMPT",   # ano de competência (referência de pagamento)
    "CAR_INT",    # caráter da internação (01=Eletiva, 02=Urgência)
    "CEP",        # CEP de residência do paciente
    "CGC_HOSP",   # CNPJ do hospital
    "CID_ASSO",   # CID associado ao diagnóstico principal
    "CID_MORTE",  # CID causador do óbito (preenchido quando MORTE=1)
    "CID_NOTIF",  # CID de notificação
    "CNES",       # Cadastro Nacional de Estabelecimentos de Saúde
    "CNPJ_MANT",  # CNPJ da mantenedora (sensível — tratar com cuidado)
    "COD_IDADE",  # unidade de tempo da idade (1=horas, 2=dias, 3=meses, 4=anos)
    "COMPLEX",    # complexidade do procedimento
    "DIAG_PRINC", # diagnóstico principal CID-10 (A90/A920/A928 para dengue)
    "DIAG_SECUN", # diagnóstico secundário CID-10
    "DIAGSEC1",   # diagnóstico secundário 1
    "DIAGSEC2",   # diagnóstico secundário 2
    "DIAS_PERM",  # dias de permanência (string — cast para int antes de análises)
    "DT_INTER",   # data de internação yyyyMMdd (string original)
    "DT_SAIDA",   # data de saída/alta yyyyMMdd
    "ESPEC",      # especialidade do leito
    "ETNIA",      # etnia do paciente (para indígenas)
    "FAEC_TP",    # tipo de FAEC
    "FINANC",     # tipo de financiamento (06=FAEC, 04=MAC)
    "GESTAO",     # tipo de gestão (M=Municipal, E=Estadual)
    "IDADE",      # idade na unidade definida por COD_IDADE
    "MARCA_UTI",  # tipo de UTI (00=Sem UTI, 75=UTI adulto)
    "MES_CMPT",   # mês de competência (01 a 12)
    "MORTE",      # óbito durante internação (0=Não, 1=Sim)
    "MUNIC_MOV",  # município do atendimento
    "MUNIC_RES",  # município de residência — CHAVE DE JOIN com SINAN e IBGE
    "N_AIH",      # número da AIH — chave primária da tabela SIH
    "QT_DIARIAS", # quantidade total de diárias
    "RACA_COR",   # raça/cor (01=Branca, 02=Preta, 03=Parda)
    "SEXO",       # sexo (1=Masculino, 3=Feminino) — codificação diferente do SINAN
    "TPDISEC1",   # tipo do diagnóstico secundário 1
    "TPDISEC2",   # tipo do diagnóstico secundário 2
    "UF_ZI",      # código UF da zona de internação
    "UTI_INT_AL", # dias de UTI intermediária na alta
    "UTI_INT_AN", # dias de UTI intermediária em meses anteriores
    "UTI_INT_IN", # dias de UTI intermediária no início
    "UTI_INT_TO", # total de dias de UTI intermediária
    "UTI_MES_AL", # dias de UTI no mês de alta
    "UTI_MES_AN", # dias de UTI em meses anteriores
    "UTI_MES_IN", # dias de UTI no mês de início
    "UTI_MES_TO", # total de dias de UTI
    "VAL_ORTP",   # valor de órteses/próteses
    "VAL_SH",     # valor dos serviços hospitalares
    "VAL_SP",     # valor dos serviços profissionais
    "VAL_TOT",    # valor total pago pela internação — principal campo financeiro
    "VAL_TRANSP", # valor de transporte
    "VAL_UCI",    # valor de UCI
    "VAL_UTI",    # valor de UTI
]


# ══════════════════════════════════════════════════════════════════════════════
#  IBGE — Colunas a manter (enriquecimento geográfico)
# ══════════════════════════════════════════════════════════════════════════════

IBGE_COLUNAS: list[str] = [
    "id",                             # código IBGE 7 dígitos (com dígito verificador)
    "nome",                           # nome oficial do município
    "microrregiao.nome",              # microrregião geográfica
    "microrregiao.mesorregiao.nome",  # mesorregião geográfica
]

# Coluna derivada para join com DATASUS (remove dígito verificador)
# IBGE_COD_SUS = ibge_df["id"].astype(str).str[:6]  → equivale a SINAN.ID_MUNICIP / SIH.MUNIC_RES


# ══════════════════════════════════════════════════════════════════════════════
#  FUNÇÕES DE PROCESSAMENTO SILVER
# ══════════════════════════════════════════════════════════════════════════════

def processar_sinan(df: "pd.DataFrame") -> "pd.DataFrame":
    """
    Transforma o DataFrame bruto do SINAN (Bronze) em Silver:
      1. Seleciona e renomeia colunas conforme SINAN_CAMPO_MAP
      2. Trata a coluna de idade (NU_IDADE_N): extrai anos, zera outras unidades
      3. Aplica mapeamentos de valores codificados → rótulos legíveis
      4. Garante que ID_MUNICIP tem exatamente 6 dígitos (padrão DATASUS)
    """
    import pandas as pd

    # 1. Seleciona colunas disponíveis (tolerante a campos ausentes na versão do PySUS)
    renomear = {
        raw: out
        for raw, out in SINAN_CAMPO_MAP.items()
        if raw in df.columns
    }
    df = df[list(renomear.keys())].rename(columns=renomear)

    # 2. Tratamento de idade: NU_IDADE_N codifica a unidade no primeiro dígito
    #    4xxx = anos, demais (1=horas, 2=dias, 3=meses) → 0
    if "NU_IDADE_N" in df.columns:
        serie = df["NU_IDADE_N"].astype(str).str.strip()
        mask_anos = serie.str.startswith("4")
        df["NU_IDADE_N"] = pd.to_numeric(
            serie.where(mask_anos, "0").str[1:],  # remove o dígito de unidade
            errors="coerce"
        ).fillna(0).astype(int)

    # 3. Mapeamentos de valores
    for col, mapa in SINAN_VALOR_MAP.items():
        if col in df.columns:
            df[col] = (
                df[col].astype(str).str.strip()
                .map(mapa)
                .fillna("Sem Informação")
            )

    # 4. Normaliza ID_MUNICIP para 6 dígitos (padrão DATASUS para join)
    if "ID_MUNICIP" in df.columns:
        df["ID_MUNICIP"] = df["ID_MUNICIP"].astype(str).str.strip().str[:6]

    return df


def processar_sih(df: "pd.DataFrame") -> "pd.DataFrame":
    """
    Transforma o DataFrame bruto do SIH (Bronze) em Silver:
      1. Seleciona apenas as colunas definidas em SIH_COLUNAS
      2. Converte DIAS_PERM para inteiro (necessário para análises)
      3. Normaliza MUNIC_RES para 6 dígitos (padrão DATASUS para join)
    """
    import pandas as pd

    # 1. Seleciona colunas disponíveis
    colunas_presentes = [c for c in SIH_COLUNAS if c in df.columns]
    df = df[colunas_presentes].copy()

    # 2. DIAS_PERM: string → int
    if "DIAS_PERM" in df.columns:
        df["DIAS_PERM"] = pd.to_numeric(df["DIAS_PERM"], errors="coerce").fillna(0).astype(int)

    # 3. Normaliza MUNIC_RES para 6 dígitos (chave de join)
    if "MUNIC_RES" in df.columns:
        df["MUNIC_RES"] = df["MUNIC_RES"].astype(str).str.strip().str[:6]

    return df


def cruzar_sinan_sih(
    df_sinan: "pd.DataFrame",
    df_sih: "pd.DataFrame",
    tipo: str = "inner",
) -> "pd.DataFrame":
    """
    Realiza o join entre as tabelas Silver de SINAN e SIH pelo município.

    Chave: SINAN.ID_MUNICIP = SIH.MUNIC_RES (código IBGE 6 dígitos)

    Parâmetros:
        tipo: tipo de join pandas ('inner', 'left', 'right', 'outer')
              'left'  → mantém todos os casos de SINAN, mesmo sem internação correspondente
              'inner' → apenas municípios com registros em ambas as bases

    Retorna DataFrame com colunas de ambas as tabelas.
    Sufixos: _sinan / _sih para colunas com nome duplicado.
    """
    return df_sinan.merge(
        df_sih,
        left_on="ID_MUNICIP",
        right_on="MUNIC_RES",
        how=tipo,
        suffixes=("_sinan", "_sih"),
    )
