"""
PySUS download helpers. Only called when PYSUS_OK is True (Python 3.12 + venv).
"""
import gc
import logging
from pathlib import Path

from api.core.constants import COLS_MINIMAS, COL_MUNICIPIO

log = logging.getLogger("sus_predict.download")


def limpar_cache_pysus(sistema: str, anos: list[int], uf: str = "", doenca_cod: str = "") -> int:
    """Remove PySUS parquet cache files for given years, forcing fresh FTP download."""
    cache_base = Path.home() / ".pysus"
    if not cache_base.exists():
        return 0

    def _padroes(ano: int) -> list[str]:
        yy  = str(ano)[2:]
        uf_u, uf_l = uf.upper(), uf.lower()
        if sistema == "SINAN":
            cod = doenca_cod.upper() if doenca_cod else "*"
            return [f"*{cod}*{ano}*", f"*{cod}*{yy}*",
                    f"*{cod.lower()}*{ano}*", f"*{cod.lower()}*{yy}*"]
        elif sistema == "SIM":
            return [f"*DO{uf_u}{yy}*", f"*DO{uf_l}{yy}*", f"*sim*{yy}*"]
        elif sistema == "SIH":
            return [f"*RD{uf_u}{yy}*", f"*RD{uf_l}{yy}*", f"*sih*{yy}*"]
        elif sistema == "SINASC":
            return [f"*DN{uf_u}{yy}*", f"*DN{uf_l}{yy}*", f"*sinasc*{yy}*"]
        elif sistema == "SIA":
            return [f"*PA{uf_u}{yy}*", f"*PA{uf_l}{yy}*", f"*sia*{yy}*"]
        return []

    removidos = 0
    for ano in anos:
        for padrao in _padroes(ano):
            for arq in cache_base.rglob(padrao):
                try:
                    if arq.is_file():
                        arq.unlink()
                        removidos += 1
                        log.info(f"Cache removido: {arq.name}")
                except Exception as e:
                    log.warning(f"Não foi possível remover {arq.name}: {e}")

    log.info(f"{removidos} arquivo(s) de cache removido(s)" if removidos else "Sem cache local — FTP consultado direto")
    return removidos


def ler_slim(raw, sistema: str, ibge6: str, *, strict_municipio: bool = False):
    """
    Read PySUS result with column pruning (reads only needed columns from parquet).
    Reduces RAM from ~4 GB (80 cols × 10M rows) to ~200 MB (5 cols × 10M rows).
    """
    import pandas as pd
    from datasus import to_df

    colunas  = COLS_MINIMAS.get(sistema, [])
    col_mun  = COL_MUNICIPIO.get(sistema)

    def _ler_parquetset(ps):
        base = Path(ps.path)
        arqs = sorted(base.glob("*.parquet")) if base.is_dir() else [base]
        partes = []
        for arq in arqs:
            df = None
            if colunas:
                for engine in ("pyarrow", "fastparquet"):
                    try:
                        df = pd.read_parquet(str(arq), engine=engine, columns=colunas)
                        break
                    except Exception:
                        pass
            if df is None:
                try:
                    df = pd.read_parquet(str(arq), engine="fastparquet")
                    if colunas:
                        pres = [c for c in colunas if c in df.columns]
                        df   = df[pres] if pres else df
                except Exception as exc:
                    log.warning(f"Falha ao ler {arq.name}: {exc}")
                    continue
            if df is not None and not df.empty:
                partes.append(df)
            del df
        return pd.concat(partes, ignore_index=True) if partes else None

    if hasattr(raw, "path"):
        df = _ler_parquetset(raw)
    elif isinstance(raw, list):
        partes = []
        for item in raw:
            if hasattr(item, "path"):
                p = _ler_parquetset(item)
                if p is not None and not p.empty:
                    partes.append(p)
                del p
        df = pd.concat(partes, ignore_index=True) if partes else None
    else:
        df = to_df(raw)
        if df is not None and colunas:
            pres = [c for c in colunas if c in df.columns]
            if pres:
                df = df[pres]

    if df is None or df.empty:
        return None

    if ibge6 and col_mun and col_mun in df.columns:
        mask = df[col_mun].astype(str).str[:6] == ibge6[:6]
        if mask.any():
            return df[mask].copy()
        if strict_municipio:
            return df.iloc[0:0].copy()
        log.info(f"Município {ibge6} sem dados na col {col_mun} — usando UF inteira")

    return df


def baixar_ano(sistema: str, uf: str, ano: int, ibge6: str = "", doenca_cod: str = ""):
    """Download 1 year of data via PySUS with column pruning."""
    import pandas as pd
    from pysus.online_data.SIH    import download as _sih_dl
    from pysus.online_data.SIM    import download as _sim_dl
    from pysus.online_data.SINASC import download as _sinasc_dl

    try:
        if sistema == "SIM":
            raw = _sim_dl("CID10", uf, ano)
            df  = ler_slim(raw, "SIM", ibge6)

        elif sistema == "SIH":
            frames_mes = []
            for mes in range(1, 13):
                try:
                    raw_mes = _sih_dl(uf, ano, mes, "RD")
                    f = ler_slim(raw_mes, "SIH", ibge6)
                    if f is not None and not f.empty:
                        frames_mes.append(f)
                    del raw_mes, f
                except Exception:
                    pass
            df = pd.concat(frames_mes, ignore_index=True) if frames_mes else None
            del frames_mes

        elif sistema == "SINASC":
            raw = _sinasc_dl("DN", uf, ano)
            df  = ler_slim(raw, "SINASC", ibge6)

        elif sistema == "SINAN":
            return baixar_sinan(doenca_cod, ano, ibge6=ibge6)

        else:
            return None

        if df is not None and not df.empty:
            df["_ano"] = ano
            return df

    except Exception as e:
        log.warning(f"{sistema} {uf} {ano}: {e}")
    return None


def baixar_sinan(doenca_cod: str, ano: int, ibge6: str = ""):
    """Download SINAN national data for a disease, filtered by municipality."""
    if not doenca_cod:
        return None
    try:
        from pysus.online_data.SINAN import download as _sinan_dl
        raw = _sinan_dl(doenca_cod, ano)
        df  = ler_slim(raw, "SINAN", ibge6, strict_municipio=bool(ibge6))
        if df is not None and not df.empty:
            df["_ano"] = ano
            return df
    except Exception as e:
        log.warning(f"SINAN {doenca_cod} {ano}: {e}")
    return None
