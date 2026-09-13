export const SUSBOT_ENDPOINTS = {
  perguntar: '/api/susbot/perguntar',
  conversas: '/api/susbot/conversas',
  conversa: conversaId => `/api/susbot/conversas/${conversaId}`,
  mensagens: conversaId => `/api/susbot/conversas/${conversaId}/mensagens`,
  canais: '/api/susbot/canais',
  pareamentos: '/api/susbot/canais/pareamentos',
  pareamento: pareamentoId => `/api/susbot/canais/pareamentos/${pareamentoId}`,
  confirmarPareamento: pareamentoId => `/api/susbot/canais/pareamentos/${pareamentoId}/confirmar`,
  canal: provedor => `/api/susbot/canais/${provedor}`,
  memoria: '/api/susbot/memoria',
  memoriaCampo: chave => `/api/susbot/memoria/${chave}`,
};

export const SUSBOT_SSE_EVENTS = {
  status: 'status',
  token: 'token',
  referencia: 'referencia',
  artefato: 'artefato',
  confirmacao_pendente: 'confirmacao_pendente',
  memoria: 'memoria',
  fim: 'fim',
  erro: 'erro',
  // Modo de registro local: o backend devolve o rascunho estruturado (relato_id,
  // registros e versões) em vez de resposta de consulta. Não significa confirmação.
  rascunho_local_pronto: 'rascunho_local_pronto',
  rascunho_operacional_pronto: 'rascunho_operacional_pronto',
};

export const SUSBOT_REQUEST_FIELDS = {
  required: ['pergunta', 'ibge6', 'tela_origem'],
  optional: ['conversa_id', 'ibge', 'tela_atual'],
};

export const SUSBOT_HISTORY_FIELDS = {
  conversa: ['id', 'usuario', 'titulo', 'criada_em'],
  mensagem: ['id', 'conversa_id', 'tela_origem', 'pergunta', 'resposta', 'referencia_rota', 'criado_em'],
  page: ['page', 'page_size', 'total', 'total_paginas', 'usuario', 'itens'],
};

export const SUSBOT_TIMEOUT_MS = 45_000;

// Chave de idempotência do relato local: o backend exige de 8 a 120 caracteres
// e usa a chave para reconhecer reenvio da MESMA mensagem (mesmo texto → mesmo
// relato, sem duplicar). Por isso deriva do id da mensagem, nunca do instante
// do envio. Vive aqui, e não no cliente, para ser testável sem import.meta.env.
export function chaveIdempotenciaRelato(semente) {
  const base = String(semente ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return `web-${base || 'relato'}`.padEnd(8, '0').slice(0, 120);
}

// Reconhece somente acontecimentos locais explícitos. A interpretação e a
// validação definitivas continuam no backend; isto apenas escolhe a rota
// estruturada em vez de deixar o relato cair numa consulta analítica.
export function pareceRelatoLocal(texto) {
  const normalizado = String(texto ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (normalizado.includes('?') || /\b(como|quanto|quantos|quantas|posso|devo|vou|vamos|amanha)\b/.test(normalizado)) return false;
  return /\b(apliquei|aplicamos|atendi|atendemos|encaminhei|encaminhamos|foram aplicad[ao]s?|foram atendid[ao]s?|foram encaminhad[ao]s?)\b/.test(normalizado);
}

export function detalheLegivelSusbot(error) {
  const detalhe = error?.detail;
  if (detalhe && typeof detalhe === 'object') {
    return String(detalhe.mensagem || detalhe.message || detalhe.codigo || '').trim();
  }
  if (detalhe) return String(detalhe).trim();
  try {
    const parsed = JSON.parse(String(error?.responseText || ''));
    const value = parsed?.detail;
    return typeof value === 'object'
      ? String(value?.mensagem || value?.message || value?.codigo || '').trim()
      : String(value || '').trim();
  } catch {
    return String(error?.message || '').trim();
  }
}

export const SUSBOT_PAGE_LABELS = {
  'visao-geral': 'Visão Geral',
  alertas: 'Alertas',
  insumos: 'Insumos',
  epidemiologia: 'Epidemiologia',
  internacoes: 'Internações',
  vacinacao: 'Vacinação',
  documentos: 'Documentos',
  configuracoes: 'Configurações',
  perfil: 'Perfil',
};

export function getSusbotPageLabel(route) {
  return SUSBOT_PAGE_LABELS[route] || route;
}
