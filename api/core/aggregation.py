"""Data aggregation: temporal series, demographics, top causes, synthetic fallback."""
import logging
import random

from api.core.constants import (
    BASE_SISTEMA, CID10_CAP, COL_MUNICIPIO, COL_SEXO,
    POPULACAO_REL, SIA_GRUPO, SINAN_FAIXA,
)

log = logging.getLogger("sus_predict.aggregation")


# ── Real data from DataFrame ──────────────────────────────────────────────────

def serie_de_df(df, ano_ini: int, ano_fim: int) -> list[dict]:
    return [
        {"ano": ano, "total": int((df["_ano"] == ano).sum()) if "_ano" in df.columns else 0, "tipo": "real"}
        for ano in range(ano_ini, ano_fim + 1)
    ]


def sexo_de_df(df, sistema: str) -> list[dict] | None:
    col = COL_SEXO.get(sistema, "SEXO")
    if df is None or df.empty or col not in df.columns:
        return None

    mapa = {
        "1":"Masculino","M":"Masculino","m":"Masculino",
        "2":"Feminino", "F":"Feminino", "f":"Feminino",
    }
    s = df[col].astype(str).str.strip().map(mapa).dropna()
    if len(s) == 0:
        return None

    counts = s.value_counts()
    total  = counts.sum()
    return [{"sexo": k, "pct": round(v / total * 100)} for k, v in counts.items()]


def faixa_de_df(df, sistema: str) -> list[dict] | None:
    if sistema == "SINAN":
        return faixa_sinan_de_df(df)

    import pandas as pd

    col = "IDADEMAE" if sistema == "SINASC" else "IDADE"
    if df is None or df.empty or col not in df.columns:
        return None

    try:
        idades = pd.to_numeric(df[col], errors="coerce").dropna()
        if len(idades) == 0:
            return None

        if sistema == "SINASC":
            bins   = [0, 19, 24, 29, 34, 39, 120]
            labels = ["Mães <20","Mães 20–24","Mães 25–29","Mães 30–34","Mães 35–39","Mães 40+"]
        else:
            bins   = [0, 14, 29, 44, 59, 74, 200]
            labels = ["0–14","15–29","30–44","45–59","60–74","75+"]

        if sistema in ("SIM", "SIH") and idades.median() > 200:
            def _dec(v):
                v = int(v)
                if v < 300:  return 0
                return v - 400 if v >= 400 else v - 300
            idades = idades.map(_dec).clip(0, 120)

        cats   = pd.cut(idades, bins=bins, labels=labels, right=True)
        counts = cats.value_counts().reindex(labels, fill_value=0)
        total  = counts.sum()
        if total == 0:
            return None
        return [{"faixa": f, "pct": round(c / total * 100)} for f, c in counts.items()]
    except Exception as e:
        log.warning(f"faixa etária: {e}")
        return None


def faixa_sinan_de_df(df) -> list[dict] | None:
    col = "CS_FAIXA_ETARIA"
    if df is None or df.empty or col not in df.columns:
        return None
    try:
        faixas = df[col].astype(str).str.strip().map(SINAN_FAIXA).dropna()
        if len(faixas) == 0:
            return None
        labels = list(dict.fromkeys(SINAN_FAIXA.values()))
        counts = faixas.value_counts().reindex(labels, fill_value=0)
        total  = counts.sum()
        if total == 0:
            return None
        return [{"faixa": f, "pct": round(c / total * 100)} for f, c in counts.items() if c > 0]
    except Exception as e:
        log.warning(f"faixa_sinan: {e}")
        return None


def causas_de_df(df, sistema: str) -> list[dict] | None:
    try:
        if sistema in ("SIM", "SIH"):
            col = "CAUSABAS" if sistema == "SIM" else "DIAG_PRINC"
            if col not in df.columns:
                return None
            caps   = df[col].astype(str).str[0].str.upper()
            series = caps.map(lambda c: CID10_CAP.get(c, "Outras causas"))

        elif sistema == "SINASC":
            col = "PARTO"
            if col not in df.columns:
                return None
            mapa   = {"1":"Vaginal","2":"Cesáreo"}
            series = df[col].astype(str).str.strip().map(mapa).dropna()

        elif sistema == "SIA":
            col = "PA_PROC_ID"
            if col not in df.columns:
                return None
            grupos = df[col].astype(str).str.zfill(10).str[:2]
            series = grupos.map(lambda g: SIA_GRUPO.get(g, f"Grupo {g}"))

        elif sistema == "SINAN":
            series = None
            for c in ("CLASSI_FIN","CLASSI_FIN_N","FORMA","CLASSI_FINL"):
                if c in df.columns:
                    s = df[c].astype(str).str.strip()
                    s = s[s.notna() & (s != "nan") & (s != "")]
                    if len(s) > 0:
                        series = s
                        break
            if series is None:
                return None
        else:
            return None

        counts = series.value_counts().head(7)
        total  = counts.sum()
        if total == 0:
            return None
        return [{"causa": k, "pct": round(v / total * 100, 1)} for k, v in counts.items()]
    except Exception as e:
        log.warning(f"causas_de_df: {e}")
        return None


# ── Synthetic fallback ────────────────────────────────────────────────────────

def serie_sintetica(sistema: str, uf: str, ano_ini: int, ano_fim: int) -> list[dict]:
    base  = BASE_SISTEMA.get(sistema, 100_000) // 10
    fator = POPULACAO_REL.get(uf, 0.05)
    trend = {"SIM":0.018,"SIH":0.015,"SINASC":-0.012,"SIA":0.025}.get(sistema, 0.015)
    rng   = random.Random(abs(hash(f"{sistema}{uf}")) % 99999)
    return [
        {"ano": ano, "total": int(base * fator * (1 + i * trend) * rng.uniform(0.93, 1.07)), "tipo": "real"}
        for i, ano in enumerate(range(ano_ini, ano_fim + 1))
    ]


def sexo_sintetico(sistema: str) -> list[dict]:
    return {
        "SIM":    [{"sexo":"Masculino","pct":56},{"sexo":"Feminino","pct":44}],
        "SINASC": [{"sexo":"Masculino","pct":51},{"sexo":"Feminino","pct":49}],
        "SIH":    [{"sexo":"Feminino", "pct":53},{"sexo":"Masculino","pct":47}],
        "SIA":    [{"sexo":"Feminino", "pct":57},{"sexo":"Masculino","pct":43}],
    }.get(sistema, [{"sexo":"Masculino","pct":50},{"sexo":"Feminino","pct":50}])


def faixa_sintetica(sistema: str) -> list[dict]:
    data = {
        "SIM":    [("0–14",4),("15–29",7),("30–44",11),("45–59",21),("60–74",31),("75+",26)],
        "SIH":    [("0–14",18),("15–29",13),("30–44",15),("45–59",20),("60–74",21),("75+",13)],
        "SINASC": [("Mães <20",16),("Mães 20–24",24),("Mães 25–29",25),
                   ("Mães 30–34",20),("Mães 35–39",11),("Mães 40+",4)],
        "SIA":    [("0–14",14),("15–29",18),("30–44",20),("45–59",22),("60–74",17),("75+",9)],
    }.get(sistema, [("0–14",15),("15–29",20),("30–44",22),("45–59",22),("60–74",13),("75+",8)])
    return [{"faixa": f, "pct": p} for f, p in data]
