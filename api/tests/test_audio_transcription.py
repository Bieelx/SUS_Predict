from types import SimpleNamespace

import pytest

from api.core.audio_transcription import (
    AudioInvalido,
    TranscritorLocal,
    validar_metadados_audio,
)


def test_limites_de_audio_sao_validados_antes_da_transcricao(monkeypatch):
    monkeypatch.setenv("CLARA_AUDIO_MAX_BYTES", "100")
    monkeypatch.setenv("CLARA_AUDIO_MAX_SECONDS", "30")

    with pytest.raises(AudioInvalido, match="tamanho"):
        validar_metadados_audio(tamanho_bytes=101, duracao_segundos=5, mime_type="audio/ogg")
    with pytest.raises(AudioInvalido, match="duração"):
        validar_metadados_audio(tamanho_bytes=50, duracao_segundos=31, mime_type="audio/ogg")
    with pytest.raises(AudioInvalido, match="formato"):
        validar_metadados_audio(tamanho_bytes=50, duracao_segundos=5, mime_type="video/mp4")


def test_transcritor_local_apaga_arquivo_temporario(monkeypatch):
    caminhos = []

    class ModeloFake:
        def transcribe(self, caminho, **opcoes):
            caminhos.append(caminho)
            assert opcoes["language"] == "pt"
            assert opcoes["vad_filter"] is True
            return (
                iter([SimpleNamespace(text=" Como está "), SimpleNamespace(text=" o estoque? ")]),
                SimpleNamespace(language="pt", language_probability=0.99, duration=2.5),
            )

    transcritor = TranscritorLocal()
    monkeypatch.setattr(transcritor, "_obter_modelo", lambda: ModeloFake())

    resultado = transcritor.transcrever(
        b"audio-de-teste",
        mime_type="audio/ogg",
        duracao_segundos=3,
    )

    assert resultado.texto == "Como está o estoque?"
    assert resultado.idioma == "pt"
    assert caminhos
    assert all(not __import__("os").path.exists(caminho) for caminho in caminhos)


def test_transcritor_rejeita_audio_sem_fala(monkeypatch):
    class ModeloFake:
        def transcribe(self, *_args, **_kwargs):
            return iter([SimpleNamespace(text="  ")]), SimpleNamespace(language="pt")

    transcritor = TranscritorLocal()
    monkeypatch.setattr(transcritor, "_obter_modelo", lambda: ModeloFake())

    with pytest.raises(AudioInvalido, match="identificar fala"):
        transcritor.transcrever(b"silencio", mime_type="audio/ogg")
