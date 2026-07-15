import { useState } from 'react';
import { THEMES, ThemeContext, MIcon, LogoIcon } from './shared/ui.jsx';

import LoginScreen from './pages/Login.jsx';
import VisaoGeral from './pages/VisaoGeral.jsx';
import Alertas from './pages/Alertas.jsx';
import Insumos from './pages/Insumos.jsx';
import Documentos from './pages/Documentos.jsx';
import Epidemiologia from './pages/Epidemiologia.jsx';
import Internacoes from './pages/Internacoes.jsx';
import Superlotacao from './pages/Superlotacao.jsx';
import PageConfiguracoes from './pages/Configuracoes.jsx';
import PagePerfil from './pages/Perfil.jsx';
import GeradorEtp from './pages/GeradorEtp.jsx';
import { SusBotPanel } from './pages/SusBotPanel.jsx';
import { DOCUMENTOS_INICIAIS } from './shared/etp.js';

// ─── Sidebar ──────────────────────────────────────────────────────────────────
//
// Estrutura de navegação definida em docs/telas/00-navegacao.md, com ajuste de
// UX pedido pelo grupo: Configurações e Perfil saem do corpo principal e vão para
// o footer da sidebar.
//   OPERACIONAL (nível 1, uso diário)  → Visão Geral, Alertas, Insumos
//   ANÁLISES    (nível 2, sob demanda) → Epidemiologia, Internações, Superlotação
//   Documentos  (item isolado, discreto — histórico de ETPs)
// SusBot não é item de menu (flutuante). Cobertura Vacinal e Visão Estadual
// ficam fora do menu no MVP (nem grayed-out) — ver seção "O que fica fora" do doc.

// Tokens da sidebar — apontam para CSS variables tematizadas (ver THEMES)
const SB = 'var(--sb)';                       // sidebar bg
const SB_TEXT = 'var(--sb-text)';             // texto inativo
const SB_SECTION = 'var(--sb-section)';       // eyebrow de seção
const ICON_BG = 'var(--sb-icon-bg)';          // container ícone inativo
const ICON_FG = 'var(--sb-icon-fg)';          // ícone inativo
const ICON_BG_ACTIVE = 'var(--sb-icon-active-bg)'; // container ícone ativo
const ICON_FG_ACTIVE = 'var(--sb-icon-active-fg)'; // ícone ativo

const NAV_OPERACIONAL = [
  { id: 'visao-geral', label: 'Visão Geral', icon: 'grid_view' },
  { id: 'alertas',     label: 'Alertas',     icon: 'notifications', badge: 3 },
  { id: 'insumos',     label: 'Insumos',     icon: 'medication' },
];

const NAV_ANALISES = [
  { id: 'epidemiologia', label: 'Epidemiologia', icon: 'coronavirus' },
  { id: 'internacoes',   label: 'Internações',   icon: 'bed' },
  { id: 'superlotacao',  label: 'Superlotação',  icon: 'emergency' },
];

// Item nível 1 — mesmo tratamento visual para todos (Insumos idêntico aos demais,
// decisão já tomada — ver brief da tela 00).
function NavItemTier1({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', textAlign: 'left', border: 'none', cursor: 'pointer',
        borderRadius: 10, marginBottom: 2, position: 'relative', transition: 'all 0.12s',
        background: active ? 'white' : 'transparent',
        boxShadow: active ? '0 1px 6px rgba(44,74,71,0.15)' : 'none',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      {active && (
        <span style={{ position: 'absolute', left: -10, top: '22%', bottom: '22%', width: 3, borderRadius: '0 3px 3px 0', background: 'var(--sb-accent-bar)' }} />
      )}
      <span style={{
        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? ICON_BG_ACTIVE : ICON_BG,
        color: active ? ICON_FG_ACTIVE : ICON_FG,
        boxShadow: active ? '0 2px 5px rgba(45,84,73,0.35)' : 'none',
        transition: 'all 0.12s',
      }}>
        <MIcon m={item.icon} />
      </span>
      <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.2 }}>
        {item.label}
      </span>
      {item.badge && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 99, background: '#D94F4F', color: 'white',
          fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 4px',
        }}>
          {item.badge}
        </span>
      )}
    </button>
  );
}

// Item nível 2 (Análises) — hierarquia tipográfica menor, sem container de ícone
// de destaque, para não competir com o nível operacional (ver doc da tela 00).
function NavItemTier2({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '5px 10px 5px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
        borderRadius: 8, marginBottom: 1, position: 'relative', transition: 'all 0.12s',
        background: active ? 'rgba(255,255,255,0.55)' : 'transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.25)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
    >
      <MIcon m={item.icon} size={15} />
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.2 }}>
        {item.label}
      </span>
    </button>
  );
}

function SidebarFooterAction({ item, active, onClick, compact = false }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: compact ? '8px 10px' : '10px 12px', textAlign: 'left', border: 'none',
        cursor: 'pointer', borderRadius: 12, position: 'relative', transition: 'all 0.12s',
        background: active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)',
        boxShadow: active ? '0 1px 6px rgba(44,74,71,0.12)' : 'none',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.3)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.18)'; }}
    >
      <span style={{
        width: compact ? 24 : 28, height: compact ? 24 : 28, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? ICON_BG_ACTIVE : 'rgba(255,255,255,0.35)',
        color: active ? ICON_FG_ACTIVE : ICON_FG,
      }}>
        <MIcon m={item.icon} size={compact ? 16 : 17} />
      </span>
      <span style={{ fontSize: compact ? 12 : 13, fontWeight: active ? 700 : 600, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.15 }}>
        {item.label}
      </span>
      <MIcon m="chevron_right" size={18} />
    </button>
  );
}

function Sidebar({ current, onNav }) {
  const [analisesOpen, setAnalisesOpen] = useState(false);
  const analysesVisible = analisesOpen;

  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, width: 220, height: '100vh',
      background: SB, display: 'flex', flexDirection: 'column', zIndex: 30,
    }}>
      {/* Logo */}
      <div style={{ height: 60, boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--sb-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={34} />
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--sb-strong)', lineHeight: 1 }}>
            SusPredict
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {/* OPERACIONAL — nível 1 */}
        <div style={{ marginBottom: 18 }}>
          <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: SB_SECTION }}>
            OPERACIONAL
          </p>
          {NAV_OPERACIONAL.map(item => (
            <NavItemTier1 key={item.id} item={item} active={current === item.id} onClick={() => onNav(item.id)} />
          ))}
        </div>

        {/* ANÁLISES — colapsável por padrão */}
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setAnalisesOpen(prev => !prev)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 10px', marginBottom: 4, border: 'none', background: 'transparent',
              cursor: 'pointer', color: SB_SECTION,
            }}
          >
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em' }}>ANÁLISES</span>
            <MIcon m={analysesVisible ? 'expand_less' : 'expand_more'} size={16} />
          </button>
          {analysesVisible && NAV_ANALISES.map(item => (
            <NavItemTier2 key={item.id} item={item} active={current === item.id} onClick={() => { setAnalisesOpen(true); onNav(item.id); }} />
          ))}
        </div>

        {/* Documentos — item isolado, destaque ainda menor */}
        <div style={{ marginBottom: 18 }}>
          <NavItemTier2 item={{ id: 'documentos', label: 'Documentos', icon: 'description' }} active={current === 'documentos'} onClick={() => onNav('documentos')} />
        </div>

      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 20px 18px', borderTop: '1px solid rgba(44,74,71,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3DB887', flexShrink: 0, animation: 'dot-pulse 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 10.5, color: SB_SECTION }}>Dados em sincronia · há 8 min</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SidebarFooterAction
            item={{ id: 'configuracoes', label: 'Configurações', icon: 'settings' }}
            active={current === 'configuracoes'}
            onClick={() => onNav('configuracoes')}
            compact
          />
          <button
            onClick={() => onNav('perfil')}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 14, position: 'relative',
              transition: 'all 0.12s', background: current === 'perfil' ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.24)',
              boxShadow: current === 'perfil' ? '0 1px 6px rgba(44,74,71,0.12)' : 'none',
            }}
            onMouseEnter={e => { if (current !== 'perfil') e.currentTarget.style.background = 'rgba(255,255,255,0.34)'; }}
            onMouseLeave={e => { if (current !== 'perfil') e.currentTarget.style.background = 'rgba(255,255,255,0.24)'; }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sb-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
              MO
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--sb-strong)', lineHeight: 1.2, margin: 0 }}>Márcia Oliveira</p>
              <p style={{ fontSize: 10, color: SB_SECTION, margin: 0 }}>SMS · ADMIN</p>
            </div>
            <MIcon m="chevron_right" size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

const CRUMBS = {
  'visao-geral':    ['Operacional', 'Visão Geral'],
  'alertas':        ['Operacional', 'Alertas'],
  'insumos':        ['Operacional', 'Insumos'],
  'epidemiologia':  ['Análises', 'Epidemiologia'],
  'internacoes':    ['Análises', 'Internações'],
  'superlotacao':   ['Análises', 'Superlotação'],
  'documentos':     ['Documentos', 'ETPs gerados'],
  'configuracoes':  ['Sistema', 'Configurações'],
  'perfil':         ['Sistema', 'Perfil'],
};

function Topbar({ current }) {
  const crumbs = CRUMBS[current] || ['Início'];
  return (
    <header style={{ position: 'fixed', top: 0, right: 0, left: 220, height: 60, background: SB, borderBottom: '1px solid var(--sb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', zIndex: 20 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: SB_SECTION, fontSize: 12 }}>/</span>}
            <span style={{ fontSize: 12, fontWeight: i === crumbs.length - 1 ? 600 : 400, color: i === crumbs.length - 1 ? 'var(--sb-strong)' : SB_TEXT }}>{c}</span>
          </span>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar dados, relatórios..."
            style={{ width: 260, padding: '6px 12px 6px 32px', fontSize: 12, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', color: '#3D3A33', outline: 'none' }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#A8A39A" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14" strokeLinecap="round"/>
          </svg>
        </div>
        <button aria-label="Aplicativos" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
            <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button aria-label="Notificações" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <path d="M8 1a4 4 0 014 4v3l1.5 2.5h-11L4 8V5a4 4 0 014-4zM6.5 13.5a1.5 1.5 0 003 0"/>
          </svg>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#D94F4F', color: 'white', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
        </button>
      </div>
    </header>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
//
// Shell puro: autenticação, tema, roteamento por página e montagem dos
// elementos sempre presentes (SusBot flutuante, Gerador de ETP). Nenhuma
// tela de conteúdo é implementada aqui — cada uma vive em `src/pages/`.

// Tokens semânticos fixos (independentes de tema) — ver DESIGN.md "Color Strategy".
const SEMANTIC_TOKENS = {
  '--canvas': '#F6F5F2', '--content': '#F1F4F3', '--elev': '#FFFFFF',
  '--subtle': '#F0EDE6', '--tint': '#E9E5DC',
  '--ink-900': '#1A1814', '--ink-700': '#3D3A33', '--ink-500': '#6B665D',
  '--ink-400': '#8A8579', '--ink-300': '#A8A39A', '--ink-200': '#C9C4BA',
  '--ink-100': '#E5E1D6', '--ink-50': '#EFEBE0',
  '--good': '#2A6B40', '--bad': '#8A2A38', '--warn': '#A6580F', '--info': '#1B5E6E',
  '--risk-alto': '#D94F4F', '--risk-medio': '#E8903A', '--risk-baixo': '#4A9B6F',
};

const MUNICIPIO_ATIVO_IBGE6 = '351300';

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('sus_predict_token'));
  const [page, setPage] = useState('visao-geral');
  const [themeId, setThemeId] = useState('teal');
  const [etpOrigem, setEtpOrigem] = useState(null);
  const [documentos, setDocumentos] = useState(DOCUMENTOS_INICIAIS);
  const themeVars = (THEMES[themeId] || THEMES.teal).vars;

  function salvarDocumento(doc) {
    setDocumentos(prev => {
      const existente = prev.find(item => item.nome === doc.nome);
      const atualizados = existente
        ? prev.map(item => item.nome === doc.nome ? { ...item, ...doc } : item)
        : [doc, ...prev];
      return atualizados.slice().sort((a, b) => {
        const [da, ma, aa] = a.data.split('/').map(Number);
        const [db, mb, ab] = b.data.split('/').map(Number);
        return new Date(ab, mb - 1, db) - new Date(aa, ma - 1, da);
      });
    });
  }

  if (!authed) return <LoginScreen onEnter={() => setAuthed(true)} />;

  function render() {
    switch (page) {
      case 'visao-geral':   return <VisaoGeral onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} />;
      case 'alertas':       return <Alertas onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} />;
      case 'insumos':       return <Insumos onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} />;
      case 'documentos':    return <Documentos onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} documentos={documentos} />;
      case 'epidemiologia': return <Epidemiologia onNavigate={setPage} />;
      case 'internacoes':   return <Internacoes onNavigate={setPage} />;
      case 'superlotacao':  return <Superlotacao onNavigate={setPage} />;
      case 'configuracoes': return <PageConfiguracoes onNavigate={setPage} />;
      case 'perfil':        return <PagePerfil onNavigate={setPage} onLogout={() => { localStorage.removeItem('sus_predict_token'); setAuthed(false); }} />;
      default:              return <VisaoGeral onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} />;
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      <div style={{ ...SEMANTIC_TOKENS, ...themeVars, display: 'flex', minHeight: '100vh', background: '#F6F5F2' }}>
        <Sidebar current={page} onNav={setPage} />
        <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Topbar current={page} />
          <main style={{ position: 'fixed', top: 60, right: 0, left: 220, bottom: 0, background: SB }}>
            <div style={{ height: '100%', background: '#F1F4F3', borderTopLeftRadius: 20, border: '1px solid var(--sb-border)', borderRight: 'none', borderBottom: 'none', boxShadow: '-2px -2px 8px rgba(0,0,0,0.04)', overflowY: 'auto' }}>
              <div style={{ padding: '28px 36px', maxWidth: 1600, margin: '0 auto' }}>
                {render()}
              </div>
            </div>
          </main>
        </div>
        <GeradorEtp origem={etpOrigem} onClose={() => setEtpOrigem(null)} onSalvarDocumento={salvarDocumento} />
        <SusBotPanel page={page} onNavigate={setPage} ibge6={MUNICIPIO_ATIVO_IBGE6} />
      </div>
    </ThemeContext.Provider>
  );
}
