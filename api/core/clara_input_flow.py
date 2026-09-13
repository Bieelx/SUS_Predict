"""Entrada conversacional comum à web, Telegram e WhatsApp, sem confirmação automática."""
from datetime import datetime, date
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
    if re.search(r'\b(apliquei|aplicamos|atendi|atendemos|encaminhei|encaminhamos|foram aplicad[ao]s?|foram atendid[ao]s?|foram encaminhad[ao]s?)\b', text):
        return 'registro_local'
    if re.search(r'\b(entrada|saida|recebi|recebemos|chegaram|retirei|retiramos|utilizei|utilizamos)\b', text) and re.search(r'\b(doses?|vacinas?|medicamentos?|embalagens?|estoque)\b', text):
        return 'input_operacional'
    if re.search(r'\bleitos?\b', text) and re.search(r'\b(ocupad|disponiv)', text):
        return 'input_operacional'
    return None


def _pending(conversation, actor):
    messages = db.listar_mensagens(conversation, page_size=1)
    if not messages:
        return None
    artifact = hub.listar_evidencias(conversation, actor).get(messages[0]['id'], {})
    return artifact.get('pendente') if artifact.get('tipo') == 'entrada_clara' else None


def _result(text, pending=None, event=None, payload=None, route=None):
    artifact = {'tipo': 'entrada_clara', 'pendente': pending, 'evento': event, 'rascunho': payload}
    return {'resposta': text, 'referencia_rota': route, 'artefato': artifact,
            'evento': event, 'payload': payload}



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

def process_input(actor, text, conversation, city, channel='web', context=None,
                  local=None, operational=None, event_id=None, input_type='texto'):
    """Retorna None para consulta; só seleciona IDs presentes no acesso atual."""
    hub.verificar_dono(conversation, actor)
    context = context or {}
    pending = _pending(conversation, actor)
    kind = input_kind(text)
    if pending and fold(text).strip() in {'cancelar', 'deixa pra la', 'deixe para la'}:
        return _result('Tudo bem. Interrompi este relato; nenhum registro foi confirmado.')
    if not kind and ('?' in text or re.search(r'\b(como|quanto|quantos|quantas|qual|quais|posso|devo|amanha|vou|vamos|me mostre|consulte)\b', fold(text))):
        return None
    explicit_kind = 'registro_local' if local else 'input_operacional' if operational else None
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
    selection = text.strip() if continuing and state.get('etapa') != 'quantidade' else ''
    if continuing and state.get('etapa') == 'quantidade':
        quantity = _exact_quantity(text)
        if quantity is None:
            return _result('Qual foi a quantidade exata? Pode responder, por exemplo, “foram 25 doses”. Se ainda não souber, escreva cancelar; não vou registrar uma estimativa.', state)
        parts = state['quantidade_aproximada']
        state['texto'] = parts['antes'] + quantity + parts['depois']
        state['esclarecimento'] = text
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
            from api.core.operational_inputs_interpreter import interpret_operational_input
            svc = service()
            interpret_operational_input(state['texto'])
            target = operational.id_estabelecimento if operational and not continuing else None
            if not target and not continuing and isinstance(context.get('estabelecimento'), dict):
                target = context['estabelecimento'].get('id')
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
            response = report_summary(draft)
            route = '/registros-unidade/' + str(draft['registros'][0]['id']) if len(draft['registros']) == 1 else '/registros-unidade'
            route += '?unidade=' + target + '&aba=pendentes'
            event = 'rascunho_local_pronto'
        else:
            from api.core.operational_inputs_interpreter import operational_summary
            draft = svc.create_draft(actor, target, state['texto'], key)
            response = operational_summary(draft) + ' Preparei um rascunho. Revise e confirme em Registros da unidade; nenhum saldo ou leito foi alterado.'
            route, event = '/registros-unidade', 'rascunho_operacional_pronto'
        return _result(response, event=event, payload=jsonable_encoder(draft), route=route)
    except HTTPException as exc:
        detail = exc.detail
        message = detail.get('mensagem', 'Não consegui preparar o registro.') if isinstance(detail, dict) else str(detail)
        if exc.status_code == 422:
            message += '\nEnvie novamente o relato completo com os dados corrigidos. Nenhum registro foi confirmado.'
        return _result(message)


def persist_input(result, conversation, channel, text):
    message = db.adicionar_mensagem(conversation, channel, text, result['resposta'], result['referencia_rota'])
    hub.salvar_evidencia(conversation, message['id'], result['artefato'])
