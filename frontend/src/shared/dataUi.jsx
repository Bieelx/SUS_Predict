import { Card, MIcon } from './ui.jsx';
import { dataBr } from './formatters.js';

export const PERIODOS_REAIS = ['Trimestre', 'Semestre', '12 Meses', '3 Anos', '5 Anos'];

export function EstadoConsulta({ carregando, erro, onRetry, quantidadeCards = 4 }) {
  if (carregando) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="loading-layout">
        <div className={`loading-kpi-grid loading-kpi-grid--${quantidadeCards}`}>
          {Array.from({ length: quantidadeCards }, (_, indice) => <KpiSkeleton key={indice} />)}
        </div>
        <div className="loading-panel-grid">
          <PainelSkeleton />
          <PainelSkeleton />
        </div>
        <span className="sr-only">Consultando dados reais…</span>
      </div>
    );
  }
  if (!erro) return null;
  return (
    <Card className="p-5" style={{ borderColor: 'color-mix(in srgb, var(--bad) 32%, transparent)' }}>
      <div role="alert" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--bad)' }}><MIcon m="cloud_off" /></span>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15, margin: '0 0 5px' }}>Dados reais indisponíveis</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0 }}>{erro}</p>
        </div>
        {onRetry && <button className="touch-target" onClick={onRetry} style={botao}>Tentar novamente</button>}
      </div>
    </Card>
  );
}

export function KpiSkeleton() {
  return (
    <Card className="p-5 loading-card" aria-hidden="true">
      <span className="skeleton skeleton--label" />
      <span className="skeleton skeleton--value" />
      <span className="skeleton skeleton--detail" />
      <span className="skeleton skeleton--sparkline" />
    </Card>
  );
}

export function PainelSkeleton() {
  return (
    <Card className="p-5 loading-card loading-card--panel" aria-hidden="true">
      <span className="skeleton skeleton--heading" />
      <span className="skeleton skeleton--chart" />
    </Card>
  );
}

export function FonteReal({ meta, detalhe }) {
  if (!meta) return null;
  const data = dataBr(meta.data_referencia);
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5, color: 'var(--ink-500)', marginBottom: 18 }}>
      <span>Fonte: {meta.fonte}</span>
      <span aria-hidden="true">·</span>
      <span>Atualização da fonte: {data}</span>
      {detalhe && <><span aria-hidden="true">·</span><span>{detalhe}</span></>}
      {meta.tabelas?.length > 0 && <details style={{ flexBasis: '100%' }}><summary style={{ cursor: 'pointer' }}>Ver tabelas de origem</summary><ul style={{ paddingLeft: 18, overflowWrap: 'anywhere' }}>{meta.tabelas.map(tabela => <li key={tabela}>{tabela}</li>)}</ul></details>}
    </div>
  );
}

export function SeletorPeriodo({ value, onChange, carregando }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span className="eyebrow">Período</span>
      <select value={value} onChange={event => onChange(event.target.value)} disabled={carregando} style={select}>
        {PERIODOS_REAIS.map(periodo => <option key={periodo} value={periodo}>{periodo.toLocaleLowerCase('pt-BR').replace(/^./, letra => letra.toUpperCase())}</option>)}
      </select>
    </label>
  );
}

export function Kpi({ rotulo, valor, detalhe, tom = 'var(--primary)' }) {
  return (
    <Card className="p-5">
      <p className="eyebrow" style={{ marginBottom: 9 }}>{rotulo}</p>
      <p style={{ fontFamily: 'JetBrains Mono, monospace', color: tom, fontSize: 27, fontWeight: 800, margin: 0 }}>{valor}</p>
      {detalhe && <p style={{ color: 'var(--ink-400)', fontSize: 11.5, lineHeight: 1.45, margin: '7px 0 0' }}>{detalhe}</p>}
    </Card>
  );
}

export const botao = {
  border: '1px solid var(--ink-100)', borderRadius: 8, background: 'var(--elev)', color: 'var(--primary)',
  padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};

const select = {
  minWidth: 160, padding: '9px 32px 9px 11px', border: '1px solid var(--ink-100)', borderRadius: 8,
  background: 'var(--elev)', color: 'var(--ink-900)', fontSize: 13, fontWeight: 650,
};
