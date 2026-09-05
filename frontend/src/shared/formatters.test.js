import test from 'node:test';
import assert from 'node:assert/strict';
import { numero, inteiro, decimal, moeda, percentual, dias, dataBr } from './formatters.js';

test('ausência ou valor inválido nunca aparece como zero observado', () => {
  for (const missing of [null, undefined, '', ' ', 'inválido', NaN, Infinity, false]) {
    assert.equal(numero(missing), null);
    for (const format of [inteiro, decimal, moeda, percentual, dias]) assert.equal(format(missing), 'Não informado');
  }
  assert.equal(inteiro(0), '0');
  assert.equal(percentual('0'), '0%');
  assert.equal(inteiro(1030), '1.030');
});

test('datas de competência não retrocedem um dia no fuso brasileiro', () => {
  assert.equal(dataBr('2025-12-01'), '01/12/2025');
  assert.equal(dataBr('inválida'), 'Não informada');
});
