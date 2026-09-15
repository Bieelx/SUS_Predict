"""Síntese de voz opcional da Clara via ElevenLabs, sempre com fallback textual."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request


class SinteseIndisponivel(RuntimeError):
    """ElevenLabs não está configurada ou recusou a geração."""


def _erro_http_seguro(exc: urllib.error.HTTPError) -> str:
    """Extrai apenas código/tipo/mensagem da ElevenLabs, nunca chave ou request."""

    tipo = ""
    mensagem = ""
    try:
        payload = json.loads(exc.read(16_384).decode("utf-8", errors="replace"))
        detalhe = payload.get("detail", payload) if isinstance(payload, dict) else {}
        if isinstance(detalhe, dict):
            tipo = str(detalhe.get("status") or detalhe.get("code") or "")[:80]
            mensagem = str(detalhe.get("message") or "")[:240]
    except (ValueError, OSError):
        pass
    sufixo = ": ".join(parte for parte in (tipo, mensagem) if parte)
    return f"ElevenLabs HTTP {exc.code}{': ' + sufixo if sufixo else ''}"


def deve_responder_com_audio(resposta: str, entrada_foi_audio: bool) -> bool:
    if not entrada_foi_audio or not os.getenv("ELEVENLABS_API_KEY", "").strip():
        return False
    if os.getenv("CLARA_TTS_ENABLED", "true").strip().lower() not in {"1", "true", "yes", "on"}:
        return False
    try:
        minimo = max(1, int(os.getenv("CLARA_TTS_MIN_CHARS", "320")))
    except ValueError:
        minimo = 320
    return len(str(resposta or "").strip()) >= minimo


def _texto_falado(texto: str) -> str:
    texto = re.sub(r"https?://\S+", "link disponível na mensagem", texto)
    texto = re.sub(r"(?m)^#{1,6}\s+", "", texto)
    texto = re.sub(r"[*_`]+", "", texto)
    limite = min(2500, max(200, int(os.getenv("CLARA_TTS_MAX_CHARS", "2400"))))
    return re.sub(r"\s+", " ", texto).strip()[:limite]


def sintetizar_fala(texto: str) -> bytes:
    chave = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    if not chave or not voice_id:
        raise SinteseIndisponivel("ElevenLabs não configurada")
    corpo = json.dumps({
        "text": _texto_falado(texto),
        "model_id": os.getenv("ELEVENLABS_MODEL_ID", "eleven_flash_v2_5").strip(),
        "language_code": "pt",
    }).encode("utf-8")
    formato = urllib.parse.quote(os.getenv("ELEVENLABS_OUTPUT_FORMAT", "mp3_22050_32"), safe="")
    requisicao = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{urllib.parse.quote(voice_id, safe='')}?output_format={formato}",
        data=corpo,
        headers={"Content-Type": "application/json", "Accept": "audio/mpeg", "xi-api-key": chave},
        method="POST",
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=30) as resposta:
            audio = resposta.read(8 * 1024 * 1024 + 1)
    except urllib.error.HTTPError as exc:
        raise SinteseIndisponivel(_erro_http_seguro(exc)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        motivo = str(getattr(exc, "reason", exc))[:160]
        raise SinteseIndisponivel(f"Falha de rede ao chamar ElevenLabs: {motivo}") from exc
    if not audio or len(audio) > 8 * 1024 * 1024:
        raise SinteseIndisponivel("Áudio gerado inválido")
    return audio
