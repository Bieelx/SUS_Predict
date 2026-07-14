import { createContext, useContext } from 'react';
import logoImage from '../../assets/logo.png';

// ─── Esquemas de cores (sidebar + cor primária unificados) ────────────────────
//
// Cada esquema define a sidebar E a cor primária juntos. As cores são aplicadas
// via CSS variables no <div> raiz (ver App), então qualquer var(--token) abaixo
// re-tematiza ao trocar o esquema nas Configurações.

export const THEMES = {
  teal: {
    label: 'Teal SusPredict', dot: '#1B5E6E',
    vars: {
      '--sb': '#92B6AB', '--sb-border': '#7DA399', '--sb-text': '#2C4A47',
      '--sb-section': '#4A7A76', '--sb-strong': '#1A2E2C', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#2D5449', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#2D5449',
      '--primary': '#1B5E6E', '--primary-dark': '#1E3C3C', '--accent': '#4DB8A0',
      '--primary-soft': '#EBF4F7', '--primary-soft-border': '#D6E9EE',
      '--primary-field': '#2A5050', '--primary-label': '#6A9090', '--primary-on-dark': '#C8D8D5',
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
      <h2 style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814', margin: 0 }}>
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
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: color + '22', color }}>
      {label}
    </span>
  );
}

// Ícone Material Symbols (Google Fonts). `m` = nome do ícone.
export function MIcon({ m, size = 19 }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: size, lineHeight: 1 }}>
      {m}
    </span>
  );
}

// Logo do produto em imagem. O tamanho é controlado pelo `size` para manter
// a harmonia entre a sidebar e a tela de login.
export function LogoIcon({ size = 30, style = {} }) {
  return (
    <img
      src={logoImage}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ display: 'block', objectFit: 'contain', flexShrink: 0, ...style }}
    />
  );
}

// ─── API base ───────────────────────────────────────────────────────────────

export const API_BASE = 'http://localhost:8000';
