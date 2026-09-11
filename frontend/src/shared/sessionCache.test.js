import assert from 'node:assert/strict';
import test from 'node:test';

import { limparCacheSessao, obterComCacheSessao, tamanhoCacheSessao } from './sessionCache.js';

test('reutiliza o valor e deduplica carregamentos simultaneos', async () => {
  limparCacheSessao();
  let chamadas = 0;
  const carregar = async () => ({ chamada: ++chamadas });
  const [primeiro, segundo] = await Promise.all([
    obterComCacheSessao('painel', carregar),
    obterComCacheSessao('painel', carregar),
  ]);

  assert.deepEqual(primeiro, { chamada: 1 });
  assert.equal(segundo, primeiro);
  assert.equal(chamadas, 1);
  assert.equal(await obterComCacheSessao('painel', carregar), primeiro);
});

test('remove todos os dados ao encerrar a sessao', async () => {
  limparCacheSessao();
  await obterComCacheSessao('usuario-a', async () => ({ sigiloso: true }));
  assert.equal(tamanhoCacheSessao(), 1);
  limparCacheSessao();
  assert.equal(tamanhoCacheSessao(), 0);
});

test('resposta antiga nao repovoa o cache depois do logout', async () => {
  limparCacheSessao();
  let concluir;
  const pendente = obterComCacheSessao('lenta', () => new Promise(resolve => { concluir = resolve; }));
  await Promise.resolve();
  limparCacheSessao();
  concluir({ dado: 'antigo' });
  await pendente;
  assert.equal(tamanhoCacheSessao(), 0);
});

test('persiste o cache temporariamente na aba para sobreviver a recarga', async () => {
  const dados = new Map();
  globalThis.sessionStorage = {
    getItem: chave => dados.get(chave) || null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: chave => dados.delete(chave),
  };

  const moduloA = await import(`./sessionCache.js?persistencia-a=${Date.now()}`);
  await moduloA.obterComCacheSessao('painel', async () => ({ atualizado: true }));
  const moduloB = await import(`./sessionCache.js?persistencia-b=${Date.now()}`);

  assert.deepEqual(moduloB.lerCacheSessao('painel'), { atualizado: true });
  moduloB.limparCacheSessao();
  delete globalThis.sessionStorage;
});

test('descarta dados persistidos que passaram do tempo limite', async () => {
  const dados = new Map([
    ['sus_predict_operational_cache_v1', JSON.stringify({
      expiresAt: Date.now() - 1,
      entries: [['painel', { antigo: true }]],
    })],
  ]);
  globalThis.sessionStorage = {
    getItem: chave => dados.get(chave) || null,
    setItem: (chave, valor) => dados.set(chave, valor),
    removeItem: chave => dados.delete(chave),
  };

  const modulo = await import(`./sessionCache.js?expirado=${Date.now()}`);
  assert.equal(modulo.lerCacheSessao('painel'), undefined);
  assert.equal(dados.size, 0);
  delete globalThis.sessionStorage;
});
