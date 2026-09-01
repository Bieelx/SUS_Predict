const entradas = new Map();
const requisicoes = new Map();
const assinantes = new Map();
let geracao = 0;

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
  entradas.clear();
  requisicoes.clear();
  assinantes.forEach((grupo, chave) => grupo.forEach(assinante => assinante(undefined, chave)));
}

export function tamanhoCacheSessao() {
  return entradas.size;
}
