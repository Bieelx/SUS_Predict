"""Recuperação de contexto da conversa atual, compartilhada pelos três canais."""
import re
import json
from api.core import db, conversation_hub as hub
from api.core.susbot_intents import normalizar_texto


def carregar_historico(usuario, conversa_id, pergunta=''):
    hub.verificar_dono(conversa_id, usuario)
    messages = []
    page = 1
    while True:
        batch = db.listar_mensagens(conversa_id, page=page, page_size=100)
        messages.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    evidence = hub.listar_evidencias(conversa_id, usuario) if messages else {}
    words = set(re.findall(r'\b\w{4,}\b', normalizar_texto(pergunta))) - {'sobre', 'quero', 'qual', 'como', 'para', 'esse', 'isso', 'mais'}
    recent = messages[:16]
    older = messages[16:]
    ranked = sorted(enumerate(older), key=lambda pair: (-len(words & set(re.findall(r'\b\w{4,}\b', normalizar_texto(pair[1]['pergunta'])))), pair[0]))
    selected = {m['id'] for m in recent + older[-2:] + [m for _, m in ranked[:6]]}
    history = []
    # Limita o prompt, não apaga histórico. Toda mensagem antiga segue recuperável.
    for message in reversed(messages):
        if message['id'] not in selected:
            continue
        artifact = evidence.get(message['id'], {})
        answer = re.sub(r'\bdev-[A-Za-z0-9_-]+\b', '[identificador interno ocultado]', str(message.get('resposta') or ''))
        history.append({'pergunta': str(message.get('pergunta') or '')[:500], 'resposta': answer[:1000],
                        'plano_consulta': artifact.get('_continuidade'),
                        'origem': message.get('tela_origem'), 'data': message.get('criado_em')})
        if message in recent[:4] and artifact.get('tipo') in {'tabela', 'resumo', 'etp'}:
            history[-1]['evidencia_anterior'] = json.dumps({k: v for k, v in artifact.items() if k != '_continuidade'}, ensure_ascii=False)[:3500]
            history[-1]['nota_evidencia'] = 'Recorte da evidência histórica; pode estar truncado. Reconsulte para novos valores.'
    return history


def evidencia_com_contexto(artefato, fim):
    result = dict(artefato or {'tipo': 'contexto_conversa'})
    plan = (fim or {}).get('plano') or {}
    if plan.get('acao') == 'ferramenta' and plan.get('ferramenta') in {
        'consultar_estoque', 'consultar_epidemiologia', 'consultar_alertas', 'consultar_aquisicoes',
    }:
        result['_continuidade'] = {'acao': 'ferramenta', 'ferramenta': plan['ferramenta'],
                                   'argumentos': plan.get('argumentos') or {},
                                   'referencia_rota': (fim or {}).get('referencia_rota')}
    return result
