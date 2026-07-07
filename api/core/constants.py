from datetime import datetime

_ANO_ATUAL = datetime.now().year

ANO_MAXIMO_CONFIAVEL: dict[str, int] = {
    "SINAN":  _ANO_ATUAL - 1,
    "SIM":    _ANO_ATUAL - 1,
    "SIH":    _ANO_ATUAL - 1,
    "SINASC": _ANO_ATUAL - 1,
    "SIA":    _ANO_ATUAL - 1,
}

COLS_MINIMAS: dict[str, list[str]] = {
    "SIM":    ["CODMUNRES", "SEXO", "IDADE",    "CAUSABAS"],
    "SIH":    ["MUNIC_RES", "SEXO", "IDADE",    "DIAG_PRINC"],
    "SINASC": ["CODMUNNASC","SEXO", "IDADEMAE", "PARTO"],
    "SIA":    ["CODUFMUN",  "SEXO", "PA_PROC_ID"],
    "SINAN":  ["ID_MUNICIP","CS_SEXO","CS_FAIXA_ETARIA","CLASSI_FIN"],
}

COL_MUNICIPIO: dict[str, str] = {
    "SIM":"CODMUNRES", "SIH":"MUNIC_RES", "SINASC":"CODMUNNASC",
    "SIA":"CODUFMUN",  "SINAN":"ID_MUNICIP",
}

COL_SEXO: dict[str, str] = {
    "SIM":"SEXO", "SIH":"SEXO", "SINASC":"SEXO", "SIA":"SEXO", "SINAN":"CS_SEXO",
}

CID10_CAP: dict[str, str] = {
    "A":"Infecciosas e parasitárias", "B":"Infecciosas e parasitárias",
    "C":"Neoplasias malignas",        "D":"Neoplasias / sangue",
    "E":"Doenças endócrinas e metabólicas", "F":"Transtornos mentais",
    "G":"Sistema nervoso",            "H":"Olhos / ouvidos",
    "I":"Doenças cardiovasculares",   "J":"Doenças respiratórias",
    "K":"Doenças digestivas",         "L":"Doenças da pele",
    "M":"Sistema osteomuscular",      "N":"Doenças geniturinárias",
    "O":"Gravidez, parto e puerpério","P":"Afecções perinatais",
    "Q":"Malformações congênitas",    "R":"Sintomas e sinais",
    "S":"Traumatismos",               "T":"Envenenamentos",
    "V":"Acidentes de trânsito",      "W":"Causas externas — acidentes",
    "X":"Causas externas — violência","Y":"Causas externas — indeterminadas",
    "Z":"Fatores de saúde",
}

SIA_GRUPO: dict[str, str] = {
    "01":"Promoção e prevenção", "02":"Diagnóstico",
    "03":"Procedimentos clínicos","04":"Procedimentos cirúrgicos",
    "05":"Transplantes",         "06":"Medicamentos",
    "07":"Órteses e próteses",   "08":"Ações complementares",
}

SINAN_FAIXA: dict[str, str] = {
    "1":"< 1 ano","2":"1–4",  "3":"5–9",
    "4":"10–14",  "5":"15–19","6":"20–29","7":"30–39",
    "8":"40–49",  "9":"50–59","10":"60–69","11":"70–79","12":"80+",
}

ESTADOS_FALLBACK: list[dict] = [
    {"sigla":"AC","nome":"Acre"},         {"sigla":"AL","nome":"Alagoas"},
    {"sigla":"AM","nome":"Amazonas"},     {"sigla":"AP","nome":"Amapá"},
    {"sigla":"BA","nome":"Bahia"},        {"sigla":"CE","nome":"Ceará"},
    {"sigla":"DF","nome":"Distrito Federal"},{"sigla":"ES","nome":"Espírito Santo"},
    {"sigla":"GO","nome":"Goiás"},        {"sigla":"MA","nome":"Maranhão"},
    {"sigla":"MG","nome":"Minas Gerais"},{"sigla":"MS","nome":"Mato Grosso do Sul"},
    {"sigla":"MT","nome":"Mato Grosso"}, {"sigla":"PA","nome":"Pará"},
    {"sigla":"PB","nome":"Paraíba"},     {"sigla":"PE","nome":"Pernambuco"},
    {"sigla":"PI","nome":"Piauí"},       {"sigla":"PR","nome":"Paraná"},
    {"sigla":"RJ","nome":"Rio de Janeiro"},{"sigla":"RN","nome":"Rio Grande do Norte"},
    {"sigla":"RO","nome":"Rondônia"},    {"sigla":"RR","nome":"Roraima"},
    {"sigla":"RS","nome":"Rio Grande do Sul"},{"sigla":"SC","nome":"Santa Catarina"},
    {"sigla":"SE","nome":"Sergipe"},     {"sigla":"SP","nome":"São Paulo"},
    {"sigla":"TO","nome":"Tocantins"},
]

CIDADES_FALLBACK: dict[str, list[tuple[str, str]]] = {
    "SP":[("São Paulo","3550308"),("Campinas","3509502"),("Guarulhos","3518800"),
          ("Santo André","3547809"),("Osasco","3534401"),("Ribeirão Preto","3543402"),
          ("Sorocaba","3552205"),("Santos","3548100"),("São José dos Campos","3549904"),
          ("Barueri","3505708")],
    "RJ":[("Rio de Janeiro","3304557"),("Niterói","3303302"),("Nova Iguaçu","3303500"),
          ("Duque de Caxias","3301702"),("São Gonçalo","3304904"),("Petrópolis","3303906"),
          ("Volta Redonda","3306701"),("Campos dos Goytacazes","3301009")],
    "MG":[("Belo Horizonte","3106200"),("Uberlândia","3170206"),("Contagem","3118601"),
          ("Juiz de Fora","3136702"),("Betim","3106705"),("Montes Claros","3143302"),
          ("Uberaba","3170107")],
    "RS":[("Porto Alegre","4314902"),("Caxias do Sul","4305108"),("Pelotas","4314407"),
          ("Canoas","4304606"),("Santa Maria","4316907"),("Novo Hamburgo","4313409")],
    "PR":[("Curitiba","4106902"),("Londrina","4113700"),("Maringá","4115200"),
          ("Ponta Grossa","4119905"),("Cascavel","4104808"),("São José dos Pinhais","4125506")],
    "BA":[("Salvador","2927408"),("Feira de Santana","2910800"),
          ("Vitória da Conquista","2933307"),("Camaçari","2905701"),("Itabuna","2914802")],
    "CE":[("Fortaleza","2304400"),("Caucaia","2303709"),("Juazeiro do Norte","2307304"),
          ("Sobral","2312908"),("Maracanaú","2307650")],
    "PE":[("Recife","2611606"),("Caruaru","2604106"),("Olinda","2609600"),
          ("Petrolina","2611101"),("Paulista","2610707")],
    "GO":[("Goiânia","5208707"),("Aparecida de Goiânia","5201405"),
          ("Anápolis","5201108"),("Rio Verde","5218805")],
    "AM":[("Manaus","1302603"),("Parintins","1303403"),("Itacoatiara","1301902"),
          ("Manacapuru","1302504")],
    "SC":[("Florianópolis","4205407"),("Joinville","4209102"),("Blumenau","4202404"),
          ("Chapecó","4204202"),("Itajaí","4207304")],
    "PA":[("Belém","1501402"),("Ananindeua","1500800"),("Santarém","1506807"),
          ("Marabá","1504208")],
    "MA":[("São Luís","2111300"),("Imperatriz","2105302"),("Timon","2112209")],
    "MT":[("Cuiabá","5103403"),("Várzea Grande","5108402"),("Rondonópolis","5107602"),
          ("Sinop","5107909")],
    "MS":[("Campo Grande","5002704"),("Dourados","5003702"),("Três Lagoas","5008305")],
    "PB":[("João Pessoa","2507507"),("Campina Grande","2504009"),("Santa Rita","2513703")],
    "RN":[("Natal","2408102"),("Mossoró","2408003"),("Parnamirim","2403251")],
    "PI":[("Teresina","2211001"),("Parnaíba","2207702"),("Picos","2208007")],
    "AL":[("Maceió","2704302"),("Arapiraca","2700300"),("Rio Largo","2707701")],
    "SE":[("Aracaju","2800308"),("Nossa Sra. do Socorro","2804805"),("Lagarto","2803500")],
    "RO":[("Porto Velho","1100205"),("Ji-Paraná","1100122"),("Ariquemes","1100023")],
    "TO":[("Palmas","1721000"),("Araguaína","1702109"),("Gurupi","1709500")],
    "AC":[("Rio Branco","1200401"),("Cruzeiro do Sul","1200203")],
    "AP":[("Macapá","1600303"),("Santana","1600600")],
    "RR":[("Boa Vista","1400100"),("Rorainópolis","1400472")],
    "DF":[("Brasília","5300108")],
    "ES":[("Vitória","3205309"),("Vila Velha","3205200"),("Serra","3205010"),
          ("Cariacica","3201308")],
}

IBGE6_COORDS: dict[str, dict[str, float]] = {
    "355030": {"lat": -23.5505, "lon": -46.6333},  # São Paulo
    "330455": {"lat": -22.9068, "lon": -43.1729},  # Rio de Janeiro
    "310620": {"lat": -19.9167, "lon": -43.9345},  # Belo Horizonte
    "431490": {"lat": -30.0347, "lon": -51.2177},  # Porto Alegre
    "410690": {"lat": -25.4284, "lon": -49.2733},  # Curitiba
    "292740": {"lat": -12.9714, "lon": -38.5014},  # Salvador
    "230440": {"lat": -3.7172,  "lon": -38.5433},  # Fortaleza
    "261160": {"lat": -8.0476,  "lon": -34.8770},  # Recife
    "520870": {"lat": -16.6869, "lon": -49.2648},  # Goiânia
    "130260": {"lat": -3.1190,  "lon": -60.0217},  # Manaus
    "500270": {"lat": -20.4697, "lon": -54.6201},  # Campo Grande
    "150140": {"lat": -1.4558,  "lon": -48.5044},  # Belém
    "211130": {"lat": -2.5297,  "lon": -44.3028},  # São Luís
    "510340": {"lat": -15.5961, "lon": -56.0967},  # Cuiabá
    "530010": {"lat": -15.7801, "lon": -47.9292},  # Brasília
    "320530": {"lat": -20.3155, "lon": -40.3128},  # Vitória
    "420540": {"lat": -27.5954, "lon": -48.5480},  # Florianópolis
    "420910": {"lat": -26.3044, "lon": -48.8467},  # Joinville
    "250750": {"lat": -7.1195,  "lon": -34.8450},  # João Pessoa
    "240810": {"lat": -5.7945,  "lon": -35.2110},  # Natal
    "221100": {"lat": -5.0892,  "lon": -42.8019},  # Teresina
    "270430": {"lat": -9.6658,  "lon": -35.7350},  # Maceió
    "280030": {"lat": -10.9472, "lon": -37.0731},  # Aracaju
    "110020": {"lat": -8.7612,  "lon": -63.9004},  # Porto Velho
    "172100": {"lat": -10.2491, "lon": -48.3243},  # Palmas
    "120040": {"lat": -9.9754,  "lon": -67.8249},  # Rio Branco
    "160030": {"lat": 0.0349,   "lon": -51.0694},  # Macapá
    "140010": {"lat": 2.8235,   "lon": -60.6758},  # Boa Vista
}
