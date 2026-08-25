import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from './auth.js';

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
  if (!response.ok) throw new Error(payload.detail || `Não foi possível consultar ${recurso}.`);
  return payload;
}

export function useDadosOperacionais(recurso, params, ativo = true) {
  const chave = JSON.stringify(params || {});
  const [estado, setEstado] = useState({ dados: null, carregando: ativo, erro: null });

  const recarregar = useCallback(async () => {
    if (!ativo) return;
    setEstado(anterior => ({ ...anterior, carregando: true, erro: null }));
    try {
      const dados = await consultarDados(recurso, params);
      setEstado({ dados, carregando: false, erro: null });
    } catch (erro) {
      setEstado({ dados: null, carregando: false, erro: erro.message || 'Fonte indisponível.' });
    }
  }, [ativo, recurso, chave]);

  useEffect(() => { void recarregar(); }, [recarregar]);
  return { ...estado, recarregar };
}
