const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function formatarCutoffDemo(cutoff) {
  if (!cutoff || !/^\d{4}-\d{2}$/.test(String(cutoff))) return cutoff || '—';
  const [ano, mes] = String(cutoff).split('-');
  return `${MESES_ABREV[Number(mes) - 1] || mes}/${ano}`;
}

export function obterMunicipioDemo(demoState, fallback = { nome: 'Cotia', uf: 'SP' }) {
  const meta = demoState?.payload?.meta || demoState?.meta || {};
  const municipio = meta.municipio;

  if (municipio && typeof municipio === 'object' && municipio.nome && municipio.uf) {
    return municipio;
  }

  if (typeof municipio === 'string' && municipio.trim()) {
    return { nome: municipio, uf: meta.uf || fallback.uf };
  }

  return {
    nome: meta.cidade || fallback.nome,
    uf: meta.uf || fallback.uf,
  };
}

export function obterIbgeDemo(demoState, fallback = '351300') {
  const meta = demoState?.payload?.meta || demoState?.meta || {};
  return String(meta.ibge6 || meta.ibge || fallback).slice(0, 6);
}

export function obterCutoffDemo(demoState, fallback = null) {
  return demoState?.cutoff || demoState?.payload?.cutoff || demoState?.meta?.cortes?.mes_inicial || fallback;
}

export function dataBrDoCutoff(cutoff) {
  if (!cutoff || !/^\d{4}-\d{2}$/.test(String(cutoff))) return '—';
  const [ano, mes] = String(cutoff).split('-');
  return `01/${mes}/${ano}`;
}
