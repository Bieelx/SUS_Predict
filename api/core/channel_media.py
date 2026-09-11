"""Download seguro de mídia recebida pelos canais externos."""

from __future__ import annotations

import base64
import binascii
import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

from api.core.audio_transcription import AudioInvalido, limite_audio_bytes


class MidiaCanalIndisponivel(RuntimeError):
    """A mídia não pôde ser obtida do provedor externo."""


def _ler_resposta_limitada(resposta: Any, limite: int) -> bytes:
    tamanho_cabecalho = resposta.headers.get("Content-Length")
    if tamanho_cabecalho:
        try:
            if int(tamanho_cabecalho) > limite:
                raise AudioInvalido("O áudio ultrapassa o limite de tamanho permitido.")
        except ValueError:
            pass
    conteudo = resposta.read(limite + 1)
    if len(conteudo) > limite:
        raise AudioInvalido("O áudio ultrapassa o limite de tamanho permitido.")
    return conteudo


def baixar_audio_openwa(
    base_url: str,
    api_key: str,
    sessao: str,
    chat_id: str,
    message_id: str,
    base64_inline: str | None = None,
) -> bytes:
    """Usa o base64 do webhook quando veio; senão baixa a mídia guardada pelo OpenWA."""

    limite = limite_audio_bytes()
    if base64_inline:
        try:
            conteudo = base64.b64decode(str(base64_inline).split(",", 1)[-1], validate=True)
        except (binascii.Error, ValueError) as exc:
            raise MidiaCanalIndisponivel("O WhatsApp enviou um áudio corrompido.") from exc
        if len(conteudo) > limite:
            raise AudioInvalido("O áudio ultrapassa o limite de tamanho permitido.")
        return conteudo

    if not api_key or not sessao or not chat_id or not message_id:
        raise MidiaCanalIndisponivel("WhatsApp não configurado para baixar o áudio.")
    rota = "/".join(urllib.parse.quote(parte, safe="") for parte in (sessao, "messages", chat_id, message_id, "media"))
    requisicao = urllib.request.Request(
        f"{base_url}/api/sessions/{rota}",
        headers={"X-API-Key": api_key, "Accept": "audio/*,application/octet-stream"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=30) as resposta:
            return _ler_resposta_limitada(resposta, limite)
    except AudioInvalido:
        raise
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise MidiaCanalIndisponivel("Não foi possível baixar o áudio do WhatsApp.") from exc


def baixar_audio_telegram(token: str, file_id: str) -> bytes:
    token = str(token or "").strip()
    file_id = str(file_id or "").strip()
    if not token or not file_id:
        raise MidiaCanalIndisponivel("Telegram não configurado para baixar o áudio.")

    corpo = json.dumps({"file_id": file_id}).encode("utf-8")
    requisicao = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/getFile",
        data=corpo,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=15) as resposta:
            payload = json.loads(resposta.read().decode("utf-8"))
        caminho = str((payload.get("result") or {}).get("file_path") or "").strip()
        if payload.get("ok") is not True or not caminho or ".." in caminho.split("/"):
            raise MidiaCanalIndisponivel("O Telegram não forneceu um caminho de mídia válido.")

        caminho_seguro = urllib.parse.quote(caminho, safe="/")
        download = urllib.request.Request(
            f"https://api.telegram.org/file/bot{token}/{caminho_seguro}",
            headers={"Accept": "audio/*,application/octet-stream"},
            method="GET",
        )
        with urllib.request.urlopen(download, timeout=30) as resposta:
            return _ler_resposta_limitada(resposta, limite_audio_bytes())
    except (AudioInvalido, MidiaCanalIndisponivel):
        raise
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        raise MidiaCanalIndisponivel("Não foi possível baixar o áudio do Telegram.") from exc
