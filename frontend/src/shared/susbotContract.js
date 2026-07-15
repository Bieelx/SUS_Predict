export const SUSBOT_ENDPOINTS = {
  perguntar: '/api/susbot/perguntar',
  conversas: '/api/susbot/conversas',
  mensagens: conversaId => `/api/susbot/conversas/${conversaId}/mensagens`,
};

export const SUSBOT_SSE_EVENTS = {
  status: 'status',
  token: 'token',
  referencia: 'referencia',
  fim: 'fim',
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
  superlotacao: 'Superlotação',
  documentos: 'Documentos',
  configuracoes: 'Configurações',
  perfil: 'Perfil',
};

export function getSusbotPageLabel(route) {
  return SUSBOT_PAGE_LABELS[route] || route;
}
