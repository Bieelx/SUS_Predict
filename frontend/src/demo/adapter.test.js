import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptarReplay, briefingDemo, criarRascunhoDemo } from './adapter.js';

const estados = JSON.parse(readFileSync(new URL('./replay.json', import.meta.url)));
const corte = mes => estados.find(item => item.cutoff === mes);

test('o comparativo usa apenas janelas completas e nunca meses futuros', () => {
  const janeiro = adaptarReplay(corte('2024-01'), estados, 'visao-geral', { periodo: 'Mes' });
  assert.equal(janeiro.kpis.casos_notificados, 3973);
  assert.equal(janeiro.kpis.variacao_casos_pct, null);
  assert.deepEqual(janeiro.evolucao.filter(item => item.casos_notificados != null).map(item => item.competencia), ['2024-01']);
  const trimestre = adaptarReplay(corte('2024-06'), estados, 'visao-geral', { periodo: 'Trimestre' });
  assert.equal(trimestre.kpis.casos_notificados, 33354 + 29073 + 9500);
  assert.ok(trimestre.kpis.variacao_casos_pct > 0);
  assert.equal(trimestre.kpis.internacoes_sih, null);
  assert.equal(trimestre.kpis.indice_risco_regional, null);
});

test('estoque fictício não vira aquisição, fornecedor ou score real', () => {
  const dados = adaptarReplay(corte('2024-05'), estados, 'ruptura', { periodo: 'Trimestre' });
  assert.equal(dados.resumo_mensal.length, 3);
  assert.equal(dados.resumo_mensal[0].competencia, '2024-03');
  assert.equal(dados.serie_mensal.length, 0);
  assert.ok(dados.itens_demo[0].quantidade_restante > 0);
  assert.equal(dados.itens_demo[0].quantidade_adquirida, null);
  assert.equal(dados.itens_demo[0].total_fornecedores, null);
  assert.ok(dados.alertas.some(item => item.faixa_risco_aquisicao === 'ALTO'));
  assert.ok(dados.alertas.every(item => item.pontos_risco_aquisicao === null));
});

test('briefing e rascunho mantêm proveniência, corte e premissas', () => {
  const replay = corte('2024-05');
  assert.match(briefingDemo(replay), /sem consulta à IA/);
  const doc = criarRascunhoDemo(replay);
  assert.equal(doc.status, 'rascunho');
  assert.equal(doc.demo, true);
  assert.match(doc.texto, /2024-05/);
  assert.match(doc.texto, /Sem validade para contratação/);
  assert.match(doc.texto, /dengue24_mes.csv/);
  assert.equal(adaptarReplay(replay, estados, 'internacoes'), null);
});
