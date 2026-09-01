"""Contratos somente leitura para as telas operacionais do SusPredict.

As tabelas curadas continuam no Supabase. O navegador consome estes contratos
para que a chave de service role nunca seja exposta no bundle do frontend.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from api.core.auth import require_user
from api.core.db import sb_select, supabase_configured
from api.core.prediction import gerar_predicao_mensal

router = APIRouter(prefix="/api/dados", tags=["dados-operacionais"])

PERIODOS = {"Trimestre", "Semestre", "12 Meses", "3 Anos", "5 Anos"}


def _ibge6(valor: str) -> str:
    codigo = "".join(ch for ch in str(valor or "") if ch.isdigit())
    if len(codigo) < 6:
        raise HTTPException(400, "ibge deve possuir ao menos 6 dígitos")
    return codigo[:6]


def _periodo(valor: str) -> str:
    if valor not in PERIODOS:
        raise HTTPException(400, f"período inválido. Use um de: {sorted(PERIODOS)}")
    return valor


def _select(table: str, eq: dict | None = None, order: str | None = None,
            limit: int | None = None) -> list[dict]:
    if not supabase_configured():
        raise HTTPException(503, "Fonte Supabase indisponível neste ambiente")
    try:
        return sb_select(table, eq, order=order, limit=limit)
    except RuntimeError as exc:
        raise HTTPException(503, f"Consulta a {table} falhou: {exc}") from exc


def _municipio(ibge6: str) -> dict[str, Any]:
    linhas = _select("ibge_sp", limit=700)
    linha = next(
        (item for item in linhas if str(item.get("cod_ibge_completo") or "")[:6] == ibge6),
        None,
    )
    if not linha:
        raise HTTPException(404, "Município não encontrado na dimensão IBGE de São Paulo")
    return linha


def _meta(tabelas: list[str], referencias: list[Any]) -> dict[str, Any]:
    valores = sorted(str(valor) for valor in referencias if valor)
    return {
        "dados_reais": True,
        "fonte": "Supabase",
        "tabelas": tabelas,
        "data_referencia": valores[-1] if valores else None,
        "consultado_em": datetime.now(timezone.utc).isoformat(),
    }


def _prever_tres_meses(linhas: list[dict]) -> dict[str, Any]:
    serie = [
        {"mes": item.get("mes_ano"), "total": item.get("casos_atual")}
        for item in linhas
        if item.get("mes_ano")
    ]
    try:
        previsao, modelo, diagnostico = gerar_predicao_mensal(serie, meses_previsao=3)
    except (KeyError, TypeError, ValueError) as exc:
        return {
            "disponivel": False,
            "motivo": f"Série histórica insuficiente ou inválida: {exc}",
            "horizonte_meses": 3,
        }

    ultimo_observado = max(str(item["mes_ano"])[:10] for item in linhas if item.get("mes_ano"))
    fim_horizonte = previsao[-1]["mes"]
    mes_atual = date.today().replace(day=1).isoformat()
    defasada = fim_horizonte < mes_atual
    return {
        "disponivel": True,
        "horizonte_meses": 3,
        "ultimo_mes_observado": ultimo_observado,
        "fim_horizonte": fim_horizonte,
        "status_temporal": "defasada" if defasada else "atual",
        "aviso": (
            "A fonte termina antes do mês atual; esta projeção representa os três meses seguintes ao último dado observado."
            if defasada else
            "Projeção para os três meses seguintes ao último dado observado."
        ),
        "modelo": modelo,
        "intervalo_confianca_pct": diagnostico.get("nivel_intervalo"),
        "diagnostico": diagnostico,
        "serie": previsao,
    }


@router.get("/epidemiologia")
def epidemiologia(
    ibge: str = Query(...),
    periodo: str = Query("12 Meses"),
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    codigo = _ibge6(ibge)
    janela = _periodo(periodo)
    municipio = _municipio(codigo)

    casos = _select("sinan_dengue_municipios_total_casos", {"cod_ibge_municipio": codigo, "periodo": janela})
    incidencia = _select("sinan_dengue_municipios_incidencia", {"cod_ibge_municipio": codigo, "periodo": janela})
    taxa_hosp = _select("sinan_dengue_municipios_taxa_hospitalizacao", {"cod_ibge_municipio": codigo, "periodo": janela})
    taxa_obito = _select("sinan_dengue_municipios_taxa_obito", {"cod_ibge_municipio": codigo, "periodo": janela})
    faixa = _select("sinan_dengue_municipios_faixa_etaria", {"cod_ibge_municipio": codigo, "periodo": janela}, order="ordem_faixa.asc")
    genero = _select("sinan_dengue_municipios_distribuicao_genero", {"cod_ibge_municipio": codigo, "periodo": janela})
    sazonalidade = _select(
        "sinan_dengue_municipios_sazonalidade",
        {"cod_ibge_municipio": codigo, "periodo": janela},
        order="mes_ano.asc",
    )
    historico_previsao = _select(
        "sinan_dengue_municipios_sazonalidade",
        {"cod_ibge_municipio": codigo, "periodo": "5 Anos"},
        order="mes_ano.asc",
    )
    previsao = _prever_tres_meses(historico_previsao)
    desfecho = _select("sinan_dengue_municipios_desfecho_clinico_anual", {"cod_ibge_municipio": codigo}, order="ano_referencia.asc")
    cidades = _select("sinan_dengue_municipios_distribuicao_cidade", {"periodo": janela}, order="ranking.asc", limit=20)

    referencias = [
        item.get("data_referencia")
        for grupo in (casos, incidencia, taxa_hosp, taxa_obito, faixa, genero, sazonalidade, historico_previsao, desfecho, cidades)
        for item in grupo
    ]
    tabelas = [
        "sinan_dengue_municipios_total_casos",
        "sinan_dengue_municipios_incidencia",
        "sinan_dengue_municipios_taxa_hospitalizacao",
        "sinan_dengue_municipios_taxa_obito",
        "sinan_dengue_municipios_faixa_etaria",
        "sinan_dengue_municipios_distribuicao_genero",
        "sinan_dengue_municipios_sazonalidade",
        "sinan_dengue_municipios_desfecho_clinico_anual",
        "sinan_dengue_municipios_distribuicao_cidade",
    ]
    return {
        "meta": _meta(tabelas, referencias),
        "municipio": {
            "ibge6": codigo,
            "ibge7": municipio.get("cod_ibge_completo"),
            "nome": municipio.get("nome_municipio"),
            "uf": "SP",
        },
        "periodo": janela,
        "casos": casos[0] if casos else None,
        "incidencia": incidencia[0] if incidencia else None,
        "taxa_hospitalizacao": taxa_hosp[0] if taxa_hosp else None,
        "taxa_obito": taxa_obito[0] if taxa_obito else None,
        "faixa_etaria": faixa,
        "genero": genero,
        "sazonalidade": sazonalidade,
        "previsao_3_meses": previsao,
        "desfecho_anual": desfecho,
        "distribuicao_cidades": cidades,
    }


@router.get("/visao-geral")
def visao_geral(
    ibge: str = Query(...),
    periodo: str = Query("Mes"),
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    periodos = {"Mes", "Trimestre", "Ano"}
    if periodo not in periodos:
        raise HTTPException(400, f"período inválido. Use um de: {sorted(periodos)}")
    visao_estadual = str(ibge).upper() == "TODOS"
    if visao_estadual:
        codigo = "TODOS"
        codigo7 = "TODOS"
        municipio = {"cod_ibge_completo": "TODOS", "nome_municipio": "São Paulo (estado)"}
    else:
        codigo = _ibge6(ibge)
        municipio = _municipio(codigo)
        codigo7 = str(municipio.get("cod_ibge_completo") or "")

    filtro_territorio = {"cod_ibge_completo": codigo7}
    if periodo == "Mes":
        kpis = _select("visao_geral_kpis_atuais", filtro_territorio)
    else:
        kpis = _select("visao_geral_kpis_periodo", {**filtro_territorio, "periodo": periodo})
    serie = _select("visao_geral_kpis_serie", filtro_territorio, order="competencia.asc")
    risco = _select("visao_geral_risco_agregado", filtro_territorio)
    evolucao = _select("visao_geral_evolucao_casos", filtro_territorio, order="competencia.asc")
    if not evolucao:
        evolucao = [
            {**item, "tipo_serie": "HISTORICO", "casos_tendencia": None}
            for item in serie
        ]
    competencia = _select("visao_geral_competencia_referencia", limit=1)
    mapa = _select("visao_geral_mapa_mesorregiao", order="indice_risco_regional.desc")
    categorias = _select("visao_geral_ruptura_categoria", order="pct_distribuicao.desc")
    alertas = _select("visao_geral_alertas_recentes", order="ordem.asc", limit=24)
    grupos = (kpis, serie, risco, evolucao, competencia, mapa, categorias, alertas)
    referencias = [
        item.get("data_processamento") or item.get("competencia_referencia")
        for grupo in grupos for item in grupo
    ]
    tabelas = [
        "visao_geral_kpis_atuais" if periodo == "Mes" else "visao_geral_kpis_periodo",
        "visao_geral_kpis_serie", "visao_geral_risco_agregado",
        "visao_geral_evolucao_casos", "visao_geral_competencia_referencia",
        "visao_geral_mapa_mesorregiao", "visao_geral_ruptura_categoria",
        "visao_geral_alertas_recentes",
    ]
    return {
        "meta": _meta(tabelas, referencias),
        "municipio": {"ibge6": codigo, "ibge7": codigo7, "nome": municipio.get("nome_municipio"), "uf": "SP"},
        "periodo": periodo,
        "competencia": competencia[0] if competencia else None,
        "kpis": kpis[0] if kpis else None,
        "serie": serie,
        "risco": risco[0] if risco else None,
        "evolucao": evolucao,
        "mapa_mesorregiao": mapa,
        "ruptura_categorias": categorias,
        "alertas": alertas,
    }


@router.get("/internacoes")
def internacoes(
    periodo: str = Query("12 Meses"),
    cnes: str = Query("TODOS"),
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    janela = _periodo(periodo)
    filtros = {"periodo": janela}
    volume = _select("sih_dengue_interacoes_periodo", filtros)
    permanencia = _select("sih_dengue_permanencia_media_periodo", filtros)
    mortalidade = _select("sih_dengue_taxa_mortalidade_periodo", filtros)
    top_hospitais = _select("sih_dengue_top_hospitais", filtros, order="ranking.asc")
    top_municipios = _select("sih_dengue_top_municipios", filtros, order="ranking.asc")
    faixa = _select("sih_dengue_internacoes_faixa_etaria", filtros, order="ordem_faixa.asc")

    estabelecimentos = sorted(
        (
            {"cnes": str(item.get("cnes")), "razao_social": item.get("razao_social") or item.get("nome_hospital") or str(item.get("cnes"))}
            for item in volume
            if item.get("cnes") and item.get("cnes") != "TODOS"
        ),
        key=lambda item: item["razao_social"],
    )
    cnes_selecionado = str(cnes or "TODOS")
    if cnes_selecionado != "TODOS" and not any(item["cnes"] == cnes_selecionado for item in estabelecimentos):
        raise HTTPException(404, "Estabelecimento não encontrado na base SIH para o período selecionado")
    consolidado = next((item for item in volume if str(item.get("cnes")) == cnes_selecionado), None)
    permanencia_total = next((item for item in permanencia if str(item.get("cnes")) == cnes_selecionado), None)
    mortalidade_total = next((item for item in mortalidade if str(item.get("cnes")) == cnes_selecionado), None)
    referencias = [
        item.get("data_referencia")
        for grupo in (volume, permanencia, mortalidade, top_hospitais, top_municipios, faixa)
        for item in grupo
    ]
    tabelas = [
        "sih_dengue_interacoes_periodo",
        "sih_dengue_permanencia_media_periodo",
        "sih_dengue_taxa_mortalidade_periodo",
        "sih_dengue_top_hospitais",
        "sih_dengue_top_municipios",
        "sih_dengue_internacoes_faixa_etaria",
    ]
    return {
        "meta": _meta(tabelas, referencias),
        "periodo": janela,
        "cnes": cnes_selecionado,
        "estabelecimentos": estabelecimentos,
        "consolidado": consolidado,
        "permanencia": permanencia_total,
        "mortalidade": mortalidade_total,
        "hospitais": top_hospitais,
        "municipios": top_municipios,
        "faixa_etaria": faixa,
    }


@router.get("/vacinacao")
def vacinacao(
    ibge: str = Query(...),
    periodo: str = Query("12 Meses"),
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    codigo = _ibge6(ibge)
    janela = _periodo(periodo)
    municipio = _municipio(codigo)
    filtros = {"cod_ibge_municipio": codigo, "periodo": janela}

    doses = _select("vacinacao_dengue_municipios", filtros)
    incidencia = _select("vacinacao_x_incidencia_dengue", filtros)
    hospitalar = _select("vacinacao_x_sih_dengue", filtros)
    faixa = _select("vacinacao_dengue_faixa_etaria", filtros)
    comparativo = _select("vacinacao_x_incidencia_dengue", {"periodo": janela}, order="doses_aplicadas.desc", limit=645)

    referencias = [
        item.get("data_referencia")
        for grupo in (doses, incidencia, hospitalar, faixa, comparativo)
        for item in grupo
    ]
    tabelas = [
        "vacinacao_dengue_municipios",
        "vacinacao_x_incidencia_dengue",
        "vacinacao_x_sih_dengue",
        "vacinacao_dengue_faixa_etaria",
    ]
    return {
        "meta": _meta(tabelas, referencias),
        "municipio": {
            "ibge6": codigo,
            "ibge7": municipio.get("cod_ibge_completo"),
            "nome": municipio.get("nome_municipio"),
            "uf": "SP",
        },
        "periodo": janela,
        "doses": doses[0] if doses else None,
        "incidencia": incidencia[0] if incidencia else None,
        "hospitalar_estadual": hospitalar[0] if hospitalar else None,
        "faixa_etaria": faixa,
        "comparativo_municipios": comparativo,
        "limitacoes": [
            "A vacina contra dengue integra o calendário do SUS desde 2025; janelas longas ainda cobrem uma série curta.",
            "O cruzamento com SIH é estadual, não municipal.",
            "Associação entre vacinação e desfechos não demonstra causalidade.",
        ],
    }


def _agrupar_alertas(linhas: list[dict]) -> list[dict]:
    grupos: dict[tuple[str, str], dict] = {}
    for linha in linhas:
        chave = (str(linha.get("insumo_padronizado") or ""), str(linha.get("unidade_fornecimento") or ""))
        atual = grupos.get(chave)
        if atual is None or int(linha.get("pontos_risco_aquisicao") or 0) > int(atual.get("pontos_risco_aquisicao") or 0):
            grupos[chave] = linha
    return sorted(
        grupos.values(),
        key=lambda item: (-int(item.get("pontos_risco_aquisicao") or 0), str(item.get("insumo_padronizado") or "")),
    )


@router.get("/ruptura")
def ruptura(
    ibge: str = Query(...),
    periodo: str = Query("12 Meses"),
    _user: dict = Depends(require_user),
) -> dict[str, Any]:
    codigo = _ibge6(ibge)
    janela = _periodo(periodo)
    municipio = _municipio(codigo)
    codigo7 = str(municipio.get("cod_ibge_completo") or "")

    resumo = _select("ruptura_insumos_resumo_periodo", {"cod_ibge_completo": codigo7, "periodo": janela})
    alertas_raw = _select("ruptura_insumos_alertas_atuais", {"cod_ibge_completo": codigo7})
    serie = _select("ruptura_insumos_serie_mensal", {"cod_ibge_completo": codigo7}, order="competencia.asc")
    competencia = _select("ruptura_insumos_competencia_referencia", limit=1)
    alertas = _agrupar_alertas(alertas_raw)
    referencias = [
        item.get("data_processamento") or item.get("competencia_referencia")
        for grupo in (resumo, alertas, serie, competencia)
        for item in grupo
    ]
    tabelas = [
        "ruptura_insumos_resumo_periodo",
        "ruptura_insumos_alertas_atuais",
        "ruptura_insumos_serie_mensal",
        "ruptura_insumos_competencia_referencia",
    ]
    return {
        "meta": _meta(tabelas, referencias),
        "municipio": {
            "ibge6": codigo,
            "ibge7": codigo7,
            "nome": municipio.get("nome_municipio"),
            "uf": "SP",
        },
        "periodo": janela,
        "competencia": competencia[0] if competencia else None,
        "resumo": resumo[0] if resumo else None,
        "alertas": alertas,
        "serie_mensal": serie,
        "metodologia": {
            "tipo": "risco de aquisição",
            "nao_e": "estoque físico ou previsão de dias restantes",
            "fontes": ["SINAN", "SIH", "compras públicas curadas"],
        },
    }
