"""
Agente do SusBot com stream SSE.

O fluxo é dividido em 3 partes:
1. Planejamento da resposta (LLM decide se usa tool ou responde direto)
2. Execução da tool escolhida
3. Stream token a token da resposta final

LangGraph e Gemini entram por adaptação opcional. Nos testes, o LLM pode ser
substituído por um mock simples com `planejar()` e `stream_resposta()`.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from api.core.susbot_tools import FERRAMENTAS_ESCRITA, criar_susbot_tools

log = logging.getLogger("sus_predict.susbot_agent")

try:  # pragma: no cover - depende do ambiente final da fase 7
    from langgraph.graph import END, StateGraph
    LANGGRAPH_OK = True
except Exception:  # pragma: no cover - fallback para o ambiente de testes atual
    END = "__end__"
    StateGraph = None
    LANGGRAPH_OK = False


_REFERENCIAS = {
    "consultar_estoque": {"rota": "/insumos", "label": "ver em Insumos →"},
    "consultar_alertas": {"rota": "/alertas", "label": "ver em Alertas →"},
    "consultar_epidemiologia": {"rota": "/epidemiologia", "label": "ver em Epidemiologia →"},
}

_FERRAMENTAS_SCHEMA = {
    "consultar_estoque": {"item": "str opcional, nome do insumo"},
    "consultar_alertas": {"status": "str opcional", "tipo": "str opcional"},
    "consultar_epidemiologia": {
        "sistema": "um de SIM, SIH, SINASC, SIA, SINAN",
        "ano_ini": "int opcional",
        "ano_fim": "int opcional",
        "doenca_cod": "str opcional, codigo do agravo",
    },
    "gerar_etp": {
        "item": "str obrigatorio, nome do insumo",
        "alerta_id": "str opcional, id do alerta de origem",
    },
}


def _ibge6(valor: str) -> str:
    return str(valor or "").strip()[:6]


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


# O LLM não é confiável pra narrar fielmente o resultado da tool — modelos rápidos
# tendem a hedgear ("não possuo acesso a dados atualizados") mesmo com o dado real
# no contexto. Quando existe resultado de ferramenta, a resposta é montada aqui, sem
# LLM: o texto que o usuário lê é sempre exatamente o que a tool devolveu.
def _resposta_deterministica(ferramenta: str, resultado: dict[str, Any] | None) -> str | None:
    if not resultado:
        return None

    if not resultado.get("encontrado"):
        return str(resultado.get("motivo") or "Não encontrei esse dado para este município.")

    if ferramenta == "consultar_estoque":
        linhas = [
            f"- **{d.get('item')}** — {d.get('dias_restantes')} dias restantes ({d.get('status')})"
            for d in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        return "Estoque atual:\n" + "\n".join(linhas)

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
        linhas = [f"- **{chave.replace('_', ' ')}**: {valor}" for chave, valor in stats.items()]
        return (
            f"Dados de {resultado.get('sistema')} ({resultado.get('ano_ini')}–{resultado.get('ano_fim')}):\n"
            + "\n".join(linhas)
        )

    if ferramenta == "gerar_etp":
        return (
            f"ETP gerado para **{resultado.get('item')}** "
            f"(cobertura estimada de {resultado.get('dias_restantes')} dias).\n\n{resultado.get('justificativa')}"
        )

    return None


# ponytail: um artefato por ferramenta, formato fixo (tabela/resumo/etp) — sem
# biblioteca de layout genérica; se o número de tipos crescer, revisitar como registro.
def _construir_artefato(ferramenta: str, resultado: dict[str, Any] | None) -> dict[str, Any] | None:
    if not resultado or not resultado.get("encontrado"):
        return None

    if ferramenta == "consultar_estoque":
        linhas = [
            {"item": d.get("item"), "dias_restantes": d.get("dias_restantes"), "status": d.get("status")}
            for d in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        return {"tipo": "tabela", "titulo": "Estoque", "colunas": ["item", "dias_restantes", "status"], "linhas": linhas}

    if ferramenta == "consultar_alertas":
        linhas = [
            {
                "tipo": a.get("tipo"),
                "severidade": a.get("severidade"),
                "status": a.get("status"),
                "descricao": a.get("descricao"),
            }
            for a in resultado.get("dados", [])
        ]
        if not linhas:
            return None
        return {
            "tipo": "tabela",
            "titulo": "Alertas",
            "colunas": ["tipo", "severidade", "status", "descricao"],
            "linhas": linhas,
        }

    if ferramenta == "consultar_epidemiologia":
        stats = (resultado.get("dados") or {}).get("stats") or {}
        if not stats:
            return None
        return {
            "tipo": "resumo",
            "titulo": f"{resultado.get('sistema')} {resultado.get('ano_ini')}–{resultado.get('ano_fim')}",
            "campos": stats,
        }

    if ferramenta == "gerar_etp":
        return {
            "tipo": "etp",
            "titulo": f"ETP — {resultado.get('item')}",
            "etp_id": resultado.get("etp_id"),
            "dias_restantes": resultado.get("dias_restantes"),
            "justificativa": resultado.get("justificativa"),
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
    if acao not in {"resposta", "ferramenta", "tool", "consulta"}:
        acao = "resposta"
    if acao in {"tool", "consulta"}:
        acao = "ferramenta"

    return {
        "acao": acao,
        "ferramenta": plano.get("ferramenta") or plano.get("tool"),
        "argumentos": plano.get("argumentos") or plano.get("tool_args") or {},
        "resposta": plano.get("resposta") or plano.get("draft") or "",
        "referencia_rota": plano.get("referencia_rota"),
    }


def _prompt_planejamento(pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> list[tuple[str, str]]:
    sistema = (
        "Voce e o SusBot, agente com acesso real a um banco de dados via ferramentas — "
        "voce NAO e um chat generico sem acesso a dado atualizado. Responda em JSON puro "
        "com as chaves acao, ferramenta, argumentos, resposta e referencia_rota.\n"
        "Regra obrigatoria: se a pergunta menciona estoque/insumo/remedio, alerta, ou "
        "dado epidemiologico de um municipio/doenca especifica, a acao DEVE ser "
        "'ferramenta' — nunca responda com frases como 'nao possuo acesso a dados "
        "atualizados' ou 'consulte o painel'; isso e proibido, voce tem a ferramenta "
        "certa para isso, use-a e deixe o resultado dela (mesmo vazio) fundamentar a "
        "resposta. Use acao 'resposta' so quando a pergunta for generica e nao depender "
        "de dado de um municipio (ex: 'o que e dengue', 'como funciona o sistema').\n"
        "gerar_etp altera dado (cria um ETP de verdade) — so proponha essa ferramenta "
        "quando o usuario pedir explicitamente para abrir/gerar um ETP; ela sempre passa "
        "por confirmacao antes de executar, entao pode propor mesmo sem ter certeza."
    )
    humano = json.dumps(
        {
            "pergunta": pergunta,
            "contexto": contexto,
            "ferramentas": {nome: _FERRAMENTAS_SCHEMA.get(nome, {}) for nome in ferramentas},
        },
        ensure_ascii=False,
    )
    return [("system", sistema), ("human", humano)]


def _prompt_resposta(
    pergunta: str,
    contexto: dict[str, Any],
    plano: dict[str, Any],
    resultado_ferramenta: dict[str, Any] | None,
) -> list[tuple[str, str]]:
    sistema = (
        "Voce e o SusBot. Escreva uma resposta curta em markdown simples, sem inventar dados. "
        "resultado_ferramenta e o dado real ja consultado no banco — use os numeros dele. "
        "Se resultado_ferramenta.encontrado for false, diga isso especificamente usando o "
        "campo 'motivo' (ex: item nao cadastrado, sem alertas ativos), NUNCA diga frases "
        "genericas como 'nao possuo acesso a dados atualizados' ou 'consulte outro painel' "
        "— voce ja consultou, so nao achou resultado para esse filtro. "
        "Se houver referencia de rota, mencione no final em uma linha curta."
    )
    humano = json.dumps(
        {
            "pergunta": pergunta,
            "contexto": contexto,
            "plano": plano,
            "resultado_ferramenta": resultado_ferramenta,
        },
        ensure_ascii=False,
    )
    return [("system", sistema), ("human", humano)]


class GeminiSusBotLLM:
    """Adapter opcional para Gemini via langchain-google-genai."""

    def __init__(self, api_key: str | None = None, model: str = "gemini-flash-latest"):
        chave = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        if not chave:
            raise RuntimeError("GEMINI_API_KEY ausente")

        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except Exception as exc:  # pragma: no cover - depende do ambiente final
            raise RuntimeError("langchain-google-genai indisponível") from exc

        self._client = ChatGoogleGenerativeAI(model=model, google_api_key=chave, temperature=0.2)
        # Cliente separado só pro passo de planejamento: força saída JSON e limita
        # tokens (é so um objeto pequeno) — corta a maior parte dos 25-35s observados,
        # que vinham de um round-trip de texto livre + parsing manual de ```json.
        self._client_planejamento = ChatGoogleGenerativeAI(
            model=model, google_api_key=chave, temperature=0.1,
            max_output_tokens=256, response_mime_type="application/json",
        )

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        resposta = self._client_planejamento.invoke(_prompt_planejamento(pergunta, contexto, ferramentas))
        return _normalizar_plano(_texto_chunk(resposta))

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


class GroqSusBotLLM:
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


class FallbackSusBotLLM:
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
            return self._fallback.planejar(pergunta, contexto, ferramentas)

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        try:
            yield from self._primario.stream_resposta(pergunta, contexto, plano, resultado_ferramenta)
        except Exception as exc:
            if self._fallback is None:
                raise
            log.warning("LLM primário falhou na resposta (%s) — caindo pro fallback", exc)
            yield from self._fallback.stream_resposta(pergunta, contexto, plano, resultado_ferramenta)


def _montar_llm_com_fallback() -> Any:
    primario = None
    erro_primario: Exception | None = None
    try:
        primario = GeminiSusBotLLM()
    except Exception as exc:  # pragma: no cover - depende de GEMINI_API_KEY no ambiente
        erro_primario = exc

    fallback = None
    try:
        fallback = GroqSusBotLLM()
    except Exception:  # pragma: no cover - depende de GROQ_API_KEY no ambiente
        fallback = None

    if primario is None:
        if fallback is None:
            raise erro_primario or RuntimeError("Nenhum LLM configurado (GEMINI_API_KEY ou GROQ_API_KEY)")
        log.warning("GEMINI_API_KEY ausente/inválida — usando Groq como único LLM")
        return fallback

    return FallbackSusBotLLM(primario, fallback)


@dataclass
class SusBotAgent:
    ibge6: str
    tela_origem: str | None = None
    usuario: str | None = None
    llm: Any | None = None
    tools: dict[str, Callable] = field(default_factory=dict)

    def __post_init__(self) -> None:
        self.ibge6 = _ibge6(self.ibge6)
        if not self.tools:
            self.tools = criar_susbot_tools(self.ibge6)
        if self.llm is None:
            self.llm = _montar_llm_com_fallback()
        self._graph = self._montar_grafo() if LANGGRAPH_OK else None

    def _montar_grafo(self):  # pragma: no cover - só valida integração quando disponível
        builder = StateGraph(dict)
        builder.add_node("planejar", self._node_planejar)
        builder.add_node("consultar", self._node_consultar)
        builder.set_entry_point("planejar")
        builder.add_edge("planejar", "consultar")
        builder.add_edge("consultar", END)
        return builder.compile()

    def _contexto(self) -> dict[str, Any]:
        return {"ibge6": self.ibge6, "tela_origem": self.tela_origem, "usuario": self.usuario}

    def _node_planejar(self, state: dict[str, Any]) -> dict[str, Any]:
        plano = _normalizar_plano(
            self.llm.planejar(state["pergunta"], self._contexto(), list(self.tools.keys()))
        )
        return {"plano": plano}

    def _node_consultar(self, state: dict[str, Any]) -> dict[str, Any]:
        plano = state.get("plano") or {}
        if plano.get("acao") != "ferramenta":
            return {"resultado_ferramenta": None, "referencia_rota": plano.get("referencia_rota")}

        ferramenta = str(plano.get("ferramenta") or "").strip()
        argumentos = plano.get("argumentos") or {}
        executora = self.tools.get(ferramenta)
        if executora is None:
            return {
                "resultado_ferramenta": {
                    "encontrado": False,
                    "motivo": f"Ferramenta desconhecida: {ferramenta}",
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
    ) -> Iterable[dict[str, Any]]:
        contexto = self._contexto()

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
        if artefato:
            yield {"event": "artefato", "data": artefato}

        texto_fixo = _resposta_deterministica(ferramenta_executada, resultado_ferramenta) if ferramenta_executada else None

        resposta_final = []
        if texto_fixo is not None:
            resposta_final.append(texto_fixo)
            yield {"event": "token", "data": {"texto": texto_fixo}}
        else:
            yield {"event": "status", "data": {"mensagem": "Gerando resposta final"}}
            for token in self.llm.stream_resposta(pergunta, contexto, plano, resultado_ferramenta):
                if not token:
                    continue
                resposta_final.append(token)
                yield {"event": "token", "data": {"texto": token}}

        texto_final = "".join(resposta_final)
        yield {
            "event": "fim",
            "data": {
                "resposta": texto_final,
                "referencia_rota": referencia_rota,
                "plano": plano,
                "resultado_ferramenta": resultado_ferramenta,
                "artefato": artefato,
            },
        }

    def stream_eventos(self, pergunta: str) -> Iterable[dict[str, Any]]:
        yield {"event": "status", "data": {"mensagem": "Planejando resposta"}}

        plano = _normalizar_plano(self.llm.planejar(pergunta, self._contexto(), list(self.tools.keys())))
        ferramenta = str(plano.get("ferramenta") or "").strip()

        if plano.get("acao") == "ferramenta" and ferramenta in FERRAMENTAS_ESCRITA:
            argumentos = plano.get("argumentos") or {}
            yield {
                "event": "confirmacao_pendente",
                "data": {
                    "ferramenta": ferramenta,
                    "argumentos": argumentos,
                    "resumo": plano.get("resposta")
                    or f"Posso executar {ferramenta} com os dados acima. Confirma?",
                },
            }
            yield {
                "event": "fim",
                "data": {
                    "resposta": "",
                    "referencia_rota": None,
                    "plano": plano,
                    "resultado_ferramenta": None,
                    "aguardando_confirmacao": True,
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
        )

    def stream_eventos_confirmado(self, ferramenta: str, argumentos: dict[str, Any]) -> Iterable[dict[str, Any]]:
        """Executa uma ferramenta de escrita já confirmada pelo usuário (via botão no chat)."""

        yield {"event": "status", "data": {"mensagem": f"Executando {ferramenta}"}}

        executora = self.tools.get(ferramenta)
        if executora is None or ferramenta not in FERRAMENTAS_ESCRITA:
            yield {"event": "erro", "data": {"mensagem": f"Ferramenta de escrita inválida: {ferramenta}"}}
            return

        resultado = executora(**argumentos)
        plano = {"acao": "ferramenta", "ferramenta": ferramenta, "argumentos": argumentos, "resposta": ""}
        referencia = _REFERENCIAS.get(ferramenta, {}).get("rota") if resultado.get("encontrado") else None

        yield from self._emitir_resultado(
            f"Executar {ferramenta} confirmado pelo usuário", plano, resultado, referencia,
            ferramenta_executada=ferramenta,
        )

    def stream_sse(self, pergunta: str) -> Iterable[str]:
        for evento in self.stream_eventos(pergunta):
            yield _sse(evento["event"], evento["data"])


def criar_susbot_agente(
    ibge6: str,
    tela_origem: str | None = None,
    usuario: str | None = None,
    llm: Any | None = None,
    tools: dict[str, Callable] | None = None,
) -> SusBotAgent:
    """Factory do agente do SusBot."""

    return SusBotAgent(
        ibge6=ibge6,
        tela_origem=tela_origem,
        usuario=usuario,
        llm=llm,
        tools=tools or {},
    )
