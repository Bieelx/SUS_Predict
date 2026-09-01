import io
import json
import urllib.error

import pytest

from api.core.local_llm import (
    LocalClaraLLM, OllamaIndisponivel, PLANEJADOR_SYSTEM,
    PLANO_SCHEMA, RESPOSTA_SYSTEM,
)


class FakeResponse:
    def __init__(self, body=b"", lines=()):
        self._body = body
        self._lines = list(lines)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self._body

    def __iter__(self):
        return iter(self._lines)


def test_planejamento_usa_api_nativa_schema_e_normaliza_responder(monkeypatch):
    requisicao = {}

    def urlopen(req, timeout):
        requisicao["url"] = req.full_url
        requisicao["payload"] = json.loads(req.data)
        requisicao["timeout"] = timeout
        corpo = {"message": {"content": json.dumps({
            "acao": "responder",
            "ferramenta": "gerar_etp",
            "argumentos": {"item": "dipirona"},
        })}}
        return FakeResponse(json.dumps(corpo).encode())

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    llm = LocalClaraLLM(base_url="http://127.0.0.1:11434/v1", model="susbot-3b", timeout=91)
    plano = llm.planejar("O que e dengue?", {}, ["gerar_etp"])

    assert requisicao["url"] == "http://127.0.0.1:11434/api/chat"
    assert requisicao["payload"]["format"] == PLANO_SCHEMA
    assert requisicao["payload"]["stream"] is False
    assert requisicao["payload"]["options"] == {"temperature": 0, "num_predict": 192}
    assert requisicao["timeout"] == 91
    assert plano == {"acao": "resposta", "resposta": ""}


def test_planejamento_json_invalido_faz_fallback_seguro(monkeypatch):
    corpo = {"message": {"content": "nao e json"}}
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *_args, **_kwargs: FakeResponse(json.dumps(corpo).encode()),
    )
    llm = LocalClaraLLM()
    assert llm.planejar("pergunta", {}, []) == {"acao": "resposta", "resposta": ""}


def test_planejamento_normaliza_alias_e_remove_ibge_dos_argumentos(monkeypatch):
    corpo = {"message": {"content": json.dumps({
        "acao": "chamar_ferramenta",
        "ferramenta": "consultar_estoque",
        "argumentos": {
            "ibge6": "351300",
            "tipo_produto": "dipirona",
            "campo_inventado": "ignorar",
        },
    })}}
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *_args, **_kwargs: FakeResponse(json.dumps(corpo).encode()),
    )

    plano = LocalClaraLLM().planejar(
        "risco de faltar dipirona",
        {"ibge6": "351300"},
        ["consultar_estoque"],
    )

    assert plano == {
        "acao": "ferramenta",
        "ferramenta": "consultar_estoque",
        "argumentos": {"item": "dipirona"},
    }


def test_resposta_repassa_chunks_sem_bufferizar(monkeypatch):
    requisicao = {}
    linhas = [
        b'data: {"choices":[{"delta":{"content":"Ola"}}]}\n',
        b'data: {"choices":[{"delta":{"content":" mundo"}}]}\n',
        b'data: [DONE]\n',
    ]
    def urlopen(req, **_kwargs):
        requisicao["payload"] = json.loads(req.data)
        return FakeResponse(lines=linhas)

    monkeypatch.setattr("urllib.request.urlopen", urlopen)
    llm = LocalClaraLLM()
    assert list(llm.stream_resposta("oi", {}, {}, None)) == ["Ola", " mundo"]
    assert requisicao["payload"]["messages"][0]["content"] == RESPOSTA_SYSTEM
    assert requisicao["payload"]["temperature"] == 0.1
    assert requisicao["payload"]["max_tokens"] == 512


def test_prompts_locais_cobrem_regras_criticas_para_modelo_pequeno():
    assert "JSON" in PLANEJADOR_SYSTEM
    assert "palavras genéricas" in PLANEJADOR_SYSTEM.lower()
    assert "confirmação humana" in PLANEJADOR_SYSTEM
    assert "única fonte" in RESPOSTA_SYSTEM
    assert "não informa ocupação" in RESPOSTA_SYSTEM
    assert "não comprovam estoque físico" in RESPOSTA_SYSTEM
    assert "não probabilidade de surto" in RESPOSTA_SYSTEM
    assert "dados de outro usuário" in RESPOSTA_SYSTEM


def test_conexao_recusada_vira_erro_operacional(monkeypatch):
    def falhar(*_args, **_kwargs):
        raise urllib.error.URLError(ConnectionRefusedError())

    monkeypatch.setattr("urllib.request.urlopen", falhar)
    with pytest.raises(OllamaIndisponivel, match="Ollama"):
        LocalClaraLLM().planejar("oi", {}, [])
