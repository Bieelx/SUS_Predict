import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizarMetricasClara, percentualMetrica } from './claraMetricas.js';

test('normaliza ausências como zero e ordena as intenções', () => {
  const metricas = normalizarMetricasClara({
    respostas_total: 12,
    taxa_respostas_sem_llm: 0.5,
    por_intencao: { estoque: 2, alertas: 5 },
  });
  assert.equal(metricas.total, 12);
  assert.equal(metricas.fallbacks, 0);
  assert.deepEqual(metricas.porIntencao, [['alertas', 5], ['estoque', 2]]);
  assert.equal(percentualMetrica(metricas.semLlm), '50%');
});

test('preserva o baseline offline de qualidade', () => {
  const metricas = normalizarMetricasClara({
    avaliacao_offline: { casos_ferramenta: 100, acerto_ferramenta: 0.99, json_valido: 1 },
  });
  assert.equal(metricas.avaliacao.casosFerramenta, 100);
  assert.equal(percentualMetrica(metricas.avaliacao.acertoFerramenta), '99%');
});
