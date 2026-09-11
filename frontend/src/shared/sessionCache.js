const CACHE_STORAGE_KEY = 'sus_predict_operational_cache_v1';
export const CACHE_TTL_MS = 15 * 60 * 1000;

function armazenamentoDaAba() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function carregarEntradasPersistidas() {
  const armazenamento = armazenamentoDaAba();
  if (!armazenamento) return { entradas: new Map(), expiresAt: 0 };
  try {
    const persistido = JSON.parse(armazenamento.getItem(CACHE_STORAGE_KEY) || 'null');
    if (!persistido || persistido.expiresAt <= Date.now() || !Array.isArray(persistido.entries)) {
      armazenamento.removeItem(CACHE_STORAGE_KEY);
      return { entradas: new Map(), expiresAt: 0 };
    }
    return { entradas: new Map(persistido.entries), expiresAt: persistido.expiresAt };
  } catch {
    armazenamento.removeItem(CACHE_STORAGE_KEY);
    return { entradas: new Map(), expiresAt: 0 };
  }
}

const persistido = carregarEntradasPersistidas();
const entradas = persistido.entradas;
const requisicoes = new Map();
const assinantes = new Map();
let geracao = 0;
let expiracao = persistido.expiresAt;
let timerExpiracao;

function apagarPersistencia() {
  armazenamentoDaAba()?.removeItem(CACHE_STORAGE_KEY);
}

function agendarExpiracao() {
  clearTimeout(timerExpiracao);
  if (!expiracao) return;
  timerExpiracao = setTimeout(() => limparCacheSessao(), Math.max(0, expiracao - Date.now()));
  timerExpiracao?.unref?.();
}

function persistirEntradas() {
  expiracao = Date.now() + CACHE_TTL_MS;
  agendarExpiracao();
  const armazenamento = armazenamentoDaAba();
  if (!armazenamento) return;
  if (!entradas.size) {
    apagarPersistencia();
    return;
  }
  try {
    armazenamento.setItem(CACHE_STORAGE_KEY, JSON.stringify({ expiresAt: expiracao, entries: [...entradas] }));
  } catch {
    // Quota ou modo privado: o cache em memória continua funcionando.
  }
}

if (entradas.size) agendarExpiracao();

function avisar(chave) {
  assinantes.get(chave)?.forEach(assinante => assinante(entradas.get(chave)));
}

export function lerCacheSessao(chave) {
  return entradas.get(chave);
}

export function assinarCacheSessao(chave, assinante) {
  const grupo = assinantes.get(chave) || new Set();
  grupo.add(assinante);
  assinantes.set(chave, grupo);
  return () => {
    grupo.delete(assinante);
    if (!grupo.size) assinantes.delete(chave);
  };
}

export async function obterComCacheSessao(chave, carregar, { forcar = false } = {}) {
  if (!forcar && entradas.has(chave)) return entradas.get(chave);
  if (requisicoes.has(chave)) return requisicoes.get(chave);

  const geracaoDaRequisicao = geracao;
  const requisicao = Promise.resolve()
    .then(carregar)
    .then(valor => {
      if (geracaoDaRequisicao === geracao) {
        entradas.set(chave, valor);
        persistirEntradas();
        avisar(chave);
      }
      return valor;
    })
    .finally(() => {
      if (requisicoes.get(chave) === requisicao) requisicoes.delete(chave);
    });

  requisicoes.set(chave, requisicao);
  return requisicao;
}

export function limparCacheSessao() {
  geracao += 1;
  expiracao = 0;
  clearTimeout(timerExpiracao);
  entradas.clear();
  requisicoes.clear();
  apagarPersistencia();
  assinantes.forEach((grupo, chave) => grupo.forEach(assinante => assinante(undefined, chave)));
}

export function tamanhoCacheSessao() {
  return entradas.size;
}
