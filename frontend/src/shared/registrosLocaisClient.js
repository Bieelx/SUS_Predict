// Cliente dos registros locais da Clara.
//
// Reconciliado com o backend real (`api/core/local_records_router.py`,
// prefixo /api/clara/registros-locais). Os modelos do serviço usam
// `extra="forbid"`: enviar campo a mais devolve 422, então cada operação manda
// exatamente os campos previstos. O serviço só responde quando
// CLARA_REGISTROS_LOCAIS_ENABLED e CLARA_REGISTROS_DATABASE_URL estão
// configurados; sem isso ele devolve 503 e a tela mostra indisponibilidade.

import { authenticatedFetch } from './auth.js';

const BASE = '/api/clara/registros-locais';

export class ErroRegistrosLocais extends Error {
  constructor(tipo, mensagem, detalhe = null, codigo = null) {
    super(mensagem);
    this.name = 'ErroRegistrosLocais';
    this.tipo = tipo;
    this.detalhe = detalhe;
    this.codigo = codigo;
  }
}

const MENSAGENS = {
  nao_autenticado: 'Sua sessão expirou. Entre novamente para continuar.',
  nao_autorizado: 'Seu acesso a esta unidade não está mais disponível.',
  papel_insuficiente: 'Seu papel nesta unidade não permite esta operação.',
  nao_encontrado: 'Registro não encontrado.',
  campos_invalidos: 'Revise os campos informados antes de continuar.',
  duplicidade: 'Já existe um fechamento para esta unidade, indicador e período.',
  versao_desatualizada: 'Este registro foi atualizado por outra pessoa. Revise a versão atual antes de continuar.',
  estado_invalido: 'Esta operação não é válida para o estado atual do registro.',
  indisponivel: 'Os registros da unidade ainda não estão disponíveis.',
  falha: 'Não foi possível carregar os registros.',
};

// Códigos do serviço → tipos que a interface entende. O texto do produto é
// nosso; `mensagem` do backend entra como detalhe, nunca como SQL ou stack.
const CODIGOS = {
  acesso_negado: 'nao_autorizado',
  unidade_nao_autorizada: 'nao_autorizado',
  municipio_nao_autorizado: 'nao_autorizado',
  papel_insuficiente: 'papel_insuficiente',
  nao_encontrado: 'nao_encontrado',
  indicador_invalido: 'campos_invalidos',
  periodo_invalido: 'campos_invalidos',
  valor_invalido: 'campos_invalidos',
  dimensao_invalida: 'campos_invalidos',
  campos_pendentes: 'campos_invalidos',
  motivo_obrigatorio: 'campos_invalidos',
  usuario_invalido: 'campos_invalidos',
  relato_sem_indicadores: 'campos_invalidos',
  versao_desatualizada: 'versao_desatualizada',
  estado_invalido: 'estado_invalido',
  possivel_duplicidade: 'duplicidade',
  idempotencia_conflitante: 'versao_desatualizada',
  conflito: 'versao_desatualizada',
  recurso_desabilitado: 'indisponivel',
  servico_indisponivel: 'indisponivel',
};

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([chave, valor]) => {
    if (valor != null && valor !== '') query.set(chave, String(valor));
  });
  const texto = query.toString();
  return texto ? `?${texto}` : '';
}

function tipoDoErro(status, payload) {
  const detalhe = payload?.detail;
  const codigo = typeof detalhe === 'object' && detalhe ? detalhe.codigo : null;
  if (codigo && CODIGOS[codigo]) return { tipo: CODIGOS[codigo], codigo };
  if (status === 401) return { tipo: 'nao_autenticado', codigo };
  if (status === 403) return { tipo: 'nao_autorizado', codigo };
  // 404 sem corpo próprio é rota ausente (serviço não publicado), não registro inexistente.
  if (status === 404) return { tipo: detalhe && detalhe !== 'Not Found' ? 'nao_encontrado' : 'indisponivel', codigo };
  if (status === 409) return { tipo: 'duplicidade', codigo };
  if (status === 422) return { tipo: 'campos_invalidos', codigo };
  if (status === 503 || status === 501) return { tipo: 'indisponivel', codigo };
  return { tipo: 'falha', codigo };
}

async function requisitar(caminho, { metodo = 'GET', corpo, sinal } = {}) {
  let resposta;
  try {
    resposta = await authenticatedFetch(`${BASE}${caminho}`, {
      method: metodo,
      signal: sinal,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
  } catch (erro) {
    if (erro?.name === 'AbortError') throw erro;
    throw new ErroRegistrosLocais('falha', MENSAGENS.falha);
  }
  const payload = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const { tipo, codigo } = tipoDoErro(resposta.status, payload);
    const detalhe = typeof payload?.detail === 'object' ? payload.detail : null;
    throw new ErroRegistrosLocais(tipo, MENSAGENS[tipo] || MENSAGENS.falha, detalhe, codigo);
  }
  return payload;
}

// O serviço exige chave de idempotência entre 8 e 120 caracteres, estável para
// a mesma tentativa: o mesmo clique reenviado não grava duas vezes.
export function chaveIdempotencia(acao, registroId, versao) {
  return `${acao}-${String(registroId).slice(0, 60)}-v${versao ?? 'nova'}`.padEnd(8, '0');
}

const corpoAcao = (dados, versao, idempotencia) => ({
  versao_esperada: versao,
  chave_idempotencia: idempotencia,
  motivo: dados?.motivo || '',
});

const corpoEdicao = (dados, versao, idempotencia) => ({
  ...corpoAcao(dados, versao, idempotencia),
  periodo_inicio: dados?.periodo_inicio ?? null,
  periodo_fim: dados?.periodo_fim ?? null,
  valor: dados?.valor ?? null,
  dimensoes: dados?.dimensoes || {},
});

export function criarClienteRegistrosLocais() {
  return {
    demonstracao: false,
    listarUnidades: ({ sinal } = {}) => requisitar('/unidades', { sinal }),
    obterCatalogo: (unidadeId, { sinal } = {}) => requisitar(`/catalogo${queryString({ unidade_id: unidadeId })}`, { sinal }),
    listarRegistros: (filtros, { sinal } = {}) => requisitar(`/registros${queryString({
      unidade_id: filtros.unidade, inicio: filtros.inicio, fim: filtros.fim,
      aba: filtros.aba, indicador: filtros.indicador, pagina: filtros.pagina || 1, tamanho: filtros.tamanho || 30,
    })}`, { sinal }),
    obterResumo: (filtros, { sinal } = {}) => requisitar(`/resumo${queryString({
      unidade_id: filtros.unidade, inicio: filtros.inicio, fim: filtros.fim,
    })}`, { sinal }),
    obterRegistro: (registroId, { sinal } = {}) => requisitar(`/registros/${encodeURIComponent(registroId)}`, { sinal }),
    // "editar" é o nome da operação no serviço; na interface é "Salvar rascunho".
    salvarRascunho: (registroId, dados, versao, idempotencia) =>
      requisitar(`/registros/${encodeURIComponent(registroId)}/editar`, { metodo: 'POST', corpo: corpoEdicao(dados, versao, idempotencia) }),
    corrigir: (registroId, dados, versao, idempotencia) =>
      requisitar(`/registros/${encodeURIComponent(registroId)}/corrigir`, { metodo: 'POST', corpo: corpoEdicao(dados, versao, idempotencia) }),
    confirmar: (registroId, dados, versao, idempotencia) =>
      requisitar(`/registros/${encodeURIComponent(registroId)}/confirmar`, { metodo: 'POST', corpo: corpoAcao(dados, versao, idempotencia) }),
    rejeitar: (registroId, dados, versao, idempotencia) =>
      requisitar(`/registros/${encodeURIComponent(registroId)}/rejeitar`, { metodo: 'POST', corpo: corpoAcao(dados, versao, idempotencia) }),
    cancelar: (registroId, dados, versao, idempotencia) =>
      requisitar(`/registros/${encodeURIComponent(registroId)}/cancelar`, { metodo: 'POST', corpo: corpoAcao(dados, versao, idempotencia) }),
  };
}

export const mensagemDoErro = erro =>
  (erro instanceof ErroRegistrosLocais ? erro.message : MENSAGENS.falha);
