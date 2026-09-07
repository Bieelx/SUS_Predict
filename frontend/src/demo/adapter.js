// Adapta o replay aos contratos visuais atuais, sem transformar estoque em compras.
export const MUNICIPIO_DEMO = { ibge6: '350950', nome: 'Campinas', uf: 'SP' };
export const TRANSPARENCIA = 'Casos históricos confirmados: CVE/SES-SP. Estoque, consumo, preços e projeções são simulações. Não representam a operação atual.';

const faixa = status => ({ critico: 'ALTO', atencao: 'MODERADO', ok: 'BAIXO' }[status]);
const fimDoMes = mes => {
  const [ano, numeroMes] = mes.split('-').map(Number);
  return `${mes}-${new Date(Date.UTC(ano, numeroMes, 0)).getUTCDate()}`;
};
const soma = lista => lista.reduce((total, item) => total + item.casos, 0);
const variacao = (atual, anterior) => anterior ? (atual - anterior) / anterior * 100 : null;

export function adaptarReplay(replay, estados, recurso, params = {}) {
  if (!replay || !['visao-geral', 'ruptura'].includes(recurso)) return null;
  const visiveis = estados.filter(item => item.cutoff <= replay.cutoff);
  const meta = { demo: true, fonte: replay.meta.fonte, data_referencia: replay.meta.extraido_em };
  const base = { demo: true, municipio: MUNICIPIO_DEMO, meta, competencia: { competencia_referencia: `${replay.cutoff}-01` } };
  const itens = replay.insumos.map(item => ({
    ...item, insumo_padronizado: item.item, unidade_fornecimento: item.unidade,
    faixa_risco_aquisicao: faixa(item.status), categoria_insumo: 'Estoque simulado',
    quantidade_adquirida: null, valor_adquirido: null, total_fornecedores: null,
  }));
  if (recurso === 'visao-geral') {
    const tamanho = { Mes: 1, Trimestre: 3, Ano: 12 }[params.periodo] || 1;
    const atual = replay.serie_visivel.slice(-tamanho);
    const anterior = replay.serie_visivel.slice(-tamanho * 2, -tamanho);
    const comparavel = atual.length === tamanho && anterior.length === tamanho;
    return { ...base,
      kpis: { casos_notificados: soma(atual), variacao_casos_pct: comparavel ? variacao(soma(atual), soma(anterior)) : null,
        indice_risco_regional: null, variacao_indice_risco_pp: null,
        municipios_alerta_suprimento: itens.some(item => item.status !== 'ok') ? 1 : 0,
        internacoes_sih: null, variacao_internacoes_pct: null,
        periodo_inicio: `${atual[0].mes}-01`, periodo_fim: fimDoMes(replay.cutoff) },
      serie: replay.serie_visivel.map(item => ({ competencia: item.mes, casos_notificados: item.casos })),
      evolucao: [...replay.serie_visivel.map(item => ({ competencia: item.mes, casos_notificados: item.casos })),
        ...replay.previsao.map(item => ({ competencia: item.mes, casos_tendencia: item.casos_previstos }))],
      risco: null, ruptura_categorias: [], mapa_mesorregiao: [],
      alertas: replay.alertas.map((item, ordem) => ({ ...item, ordem, mensagem: item.descricao, tipo_alerta: item.tipo === 'surto' ? 'Sinal epidemiológico' : 'Estoque simulado', severidade: item.severidade.toUpperCase() })),
    };
  }
  const meses = { Trimestre: 3, Semestre: 6, '12 Meses': 12, '3 Anos': 36, '5 Anos': 60 }[params.periodo] || 12;
  const janela = visiveis.slice(-meses);
  const alertas = replay.alertas.map(item => {
    const insumo = itens.find(insumo => insumo.item === item.item_ou_condicao);
    return { ...insumo, id: item.id, demo: true, titulo: item.titulo,
      insumo_padronizado: insumo?.item || item.titulo,
      categoria_insumo: item.tipo === 'surto' ? 'Dengue histórica' : 'Estoque simulado',
      faixa_risco_aquisicao: item.severidade === 'alta' ? 'ALTO' : 'MODERADO',
      pontos_risco_aquisicao: null, mensagem_analitica: item.descricao,
      tipo: item.tipo, evidencia: item.evidencia,
    };
  });
  return { ...base, alertas, itens_demo: itens,
    resumo: { itens_risco_alto_atual: itens.filter(item => item.status === 'critico').length,
      itens_risco_moderado_atual: itens.filter(item => item.status === 'atencao').length,
      valor_adquirido_atual: null, casos_atual: soma(janela.map(item => ({ casos: item.epidemiologia.casos_ultimo_mes }))),
      variacao_casos_pct: null, periodo_inicio: `${janela[0].cutoff}-01`, periodo_fim: fimDoMes(replay.cutoff) },
    resumo_mensal: janela.map(item => ({ competencia: item.cutoff,
      itens_risco_alto: item.insumos.filter(insumo => insumo.status === 'critico').length,
      itens_risco_moderado: item.insumos.filter(insumo => insumo.status === 'atencao').length,
      total_casos_dengue: item.epidemiologia.casos_ultimo_mes })),
    serie_mensal: [],
  };
}

export function briefingDemo(replay) {
  const item = replay.insumos[0];
  const valor = numero => numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return `Demonstração histórica · Campinas · ${replay.cutoff}\n\n` +
    `O corte contém ${replay.epidemiologia.casos_ultimo_mes.toLocaleString('pt-BR')} casos confirmados no mês. ` +
    `A projeção ilustrativa para o mês seguinte é de ${replay.epidemiologia.previsao_proximo_mes.toLocaleString('pt-BR')} casos, calculada apenas com os meses já revelados. Não é o modelo preditivo operacional.\n\n` +
    `${item.item}: ${item.quantidade_restante.toLocaleString('pt-BR')} ${item.unidade} no estoque fictício e ${item.dias_restantes.toLocaleString('pt-BR')} dias de cobertura simulada. ` +
    `Para 90 dias, custo planejado de ${valor(item.custo_planejado)} e emergencial de ${valor(item.custo_emergencial)} (premissa de acréscimo de 35%). Diferença simulada: ${valor(item.economia_estimada)}.\n\n` +
    `Esta é uma leitura guiada do cenário, sem consulta à IA ou execução de ações reais.\n\n${TRANSPARENCIA}`;
}

export function criarRascunhoDemo(replay) {
  const item = replay.insumos[0];
  return { id: `demo-${replay.cutoff}`, demo: true, nome: item.item, origem: `Demo histórica · ${replay.cutoff}`, data: new Date().toLocaleDateString('pt-BR'), status: 'rascunho',
    texto: `# Rascunho demonstrativo de ETP\n\nSem validade para contratação. Exige revisão técnica e pesquisa de preços.\n\n${briefingDemo(replay)}\n\n## Premissas\n\nConsumo simulado: ${item.consumo_previsto_dia} unidades/dia. Planejamento: 90 dias. Quantidade estimada: ${Math.round(item.consumo_previsto_dia * 90)} ${item.unidade}. Preço unitário fictício: R$ ${item.preco_unitario}.\n\n## Pendências para uso real\n\nValidar estoque e consumo locais, especificação, quantitativos, alternativas, pesquisa de preços e aprovação pelo responsável.\n\n## Fonte histórica\n\n${replay.meta.fonte}\n${replay.meta.fonte_url}\n` };
}
