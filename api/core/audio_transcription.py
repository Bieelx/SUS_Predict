"""Transcrição local e efêmera de mensagens de voz da Clara."""

from __future__ import annotations

import os
import tempfile
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any


class AudioInvalido(ValueError):
    """O arquivo recebido não atende aos limites aceitos."""


class TranscricaoIndisponivel(RuntimeError):
    """O provedor local não está pronto ou não conseguiu transcrever."""


@dataclass(frozen=True)
class ResultadoTranscricao:
    texto: str
    idioma: str | None = None
    confianca_idioma: float | None = None
    duracao_segundos: float | None = None


MIMES_AUDIO_SUPORTADOS = {
    "audio/aac": ".aac",
    "audio/amr": ".amr",
    "audio/m4a": ".m4a",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/x-m4a": ".m4a",
    "audio/x-wav": ".wav",
}


def _inteiro_ambiente(nome: str, padrao: int, minimo: int = 1) -> int:
    try:
        return max(minimo, int(os.getenv(nome, str(padrao))))
    except (TypeError, ValueError):
        return padrao


def limite_audio_bytes() -> int:
    return _inteiro_ambiente("CLARA_AUDIO_MAX_BYTES", 10 * 1024 * 1024)


def limite_audio_segundos() -> int:
    return _inteiro_ambiente("CLARA_AUDIO_MAX_SECONDS", 120)


def validar_metadados_audio(
    *,
    tamanho_bytes: int | None,
    duracao_segundos: int | float | None,
    mime_type: str | None,
) -> str:
    try:
        tamanho = int(tamanho_bytes) if tamanho_bytes is not None else None
        duracao = float(duracao_segundos) if duracao_segundos is not None else None
    except (TypeError, ValueError) as exc:
        raise AudioInvalido("Os metadados do áudio recebido são inválidos.") from exc
    if tamanho is not None and tamanho > limite_audio_bytes():
        raise AudioInvalido("O áudio ultrapassa o limite de tamanho permitido.")
    if duracao is not None and duracao > limite_audio_segundos():
        raise AudioInvalido("O áudio ultrapassa o limite de duração permitido.")

    mime = str(mime_type or "audio/ogg").lower().split(";", 1)[0].strip()
    if mime not in MIMES_AUDIO_SUPORTADOS:
        raise AudioInvalido("Este formato de áudio não é suportado.")
    return MIMES_AUDIO_SUPORTADOS[mime]


class TranscritorLocal:
    """Adaptador lazy para faster-whisper; o modelo é carregado uma vez por processo."""

    def __init__(self) -> None:
        self._modelo: Any | None = None
        self._lock = threading.Lock()
        self._inference_lock = threading.Lock()

    def _obter_modelo(self) -> Any:
        if self._modelo is not None:
            return self._modelo
        with self._lock:
            if self._modelo is not None:
                return self._modelo
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise TranscricaoIndisponivel(
                    "A transcrição local não está instalada no servidor."
                ) from exc

            try:
                self._modelo = WhisperModel(
                    os.getenv("CLARA_STT_MODEL", "small").strip() or "small",
                    device=os.getenv("CLARA_STT_DEVICE", "cpu").strip() or "cpu",
                    compute_type=os.getenv("CLARA_STT_COMPUTE_TYPE", "int8").strip() or "int8",
                    local_files_only=os.getenv("CLARA_STT_LOCAL_FILES_ONLY", "false").lower()
                    in {"1", "true", "yes", "on"},
                )
            except Exception as exc:
                raise TranscricaoIndisponivel(
                    "O modelo local de transcrição não pôde ser carregado."
                ) from exc
            return self._modelo

    def transcrever(
        self,
        conteudo: bytes,
        *,
        mime_type: str | None,
        duracao_segundos: int | float | None = None,
    ) -> ResultadoTranscricao:
        sufixo = validar_metadados_audio(
            tamanho_bytes=len(conteudo),
            duracao_segundos=duracao_segundos,
            mime_type=mime_type,
        )
        if not conteudo:
            raise AudioInvalido("O áudio recebido está vazio.")

        caminho: str | None = None
        try:
            with tempfile.NamedTemporaryFile(prefix="clara-audio-", suffix=sufixo, delete=False) as arquivo:
                arquivo.write(conteudo)
                caminho = arquivo.name

            modelo = self._obter_modelo()
            with self._inference_lock:
                segmentos, info = modelo.transcribe(
                    caminho,
                    language="pt",
                    vad_filter=True,
                    beam_size=5,
                    without_timestamps=True,
                )
                texto = " ".join(
                    str(getattr(segmento, "text", "")).strip()
                    for segmento in segmentos
                    if str(getattr(segmento, "text", "")).strip()
                ).strip()
            if not texto:
                raise AudioInvalido("Não consegui identificar fala neste áudio.")
            return ResultadoTranscricao(
                texto=texto,
                idioma=getattr(info, "language", None),
                confianca_idioma=getattr(info, "language_probability", None),
                duracao_segundos=getattr(info, "duration", duracao_segundos),
            )
        except (AudioInvalido, TranscricaoIndisponivel):
            raise
        except Exception as exc:
            raise TranscricaoIndisponivel("Não foi possível transcrever este áudio.") from exc
        finally:
            if caminho:
                Path(caminho).unlink(missing_ok=True)


_TRANSCRITOR_LOCAL = TranscritorLocal()


def transcrever_audio(
    conteudo: bytes,
    *,
    mime_type: str | None,
    duracao_segundos: int | float | None = None,
) -> ResultadoTranscricao:
    provedor = os.getenv("CLARA_STT_PROVIDER", "local").strip().lower()
    if provedor != "local":
        raise TranscricaoIndisponivel(f"Provedor de transcrição não suportado: {provedor}")
    return _TRANSCRITOR_LOCAL.transcrever(
        conteudo,
        mime_type=mime_type,
        duracao_segundos=duracao_segundos,
    )
