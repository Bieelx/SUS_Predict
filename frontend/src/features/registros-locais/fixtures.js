// Fixtures da área "Registros da unidade", no formato real do serviço
// (`api/core/local_records_service.py`).
//
// Só entram em cena com VITE_REGISTROS_LOCAIS_DEMO=1 em desenvolvimento, e a
// tela rotula tudo como "Demonstração". Falha de rede ou resposta vazia NUNCA
// ativa este módulo — em produção a área mostra indisponibilidade.

import { ErroRegistrosLocais } from '../../shared/registrosLocaisClient.js';
import { hojeOperacional, somarDias } from './regras.js';

export function modoDemonstracaoAtivo() {
  try {
    return import.meta.env?.DEV === true && import.meta.env?.VITE_REGISTROS_LOCAIS_DEMO === '1';
  } catch {
    return false;
  }
}

const hoje = () => hojeOperacional();

const UNIDADES = [
  { id: 'u-1', nome: 'UBS Jardim das Palmeiras', cnes: '2077531', tipo_unidade: 'UBS', ibge6: '355030', uf: 'SP', ativa: true,
    papel: 'gestor_unidade', capacidades: { registrar: true, revisar: true, consolidar: true } },
  { id: 'u-2', nome: 'UBS Vila Aurora', cnes: '2078112', tipo_unidade: 'UBS', ibge6: '355030', uf: 'SP', ativa: true,
    papel: 'registrador', capacidades: { registrar: true, revisar: false, consolidar: false } },
  { id: 'u-3', nome: 'UBS Central (sem registros)', cnes: '2078120', tipo_unidade: 'UBS', ibge6: '355030', uf: 'SP', ativa: true,
    papel: 'revisor', capacidades: { registrar: true, revisar: true, consolidar: false } },
];

const CATALOGO = {
  itens: [
    { id: 'i-1', codigo: 'doses_vacina_aplicadas', nome: 'Doses aplicadas', unidade_medida: 'dose', aceita_zero: true,
      dimensoes: [
        { codigo: 'vacina', nome: 'Vacina', tipo_dado: 'texto', obrigatoria: true, valores_permitidos: ['dengue', 'influenza'] },
        { codigo: 'tipo_dose', nome: 'Tipo de dose', tipo_dado: 'texto', obrigatoria: false, valores_permitidos: ['primeira', 'segunda', 'reforço'] },
      ] },
    { id: 'i-2', codigo: 'atendimentos_suspeita_dengue', nome: 'Atendimentos por suspeita de dengue', unidade_medida: 'atendimento', aceita_zero: true,
      dimensoes: [{ codigo: 'doenca', nome: 'Doença', tipo_dado: 'texto', obrigatoria: false, valores_permitidos: ['dengue'] }] },
    { id: 'i-3', codigo: 'encaminhamentos_dengue', nome: 'Encaminhamentos relacionados à dengue', unidade_medida: 'pessoa', aceita_zero: true,
      dimensoes: [{ codigo: 'destino', nome: 'Destino', tipo_dado: 'texto', obrigatoria: false, valores_permitidos: null }] },
  ],
};

function versao(numero, { status, valor, dimensoes = {}, dia = 0, vigente = true, autor = 'ana', motivo = null, pendencias = [] }) {
  const data = somarDias(hoje(), -dia);
  return {
    numero_versao: numero, periodo_inicio: valor == null ? null : data, periodo_fim: valor == null ? null : data,
    valor: valor == null ? null : String(valor), dimensoes, status, vigente,
    criada_por: autor, confirmada_por: status === 'confirmado' ? 'marcos' : null,
    motivo_alteracao: motivo, criada_em: `${data}T18:20:00-03:00`,
    confirmada_em: status === 'confirmado' ? `${data}T18:40:00-03:00` : null,
    pendencias, versao_definicao: 1,
  };
}

function registro({ id, indicador, indicador_nome, unidade_medida, versoes, unidade = 'u-1', autor = 'ana', dia = 0, relato = 'rel-1' }) {
  const data = somarDias(hoje(), -dia);
  return {
    id, relato_id: relato, item_relato: 1, unidade_id: unidade, indicador, indicador_nome, unidade_medida,
    criado_por: autor, criado_em: `${data}T18:20:00-03:00`, versoes,
    atual: versoes[versoes.length - 1],
    confirmada_vigente: versoes.find(item => item.vigente && item.status === 'confirmado') || null,
    origem: 'registros_unidade',
  };
}

const REGISTROS = [
  registro({ id: 'reg-1', indicador: 'doses_vacina_aplicadas', indicador_nome: 'Doses aplicadas', unidade_medida: 'dose',
    versoes: [versao(1, { status: 'rascunho', valor: 32, dimensoes: { vacina: 'dengue' }, vigente: false }),
      versao(2, { status: 'confirmado', valor: 32, dimensoes: { vacina: 'dengue' } })] }),
  registro({ id: 'reg-2', indicador: 'atendimentos_suspeita_dengue', indicador_nome: 'Atendimentos por suspeita de dengue', unidade_medida: 'atendimento',
    versoes: [versao(1, { status: 'confirmado', valor: 8, dimensoes: { doenca: 'dengue' } })] }),
  registro({ id: 'reg-3', indicador: 'encaminhamentos_dengue', indicador_nome: 'Encaminhamentos relacionados à dengue', unidade_medida: 'pessoa',
    versoes: [versao(1, { status: 'confirmado', valor: 2, dimensoes: { destino: 'hospital' } })] }),
  // Zero explicitamente medido.
  registro({ id: 'reg-4', indicador: 'atendimentos_suspeita_dengue', indicador_nome: 'Atendimentos por suspeita de dengue', unidade_medida: 'atendimento',
    dia: 2, versoes: [versao(1, { status: 'confirmado', valor: 0, dimensoes: { doenca: 'dengue' }, dia: 2 })] }),
  // Rascunho incompleto: pendência de dimensão obrigatória.
  registro({ id: 'reg-5', indicador: 'doses_vacina_aplicadas', indicador_nome: 'Doses aplicadas', unidade_medida: 'dose',
    versoes: [versao(1, { status: 'rascunho', valor: 14, pendencias: ['dimensoes.vacina'] })] }),
  // Correção em elaboração: o confirmado anterior continua vigente.
  registro({ id: 'reg-6', indicador: 'encaminhamentos_dengue', indicador_nome: 'Encaminhamentos relacionados à dengue', unidade_medida: 'pessoa',
    dia: 1, versoes: [versao(1, { status: 'confirmado', valor: 2, dimensoes: { destino: 'hospital' }, dia: 1 }),
      versao(2, { status: 'rascunho', valor: 3, dimensoes: { destino: 'hospital' }, dia: 1, vigente: false, autor: 'marcos', motivo: 'Recontagem com a equipe da tarde.' })] }),
  // Cancelado: aparece no histórico e sai dos totais.
  registro({ id: 'reg-7', indicador: 'doses_vacina_aplicadas', indicador_nome: 'Doses aplicadas', unidade_medida: 'dose',
    dia: 3, versoes: [versao(1, { status: 'confirmado', valor: 11, dimensoes: { vacina: 'influenza' }, dia: 3, vigente: false }),
      versao(2, { status: 'cancelado', valor: 11, dimensoes: { vacina: 'influenza' }, dia: 3, autor: 'marcos', motivo: 'Registro duplicado do mesmo fechamento.' })] }),
];

const RELATOS = {
  'rel-1': { id: 'rel-1', usuario: 'ana', canal: 'web', conversa_id: null, status: 'aguardando_confirmacao',
    texto_original: 'Hoje aplicamos 32 doses da vacina contra dengue, atendemos oito pessoas com suspeita e encaminhamos duas para o hospital.',
    transcricao: null, recebido_em: `${hoje()}T18:20:00-03:00` },
};

const dentroDoPeriodo = (item, filtros) => {
  const versaoAtual = item.atual;
  if (!versaoAtual?.periodo_inicio) return true; // rascunho sem data continua descobrível
  return versaoAtual.periodo_inicio <= filtros.fim && versaoAtual.periodo_fim >= filtros.inicio;
};

const daAba = (item, aba) => {
  if (aba === 'confirmados') return !!item.confirmada_vigente;
  if (aba === 'pendentes') return item.atual?.status === 'rascunho';
  return true;
};

const espera = () => new Promise(resolve => setTimeout(resolve, 240));
const capacidadesDa = unidade => UNIDADES.find(item => item.id === unidade)?.capacidades || {};

export function criarClienteDemonstracao() {
  return {
    demonstracao: true,
    async listarUnidades() {
      await espera();
      return { itens: UNIDADES, origem: 'registros_unidade' };
    },
    async obterCatalogo(unidadeId) {
      await espera();
      if (!UNIDADES.some(item => item.id === unidadeId)) throw new ErroRegistrosLocais('nao_autorizado', 'Seu acesso a esta unidade não está mais disponível.');
      return CATALOGO;
    },
    async listarRegistros(filtros) {
      await espera();
      const itens = REGISTROS
        .filter(item => item.unidade_id === filtros.unidade)
        .filter(item => dentroDoPeriodo(item, filtros))
        .filter(item => daAba(item, filtros.aba))
        .filter(item => !filtros.indicador || item.indicador === filtros.indicador);
      return { itens, proxima_pagina: null, capacidades: capacidadesDa(filtros.unidade), origem: 'registros_unidade' };
    },
    async obterResumo(filtros) {
      await espera();
      if (!capacidadesDa(filtros.unidade).consolidar) {
        throw new ErroRegistrosLocais('papel_insuficiente', 'Seu papel nesta unidade não permite esta operação.', null, 'papel_insuficiente');
      }
      const grupos = new Map();
      REGISTROS
        .filter(item => item.unidade_id === filtros.unidade && item.confirmada_vigente)
        .filter(item => dentroDoPeriodo(item, filtros))
        .forEach(item => {
          const confirmada = item.confirmada_vigente;
          const chave = `${item.indicador}|${JSON.stringify(confirmada.dimensoes)}`;
          const atual = grupos.get(chave) || {
            indicador: item.indicador, nome: item.indicador_nome, unidade_medida: item.unidade_medida,
            dimensoes: confirmada.dimensoes, valor: 0, quantidade_unidades_cobertas: 1,
          };
          atual.valor += Number(confirmada.valor);
          grupos.set(chave, atual);
        });
      return {
        itens: [...grupos.values()].map(item => ({ ...item, valor: String(item.valor) })),
        periodo_inicio: filtros.inicio, periodo_fim: filtros.fim, unidade_id: filtros.unidade, origem: 'registros_unidade',
      };
    },
    async obterRegistro(registroId) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      if (!item) throw new ErroRegistrosLocais('nao_encontrado', 'Registro não encontrado.', null, 'nao_encontrado');
      return { ...item, relato: RELATOS[item.relato_id], capacidades: capacidadesDa(item.unidade_id) };
    },
    async confirmar(registroId, dados, versaoEsperada) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      if (!item) throw new ErroRegistrosLocais('nao_encontrado', 'Registro não encontrado.');
      if (item.atual.numero_versao !== versaoEsperada) {
        throw new ErroRegistrosLocais('versao_desatualizada', 'Este registro foi atualizado por outra pessoa. Revise a versão atual antes de continuar.');
      }
      if (registroId === 'reg-5') {
        throw new ErroRegistrosLocais('duplicidade', 'Já existe um fechamento para esta unidade, indicador e período.', { registro_id: 'reg-1' }, 'possivel_duplicidade');
      }
      const nova = versao(item.atual.numero_versao + 1, { status: 'confirmado', valor: Number(dados.valor ?? item.atual.valor), dimensoes: dados.dimensoes || item.atual.dimensoes });
      item.versoes.forEach(v => { v.vigente = false; });
      item.versoes.push(nova);
      item.atual = nova;
      item.confirmada_vigente = nova;
      return { ...item, replay: false, versao_resultado: nova.numero_versao };
    },
    async salvarRascunho(registroId, dados, versaoEsperada) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      if (item.atual.numero_versao !== versaoEsperada) throw new ErroRegistrosLocais('versao_desatualizada', 'Este registro foi atualizado por outra pessoa. Revise a versão atual antes de continuar.');
      const nova = versao(item.atual.numero_versao + 1, { status: 'rascunho', valor: Number(dados.valor ?? item.atual.valor), dimensoes: dados.dimensoes || {} });
      item.versoes.forEach(v => { v.vigente = false; });
      item.versoes.push(nova);
      item.atual = nova;
      return { ...item, replay: false };
    },
    async rejeitar(registroId) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      const nova = versao(item.atual.numero_versao + 1, { status: 'rejeitado', valor: Number(item.atual.valor || 0), dimensoes: item.atual.dimensoes });
      item.versoes.push(nova);
      item.atual = nova;
      return { ...item };
    },
    async corrigir(registroId, dados) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      const nova = versao(item.atual.numero_versao + 1, { status: 'rascunho', valor: Number(dados.valor), dimensoes: dados.dimensoes || {}, vigente: false, motivo: dados.motivo });
      item.versoes.push(nova);
      item.atual = nova;
      return { ...item };
    },
    async cancelar(registroId, dados) {
      await espera();
      const item = REGISTROS.find(reg => reg.id === registroId);
      const nova = versao(item.atual.numero_versao + 1, { status: 'cancelado', valor: Number(item.confirmada_vigente?.valor || 0), dimensoes: item.atual.dimensoes, motivo: dados.motivo });
      item.versoes.forEach(v => { v.vigente = false; });
      item.versoes.push(nova);
      item.atual = nova;
      item.confirmada_vigente = null;
      return { ...item };
    },
  };
}
