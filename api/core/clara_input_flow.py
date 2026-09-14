"""Entrada conversacional comum à web, Telegram e WhatsApp; só grava após CONFIRMO explícito."""
from datetime import datetime, date, timedelta, timezone
from hashlib import sha256
from uuid import uuid4
from zoneinfo import ZoneInfo
import re

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from api.core import db, conversation_hub as hub
from api.core.local_records_interpreter import fold, interpret, report_summary, NUMBER, NUMBERS


def input_kind(text):
    text = fold(str(text or ''))
    # Perguntar sobre uma ação não declara que ela aconteceu.
    if '?' in text or re.search(r'\b(como|quanto|quantos|quantas|posso|devo|deveria|preciso|vou|vamos|amanha|se eu|se nos)\b', text):
        return None
    # Aplicação de doses e internações vão para as tabelas operacionais do time de dados.
    if re.search(r'\b(apliquei|aplicamos|aplicou|aplicaram|foram aplicad[ao]s?)\b', text) and re.search(r'\bdoses?\b', text):
        return 'input_operacional'
    if re.search(r'\b(internamos|internei|internaram|internar|foram internad[ao]s?|internac(ao|oes))\b', text):
        return 'input_operacional'
    if re.search(r'\b(atendi|atendemos|encaminhei|encaminhamos|foram atendid[ao]s?|foram encaminhad[ao]s?)\b', text):
        return 'registro_local'
    if re.search(r'\b(tivemos|tive|teve|houve|registramos)\s+' + NUMBER + r'\s+(encaminhamentos?|atendimentos?)\b', text):
        return 'registro_local'
    if re.search(r'\b(entrada|saida|recebi|recebemos|chegaram|retirei|retiramos|utilizei|utilizamos)\b', text) and re.search(r'\b(doses?|vacinas?|medicamentos?|embalagens?|estoque)\b', text):
        return 'input_operacional'
    if re.search(r'\bleitos?\b', text) and re.search(r'\b(ocupad|disponiv)', text):
        return 'input_operacional'
    return None


def _pending(conversation, actor):
    evidence = hub.listar_evidencias(conversation, actor)
    page = 1
    while True:
        messages = db.listar_mensagens(conversation, page=page, page_size=100)
        for message in messages:
            artifact = evidence.get(message['id'], {})
            if artifact.get('tipo') == 'entrada_clara':
                pending = artifact.get('pendente')
                if pending and not pending.get('criado_em'):
                    pending = {**pending, 'criado_em': message.get('criado_em')}
                return pending
        if len(messages) < 100:
            return None
        page += 1


def _result(text, pending=None, event=None, payload=None, route=None):
    artifact = {'tipo': 'entrada_clara', 'pendente': pending, 'evento': event, 'rascunho': payload}
    return {'resposta': text, 'referencia_rota': route, 'artefato': artifact,
            'evento': event, 'payload': payload}



CONFIRM_WORDS = {'confirmo', 'confirmar', 'confirma', 'confirmado', 'sim confirmo', 'sim, confirmo'}
CANCEL_WORDS = {'cancelar', 'cancela', 'cancelo', 'descartar', 'deixa pra la', 'deixe para la'}
CONFIRM_FOOTER = 'Está correto? Responda CONFIRMO para enviar ou CANCELAR para descartar.'
INPUT_CONFIRMATION_TTL = timedelta(hours=24)


def _now():
    return datetime.now(timezone.utc)


def _confirmation_expired(pending):
    try:
        created = datetime.fromisoformat(str(pending['criado_em']).replace('Z', '+00:00'))
        if created.tzinfo is None:
            created = created.replace(tzinfo=timezone.utc)
    except (KeyError, TypeError, ValueError):
        return True
    return _now() > created + INPUT_CONFIRMATION_TTL


def _services(kind):
    if kind == 'registro_local':
        from api.core.local_records_router import service
    else:
        from api.core.operational_inputs_router import service
    return service()


def _error(exc):
    detail = exc.detail
    return detail.get('mensagem', 'operação recusada') if isinstance(detail, dict) else str(detail)


def _confirm(actor, pending):
    """Confirma cada rascunho pelo mesmo caso de uso da tela: papel, versão e duplicidade valem aqui."""
    from api.core.local_records_models import AcaoRequest
    svc = _services(pending['tipo'])
    sent, blocked = [], []
    for item in pending['itens']:
        key = 'clara-confirma-' + sha256(f"{actor}|{item['id']}|{item['versao']}".encode()).hexdigest()
        try:
            if pending['tipo'] == 'registro_local':
                svc.mutate(actor, item['id'], 'confirmar', AcaoRequest(versao_esperada=item['versao'], chave_idempotencia=key))
            else:
                svc.confirm(actor, item['id'], item['versao'], key)
            sent.append(item['rotulo'])
        except HTTPException as exc:
            blocked.append(f"{item['rotulo']} — {_error(exc)}")
    lines = []
    if sent:
        lines += ['Enviado ✅'] + ['• ' + label for label in sent]
    if blocked:
        lines += ['Não enviado (continua como rascunho em Registros da unidade):'] + ['• ' + label for label in blocked]
    event = 'registro_confirmado' if sent else None
    return _result('\n'.join(lines), event=event, route='/registros-unidade' if blocked else None)


def _discard(actor, pending):
    from api.core.local_records_models import AcaoRequest
    svc = _services(pending['tipo'])
    kept = 0
    for item in pending['itens']:
        key = 'clara-descarta-' + sha256(f"{actor}|{item['id']}|{item['versao']}".encode()).hexdigest()
        try:
            if pending['tipo'] == 'registro_local':
                svc.mutate(actor, item['id'], 'rejeitar', AcaoRequest(versao_esperada=item['versao'], chave_idempotencia=key))
            else:
                svc.reject(actor, item['id'], item['versao'], key)
        except HTTPException:
            kept += 1
    text = 'Tudo bem, nada foi enviado.'
    if kept:
        text += ' Seu papel não permite descartar; o rascunho fica sem efeito até alguém revisar em Registros da unidade.'
    return _result(text)


def ignored_parts(text, found):
    """Avisa sobre trechos que parecem relato mas não viraram item, em vez de sumir com eles."""
    source = fold(text)
    notes = []
    if re.search(r"\b(embalagens?|medicamentos?|comprimidos?|frascos?|ampolas?)\b", source) and 'medicamento' not in found:
        notes.append('medicamento — envie separado no formato: “Entrada de 10 embalagens de dipirona; concentração 500 mg; '
                     'forma comprimido; embalagem caixa; 20 unidades por embalagem”')
    if re.search(r"\bdoses?\b", source) and 'vacinacao' not in found:
        notes.append('vacina — informe quantidade e vacina, ex.: “aplicamos 30 doses da vacina da dengue”')
    if re.search(r"\bleitos?\b", source) and 'internacao' not in found:
        notes.append('leitos — ex.: “UTI: 19 leitos ocupados e 1 disponível”')
    if re.search(r"\bintern", source) and 'internacao_dengue' not in found:
        notes.append('internação — informe a quantidade e que foi por dengue, ex.: “internamos 2 pessoas por dengue”')
    if re.search(r"\bencaminh", source) and 'encaminhamentos_dengue' not in found:
        notes.append('encaminhamento — envie em mensagem separada, ex.: “tivemos 3 encaminhamentos de dengue”')
    if re.search(r"\batend", source) and 'atendimentos_suspeita_dengue' not in found:
        notes.append('atendimento — envie em mensagem separada, ex.: “atendemos 8 pessoas com suspeita de dengue”')
    return notes


def _with_notes(footer, text, found):
    notes = ignored_parts(text, found)
    return ('⚠️ Não registrei nesta mensagem:\n' + '\n'.join('• ' + n for n in notes) + '\n' + footer) if notes else footer


def _approximate_quantity(text, day):
    """Só esclarece uma quantidade aproximada em um único acontecimento válido."""
    source = fold(text)
    pattern = r"\b(?:cerca de|aproximadamente|por volta de|mais ou menos)\s+(" + NUMBER + r")\b"
    matches = list(re.finditer(pattern, source))
    if len(matches) != 1:
        return None
    match = matches[0]
    candidate = source[:match.start()] + match.group(1) + source[match.end():]
    try:
        proposals = interpret(candidate, today=date.fromisoformat(day))
    except HTTPException:
        return None
    if len(proposals) != 1:
        return None
    return {'antes': source[:match.start()], 'depois': source[match.end():]}


def _exact_quantity(text):
    source = fold(text).strip().rstrip('.!')
    match = re.fullmatch(r"(?:(?:na verdade|corrigindo)[,:]?\s+)?(?:(?:foram|foi|sao|eram)\s+)?(?:exatamente\s+)?(" + NUMBER + r")(?:\s+(?:doses?|pessoas?|atendimentos?|encaminhamentos?))?", source)
    if not match or '.' in match.group(1) or ',' in match.group(1):
        return None
    value = match.group(1)
    return str(NUMBERS[value]) if value in NUMBERS else value


def _operational_pending_question(item):
    field = next(iter(item.get('pendencias') or []), '')
    payload = item.get('payload') or {}
    medicine = payload.get('nome_medicamento') or 'medicamento'
    questions = {
        'concentracao': f'Qual a concentração do {medicine}?',
        'forma_farmaceutica': f'Qual a forma farmacêutica do {medicine}?',
        'tipo_embalagem': f'Qual o tipo de embalagem do {medicine}?',
        'quantidade_por_embalagem': 'Quantas unidades há por embalagem?',
        'qtd_embalagens': 'Quantas embalagens foram movimentadas?',
        'tipo_movimentacao': 'Foi entrada ou saída?',
        'qtd_doses': 'Quantas doses foram movimentadas?',
        'nome_vacina': 'Qual foi a vacina?',
        'qtd_leitos_ocupados': 'Quantos leitos estavam ocupados?',
        'qtd_leitos_disponiveis': 'Quantos leitos estavam disponíveis?',
        'tipo_leito': 'Qual o tipo de leito?',
        'qtd_internacoes': 'Quantas internações por dengue ocorreram?',
    }
    return questions.get(field, f'Qual informação falta para {field.replace("_", " ")}?')


def _is_correction_request(text):
    return bool(re.match(r'^\s*corrigir\s*:', fold(str(text or ''))))

def process_input(actor, text, conversation, city, channel='web', context=None,
                  local=None, operational=None, event_id=None, input_type='texto'):
    """Retorna None para consulta; só seleciona IDs presentes no acesso atual."""
    hub.verificar_dono(conversation, actor)
    context = context or {}
    pending = _pending(conversation, actor)
    kind = input_kind(text)
    if _is_correction_request(text):
        from api.core.operational_inputs_router import service
        svc = service()
        key = 'clara-correcao-' + sha256(f"{actor}|{channel}|{event_id or text}".encode()).hexdigest()
        try:
            correction = svc.create_correction_draft(actor, text, key)
        except HTTPException as exc:
            return _result(_error(exc))
        draft = correction['rascunho']
        from api.core.operational_inputs_interpreter import operational_summary
        label = operational_summary(draft)
        response = (
            'Preparei um movimento compensatório; o registro histórico original não foi alterado.\n'
            f"Antes: {correction['antes']} {correction['unidade']}.\n"
            f"Depois: {correction['depois']} {correction['unidade']}.\n"
            f"Movimento compensatório: {label}\n{CONFIRM_FOOTER}"
        )
        confirmation = {
            'etapa': 'confirmacao', 'tipo': 'input_operacional',
            'itens': [{'id': str(draft['id']), 'versao': draft['versao'], 'rotulo': label}],
            'criado_em': _now().isoformat(),
        }
        return _result(response, confirmation, event='rascunho_operacional_pronto',
                       payload=jsonable_encoder(draft), route='/registros-unidade')
    if pending and pending.get('etapa') == 'confirmacao':
        answer = fold(text).strip(' .!')
        if answer in CONFIRM_WORDS:
            if _confirmation_expired(pending):
                return _result(
                    'Esta confirmação expirou após 24 horas. Nenhum registro foi enviado; envie o relato novamente.',
                    route='/registros-unidade',
                )
            return _confirm(actor, pending)
        if answer in CANCEL_WORDS:
            return _discard(actor, pending)
        if not kind:
            return None
        pending = None  # Novo relato substitui a confirmação em aberto.
    if pending and fold(text).strip(' .!').lower() in {'obrigado', 'obrigada', 'ok', 'entendi'}:
        return None
    if pending and fold(text).strip(' .!') in CANCEL_WORDS:
        return _result('Tudo bem. Interrompi este relato; nenhum registro foi confirmado.')
    if not kind and ('?' in text or re.search(r'\b(como|quanto|quantos|quantas|qual|quais|posso|devo|amanha|vou|vamos|me mostre|consulte)\b', fold(text))):
        return None
    if pending and not kind:
        from api.core.susbot_intents import eh_continuacao, rotear_intencao
        if eh_continuacao(text) or rotear_intencao(text) is not None:
            return None
    explicit_kind = 'registro_local' if local else 'input_operacional' if operational else None
    if kind and explicit_kind:
        kind = explicit_kind  # Tela já escolheu o módulo; o texto não o troca.
    continuing = not kind and pending is not None
    kind = kind or explicit_kind
    if not kind and not pending:
        return None
    state = dict(pending) if continuing else {
        'tipo': kind, 'texto': text, 'dia': datetime.now(ZoneInfo('America/Sao_Paulo')).date().isoformat(),
        'chave': event_id or str(uuid4()), 'canal': channel, 'tipo_entrada': input_type,
    }
    kind = state['tipo']
    if len(state['texto']) > (8000 if kind == 'registro_local' else 4000):
        return _result('O relato está muito longo. Envie um acontecimento por mensagem, com unidade, data e quantidade.')
    selection = text.strip() if continuing and state.get('etapa') not in {'quantidade', 'campos_operacionais'} else ''
    if continuing and state.get('etapa') == 'quantidade':
        quantity = _exact_quantity(text)
        if quantity is None:
            return _result('Qual foi a quantidade exata? Pode responder, por exemplo, “foram 25 doses”. Se ainda não souber, escreva cancelar; não vou registrar uma estimativa.', state)
        parts = state['quantidade_aproximada']
        state['texto'] = parts['antes'] + quantity + parts['depois']
        state['esclarecimento'] = text
        state['etapa'] = 'unidade'
    if continuing and state.get('etapa') == 'campos_operacionais':
        state.setdefault('texto_original', state['texto'])
        state.setdefault('esclarecimentos_operacionais', []).append(text)
        state['texto'] = state['texto_original'] + ''.join(
            '\nEsclarecimento posterior: ' + answer for answer in state['esclarecimentos_operacionais']
        )
        state['etapa'] = 'unidade'
    if not continuing and local:
        state['unidade_sugerida'] = str(local.unidade_id)
    elif not continuing and isinstance(context.get('unidade'), dict):
        state['unidade_sugerida'] = context['unidade'].get('id')
    try:
        if kind == 'registro_local':
            from api.core.local_records_router import service
            svc = service()
            units = [u for u in svc.units(actor)['itens'] if str(u['ibge6']) == str(city)]
            approximate = _approximate_quantity(state['texto'], state['dia'])
            if approximate:
                state.update(etapa='quantidade', quantidade_aproximada=approximate,
                             texto_original=state['texto'])
                return _result('Entendi o relato. Para preparar o registro, preciso da quantidade exata, pois “cerca de” indica uma estimativa. Quantas foram? Pode responder “foram 25 doses”.', state)
            proposals = interpret(state['texto'], today=date.fromisoformat(state['dia']))
            target = state.get('unidade_sugerida') if not selection else None
            if not target and not continuing and isinstance(context.get('unidade'), dict):
                target = context['unidade'].get('id')
            choices = units
        else:
            from api.core.operational_inputs_router import service
            from api.core.operational_inputs_interpreter import interpret_operational_items
            from api.core.gemini_input_interpreter import interpretar_com_gemini
            svc = service()
            target = state.get('estabelecimento_sugerido')
            if not target and operational and not continuing:
                target = operational.id_estabelecimento
            if not target and not continuing and isinstance(context.get('estabelecimento'), dict):
                target = context['estabelecimento'].get('id')
            if target:
                state['estabelecimento_sugerido'] = str(target)
            parsed_items = interpret_operational_items(state['texto'])
            if not parsed_items:
                gemini_items = interpretar_com_gemini(state['texto'])
                if gemini_items:
                    incomplete = [item for item in gemini_items if item['tipo'] == 'incompleto']
                    if incomplete:
                        state.update(etapa='campos_operacionais', texto_original=state.get('texto_original', state['texto']),
                                     pendencias_operacionais=incomplete)
                        return _result(_operational_pending_question(incomplete[0]), state)
                    parsed_items = [item for item in gemini_items if item['tipo'] != 'nao_reconhecido']
            if target:
                with svc.store.transaction() as tx:
                    choices = [svc._establishment(tx, actor, target)]
            else:
                choices = svc.establishments(actor, selection, 100)['itens']
            choices = [u for u in choices if str(u['municipio_ibge6']) == str(city)]
        if target:
            choices = [u for u in choices if str(u['id']) == str(target)]
            if not choices:
                return _result('A unidade escolhida não está disponível no seu acesso e município atuais. Abra Registros da unidade e selecione uma unidade autorizada.')
        elif selection:
            exact = [u for u in choices if fold(selection) in {fold(str(u.get('nome') or u.get('no_fantasia') or '')), str(u.get('cnes') or ''), str(u['id'])}]
            matches = exact or [u for u in choices if fold(selection) in fold(u.get('nome') or u.get('no_fantasia') or '')]
            if not matches:
                return _result('Não encontrei essa unidade no seu acesso. Envie o nome completo ou o CNES, ou escreva cancelar.', state)
            choices = matches
        # A lista de estabelecimentos pode estar limitada: não inferir escolha sem nome.
        if len(choices) != 1 or (kind == 'input_operacional' and not target and not selection):
            if not choices:
                return _result('Identifiquei um relato, mas não encontrei uma unidade autorizada neste município. Confira seu vínculo em Registros da unidade.')
            labels = [f"• {u.get('nome') or u.get('no_fantasia')}{' · CNES ' + str(u['cnes']) if u.get('cnes') else ''}" for u in choices[:6]]
            return _result('Entendi que você quer registrar uma informação. Em qual unidade aconteceu? Envie o nome ou CNES.\n' + '\n'.join(labels), state)
        target = str(choices[0]['id'])
        key = 'clara-' + sha256(f"{actor}|{state['canal']}|{state['chave']}".encode()).hexdigest()
        if kind == 'registro_local':
            audit_text = (state['texto_original'] + '\nEsclarecimento posterior: ' + state['esclarecimento']
                          if state.get('esclarecimento') else state['texto'])
            draft = svc.create_report(actor, target, audit_text, key, proposals, conversation,
                                      channel=state['canal'], input_type=state['tipo_entrada'])
            ready = [r for r in draft['registros'] if not r['atual']['pendencias'] and r['atual']['status'] == 'rascunho']
            footer = CONFIRM_FOOTER if ready else 'Faltam dados para enviar. Envie o relato completo novamente ou complete em Registros da unidade.'
            if ready and len(ready) < len(draft['registros']):
                footer = 'Os itens com “Complete” precisam ser completados em Registros da unidade. ' + footer.replace('enviar', 'enviar os demais', 1)
            response = report_summary(draft, _with_notes(footer, state['texto'], {p['indicador'] for p in proposals}))
            items = [{'id': str(r['id']), 'versao': r['atual']['numero_versao'],
                      'rotulo': f"{r['indicador_nome']}: {r['atual']['valor']}"} for r in ready]
            route = '/registros-unidade/' + str(draft['registros'][0]['id']) if len(draft['registros']) == 1 else '/registros-unidade'
            route += '?unidade=' + target + '&aba=pendentes'
            event = 'rascunho_local_pronto'
        else:
            from api.core.operational_inputs_interpreter import operational_summary
            # Sem padrão conhecido, mantém o caminho único (parser rígido + Gemini).
            drafts = ([svc.create_draft(actor, target, state['texto'], f'{key}-{i}', item) for i, item in enumerate(parsed_items)]
                      if parsed_items else [svc.create_draft(actor, target, state['texto'], key)])
            draft = drafts[0]
            lines = ['Preparei os rascunhos abaixo; nenhum saldo, estoque ou leito foi alterado ainda.']
            lines += [f"{i}. {operational_summary(d)}" for i, d in enumerate(drafts, 1)]
            lines.append(_with_notes(CONFIRM_FOOTER, state['texto'], {d['tipo'] for d in drafts}))
            response = '\n'.join(lines)
            items = [{'id': str(d['id']), 'versao': d['versao'], 'rotulo': operational_summary(d)}
                     for d in drafts if d['status'] == 'rascunho']
            route, event = '/registros-unidade', 'rascunho_operacional_pronto'
        confirmation = {
            'etapa': 'confirmacao', 'tipo': kind, 'itens': items, 'criado_em': _now().isoformat(),
        } if items else None
        return _result(response, confirmation, event=event, payload=jsonable_encoder(draft), route=route)
    except HTTPException as exc:
        detail = exc.detail
        message = detail.get('mensagem', 'Não consegui preparar o registro.') if isinstance(detail, dict) else str(detail)
        if exc.status_code == 422:
            message += '\nEnvie novamente o relato completo com os dados corrigidos. Nenhum registro foi confirmado.'
        return _result(message)


def persist_input(result, conversation, channel, text):
    message = db.adicionar_mensagem(conversation, channel, text, result['resposta'], result['referencia_rota'])
    hub.salvar_evidencia(conversation, message['id'], result['artefato'])
