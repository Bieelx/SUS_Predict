import assert from 'node:assert/strict';
import test from 'node:test';

import { isSusbotQuestionPath } from './vite.config.js';

test('reconhece o endpoint antes e depois do rewrite do Vite', () => {
  assert.equal(isSusbotQuestionPath('/backend/api/susbot/perguntar'), true);
  assert.equal(isSusbotQuestionPath('/api/susbot/perguntar'), true);
  assert.equal(isSusbotQuestionPath('/api/susbot/perguntar?stream=1'), true);
});

test('nao injeta a chave em outros endpoints', () => {
  assert.equal(isSusbotQuestionPath('/backend/api/susbot/conversas'), false);
  assert.equal(isSusbotQuestionPath('/api/auth/me'), false);
  assert.equal(isSusbotQuestionPath('/api/susbot/perguntar-outra-coisa'), false);
});
