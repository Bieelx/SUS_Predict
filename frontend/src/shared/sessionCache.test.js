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
