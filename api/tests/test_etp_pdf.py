import importlib
import os
import tempfile

import pytest


@pytest.fixture()
def db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("SQLITE_PATH", path)

    from api.core import db as db_module

    importlib.reload(db_module)
    db_module.init_db()
    yield db_module
    os.remove(path)


def test_pdf_etp_tem_os_13_elementos_e_acentos(db):
    from fpdf import FPDF  # noqa: F401 - dependência obrigatória
    from api.core.etp_pdf import ELEMENTOS, gerar_pdf_etp

    etp = db.criar_etp("355030", "Dipirona 500mg", "Cobertura de 5 dias — consumo médio 100/dia.")
    pdf = gerar_pdf_etp(etp)

    assert pdf.startswith(b"%PDF")
    assert len(ELEMENTOS) == 13
    assert sum(obrig for *_, obrig in ELEMENTOS) == 5


def test_confirmacao_web_envia_pdf_so_ao_canal_da_conversa(db, monkeypatch):
    from api.core import channel_router

    etp = db.criar_etp("355030", "Dipirona", "Justificativa.")
    monkeypatch.setattr(db, "listar_conexoes_canal", lambda usuario: [
        {"provedor": "telegram", "external_chat_id": "t1", "conversa_atual_id": "conv-1"},
        {"provedor": "whatsapp", "external_chat_id": "w1", "conversa_atual_id": "conv-1"},
        {"provedor": "telegram", "external_chat_id": "t2", "conversa_atual_id": "outra"},
    ])
    enviados = []
    monkeypatch.setattr(channel_router, "_telegram_send_document",
                        lambda chat, conteudo, nome, legenda: enviados.append(("telegram", chat, conteudo[:4])) or True)
    monkeypatch.setattr(channel_router, "_whatsapp_send_document",
                        lambda chat, conteudo, nome, legenda: enviados.append(("whatsapp", chat, conteudo[:4])) or True)

    assert channel_router.enviar_etp_aos_canais("u@x", "conv-1", etp["id"]) == 2
    assert enviados == [("telegram", "t1", b"%PDF"), ("whatsapp", "w1", b"%PDF")]
