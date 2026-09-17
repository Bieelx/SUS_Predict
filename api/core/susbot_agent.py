"""
Agente da Clara com stream SSE.

O fluxo usa uma cascata de custo:
1. Roteamento local para intenções operacionais de alta confiança
2. Planejamento por LLM somente para perguntas não resolvidas localmente
3. Execução da tool escolhida
4. Redação final por LLM ancorada no payload da tool; recusa e texto institucional
   continuam sendo gerados em código, sem LLM

LangGraph e Gemini entram por adaptação opcional. Nos testes, o LLM pode ser
substituído por um mock simples com `planejar()` e `stream_resposta()`.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Iterable

from api.core.prompts import (
    FERRAMENTAS_PLANEJAVEIS,
    limpar_vazios,
    MENSAGEM_FORA_DO_ESCOPO,
    MENSAGEM_IDENTIDADE,
    resposta_social,
    resposta_apresentacao,
    texto_capacidades,
    SYSTEM_PROMPT_RESPOSTA,
    montar_mensagem_resposta,
    system_prompt_planejador,
)
from api.core.permissoes import mensagem_ferramenta_negada
from api.core.clara_model_policy import RACIOCINIO_AVANCADO, perfil_para_plano
from api.core.susbot_tools import FERRAMENTAS_ESCRITA, criar_susbot_tools
from api.core.susbot_intents import (
    normalizar_texto, rotear_intencao, rotear_com_contexto, tipo_conversa_social,
    pede_retomada, pede_capacidades, eh_abertura_apresentacao,
)
from api.core.susbot_metrics import (
    registrar_execucao,
    registrar_falha_fidelidade,
    registrar_fallback_llm,
)

log = logging.getLogger("sus_predict.susbot_agent")

try:  # pragma: no cover - depende do ambiente final da fase 7
    from langgraph.graph import END, StateGraph
    LANGGRAPH_OK = True
except Exception:  # pragma: no cover - fallback para o ambiente de testes atual
    END = "__end__"
    StateGraph = None
    LANGGRAPH_OK = False


_REFERENCIAS = {
    "consultar_aquisicoes": {"rota": "/alertas", "label": "ver em Alertas →"},
    "consultar_estoque": {"rota": "/insumos", "label": "ver em Insumos →"},
    "consultar_alertas": {"rota": "/alertas", "label": "ver em Alertas →"},
    "consultar_epidemiologia": {"rota": "/epidemiologia", "label": "ver em Epidemiologia →"},
    "consultar_leitos_internacoes": {"rota": "/internacoes", "label": "ver em Internações →"},
}

def _ibge6(valor: str) -> str:
    return str(valor or "").strip()[:6]


# Frases de apresentação do próprio usuário (texto já normalizado, sem acento).
_RE_APRESENTACAO = (
    r"\b(?:meu nome e|me chamo|pode me chamar de|sou (?:de|da|do|o|a)\b|moro (?:em|na|no)|"
    r"trabalho (?:na|no|com|em|como)|cuido (?:da|do|de)|prefiro respostas?)"
)


def _normalizar_intencao(texto: str) -> str:
    return normalizar_texto(texto)


def montar_historico_recente(mensagens: list[dict[str, Any]], limite: int = 8) -> list[dict[str, str]]:
    """Converte registros do banco (mais novos primeiro) em contexto seguro e cronológico."""

    historico: list[dict[str, str]] = []
    for mensagem in reversed(mensagens[:limite]):
        pergunta = str(mensagem.get("pergunta") or "").strip()
        resposta = str(mensagem.get("resposta") or "").strip()
        # Conversas antigas podem conter o identificador que o agente expunha antes da correção.
        resposta = re.sub(r"\bdev-[A-Za-z0-9_-]+\b", "[identificador interno ocultado]", resposta)
        if pergunta or resposta:
            historico.append({"pergunta": pergunta, "resposta": resposta})
    return historico


def _jsonable(valor: Any) -> Any:
    if isinstance(valor, dict):
        return {chave: _jsonable(item) for chave, item in valor.items()}
    if isinstance(valor, list):
        return [_jsonable(item) for item in valor]
    if isinstance(valor, tuple):
        return [_jsonable(item) for item in valor]
    return valor


def _sse(evento: str, dados: dict[str, Any]) -> str:
    return f"event: {evento}\ndata: {json.dumps(_jsonable(dados), ensure_ascii=False)}\n\n"


_RE_DATA_NUMERICA = re.compile(
    r"(?<!\d)(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})(?!\d)"
)
_RE_NUMERO = re.compile(
    r"(?<![\w])[-+]?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?%?(?![\w])"
)


def _normalizar_data_numerica(texto: str) -> str | None:
    for formato in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(texto, formato).date().isoformat()
        except ValueError:
            continue
    return None


def _normalizar_numero_textual(texto: str) -> str | None:
    bruto = texto.rstrip("%").replace(".", "").replace(",", ".")
    try:
        valor = Decimal(bruto)
    except InvalidOperation:
        return None
    return format(valor.normalize(), "f")


def _numeros_em_texto(texto: str) -> set[tuple[str, str]]:
    """Extrai datas e números em notação pt-BR, normalizados para comparação."""

    encontrados: set[tuple[str, str]] = set()
    spans_datas = []
    for match in _RE_DATA_NUMERICA.finditer(texto):
        data = _normalizar_data_numerica(match.group())
        if data:
            encontrados.add(("data", data))
            spans_datas.append(match.span())
    for match in _RE_NUMERO.finditer(texto):
        if any(inicio <= match.start() and match.end() <= fim for inicio, fim in spans_datas):
            continue
        numero = _normalizar_numero_textual(match.group())
        if numero is not None:
            encontrados.add(("numero", numero))
    return encontrados


def _numeros_na_fonte(valor: Any) -> set[tuple[str, str]]:
    encontrados: set[tuple[str, str]] = set()
    if isinstance(valor, dict):
        for item in valor.values():
            encontrados.update(_numeros_na_fonte(item))
    elif isinstance(valor, (list, tuple, set)):
        for item in valor:
            encontrados.update(_numeros_na_fonte(item))
    elif isinstance(valor, bool) or valor is None:
        pass
    elif isinstance(valor, (int, float, Decimal)):
        try:
            numero = abs(Decimal(str(valor)))
        except InvalidOperation:
            return encontrados
        # Formas legítimas do mesmo número: sinal na palavra ("queda de 89,65%"),
        # arredondado ("89,7%") e em mil/milhões ("65 mil", "11,9 milhões").
        # ponytail: variantes por escala podem casar um número pequeno por acaso;
        # se isso aparecer, parsear "mil/milhões" no texto em vez de gerar variantes.
        variantes = {Decimal(str(valor)), numero}
        for escala in (1, 1000, 1_000_000):
            for casas in (0, 1):
                variantes.add(round(numero / escala, casas))
        encontrados.update(("numero", format(v.normalize(), "f")) for v in variantes)
    else:
        texto = str(valor)
        encontrados.update(_numeros_em_texto(texto))
        # Ano de uma data da fonte ("em 2025") é o mesmo dado, não número novo.
        encontrados.update(("numero", ano) for ano in re.findall(r"(?<!\d)(\d{4})-\d{2}-\d{2}", texto))
    return encontrados


# Constantes de unidade, não dados: "por 100 mil habitantes", "a cada 1.000".
_NUMEROS_DE_UNIDADE = {("numero", "100"), ("numero", "1000"), ("numero", "100000")}


def _resposta_numericamente_fiel(
    resposta: str,
    artefato: dict[str, Any] | None,
    resultado_ferramenta: dict[str, Any] | None,
) -> bool:
    citados = _numeros_em_texto(resposta)
    fonte = _numeros_na_fonte(artefato) | _numeros_na_fonte(resultado_ferramenta)
    return citados <= fonte | _NUMEROS_DE_UNIDADE


# "Olhei aqui e não achei nada de alerta aberto" saía para consultas que TINHAM dado:
# o modelo local copiava a frase de exemplo do prompt em vez de ler o resultado.
_RE_NEGACAO_DE_DADO = re.compile(
    r"n[ãa]o (?:achei|encontrei|localizei|consegui encontrar|h[áa]|tem|temos|existe|consta|"
    r"foi encontrado|foram encontrados|ha registro)"
    r"|nenhum(?:a|as|os)?\b"
    r"|sem (?:dados|registro|registros|resultado|resultados|informa)",
    re.IGNORECASE,
)


def _nega_dado_existente(resposta: str, resultado_ferramenta: dict[str, Any] | None) -> bool:
    """A ferramenta trouxe dado e o texto afirma que não há: resposta inválida."""

    if not resultado_ferramenta or not resultado_ferramenta.get("encontrado"):
        return False
    return bool(_RE_NEGACAO_DE_DADO.search(resposta))


# Recusa e texto institucional continuam saindo em código, nunca pelo LLM: são a
# garantia de que a indisponibilidade é dita com as palavras exatas da ferramenta.
def _resposta_deterministica(ferramenta: str, resultado: dict[str, Any] | None) -> str | None:
    if not resultado:
        return None

    if not resultado.get("encontrado"):
        motivo = str(resultado.get("motivo") or "Não encontrei esse dado para este município.")
        acao = str(resultado.get("acao_sugerida") or "").strip()
        return f"{motivo}\n\n**Próximo passo:** {acao}" if acao else motivo

    if ferramenta == "consultar_aquisicoes":
        linhas = [f"**Risco de aquisição · {resultado.get('periodo', '')}**"]
        for item in resultado.get("dados", [])[:20]:
            linhas.append(f"- **{item.get('insumo_padronizado') or 'Insumo'}** ({item.get('unidade_fornecimento') or 'unidade não informada'}): {item.get('faixa_risco_aquisicao') or 'risco não informado'}. {item.get('mensagem_analitica') or ''}")
        if not resultado.get("dados"):
            linhas.append("A fonte não retornou alertas para este recorte. Isso não confirma estoque disponível.")
        competencia = resultado.get("competencia") or {}
        linhas.append(f"Competência: {competencia.get('competencia_referencia') or 'não informada'}. Fonte: compras públicas curadas, a mesma da Central de Alertas.")
        linhas.append("Esses sinais representam risco de aquisição; não medem estoque físico, consumo ou dias de cobertura.")
        return "\n\n".join(linhas)

    if ferramenta == "sobre_o_projeto":
        return str(resultado.get("texto") or "")

    if ferramenta == "consultar_leitos_internacoes":
        linhas = []
        for item in resultado.get("dados", []):
            estabelecimento = item.get("estabelecimento") or "Estabelecimento não informado"
            atualizacao = _data_br(item.get("data_ultima_atualizacao"))
            if item.get("categoria") == "leitos":
                linhas.append(
                    f"- **{estabelecimento}** · {item.get('tipo_leito')}: "
                    f"{item.get('qtd_leitos_ocupados')} ocupados e "
                    f"{item.get('qtd_leitos_disponiveis')} disponíveis. "
                    f"Última atualização: {atualizacao}."
                )
            else:
                linhas.append(
                    f"- **{estabelecimento}**: {item.get('qtd_internacoes')} internações por dengue. "
                    f"Última atualização: {atualizacao}."
                )
        return (
            "Dados informados pelas próprias unidades; **não são DATASUS**:\n"
            + "\n".join(linhas)
        )

    return None


# Rede de segurança: o payload narrado campo a campo, em código. Só é usado quando o
# LLM não devolve texto (falha de provedor ou resposta vazia) — antes esse era o
# caminho normal, e era ele que despejava o dado cru na tela.
def _narrativa_de_reserva(ferramenta: str, resultado: dict[str, Any] | None) -> str | None:
    if not resultado or not resultado.get("encontrado"):
        return None

    if ferramenta == "consultar_estoque":
        linhas = []
        for dado in resultado.get("dados", []):
            qualidade = dado.get("qualidade") or {}
            dias = dado.get("dias_restantes")
            if dias is None:
                linhas.append(f"- **{dado.get('item')}**: cálculo indisponível, falta consumo médio local válido")
                continue
            defasagem = qualidade.get("defasagem_dias")
            competencia = qualidade.get("competencia") or "não informada"
            linhas.append(
                f"- **{dado.get('item')}**: cobertura estimada de {dias} dias ({dado.get('status')}); "
                f"fonte: estoque local; competência: {competencia}; "
                f"confiança {qualidade.get('confianca', 'não informada')}"
                + (f"; defasagem de {defasagem} dias" if defasagem is not None else "")
            )
        if not linhas:
            return None
        titulo = "Insumos com cobertura crítica ou em alerta:\n" if resultado.get("somente_risco") else "Cobertura do estoque atual:\n"
        return (
            titulo
            + "\n".join(linhas)
            + "\n\n**Limitação:** este cálculo usa quantidade atual ÷ consumo médio. "
            "Ele não comprova a relação caso→insumo e não deve ser lido como previsão de abastecimento."
        )

    if ferramenta == "consultar_alertas":
        linhas = [
            f"- **{a.get('tipo')}** ({a.get('severidade')}, {a.get('status')}): {a.get('descricao')}"
            for a in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        return "Alertas ativos:\n" + "\n".join(linhas)

    if ferramenta == "consultar_epidemiologia":
        stats = (resultado.get("dados") or {}).get("stats") or {}
        if not stats:
            return None
        stats = limpar_vazios(stats)
        rotulo = _rotulo_periodo(resultado)
        local = f" em {stats['nome_municipio']}" if stats.get("nome_municipio") else ""
        frases = []
        if stats.get("casos_atual") is not None:
            frase = f"Foram **{_num_br(stats['casos_atual'])} casos**{local}" + (f" entre {rotulo.replace(' a ', ' e ')}" if rotulo else "")
            if stats.get("casos_anterior") is not None and stats.get("variacao_pct") is not None:
                variacao = float(stats["variacao_pct"])
                sentido = "queda" if variacao < 0 else "alta"
                frase += f", {sentido} de {_num_br(abs(variacao))}% frente ao período anterior ({_num_br(stats['casos_anterior'])})"
            frases.append(frase + ".")
        if stats.get("incidencia_atual") is not None:
            frases.append(f"Incidência de {_num_br(stats['incidencia_atual'])} por 100 mil habitantes.")
        desfechos = [
            f"{_num_br(stats[chave])} {nome}" for chave, nome in (("hospitalizacoes_atual", "hospitalizações"), ("obitos_atual", "óbitos"))
            if stats.get(chave) is not None
        ]
        if desfechos:
            frases.append(f"No mesmo período, {' e '.join(desfechos)}.")
        if frases:
            resposta = f"Segundo o {resultado.get('sistema')}: " + " ".join(frases)
        else:
            # Payload sem os campos conhecidos (ex.: SIH): lista só o que é número.
            linhas = [
                f"- **{chave.replace('_', ' ')}**: {_num_br(valor)}" for chave, valor in stats.items()
                if isinstance(valor, (int, float)) and not isinstance(valor, bool)
            ]
            cabecalho = f"Dados de {resultado.get('sistema')}"
            resposta = (f"{cabecalho} ({rotulo}):\n" if rotulo else f"{cabecalho}:\n") + "\n".join(linhas)
        if resultado.get("escopo_solicitado") == "uti":
            resposta += (
                "\n\n**Limitação:** o SIH descreve internações hospitalares e não informa "
                "ocupação ou disponibilidade de leitos de UTI em tempo real."
            )
        return resposta

    if ferramenta == "gerar_etp":
        return (
            f"ETP gerado para **{resultado.get('item')}** "
            f"(cobertura estimada de {resultado.get('dias_restantes')} dias).\n\n{resultado.get('justificativa')}"
        )

    return None


# Campos que entram no card por padrão: só o que sustenta o número citado na
# resposta, mais o que identifica a origem do dado. Todo o resto vai para o bloco
# "ver detalhes" — nada é descartado. Ordem da tupla = ordem no card.
_ESSENCIAIS_EPI = (
    # SINAN (municipal)
    "casos_atual", "incidencia_atual", "taxa_hosp_atual", "taxa_obito_atual",
    # SIH (consolidado estadual por estabelecimento)
    "internacoes_atual", "internacoes", "permanencia_media_atual", "taxa_mortalidade", "obitos",
)
# Origem do dado: sempre no card, depois dos números.
_ORIGEM_EPI = ("abrangencia", "janela", "periodo_inicio", "periodo_fim", "data_referencia")
_ESSENCIAIS_ESTOQUE = ("item", "cobertura_dias", "confiança")
_DETALHE_ESTOQUE = ("status", "quantidade_atual", "consumo_medio_dia", "competência", "defasagem_dias")
_ESSENCIAIS_ALERTA = ("tipo", "severidade", "descricao")
_DETALHE_ALERTA = ("status", "item_ou_condicao", "criado_em")


def _particionar(campos: dict[str, Any], essenciais: tuple[str, ...],
                 origem: tuple[str, ...] = ()) -> tuple[dict, dict]:
    """Separa o dicionário em (card, detalhes), já sem valores vazios.

    A ordem do card segue as tuplas; os detalhes preservam a ordem original do
    payload. Chave essencial ausente simplesmente não aparece.
    """

    campos = limpar_vazios(campos)
    ordenados = [chave for chave in (*essenciais, *origem) if chave in campos]
    card = {chave: campos[chave] for chave in ordenados}
    detalhes = {chave: valor for chave, valor in campos.items() if chave not in card}
    return card, detalhes


def _colunas_uteis(linhas: list[dict], candidatas: tuple[str, ...]) -> list[str]:
    """Colunas que têm valor em pelo menos uma linha — coluna toda vazia não vai à tela."""

    return [col for col in candidatas if any(not _vazio(linha.get(col)) for linha in linhas)]


def _vazio(valor: Any) -> bool:
    return valor is None or (isinstance(valor, (str, list, tuple, dict, set)) and not valor)


def _num_br(valor: Any) -> str:
    """Número em notação pt-BR (65.016 / 546,13)."""

    try:
        numero = float(valor)
    except (TypeError, ValueError):
        return str(valor)
    texto = f"{numero:,.0f}" if numero.is_integer() else f"{numero:,.4f}".rstrip("0")
    return texto.replace(",", "_").replace(".", ",").replace("_", ".")


def _data_br(valor: Any) -> str:
    texto = str(valor)
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except ValueError:
        return texto


def _rotulo_periodo(resultado: dict[str, Any]) -> str | None:
    """Rótulo do período para o título do card. Nunca devolve 'None-None'.

    Prioridade: datas reais no payload > intervalo de anos pedido > janela curada
    ("12 Meses"). Sem nenhum dos três, o título fica só com o sistema.
    """

    stats = (resultado.get("dados") or {}).get("stats") or {}
    inicio = next((v for k, v in stats.items() if "inicio" in k and v), None)
    fim = next((v for k, v in stats.items() if ("fim" in k or "final" in k) and v), None)
    if inicio and fim:
        return f"{_data_br(inicio)} a {_data_br(fim)}"
    ano_ini, ano_fim = resultado.get("ano_ini"), resultado.get("ano_fim")
    if ano_ini and ano_fim:
        return f"{ano_ini}–{ano_fim}"
    return str(resultado.get("periodo") or "").strip() or None


# ponytail: um artefato por ferramenta, formato fixo (tabela/resumo/etp) — sem
# biblioteca de layout genérica; se o número de tipos crescer, revisitar como registro.
def _construir_artefato(ferramenta: str, resultado: dict[str, Any] | None) -> dict[str, Any] | None:
    if not resultado or not resultado.get("encontrado"):
        return None

    if ferramenta == "consultar_aquisicoes":
        linhas = [{"insumo": d.get("insumo_padronizado"), "unidade": d.get("unidade_fornecimento"),
                   "risco": d.get("faixa_risco_aquisicao"), "pontos": d.get("pontos_risco_aquisicao")}
                  for d in resultado.get("dados", [])]
        if not linhas:
            return None
        return {"tipo": "tabela", "titulo": "Risco de aquisição", "linhas": linhas,
                "colunas": _colunas_uteis(linhas, ("insumo", "unidade", "risco", "pontos")),
                "evidencia": {"fonte": "Compras públicas curadas", "competencia": resultado.get("competencia"),
                              "meta": resultado.get("meta"), "periodo": resultado.get("periodo"),
                              "limitacao": "Não representa estoque físico nem dias de cobertura."}}

    if ferramenta == "consultar_estoque":
        linhas = [
            {
                "item": d.get("item"),
                "cobertura_dias": d.get("dias_restantes") if d.get("dias_restantes") is not None else "indisponível",
                "confiança": (d.get("qualidade") or {}).get("confianca"),
                "status": d.get("status"),
                "quantidade_atual": d.get("quantidade_atual"),
                "consumo_medio_dia": d.get("consumo_medio_dia"),
                "competência": (d.get("qualidade") or {}).get("competencia"),
                "defasagem_dias": (d.get("qualidade") or {}).get("defasagem_dias"),
            }
            for d in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        qualidades = [(d.get("qualidade") or {}) for d in resultado.get("dados", [])]
        return {
            "tipo": "tabela",
            "titulo": "Cobertura de estoque",
            "colunas": _colunas_uteis(linhas, _ESSENCIAIS_ESTOQUE),
            "colunas_detalhe": _colunas_uteis(linhas, _DETALHE_ESTOQUE),
            "linhas": linhas,
            "evidencia": {
                "fonte": "Estoque local informado pelo município",
                "competencias": [q.get("competencia") for q in qualidades if q.get("competencia")],
                "limitacao": "Não incorpora protocolo caso→insumo, lead time ou margem de segurança.",
            },
        }

    if ferramenta == "consultar_alertas":
        linhas = [
            {
                "tipo": a.get("tipo"),
                "severidade": a.get("severidade"),
                "descricao": a.get("descricao"),
                "status": a.get("status"),
                "item_ou_condicao": a.get("item_ou_condicao"),
                "criado_em": a.get("criado_em"),
            }
            for a in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        return {
            "tipo": "tabela",
            "titulo": "Alertas",
            "colunas": _colunas_uteis(linhas, _ESSENCIAIS_ALERTA),
            "colunas_detalhe": _colunas_uteis(linhas, _DETALHE_ALERTA),
            "linhas": linhas,
        }

    if ferramenta == "consultar_epidemiologia":
        stats = (resultado.get("dados") or {}).get("stats") or {}
        campos, detalhes = _particionar(stats, _ESSENCIAIS_EPI, _ORIGEM_EPI)
        if not campos and not detalhes:
            return None
        if not campos:  # nenhum KPI conhecido: mostra o que veio, sem esconder tudo
            campos, detalhes = detalhes, {}
        rotulo = _rotulo_periodo(resultado)
        return {
            "tipo": "resumo",
            "titulo": f"{resultado.get('sistema')} — {rotulo}" if rotulo else str(resultado.get("sistema") or "Epidemiologia"),
            "campos": campos,
            "detalhes": detalhes,
        }

    if ferramenta == "consultar_leitos_internacoes":
        linhas = resultado.get("dados", [])
        return {
            "tipo": "tabela", "titulo": "Leitos e internações informados pelas unidades",
            "colunas": _colunas_uteis(linhas, (
                "estabelecimento", "tipo_leito", "qtd_leitos_ocupados",
                "qtd_leitos_disponiveis", "qtd_internacoes", "data_ultima_atualizacao",
            )),
            "linhas": linhas,
            "evidencia": {"fonte": "Dados informados pelas unidades; não é DATASUS."},
        }

    if ferramenta == "gerar_etp":
        qualidade = resultado.get("qualidade") or {}
        return {
            "tipo": "etp",
            "titulo": f"ETP — {resultado.get('item')}",
            "etp_id": resultado.get("etp_id"),
            "dias_restantes": resultado.get("dias_restantes"),
            "justificativa": resultado.get("justificativa"),
            "detalhes": limpar_vazios({
                "criado_em": resultado.get("criado_em"),
                "alerta_id": resultado.get("alerta_id"),
                "confiança": qualidade.get("confianca"),
                "competência": qualidade.get("competencia"),
                "fonte": qualidade.get("fonte"),
                "limitações": qualidade.get("limitacoes"),
            }),
        }

    return None


def _texto_chunk(chunk: Any) -> str:
    if chunk is None:
        return ""
    if isinstance(chunk, str):
        return chunk
    texto = getattr(chunk, "text", None)
    if isinstance(texto, str):
        return texto
    texto = getattr(chunk, "content", None)
    if isinstance(texto, str):
        return texto
    if isinstance(texto, list):
        partes = []
        for item in texto:
            if item is None:
                continue
            if isinstance(item, str):
                partes.append(item)
                continue
            if isinstance(item, dict):
                texto_item = item.get("text")
                if isinstance(texto_item, str):
                    partes.append(texto_item)
                continue
            texto_item = getattr(item, "text", None)
            if isinstance(texto_item, str):
                partes.append(texto_item)
                continue
            if hasattr(item, "content"):
                partes.append(_texto_chunk(item.content))
                continue
            partes.append(str(item))
        return "".join(partes)
    if texto is not None:
        return str(texto)
    return str(chunk)


_ACOES_INTERNAS = {"resposta", "ferramenta", "fora_do_escopo"}
_ALIASES_ACAO = {"responder": "resposta", "chamar_ferramenta": "ferramenta", "tool": "ferramenta", "consulta": "ferramenta"}


def validar_plano(plano: Any, *, origem: str, tem_historico: bool, permitidas=None) -> dict[str, Any]:
    """Barreira de escopo unica, aplicada a todo plano (LLM local, Gemini, Groq, roteador).

    Rebaixa para fora_do_escopo: acao fora do enum, ferramenta fora do enum e
    "resposta" sem historico (responder so pode reformular algo ja dito). O campo
    ferramenta e ignorado quando acao != ferramenta. Todo rebaixamento e logado com
    a origem, pra medir qual backend erra mais.
    """

    plano = _normalizar_plano(plano)
    acao = plano["acao"]
    ferramenta = str(plano.get("ferramenta") or "").strip()

    def rebaixar(motivo: str) -> dict[str, Any]:
        log.warning("plano rebaixado para fora_do_escopo (origem=%s, acao=%r, ferramenta=%r): %s", origem, acao, ferramenta, motivo)
        return {"acao": "fora_do_escopo", "ferramenta": None, "argumentos": {}, "resposta": "", "referencia_rota": None}

    if acao not in _ACOES_INTERNAS:
        return rebaixar("acao fora do enum")
    if acao == "ferramenta":
        if ferramenta not in FERRAMENTAS_PLANEJAVEIS:
            return rebaixar("ferramenta fora do enum")
        if permitidas is not None and ferramenta not in set(permitidas):
            # Barreira 2 (docs/09): logado separado de "fora do enum" pra medir quantas
            # vezes o modelo/roteador/cliente tentou algo que o perfil nao pode.
            log.warning("plano rebaixado para sem_permissao (origem=%s, ferramenta=%r): ferramenta sem permissao", origem, ferramenta)
            return {"acao": "sem_permissao", "ferramenta": ferramenta, "argumentos": {}, "resposta": "", "referencia_rota": None}
        return plano
    if ferramenta:
        log.warning("campo ferramenta=%r ignorado: acao=%s (origem=%s)", ferramenta, acao, origem)
        plano["ferramenta"] = None
        plano["argumentos"] = {}
    if acao == "resposta" and not tem_historico:
        return rebaixar("responder sem historico nesta conversa")
    return plano


def _normalizar_plano(plano: Any) -> dict[str, Any]:
    if isinstance(plano, str):
        texto = plano.strip()
        if texto.startswith("```"):
            texto = texto.strip("`")
            if texto.lower().startswith("json"):
                texto = texto[4:]
            texto = texto.strip()
        try:
            plano = json.loads(texto)
        except Exception:
            return {"acao": "resposta", "resposta": texto, "referencia_rota": None}

    if not isinstance(plano, dict):
        return {"acao": "resposta", "resposta": str(plano), "referencia_rota": None}

    acao = str(plano.get("acao") or "resposta").strip().lower()
    acao = _ALIASES_ACAO.get(acao, acao)

    return {
        "acao": acao,
        "ferramenta": plano.get("ferramenta") or plano.get("tool"),
        "argumentos": plano.get("argumentos") or plano.get("tool_args") or {},
        "resposta": plano.get("resposta") or plano.get("draft") or "",
        "referencia_rota": plano.get("referencia_rota"),
    }


def _prompt_planejamento(pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> list[tuple[str, str]]:
    humano = json.dumps(
        {"pergunta": pergunta, "contexto": contexto, "ferramentas": ferramentas},
        ensure_ascii=False,
    )
    return [("system", system_prompt_planejador(ferramentas)), ("human", humano)]


def _prompt_resposta(
    pergunta: str,
    contexto: dict[str, Any],
    plano: dict[str, Any],
    resultado_ferramenta: dict[str, Any] | None,
) -> list[tuple[str, str]]:
    return [
        ("system", SYSTEM_PROMPT_RESPOSTA),
        ("human", montar_mensagem_resposta(pergunta, contexto, plano, resultado_ferramenta)),
    ]


class GeminiClaraLLM:
    """Adapter opcional para Gemini via langchain-google-genai."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        chave = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        if not chave:
            raise RuntimeError("GEMINI_API_KEY ausente")

        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except Exception as exc:  # pragma: no cover - depende do ambiente final
            raise RuntimeError("langchain-google-genai indisponível") from exc

        # max_retries=0: o SDK do google-genai reteta 503 ("high demand") com backoff
        # por ~1min antes de propagar o erro — isso atrasava o fallback pro Groq.
        # Falha rápido e deixa o FallbackClaraLLM decidir.
        model = model or os.getenv("GEMINI_MODEL") or "gemini-flash-latest"
        self._client = ChatGoogleGenerativeAI(
            model=model, google_api_key=chave, temperature=0.2,
            max_retries=0, timeout=20,
        )
        # Cliente separado só pro passo de planejamento: força saída JSON e limita
        # tokens (é so um objeto pequeno) — corta a maior parte dos 25-35s observados,
        # que vinham de um round-trip de texto livre + parsing manual de ```json.
        self._client_planejamento = ChatGoogleGenerativeAI(
            model=model, google_api_key=chave, temperature=0.1,
            max_output_tokens=256, response_mime_type="application/json",
            max_retries=0, timeout=20,
        )

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        resposta = self._client_planejamento.invoke(_prompt_planejamento(pergunta, contexto, ferramentas))
        return _normalizar_plano(_texto_chunk(resposta))

    def completar(self, mensagens: list[tuple[str, str]], max_tokens: int = 256) -> str:
        """Chamada simples de texto (usada pelo resumo da memória)."""
        return _texto_chunk(self._client.invoke(mensagens))

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        for chunk in self._client.stream(_prompt_resposta(pergunta, contexto, plano, resultado_ferramenta)):
            texto = _texto_chunk(chunk)
            if texto:
                yield texto


class GroqClaraLLM:
    """Adapter pra Groq (API compatível com OpenAI) — sem SDK novo, via urllib puro.

    Usado como fallback quando o Gemini falha (quota estourada, erro 429/5xx, etc).
    ponytail: sem streaming de verdade — Groq já responde rápido o bastante que uma
    chamada não-streamed inteira ainda cai dentro do orçamento de latência; se o
    ganho de streaming token-a-token importar depois, trocar por SSE aqui.
    """

    def __init__(self, api_key: str | None = None, model: str | None = None):
        self._chave = (api_key or os.getenv("GROQ_API_KEY") or "").strip()
        if not self._chave:
            raise RuntimeError("GROQ_API_KEY ausente")
        self._modelo = model or os.getenv("GROQ_MODEL") or "llama-3.3-70b-versatile"

    def _chamar(self, mensagens: list[tuple[str, str]], *, json_mode: bool, max_tokens: int) -> str:
        papel_openai = {"human": "user", "system": "system", "assistant": "assistant"}
        payload = {
            "model": self._modelo,
            "temperature": 0.2,
            "max_tokens": max_tokens,
            "messages": [{"role": papel_openai.get(papel, papel), "content": texto} for papel, texto in mensagens],
        }
        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._chave}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                corpo = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            detalhe = exc.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Groq HTTP {exc.code}: {detalhe}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Groq inacessível: {exc.reason}") from exc

        return corpo["choices"][0]["message"]["content"] or ""

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        sistema, humano = _prompt_planejamento(pergunta, contexto, ferramentas)
        texto = self._chamar([sistema, humano], json_mode=True, max_tokens=256)
        return _normalizar_plano(texto)

    def completar(self, mensagens: list[tuple[str, str]], max_tokens: int = 256) -> str:
        return self._chamar(mensagens, json_mode=False, max_tokens=max_tokens)

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        mensagens = _prompt_resposta(pergunta, contexto, plano, resultado_ferramenta)
        texto = self._chamar(mensagens, json_mode=False, max_tokens=512)
        if texto:
            yield texto


class FallbackClaraLLM:
    """Tenta o LLM primário; se falhar (quota, erro de rede, timeout), cai pro fallback.

    Cobre o caso concreto pedido: "gemini acabou? cai no groq". Não protege contra
    falha NO MEIO do streaming de stream_resposta (poucos tokens já emitidos e o
    resto falha) — nesse caso o stream simplesmente para; cobrir isso exigiria
    bufferizar a resposta inteira antes de emitir, o que mataria o streaming real
    do caminho feliz. Fica como limite conhecido.
    """

    def __init__(self, primario: Any, fallback: Any | None):
        self._primario = primario
        self._fallback = fallback

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        try:
            return self._primario.planejar(pergunta, contexto, ferramentas)
        except Exception as exc:
            if self._fallback is None:
                raise
            log.warning("LLM primário falhou no planejamento (%s) — caindo pro fallback", exc)
            registrar_fallback_llm("planejamento")
            return self._fallback.planejar(pergunta, contexto, ferramentas)

    def completar(self, mensagens: list[tuple[str, str]], max_tokens: int = 256) -> str:
        # Adapter local não implementa `completar`: o AttributeError cai no fallback cloud.
        try:
            return self._primario.completar(mensagens, max_tokens=max_tokens)
        except Exception as exc:
            if self._fallback is None:
                raise
            log.warning("LLM primário falhou no completar (%s) — caindo pro fallback", exc)
            registrar_fallback_llm("completar")
            return self._fallback.completar(mensagens, max_tokens=max_tokens)

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        emitiu = False
        try:
            for token in self._primario.stream_resposta(pergunta, contexto, plano, resultado_ferramenta):
                if token:
                    emitiu = True
                yield token
        except Exception as exc:
            if emitiu or self._fallback is None:
                raise
            log.warning("LLM primário falhou na resposta (%s) — caindo pro fallback", exc)
            registrar_fallback_llm("resposta")
            yield from self._fallback.stream_resposta(pergunta, contexto, plano, resultado_ferramenta)


def _montar_llm_com_fallback() -> Any:
    provedor = (os.getenv("SUSBOT_LLM_PROVIDER") or "").strip().lower()
    if provedor == "local":
        from api.core.local_llm import LocalClaraLLM

        local = LocalClaraLLM()
        try:
            reserva = _montar_llm_cloud()
        except Exception:
            log.warning("Clara usando Ollama local sem reserva cloud configurada")
            return local
        log.info("Clara usando Ollama local com fallback Gemini → Groq")
        return FallbackClaraLLM(local, reserva)
    if provedor == "groq":
        log.info("Clara usando Groq (Gemini ignorado)")
        return GroqClaraLLM()
    if provedor and provedor not in {"gemini", "cloud", "auto"}:
        raise RuntimeError(f"SUSBOT_LLM_PROVIDER desconhecido: {provedor}")

    return _montar_llm_cloud()


def _montar_llm_cloud() -> Any:
    """Monta a reserva Gemini → Groq, aceitando apenas um deles configurado."""
    primario = None
    erro_primario: Exception | None = None
    try:
        primario = GeminiClaraLLM()
    except Exception as exc:  # pragma: no cover - depende de GEMINI_API_KEY no ambiente
        erro_primario = exc

    fallback = None
    try:
        fallback = GroqClaraLLM()
    except Exception:  # pragma: no cover - depende de GROQ_API_KEY no ambiente
        fallback = None

    if primario is None:
        if fallback is None:
            raise erro_primario or RuntimeError("Nenhum LLM configurado (GEMINI_API_KEY ou GROQ_API_KEY)")
        log.warning("GEMINI_API_KEY ausente/inválida — usando Groq como único LLM")
        return fallback

    return FallbackClaraLLM(primario, fallback)


def _montar_llm_avancado() -> Any | None:
    """Gemini para planejamento complexo; ausência de chave mantém fluxo local.

    Não há queda silenciosa para outro serviço pago. Se o Gemini falhar durante
    uma tarefa avançada, o Ollama local recebe o mesmo plano como reserva.
    """

    provedor = (os.getenv("SUSBOT_COMPLEX_LLM_PROVIDER") or "gemini").strip().lower()
    if provedor in {"", "off", "local"}:
        return None
    if provedor != "gemini":
        raise RuntimeError(f"SUSBOT_COMPLEX_LLM_PROVIDER desconhecido: {provedor}")
    model = (os.getenv("SUSBOT_COMPLEX_GEMINI_MODEL") or "gemini-2.5-flash").strip()
    try:
        gemini = GeminiClaraLLM(model=model)
    except Exception as exc:
        log.info("Gemini avançado indisponível; ETP seguirá com plano determinístico (%s)", exc)
        return None
    try:
        from api.core.local_llm import LocalClaraLLM
        return FallbackClaraLLM(gemini, LocalClaraLLM())
    except Exception as exc:
        log.warning("Gemini avançado sem reserva local (%s)", exc)
        return gemini


@dataclass
class ClaraAgent:
    ibge6: str
    tela_origem: str | None = None
    usuario: str | None = None
    historico: list[dict[str, str]] = field(default_factory=list)
    memoria_usuario: dict[str, Any] = field(default_factory=dict)
    llm: Any | None = None
    llm_avancado: Any | None = None
    tools: dict[str, Callable] = field(default_factory=dict)
    # Ferramentas do perfil (docs/09). None = todas as planejaveis: so para uso interno
    # e testes; os routers sempre passam acesso.ferramentas.
    permitidas: frozenset[str] | None = None
    # Perfil do usuario (docs/09): so muda o texto da recusa (visitante tem mensagem propria).
    perfil: str | None = None
    contexto_conversa: dict[str, Any] | None = None
    # Valores que o painel mostrava quando o usuário clicou "Interpretar com Clara".
    dados_tela: dict[str, Any] | None = None

    def __post_init__(self) -> None:
        self.ibge6 = _ibge6(self.ibge6)
        if self.permitidas is None:
            self.permitidas = frozenset(FERRAMENTAS_PLANEJAVEIS)
        else:
            self.permitidas = frozenset(self.permitidas)
        if not self.tools:
            self.tools = criar_susbot_tools(self.ibge6, self.permitidas, self.contexto_conversa)
        self._graph = self._montar_grafo() if LANGGRAPH_OK else None

    def _obter_llm(self) -> Any:
        """Inicializa o provedor somente quando uma rota realmente precisa dele."""

        if self.llm is None:
            self.llm = _montar_llm_com_fallback()
        return self.llm

    def _obter_llm_avancado(self) -> Any | None:
        if self.llm_avancado is None:
            self.llm_avancado = _montar_llm_avancado()
        return self.llm_avancado

    def _montar_grafo(self):  # pragma: no cover - só valida integração quando disponível
        builder = StateGraph(dict)
        builder.add_node("planejar", self._node_planejar)
        builder.add_node("consultar", self._node_consultar)
        builder.set_entry_point("planejar")
        builder.add_edge("planejar", "consultar")
        builder.add_edge("consultar", END)
        return builder.compile()

    def _contexto(self) -> dict[str, Any]:
        """Contexto do planejador: sem memória (nome/preferência não mudam a ferramenta)."""

        return {
            "ibge6": self.ibge6,
            "tela_origem": self.tela_origem,
            "usuario_autenticado": bool(self.usuario),
            "historico_recente": self.historico,
            "consulta_anterior": next((m["plano_consulta"] for m in reversed(self.historico) if m.get("plano_consulta")), None),
            "contexto_conversa": self.contexto_conversa or {},
        }

    def _memoria_para_prompt(self) -> dict[str, Any]:
        """Só campos fixos, já validados em susbot_memory; vai para o bloco MEMORIA DO USUARIO."""

        fatos = self.memoria_usuario.get("fatos") or {}
        memoria: dict[str, Any] = {}
        if fatos.get("nome"):
            memoria["nome"] = str(fatos["nome"])
        if fatos.get("preferencia_resposta"):
            memoria["preferencia_resposta"] = str(fatos["preferencia_resposta"])
        if self.memoria_usuario.get("resumo"):
            memoria["resumo"] = str(self.memoria_usuario["resumo"])
        return memoria

    def _contexto_resposta(self) -> dict[str, Any]:
        """Contexto da geração final: contexto do planejador + memória em chave própria,
        que `montar_mensagem_resposta` retira do JSON e renderiza em bloco delimitado."""

        contexto = self._contexto()
        memoria = self._memoria_para_prompt()
        if memoria:
            contexto["memoria_usuario"] = memoria
        if self.dados_tela:
            contexto["dados_tela"] = self.dados_tela
        return contexto

    def _resposta_social(self, pergunta: str) -> str | None:
        tipo = tipo_conversa_social(pergunta)
        if tipo is None:
            return None
        ultima = str((self.historico[-1] if self.historico else {}).get("resposta") or "").rstrip()
        # "ok"/"beleza" logo depois de uma oferta ("Quer que eu compare?") é resposta a ela.
        if tipo == "confirmacao" and ultima.endswith("?"):
            return None
        if tipo == "saudacao" and not self.historico:
            # Visitante só tem sobre_o_projeto: o texto institucional já é a apresentação certa.
            if self.permitidas <= {"sobre_o_projeto"}:
                return None
            tipo = "apresentacao"
        nome = str((self.memoria_usuario.get("fatos") or {}).get("nome") or "")
        trocas = self._trocas_relevantes() if tipo == "saudacao" else []
        if trocas:
            # Só oferece retomar quando há assunto de verdade para retomar.
            primeiro = nome.split()[0] if nome.split() else ""
            return (f"Oi{', ' + primeiro if primeiro else ''}! Da última vez você perguntou "
                    f"“{trocas[-1]['pergunta'][:120]}”. Seguimos nisso ou tem assunto novo?")
        return resposta_social(tipo, nome)

    def _trocas_relevantes(self) -> list[dict[str, str]]:
        """Histórico sem saudações e pedidos de retomada: o que dá pra retomar de fato."""

        return [
            {"pergunta": str(t.get("pergunta") or "").strip(), "resposta": str(t.get("resposta") or "").strip()}
            for t in self.historico
            if str(t.get("pergunta") or "").strip()
            and tipo_conversa_social(t["pergunta"]) is None
            and not pede_retomada(t["pergunta"])
        ]

    def _resposta_contextual(self, pergunta: str) -> str | None:
        nome_memoria = str((self.memoria_usuario.get("fatos") or {}).get("nome") or "")
        # "O que você pode fazer?" e a abertura de apresentação saem em código: a lista
        # precisa ser exatamente a das ferramentas liberadas, sem saudação repetida.
        if eh_abertura_apresentacao(pergunta):
            return resposta_apresentacao(nome_memoria)
        if pede_capacidades(pergunta):
            return texto_capacidades(self.permitidas, nome_memoria)
        social = self._resposta_social(pergunta)
        if social is not None:
            return social
        texto = _normalizar_intencao(pergunta)
        fatos = self.memoria_usuario.get("fatos") or {}
        resumo_usuario = str(self.memoria_usuario.get("resumo") or "")
        nome_atual = _normalizar_intencao(str(fatos.get("nome") or ""))

        # Identidade da Clara: resposta fixa, sem LLM. Modelos pequenos copiavam o nome
        # de mensagens antigas do historico ("meu nome e SusBot") em vez de seguir o
        # system prompt — aqui o nome nunca depende do que o LLM lembra.
        if re.search(
            r"(qual (?:e )?(?:o )?(?:seu|teu) nome|como (?:voce|tu) se chama|quem e voce|"
            r"voce tem nome|qual seu nome|seu nome e|com quem (?:eu )?(?:estou )?falando)",
            texto,
        ):
            return MENSAGEM_IDENTIDADE

        consulta_pessoa = re.search(r"\bo que (?:voce )?sabe sobre (.+?)[?!.]*$", texto)
        if consulta_pessoa:
            pessoa = consulta_pessoa.group(1).strip()
            if pessoa not in {"mim", "meu perfil", nome_atual}:
                return "Não tenho acesso à memória ou ao perfil de outros usuários."

        for padrao_terceiro in (
            r"\bem que (?:area )?(?:a |o )?([a-z]+) trabalha\b",
            r"\b(?:qual|que) (?:e )?a area (?:da|do) ([a-z]+)\b",
            r"\bquem e (?:a |o )?([a-z]+)\b",
            r"\b(?:fale|conte) sobre (?:a |o )?([a-z]+)\b",
        ):
            match_terceiro = re.search(padrao_terceiro, texto)
            if match_terceiro and match_terceiro.group(1) not in {"mim", nome_atual}:
                return "Não tenho acesso à memória ou ao perfil de outros usuários."

        if (
            "quem sou eu" in texto
            or "qual e meu usuario" in texto
            or "qual meu usuario" in texto
            or "o que voce sabe sobre mim" in texto
            or "minha memoria" in texto
            or (consulta_pessoa and consulta_pessoa.group(1).strip() in {"mim", _normalizar_intencao(str(fatos.get("nome") or ""))})
        ):
            partes = []
            if fatos.get("nome"):
                partes.append(f"Seu nome é **{fatos['nome']}**")
            else:
                partes.append("Você está autenticado no SusPredict, mas ainda não sei seu nome")
            if self.perfil:
                partes.append(f"seu perfil de acesso é **{self.perfil}**")
            if fatos.get("preferencia_resposta"):
                partes.append(f"você prefere respostas **{fatos['preferencia_resposta']}**")
            resposta = "; ".join(partes) + "."
            if resumo_usuario:
                resposta += f" O que anotei sobre você: {resumo_usuario}"
            if not fatos.get("nome"):
                resposta += " Se quiser, diga “meu nome é …” que eu guardo."
            resposta += " Você pode pedir para eu esquecer uma informação a qualquer momento."
            return resposta

        if pede_retomada(pergunta):
            trocas = self._trocas_relevantes()
            if not trocas:
                return "Ainda não temos uma conversa sobre dados por aqui. O que você quer ver: estoque, alertas, casos ou internações?"
            linhas = []
            for troca in trocas[-3:]:
                linha = f"- Você perguntou “{troca['pergunta'][:120]}”"
                if troca["resposta"]:
                    resposta = troca["resposta"].replace("\n", " ")
                    linha += f" e eu respondi: {resposta[:160].rstrip()}{'…' if len(resposta) > 160 else ''}"
                linhas.append(linha)
            return "Nas últimas conversas:\n" + "\n".join(linhas) + "\n\nQuer seguir em algum desses assuntos?"

        # Apresentação pessoal ("meu nome é…", "sou de Cotia") não é consulta: sem isso o
        # planejador marcava fora_do_escopo. O router já gravou nome/resumo antes do agente.
        if "?" not in pergunta and re.search(_RE_APRESENTACAO, texto):
            nome = str(fatos.get("nome") or "")
            if re.search(r"\b(?:meu nome e|me chamo|pode me chamar de)\b", texto):
                abertura = f"Prazer, {nome}!" if nome else "Prazer!"
            else:
                abertura = f"Entendi, {nome}." if nome else "Entendi."
            return (
                f"{abertura} Posso te ajudar com estoque de insumos, alertas abertos, casos, "
                "internações ou óbitos do município. Por onde quer começar?"
            )

        return None

    def _node_planejar(self, state: dict[str, Any]) -> dict[str, Any]:
        return {"plano": self._planejar_com_llm(state["pergunta"])}

    def _planejar_com_llm(self, pergunta: str) -> dict[str, Any]:
        llm = self._obter_llm()
        ferramentas = [f for f in FERRAMENTAS_PLANEJAVEIS if f in self.permitidas]
        plano = llm.planejar(pergunta, self._contexto(), ferramentas)
        return validar_plano(plano, origem=type(llm).__name__, tem_historico=bool(self.historico), permitidas=self.permitidas)

    def _revisar_etp_com_gemini(self, pergunta: str, plano: dict[str, Any]) -> tuple[dict[str, Any], bool]:
        """Pede uma segunda leitura só para o ETP e aceita apenas o mesmo tool call."""

        if perfil_para_plano(plano) != RACIOCINIO_AVANCADO:
            return plano, False
        llm = self._obter_llm_avancado()
        if llm is None:
            return plano, False
        try:
            candidato = llm.planejar(pergunta, self._contexto(), ["gerar_etp"])
            candidato = validar_plano(candidato, origem=type(llm).__name__,
                                      tem_historico=bool(self.historico), permitidas=self.permitidas)
        except Exception as exc:
            log.warning("Gemini não revisou o plano de ETP (%s); mantendo rota segura", exc)
            return plano, False
        if candidato.get("acao") != "ferramenta" or candidato.get("ferramenta") != "gerar_etp":
            log.warning("Gemini devolveu plano incompatível para ETP; mantendo rota segura")
            return plano, False
        # A rota determinística já extraiu o item quando ele veio explicitamente.
        # Preservá-lo evita que uma reformulação do modelo altere a compra proposta.
        argumentos = dict(candidato.get("argumentos") or {})
        argumentos.update({k: v for k, v in (plano.get("argumentos") or {}).items() if v})
        candidato["argumentos"] = argumentos
        return candidato, True

    def _node_consultar(self, state: dict[str, Any]) -> dict[str, Any]:
        plano = state.get("plano") or {}
        if plano.get("acao") != "ferramenta":
            return {"resultado_ferramenta": None, "referencia_rota": plano.get("referencia_rota")}

        ferramenta = str(plano.get("ferramenta") or "").strip()
        argumentos = plano.get("argumentos") or {}
        executora = self.tools.get(ferramenta)
        if executora is None:
            # Barreira 3 (docs/09): a ferramenta nao existe neste processo. Se e uma
            # ferramenta real que o perfil nao tem, a recusa vem em codigo.
            motivo = (
                mensagem_ferramenta_negada(ferramenta, self.perfil)
                if ferramenta in FERRAMENTAS_PLANEJAVEIS
                else f"Ferramenta desconhecida: {ferramenta}"
            )
            return {
                "resultado_ferramenta": {
                    "encontrado": False,
                    "motivo": motivo,
                },
                "referencia_rota": plano.get("referencia_rota"),
            }

        resultado = executora(**argumentos)
        referencia = plano.get("referencia_rota") or _REFERENCIAS.get(ferramenta, {}).get("rota")
        if not referencia and resultado.get("encontrado"):
            referencia = _REFERENCIAS.get(ferramenta, {}).get("rota")
        return {"resultado_ferramenta": resultado, "referencia_rota": referencia}

    def _emitir_resultado(
        self,
        pergunta: str,
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
        referencia_rota: str | None,
        ferramenta_executada: str | None = None,
        execucao: dict[str, Any] | None = None,
    ) -> Iterable[dict[str, Any]]:
        contexto = self._contexto_resposta()
        execucao_final = dict(execucao or {})

        if referencia_rota:
            info_referencia = next((item for item in _REFERENCIAS.values() if item["rota"] == referencia_rota), None)
            yield {
                "event": "referencia",
                "data": {
                    "rota": referencia_rota,
                    "label": (info_referencia or {}).get("label", "ver em outra tela →"),
                },
            }

        artefato = _construir_artefato(ferramenta_executada, resultado_ferramenta) if ferramenta_executada else None
        texto_fixo = _resposta_deterministica(ferramenta_executada, resultado_ferramenta) if ferramenta_executada else None

        resposta_final = []
        if texto_fixo is not None:
            resposta_final.append(texto_fixo)
            yield {"event": "token", "data": {"texto": texto_fixo}}
        else:
            execucao_final["llm_resposta"] = True
            execucao_final["sem_llm"] = False
            yield {"event": "status", "data": {"mensagem": "Gerando resposta final"}}
            try:
                for token in self._obter_llm().stream_resposta(pergunta, contexto, plano, resultado_ferramenta):
                    if not token:
                        continue
                    resposta_final.append(token)
            except Exception as exc:  # provedor fora do ar, quota, timeout
                log.warning("stream_resposta falhou (%s); usando narrativa de reserva", type(exc).__name__)

            texto_llm = "".join(resposta_final).strip()
            if texto_llm and ferramenta_executada and not _resposta_numericamente_fiel(
                texto_llm, artefato, resultado_ferramenta
            ):
                log.warning("Resposta do LLM descartada por divergência numérica")
                registrar_falha_fidelidade()
                execucao_final["falha_fidelidade_numerica"] = True
                resposta_final = []
            elif texto_llm and ferramenta_executada and _nega_dado_existente(texto_llm, resultado_ferramenta):
                log.warning("Resposta do LLM descartada: negou dado que a ferramenta trouxe")
                registrar_falha_fidelidade()
                execucao_final["falha_negacao_de_dado"] = True
                resposta_final = []

            if not "".join(resposta_final).strip():
                reserva = _narrativa_de_reserva(ferramenta_executada, resultado_ferramenta) if ferramenta_executada else None
                if reserva:
                    execucao_final["resposta_reserva"] = True
                    resposta_final = [reserva]

            for token in resposta_final:
                yield {"event": "token", "data": {"texto": token}}

        # Card depois do texto: é evidência da fonte, não a resposta.
        if artefato:
            yield {"event": "artefato", "data": artefato}

        texto_final = "".join(resposta_final)
        execucao_final.setdefault("llm_planejamento", False)
        execucao_final.setdefault("llm_resposta", False)
        execucao_final.setdefault(
            "sem_llm",
            not execucao_final["llm_planejamento"] and not execucao_final["llm_resposta"],
        )
        registrar_execucao(execucao_final)
        yield {
            "event": "fim",
            "data": {
                "resposta": texto_final,
                "referencia_rota": referencia_rota,
                "plano": plano,
                "resultado_ferramenta": resultado_ferramenta,
                "artefato": artefato,
                "execucao": execucao_final,
            },
        }

    def stream_eventos(self, pergunta: str) -> Iterable[dict[str, Any]]:
        yield {"event": "status", "data": {"mensagem": "Planejando resposta"}}

        # Conversa social ("oi", "obrigado") responde antes do roteador, que mandaria "oi" ao texto institucional.
        rota_local = None if self.dados_tela or self._resposta_social(pergunta) else rotear_com_contexto(pergunta, self.historico)
        plano_obrigatorio = rota_local.plano if rota_local else None
        # Perguntas operacionais sobre saúde/estoque precisam chegar à ferramenta
        # antes das heurísticas de perfil. Expressões como "fale sobre a situação"
        # e "fale sobre os insumos" não são consultas sobre outra pessoa.
        if plano_obrigatorio is None:
            resposta_contextual = self._resposta_contextual(pergunta)
            if resposta_contextual is not None:
                execucao = {
                    "modo": "contextual_local",
                    "intencao": "contexto_usuario",
                    "confianca": 1.0,
                    "llm_planejamento": False,
                    "llm_resposta": False,
                    "sem_llm": True,
                }
                registrar_execucao(execucao)
                yield {"event": "token", "data": {"texto": resposta_contextual}}
                yield {
                    "event": "fim",
                    "data": {
                        "resposta": resposta_contextual,
                        "referencia_rota": None,
                        "plano": {"acao": "resposta", "origem": "contexto_seguro"},
                        "resultado_ferramenta": None,
                        "execucao": execucao,
                    },
                }
                return

        if plano_obrigatorio is None and self.dados_tela:
            # Os números já vieram da tela: consultar ferramenta de novo só traria outro
            # recorte para misturar. Vai direto para a interpretação.
            plano = {"acao": "resposta", "ferramenta": None, "argumentos": {}, "resposta": "", "referencia_rota": None}
            execucao = {
                "modo": "dados_tela",
                "intencao": "interpretar_tela",
                "confianca": 1.0,
                "llm_planejamento": False,
                "llm_resposta": False,
                "sem_llm": False,
            }
        elif plano_obrigatorio is None:
            plano = self._planejar_com_llm(pergunta)
            execucao = {
                "modo": "generativo",
                "intencao": str(plano.get("ferramenta") or "conversa_livre"),
                "confianca": None,
                "llm_planejamento": True,
                "llm_resposta": False,
                "sem_llm": False,
            }
        else:
            plano = validar_plano(plano_obrigatorio, origem="rotear_intencao", tem_historico=bool(self.historico), permitidas=self.permitidas)
            execucao = {
                "modo": "deterministico",
                "intencao": rota_local.intencao,
                "confianca": rota_local.confianca,
                "motivo": rota_local.motivo,
                "llm_planejamento": False,
                "llm_resposta": False,
                "sem_llm": True,
            }
        ferramenta = str(plano.get("ferramenta") or "").strip()

        if plano.get("acao") == "ferramenta" and ferramenta == "gerar_etp":
            plano, revisado_com_gemini = self._revisar_etp_com_gemini(pergunta, plano)
            ferramenta = str(plano.get("ferramenta") or "").strip()
            if revisado_com_gemini:
                execucao.update({"llm_planejamento": True, "sem_llm": False,
                                 "modelo_planejamento": "gemini"})

        if plano.get("acao") == "sem_permissao":
            # Recusa gerada em codigo, distinta de fora_do_escopo. Nada e executado.
            mensagem = mensagem_ferramenta_negada(ferramenta, self.perfil)
            execucao.update({"intencao": "sem_permissao", "llm_resposta": False})
            execucao["sem_llm"] = not execucao.get("llm_planejamento")
            registrar_execucao(execucao)
            yield {"event": "token", "data": {"texto": mensagem}}
            yield {
                "event": "fim",
                "data": {
                    "resposta": mensagem,
                    "referencia_rota": None,
                    "plano": plano,
                    "resultado_ferramenta": None,
                    "artefato": None,
                    "execucao": execucao,
                },
            }
            return

        if plano.get("acao") == "fora_do_escopo":
            # Recusa gerada em codigo: nenhuma chamada de geracao ao LLM neste caminho.
            execucao.update({"intencao": "fora_do_escopo", "llm_resposta": False})
            execucao["sem_llm"] = not execucao.get("llm_planejamento")
            registrar_execucao(execucao)
            yield {"event": "token", "data": {"texto": MENSAGEM_FORA_DO_ESCOPO}}
            yield {
                "event": "fim",
                "data": {
                    "resposta": MENSAGEM_FORA_DO_ESCOPO,
                    "referencia_rota": None,
                    "plano": plano,
                    "resultado_ferramenta": None,
                    "artefato": None,
                    "execucao": execucao,
                },
            }
            return

        if plano.get("acao") == "ferramenta" and ferramenta == "gerar_etp":
            argumentos = plano.get("argumentos") or {}
            if not argumentos.get("item") and (self.contexto_conversa or {}).get("item"):
                argumentos["item"] = self.contexto_conversa["item"]
                plano["argumentos"] = argumentos
            item = argumentos.get("item") if isinstance(argumentos, dict) else None
            if not isinstance(item, str) or not item.strip():
                yield from self._emitir_resultado(
                    pergunta, plano,
                    {"encontrado": False, "motivo": "Para preparar o ETP, informe qual medicamento ou insumo você deseja adquirir."},
                    None, ferramenta_executada=ferramenta, execucao=execucao,
                )
                return

        if plano.get("acao") == "ferramenta" and ferramenta in FERRAMENTAS_ESCRITA:
            argumentos = plano.get("argumentos") or {}
            execucao["aguardando_confirmacao"] = True
            yield {
                "event": "confirmacao_pendente",
                "data": {
                    "ferramenta": ferramenta,
                    "argumentos": argumentos,
                    "resumo": plano.get("resposta")
                    or f"Posso executar {ferramenta} com os dados acima. Confirma?",
                },
            }
            registrar_execucao(execucao)
            yield {
                "event": "fim",
                "data": {
                    "resposta": "",
                    "referencia_rota": None,
                    "plano": plano,
                    "resultado_ferramenta": None,
                    "aguardando_confirmacao": True,
                    "execucao": execucao,
                },
            }
            return

        if plano.get("acao") == "ferramenta":
            yield {"event": "status", "data": {"mensagem": f"Consultando {ferramenta}"}}

        state = self._node_consultar({"plano": plano})
        resultado_ferramenta = state.get("resultado_ferramenta")
        referencia_rota = state.get("referencia_rota")

        yield from self._emitir_resultado(
            pergunta, plano, resultado_ferramenta, referencia_rota,
            ferramenta_executada=ferramenta if plano.get("acao") == "ferramenta" else None,
            execucao=execucao,
        )

    def stream_eventos_confirmado(self, ferramenta: str, argumentos: dict[str, Any]) -> Iterable[dict[str, Any]]:
        """Executa uma ferramenta de escrita já confirmada pelo usuário (via botão no chat)."""

        yield {"event": "status", "data": {"mensagem": f"Executando {ferramenta}"}}

        if ferramenta not in FERRAMENTAS_ESCRITA:
            yield {"event": "erro", "data": {"mensagem": f"Ferramenta de escrita inválida: {ferramenta}"}}
            return
        # docs/09: o nome vem do cliente, entao confere permissao E existencia no dict.
        executora = self.tools.get(ferramenta)
        if ferramenta not in self.permitidas or executora is None:
            log.warning("confirmacao recusada (usuario=%s, ferramenta=%r): ferramenta sem permissao", self.usuario, ferramenta)
            yield {"event": "erro", "data": {"mensagem": mensagem_ferramenta_negada(ferramenta, self.perfil)}}
            return

        resultado = executora(**argumentos)
        plano = {"acao": "ferramenta", "ferramenta": ferramenta, "argumentos": argumentos, "resposta": ""}
        referencia = _REFERENCIAS.get(ferramenta, {}).get("rota") if resultado.get("encontrado") else None

        yield from self._emitir_resultado(
            f"Executar {ferramenta} confirmado pelo usuário", plano, resultado, referencia,
            ferramenta_executada=ferramenta,
            execucao={
                "modo": "acao_confirmada",
                "intencao": ferramenta,
                "confianca": 1.0,
                "llm_planejamento": False,
                "llm_resposta": False,
                "sem_llm": True,
            },
        )

    def stream_sse(self, pergunta: str) -> Iterable[str]:
        for evento in self.stream_eventos(pergunta):
            yield _sse(evento["event"], evento["data"])


def criar_susbot_agente(
    ibge6: str,
    tela_origem: str | None = None,
    usuario: str | None = None,
    historico: list[dict[str, str]] | None = None,
    memoria_usuario: dict[str, Any] | None = None,
    llm: Any | None = None,
    llm_avancado: Any | None = None,
    tools: dict[str, Callable] | None = None,
    permitidas=None,
    perfil: str | None = None,
    contexto_conversa: dict[str, Any] | None = None,
    dados_tela: dict[str, Any] | None = None,
) -> ClaraAgent:
    """Factory do agente da Clara. `permitidas` = acesso.ferramentas (docs/09)."""

    return ClaraAgent(
        ibge6=ibge6,
        tela_origem=tela_origem,
        usuario=usuario,
        historico=historico or [],
        memoria_usuario=memoria_usuario or {},
        llm=llm,
        llm_avancado=llm_avancado,
        tools=tools or {},
        permitidas=permitidas,
        perfil=perfil,
        contexto_conversa=contexto_conversa,
        dados_tela=dados_tela,
    )
