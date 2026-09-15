"""Clara proativa, passagem para humano e fallback com Ollama desligado."""
import socket
from contextlib import contextmanager
from datetime import datetime, timezone

import pytest

from api.tests.test_local_records import svc  # noqa: F401

from api.tests.test_channel_router import _parear, _update, canais  # noqa: F401

MEIO_DIA_SP = datetime(2026, 9, 14, 15, 0, tzinfo=timezone.utc)
MEIA_NOITE_SP = datetime(2026, 9, 15, 3, 0, tzinfo=timezone.utc)
ALERTA = {"titulo": "Casos de dengue acima do esperado", "mensagem": "Incidência 2x a média.",
          "severidade": "ALTA", "tipo_alerta": "EPIDEMIA", "competencia_referencia": "2026-08-01"}


def test_janela_de_silencio(monkeypatch):
    from api.core.clara_proativa import em_silencio
    assert em_silencio(MEIA_NOITE_SP) and not em_silencio(MEIO_DIA_SP)
    monkeypatch.setenv("CLARA_ALERTAS_SILENCIO", "0-0")
    assert not em_silencio(MEIA_NOITE_SP)


def test_alerta_critico_so_para_opt_in_uma_vez_e_fora_do_silencio(canais, monkeypatch):
    router_module, _db, mensagens = canais
    from api.core import clara_proativa
    monkeypatch.setattr(router_module, "_enviar", lambda p, c, t: mensagens.append((c, t)) or True)
    monkeypatch.setattr(clara_proativa, "alertas_criticos", lambda ibge6: ("Guarulhos", [ALERTA]))
    _parear(canais)

    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 0  # sem opt-in

    router_module.processar_update_telegram(_update(2, "/alertas ligar"))
    assert "Vou te avisar" in mensagens[-1][1]
    assert clara_proativa.enviar_alertas_criticos(MEIA_NOITE_SP) == 0
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 1
    assert "Alerta crítico em Guarulhos" in mensagens[-1][1]
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 0  # mesmo alerta não repete

    router_module.processar_update_telegram(_update(3, "/alertas desligar"))
    monkeypatch.setattr(clara_proativa, "alertas_criticos", lambda ibge6: ("Guarulhos", [{**ALERTA, "titulo": "Outro"}]))
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 0


def test_alerta_nao_sai_para_acesso_desativado_e_envio_falho_tenta_de_novo(canais, monkeypatch):
    router_module, db_module, _mensagens = canais
    from api.core import clara_proativa
    monkeypatch.setattr(clara_proativa, "alertas_criticos", lambda ibge6: ("Guarulhos", [ALERTA]))
    _parear(canais)
    router_module.processar_update_telegram(_update(2, "/alertas ligar"))

    monkeypatch.setattr(router_module, "_enviar", lambda p, c, t: False)
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 0
    db_module.upsert_acesso("user-abc", "gestor", ["351300"], ativo=False, atribuido_por="teste")
    monkeypatch.setattr(router_module, "_enviar", lambda p, c, t: True)
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 0
    db_module.upsert_acesso("user-abc", "gestor", ["351300"], ativo=True, atribuido_por="teste")
    assert clara_proativa.enviar_alertas_criticos(MEIO_DIA_SP) == 1


def test_humano_encaminha_ao_responsavel_da_unidade_com_canal(canais, monkeypatch):
    router_module, db_module, mensagens = canais
    _parear(canais)
    db_module.upsert_acesso("revisora", "gestor", ["351300"], ativo=True, atribuido_por="teste")
    db_module.upsert_acesso("fora", "gestor", ["999999"], ativo=True, atribuido_por="teste")
    responsaveis = [{"usuario": "revisora", "unidade": "UBS Piloto"}, {"usuario": "fora", "unidade": "UBS Piloto"}]
    monkeypatch.setattr(router_module, "_responsaveis_da_unidade", lambda usuario, ibge6: responsaveis)
    monkeypatch.setattr(db_module, "listar_conexoes_canal", lambda usuario: [
        {"provedor": "telegram", "external_chat_id": f"chat-{usuario}"}])
    enviados = []
    monkeypatch.setattr(router_module, "_enviar", lambda p, c, t: enviados.append((c, t)) or True)

    router_module.processar_update_telegram(_update(2, "/humano não consigo registrar dipirona"))

    assert [c for c, _ in enviados[:-1]] == ["chat-revisora"]  # sem acesso ao município não recebe
    assert "“não consigo registrar dipirona”" in enviados[0][1] and "UBS Piloto" in enviados[0][1]
    assert "Encaminhei sua dúvida para 1 responsável" in enviados[-1][1]


def test_humano_sem_responsavel_alcancavel_avisa(canais, monkeypatch):
    router_module, _db, mensagens = canais
    _parear(canais)
    monkeypatch.setattr(router_module, "_responsaveis_da_unidade", lambda usuario, ibge6: [])
    router_module.processar_update_telegram(_update(2, "Quero falar com um humano: preciso de ajuda"))
    assert "Não encontrei um revisor ou gestor" in mensagens[-1][1]
    router_module.processar_update_telegram(_update(3, "/humano"))
    assert "Me conte em uma frase" in mensagens[-1][1]


def test_recusa_no_canal_sugere_humano(canais, monkeypatch):
    router_module, _db, mensagens = canais

    class Recusa:
        def stream_eventos(self, pergunta):
            yield {"event": "fim", "data": {"resposta": "Fora do escopo.", "plano": {"acao": "fora_do_escopo"}}}

    monkeypatch.setattr(router_module, "criar_susbot_agente", lambda *a, **k: Recusa())
    _parear(canais)
    router_module.processar_update_telegram(_update(2, "qual a capital da França"))
    assert "/humano" in mensagens[-1][1]


@contextmanager
def _porta_fechada():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        porta = sock.getsockname()[1]
    yield f"http://127.0.0.1:{porta}/v1"


@pytest.mark.parametrize("gemini_falha,esperado", [(False, "gemini"), (True, "groq")])
def test_ollama_desligado_cai_para_gemini_e_depois_groq(monkeypatch, gemini_falha, esperado):
    """Ollama real (cliente HTTP de verdade) numa porta sem servidor; reservas simuladas."""
    from api.core import susbot_agent

    class Reserva:
        def __init__(self, nome, falha):
            self.nome, self.falha = nome, falha

        def planejar(self, *args):
            if self.falha:
                raise RuntimeError("indisponivel")
            return {"provider": self.nome}

        def stream_resposta(self, *args):
            if self.falha:
                raise RuntimeError("indisponivel")
            yield self.nome

    with _porta_fechada() as url:
        monkeypatch.setenv("SUSBOT_LLM_PROVIDER", "local")
        monkeypatch.setenv("SUSBOT_LOCAL_BASE_URL", url)
        monkeypatch.setenv("SUSBOT_LOCAL_TIMEOUT_SECONDS", "2")
        monkeypatch.setattr(susbot_agent, "GeminiClaraLLM", lambda: Reserva("gemini", gemini_falha))
        monkeypatch.setattr(susbot_agent, "GroqClaraLLM", lambda: Reserva("groq", False))
        llm = susbot_agent._montar_llm_com_fallback()
        assert llm.planejar("p", {}, []) == {"provider": esperado}
        assert list(llm.stream_resposta("p", {}, {"acao": "resposta"}, None)) == [esperado]


def test_responsaveis_da_unidade_consulta_revisor_e_gestor(svc, monkeypatch):
    from api.core import channel_router, local_records_store
    monkeypatch.setattr(local_records_store, "configured_store", lambda: svc.store)
    linhas = channel_router._responsaveis_da_unidade("writer", "355030")
    assert sorted(l["usuario"] for l in linhas) == ["manager", "reviewer"]
    assert channel_router._responsaveis_da_unidade("writer", "999999") == []
    assert channel_router._responsaveis_da_unidade("outsider", "355030") == []
