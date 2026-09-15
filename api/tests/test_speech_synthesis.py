from api.core.speech_synthesis import deve_responder_com_audio


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
