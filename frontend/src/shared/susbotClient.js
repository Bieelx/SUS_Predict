import { SUSBOT_ENDPOINTS, SUSBOT_SSE_EVENTS, SUSBOT_TIMEOUT_MS } from './susbotContract.js';

function resolverUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return path;
  if (/^https?:\/\//i.test(baseUrl)) return new URL(path, baseUrl).toString();

  const base = baseUrl.replace(/\/$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

function normalizarTexto(valor) {
  return String(valor ?? '').trim();
}

function mergeAbortSignals(controller, signal) {
  if (!signal) return () => {};
  if (signal.aborted) {
    controller.abort(signal.reason);
    return () => {};
  }

  const onAbort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', onAbort, { once: true });
  return () => signal.removeEventListener('abort', onAbort);
}

function criarErroHttp(response, texto = '') {
  const detalhe = texto ? `: ${texto}` : '';
  return new Error(`Falha ao consultar SusBot (${response.status} ${response.statusText})${detalhe}`);
}

async function lerJson(response) {
  if (!response.ok) {
    const texto = await response.text().catch(() => '');
    throw criarErroHttp(response, texto);
  }

  return response.json();
}

export async function listarConversasSusbot({
  baseUrl = '',
  fetchImpl = globalThis.fetch,
  page = 1,
  pageSize = 20,
  signal,
  headers = {},
} = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch indisponivel para consultar historico do SusBot');
  }

  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  const response = await fetchFn(resolverUrl(baseUrl, `${SUSBOT_ENDPOINTS.conversas}?${params.toString()}`), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal,
  });

  return lerJson(response);
}

export async function listarMensagensSusbot({
  conversaId,
  baseUrl = '',
  fetchImpl = globalThis.fetch,
  page = 1,
  pageSize = 30,
  signal,
  headers = {},
} = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch indisponivel para consultar mensagens do SusBot');
  }

  if (!conversaId) {
    throw new Error('conversaId ausente');
  }

  const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  const response = await fetchFn(resolverUrl(baseUrl, `${SUSBOT_ENDPOINTS.mensagens(conversaId)}?${params.toString()}`), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal,
  });

  return lerJson(response);
}

export function parsearBlocoSseSusbot(bloco) {
  const linhas = String(bloco ?? '')
    .replace(/\r/g, '')
    .split('\n');

  let evento = 'message';
  const dados = [];

  for (const linha of linhas) {
    if (!linha) continue;
    if (linha.startsWith(':')) continue;

    const separador = linha.indexOf(':');
    const campo = separador === -1 ? linha : linha.slice(0, separador);
    const valor = separador === -1 ? '' : linha.slice(separador + 1).replace(/^ /, '');

    if (campo === 'event') {
      evento = valor || 'message';
    } else if (campo === 'data') {
      dados.push(valor);
    }
  }

  if (!dados.length && evento === 'message') return null;

  const texto = dados.join('\n');
  let data = texto;

  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch {
      data = texto;
    }
  } else {
    data = {};
  }

  return { event: evento, data };
}

export async function lerEventosSseSusbot(response, handlers = {}) {
  if (!response.ok) {
    const texto = await response.text().catch(() => '');
    throw criarErroHttp(response, texto);
  }

  if (!response.body) {
    throw new Error('Resposta SSE sem corpo para leitura');
  }

  const leitor = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  const eventos = [];
  let buffer = '';
  let respostaFinal = '';
  let referenciaRota = null;
  let referenciaLabel = null;
  let conversaId = response.headers.get('x-conversa-id') || null;

  const registrarEvento = evento => {
    if (!evento) return;
    eventos.push(evento);
    handlers.onEvento?.(evento);

    if (evento.event === SUSBOT_SSE_EVENTS.status) {
      handlers.onStatus?.(evento.data);
      if (evento.data && typeof evento.data === 'object' && evento.data.conversa_id) {
        conversaId = String(evento.data.conversa_id);
      }
      return;
    }

    if (evento.event === SUSBOT_SSE_EVENTS.token) {
      const token = normalizarTexto(evento.data?.texto ?? evento.data);
      if (token) {
        respostaFinal += token;
        handlers.onToken?.(token, evento.data);
      }
      return;
    }

    if (evento.event === SUSBOT_SSE_EVENTS.referencia) {
      referenciaRota = evento.data?.rota ?? evento.data?.referencia_rota ?? null;
      referenciaLabel = evento.data?.label ?? referenciaLabel;
      handlers.onReferencia?.(referenciaRota, evento.data);
      return;
    }

    if (evento.event === SUSBOT_SSE_EVENTS.fim) {
      if (evento.data && typeof evento.data === 'object') {
        respostaFinal = normalizarTexto(evento.data.resposta) || respostaFinal;
        referenciaRota = evento.data.referencia_rota ?? referenciaRota;
        referenciaLabel = evento.data.label ?? referenciaLabel;
        if (evento.data.conversa_id) conversaId = String(evento.data.conversa_id);
      }
      handlers.onFim?.(evento.data);
    }
  };

  try {
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let separador = buffer.indexOf('\n\n');
      while (separador !== -1) {
        const bloco = buffer.slice(0, separador).trim();
        buffer = buffer.slice(separador + 2);
        if (bloco) registrarEvento(parsearBlocoSseSusbot(bloco));
        separador = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, '\n');
    const restante = buffer.trim();
    if (restante) {
      const blocos = restante.split(/\n\n+/);
      for (const bloco of blocos) {
        const evento = parsearBlocoSseSusbot(bloco.trim());
        if (evento) registrarEvento(evento);
      }
    }
  } finally {
    leitor.releaseLock?.();
  }

  return {
    conversaId,
    resposta: respostaFinal,
    referenciaRota,
    referenciaLabel,
    eventos,
    status: eventos.find(evento => evento.event === SUSBOT_SSE_EVENTS.status)?.data ?? null,
  };
}

export async function conversarComSusbot({
  pergunta,
  telaAtual,
  tela_atual,
  tela_origem,
  conversaId,
  conversa_id,
  ibge6,
  ibge,
  baseUrl = '',
  fetchImpl = globalThis.fetch,
  timeoutMs = SUSBOT_TIMEOUT_MS,
  signal,
  headers = {},
  onStatus,
  onToken,
  onReferencia,
  onFim,
  onEvento,
} = {}) {
  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new Error('fetch indisponivel para conversar com SusBot');
  }

  const perguntaNormalizada = normalizarTexto(pergunta);
  if (!perguntaNormalizada) {
    throw new Error('pergunta ausente');
  }

  const telaNormalizada = normalizarTexto(tela_origem || tela_atual || telaAtual || '');
  const ibge6Normalizado = normalizarTexto(ibge6 || ibge || '');

  if (!ibge6Normalizado) {
    throw new Error('ibge6 ausente');
  }

  const controller = new AbortController();
  const limparSignalExterno = mergeAbortSignals(controller, signal);
  const timer = timeoutMs
    ? setTimeout(() => controller.abort(new Error('Tempo limite excedido')), timeoutMs)
    : null;

  try {
    const response = await fetchFn(resolverUrl(baseUrl, SUSBOT_ENDPOINTS.perguntar), {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        pergunta: perguntaNormalizada,
        conversa_id: conversaId || conversa_id || undefined,
        ibge6: ibge6Normalizado,
        ibge: ibge6Normalizado,
        tela_origem: telaNormalizada,
        tela_atual: telaNormalizada,
      }),
      signal: controller.signal,
    });

    return await lerEventosSseSusbot(response, {
      onStatus,
      onToken,
      onReferencia,
      onFim,
      onEvento,
    });
  } finally {
    limparSignalExterno();
    if (timer) clearTimeout(timer);
  }
}

export function criarClienteSusbot(opcoes = {}) {
  return {
    conversar: payload => conversarComSusbot({ ...opcoes, ...payload }),
  };
}

export default criarClienteSusbot;
