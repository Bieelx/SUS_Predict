"""Prediction models: Holt (default) → OLS (fallback).

Outbreak detection via MAD runs before any model fit.
Spike years are imputed for fitting, then real values restored in output.
Prophet is imported if available but removed from the cascade — it fails badly
on outbreak-dominated epidemiological series.
"""
import logging
import math

log = logging.getLogger("sus_predict.prediction")

PROPHET_OK = False
try:
    from prophet import Prophet  # noqa: F401
    import pandas as _pd         # noqa: F401
    PROPHET_OK = True
    log.info("Prophet disponível (não usado no cascade — use gerar_predicao_prophet diretamente se necessário)")
except Exception as _e:
    log.debug(f"Prophet não disponível ({_e})")


# ── Outbreak detection ─────────────────────────────────────────────────────────

def _detectar_surtos(serie: list[dict], threshold: float = 2.0) -> set[int]:
    """
    Detect outbreak (and collapse) years via Median Absolute Deviation.

    Requires ≥5 non-zero points to avoid over-flagging short series.
    A year is flagged only when its MAD z-score > threshold AND its ratio
    to the median is extreme (>1.5× or <0.4×) — prevents flagging natural
    year-to-year variance in stable series like SINASC.
    """
    totais = [s["total"] for s in serie if s["total"] > 0]
    if len(totais) < 5:
        return set()

    sorted_t = sorted(totais)
    med = sorted_t[len(sorted_t) // 2]
    if med == 0:
        return set()

    mad = sorted(abs(t - med) for t in totais)[len(totais) // 2]
    if mad == 0:
        return set()

    sigma = mad * 1.4826  # consistent σ estimator for Gaussian

    surtos = set()
    for s in serie:
        if s["total"] == 0:
            continue
        z     = abs(s["total"] - med) / sigma
        ratio = s["total"] / med
        if z > threshold and (ratio > 1.5 or ratio < 0.4):
            surtos.add(s["ano"])
    return surtos


def _limpar_surtos(serie: list[dict], surtos: set[int]) -> list[dict]:
    """Replace outbreak/collapse years with linear interpolation from clean neighbors."""
    if not surtos:
        return serie

    result = [dict(s) for s in serie]
    for i, s in enumerate(result):
        if s["ano"] not in surtos:
            continue
        prev = next((result[j]["total"] for j in range(i - 1, -1, -1) if result[j]["ano"] not in surtos), None)
        nxt  = next((result[j]["total"] for j in range(i + 1, len(result)) if result[j]["ano"] not in surtos), None)
        if prev is not None and nxt is not None:
            result[i]["total"] = (prev + nxt) // 2
        elif prev is not None:
            result[i]["total"] = prev
        elif nxt is not None:
            result[i]["total"] = nxt
    return result


def _restaurar_reais(previsao: list[dict], serie_original: list[dict]) -> list[dict]:
    """Restore real (pre-imputation) totals for historical points in the fitted output."""
    real_map = {s["ano"]: s["total"] for s in serie_original}
    result = []
    for p in previsao:
        if p.get("tipo") != "previsto" and p["ano"] in real_map:
            result.append(dict(p, total=real_map[p["ano"]]))
        else:
            result.append(p)
    return result


# ── Models ────────────────────────────────────────────────────────────────────

def _predicao_ols(serie: list[dict], anos_previsao: int = 3) -> tuple[list[dict], str]:
    if len(serie) < 2:
        return [dict(s, lower=None, upper=None) for s in serie], "OLS"

    x  = [s["ano"] for s in serie]
    y  = [float(math.log1p(max(0, s["total"]))) for s in serie]
    n  = len(x)
    xm, ym = sum(x) / n, sum(y) / n
    num = sum((xi - xm) * (yi - ym) for xi, yi in zip(x, y))
    den = sum((xi - xm) ** 2 for xi in x)
    slope     = num / den if den else 0
    intercept = ym - slope * xm

    residuos = [yi - (intercept + slope * xi) for xi, yi in zip(x, y)]
    sigma    = (sum(r ** 2 for r in residuos) / max(n - 2, 1)) ** 0.5
    margem   = 1.28 * sigma

    resultado = [dict(s, lower=None, upper=None) for s in serie]
    for i in range(1, anos_previsao + 1):
        ano_p = max(x) + i
        yhat  = intercept + slope * ano_p
        m     = margem * (1 + i * 0.15)
        resultado.append({
            "ano":   ano_p,
            "total": max(0, int(math.expm1(yhat))),
            "lower": max(0, int(math.expm1(yhat - m))),
            "upper": max(0, int(math.expm1(yhat + m))),
            "tipo":  "previsto",
        })
    return resultado, "OLS(log1p)"


def _predicao_holt(serie: list[dict], anos_previsao: int = 3) -> tuple[list[dict], str]:
    if len(serie) < 3:
        return _predicao_ols(serie, anos_previsao)

    y    = [math.log1p(max(0, s["total"])) for s in serie]
    grid = [0.2, 0.35, 0.5, 0.65, 0.8]
    best = None

    def fit(alpha: float, beta: float):
        level = y[0]
        trend = y[1] - y[0]
        errs  = []
        for t in range(1, len(y)):
            pred = level + trend
            errs.append(y[t] - pred)
            nl = alpha * y[t] + (1 - alpha) * (level + trend)
            nt = beta  * (nl - level) + (1 - beta) * trend
            level, trend = nl, nt
        var = sum(e * e for e in errs) / max(len(errs) - 1, 1) if len(errs) >= 2 else 0.0
        return level, trend, math.sqrt(var)

    for alpha in grid:
        for beta in grid:
            level, trend, sigma = fit(alpha, beta)
            if best is None or sigma < best["score"]:
                best = {"alpha": alpha, "beta": beta, "score": sigma,
                        "level": level, "trend": trend, "sigma": sigma}

    level  = best["level"]
    trend  = best["trend"]
    margem = 1.28 * best["sigma"]

    resultado = [dict(s, lower=None, upper=None) for s in serie]
    for i in range(1, anos_previsao + 1):
        yhat = level + i * trend
        m    = margem * (1 + i * 0.12)
        resultado.append({
            "ano":   serie[-1]["ano"] + i,
            "total": max(0, int(math.expm1(yhat))),
            "lower": max(0, int(math.expm1(yhat - m))),
            "upper": max(0, int(math.expm1(yhat + m))),
            "tipo":  "previsto",
        })
    return resultado, "Holt(log1p)"


# ── Public API ────────────────────────────────────────────────────────────────

def gerar_predicao(
    serie: list[dict],
    anos_previsao: int = 3,
) -> tuple[list[dict], str, list[int]]:
    """
    Fit prediction on outbreak-cleaned series, restore real values in output.

    Returns (serie_com_previsao, modelo, surtos) where surtos is a list of
    years flagged as statistical outliers (outbreaks or collapses).

    Cascade: Holt (≥4 clean pts) → OLS.
    Prophet removed — distorts badly on outbreak-heavy epidemiological data.
    """
    surtos      = _detectar_surtos(serie)
    serie_limpa = _limpar_surtos(serie, surtos) if surtos else serie

    if surtos:
        log.info(f"Surtos detectados e removidos do ajuste: {sorted(surtos)}")

    validos = [s for s in serie_limpa if s["total"] > 0]

    if len(validos) >= 4:
        try:
            previsao, modelo = _predicao_holt(serie_limpa, anos_previsao)
            previsao = _restaurar_reais(previsao, serie)
            return previsao, modelo, sorted(surtos)
        except Exception as e:
            log.warning(f"Holt falhou ({e}) — fallback OLS")

    previsao, modelo = _predicao_ols(serie_limpa, anos_previsao)
    previsao = _restaurar_reais(previsao, serie)
    return previsao, modelo, sorted(surtos)
