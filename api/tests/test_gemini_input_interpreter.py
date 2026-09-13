from api.core import gemini_input_interpreter as interpreter


def test_nao_envia_relato_para_gemini_sem_habilitacao(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "chave-de-teste")
    monkeypatch.setenv("SUSBOT_GEMINI_INPUT_ENABLED", "false")
    assert interpreter.interpretar_com_gemini("Chegaram 25 doses de dengue") is None


def test_nao_envia_dado_identificavel_para_gemini(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "chave-de-teste")
    monkeypatch.setenv("SUSBOT_GEMINI_INPUT_ENABLED", "true")
    assert interpreter.interpretar_com_gemini("Paciente 11987654321 recebeu uma dose") is None
