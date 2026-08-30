"""Adaptador do SusBot para um Ollama local.

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


PLANO_SCHEMA = {
    "type": "object",
    "properties": {
        "acao": {"type": "string", "enum": ["responder", "chamar_ferramenta"]},
        "ferramenta": {
            "type": "string",
            "enum": [
                "consultar_estoque",
                "consultar_alertas",
                "consultar_epidemiologia",
                "gerar_etp",
            ],
        },
        "argumentos": {"type": "object"},
    },
    "required": ["acao"],
}

PLANEJADOR_SYSTEM = """Voce e o planejador do SusBot, assistente de gestao municipal de saude.

Ferramentas disponiveis:
- consultar_estoque: medicamentos, insumos, quantidade, risco de desabastecimento
- consultar_alertas: alertas ativos, ocorrencias, severidade
- consultar_epidemiologia: dados do SIM (mortalidade), SIH (internacoes), SINASC (nascimentos), SIA (producao ambulatorial), SINAN (notificacoes)
- gerar_etp: gerar Estudo Tecnico Preliminar para licitacao ou compra

Regras:
- Use acao "chamar_ferramenta" quando a pergunta exigir dados do municipio.
- Use acao "responder" apenas para perguntas conceituais que nao precisam de dados.
- Quando usar "responder", nao preencha o campo ferramenta.
- Responda sempre em portugues do Brasil.
- Seja conciso."""


class OllamaIndisponivel(RuntimeError):
    """Erro operacional seguro para indisponibilidade do servidor local."""


def _mensagens_openai(mensagens: list[tuple[str, str]]) -> list[dict[str, str]]:
    papeis = {"human": "user", "system": "system", "assistant": "assistant"}
    return [{"role": papeis.get(papel, papel), "content": texto} for papel, texto in mensagens]


class LocalSusBotLLM:
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

        acao = str(plano.get("acao") or "responder")
        if acao == "responder":
            return {"acao": "resposta", "resposta": ""}
        if acao != "chamar_ferramenta" or plano.get("ferramenta") not in ferramentas:
            return {"acao": "resposta", "resposta": ""}
        return {
            "acao": "ferramenta",
            "ferramenta": plano["ferramenta"],
            "argumentos": plano.get("argumentos") if isinstance(plano.get("argumentos"), dict) else {},
        }

    def stream_resposta(
        self,
        pergunta: str,
        contexto: dict[str, Any],
        plano: dict[str, Any],
        resultado_ferramenta: dict[str, Any] | None,
    ) -> Iterable[str]:
        mensagens = [
            ("system", "Voce e o SusBot. Responda em portugues do Brasil, de forma concisa, sem inventar dados."),
            (
                "human",
                json.dumps(
                    {
                        "pergunta": pergunta,
                        "contexto": contexto,
                        "plano": plano,
                        "resultado_ferramenta": resultado_ferramenta,
                    },
                    ensure_ascii=False,
                ),
            ),
        ]
        payload = {
            "model": self._modelo,
            "stream": True,
            "messages": _mensagens_openai(mensagens),
            "temperature": 0.2,
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
