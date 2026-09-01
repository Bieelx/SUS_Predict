"""Roteamento local de intenções operacionais da Clara.

Esta camada é deliberadamente pequena e explicável: resolve consultas de alta
confiança sem rede e deixa ambiguidades para o planejador generativo. Os exemplos
reais coletados aqui poderão alimentar um classificador estatístico no futuro.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class IntentRoute:
    intencao: str
    confianca: float
    plano: dict[str, Any]
    motivo: str


def normalizar_texto(texto: str) -> str:
    sem_acentos = unicodedata.normalize("NFKD", str(texto or ""))
    return " ".join(
        "".join(ch for ch in sem_acentos if not unicodedata.combining(ch)).lower().split()
    )


def _contem_termo(texto: str, termos: set[str]) -> bool:
    return any(re.search(rf"\b{re.escape(termo)}\w*\b", texto) for termo in termos)


def _extrair_periodo(texto: str) -> dict[str, int]:
    anos = [int(ano) for ano in re.findall(r"\b(?:19|20)\d{2}\b", texto)]
    if not anos:
        return {}
    return {"ano_ini": min(anos), "ano_fim": max(anos)}


def _extrair_item_estoque(texto: str) -> str | None:
    # Extração conservadora: quando não há um complemento claro, consultar a
    # lista inteira é mais seguro do que filtrar pelo termo errado.
    padroes = (
        r"\bestoque (?:do|da|de) (.+?)(?:\?|$)",
        r"\b(?:medicamento|remedio|insumo) (.+?)(?:\?|$)",
    )
    rejeitados = {
        "cotia", "municipio", "cidade", "hoje", "atual", "agora",
        "todos", "tudo", "falta", "faltando", "risco", "alerta",
    }
    categorias_genericas = {
        "estoque", "estoques", "insumo", "insumos", "medicamento",
        "medicamentos", "remedio", "remedios", "material", "materiais",
        "item", "itens", "produto", "produtos",
    }
    for padrao in padroes:
        match = re.search(padrao, texto)
        if not match:
            continue
        candidato = re.sub(r"\b(?:esta|estao|que|em|no|na)\b.*$", "", match.group(1)).strip(" .,!?:;")
        primeiro_termo = candidato.split()[0] if candidato else ""
        if (
            candidato
            and candidato not in rejeitados
            and primeiro_termo not in categorias_genericas
            and len(candidato.split()) <= 6
        ):
            return candidato
    return None


def rotear_intencao(pergunta: str) -> IntentRoute | None:
    """Retorna uma rota somente quando a intenção operacional é inequívoca."""

    texto = normalizar_texto(pergunta)
    if texto.startswith(("o que e ", "o que sao ", "explique ", "como funciona ")):
        return None

    termos_estoque = {"estoque", "insumo", "medicamento", "remedio", "abastecimento"}
    termos_risco = {"falta", "faltando", "critico", "ruptura", "acabando", "baixo"}
    if _contem_termo(texto, termos_estoque):
        argumentos: dict[str, Any] = {"somente_risco": _contem_termo(texto, termos_risco)}
        item = _extrair_item_estoque(texto)
        if item:
            argumentos["item"] = item
        return IntentRoute(
            intencao="consultar_estoque",
            confianca=0.98,
            motivo="termo operacional de estoque",
            plano={
                "acao": "ferramenta",
                "ferramenta": "consultar_estoque",
                "argumentos": argumentos,
                "resposta": "",
                "referencia_rota": "/insumos",
            },
        )

    if _contem_termo(texto, {"alerta", "risco", "ocorrencia"}):
        return IntentRoute(
            intencao="consultar_alertas",
            confianca=0.95,
            motivo="termo operacional de alerta",
            plano={
                "acao": "ferramenta",
                "ferramenta": "consultar_alertas",
                "argumentos": {},
                "resposta": "",
                "referencia_rota": "/alertas",
            },
        )

    termos_internacao = {"internac", "hospitaliz", "hospitalar", "leito", "uti"}
    termos_epidemiologia = {
        "dengue", "caso", "epidemiologia", "notific", "obito", "mortalidade",
        "nascimento", "ambulatorial",
    }
    if _contem_termo(texto, termos_internacao | termos_epidemiologia):
        if _contem_termo(texto, termos_internacao):
            sistema = "SIH"
        elif _contem_termo(texto, {"obito", "mortalidade"}):
            sistema = "SIM"
        elif _contem_termo(texto, {"nascimento"}):
            sistema = "SINASC"
        elif _contem_termo(texto, {"ambulatorial"}):
            sistema = "SIA"
        else:
            sistema = "SINAN"
        argumentos = {"sistema": sistema, **_extrair_periodo(texto)}
        if _contem_termo(texto, {"uti"}):
            argumentos["escopo_solicitado"] = "uti"
        return IntentRoute(
            intencao="consultar_epidemiologia",
            confianca=0.96,
            motivo=f"termo operacional mapeado para {sistema}",
            plano={
                "acao": "ferramenta",
                "ferramenta": "consultar_epidemiologia",
                "argumentos": argumentos,
                "resposta": "",
                "referencia_rota": "/epidemiologia",
            },
        )

    return None
