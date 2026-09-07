"""
Tools parametrizadas da Clara.

Cada factory fixa o `ibge6` por closure e devolve funções que retornam sempre `dict`.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
import sqlite3
from contextvars import ContextVar
from functools import wraps
import hashlib
import json
import logging
from pathlib import Path
import uuid

_LOG = logging.getLogger("sus_predict.clara.consultas")
_REVISAO_TOOLS = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]
_CONSULTA = ContextVar("clara_consulta", default=None)


def _log_consulta(evento: str, **campos) -> None:
    contexto = _CONSULTA.get()
    if contexto is None:
        return
    contexto.update(campos)
    # JSON no corpo: funciona também com o formatter textual do Uvicorn/systemd.
    _LOG.warning(json.dumps({"evento": evento, **contexto}, ensure_ascii=False))


def _registrar_consulta(tabela, filtros_sql, linhas, filtros_pos_consulta=None,
                        linhas_apos_filtros=None, origem="sqlite", **extra):
    contexto = _CONSULTA.get()
    if contexto is not None:
        contexto.update(
            tabela=tabela, origem=origem, filtros_sql=filtros_sql,
            filtros_pos_consulta=filtros_pos_consulta or {},
            linhas_retornadas=linhas, linhas_apos_filtros=linhas_apos_filtros,
            **extra,
        )


def _instrumentar(nome, funcao, municipio_recebido, ibge):
    @wraps(funcao)
    def executar(*args, **kwargs):
        token = _CONSULTA.set({
            "consulta_id": uuid.uuid4().hex,
            "revisao_tools": _REVISAO_TOOLS,
            "ferramenta": nome,
            "municipio_id_recebido": municipio_recebido,
            "ibge6_consultado": ibge,
            "origem": None, "tabela": None,
            "filtros_sql": {}, "filtros_pos_consulta": {},
            "linhas_retornadas": None, "linhas_apos_filtros": None,
        })
        try:
            _log_consulta("clara_ferramenta_iniciada")
            resultado = funcao(*args, **kwargs)
            _log_consulta("clara_ferramenta_concluida", encontrado=resultado.get("encontrado"))
            return resultado
        except Exception as exc:
            # Não registrar pergunta, SQL livre, credenciais ou conteúdo da exceção.
            _log_consulta("clara_ferramenta_erro", erro_tipo=type(exc).__name__)
            raise
        finally:
            _CONSULTA.reset(token)
    return executar

from api.core import db
from api.core.prompts import TEXTO_SOBRE_O_PROJETO
from api.core.sql_guard import validar_sql

_SISTEMAS_VALIDOS = {"SIM", "SIH", "SINASC", "SIA", "SINAN"}

# Tabelas curadas do Supabase — as mesmas que /api/dados/epidemiologia e
# /api/dados/internacoes leem. SINAN é municipal; SIH é por CNES com consolidado
# estadual ("TODOS"). Só dengue está curada.
_TABELAS_SINAN_KPI = (
    "sinan_dengue_municipios_total_casos",
    "sinan_dengue_municipios_incidencia",
    "sinan_dengue_municipios_taxa_hospitalizacao",
    "sinan_dengue_municipios_taxa_obito",
)
_TABELA_SINAN_ANUAL = "sinan_dengue_municipios_desfecho_clinico_anual"
_TABELAS_SIH_KPI = (
    "sih_dengue_interacoes_periodo",
    "sih_dengue_permanencia_media_periodo",
    "sih_dengue_taxa_mortalidade_periodo",
)
_COLUNAS_FILTRO = {"id", "cod_ibge_municipio", "cod_ibge_completo", "periodo", "cnes", "created_at"}

MSG_SEM_FONTE_ESTOQUE = (
    "Não há fonte de estoque físico conectada ao SusPredict para este município — a Clara "
    "não consegue informar quantidade disponível, consumo médio ou dias de cobertura. "
    "A tela de Insumos mostra risco de aquisição (indicador de ruptura), que não é estoque."
)
ACAO_SEM_FONTE_ESTOQUE = (
    "Consulte a tela de Insumos para o risco de aquisição. Para estoque físico é preciso "
    "integrar o sistema de almoxarifado do município."
)


def _janela_curada(ano_ini: int | None, ano_fim: int | None) -> str:
    """Mapeia o intervalo pedido para a janela das tabelas curadas."""
    if ano_ini is None and ano_fim is None:
        return "12 Meses"
    ini = int(ano_ini if ano_ini is not None else ano_fim)
    fim = int(ano_fim if ano_fim is not None else ano_ini)
    span = fim - ini + 1
    return "12 Meses" if span <= 1 else ("3 Anos" if span <= 3 else "5 Anos")


def _e_dengue(doenca_cod: str | None) -> bool:
    cod = str(doenca_cod or "").strip().upper()
    return not cod or cod.startswith("A9") or "DENGUE" in cod


def _kpis(rows: list[dict]) -> dict:
    stats: dict = {}
    for row in rows:
        stats.update({k: v for k, v in row.items() if k not in _COLUNAS_FILTRO})
    return stats


def _normalizar_ibge6(ibge6: str) -> str:
    return str(ibge6 or "").strip()[:6]


LIMIAR_DADO_DESATUALIZADO_DIAS = 15


def _status_estoque(dias_restantes: float | None) -> str:
    if dias_restantes is None:
        return "indisponivel"
    if dias_restantes <= 7:
        return "critico"
    if dias_restantes <= 15:
        return "alerta"
    return "ok"


def _calcular_dias_restantes(row: dict) -> float | None:
    consumo = float(row.get("consumo_medio_dia") or 0)
    quantidade = float(row.get("quantidade_atual") or 0)
    if consumo <= 0 or quantidade < 0:
        return None
    return round(quantidade / consumo, 1)


def _defasagem_dias(valor: str | None) -> int | None:
    if not valor:
        return None
    try:
        data = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
        if data.tzinfo is None:
            data = data.replace(tzinfo=timezone.utc)
        return max(0, (datetime.now(timezone.utc) - data).days)
    except (TypeError, ValueError):
        return None


def _qualidade_cobertura(row: dict, dias_restantes: float | None) -> dict:
    defasagem = _defasagem_dias(row.get("atualizado_em"))
    faltantes = []
    if float(row.get("quantidade_atual") or 0) < 0:
        faltantes.append("estoque atual válido")
    if float(row.get("consumo_medio_dia") or 0) <= 0:
        faltantes.append("consumo médio local")

    desatualizado = defasagem is None or defasagem > LIMIAR_DADO_DESATUALIZADO_DIAS
    confianca = "indisponível" if dias_restantes is None else ("reduzida" if desatualizado else "moderada")
    return {
        "tipo_calculo": "cobertura_estoque",
        "rotulo_calculo": "Cobertura de estoque",
        "formula": "quantidade_atual / consumo_medio_dia",
        "fonte": "Estoque local informado pelo município",
        "competencia": row.get("atualizado_em"),
        "defasagem_dias": defasagem,
        "confianca": confianca,
        "calculo_disponivel": dias_restantes is not None,
        "entradas_faltantes": faltantes,
        "premissas": [
            "consumo médio diário permanece constante",
            "não considera pedidos em trânsito",
        ],
        "limitacoes": [
            "não é previsão de abastecimento",
            "protocolo caso→insumo ainda não validado pela equipe de dados/domínio",
            "não incorpora severidade clínica, lead time ou margem de segurança",
        ],
    }


def _enriquecer_estoque(rows: list[dict]) -> list[dict]:
    itens: list[dict] = []
    for row in rows:
        dias_restantes = _calcular_dias_restantes(row)
        qualidade = _qualidade_cobertura(row, dias_restantes)
        itens.append(
            {
                "ibge6": row.get("ibge6"),
                "item": row.get("item"),
                "quantidade_atual": row.get("quantidade_atual"),
                "consumo_medio_dia": row.get("consumo_medio_dia"),
                "atualizado_em": row.get("atualizado_em"),
                "dias_restantes": dias_restantes,
                "status": _status_estoque(dias_restantes),
                "qualidade": qualidade,
            }
        )
    return itens


def _resposta_vazia(motivo: str, **extra) -> dict:
    _log_consulta("clara_consulta_sem_resultado")
    payload = {"encontrado": False, "motivo": motivo}
    payload.update(extra)
    return payload


def criar_susbot_tools(ibge6: str, permitidas=None) -> dict[str, Callable]:
    """Cria as tools da Clara com o município fixado por closure.

    `permitidas` (docs/09, barreira 3): quando informado, o dict só contém as
    ferramentas do perfil — o resto não existe no processo. None = todas (uso
    interno e testes; os routers sempre passam `acesso.ferramentas`).
    """

    ibge = _normalizar_ibge6(ibge6)

    def _buscar_estoque_por_item(item: str | None) -> tuple[list[dict], list[dict]]:
        # Busca por substring (case-insensitive), não exata: o modelo tende a mandar
        # "dipirona" quando o item cadastrado é "Dipirona 500mg" — match exato
        # devolvia vazio sempre que faltava a dosagem/forma.
        # Devolve (todas as linhas do município, linhas após o filtro por item) para
        # distinguir "não há fonte de estoque" de "há estoque, mas não esse item".
        _registrar_consulta("estoque", {"ibge6": ibge}, None)
        rows = db.get_estoque(ibge)
        alvo = str(item or "").strip().casefold()
        filtradas = [row for row in rows if alvo in str(row.get("item") or "").casefold()] if item else rows
        _registrar_consulta("estoque", {"ibge6": ibge}, len(rows),
                            {"item_substring_casefold": alvo} if item else {}, len(filtradas))
        return rows, filtradas

    def consultar_estoque(item: str | None = None, somente_risco: bool = False, **_kwargs) -> dict:
        todas, rows = _buscar_estoque_por_item(item)
        if not todas:
            return _resposta_vazia(
                MSG_SEM_FONTE_ESTOQUE,
                ibge6=ibge,
                item=item,
                base_disponivel=False,
                acao_sugerida=ACAO_SEM_FONTE_ESTOQUE,
                dados=[],
            )
        if not rows:
            return _resposta_vazia(
                f"Há estoque cadastrado para este município, mas nenhum item com nome contendo '{item}'.",
                ibge6=ibge,
                item=item,
                base_disponivel=True,
                dados=[],
            )

        dados = _enriquecer_estoque(rows)
        if somente_risco:
            dados = [dado for dado in dados if dado["status"] in {"critico", "alerta"}]
            contexto = _CONSULTA.get()
            if contexto is not None:
                contexto["filtros_pos_consulta"]["somente_risco"] = True
                contexto["linhas_apos_filtros"] = len(dados)
            if not dados:
                return _resposta_vazia(
                    "O estoque foi consultado e não há itens críticos ou em alerta neste momento.",
                    ibge6=ibge,
                    item=item,
                    somente_risco=True,
                    base_disponivel=True,
                    dados=[],
                )
        return {
            "encontrado": True,
            "ibge6": ibge,
            "item": item,
            "somente_risco": somente_risco,
            "base_disponivel": True,
            "total_itens": len(dados),
            "dados": dados,
        }

    def consultar_alertas(status: str | None = None, tipo: str | None = None, **_kwargs) -> dict:
        filtros = {"ibge6": ibge}
        if status:
            filtros["status"] = status
        if tipo:
            filtros["tipo"] = tipo
        _registrar_consulta("alertas", filtros, None)
        rows = db.get_alertas(ibge, status=status, tipo=tipo)
        _registrar_consulta("alertas", filtros, len(rows), linhas_apos_filtros=len(rows))
        if not rows:
            return _resposta_vazia(
                "Nenhum alerta encontrado para os filtros informados.",
                ibge6=ibge,
                status=status,
                tipo=tipo,
                dados=[],
            )

        return {
            "encontrado": True,
            "ibge6": ibge,
            "status": status,
            "tipo": tipo,
            "total_alertas": len(rows),
            "dados": rows,
        }

    def _sb(tabela: str, filtros: dict, order: str | None = None) -> list[dict]:
        # Município, período e ano vão na query do PostgREST; sem limite (sb_select
        # pagina até o fim). Nada é filtrado em Python depois de um corte.
        _registrar_consulta(tabela, filtros, None, origem="supabase", limite=None)
        rows = db.sb_select(tabela, filtros, order=order)
        _registrar_consulta(tabela, filtros, len(rows), linhas_apos_filtros=len(rows),
                            origem="supabase", limite=None)
        return rows

    def _epidemiologia_sinan(janela, ano_ini, ano_fim, escopo_solicitado, comum) -> dict:
        filtros = {"cod_ibge_municipio": ibge, "periodo": janela}
        stats = _kpis([row for tabela in _TABELAS_SINAN_KPI for row in _sb(tabela, filtros)])

        filtro_anual = {"cod_ibge_municipio": ibge}
        if ano_ini is not None:
            filtro_anual["ano_referencia__gte"] = int(ano_ini)
        if ano_fim is not None:
            filtro_anual["ano_referencia__lte"] = int(ano_fim)
        serie = [
            {
                "ano": row.get("ano_referencia"),
                "total": (row.get("casos_leves") or 0) + (row.get("hospitalizacoes") or 0) + (row.get("obitos") or 0),
                "tipo": "real",
            }
            for row in _sb(_TABELA_SINAN_ANUAL, filtro_anual, order="ano_referencia.asc")
        ]
        if not stats and not serie:
            return _resposta_vazia(
                f"A base SINAN (dengue) não tem linha para este município na janela '{janela}'. "
                "Isso não significa que o total seja zero; significa que as tabelas curadas do "
                "SusPredict não têm consulta disponível para responder com segurança.",
                acao_sugerida="Confira a tela de Epidemiologia com outro período.",
                periodo=janela, **comum,
            )
        anos = [int(p["ano"]) for p in serie if p.get("ano") is not None]
        return {
            "encontrado": True,
            "ibge6": ibge,
            "sistema": "SINAN",
            "ano_ini": ano_ini if ano_ini is not None else (min(anos) if anos else None),
            "ano_fim": ano_fim if ano_fim is not None else (max(anos) if anos else None),
            "doenca_cod": comum["doenca_cod"] or "A90",
            "escopo_solicitado": escopo_solicitado,
            "periodo": janela,
            "granularidade": "municipal",
            "dados": {
                "meta": {"fonte": "Supabase", "tabelas": [*_TABELAS_SINAN_KPI, _TABELA_SINAN_ANUAL],
                         "dados_reais": True, "periodo": janela},
                "stats": {"janela": janela, **stats},
                "serie_temporal": serie,
            },
        }

    def _internacoes_sih(janela, ano_ini, ano_fim, escopo_solicitado, comum) -> dict:
        # SIH curado é por estabelecimento (CNES) do estado de SP; não há recorte
        # municipal. Responde o consolidado estadual e diz isso no próprio dado.
        filtros = {"periodo": janela, "cnes": "TODOS"}
        stats = _kpis([row for tabela in _TABELAS_SIH_KPI for row in _sb(tabela, filtros)])
        if not stats:
            return _resposta_vazia(
                f"A base SIH (internações por dengue) não tem consolidado para a janela '{janela}'. "
                "Isso não significa que o total seja zero; significa que as tabelas curadas do "
                "SusPredict não têm consulta disponível para responder com segurança.",
                acao_sugerida="Confira a tela de Internações com outro período.",
                periodo=janela, **comum,
            )
        return {
            "encontrado": True,
            "ibge6": ibge,
            "sistema": "SIH",
            "ano_ini": ano_ini,
            "ano_fim": ano_fim,
            "doenca_cod": comum["doenca_cod"] or "A90",
            "escopo_solicitado": escopo_solicitado,
            "periodo": janela,
            "granularidade": "estadual",
            "dados": {
                "meta": {"fonte": "Supabase", "tabelas": list(_TABELAS_SIH_KPI),
                         "dados_reais": True, "periodo": janela},
                "stats": {
                    "abrangencia": "Estado de SP, consolidado de todos os estabelecimentos (SIH não tem recorte municipal)",
                    "janela": janela,
                    **stats,
                },
                "serie_temporal": [],
            },
        }

    def consultar_epidemiologia(
        sistema: str | None = None,
        ano_ini: int | None = None,
        ano_fim: int | None = None,
        doenca_cod: str | None = None,
        escopo_solicitado: str | None = None,
        **_kwargs,
    ) -> dict:
        sistema_norm = str(sistema or "").strip().upper()
        if sistema_norm not in _SISTEMAS_VALIDOS:
            return _resposta_vazia(
                "Sistema inválido para consulta epidemiológica.",
                ibge6=ibge,
                sistema=sistema,
            )
        comum = {
            "ibge6": ibge, "sistema": sistema_norm, "ano_ini": ano_ini, "ano_fim": ano_fim,
            "doenca_cod": doenca_cod, "base_disponivel": False,
        }
        if sistema_norm not in {"SINAN", "SIH"}:
            return _resposta_vazia(
                f"A base {sistema_norm} não tem tabela curada no SusPredict. A Clara responde "
                "SINAN (casos de dengue por município) e SIH (internações por dengue).",
                **comum,
            )
        if not _e_dengue(doenca_cod):
            return _resposta_vazia(
                f"As tabelas curadas cobrem apenas dengue (CID A90/A91); não há dado para '{doenca_cod}'.",
                **comum,
            )
        if not db.supabase_configured():
            return _resposta_vazia(
                f"Fonte Supabase indisponível neste ambiente; sem ela a Clara não consulta a base {sistema_norm}.",
                **comum,
            )
        janela = _janela_curada(ano_ini, ano_fim)
        try:
            if sistema_norm == "SINAN":
                return _epidemiologia_sinan(janela, ano_ini, ano_fim, escopo_solicitado, comum)
            return _internacoes_sih(janela, ano_ini, ano_fim, escopo_solicitado, comum)
        except RuntimeError as exc:
            # Mensagem do Supabase pode carregar URL/corpo: só o tipo vai pro log.
            _log_consulta("clara_ferramenta_erro", erro_tipo=type(exc).__name__)
            return _resposta_vazia(
                "A consulta ao Supabase falhou agora; tente novamente em instantes.",
                periodo=janela, **comum,
            )

    def gerar_etp(item: str, alerta_id: str | None = None, **_kwargs) -> dict:
        todas, rows = _buscar_estoque_por_item(item)
        if not todas:
            return _resposta_vazia(
                f"Não é possível fundamentar o ETP de '{item}': não há fonte de estoque físico "
                "(quantidade, consumo, cobertura) conectada ao SusPredict para este município. "
                "O risco de aquisição da tela de Insumos não substitui esse dado e não deve ser "
                "usado para dimensionar compra.",
                ibge6=ibge,
                item=item,
                base_disponivel=False,
                acao_sugerida=ACAO_SEM_FONTE_ESTOQUE,
            )
        if not rows:
            return _resposta_vazia(
                f"Há estoque cadastrado para este município, mas nenhum item com nome contendo "
                f"'{item}' — não é possível fundamentar o ETP sem dado de consumo/cobertura.",
                ibge6=ibge,
                item=item,
                base_disponivel=True,
            )

        estoque = _enriquecer_estoque(rows)[0]
        if estoque["dias_restantes"] is None:
            return _resposta_vazia(
                "Cálculo indisponível: informe um consumo médio local maior que zero antes de preparar o ETP.",
                ibge6=ibge,
                item=item,
                qualidade=estoque["qualidade"],
            )
        justificativa = (
            f"Estoque de {estoque['item']} com cobertura estimada de {estoque['dias_restantes']} "
            f"dias, com base no consumo médio diário de {estoque['consumo_medio_dia']} unidades "
            f"(atualizado em {estoque['atualizado_em']}; confiança "
            f"{estoque['qualidade']['confianca']}). Recomenda-se revisão humana antes de iniciar "
            "o processo. Este cálculo de cobertura não incorpora protocolo caso→insumo, "
            "pedidos em trânsito, lead time ou margem de segurança."
        )
        registro = db.criar_etp(ibge, item, justificativa, alerta_id=alerta_id, origem="susbot")
        return {
            "encontrado": True,
            "ibge6": ibge,
            "etp_id": registro["id"],
            "item": item,
            "alerta_id": alerta_id,
            "dias_restantes": estoque["dias_restantes"],
            "justificativa": justificativa,
            "qualidade": estoque["qualidade"],
            "criado_em": registro["criado_em"],
        }

    def executar_sql_fallback(query: str, **_kwargs) -> dict:
        ok, motivo = validar_sql(query)
        if not ok:
            return _resposta_vazia(motivo, sql=query, dados=[])

        try:
            with db._conn() as con:  # pylint: disable=protected-access
                cursor = con.execute(query)
                rows = cursor.fetchall()
                colunas = [col[0] for col in (cursor.description or [])]
        except sqlite3.Error as exc:
            return _resposta_vazia(f"Falha ao executar SQL: {exc}", sql=query, dados=[])

        dados = [dict(row) for row in rows]
        return {
            "encontrado": bool(dados),
            "sql": query,
            "colunas": colunas,
            "total_linhas": len(dados),
            "dados": dados,
            "motivo": "" if dados else "Consulta executada sem linhas retornadas.",
        }

    def sobre_o_projeto(**_kwargs) -> dict:
        """Texto curado a mao sobre o SUS Predict. Nao consulta banco nem LLM."""

        return {"encontrado": True, "texto": TEXTO_SOBRE_O_PROJETO}

    todas = {
        "consultar_estoque": consultar_estoque,
        "consultar_alertas": consultar_alertas,
        "consultar_epidemiologia": consultar_epidemiologia,
        "gerar_etp": gerar_etp,
        "sobre_o_projeto": sobre_o_projeto,
        "executar_sql_fallback": executar_sql_fallback,
    }
    todas = {nome: _instrumentar(nome, fn, ibge6, ibge) for nome, fn in todas.items()}
    if permitidas is None:
        return todas
    return {nome: fn for nome, fn in todas.items() if nome in set(permitidas)}


# Ferramentas que alteram estado — exigem confirmação humana explícita antes de
# executar (docs/06-agente-clara.md, requisito inegociável do briefing de
# reposicionamento). Todo o resto é leitura e roda direto.
FERRAMENTAS_ESCRITA = {"gerar_etp"}
