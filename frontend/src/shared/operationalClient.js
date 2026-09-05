import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from './auth.js';
import { assinarCacheSessao, lerCacheSessao, obterComCacheSessao } from './sessionCache.js';

const consultasIniciais = ibge => [
  ['visao-geral', { ibge, periodo: 'Mes' }],
  ['ruptura', { ibge, periodo: '12 Meses' }],
  ['epidemiologia', { ibge, periodo: '12 Meses' }],
  ['internacoes', { periodo: '12 Meses' }],
  ['vacinacao', { ibge, periodo: '12 Meses' }],
];

function queryString(params) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value != null && value !== '') query.set(key, String(value));
  });
  return query.toString();
}

export async function consultarDados(recurso, params = {}) {
  const query = queryString(params);
  const response = await authenticatedFetch(`/api/dados/${recurso}${query ? `?${query}` : ''}`);
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404) {
    throw new Error(`O backend em uso não tem a rota /api/dados/${recurso}. Atualize o servidor (git pull + reinício da API) ou aponte SUSBOT_PROXY_TARGET para um backend com o código atual.`);
  }
  if (!response.ok) throw new Error(payload.detail || `Não foi possível consultar ${recurso}.`);
  return payload;
}

export function chaveDadosOperacionais(recurso, params = {}) {
  return `${recurso}:${queryString(params)}`;
}

export function obterDadosOperacionais(recurso, params = {}, opcoes = {}) {
  const chave = chaveDadosOperacionais(recurso, params);
  return obterComCacheSessao(chave, () => consultarDados(recurso, params), opcoes);
}

export async function preCarregarDadosOperacionais(ibge) {
  const resultados = await Promise.allSettled(
    consultasIniciais(ibge).map(([recurso, params]) => obterDadosOperacionais(recurso, params)),
  );
  return resultados;
}

export function useDadosOperacionais(recurso, params, ativo = true) {
  const chave = JSON.stringify(params || {});
  const chaveCache = chaveDadosOperacionais(recurso, params);
  const inicial = ativo ? lerCacheSessao(chaveCache) : null;
  const [estado, setEstado] = useState({ dados: inicial || null, carregando: ativo && !inicial, erro: null });

  const recarregar = useCallback(async (forcar = true) => {
    if (!ativo) return;
    const emCache = lerCacheSessao(chaveCache);
    setEstado({
      dados: forcar ? null : (emCache || null),
      carregando: forcar || !emCache,
      erro: null,
    });
    try {
      const dados = await obterDadosOperacionais(recurso, params, { forcar });
      setEstado({ dados, carregando: false, erro: null });
    } catch (erro) {
      setEstado(anterior => ({ dados: anterior.dados, carregando: false, erro: erro.message || 'Fonte indisponível.' }));
    }
  }, [ativo, recurso, chave, chaveCache]);

  useEffect(() => {
    if (!ativo) return undefined;
    const cancelar = assinarCacheSessao(chaveCache, dados => {
      if (dados !== undefined) setEstado({ dados, carregando: false, erro: null });
    });
    void recarregar(false);
    return cancelar;
  }, [ativo, chaveCache, recarregar]);
  return { ...estado, recarregar };
}
