import { createContext, useContext, Fragment } from 'react';
import logoImage from '../../../logo.svg';

// ─── Esquemas de cores (sidebar + cor primária unificados) ────────────────────
//
// Cada esquema define a sidebar E a cor primária juntos. As cores são aplicadas
// via CSS variables no <div> raiz (ver App), então qualquer var(--token) abaixo
// re-tematiza ao trocar o esquema nas Configurações.

export const THEMES = {
  teal: {
    label: 'Azul SusPredict', dot: '#336FA1',
    vars: {
      '--sb': '#6FADD2', '--sb-border': '#4E8BB8', '--sb-text': '#1B3F5C',
      '--sb-section': '#336FA1', '--sb-strong': '#14324A', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#336FA1', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#336FA1',
      '--primary': '#336FA1', '--primary-dark': '#2A5980', '--accent': '#4E8BB8',
      '--primary-soft': '#EAF3FA', '--primary-soft-border': '#9ECAE3',
      '--primary-field': '#2A5980', '--primary-label': '#6FADD2', '--primary-on-dark': '#C9E1EF',
    },
  },
  verde: {
    label: 'Verde-saúde', dot: '#2A6B40',
    vars: {
      '--sb': '#A6C2A0', '--sb-border': '#8FB089', '--sb-text': '#2E4A2C',
      '--sb-section': '#517A4C', '--sb-strong': '#1A2E18', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#2D5436', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#2D5436',
      '--primary': '#2A6B40', '--primary-dark': '#1F4A2E', '--accent': '#5FB87E',
      '--primary-soft': '#EAF4ED', '--primary-soft-border': '#D2E7D8',
      '--primary-field': '#2F5040', '--primary-label': '#7A9A85', '--primary-on-dark': '#CBDDD0',
    },
  },
  ambar: {
    label: 'Âmbar', dot: '#A6580F',
    vars: {
      '--sb': '#D8C4A0', '--sb-border': '#C2A878', '--sb-text': '#4A3A1E',
      '--sb-section': '#8A6A3A', '--sb-strong': '#2E2415', '--sb-icon-bg': '#EDE6DA',
      '--sb-icon-fg': '#6B5C45', '--sb-icon-active-bg': '#6B451A', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#A6580F',
      '--primary': '#A6580F', '--primary-dark': '#5C3410', '--accent': '#E0A040',
      '--primary-soft': '#FBF1E3', '--primary-soft-border': '#ECDCC2',
      '--primary-field': '#5A4530', '--primary-label': '#B59A78', '--primary-on-dark': '#E8DCC8',
    },
  },
  grafite: {
    label: 'Grafite', dot: '#3D3A33',
    vars: {
      '--sb': '#B6BABF', '--sb-border': '#9DA1A8', '--sb-text': '#2E2D2B',
      '--sb-section': '#5C5A56', '--sb-strong': '#1A1814', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#3D3A33', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#3D3A33',
      '--primary': '#3D3A33', '--primary-dark': '#2A2825', '--accent': '#8A8579',
      '--primary-soft': '#F0EFEC', '--primary-soft-border': '#DDD9D2',
      '--primary-field': '#45433E', '--primary-label': '#A5A29A', '--primary-on-dark': '#DAD7D0',
    },
  },
};

export const ThemeContext = createContext({ themeId: 'teal', setThemeId: () => {} });
export const useTheme = () => useContext(ThemeContext);

// ─── Shared components ────────────────────────────────────────────────────────

export function Card({ children, className = '', style = {} }) {
  return (
    <div className={`bg-white rounded-xl border border-ink-100 ${className}`} style={style}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 15, fontWeight: 700, color: '#1A1814', margin: 0 }}>
        {children}
      </h2>
      {action && (
        <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {action}
        </button>
      )}
    </div>
  );
}

export function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: color + '22', color }}>
      {label}
    </span>
  );
}

// Ícone Material Symbols (Google Fonts). `m` = nome do ícone.
// aria-hidden porque o glifo é o próprio nome do ícone em texto: sem isso o
// leitor de tela anuncia "grid_view Visão Geral".
export function MIcon({ m, size = 19 }) {
  return (
    <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: size, lineHeight: 1 }}>
      {m}
    </span>
  );
}

// A marca vetorial colorida é exibida diretamente para preservar sua paleta.
export function LogoIcon({ size = 36, style = {} }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'block', width: size, height: size, flexShrink: 0,
        overflow: 'hidden',
        ...style,
      }}
    >
      <img
        src={logoImage}
        alt=""
        width={size}
        height={size}
        style={{
          display: 'block', width: '100%', height: '100%', objectFit: 'contain',
          transform: 'scale(1.22)', transformOrigin: 'center',
        }}
      />
    </span>
  );
}

// Aviso de dado simulado — usar quando a tela recebe `meta.dados_reais === false`
// (ou equivalente) por fallback do backend (PySUS/Supabase indisponível). Não
// bloqueia a tela, só avisa: o dado segue navegável, mas não é o real.
export function MockDataBanner({ visible, mensagem = 'Dados simulados — fonte real indisponível no momento.' }) {
  if (!visible) return null;
  return (
    <div
      className="data-state-bar"
      data-data-state-bar
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10, marginBottom: 16,
        background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)',
        color: 'var(--primary-dark)', fontSize: 13, fontWeight: 600,
      }}
    >
      <MIcon m="warning" size={18} />
      <span>{mensagem}</span>
    </div>
  );
}

// ─── Estado global de origem do dado (auditoria P1-1) ──────────────────────
//
// Todo dado mostrado no produto vem de um destes três estados. Nunca deve
// existir um quarto caminho silencioso ("mock" aparecendo como se fosse
// real). O App decide o estado a partir de `demoState` e da disponibilidade
// da API; cada página herda esse estado via prop e é responsável por não
// afirmar mais confiança do que o estado permite.
export const DATA_STATE = {
  REAL: 'real',
  DEMONSTRACAO: 'demonstracao',
  INDISPONIVEL: 'indisponivel',
};

const DATA_STATE_META = {
  [DATA_STATE.REAL]: { label: 'Dado real', icon: 'verified', cor: 'var(--good)' },
  [DATA_STATE.DEMONSTRACAO]: { label: 'Demonstração', icon: 'auto_awesome', cor: 'var(--warn)' },
  [DATA_STATE.INDISPONIVEL]: { label: 'Sem dados — fonte indisponível', icon: 'cloud_off', cor: 'var(--bad)' },
};

export function dataStateFromDemo(demoState) {
  if (demoState?.enabled) return DATA_STATE.DEMONSTRACAO;
  if (demoState?.error) return DATA_STATE.INDISPONIVEL;
  return DATA_STATE.REAL;
}

// Faixa persistente exigida pela auditoria: aparece em TODAS as telas quando
// o ambiente não é 100% real, para que uma captura de tela isolada continue
// permitindo identificar que aquilo é demonstração ou dado indisponível.
// Fica fora do fluxo de rolagem do conteúdo — reforça mesmo quando a página
// troca — e é o mesmo componente usado para marca d'água em PDFs/exports
// (ver `watermarkLabel`).
export function DataStateBar({ state }) {
  if (!state || state === DATA_STATE.REAL) return null;
  const meta = DATA_STATE_META[state] || DATA_STATE_META[DATA_STATE.INDISPONIVEL];
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '7px 16px', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em',
        color: 'white', background: meta.cor, flexShrink: 0,
      }}
    >
      <MIcon m={meta.icon} size={16} />
      <span>
        {state === DATA_STATE.DEMONSTRACAO
          ? 'MODO DEMONSTRAÇÃO — dados de um cenário histórico simulado, não é o município real em tempo real'
          : 'DADOS INDISPONÍVEIS — a fonte real falhou e nenhum dado fictício está sendo exibido no lugar'}
      </span>
    </div>
  );
}

// Rótulo textual para carimbar em PDFs/exportações geradas durante a
// demonstração (marca d'água exigida pela auditoria P1-1). Usar como texto
// visível repetido no documento exportado, não só como metadado invisível.
export function watermarkLabel(state) {
  if (state !== DATA_STATE.DEMONSTRACAO) return null;
  return 'DOCUMENTO GERADO EM MODO DEMONSTRAÇÃO — NÃO É UM DOCUMENTO OFICIAL';
}

// Bloco de "cadeia de evidência" (auditoria P1-3): todo alerta/recomendação
// numérica deve poder mostrar de onde veio o número, não só o número.
// Renderiza null quando faltar o mínimo de evidência — preferimos omitir a
// mostrar uma caixa de evidência vazia fingindo rigor.
export function EvidenceChain({ fontes, competencia, atualizadoEm, calculo, premissas, intervaloConfianca, limitacoes, versaoModelo }) {
  const linhas = [
    fontes?.length ? { k: 'Fontes', v: fontes.join(', ') } : null,
    competencia ? { k: 'Competência dos dados', v: competencia } : null,
    atualizadoEm ? { k: 'Atualizado em', v: atualizadoEm } : null,
    calculo ? { k: 'Cálculo', v: calculo } : null,
    premissas ? { k: 'Premissas locais', v: premissas } : null,
    intervaloConfianca ? { k: 'Intervalo de confiança', v: intervaloConfianca } : null,
    versaoModelo ? { k: 'Versão do modelo', v: versaoModelo } : null,
    limitacoes ? { k: 'Limitações conhecidas', v: limitacoes } : null,
  ].filter(Boolean);
  if (!linhas.length) return null;
  return (
    <details style={{ borderRadius: 10, border: '1px solid var(--ink-100)', background: 'var(--subtle)', padding: '8px 12px', marginTop: 10 }}>
      <summary
        style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--ink-400)', cursor: 'pointer', listStyle: 'none',
          display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none',
        }}
      >
        <MIcon m="expand_more" size={14} />
        Cadeia de evidência
      </summary>
      <dl style={{ margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 10px' }}>
        {linhas.map(l => (
          <Fragment key={l.k}>
            <dt style={{ fontSize: 12, color: 'var(--ink-500)', fontWeight: 600, whiteSpace: 'nowrap' }}>{l.k}</dt>
            <dd style={{ fontSize: 12, color: 'var(--ink-700)', margin: 0 }}>{l.v}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  );
}

// ─── API base ───────────────────────────────────────────────────────────────

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
