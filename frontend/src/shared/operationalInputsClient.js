import { authenticatedFetch } from './auth.js';

const BASE = '/api/clara/inputs-operacionais';

async function request(path, options = {}) {
  const response = await authenticatedFetch(`${BASE}${path}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: options.signal,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload?.detail;
    const message = typeof detail === 'object' ? detail?.mensagem : detail;
    throw new Error(message || 'Não foi possível atualizar os dados operacionais.');
  }
  return payload;
}

const query = values => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => value != null && value !== '' && params.set(key, value));
  return params.toString() ? `?${params}` : '';
};

export const operationalInputsClient = {
  listarEstabelecimentos: ({ busca = '', limite = 100, signal } = {}) =>
    request(`/estabelecimentos${query({ busca, limite })}`, { signal }),
  listarRascunhos: ({ status = 'rascunho', signal } = {}) =>
    request(`/rascunhos${query({ status })}`, { signal }),
  confirmar: (id, versao, chave, payload) => request(`/rascunhos/${encodeURIComponent(id)}/confirmar`, {
    method: 'POST', body: { versao_esperada: versao, chave_idempotencia: chave, ...(payload ? { payload } : {}) },
  }),
  rejeitar: (id, versao, chave, motivo = '') => request(`/rascunhos/${encodeURIComponent(id)}/rejeitar`, {
    method: 'POST', body: { versao_esperada: versao, chave_idempotencia: chave, motivo },
  }),
};
