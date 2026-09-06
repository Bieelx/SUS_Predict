import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Regressão de 06/09/2026: o campo do código limitava a entrada a 6 dígitos, mas o
// Supabase emite o código com o tamanho configurado no projeto (6 a 10 — aqui, 8). O
// campo truncava em silêncio e o backend recusava um código correto como inválido.
const fonte = readFileSync(fileURLToPath(new URL('./Login.jsx', import.meta.url)), 'utf8');

test('o campo do código não fixa 6 dígitos', () => {
  assert.match(fonte, /const CODIGO_MAX = (\d+)/, 'CODIGO_MAX deve existir');
  const [, maximo] = fonte.match(/const CODIGO_MAX = (\d+)/);
  assert.ok(Number(maximo) >= 10, `CODIGO_MAX deve cobrir o limite do Supabase, veio ${maximo}`);

  assert.doesNotMatch(fonte, /maxLength=\{6\}/, 'maxLength fixo em 6 trunca o código');
  assert.doesNotMatch(fonte, /slice\(0,\s*6\)/, 'slice em 6 trunca o código');
});

test('nenhum texto da tela promete um número fixo de dígitos', () => {
  assert.doesNotMatch(fonte, /\b6 d[íi]gitos\b/, 'o tamanho do código vem da configuração do Supabase');
});
