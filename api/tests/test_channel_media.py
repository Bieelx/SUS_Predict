import io
import json

import pytest

from api.core import channel_media
from api.core.audio_transcription import AudioInvalido


class RespostaFake:
    def __init__(self, conteudo: bytes, headers=None):
        self._buffer = io.BytesIO(conteudo)
        self.headers = headers or {}

    def read(self, tamanho=-1):
        return self._buffer.read(tamanho)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


def test_download_telegram_usa_getfile_e_limita_leitura(monkeypatch):
    chamadas = []
    payload = json.dumps({"ok": True, "result": {"file_path": "voice/file_1.oga"}}).encode()

    def urlopen(request, timeout):
        chamadas.append((request.full_url, timeout))
        if request.full_url.endswith("/getFile"):
            return RespostaFake(payload)
        return RespostaFake(b"audio-ogg", {"Content-Length": "9"})

    monkeypatch.setattr(channel_media.urllib.request, "urlopen", urlopen)
    conteudo = channel_media.baixar_audio_telegram("token-teste", "file-id")

    assert conteudo == b"audio-ogg"
    assert chamadas[0][0].endswith("/getFile")
    assert chamadas[1][0].endswith("/voice/file_1.oga")


def test_download_telegram_interrompe_conteudo_acima_do_limite(monkeypatch):
    monkeypatch.setenv("CLARA_AUDIO_MAX_BYTES", "4")
    payload = json.dumps({"ok": True, "result": {"file_path": "voice/file.oga"}}).encode()
    respostas = iter([RespostaFake(payload), RespostaFake(b"12345")])
    monkeypatch.setattr(channel_media.urllib.request, "urlopen", lambda *_args, **_kwargs: next(respostas))

    with pytest.raises(AudioInvalido, match="tamanho"):
        channel_media.baixar_audio_telegram("token-teste", "file-id")
