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


# Saudações e aberturas de conversa (texto já normalizado: sem acento, minúsculo).
# Só casa quando a mensagem inteira é saudação, com pontuação opcional entre as
# partes. "bom dia, quanto de dipirona tem?" não casa e segue para as regras abaixo.
_SAUDACAO = (
    r"(?:oi+|ola+|alo+|opa+|hey|hello|e ai|eai|bom dia|boa tarde|boa noite|"
    r"tudo (?:bem|bom|certo|joia)|beleza|como (?:vai|esta|voce esta)|"
    r"voce esta ai|tem alguem ai|clara)"
)
_RE_SO_SAUDACAO = re.compile(rf"^(?:{_SAUDACAO}[\s,.!?;:]*)+$")


def eh_saudacao(texto_normalizado: str) -> bool:
    return bool(texto_normalizado) and bool(_RE_SO_SAUDACAO.match(texto_normalizado))


# Conversa social curta (mensagem inteira). Respondida em código, com tom humano,
# sem abrir a porta para conversa de uso geral: "me conta uma piada" não casa.
_SOCIAL = {
    "agradecimento": r"(?:(?:muito )?obrigad[oa]s?|valeu+|vlw|brigad[oa]|agradeco|show|perfeito|otimo|massa)",
    "despedida": r"(?:tchau+|ate (?:mais|logo|amanha|breve|depois)|falou|flw|boa (?:noite|semana) e ate mais|abraco)",
    "confirmacao": r"(?:ok+|okay|certo|entendi|blz|beleza|combinado|joia|legal|ta bom|uhum)",
}
_SEP = r"[\s,.!?;:]*"
_RE_SOCIAL = {
    tipo: re.compile(rf"^(?:(?:{_SAUDACAO}|clara){_SEP})*(?:{padrao}{_SEP})+(?:clara{_SEP})?$")
    for tipo, padrao in _SOCIAL.items()
}


def tipo_conversa_social(pergunta: str) -> str | None:
    """'saudacao', 'como_vai', 'agradecimento', 'despedida', 'confirmacao' ou None."""

    texto = normalizar_texto(pergunta)
    if not texto:
        return None
    for tipo in ("agradecimento", "despedida"):
        if _RE_SOCIAL[tipo].match(texto):
            return tipo
    if eh_saudacao(texto):
        return "como_vai" if re.search(r"tudo (?:bem|bom|certo|joia)|como (?:vai|esta)|beleza\?", texto) else "saudacao"
    if _RE_SOCIAL["confirmacao"].match(texto):
        return "confirmacao"
    return None


def rotear_intencao(pergunta: str) -> IntentRoute | None:
    """Retorna uma rota somente quando a intenção operacional é inequívoca."""

    texto = normalizar_texto(pergunta)
    if eh_saudacao(texto):
        return IntentRoute(
            intencao="saudacao",
            confianca=1.0,
            motivo="saudacao de abertura",
            plano={
                "acao": "ferramenta",
                "ferramenta": "sobre_o_projeto",
                "argumentos": {},
                "resposta": "",
                "referencia_rota": None,
            },
        )
    if re.search(r"\b(?:gerar|gere|criar|crie|preparar|prepare)\b", texto) and "etp" in texto:
        match = re.search(r"\betp\s+(?:para(?: a compra de)?|de|do|da)\s+(.+?)[.!?]*$", pergunta, re.I)
        argumentos = {"item": match.group(1).strip()} if match else {}
        return IntentRoute("gerar_etp", 0.99, {"acao": "ferramenta", "ferramenta": "gerar_etp", "argumentos": argumentos, "resposta": ""}, "rascunho com confirmação")

    # Aquisição tem precedência: "não trate como estoque" não deve consultar estoque.
    if "aquisicao" in texto or "aquisicoes" in texto or "compras" in texto:
        return IntentRoute("consultar_aquisicoes", 0.99, {"acao": "ferramenta", "ferramenta": "consultar_aquisicoes", "argumentos": {}, "resposta": "", "referencia_rota": "/alertas"}, "fonte de aquisições")

    if texto.startswith(("o que e ", "o que sao ", "explique ", "como funciona ")):
        return None

    if _contem_termo(texto, {"insumo"}) and not _contem_termo(texto, {"estoque", "saldo", "consumo", "cobertura", "falta", "faltando", "ruptura", "acabando"}):
        return IntentRoute("consultar_aquisicoes", 0.95, {"acao": "ferramenta", "ferramenta": "consultar_aquisicoes", "argumentos": {}, "resposta": "", "referencia_rota": "/insumos"}, "insumos da plataforma sem pressupor estoque físico")

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

    if _contem_termo(texto, {"alerta", "risco", "ocorrencia"}) and not re.search(r"\bloc(?:al|ais)\b", texto):
        return IntentRoute("consultar_aquisicoes", 0.95, {"acao": "ferramenta", "ferramenta": "consultar_aquisicoes", "argumentos": {}, "resposta": "", "referencia_rota": "/alertas"}, "alertas da plataforma")
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

    tem_periodo_historico = bool(_extrair_periodo(texto)) or "sih" in texto
    if _contem_termo(texto, {"leito", "uti"}) and not tem_periodo_historico:
        tipo = "UTI" if _contem_termo(texto, {"uti"}) else None
        argumentos = {"categoria": "leitos"}
        if tipo:
            argumentos["tipo_leito"] = tipo
        return IntentRoute(
            "consultar_leitos_internacoes", 0.99,
            {"acao": "ferramenta", "ferramenta": "consultar_leitos_internacoes",
             "argumentos": argumentos, "resposta": "", "referencia_rota": "/internacoes"},
            "situação atual de leitos informada pelas unidades",
        )
    if (_contem_termo(texto, {"internac", "hospitaliz"}) and "dengue" in texto
            and not tem_periodo_historico):
        return IntentRoute(
            "consultar_leitos_internacoes", 0.99,
            {"acao": "ferramenta", "ferramenta": "consultar_leitos_internacoes",
             "argumentos": {"categoria": "internacoes_dengue"}, "resposta": "",
             "referencia_rota": "/internacoes"},
            "internações por dengue informadas pelas unidades",
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


def eh_continuacao(pergunta: str) -> bool:
    texto = normalizar_texto(pergunta)
    return bool(re.search(r'^(?:e\b|mas\b|por que\b|por qual motivo\b|nesse\b|nessa\b|entao\b|compare\b|comparar\b|detalhe\b|continue\b|resuma\b|explique melhor\b)', texto)
                or re.search(r'\b(?:esse dado|essa quantidade|esse valor|isso|disso|mesmo periodo|mesma unidade|anterior|que voce (?:disse|mostrou))\b', texto))


def rotear_com_contexto(pergunta: str, historico: list[dict]) -> IntentRoute | None:
    """Continuação exata de período reaproveita só filtros de consulta já executada."""
    texto = normalizar_texto(pergunta)
    match = re.fullmatch(r'e\s+(?:em|no ano de)\s+((?:19|20)\d{2})[?!.]*', texto)
    if match and historico:
        previous = historico[-1].get('plano_consulta')
        if previous and previous.get('ferramenta') == 'consultar_epidemiologia':
            args = {**previous.get('argumentos', {}), 'ano_ini': int(match[1]), 'ano_fim': int(match[1])}
            plan = {**previous, 'argumentos': args}
            return IntentRoute('consultar_epidemiologia', 1.0, plan, 'continuidade de período na consulta anterior')
    # O planejador recebe a conversa para resolver referências gerais e ambiguidades.
    if historico and eh_continuacao(pergunta):
        return None
    return rotear_intencao(pergunta)
