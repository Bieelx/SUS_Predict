"""Entrada comum com persistência isolada; nenhum provedor externo é chamado."""
from datetime import date
from types import SimpleNamespace
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from api.tests.test_local_records import svc, UNIT
from api.core import db, local_records_router, susbot_router, channel_router
from api.core.clara_input_flow import input_kind, process_input, persist_input
from api.core.local_records_interpreter import interpret
from api.core.operational_inputs_interpreter import interpret_operational_input


@pytest.fixture
def flow(svc, monkeypatch, tmp_path):
    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'chat.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    monkeypatch.setattr(local_records_router, 'service', lambda: svc)
    return svc, db.criar_conversa('writer', 'Relato')['id']


@pytest.mark.parametrize('text,kind', [
    ('Clara, hoje apliquei 20 doses da vacina da dengue', 'input_operacional'),
    ('Hoje foram aplicadas 20 doses contra dengue', 'input_operacional'),
    ('Precisamos internar 2 pessoas por dengue', 'input_operacional'),
    ('Tivemos 3 encaminhamentos de dengue', 'registro_local'),
    ('Atendi hoje oito pessoas com suspeita de dengue', 'registro_local'),
    ('Recebemos 500 doses da vacina COVID-19', 'input_operacional'),
    ('UTI: 19 leitos ocupados e 1 disponível', 'input_operacional'),
    ('Como registrar 20 doses?', None),
    ('Quantas doses aplicamos hoje?', None),
    ('Amanhã vamos aplicar 20 doses', None),
    ('Se eu apliquei 20 doses, qual o saldo?', None),
    ('Quanto temos em estoque', None),
])
def test_classifica_acontecimento_sem_confundir_consulta(text, kind):
    assert input_kind(text) == kind


@pytest.mark.parametrize('channel', ['web', 'telegram', 'whatsapp'])
def test_mesmo_relato_cria_rascunho_nos_tres_canais(flow, channel):
    svc, conversation = flow
    text = 'Clara, hoje atendi 20 pessoas com suspeita de dengue'
    result = process_input('writer', text, conversation, '355030', channel=channel, event_id='evt-001')
    assert result['evento'] == 'rascunho_local_pronto'
    record = result['payload']['registros'][0]
    detail = svc.detail('writer', record['id'])
    assert detail['relato']['canal'] == channel
    assert detail['atual']['status'] == 'rascunho'
    assert detail['confirmada_vigente'] is None
    persist_input(result, conversation, channel, text)
    assert db.listar_mensagens(conversation)[0]['referencia_rota'].startswith('/registros-unidade/')
    replay = process_input('writer', text, conversation, '355030', channel=channel, event_id='evt-001')
    assert replay['payload']['relato_id'] == result['payload']['relato_id']


def test_escolha_de_unidade_continua_relato_e_revalida_acesso(flow, monkeypatch):
    svc, conversation = flow
    original = svc.units
    monkeypatch.setattr(svc, 'units', lambda actor: {'itens': original(actor)['itens'] + [{'id': 'other', 'nome': 'UBS outra', 'ibge6': '355030'}]})
    text = 'Hoje atendi 20 pessoas com suspeita de dengue'
    result = process_input('writer', text, conversation, '355030')
    assert result['artefato']['pendente']
    persist_input(result, conversation, 'web', text)
    wrong = process_input('writer', 'UBS sem acesso', conversation, '355030')
    assert wrong['evento'] is None
    persist_input(wrong, conversation, 'web', 'UBS sem acesso')
    chosen = process_input('writer', 'UBS teste', conversation, '355030')
    assert chosen['evento'] == 'rascunho_local_pronto'
    assert chosen['payload']['unidade_id'] == UNIT


def test_pergunta_e_cancelamento_nao_criam_registro(flow, monkeypatch):
    svc, conversation = flow
    monkeypatch.setattr(svc, 'units', lambda actor: {'itens': [{'id': 'a', 'nome': 'A', 'ibge6': '355030'}, {'id': 'b', 'nome': 'B', 'ibge6': '355030'}]})
    result = process_input('writer', 'Hoje atendi 20 pessoas com suspeita de dengue', conversation, '355030')
    persist_input(result, conversation, 'web', 'Hoje atendi 20 pessoas com suspeita de dengue')
    assert process_input('writer', 'Quantas doses temos?', conversation, '355030') is None
    canceled = process_input('writer', 'cancelar', conversation, '355030')
    assert canceled['artefato']['pendente'] is None
    assert canceled['evento'] is None


@pytest.mark.parametrize('text', ['Apliquei hoje 20 doses contra dengue', 'Hoje foram aplicadas 20 doses contra dengue'])
def test_variantes_locais(text):
    assert interpret(text, date(2026, 9, 13))[0]['valor'] == '20'


def test_entrada_natural_e_hipotese():
    assert interpret_operational_input('Clara, hoje recebemos 500 doses da vacina COVID-19')['payload']['qtd_doses'] == 500
    from fastapi import HTTPException
    with pytest.raises(HTTPException):
        interpret_operational_input('Entrada de 500 doses da vacina COVID-19 amanhã')


@pytest.mark.parametrize('channel', ['telegram', 'whatsapp'])
def test_canal_desvia_antes_do_agente(flow, monkeypatch, channel):
    svc, conversation = flow
    monkeypatch.setattr(channel_router, 'carregar_acesso', lambda actor: SimpleNamespace(perfil='gestor', municipios=('355030',)))
    monkeypatch.setattr(channel_router, '_telegram_sessao_expirada', lambda connection: False)
    monkeypatch.setattr(db, 'atualizar_conversa_canal', lambda *args: None)
    monkeypatch.setattr(channel_router, 'criar_susbot_agente', lambda *a, **k: pytest.fail('Relato caiu no agente de consultas'))
    connection = {'id': 'c1', 'usuario': 'writer', 'ibge6': '355030', 'provedor': channel, 'conversa_atual_id': conversation}
    answer, formatted = channel_router._processar_pergunta_canal(connection, 'Hoje atendi 20 pessoas com suspeita de dengue')
    assert 'rascunhos' in answer
    assert '/registros-unidade/' in formatted


def test_web_sem_contexto_de_unidade_reconhece_input(flow, monkeypatch):
    monkeypatch.setattr(susbot_router, 'provisionar_acesso_http', lambda user: SimpleNamespace(perfil='gestor', municipios=('355030',)))
    monkeypatch.setattr(susbot_router, 'criar_susbot_agente', lambda *a, **k: pytest.fail('Relato caiu no agente de consultas'))
    app = FastAPI()
    app.include_router(susbot_router.router)
    app.dependency_overrides[susbot_router.require_user] = lambda: {'id': 'writer'}
    app.dependency_overrides[susbot_router.verificar_acesso_susbot] = lambda: 'test'
    with TestClient(app) as client:
        result = client.post('/api/susbot/perguntar', json={'pergunta': 'Hoje atendi 20 pessoas com suspeita de dengue', 'ibge6': '355030'})
    assert result.status_code == 200
    assert 'event: rascunho_local_pronto' in result.text
    assert result.headers['x-conversa-id']


from api.tests.test_operational_inputs import svc as operational_svc, ACTOR, ESTABLISHMENT


@pytest.mark.parametrize('channel', ['web', 'telegram', 'whatsapp'])
def test_estoque_pede_estabelecimento_e_nao_movimenta_saldo(operational_svc, monkeypatch, tmp_path, channel):
    from api.core import operational_inputs_router
    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'chat.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    monkeypatch.setattr(operational_inputs_router, 'service', lambda: operational_svc)
    conversation = db.criar_conversa(ACTOR, 'Estoque')['id']
    text = 'Clara, hoje recebemos 500 doses da vacina COVID-19'
    response = process_input(ACTOR, text, conversation, '355030', channel=channel)
    assert response['artefato']['pendente']
    persist_input(response, conversation, channel, text)
    # Mesmo que o desktop repita o contexto anterior, o nome responde à seleção.
    context = SimpleNamespace(id_estabelecimento=ESTABLISHMENT)
    chosen = process_input(ACTOR, '2027275', conversation, '355030', channel=channel, operational=context)
    assert chosen['evento'] == 'rascunho_operacional_pronto'
    assert chosen['payload']['payload_proposto']['qtd_doses'] == 500
    with operational_svc.store.transaction() as tx:
        assert tx.one('SELECT count(*) total FROM vacinacao_usuario')['total'] == 0


@pytest.mark.parametrize('hours,confirmed', [(23, True), (25, False)])
def test_confirmacao_operacional_expira_em_24_horas(
    operational_svc, monkeypatch, tmp_path, hours, confirmed
):
    from datetime import datetime, timedelta, timezone
    from api.core import operational_inputs_router, clara_input_flow

    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'chat.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    monkeypatch.setattr(operational_inputs_router, 'service', lambda: operational_svc)
    start = datetime(2026, 9, 14, 10, tzinfo=timezone.utc)
    monkeypatch.setattr(clara_input_flow, '_now', lambda: start)
    conversation = db.criar_conversa(ACTOR, 'Validade')['id']
    context = SimpleNamespace(id_estabelecimento=ESTABLISHMENT)
    text = 'Entrada de 5 doses da vacina dengue'
    draft = process_input(ACTOR, text, conversation, '355030', channel='whatsapp', operational=context)
    persist_input(draft, conversation, 'whatsapp', text)

    monkeypatch.setattr(clara_input_flow, '_now', lambda: start + timedelta(hours=hours))
    result = process_input(ACTOR, 'CONFIRMO', conversation, '355030', channel='whatsapp')

    with operational_svc.store.transaction() as tx:
        count = tx.one('SELECT count(*) total FROM vacinacao_usuario')['total']
    assert count == (1 if confirmed else 0)
    if confirmed:
        assert result['evento'] == 'registro_confirmado'
    else:
        assert result['evento'] is None
        assert 'expirou após 24 horas' in result['resposta']


@pytest.mark.parametrize('word', ['cancelar', 'cancela', 'cancelo', 'descartar'])
def test_sinonimos_de_cancelamento_usam_mesmo_fluxo(flow, word):
    _, conversation = flow
    text = 'Hoje atendi 20 pessoas com suspeita de dengue'
    draft = process_input('writer', text, conversation, '355030')
    persist_input(draft, conversation, 'web', text)

    canceled = process_input('writer', word, conversation, '355030')

    assert canceled['artefato']['pendente'] is None
    assert 'nada foi enviado' in canceled['resposta']


def test_gemini_pergunta_pendencia_e_completa_com_resposta(operational_svc, monkeypatch, tmp_path):
    from api.core import operational_inputs_router, gemini_input_interpreter

    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'chat.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    monkeypatch.setattr(operational_inputs_router, 'service', lambda: operational_svc)

    def fake_gemini(text):
        base = {'nome_medicamento': 'paracetamol', 'forma_farmaceutica': 'comprimido',
                'tipo_embalagem': 'caixa', 'quantidade_por_embalagem': 20,
                'qtd_embalagens': 2, 'tipo_movimentacao': 'saida'}
        if 'Esclarecimento posterior: 500 mg' not in text:
            return [{'tipo': 'incompleto', 'payload': base, 'pendencias': ['concentracao']}]
        return [{'tipo': 'medicamento', 'payload': {**base, 'concentracao': '500 mg'}, 'pendencias': []}]

    monkeypatch.setattr(gemini_input_interpreter, 'interpretar_com_gemini', fake_gemini)
    conversation = db.criar_conversa(ACTOR, 'Medicamento')['id']
    original = ('Saída de 2 embalagens de paracetamol; forma comprimido; '
                'embalagem caixa; 20 unidades por embalagem')
    context = SimpleNamespace(id_estabelecimento=ESTABLISHMENT)

    pending = process_input(ACTOR, original, conversation, '355030', operational=context)
    assert pending['resposta'] == 'Qual a concentração do paracetamol?'
    assert pending['artefato']['pendente']['etapa'] == 'campos_operacionais'
    persist_input(pending, conversation, 'web', original)

    draft = process_input(ACTOR, '500 mg', conversation, '355030')
    assert draft['evento'] == 'rascunho_operacional_pronto'
    assert draft['payload']['payload_proposto']['concentracao'] == '500 mg'
    with operational_svc.store.transaction() as tx:
        assert tx.one('SELECT count(*) total FROM medicamento_usuario')['total'] == 0


def test_inatividade_preserva_a_conversa_selecionada(flow, monkeypatch):
    from datetime import datetime, timedelta, timezone
    _, old_conversation = flow
    connection = {'id': 'c1', 'usuario': 'writer', 'ibge6': '355030', 'provedor': 'telegram',
                  'conversa_atual_id': old_conversation, 'ultimo_uso_em': (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()}
    monkeypatch.setattr(db, 'get_conexao_canal_por_externo', lambda *a: connection)
    monkeypatch.setattr(db, 'atualizar_conversa_canal', lambda *a: None)
    monkeypatch.setattr(channel_router, 'carregar_acesso', lambda actor: SimpleNamespace(perfil='gestor', municipios=('355030',)))
    monkeypatch.setattr(channel_router, '_menu_inicial', lambda *a: pytest.fail('Relato descartado no menu'))
    monkeypatch.setattr(channel_router, 'criar_susbot_agente', lambda *a, **k: pytest.fail('Relato caiu no agente'))
    sent = []
    monkeypatch.setattr(channel_router, '_enviar', lambda *args: sent.append(args[-1]))
    channel_router._processar_mensagem_canal('telegram', '42', '42', 'teste', 'Hoje atendi 20 pessoas com suspeita de dengue', None, None, evento_id='tg-expired-1')
    assert 'rascunhos' in sent[0]
    assert len(db.listar_mensagens(old_conversation)) == 1


@pytest.mark.parametrize('channel', ['web', 'telegram', 'whatsapp'])
def test_quantidade_exata_completa_relato_aproximado(flow, channel):
    svc, conversation = flow
    original = 'Claro, hoje eu atendi cerca de 20 pessoas com suspeita de Dengue.'
    result = process_input('writer', original, conversation, '355030', channel=channel, input_type='audio')
    assert result['evento'] is None
    assert result['artefato']['pendente']['etapa'] == 'quantidade'
    day = result['artefato']['pendente']['dia']
    with svc.store.transaction() as tx:
        assert tx.one('SELECT count(*) total FROM local_registros')['total'] == 0
    persist_input(result, conversation, channel, original)
    result = process_input('writer', 'foram 25 pessoas', conversation, '355030', channel=channel)
    assert result['evento'] == 'rascunho_local_pronto'
    record = result['payload']['registros'][0]
    assert int(record['atual']['valor']) == 25
    assert record['atual']['dimensoes']['doenca'] == 'dengue'
    assert record['atual']['periodo_inicio'] == day
    detail = svc.detail('writer', record['id'])
    assert detail['confirmada_vigente'] is None
    assert original in detail['relato']['transcricao']
    assert 'foram 25 pessoas' in detail['relato']['transcricao']


@pytest.mark.parametrize('answer', ['cerca de 25', '25 ou 30', '25,5 doses', 'não sei', 'vinte e cinco'])
def test_esclarecimento_ainda_ambiguo_nao_grava(flow, answer):
    svc, conversation = flow
    text = 'Hoje atendi cerca de 20 pessoas com suspeita de dengue'
    result = process_input('writer', text, conversation, '355030')
    persist_input(result, conversation, 'web', text)
    result = process_input('writer', answer, conversation, '355030')
    assert result['evento'] is None
    assert result['artefato']['pendente']['etapa'] == 'quantidade'
    with svc.store.transaction() as tx:
        assert tx.one('SELECT count(*) total FROM local_registros')['total'] == 0


def test_numero_isolado_sem_relato_nao_vira_registro(flow):
    _, conversation = flow
    assert process_input('writer', 'foram 25 pessoas', conversation, '355030') is None


def test_quantidade_depois_unidade_preserva_contexto(flow, monkeypatch):
    svc, conversation = flow
    units = svc.units('writer')['itens']
    monkeypatch.setattr(svc, 'units', lambda actor: {'itens': units + [{'id': 'other', 'nome': 'Outra UBS', 'ibge6': '355030'}]})
    text = 'Hoje atendi cerca de 20 pessoas com suspeita de dengue'
    first = process_input('writer', text, conversation, '355030')
    # Simula esclarecimento no dia seguinte, mantendo o dia do relato.
    first['artefato']['pendente']['dia'] = '2026-09-12'
    persist_input(first, conversation, 'whatsapp', text)
    second = process_input('writer', 'foram 25 pessoas', conversation, '355030')
    assert second['evento'] is None
    assert 'qual unidade' in second['resposta']
    persist_input(second, conversation, 'whatsapp', 'foram 25 pessoas')
    final = process_input('writer', 'UBS teste', conversation, '355030')
    version = final['payload']['registros'][0]['atual']
    assert int(version['valor']) == 25
    assert version['periodo_inicio'] == '2026-09-12'
    assert version['dimensoes']['doenca'] == 'dengue'


def test_correcao_de_quantidade_nao_contorna_acesso_revogado(flow, monkeypatch):
    svc, conversation = flow
    text = 'Hoje atendi cerca de 20 pessoas com suspeita de dengue'
    first = process_input('writer', text, conversation, '355030')
    persist_input(first, conversation, 'web', text)
    monkeypatch.setattr(svc, 'units', lambda actor: {'itens': []})
    result = process_input('writer', 'foram 25 pessoas', conversation, '355030')
    assert result['evento'] is None
    with svc.store.transaction() as tx:
        assert tx.one('SELECT count(*) total FROM local_registros')['total'] == 0


def test_pendencia_sobrevive_a_consulta_intermediaria(flow):
    svc, conversation = flow
    first = process_input('writer', 'Hoje atendi cerca de 20 pessoas com suspeita de dengue', conversation, '355030')
    persist_input(first, conversation, 'web', 'Hoje atendi cerca de 20 pessoas com suspeita de dengue')
    assert process_input('writer', 'Qual o estoque de dipirona?', conversation, '355030') is None
    db.adicionar_mensagem(conversation, 'telegram', 'Qual o estoque de dipirona?', 'Estoque indisponível.', '/insumos')
    final = process_input('writer', 'foram 25 pessoas', conversation, '355030', channel='whatsapp')
    assert final['evento'] == 'rascunho_local_pronto'
    assert int(final['payload']['registros'][0]['atual']['valor']) == 25


def test_relato_multiplo_separa_itens():
    text = 'Hoje atendemos 8 pessoas com suspeita de dengue e tivemos três encaminhamentos pra dengue'
    items = interpret(text, date(2026, 9, 13))
    assert [(i['indicador'], i['valor']) for i in items] == [
        ('atendimentos_suspeita_dengue', '8'), ('encaminhamentos_dengue', '3')]
    assert all(i['periodo_inicio'] == '2026-09-13' for i in items)
    assert input_kind(text) == 'registro_local'


@pytest.mark.parametrize('channel', ['telegram', 'whatsapp'])
def test_confirmo_no_chat_grava_todos_os_itens(flow, monkeypatch, channel):
    svc, _ = flow
    conversation = db.criar_conversa('reviewer', 'Relato')['id']
    text = 'Hoje atendemos 8 pessoas com suspeita de dengue e tivemos 3 encaminhamentos de dengue'
    draft = process_input('reviewer', text, conversation, '355030', channel=channel, input_type='audio')
    assert len(draft['payload']['registros']) == 2
    assert 'CONFIRMO' in draft['resposta']
    persist_input(draft, conversation, channel, text)
    done = process_input('reviewer', 'Confirmo.', conversation, '355030', channel=channel)
    assert done['evento'] == 'registro_confirmado'
    assert done['artefato']['pendente'] is None
    for record in draft['payload']['registros']:
        assert svc.detail('reviewer', record['id'])['confirmada_vigente'] is not None


def test_registrador_nao_contorna_papel_pelo_chat(flow):
    svc, conversation = flow
    text = 'Hoje atendi 20 pessoas com suspeita de dengue'
    draft = process_input('writer', text, conversation, '355030', channel='whatsapp')
    persist_input(draft, conversation, 'whatsapp', text)
    done = process_input('writer', 'confirmo', conversation, '355030', channel='whatsapp')
    assert done['evento'] is None
    assert 'Não enviado' in done['resposta']
    assert svc.detail('writer', draft['payload']['registros'][0]['id'])['confirmada_vigente'] is None


def test_audio_misto_vai_para_tabelas_operacionais_e_confirma(operational_svc, monkeypatch, tmp_path):
    from api.core import operational_inputs_router
    monkeypatch.setattr(db, '_SQLITE_PATH', tmp_path / 'chat.db')
    monkeypatch.setattr(db, '_clara_remoto', lambda: False)
    db.init_db()
    monkeypatch.setattr(operational_inputs_router, 'service', lambda: operational_svc)
    with operational_svc.store.transaction() as tx:
        tx.execute("INSERT INTO vacinacao_usuario(user_id,nome_vacina,qtd_doses,tipo_movimentacao,id_estabelecimento,data_atualizacao) "
                   "VALUES (?,?,?,?,?,?)", (ACTOR, 'Dengue', 100, 'entrada', ESTABLISHMENT, '2026-09-01'))
    conversation = db.criar_conversa(ACTOR, 'Audio')['id']
    text = ('Claro, hoje eu apliquei 30 doses da vacina da Dengue, também precisa internar 20 pessoas por conta '
            'da Dengue também e tivemos uma entrada de 10 embalagens de pirona.')
    ask = process_input(ACTOR, text, conversation, '355030', channel='whatsapp', input_type='audio')
    assert 'qual unidade' in ask['resposta']
    persist_input(ask, conversation, 'whatsapp', text)
    draft = process_input(ACTOR, '2027275', conversation, '355030', channel='whatsapp')
    assert 'Saída de 30 doses de dengue' in draft['resposta']
    assert '20 internação(ões) por dengue' in draft['resposta']
    assert 'medicamento' in draft['resposta'] and 'CONFIRMO' in draft['resposta']
    persist_input(draft, conversation, 'whatsapp', '2027275')
    done = process_input(ACTOR, 'confirmo', conversation, '355030', channel='whatsapp')
    assert done['evento'] == 'registro_confirmado', done['resposta']
    with operational_svc.store.transaction() as tx:
        assert tx.one("SELECT qtd_doses FROM vacinacao_estabelecimento")['qtd_doses'] == 70
        assert tx.one("SELECT qtd_internacoes FROM internacao_dengue_estabelecimento")['qtd_internacoes'] == 20
