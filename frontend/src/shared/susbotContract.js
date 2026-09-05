export const SUSBOT_ENDPOINTS = {
  perguntar: '/api/susbot/perguntar',
  conversas: '/api/susbot/conversas',
  mensagens: conversaId => `/api/susbot/conversas/${conversaId}/mensagens`,
  canais: '/api/susbot/canais',
  pareamentos: '/api/susbot/canais/pareamentos',
  pareamento: pareamentoId => `/api/susbot/canais/pareamentos/${pareamentoId}`,
  confirmarPareamento: pareamentoId => `/api/susbot/canais/pareamentos/${pareamentoId}/confirmar`,
  canal: provedor => `/api/susbot/canais/${provedor}`,
};

export const SUSBOT_SSE_EVENTS = {
  status: 'status',
  token: 'token',
  referencia: 'referencia',
  artefato: 'artefato',
  confirmacao_pendente: 'confirmacao_pendente',
  fim: 'fim',
  erro: 'erro',
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
