import { useCallback, useEffect, useRef, useState } from 'react';
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
  if (response.status === 404 && (!payload.detail || payload.detail === 'Not Found')) {
    throw new Error('Esta consulta não está disponível no servidor em uso. Entre em contato com a equipe responsável pelo ambiente.');
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
  const [estado, setEstado] = useState({ chaveCache, dados: inicial || null, carregando: ativo && !inicial, erro: null });
  const geracao = useRef(0);
  const chaveAtiva = useRef(chaveCache);
  // Invalidate during render so an old response cannot win before the effect runs.
  if (chaveAtiva.current !== chaveCache) {
    chaveAtiva.current = chaveCache;
    geracao.current += 1;
  }

  const recarregar = useCallback(async (forcar = true) => {
    if (!ativo) return;
    const requisicao = ++geracao.current;
    const emCache = lerCacheSessao(chaveCache);
    setEstado({
      chaveCache,
      dados: forcar ? null : (emCache || null),
      carregando: forcar || !emCache,
      erro: null,
    });
    try {
      const dados = await obterDadosOperacionais(recurso, params, { forcar });
      if (requisicao === geracao.current) setEstado({ chaveCache, dados, carregando: false, erro: null });
    } catch (erro) {
      if (requisicao === geracao.current) setEstado(anterior => ({ chaveCache, dados: anterior.dados, carregando: false, erro: erro.message || 'Fonte indisponível.' }));
    }
  }, [ativo, recurso, chave, chaveCache]);

  useEffect(() => {
    if (!ativo) return undefined;
    const cancelar = assinarCacheSessao(chaveCache, dados => {
      if (dados !== undefined && chaveAtiva.current === chaveCache) setEstado({ chaveCache, dados, carregando: false, erro: null });
    });
    void recarregar(false);
    return () => { geracao.current += 1; cancelar(); };
  }, [ativo, chaveCache, recarregar]);
  const visivel = estado.chaveCache === chaveCache ? estado : { dados: inicial || null, carregando: ativo && !inicial, erro: null };
  return { ...visivel, recarregar };
}
