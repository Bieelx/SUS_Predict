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
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

from api.core.susbot_tools import criar_susbot_tools

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
        "Voce e o SusBot. Responda em JSON puro com as chaves acao, ferramenta, "
        "argumentos, resposta e referencia_rota. A acao deve ser 'ferramenta' quando "
        "a pergunta exigir dados do banco, ou 'resposta' quando puder responder direto."
    )
    humano = json.dumps(
        {
            "pergunta": pergunta,
            "contexto": contexto,
            "ferramentas": ferramentas,
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

    def __init__(self, api_key: str | None = None, model: str = "gemini-3.1-flash-lite"):
        chave = (api_key or os.getenv("GEMINI_API_KEY") or "").strip()
        if not chave:
            raise RuntimeError("GEMINI_API_KEY ausente")

        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
        except Exception as exc:  # pragma: no cover - depende do ambiente final
            raise RuntimeError("langchain-google-genai indisponível") from exc

        self._client = ChatGoogleGenerativeAI(model=model, google_api_key=chave, temperature=0.2)

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        resposta = self._client.invoke(_prompt_planejamento(pergunta, contexto, ferramentas))
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
            self.llm = GeminiSusBotLLM()
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

    def _resolver(self, pergunta: str) -> dict[str, Any]:
        state = {"pergunta": pergunta}
        if self._graph is not None:
            try:  # pragma: no cover - depende da versão do langgraph
                state = self._graph.invoke(state)
            except Exception:
                state = {}

        if not state.get("plano"):
            state.update(self._node_planejar({"pergunta": pergunta}))
        if "resultado_ferramenta" not in state:
            state.update(self._node_consultar(state))
        return state

    def stream_eventos(self, pergunta: str) -> Iterable[dict[str, Any]]:
        contexto = self._contexto()
        yield {"event": "status", "data": {"mensagem": "Planejando resposta"}}

        state = self._resolver(pergunta)
        plano = state.get("plano") or {"acao": "resposta"}
        resultado_ferramenta = state.get("resultado_ferramenta")
        referencia_rota = state.get("referencia_rota")

        if plano.get("acao") == "ferramenta":
            yield {
                "event": "status",
                "data": {"mensagem": f"Consultando {plano.get('ferramenta')}"},
            }

        if referencia_rota:
            info_referencia = next((item for item in _REFERENCIAS.values() if item["rota"] == referencia_rota), None)
            yield {
                "event": "referencia",
                "data": {
                    "rota": referencia_rota,
                    "label": (info_referencia or {}).get("label", "ver em outra tela →"),
                },
            }

        yield {"event": "status", "data": {"mensagem": "Gerando resposta final"}}

        resposta_final = []
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
            },
        }

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
