import io
import urllib.error

import pytest

from api.core.speech_synthesis import SinteseIndisponivel, deve_responder_com_audio, sintetizar_fala


def test_audio_exige_entrada_de_voz_chave_e_resposta_longa(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "teste")
    monkeypatch.setenv("CLARA_TTS_MIN_CHARS", "10")
    assert deve_responder_com_audio("resposta suficientemente longa", True) is True
    assert deve_responder_com_audio("curta", True) is False
    assert deve_responder_com_audio("resposta suficientemente longa", False) is False


def test_audio_pode_ser_desativado(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "teste")
    monkeypatch.setenv("CLARA_TTS_ENABLED", "false")
    assert deve_responder_com_audio("x" * 500, True) is False


def test_erro_da_elevenlabs_preserva_status_sem_expor_requisicao(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "segredo-que-nao-pode-aparecer")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "voz-teste")
    erro = urllib.error.HTTPError(
        "https://api.elevenlabs.io", 401, "Unauthorized", {},
        io.BytesIO(b'{"detail":{"status":"invalid_api_key","message":"Invalid API key"}}'),
    )
    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(erro))

    with pytest.raises(SinteseIndisponivel, match="HTTP 401: invalid_api_key: Invalid API key") as exc:
        sintetizar_fala("Teste de voz")
    assert "segredo-que-nao-pode-aparecer" not in str(exc.value)
