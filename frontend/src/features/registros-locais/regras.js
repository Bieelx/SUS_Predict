// Regras puras da área "Registros da unidade" (docs/15, contrato em docs/16).
//
// Tudo aqui é determinístico e testável sem DOM: datas operacionais, parâmetros
// de rota, normalização do payload do serviço, rótulos de estado e a decisão
// sobre quando um total pode ser somado. Nada inventa valor: ausência continua
// ausência e zero medido continua zero.

import { numero } from '../../shared/formatters.js';

export const FUSO_OPERACIONAL = 'America/Sao_Paulo';

export const ABAS = [
  { id: 'confirmados', label: 'Confirmados' },
  { id: 'pendentes', label: 'Aguardando revisão' },
  { id: 'historico', label: 'Histórico' },
];

export const ATALHOS_PERIODO = [
  { id: 'hoje', label: 'Hoje' },
  { id: '7dias', label: 'Últimos 7 dias' },
  { id: 'mes', label: 'Este mês' },
  { id: 'personalizado', label: 'Personalizado' },
];

// ─── Datas operacionais ──────────────────────────────────────────────────────
// São datas de calendário. Converter por UTC mudaria o dia para quem usa o
// sistema à noite, então "hoje" vem do fuso acordado com o backend.
export function hojeOperacional(agora = new Date(), fuso = FUSO_OPERACIONAL) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(agora);
}

// Meio-dia UTC mantém a aritmética longe das bordas de horário de verão.
export function somarDias(iso, dias) {
  const [ano, mes, dia] = String(iso).split('-').map(Number);
  const base = new Date(Date.UTC(ano, mes - 1, dia, 12));
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function intervaloDoAtalho(atalho, hoje = hojeOperacional()) {
  switch (atalho) {
    case 'hoje': return { inicio: hoje, fim: hoje };
    case 'mes': return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje };
    case '7dias':
    default: return { inicio: somarDias(hoje, -6), fim: hoje };
  }
}

export function ehDataValida(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) && !Number.isNaN(new Date(`${iso}T12:00:00Z`).getTime());
}

export function periodoValido({ inicio, fim }) {
  return ehDataValida(inicio) && ehDataValida(fim) && inicio <= fim;
}

// ─── Rota ────────────────────────────────────────────────────────────────────
// Parâmetros desta área e só dela: quem sai da rota precisa removê-los da URL.
export const PARAMS_ROTA = ['unidade', 'inicio', 'fim', 'aba', 'indicador', 'status'];

// O atalho não vai para a URL: ele é reconhecido a partir do próprio intervalo,
// senão escolher "Hoje" voltaria da navegação rotulado como "Personalizado".
export function atalhoDoIntervalo(intervalo, hoje = hojeOperacional()) {
  const candidato = ['hoje', '7dias', 'mes'].find(atalho => {
    const padrao = intervaloDoAtalho(atalho, hoje);
    return padrao.inicio === intervalo.inicio && padrao.fim === intervalo.fim;
  });
  return candidato || 'personalizado';
}

export function lerParamsRegistros(search, hoje = hojeOperacional()) {
  const params = new URLSearchParams(search || '');
  const inicio = params.get('inicio');
  const fim = params.get('fim');
  const aba = params.get('aba');
  const valido = periodoValido({ inicio, fim });
  const intervalo = valido ? { inicio, fim } : intervaloDoAtalho('7dias', hoje);
  return {
    unidade: params.get('unidade') || null,
    inicio: intervalo.inicio,
    fim: intervalo.fim,
    atalho: atalhoDoIntervalo(intervalo, hoje),
    aba: ABAS.some(item => item.id === aba) ? aba : 'confirmados',
    indicador: params.get('indicador') || null,
    status: params.get('status') || null,
  };
}

export function aplicarParamsRegistros(url, estado) {
  PARAMS_ROTA.forEach(chave => url.searchParams.delete(chave));
  if (!estado) return url;
  if (estado.unidade) url.searchParams.set('unidade', estado.unidade);
  if (estado.inicio) url.searchParams.set('inicio', estado.inicio);
  if (estado.fim) url.searchParams.set('fim', estado.fim);
  if (estado.aba && estado.aba !== 'confirmados') url.searchParams.set('aba', estado.aba);
  if (estado.indicador) url.searchParams.set('indicador', estado.indicador);
  if (estado.status) url.searchParams.set('status', estado.status);
  return url;
}

// ─── Estados ─────────────────────────────────────────────────────────────────
// Origem e estado são textuais: a cor é reforço, nunca o único portador.
export const ESTADOS = {
  rascunho: { rotulo: 'Aguardando revisão', cor: 'var(--warn)' },
  confirmado: { rotulo: 'Confirmado', cor: 'var(--good)' },
  rejeitado: { rotulo: 'Rejeitado', cor: 'var(--ink-500)' },
  cancelado: { rotulo: 'Cancelado', cor: 'var(--ink-500)' },
};

export function estadoDaVersao(status) {
  return ESTADOS[status] || { rotulo: status ? String(status) : 'Estado não informado', cor: 'var(--ink-500)' };
}

// Estado de processamento do relato é outra coisa — não deriva do estado da versão.
export const ESTADOS_RELATO = {
  recebido: 'Relato recebido',
  interpretado: 'Preparando rascunho',
  aguardando_confirmacao: 'Aguardando confirmação',
  confirmado: 'Relato confirmado',
  rejeitado: 'Relato rejeitado',
  erro: 'Falha ao interpretar o relato',
};

// ─── Normalização do payload do serviço ──────────────────────────────────────
// O backend devolve a identidade do registro com as versões dentro (`atual` e
// `confirmada_vigente`). A interface trabalha com uma linha achatada, mas a
// versão vigente confirmada nunca é substituída por um rascunho de correção.

export function versaoExibida(bruto, aba = 'confirmados') {
  if (!bruto) return null;
  if (aba === 'confirmados') return bruto.confirmada_vigente || bruto.atual || null;
  return bruto.atual || bruto.confirmada_vigente || null;
}

export function normalizarRegistro(bruto, { aba = 'confirmados', usuario = null } = {}) {
  if (!bruto) return null;
  const atual = bruto.atual || null;
  const confirmada = bruto.confirmada_vigente || null;
  const versao = versaoExibida(bruto, aba);
  const capacidades = bruto.capacidades || {};
  const rascunhoAtual = atual?.status === 'rascunho';
  const revisar = capacidades.revisar === true;
  // Registrador só edita o rascunho inicial do que ele mesmo criou — e só
  // enquanto não existir confirmado (mesma regra do serviço).
  const editarProprio = !!usuario && bruto.criado_por === usuario && !confirmada;

  return {
    registro_id: bruto.id,
    relato_id: bruto.relato_id,
    unidade_id: bruto.unidade_id,
    indicador: { codigo: bruto.indicador, nome: bruto.indicador_nome, unidade_medida: bruto.unidade_medida },
    numero_versao: versao?.numero_versao ?? null,
    // Toda mutação precisa da versão mais recente, não da exibida.
    versao_esperada: atual?.numero_versao ?? versao?.numero_versao ?? null,
    periodo_inicio: versao?.periodo_inicio || null,
    periodo_fim: versao?.periodo_fim || null,
    valor: numero(versao?.valor),
    dimensoes: versao?.dimensoes || {},
    status: versao?.status || null,
    vigente: versao?.vigente === true,
    autor: versao?.criada_por || bruto.criado_por || null,
    confirmador: confirmada?.confirmada_por || null,
    confirmado_em: confirmada?.confirmada_em || null,
    criado_em: bruto.criado_em || versao?.criada_em || null,
    motivo_alteracao: versao?.motivo_alteracao || null,
    pendencias: Array.isArray(atual?.pendencias) ? atual.pendencias : [],
    // Um rascunho de correção não retira o confirmado dos totais.
    correcao_em_elaboracao: !!confirmada && rascunhoAtual && (atual.numero_versao > confirmada.numero_versao),
    valor_confirmado_vigente: numero(confirmada?.valor),
    capacidades: {
      confirmar: revisar && rascunhoAtual,
      rejeitar: revisar && rascunhoAtual,
      editar_rascunho: rascunhoAtual && (revisar || editarProprio),
      corrigir: revisar && !!confirmada && !rascunhoAtual,
      cancelar: revisar && !!confirmada && !rascunhoAtual,
    },
    versoes: Array.isArray(bruto.versoes) ? bruto.versoes.map(item => ({
      numero_versao: item.numero_versao,
      status: item.status,
      valor: numero(item.valor),
      autor: item.criada_por,
      data: item.confirmada_em || item.criada_em,
      motivo: item.motivo_alteracao || null,
    })) : [],
    relato: bruto.relato
      ? {
        id: bruto.relato.id,
        canal: bruto.relato.canal,
        conversa_id: bruto.relato.conversa_id || null,
        status: bruto.relato.status,
        recebido_em: bruto.relato.recebido_em,
        // Texto e transcrição só existem quando o serviço autoriza devolvê-los.
        texto: bruto.relato.texto_original || bruto.relato.transcricao || null,
        tipo_entrada: bruto.relato.transcricao ? 'audio' : 'texto',
      }
      : null,
  };
}

export function normalizarUnidade(bruto) {
  return {
    id: bruto.id,
    nome: bruto.nome,
    cnes: bruto.cnes || null,
    ibge6: bruto.ibge6,
    uf: bruto.uf,
    tipo_unidade: bruto.tipo_unidade,
    papel: bruto.papel,
    capacidades: bruto.capacidades || {},
  };
}

export function normalizarCatalogo(payload) {
  return {
    indicadores: (payload?.itens || []).map(item => ({
      codigo: item.codigo,
      nome: item.nome,
      unidade_medida: item.unidade_medida,
      aceita_zero: item.aceita_zero === true,
      dimensoes: (item.dimensoes || []).map(dimensao => ({
        codigo: dimensao.codigo,
        nome: dimensao.nome,
        obrigatoria: dimensao.obrigatoria === true,
        valores_permitidos: dimensao.valores_permitidos || null,
      })),
    })),
  };
}

// ─── Resumo ──────────────────────────────────────────────────────────────────
// O serviço devolve um item por (indicador, dimensões) já restrito a versões
// confirmadas e vigentes. Agrupamos por indicador para exibição, mas só
// apresentamos um total quando todos os grupos descrevem o mesmo conjunto de
// dimensões — subtotais de granularidades diferentes podem se sobrepor e não
// podem ser somados de novo. Indicadores diferentes nunca viram um total único.

const rotuloDimensoes = dimensoes => {
  const valores = Object.entries(dimensoes || {}).sort(([a], [b]) => a.localeCompare(b));
  return valores.length ? valores.map(([, valor]) => valor).join(' · ') : 'Sem dimensão informada';
};

export function adaptarResumo(payload) {
  const itens = Array.isArray(payload?.itens) ? payload.itens : [];
  const porIndicador = new Map();
  itens.forEach(item => {
    const valor = numero(item.valor);
    const chaves = Object.keys(item.dimensoes || {}).sort().join(',');
    const atual = porIndicador.get(item.indicador) || {
      codigo: item.indicador, nome: item.nome, unidade_medida: item.unidade_medida,
      grupos: [], chaves: new Set(), soma: 0, todosMedidos: true,
      cobertura: { unidades_informaram: item.quantidade_unidades_cobertas ?? null },
    };
    atual.grupos.push({ rotulo: rotuloDimensoes(item.dimensoes), valor });
    atual.chaves.add(chaves);
    if (valor == null) atual.todosMedidos = false;
    else atual.soma += valor;
    porIndicador.set(item.indicador, atual);
  });

  return [...porIndicador.values()].map(item => ({
    codigo: item.codigo,
    nome: item.nome,
    unidade_medida: item.unidade_medida,
    grupos: item.grupos,
    // Granularidades misturadas → só os grupos, sem total.
    total: item.chaves.size === 1 && item.todosMedidos ? item.soma : null,
    cobertura: item.cobertura.unidades_informaram != null ? item.cobertura : null,
  }));
}

// "Informado por N unidades" só com contagem real de unidades distintas com
// dado confirmado no recorte. Rascunho não conta.
export function textoCobertura(cobertura) {
  const informaram = cobertura?.unidades_informaram;
  if (informaram == null) return null;
  const autorizadas = cobertura?.unidades_autorizadas;
  if (autorizadas == null) return `Informado por ${informaram} ${informaram === 1 ? 'unidade participante' : 'unidades participantes'}`;
  return `${informaram} de ${autorizadas} unidades autorizadas informaram`;
}

// O resumo do serviço exige papel com consolidação (gestor da unidade). Sem
// essa capacidade a tela mostra a lista sem inventar totais.
export function podeConsolidar(unidade) {
  return unidade?.capacidades?.consolidar === true;
}

export function podeRegistrar(unidade) {
  return unidade?.capacidades?.registrar === true;
}

// Pendências vêm como caminhos ("valor", "dimensoes.vacina").
export function rotuloPendencia(caminho, catalogo, indicadorCodigo) {
  if (caminho === 'valor') return 'Informe a quantidade.';
  if (caminho === 'periodo_inicio' || caminho === 'periodo_fim') return 'Informe a data do fechamento.';
  const codigo = String(caminho).startsWith('dimensoes.') ? String(caminho).slice('dimensoes.'.length) : null;
  if (!codigo) return `Complete o campo ${caminho}.`;
  const indicador = (catalogo?.indicadores || []).find(item => item.codigo === indicadorCodigo);
  const dimensao = indicador?.dimensoes?.find(item => item.codigo === codigo);
  return `Informe ${dimensao?.nome ? dimensao.nome.toLocaleLowerCase('pt-BR') : codigo}.`;
}

// Chave de cache: usuário + origem local + unidade + período + aba + filtros.
// Nunca compartilha espaço com o cache de dados oficiais.
export function chaveCacheRegistros(usuario, estado) {
  return [
    'local', usuario || 'anon', estado?.unidade || '-', estado?.inicio || '-', estado?.fim || '-',
    estado?.aba || 'confirmados', estado?.indicador || '-', estado?.status || '-',
  ].join('|');
}
