"""Continuidade durável sem misturar usuários, conversas ou permissões."""
import pytest
from fastapi import HTTPException
from api.core import db, conversation_hub as hub
from api.core.conversation_context import carregar_historico, evidencia_com_contexto
from api.core.susbot_intents import rotear_com_contexto


@pytest.fixture
def chat(monkeypatch, tmp_path):
    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'context.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    return db.criar_conversa('ana', 'Investigação')['id']


def test_recupera_assunto_antigo_e_mensagens_recentes(chat):
    db.adicionar_mensagem(chat, 'web', 'Investigar surtos no município', 'Vamos investigar.', None)
    db.adicionar_mensagem(chat, 'web', 'Estoque da dipirona', 'Resultado histórico: 25 unidades.', '/insumos')
    for i in range(110):
        db.adicionar_mensagem(chat, 'telegram', f'Casos no período {i}', f'Resultado {i}', '/epidemiologia')
    history = carregar_historico('ana', chat, 'Volte ao estoque da dipirona')
    assert any('25 unidades' in h['resposta'] for h in history)
    assert history[-1]['pergunta'] == 'Casos no período 109'
    assert len(history) <= 24
    assert any('Investigar surtos' in h['pergunta'] for h in history)


def test_nao_recupera_outra_conversa_ou_usuario(chat):
    db.adicionar_mensagem(chat, 'web', 'dado reservado', '25', None)
    other = db.criar_conversa('ana', 'Nova')['id']
    assert carregar_historico('ana', other) == []
    with pytest.raises(HTTPException):
        carregar_historico('bruno', chat)


def test_plano_persistido_reconstitui_periodo_sem_llm(chat):
    plan = {'acao': 'ferramenta', 'ferramenta': 'consultar_epidemiologia',
            'argumentos': {'sistema': 'SIH', 'ano_ini': 2024, 'ano_fim': 2024, 'doenca_cod': 'A90'}}
    message = db.adicionar_mensagem(chat, 'web', 'Internações por dengue em 2024', 'Leitura de 2024', '/epidemiologia')
    hub.salvar_evidencia(chat, message['id'], evidencia_com_contexto(None, {'plano': plan}))
    history = carregar_historico('ana', chat, 'E em 2025?')
    route = rotear_com_contexto('E em 2025?', history)
    assert route.plano['argumentos'] == {'sistema': 'SIH', 'ano_ini': 2025, 'ano_fim': 2025, 'doenca_cod': 'A90'}
    assert history[0]['plano_consulta']['argumentos']['ano_ini'] == 2024


def test_explicacao_referencial_vai_ao_planejador_com_historico():
    history = [{'pergunta': 'Estoque da dipirona', 'resposta': '25 unidades', 'plano_consulta': None}]
    assert rotear_com_contexto('Por que esse estoque está baixo?', history) is None
    assert rotear_com_contexto('Agora quero internações em 2023', history).plano['argumentos']['ano_ini'] == 2023
    assert rotear_com_contexto('E em 2025?', []) is None


def test_plano_de_escrita_nao_e_reutilizado_como_consulta():
    artifact = evidencia_com_contexto(None, {'plano': {'acao': 'ferramenta', 'ferramenta': 'gerar_etp', 'argumentos': {'item': 'dipirona'}}})
    assert '_continuidade' not in artifact


def test_plano_antigo_nao_sobrepoe_novo_assunto():
    history = [{'plano_consulta': {'ferramenta': 'consultar_epidemiologia', 'argumentos': {'sistema': 'SIH'}}},
               {'pergunta': 'Como funciona o projeto?', 'plano_consulta': None}]
    assert rotear_com_contexto('E em 2025?', history) is None


def test_evidencia_historica_disponivel_para_explicacao(chat):
    message = db.adicionar_mensagem(chat, 'whatsapp', 'De onde vem o valor?', 'Fonte SINAN', '/epidemiologia')
    hub.salvar_evidencia(chat, message['id'], {'tipo': 'resumo', 'campos': {'casos': 25}, 'fonte': 'SINAN', 'competencia': '2024'})
    history = carregar_historico('ana', chat, 'Explique esse valor')
    assert 'SINAN' in history[-1]['evidencia_anterior']
    assert 'histórica' in history[-1]['nota_evidencia']
