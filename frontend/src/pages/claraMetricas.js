export function normalizarMetricasClara(dados = {}) {
  const avaliacao = dados.avaliacao_offline || {};
  const numero = chave => Number(dados[chave] || 0);
  return {
    total: numero('respostas_total'),
    semLlm: Number(dados.taxa_respostas_sem_llm || 0),
    bloqueadas: numero('escritas_bloqueadas_confirmacao'),
    fallbacks: numero('fallbacks_llm'),
    templates: numero('respostas_por_template_seguro'),
    fidelidade: numero('respostas_descartadas_fidelidade'),
    porIntencao: Object.entries(dados.por_intencao || {})
      .sort((a, b) => b[1] - a[1]).slice(0, 5),
    avaliacao: {
      data: avaliacao.executada_em || null,
      casosFerramenta: Number(avaliacao.casos_ferramenta || 0),
      acertoFerramenta: Number(avaliacao.acerto_ferramenta || 0),
      casosJson: Number(avaliacao.casos_json || 0),
      jsonValido: Number(avaliacao.json_valido || 0),
      escritasSemConfirmacao: Number(avaliacao.escritas_sem_confirmacao || 0),
      numerosDivergentes: Number(avaliacao.numeros_divergentes_aceitos || 0),
    },
  };
}

export const percentualMetrica = valor => `${(Number(valor || 0) * 100).toLocaleString('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})}%`;
