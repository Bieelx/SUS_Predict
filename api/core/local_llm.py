"""Adaptador da Clara para um Ollama local.

O planejamento usa a API nativa do Ollama para garantir JSON estruturado.
A resposta final usa o endpoint OpenAI-compatible e repassa o stream sem
bufferizar o conteúdo completo.
"""

from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any, Iterable


from api.core.prompts import (
    ACOES_PLANEJADOR,
    FERRAMENTAS_PLANEJAVEIS,
    SYSTEM_PROMPT_PLANEJADOR,
    SYSTEM_PROMPT_RESPOSTA,
    montar_mensagem_resposta,
)

PLANO_SCHEMA = {
    "type": "object",
    "properties": {
        "acao": {"type": "string", "enum": list(ACOES_PLANEJADOR)},
        "ferramenta": {"type": "string", "enum": list(FERRAMENTAS_PLANEJAVEIS)},
        "argumentos": {"type": "object"},
    },
    "required": ["acao"],
    "additionalProperties": False,
}

# Nomes antigos mantidos como alias: os prompts vivem em api/core/prompts.py.
PLANEJADOR_SYSTEM = SYSTEM_PROMPT_PLANEJADOR
RESPOSTA_SYSTEM = SYSTEM_PROMPT_RESPOSTA

_ARGUMENTOS_PERMITIDOS = {
    "consultar_estoque": {"item", "somente_risco"},
    "consultar_alertas": {"status", "tipo"},
    "consultar_epidemiologia": {
        "sistema", "ano_ini", "ano_fim", "doenca_cod", "escopo_solicitado",
    },
    "gerar_etp": {"item", "alerta_id"},
    "sobre_o_projeto": set(),
}

_ALIASES_ARGUMENTOS = {
    "tipo_produto": "item",
    "produto": "item",
    "medicamento": "item",
    "insumo": "item",
    "ano_inicial": "ano_ini",
    "ano_final": "ano_fim",
    "doenca": "doenca_cod",
}


_ACAO_INTERNA = {"responder": "resposta", "chamar_ferramenta": "ferramenta", "fora_do_escopo": "fora_do_escopo"}


class OllamaIndisponivel(RuntimeError):
    """Erro operacional seguro para indisponibilidade do servidor local."""


def _mensagens_openai(mensagens: list[tuple[str, str]]) -> list[dict[str, str]]:
    papeis = {"human": "user", "system": "system", "assistant": "assistant"}
    return [{"role": papeis.get(papel, papel), "content": texto} for papel, texto in mensagens]


def _normalizar_argumentos(ferramenta: str, argumentos: Any) -> dict[str, Any]:
    if not isinstance(argumentos, dict):
        return {}
    permitidos = _ARGUMENTOS_PERMITIDOS.get(ferramenta, set())
    normalizados: dict[str, Any] = {}
    for chave, valor in argumentos.items():
        chave_normalizada = _ALIASES_ARGUMENTOS.get(str(chave), str(chave))
        if chave_normalizada in permitidos and chave_normalizada not in normalizados:
            normalizados[chave_normalizada] = valor
    return normalizados


class LocalClaraLLM:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        api_key: str | None = None,
        timeout: float | None = None,
    ):
        base = (base_url or os.getenv("SUSBOT_LOCAL_BASE_URL") or "http://127.0.0.1:11434/v1").rstrip("/")
        self._openai_url = f"{base}/chat/completions"
        raiz = base[:-3] if base.endswith("/v1") else base
        self._ollama_url = f"{raiz.rstrip('/')}/api/chat"
        self._modelo = (model or os.getenv("SUSBOT_LOCAL_MODEL") or "susbot-3b").strip()
        self._chave = (api_key if api_key is not None else os.getenv("SUSBOT_LOCAL_API_KEY") or "").strip()
        self._timeout = timeout or float(os.getenv("SUSBOT_LOCAL_TIMEOUT_SECONDS") or "90")

    def _request(self, url: str, payload: dict[str, Any]) -> urllib.request.Request:
        headers = {"Content-Type": "application/json"}
        if self._chave:
            headers["Authorization"] = f"Bearer {self._chave}"
        return urllib.request.Request(
            url,
            data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )

    def planejar(self, pergunta: str, contexto: dict[str, Any], ferramentas: list[str]) -> dict[str, Any]:
        payload = {
            "model": self._modelo,
            "stream": False,
            "format": PLANO_SCHEMA,
            "messages": [
                {"role": "system", "content": PLANEJADOR_SYSTEM},
                {
                    "role": "user",
                    "content": json.dumps(
                        {"pergunta": pergunta, "contexto": contexto, "ferramentas": ferramentas},
                        ensure_ascii=False,
                    ),
                },
            ],
            "options": {"temperature": 0, "num_predict": 192},
        }
        try:
            with urllib.request.urlopen(self._request(self._ollama_url, payload), timeout=self._timeout) as resp:
                corpo = json.loads(resp.read().decode("utf-8"))
            plano = json.loads(corpo["message"]["content"])
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return {"acao": "resposta", "resposta": ""}
        except (TimeoutError, socket.timeout) as exc:
            raise OllamaIndisponivel("A IA local demorou para responder. Tente novamente em instantes.") from exc
        except urllib.error.HTTPError as exc:
            raise OllamaIndisponivel(f"A IA local recusou a solicitacao (HTTP {exc.code}).") from exc
        except urllib.error.URLError as exc:
            raise OllamaIndisponivel("A IA local esta indisponivel. Verifique se o Ollama esta em execucao.") from exc

        # ponytail: aqui so se traduz vocabulario. Rejeicao de acao/ferramenta fora do
        # enum e a barreira de escopo ficam em ClaraAgent.validar_plano, unica para
        # todos os adapters.
        acao = _ACAO_INTERNA.get(str(plano.get("acao") or "responder"), "resposta")
        ferramenta = plano.get("ferramenta")
        return {
            "acao": acao,
            "ferramenta": ferramenta,
            "argumentos": _normalizar_argumentos(str(ferramenta or ""), plano.get("argumentos")),
            "resposta": "",
        }

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        mensagens = [
            ("system", RESPOSTA_SYSTEM),
            ("human", montar_mensagem_resposta(pergunta, contexto, plano, resultado_ferramenta)),
        ]
        payload = {
            "model": self._modelo,
            "stream": True,
            "messages": _mensagens_openai(mensagens),
            "temperature": 0.1,
            "max_tokens": 512,
        }
        try:
            with urllib.request.urlopen(self._request(self._openai_url, payload), timeout=self._timeout) as resp:
                for linha in resp:
                    texto = linha.decode("utf-8", errors="replace").strip()
                    if not texto.startswith("data:"):
                        continue
                    dado = texto[5:].strip()
                    if dado == "[DONE]":
                        break
                    try:
                        chunk = json.loads(dado)
                        token = chunk["choices"][0]["delta"].get("content") or ""
                    except (json.JSONDecodeError, KeyError, IndexError, TypeError):
                        continue
                    if token:
                        yield token
        except (GeneratorExit, BrokenPipeError):
            return
        except (TimeoutError, socket.timeout) as exc:
            raise OllamaIndisponivel("A IA local demorou para iniciar a resposta.") from exc
        except urllib.error.HTTPError as exc:
            raise OllamaIndisponivel(f"A IA local recusou a solicitacao (HTTP {exc.code}).") from exc
        except urllib.error.URLError as exc:
            raise OllamaIndisponivel("A IA local esta indisponivel. Verifique se o Ollama esta em execucao.") from exc
