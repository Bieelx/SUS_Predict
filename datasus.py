"""
╔══════════════════════════════════════════════════════════╗
║           OpenDataSUS / DATASUS — Extrator CLI           ║
║      Projeto SUS Predict — FIAP TCC 2025/2026            ║
╚══════════════════════════════════════════════════════════╝
pip install pysus pandas openpyxl tqdm
"""

import os
import sys
from datetime import datetime
from pathlib import Path

try:
    import pandas as pd
except ImportError:
    sys.exit("❌  pandas não encontrado. Execute: pip install pandas openpyxl")

try:
    from tqdm import tqdm
except ImportError:
    sys.exit("❌  tqdm não encontrado. Execute: pip install tqdm")

try:
    import pysus  # noqa
except ImportError:
    sys.exit("❌  PySUS não encontrado. Execute: pip install pysus")

from pysus.online_data.SIH import download as sih_download
from pysus.online_data.SIM import download as sim_download
from pysus.online_data.SINASC import download as sinasc_download

try:
    from pysus.online_data.SINAN import download as sinan_download
    SINAN_OK = True
except ImportError:
    SINAN_OK = False

try:
    from pysus.online_data.CNES import download as cnes_download
    CNES_OK = True
except ImportError:
    CNES_OK = False

# ── Redireciona cache do PySUS para a pasta do próprio projeto ───────────────
_CACHE_DIR = Path(__file__).parent / ".pysus_cache"
_CACHE_DIR.mkdir(exist_ok=True)
os.environ["PYSUS_CACHEPATH"] = str(_CACHE_DIR)


# ══════════════════════════════════════════════════════════════════════════════
#  DADOS GEOGRÁFICOS  (estados e cidades com código IBGE)
# ══════════════════════════════════════════════════════════════════════════════

ESTADOS = [
    ("SP", "São Paulo"),
    ("RJ", "Rio de Janeiro"),
    ("MG", "Minas Gerais"),
    ("RS", "Rio Grande do Sul"),
    ("PR", "Paraná"),
    ("BA", "Bahia"),
    ("CE", "Ceará"),
    ("PE", "Pernambuco"),
    ("GO", "Goiás"),
    ("AM", "Amazonas"),
    ("SC", "Santa Catarina"),
    ("PA", "Pará"),
    ("MA", "Maranhão"),
    ("MT", "Mato Grosso"),
    ("MS", "Mato Grosso do Sul"),
    ("PB", "Paraíba"),
    ("RN", "Rio Grande do Norte"),
    ("PI", "Piauí"),
    ("AL", "Alagoas"),
    ("SE", "Sergipe"),
    ("RO", "Rondônia"),
    ("TO", "Tocantins"),
    ("AC", "Acre"),
    ("AP", "Amapá"),
    ("RR", "Roraima"),
    ("DF", "Distrito Federal"),
    ("ES", "Espírito Santo"),
]

# (nome_cidade, código_IBGE_7_dígitos)
CIDADES = {
    "SP": [
        ("São Paulo",             "3550308"),
        ("Campinas",              "3509502"),
        ("Guarulhos",             "3518800"),
        ("Santo André",           "3547809"),
        ("São Bernardo do Campo", "3548708"),
        ("Osasco",                "3534401"),
        ("Ribeirão Preto",        "3543402"),
        ("Sorocaba",              "3552205"),
        ("São José dos Campos",   "3549904"),
        ("Santos",                "3548100"),
        ("Barueri",               "3505708"),
        ("Cotia",                 "3513009"),
        ("Mogi das Cruzes",       "3530607"),
        ("Diadema",               "3513801"),
        ("Mauá",                  "3529401"),
    ],
    "RJ": [
        ("Rio de Janeiro",        "3304557"),
        ("Niterói",               "3303302"),
        ("Nova Iguaçu",           "3303500"),
        ("Duque de Caxias",       "3301702"),
        ("São Gonçalo",           "3304904"),
        ("Belford Roxo",          "3300456"),
        ("Petrópolis",            "3303906"),
        ("Volta Redonda",         "3306701"),
        ("Campos dos Goytacazes", "3301009"),
        ("Macaé",                 "3302403"),
    ],
    "MG": [
        ("Belo Horizonte",        "3106200"),
        ("Uberlândia",            "3170206"),
        ("Contagem",              "3118601"),
        ("Juiz de Fora",          "3136702"),
        ("Betim",                 "3106705"),
        ("Montes Claros",         "3143302"),
        ("Ribeirão das Neves",    "3154606"),
        ("Uberaba",               "3170107"),
        ("Governador Valadares",  "3127701"),
        ("Ipatinga",              "3131307"),
    ],
    "RS": [
        ("Porto Alegre",          "4314902"),
        ("Caxias do Sul",         "4305108"),
        ("Pelotas",               "4314407"),
        ("Canoas",                "4304606"),
        ("Santa Maria",           "4316907"),
        ("Gravataí",              "4309209"),
        ("Viamão",                "4323002"),
        ("Novo Hamburgo",         "4313409"),
        ("São Leopoldo",          "4318705"),
        ("Rio Grande",            "4315602"),
    ],
    "PR": [
        ("Curitiba",              "4106902"),
        ("Londrina",              "4113700"),
        ("Maringá",               "4115200"),
        ("Ponta Grossa",          "4119905"),
        ("Cascavel",              "4104808"),
        ("São José dos Pinhais",  "4125506"),
        ("Foz do Iguaçu",         "4108304"),
        ("Colombo",               "4105805"),
        ("Guarapuava",            "4109401"),
        ("Paranaguá",             "4118204"),
    ],
    "BA": [
        ("Salvador",              "2927408"),
        ("Feira de Santana",      "2910800"),
        ("Vitória da Conquista",  "2933307"),
        ("Camaçari",              "2905701"),
        ("Juazeiro",              "2918407"),
        ("Itabuna",               "2914802"),
        ("Lauro de Freitas",      "2919207"),
        ("Ilhéus",                "2913606"),
        ("Jequié",                "2918001"),
        ("Teixeira de Freitas",   "2931350"),
    ],
    "CE": [
        ("Fortaleza",             "2304400"),
        ("Caucaia",               "2303709"),
        ("Juazeiro do Norte",     "2307304"),
        ("Maracanaú",             "2307650"),
        ("Sobral",                "2312908"),
        ("Crato",                 "2304202"),
        ("Itapipoca",             "2306405"),
        ("Maranguape",            "2307809"),
        ("Iguatu",                "2305506"),
        ("Quixadá",               "2311405"),
    ],
    "PE": [
        ("Recife",                "2611606"),
        ("Caruaru",               "2604106"),
        ("Olinda",                "2609600"),
        ("Petrolina",             "2611101"),
        ("Paulista",              "2610707"),
        ("Garanhuns",             "2606002"),
        ("Vitória de Santo Antão","2616407"),
        ("Cabo de Santo Agostinho","2602902"),
        ("Camaragibe",            "2603454"),
        ("Jaboatão dos Guararapes","2607901"),
    ],
    "GO": [
        ("Goiânia",               "5208707"),
        ("Aparecida de Goiânia",  "5201405"),
        ("Anápolis",              "5201108"),
        ("Rio Verde",             "5218805"),
        ("Luziânia",              "5212501"),
        ("Águas Lindas de Goiás", "5200258"),
        ("Valparaíso de Goiás",   "5221858"),
        ("Trindade",              "5221403"),
        ("Formosa",               "5208004"),
        ("Novo Gama",             "5214879"),
    ],
    "AM": [
        ("Manaus",                "1302603"),
        ("Parintins",             "1303403"),
        ("Itacoatiara",           "1301902"),
        ("Manacapuru",            "1302504"),
        ("Coari",                 "1301209"),
        ("Tefé",                  "1304203"),
        ("Tabatinga",             "1304062"),
        ("Maués",                 "1302900"),
        ("Humaitá",               "1301704"),
        ("Manicoré",              "1302702"),
    ],
    "SC": [
        ("Florianópolis",         "4205407"),
        ("Joinville",             "4209102"),
        ("Blumenau",              "4202404"),
        ("São José",              "4216602"),
        ("Criciúma",              "4204608"),
        ("Chapecó",               "4204202"),
        ("Itajaí",                "4207304"),
        ("Jaraguá do Sul",        "4208203"),
        ("Palhoça",               "4211900"),
        ("Balneário Camboriú",    "4202008"),
    ],
    "PA": [
        ("Belém",                 "1501402"),
        ("Ananindeua",            "1500800"),
        ("Santarém",              "1506807"),
        ("Marabá",                "1504208"),
        ("Castanhal",             "1502400"),
        ("Parauapebas",           "1505536"),
        ("Abaetetuba",            "1500107"),
        ("Cametá",                "1502103"),
        ("Altamira",              "1500602"),
        ("Tucuruí",               "1508100"),
    ],
    "MA": [
        ("São Luís",              "2111300"),
        ("Imperatriz",            "2105302"),
        ("São José de Ribamar",   "2111250"),
        ("Timon",                 "2112209"),
        ("Caxias",                "2103000"),
        ("Codó",                  "2103307"),
        ("Açailândia",            "2100055"),
        ("Bacabal",               "2101202"),
        ("Balsas",                "2101400"),
        ("Paço do Lumiar",        "2107209"),
    ],
    "MT": [
        ("Cuiabá",                "5103403"),
        ("Várzea Grande",         "5108402"),
        ("Rondonópolis",          "5107602"),
        ("Sinop",                 "5107909"),
        ("Tangará da Serra",      "5107958"),
        ("Cáceres",               "5102504"),
        ("Sorriso",               "5107925"),
        ("Lucas do Rio Verde",    "5105622"),
        ("Primavera do Leste",    "5107040"),
        ("Alta Floresta",         "5100250"),
    ],
    "MS": [
        ("Campo Grande",          "5002704"),
        ("Dourados",              "5003702"),
        ("Três Lagoas",           "5008305"),
        ("Corumbá",               "5003207"),
        ("Ponta Porã",            "5006606"),
        ("Naviraí",               "5005904"),
        ("Nova Andradina",        "5006200"),
        ("Aquidauana",            "5001102"),
        ("Sidrolândia",           "5007901"),
        ("Paranaíba",             "5006002"),
    ],
    "PB": [
        ("João Pessoa",           "2507507"),
        ("Campina Grande",        "2504009"),
        ("Santa Rita",            "2513703"),
        ("Patos",                 "2510808"),
        ("Bayeux",                "2502003"),
        ("Sousa",                 "2516201"),
        ("Cajazeiras",            "2503704"),
        ("Cabedelo",              "2503209"),
        ("Guarabira",             "2506301"),
        ("Sapé",                  "2515302"),
    ],
    "RN": [
        ("Natal",                 "2408102"),
        ("Mossoró",               "2408003"),
        ("Parnamirim",            "2403251"),
        ("São Gonçalo do Amarante","2412005"),
        ("Macaíba",               "2407104"),
        ("Ceará-Mirim",           "2402600"),
        ("Caicó",                 "2402006"),
        ("Açu",                   "2400208"),
        ("Currais Novos",         "2403301"),
        ("São José de Mipibú",    "2411502"),
    ],
    "PI": [
        ("Teresina",              "2211001"),
        ("Parnaíba",              "2207702"),
        ("Picos",                 "2208007"),
        ("Piripiri",              "2208403"),
        ("Floriano",              "2203909"),
        ("Campo Maior",           "2202010"),
        ("Barras",                "2201200"),
        ("União",                 "2211100"),
        ("Oeiras",                "2207009"),
        ("José de Freitas",       "2205508"),
    ],
    "AL": [
        ("Maceió",                "2704302"),
        ("Arapiraca",             "2700300"),
        ("Rio Largo",             "2707701"),
        ("Palmeira dos Índios",   "2706303"),
        ("União dos Palmares",    "2709301"),
        ("Penedo",                "2706703"),
        ("São Miguel dos Campos", "2708600"),
        ("Delmiro Gouveia",       "2702405"),
        ("Coruripe",              "2702306"),
        ("Marechal Deodoro",      "2704708"),
    ],
    "SE": [
        ("Aracaju",               "2800308"),
        ("Nossa Senhora do Socorro","2804805"),
        ("Lagarto",               "2803500"),
        ("Itabaiana",             "2803000"),
        ("São Cristóvão",         "2806701"),
        ("Estância",              "2802700"),
        ("Tobias Barreto",        "2807501"),
        ("Simão Dias",            "2807105"),
        ("Propriá",               "2805406"),
        ("Itaporanga d'Ajuda",    "2803203"),
    ],
    "RO": [
        ("Porto Velho",           "1100205"),
        ("Ji-Paraná",             "1100122"),
        ("Ariquemes",             "1100023"),
        ("Vilhena",               "1100304"),
        ("Cacoal",                "1100049"),
        ("Rolim de Moura",        "1100288"),
        ("Guajará-Mirim",         "1100106"),
        ("Jaru",                  "1100114"),
        ("Ouro Preto do Oeste",   "1100155"),
        ("Espigão d'Oeste",       "1100098"),
    ],
    "TO": [
        ("Palmas",                "1721000"),
        ("Araguaína",             "1702109"),
        ("Gurupi",                "1709500"),
        ("Porto Nacional",        "1718204"),
        ("Paraíso do Tocantins",  "1716109"),
        ("Colinas do Tocantins",  "1706506"),
        ("Guaraí",                "1709302"),
        ("Tocantinópolis",        "1721109"),
        ("Miracema do Tocantins", "1713205"),
        ("Dianópolis",            "1707009"),
    ],
    "AC": [
        ("Rio Branco",            "1200401"),
        ("Cruzeiro do Sul",       "1200203"),
        ("Sena Madureira",        "1200500"),
        ("Tarauacá",              "1200609"),
        ("Feijó",                 "1200302"),
        ("Brasileia",             "1200104"),
        ("Epitaciolândia",        "1200252"),
        ("Xapuri",                "1200708"),
        ("Plácido de Castro",     "1200385"),
        ("Mâncio Lima",           "1200336"),
    ],
    "AP": [
        ("Macapá",                "1600303"),
        ("Santana",               "1600600"),
        ("Laranjal do Jari",      "1600279"),
        ("Oiapoque",              "1600501"),
        ("Mazagão",               "1600402"),
        ("Porto Grande",          "1600535"),
        ("Tartarugalzinho",       "1600709"),
        ("Pedra Branca do Amapari","1600253"),
        ("Calçoene",              "1600204"),
        ("Vitória do Jari",       "1600808"),
    ],
    "RR": [
        ("Boa Vista",             "1400100"),
        ("Rorainópolis",          "1400472"),
        ("Caracaraí",             "1400209"),
        ("Alto Alegre",           "1400050"),
        ("Mucajaí",               "1400308"),
        ("Cantá",                 "1400175"),
        ("Bonfim",                "1400159"),
        ("Pacaraima",             "1400456"),
        ("Normandia",             "1400407"),
        ("Amajari",               "1400027"),
    ],
    "DF": [
        ("Brasília (DF inteiro)", "5300108"),
    ],
    "ES": [
        ("Vitória",               "3205309"),
        ("Vila Velha",            "3205200"),
        ("Cariacica",             "3201308"),
        ("Serra",                 "3205010"),
        ("Cachoeiro de Itapemirim","3201209"),
        ("Linhares",              "3203304"),
        ("São Mateus",            "3204906"),
        ("Colatina",              "3201506"),
        ("Guarapari",             "3202405"),
        ("Aracruz",               "3200607"),
    ],
}

# Doenças disponíveis no SINAN  →  (código_pysus, label_exibição)
SINAN_DOENCAS = [
    ("DENG", "Dengue"),
    ("ZIKA", "Zika Vírus"),
    ("CHIK", "Febre de Chikungunya"),
    ("MENI", "Meningite"),
    ("TUBE", "Tuberculose"),
    ("HANS", "Hans eníase"),
    ("MALA", "Malária"),
    ("LEPT", "Leptospirose"),
    ("HEPA", "Hepatites Virais"),
    ("SIFA", "Sífilis Adquirida"),
    ("SIFG", "Sífilis em Gestante"),
    ("SIFC", "Sífilis Congênita"),
    ("VARC", "Varicela"),
    ("ANIM", "Acidente por Animais Peçonhentos"),
    ("LEIV", "Leishmaniose Visceral"),
    ("LTAN", "Leishmaniose Tegumentar Americana"),
    ("ESQU", "Esquistossomose"),
    ("RAIV", "Raiva"),
    ("HANT", "Hantavirose"),
    ("FMAC", "Febre Maculosa"),
    ("CHAG", "Doença de Chagas Aguda"),
    ("COQU", "Coqueluche"),
    ("DIFT", "Difteria"),
    ("TETA", "Tétano Acidental"),
    ("BOTU", "Botulismo"),
    ("VIOL", "Violência doméstica/sexual"),
    ("IEXO", "Intoxicação Exógena"),
]

# Categorias principais
CATEGORIAS = [
    ("SIH",   "SIH — Internações Hospitalares (AIH)",        True),
    ("SIM",   "SIM — Mortalidade (CID-10)",                   True),
    ("SINASC","SINASC — Nascidos Vivos",                      True),
    ("SINAN", "SINAN — Doenças e Agravos de Notificação",     SINAN_OK),
    ("CNES",  "CNES — Hospitais e Estabelecimentos",          CNES_OK),
]


# ══════════════════════════════════════════════════════════════════════════════
#  HELPERS DE UI
# ══════════════════════════════════════════════════════════════════════════════

def cls():
    os.system("cls" if os.name == "nt" else "clear")

def linha(c="─", n=64):
    print(c * n)

def cabecalho(breadcrumb: list[str] = None):
    cls()
    linha("═")
    print("  🏥  OpenDataSUS / DATASUS  —  Extrator de Dados")
    print("  📊  Projeto SUS Predict — FIAP TCC 2025/2026")
    linha("═")
    if breadcrumb:
        print("  " + "  ›  ".join(breadcrumb))
        linha()
    print()

def menu_grid(titulo: str, opcoes: list[str], colunas: int = 3) -> int:
    """Exibe menu em grade e retorna índice 0-based da escolha."""
    linha()
    print(f"  {titulo}\n")

    col_w = max(len(f"  [{i+1:>2}] {op}") for i, op in enumerate(opcoes)) + 3

    for i, op in enumerate(opcoes):
        cel = f"  [{i+1:>2}] {op}"
        fim_linha = (i + 1) % colunas == 0 or i == len(opcoes) - 1
        if fim_linha:
            print(cel)
        else:
            print(cel.ljust(col_w), end="")

    print()
    linha()

    while True:
        try:
            v = int(input("  👉  Digite o número: ").strip())
            if 1 <= v <= len(opcoes):
                return v - 1
            print(f"  ⚠️  Escolha entre 1 e {len(opcoes)}.")
        except ValueError:
            print("  ⚠️  Digite apenas o número.")

def input_num(prompt: str, mn: int, mx: int) -> int:
    while True:
        try:
            v = int(input(prompt).strip())
            if mn <= v <= mx:
                return v
            print(f"  ⚠️  Digite entre {mn} e {mx}.")
        except ValueError:
            print("  ⚠️  Apenas números.")


# ══════════════════════════════════════════════════════════════════════════════
#  DOWNLOAD
# ══════════════════════════════════════════════════════════════════════════════

def to_df(result) -> "pd.DataFrame | None":
    """Converte qualquer retorno do PySUS para DataFrame."""
    if result is None:
        return None
    if hasattr(result, "to_dataframe"):
        return result.to_dataframe()
    if hasattr(result, "read"):
        return result.read()
    if isinstance(result, list):
        parts = [to_df(x) for x in result]
        parts = [p for p in parts if p is not None and len(p) > 0]
        return pd.concat(parts, ignore_index=True) if parts else None
    if hasattr(result, "empty"):
        return result  # já é DataFrame
    return None


def baixar(sistema: str, uf: str, ibge6: str, anos: list[int], doenca_cod: str = "DENG") -> pd.DataFrame:
    frames = []
    col_mun = ""

    if sistema == "SIH":
        # SIH 0.11: download(states, years, months, groups)
        col_mun = "MUNIC_RES"
        for ano in anos:
            for mes in tqdm(range(1, 13), desc=f"  SIH {ano}", unit="mês", leave=False):
                try:
                    df = to_df(sih_download(uf, ano, mes, "RD"))
                    if df is not None and len(df) > 0:
                        df["_ano"] = ano; df["_mes"] = mes
                        frames.append(df)
                except Exception as e:
                    print(f"\n  ⚠️  SIH {ano}/{mes}: {e}")

    elif sistema == "SIM":
        # SIM 0.11: download(groups, states, years)
        col_mun = "CODMUNRES"
        for ano in tqdm(anos, desc="  SIM", unit="ano"):
            try:
                df = to_df(sim_download("CID10", uf, ano))  # "CID10" é a chave correta no dict groups do PySUS
                if df is not None and len(df) > 0:
                    df["_ano"] = ano; frames.append(df)
            except Exception as e:
                print(f"\n  ⚠️  SIM {ano}: {e}")

    elif sistema == "SINASC":
        # SINASC 0.11: download(groups, states, years)
        col_mun = "CODMUNNASC"
        for ano in tqdm(anos, desc="  SINASC", unit="ano"):
            try:
                df = to_df(sinasc_download("DN", uf, ano))
                if df is not None and len(df) > 0:
                    df["_ano"] = ano; frames.append(df)
            except Exception as e:
                print(f"\n  ⚠️  SINASC {ano}: {e}")

    elif sistema == "SINAN":
        col_mun = "ID_MUNICIP"
        for ano in tqdm(anos, desc=f"  SINAN {doenca_cod}", unit="ano"):
            try:
                result = sinan_download(doenca_cod, ano)
                if result is None:
                    continue
                if hasattr(result, "to_dataframe"):
                    df = result.to_dataframe()
                elif hasattr(result, "read"):
                    df = result.read()
                elif isinstance(result, list):
                    parts = []
                    for item in result:
                        if hasattr(item, "to_dataframe"):
                            parts.append(item.to_dataframe())
                        elif hasattr(item, "read"):
                            parts.append(item.read())
                    df = pd.concat(parts, ignore_index=True) if parts else None
                else:
                    df = result
                if df is not None and len(df) > 0:
                    df["_ano"] = ano
                    frames.append(df)
            except Exception as e:
                print(f"\n  ⚠️  SINAN {ano}: {e}")

    elif sistema == "CNES":
        # CNES 0.11: download(group, states, years, months)
        col_mun = "CODUFMUN"
        for ano in anos:
            for mes in tqdm(range(1, 13), desc=f"  CNES {ano}", unit="mês", leave=False):
                try:
                    df = to_df(cnes_download("ST", uf, ano, mes))
                    if df is not None and len(df) > 0:
                        df["_ano"] = ano; df["_mes"] = mes
                        frames.append(df)
                except Exception as e:
                    print(f"\n  ⚠️  CNES {ano}/{mes}: {e}")

    if not frames:
        return pd.DataFrame()

    resultado = pd.concat(frames, ignore_index=True)

    if ibge6 and col_mun in resultado.columns:
        resultado = resultado[
            resultado[col_mun].astype(str).str[:6] == ibge6[:6]
        ]

    return resultado


# ══════════════════════════════════════════════════════════════════════════════
#  EXPORTAÇÃO LOCAL (XLSX)
# ══════════════════════════════════════════════════════════════════════════════

LIMITE_EXCEL = 1_048_000

def salvar(df: pd.DataFrame, pasta: Path, nome: str) -> list[Path]:
    """Salva DataFrame em XLSX. Divide automaticamente se passar do limite do Excel."""
    arquivos = []
    if len(df) <= LIMITE_EXCEL:
        p = pasta / f"{nome}.xlsx"
        df.to_excel(p, index=False, engine="openpyxl")
        print(f"  💾  {p.name}  ({len(df):,} linhas)")
        arquivos.append(p)
    else:
        for i, inicio in enumerate(range(0, len(df), LIMITE_EXCEL), 1):
            p = pasta / f"{nome}_parte{i}.xlsx"
            df.iloc[inicio:inicio + LIMITE_EXCEL].to_excel(p, index=False, engine="openpyxl")
            print(f"  💾  {p.name}")
            arquivos.append(p)
    return arquivos

def salvar_resumo(df: pd.DataFrame, pasta: Path, meta: dict) -> Path:
    rows = {
        "Campo": ["Sistema","Município","UF","Cód. IBGE","Período","Registros","Extraído em"],
        "Valor": [
            meta["sistema"], meta["cidade"], meta["uf"], meta["ibge"],
            f"{meta['ano_ini']} – {meta['ano_fim']}",
            f"{len(df):,}",
            datetime.now().strftime("%d/%m/%Y %H:%M"),
        ]
    }
    p = pasta / "00_RESUMO.xlsx"
    with pd.ExcelWriter(p, engine="openpyxl") as w:
        pd.DataFrame(rows).to_excel(w, sheet_name="Resumo", index=False)
        if not df.empty:
            df.head(500).to_excel(w, sheet_name="Amostra 500 linhas", index=False)
    print(f"  📋  {p.name}")
    return p


# ══════════════════════════════════════════════════════════════════════════════
#  SUPABASE  —  descomente e configure quando estiver pronto para subir
# ══════════════════════════════════════════════════════════════════════════════
#
#  Pré-requisito: pip install supabase
#
# SUPABASE_URL = "https://xxxx.supabase.co"   # <-- cole sua URL aqui
# SUPABASE_KEY = "sua-service-role-key"        # <-- cole sua service key aqui
#
# def upload_supabase(df: pd.DataFrame, table_name: str):
#     """Envia DataFrame ao Supabase em batches e deleta arquivos locais."""
#     from supabase import create_client
#
#     print(f"\n  ☁️   Conectando ao Supabase...")
#     client = create_client(SUPABASE_URL, SUPABASE_KEY)
#
#     # Sanitiza: substitui NaN por None (JSON não aceita NaN)
#     records = df.where(pd.notnull(df), None).to_dict(orient="records")
#     total = len(records)
#     BATCH = 1000
#
#     print(f"  ☁️   Enviando {total:,} registros para '{table_name}'...")
#     for i in range(0, total, BATCH):
#         batch = records[i:i + BATCH]
#         client.table(table_name).upsert(batch).execute()
#         pct = min(i + BATCH, total)
#         print(f"  ↑  [{pct:>{len(str(total))}}/{total}] enviados", end="\r")
#
#     print(f"\n  ✅  Upload concluído — {total:,} registros em '{table_name}'")
#
# def deletar_pasta(pasta: Path):
#     """Remove a pasta de exports local após upload bem-sucedido."""
#     import shutil
#     shutil.rmtree(pasta)
#     print(f"  🗑️   Pasta local deletada: {pasta.name}")


# ══════════════════════════════════════════════════════════════════════════════
#  FLUXO PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def main():
    # ── 1. Categoria ─────────────────────────────────────────────────────────
    cabecalho()
    cats_disp = [(s, n) for s, n, ok in CATEGORIAS if ok]
    idx_cat = menu_grid(
        "📂  SELECIONE A CATEGORIA DE DADOS",
        [n for _, n in cats_disp],
        colunas=1,
    )
    sistema, cat_nome = cats_disp[idx_cat]

    # ── 1b. Doença (só para SINAN) ───────────────────────────────────────────
    doenca_cod = "DENG"
    doenca_nome = "Dengue"
    if sistema == "SINAN":
        cabecalho([cat_nome])
        idx_d = menu_grid(
            "🦠  SELECIONE A DOENÇA / AGRAVO",
            [nome for _, nome in SINAN_DOENCAS],
            colunas=3,
        )
        doenca_cod, doenca_nome = SINAN_DOENCAS[idx_d]
        cat_nome = f"SINAN — {doenca_nome}"

    # ── 2. Estado ────────────────────────────────────────────────────────────
    cabecalho([cat_nome])
    idx_uf = menu_grid(
        "🗺️   SELECIONE O ESTADO",
        [f"{sigla} — {nome}" for sigla, nome in ESTADOS],
        colunas=3,
    )
    uf_sigla, uf_nome = ESTADOS[idx_uf]

    # ── 3. Cidade ────────────────────────────────────────────────────────────
    cabecalho([cat_nome, uf_nome])
    cidades_uf = CIDADES.get(uf_sigla, [])

    if not cidades_uf:
        print(f"  ℹ️  Nenhuma cidade pré-cadastrada para {uf_sigla}.")
        print("  Os dados serão extraídos para o estado inteiro.\n")
        cidade_nome, ibge = uf_nome, ""
    else:
        idx_cid = menu_grid(
            "🌆  SELECIONE A CIDADE",
            [c[0] for c in cidades_uf],
            colunas=3,
        )
        cidade_nome, ibge = cidades_uf[idx_cid]
        print(f"\n  ✅  Código IBGE: {ibge}  (identificado automaticamente)")

    # ── 4. Período ───────────────────────────────────────────────────────────
    cabecalho([cat_nome, uf_nome, cidade_nome])
    linha()
    print("  📅  PERÍODO DE EXTRAÇÃO\n")
    print("  Dados disponíveis a partir de ~2000.")
    print("  ⚠️  Recomendado: use até 2024 — dados de 2025/2026 podem não estar no DATASUS.\n")
    ano_ini = input_num("  👉  Ano de início (ex: 2019): ", 2000, 2026)
    ano_fim = input_num("  👉  Ano final   (ex: 2024): ", ano_ini, 2026)
    anos = list(range(ano_ini, ano_fim + 1))
    print(f"\n  ✅  Período: {ano_ini} → {ano_fim}  ({len(anos)} ano(s))\n")

    # ── 5. Confirmação ───────────────────────────────────────────────────────
    cabecalho([cat_nome, uf_nome, cidade_nome])
    linha()
    print("  📋  RESUMO DA EXTRAÇÃO\n")
    print(f"  Sistema   : {cat_nome}")
    if sistema == "SINAN":
        print(f"  Doença    : {doenca_nome} ({doenca_cod})")
    print(f"  Estado    : {uf_nome} ({uf_sigla})")
    print(f"  Cidade    : {cidade_nome}")
    print(f"  Cód. IBGE : {ibge or '(estado inteiro)'}")
    print(f"  Período   : {ano_ini} → {ano_fim}  ({len(anos)} anos)")
    print()
    linha()
    resp = input("  Iniciar extração? [S/n]: ").strip().lower()
    if resp not in ("", "s", "sim", "y"):
        print("\n  ❌  Cancelado.")
        sys.exit(0)

    # ── 6. Download ──────────────────────────────────────────────────────────
    print()
    linha()
    print("  ⏳  Conectando ao FTP do DATASUS...\n")

    df = baixar(sistema, uf_sigla, ibge, anos, doenca_cod)

    if df.empty:
        print("\n  ⚠️  Nenhum dado retornado.")
        print("  Possíveis causas:")
        print("  • O período escolhido ainda não está disponível no DATASUS")
        print("  • Tente aumentar o número de anos (dados de 2023/2024 são mais estáveis)")
        sys.exit(0)

    print(f"\n  ✅  {len(df):,} registros extraídos\n")

    # ── 7. Exportação XLSX ───────────────────────────────────────────────────
    linha()
    print("  💾  Exportando XLSX...\n")

    data_str = datetime.now().strftime("%Y%m%d_%H%M")
    sufixo = f"_{doenca_cod}" if sistema == "SINAN" else ""
    pasta_nome = f"{data_str}_{sistema}{sufixo}_{uf_sigla}_{cidade_nome.replace(' ','_')[:20]}"
    pasta = Path("exports") / pasta_nome
    pasta.mkdir(parents=True, exist_ok=True)

    nome_arq = f"{sistema}{sufixo}_{uf_sigla}_{ano_ini}-{ano_fim}"
    arquivos = salvar(df, pasta, nome_arq)
    salvar_resumo(df, pasta, {
        "sistema": cat_nome, "cidade": cidade_nome, "uf": uf_sigla,
        "ibge": ibge, "ano_ini": ano_ini, "ano_fim": ano_fim,
    })

    # ── 8. Supabase (descomente quando estiver pronto) ───────────────────────
    #
    # nome_tabela = f"{sistema.lower()}{sufixo.lower()}_{uf_sigla.lower()}"
    # upload_supabase(df, nome_tabela)
    # deletar_pasta(pasta)
    #
    # ── quando o bloco acima estiver ativo, o fluxo será: ───────────────────
    #   download → export xlsx → upload supabase → delete local
    # ────────────────────────────────────────────────────────────────────────

    # ── Resultado ────────────────────────────────────────────────────────────
    linha("═")
    print("  🎉  EXTRAÇÃO CONCLUÍDA!\n")
    print(f"  📁  Pasta  : {pasta.resolve()}")
    print(f"  📈  Total  : {len(df):,} registros")
    print()
    print("  Quando o Supabase estiver configurado:")
    print("  → Descomente o bloco '── 8. Supabase' no código")
    print("  → Preencha SUPABASE_URL e SUPABASE_KEY")
    print("  → O fluxo vai subir os dados e deletar os arquivos locais automaticamente")
    linha("═")


if __name__ == "__main__":
    main()