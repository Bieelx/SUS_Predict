import test from 'node:test';
import assert from 'node:assert/strict';
import { SUSBOT_SSE_EVENTS, chaveIdempotenciaRelato, pareceRelatoLocal } from './susbotContract.js';

test('o evento do rascunho local existe no contrato', () => {
  // O backend emite este nome em /api/susbot/perguntar (susbot_router.py).
  assert.equal(SUSBOT_SSE_EVENTS.rascunho_local_pronto, 'rascunho_local_pronto');
});

test('o evento do rascunho operacional existe no contrato', () => {
  assert.equal(SUSBOT_SSE_EVENTS.rascunho_operacional_pronto, 'rascunho_operacional_pronto');
});

test('chave de idempotência é estável para a mesma mensagem', () => {
  const primeira = chaveIdempotenciaRelato('m-42');
  assert.equal(primeira, chaveIdempotenciaRelato('m-42'), 'reenvio da mesma mensagem não pode gerar outro relato');
  assert.notEqual(primeira, chaveIdempotenciaRelato('m-43'));
});

test('chave respeita os limites de 8 a 120 caracteres exigidos pelo backend', () => {
  for (const semente of ['', null, undefined, 'a', 'x'.repeat(400)]) {
    const chave = chaveIdempotenciaRelato(semente);
    assert.ok(chave.length >= 8, `curta demais para "${semente}": ${chave}`);
    assert.ok(chave.length <= 120, `longa demais: ${chave.length}`);
  }
});

test('caracteres fora do conjunto seguro são descartados', () => {
  assert.equal(chaveIdempotenciaRelato('id com espaço/e#símbolo'), 'web-idcomespaoesmbolo');
  assert.match(chaveIdempotenciaRelato('m-1'), /^web-[A-Za-z0-9_-]+$/);
});

test('relato local em linguagem natural é enviado ao fluxo estruturado', () => {
  assert.equal(pareceRelatoLocal('Clara, hoje apliquei 20 doses da vacina da dengue'), true);
  assert.equal(pareceRelatoLocal('Hoje aplicamos 32 doses contra dengue'), true);
  assert.equal(pareceRelatoLocal('Quantas doses de dengue foram aplicadas?'), false);
});
