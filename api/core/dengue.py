"""Rotas de leitura das tabelas curadas de dengue no Supabase (SIH + SINAN).

Somente leitura (sb_select). Nenhuma escrita é feita nessas tabelas.
"""
from fastapi import APIRouter, HTTPException, Query

from api.core.db import sb_select, supabase_configured
from api.core.prediction import gerar_predicao

router = APIRouter(prefix="/api/dengue", tags=["dengue"])

PERIODOS = {"Trimestre", "Semestre", "12 Meses", "3 Anos", "5 Anos"}


def _select(table: str, eq: dict | None = None, order: str | None = None) -> list[dict]:
    if not supabase_configured():
        raise HTTPException(503, "Supabase não configurado (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ausentes)")
    try:
        return sb_select(table, eq, order=order)
    except RuntimeError as e:
        raise HTTPException(503, f"consulta a '{table}' falhou: {e}")


def _validar_periodo(periodo: str):
    if periodo not in PERIODOS:
        raise HTTPException(400, f"periodo inválido. Use um de: {sorted(PERIODOS)}")


# ── SIH (por hospital/CNES, com consolidado 'TODOS') ───────────────────────────

@router.get("/sih/internacoes")
def sih_internacoes(periodo: str = Query(...), cnes: str = "TODOS"):
    _validar_periodo(periodo)
    return _select("sih_dengue_interacoes_periodo", {"periodo": periodo, "cnes": cnes})


@router.get("/sih/permanencia")
def sih_permanencia(periodo: str = Query(...), cnes: str = "TODOS"):
    _validar_periodo(periodo)
    return _select("sih_dengue_permanencia_media_periodo", {"periodo": periodo, "cnes": cnes})


@router.get("/sih/mortalidade")
def sih_mortalidade(periodo: str = Query(...), cnes: str = "TODOS"):
    _validar_periodo(periodo)
    return _select("sih_dengue_taxa_mortalidade_periodo", {"periodo": periodo, "cnes": cnes})


@router.get("/sih/custo")
def sih_custo(periodo: str = Query(...), cnes: str = "TODOS"):
    _validar_periodo(periodo)
    return _select("sih_dengue_custo_total_periodo", {"periodo": periodo, "cnes": cnes})


@router.get("/sih/custo-mensal")
def sih_custo_mensal(periodo: str = Query(...)):
    _validar_periodo(periodo)
    return _select("sih_dengue_internacoes_custo_mensal", {"periodo": periodo}, order="mes_referencia.asc")


@router.get("/sih/top-hospitais")
def sih_top_hospitais(periodo: str = Query(...)):
    _validar_periodo(periodo)
    return _select("sih_dengue_top_hospitais", {"periodo": periodo}, order="ranking.asc")


@router.get("/sih/faixa-etaria")
def sih_faixa_etaria(periodo: str = Query(...)):
    _validar_periodo(periodo)
    return _select("sih_dengue_internacoes_faixa_etaria", {"periodo": periodo}, order="ordem_faixa.asc")


@router.get("/sih/top-municipios")
def sih_top_municipios(periodo: str = Query(...)):
    _validar_periodo(periodo)
    return _select("sih_dengue_top_municipios", {"periodo": periodo}, order="ranking.asc")


# ── SINAN (por município: cod_ibge_municipio, código de 6 dígitos) ─────────────

@router.get("/sinan/casos")
def sinan_casos(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_total_casos", {"cod_ibge_municipio": ibge, "periodo": periodo})


@router.get("/sinan/faixa-etaria")
def sinan_faixa_etaria(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_faixa_etaria",
                    {"cod_ibge_municipio": ibge, "periodo": periodo}, order="ordem_faixa.asc")


@router.get("/sinan/genero")
def sinan_genero(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_distribuicao_genero", {"cod_ibge_municipio": ibge, "periodo": periodo})


@router.get("/sinan/incidencia")
def sinan_incidencia(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_incidencia", {"cod_ibge_municipio": ibge, "periodo": periodo})


@router.get("/sinan/sazonalidade")
def sinan_sazonalidade(ibge: str = Query(...)):
    return _select("sinan_dengue_municipios_sazonalidade", {"cod_ibge_municipio": ibge}, order="mes_ano.asc")


@router.get("/sinan/taxa-hospitalizacao")
def sinan_taxa_hospitalizacao(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_taxa_hospitalizacao", {"cod_ibge_municipio": ibge, "periodo": periodo})


@router.get("/sinan/taxa-obito")
def sinan_taxa_obito(ibge: str = Query(...), periodo: str = "12 Meses"):
    return _select("sinan_dengue_municipios_taxa_obito", {"cod_ibge_municipio": ibge, "periodo": periodo})


@router.get("/sinan/desfecho-clinico")
def sinan_desfecho_clinico(ibge: str = Query(...)):
    return _select("sinan_dengue_municipios_desfecho_clinico_anual", {"cod_ibge_municipio": ibge}, order="ano_referencia.asc")


@router.get("/sinan/previsao")
def sinan_previsao(ibge: str = Query(...)):
    """Previsão de casos totais para o próximo ano, via gerar_predicao (Holt/OLS)."""
    linhas = _select("sinan_dengue_municipios_desfecho_clinico_anual", {"cod_ibge_municipio": ibge}, order="ano_referencia.asc")
    serie = [
        {"ano": r["ano_referencia"], "total": r["casos_leves"] + r["hospitalizacoes"] + r["obitos"], "tipo": "real"}
        for r in linhas
    ]
    if len(serie) < 2:
        raise HTTPException(422, "série histórica insuficiente para gerar previsão")

    previsao, modelo, surtos = gerar_predicao(serie, anos_previsao=1)
    proximo = next(p for p in previsao if p["tipo"] == "previsto")
    return {"proximo_ano": proximo["ano"], "casos_previstos": proximo["total"],
            "modelo": modelo, "surtos_detectados": surtos}
