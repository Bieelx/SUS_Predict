import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, THEMES, ThemeContext, MIcon, LogoIcon, DataStateBar, dataStateFromDemo } from './shared/ui.jsx';

const LoginScreen = lazy(() => import('./pages/Login.jsx'));
const VisaoGeral = lazy(() => import('./pages/VisaoGeral.jsx'));
const Alertas = lazy(() => import('./pages/Alertas.jsx'));
const Insumos = lazy(() => import('./pages/Insumos.jsx'));
const Documentos = lazy(() => import('./pages/Documentos.jsx'));
const Epidemiologia = lazy(() => import('./pages/Epidemiologia.jsx'));
const Internacoes = lazy(() => import('./pages/Internacoes.jsx'));
const Superlotacao = lazy(() => import('./pages/Superlotacao.jsx'));
const PageConfiguracoes = lazy(() => import('./pages/Configuracoes.jsx'));
const PagePerfil = lazy(() => import('./pages/Perfil.jsx'));
const GeradorEtp = lazy(() => import('./pages/GeradorEtp.jsx'));
const SusBotPanel = lazy(() => import('./pages/SusBotPanel.jsx').then(modulo => ({ default: modulo.SusBotPanel })));
import { DOCUMENTOS_INICIAIS } from './shared/etp.js';
import { obterIbgeDemo, obterMunicipioDemo } from './shared/demo.js';

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

const NAV_MOBILE_PRINCIPAL = [
  { id: 'visao-geral', label: 'Visão', icon: 'grid_view' },
  { id: 'alertas', label: 'Alertas', icon: 'notifications' },
  { id: 'insumos', label: 'Insumos', icon: 'medication' },
];

const NAV_MOBILE_SECUNDARIA = [
  ...NAV_ANALISES,
  { id: 'documentos', label: 'Documentos', icon: 'description' },
  { id: 'configuracoes', label: 'Configurações', icon: 'settings' },
  { id: 'perfil', label: 'Perfil', icon: 'person' },
];

const PAGE_PATHS = {
  'visao-geral': '/visao-geral',
  alertas: '/alertas',
  insumos: '/insumos',
  documentos: '/documentos',
  epidemiologia: '/epidemiologia',
  internacoes: '/internacoes',
  superlotacao: '/superlotacao',
  configuracoes: '/configuracoes',
  perfil: '/perfil',
};

function lerRotaAtual() {
  if (typeof window === 'undefined') return { page: 'visao-geral', alertaId: null, alertaTipo: 'todos' };
  const partes = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const candidata = partes[0] || 'visao-geral';
  const page = PAGE_PATHS[candidata] ? candidata : 'visao-geral';
  const params = new URLSearchParams(window.location.search);
  return {
    page,
    alertaId: page === 'alertas' && partes[1] ? partes[1] : null,
    alertaTipo: page === 'alertas' ? (params.get('tipo') || 'todos') : 'todos',
  };
}

function urlDaRota(rota) {
  const page = PAGE_PATHS[rota.page] ? rota.page : 'visao-geral';
  const url = new URL(window.location.href);
  url.pathname = page === 'alertas' && rota.alertaId
    ? `/alertas/${encodeURIComponent(rota.alertaId)}`
    : PAGE_PATHS[page];
  url.searchParams.delete('tipo');
  if (page === 'alertas' && rota.alertaTipo && rota.alertaTipo !== 'todos') {
    url.searchParams.set('tipo', rota.alertaTipo);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function CarregandoPagina() {
  return (
    <div role="status" aria-live="polite" aria-label="Carregando página" style={{ padding: '8px 0' }}>
      <div className="skeleton" style={{ width: 220, height: 30, borderRadius: 8, marginBottom: 18 }} />
      <div className="skeleton" style={{ width: '100%', height: 160, borderRadius: 14, marginBottom: 14 }} />
      <div className="skeleton" style={{ width: '72%', height: 110, borderRadius: 14 }} />
      <span className="sr-only">Carregando página…</span>
    </div>
  );
}

// Item nível 1 — mesmo tratamento visual para todos (Insumos idêntico aos demais,
// decisão já tomada — ver brief da tela 00).
function NavItemTier1({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nav-item"
      aria-current={active ? 'page' : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', textAlign: 'left', border: 'none', cursor: 'pointer',
        borderRadius: 10, marginBottom: 2, position: 'relative',
        background: active ? 'white' : 'transparent',
        boxShadow: active ? '0 1px 6px rgba(44,74,71,0.15)' : 'none',
      }}
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
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: active ? 600 : 500, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.2 }}>
        {item.label}
      </span>
      {item.badge && (
        <span style={{
          minWidth: 18, height: 18, borderRadius: 99, background: '#D94F4F', color: 'white',
          fontSize: 'var(--fs-xs)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 5px',
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
      className="nav-item-2"
      aria-current={active ? 'page' : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 9,
        padding: '5px 10px 5px 14px', textAlign: 'left', border: 'none', cursor: 'pointer',
        borderRadius: 8, marginBottom: 1, position: 'relative',
        background: active ? 'rgba(255,255,255,0.55)' : 'transparent',
      }}
    >
      <MIcon m={item.icon} size={15} />
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: active ? 600 : 500, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.2 }}>
        {item.label}
      </span>
    </button>
  );
}

function SidebarFooterAction({ item, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="nav-footer"
      aria-current={active ? 'page' : undefined}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 10px', textAlign: 'left', border: 'none',
        cursor: 'pointer', borderRadius: 12, position: 'relative',
        background: active ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.18)',
        boxShadow: active ? '0 1px 6px rgba(44,74,71,0.12)' : 'none',
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 8, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? ICON_BG_ACTIVE : 'rgba(255,255,255,0.35)',
        color: active ? ICON_FG_ACTIVE : ICON_FG,
      }}>
        <MIcon m={item.icon} size={16} />
      </span>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: active ? 700 : 600, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.15 }}>
        {item.label}
      </span>
      <MIcon m="chevron_right" size={18} />
    </button>
  );
}

function Sidebar({ current, onNav, aberta, alertasBadge, demoEnabled }) {
  // Abre já expandido quando a página ativa é de Análises — chegar em
  // Epidemiologia por um link de card e não ver o item destacado no menu é
  // desorientador. Reabre também quando a navegação vem de fora da sidebar.
  const emAnalises = NAV_ANALISES.some(i => i.id === current);
  const [analisesOpen, setAnalisesOpen] = useState(emAnalises);
  useEffect(() => { if (emAnalises) setAnalisesOpen(true); }, [emAnalises]);

  // Recolhida, a sidebar continua montada e só translada para fora (o menu não
  // remonta, o estado de ANÁLISES sobrevive). `inert` tira os botões da ordem de
  // Tab e do leitor de tela enquanto ela está fora da tela.
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.inert = !aberta; }, [aberta]);

  return (
    <aside
      ref={ref}
      id="app-sidebar"
      className="app-sidebar"
      aria-label="Menu principal"
      style={{
        position: 'fixed', left: 0, top: 0, width: 'var(--sb-w)', height: '100dvh',
        background: SB, display: 'flex', flexDirection: 'column', zIndex: 30,
        transform: aberta ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform .3s cubic-bezier(0.2,0.7,0.3,1)',
      }}
    >
      {/* Logo */}
      <div style={{ height: 'var(--topbar-h)', boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--sb-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={34} />
          <p style={{ fontFamily: 'var(--ff-tight)', fontWeight: 800, fontSize: 'var(--fs-md)', color: 'var(--sb-strong)', lineHeight: 1 }}>
            SusPredict
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Navegação principal" style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {/* OPERACIONAL — nível 1 */}
        <div style={{ marginBottom: 18 }}>
          <p className="eyebrow" style={{ padding: '0 10px', marginBottom: 4, color: SB_SECTION }}>
            OPERACIONAL
          </p>
          {NAV_OPERACIONAL.map(item => (
            <NavItemTier1
              key={item.id}
              item={{ ...item, badge: item.id === 'alertas' ? alertasBadge : item.badge }}
              active={current === item.id}
              onClick={() => onNav(item.id)}
            />
          ))}
        </div>

        {/* ANÁLISES — colapsável */}
        <div style={{ marginBottom: 10 }}>
          <button
            onClick={() => setAnalisesOpen(prev => !prev)}
            className="nav-item-2"
            aria-expanded={analisesOpen}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '2px 10px', marginBottom: 4, border: 'none', background: 'transparent',
              cursor: 'pointer', color: SB_SECTION, borderRadius: 8,
            }}
          >
            <span className="eyebrow" style={{ color: 'inherit' }}>ANÁLISES</span>
            <MIcon m={analisesOpen ? 'expand_less' : 'expand_more'} size={16} />
          </button>
          {analisesOpen && NAV_ANALISES.map(item => (
            <NavItemTier2 key={item.id} item={item} active={current === item.id} onClick={() => onNav(item.id)} />
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
          <span style={{ fontSize: 'var(--fs-xs)', color: SB_SECTION }}>
            {demoEnabled ? 'Replay histórico ativo' : 'Dados em sincronia · há 8 min'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SidebarFooterAction
            item={{ id: 'configuracoes', label: 'Configurações', icon: 'settings' }}
            active={current === 'configuracoes'}
            onClick={() => onNav('configuracoes')}
          />
          <button
            onClick={() => onNav('perfil')}
            className="nav-footer"
            aria-current={current === 'perfil' ? 'page' : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 14, position: 'relative',
              background: current === 'perfil' ? 'rgba(255,255,255,0.66)' : 'rgba(255,255,255,0.24)',
              boxShadow: current === 'perfil' ? '0 1px 6px rgba(44,74,71,0.12)' : 'none',
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sb-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'white', flexShrink: 0 }}>
              MO
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--sb-strong)', lineHeight: 1.2, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Márcia Oliveira</p>
              <p style={{ fontSize: 'var(--fs-xs)', color: SB_SECTION, margin: 0 }}>SMS · ADMIN</p>
            </div>
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────
//
// Carrega o contexto global do app — qual município está sendo analisado — em vez
// do breadcrumb anterior. O breadcrumb repetia em terceiro lugar o que a sidebar
// (item ativo) e o <h1> da página já diziam, e nenhum nível dele era clicável.
// A busca e o botão de "aplicativos" saíram: eram controles sem handler.

function Topbar({ page, municipio, municipios, onTrocarMunicipio, onNavigate, sidebarAberta, onToggleSidebar, demoEnabled }) {
  const tituloPagina = [...NAV_OPERACIONAL, ...NAV_ANALISES, ...NAV_MOBILE_SECUNDARIA]
    .find(item => item.id === page)?.label || 'Visão Geral';

  return (
    <header className="app-topbar" style={{
      position: 'fixed', top: 0, right: 0, height: 'var(--topbar-h)',
      left: sidebarAberta ? 'var(--sb-w)' : 0,
      transition: 'left .3s cubic-bezier(0.2,0.7,0.3,1)',
      background: SB, borderBottom: '1px solid var(--sb-border)', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 0 24px', zIndex: 20,
    }}>
      <div className="app-topbar-context" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Controle da sidebar. Fica na topbar, não flutuando na calha: assim
            ocupa o mesmo ponto nos dois estados (recolher e trazer de volta são
            o mesmo botão), não cobre conteúdo e não exige abrir espaço extra de
            um lado só — a calha do card segue simétrica. */}
        <button
          onClick={onToggleSidebar}
          className="topbar-btn app-topbar-menu-button"
          aria-label={sidebarAberta ? 'Recolher o menu' : 'Mostrar o menu'}
          aria-expanded={sidebarAberta}
          aria-controls="app-sidebar"
          title={sidebarAberta ? 'Recolher o menu' : 'Mostrar o menu'}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)',
            background: 'var(--elev)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-500)', flexShrink: 0,
          }}
        >
          <MIcon m={sidebarAberta ? 'left_panel_close' : 'left_panel_open'} size={18} />
        </button>

        <div className="mobile-topbar-title" aria-label={`Página atual: ${tituloPagina}`}>
          <LogoIcon size={30} />
          <div>
            <p>{tituloPagina}</p>
            <span>{municipio.nome} · {municipio.uf}</span>
          </div>
        </div>

        {/* Com o menu recolhido a marca perde a casa dela, então volta aqui —
            o app nunca fica sem identificação no canto superior esquerdo. */}
        {!sidebarAberta && (
          <div className="app-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <LogoIcon size={28} />
            <p style={{ fontFamily: 'var(--ff-tight)', fontWeight: 800, fontSize: 'var(--fs-sm)', color: 'var(--sb-strong)', lineHeight: 1, margin: 0 }}>
              SusPredict
            </p>
            <span style={{ width: 1, height: 20, background: 'var(--sb-border)', marginLeft: 5 }} />
          </div>
        )}

        <span className="eyebrow app-topbar-eyebrow" style={{ color: SB_SECTION }}>Município</span>
        <div className="app-municipio-picker" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select
            className="topbar-select"
            aria-label="Município em análise"
            value={municipio.ibge6}
            disabled={demoEnabled}
            onChange={e => onTrocarMunicipio(municipios.find(m => m.ibge6 === e.target.value))}
          >
            {municipios.map(m => (
              <option key={m.ibge6} value={m.ibge6}>{m.nome} · {m.uf}</option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: 'var(--ink-400)', display: 'flex' }}>
            <MIcon m="expand_more" size={16} />
          </span>
        </div>
      </div>

      {/* Sino navega para a Central de Alertas. O badge de contagem vive só na
          sidebar — dois contadores idênticos na mesma tela era ruído. */}
      <button
        onClick={() => onNavigate('alertas')}
        aria-label="Ir para a Central de Alertas"
        className="topbar-btn"
        style={{
          width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)',
          background: 'var(--elev)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-500)',
        }}
      >
        <MIcon m="notifications" size={18} />
      </button>
    </header>
  );
}

function MobileBottomNav({ current, alertasBadge, maisAberto, onNav, onOpenSusBot, onToggleMais }) {
  const paginaSecundaria = NAV_MOBILE_SECUNDARIA.some(item => item.id === current);

  return (
    <nav className="mobile-bottom-nav" aria-label="Navegação principal no celular">
      <div className="mobile-bottom-nav__inner">
        {NAV_MOBILE_PRINCIPAL.map(item => {
          const ativo = current === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className="mobile-bottom-nav__item"
              aria-current={ativo ? 'page' : undefined}
              onClick={() => onNav(item.id)}
            >
              <span className="mobile-bottom-nav__icon">
                <MIcon m={item.icon} size={21} />
                {item.id === 'alertas' && alertasBadge > 0 && (
                  <span className="mobile-bottom-nav__badge" aria-label={`${alertasBadge} alertas ativos`}>
                    {alertasBadge > 9 ? '9+' : alertasBadge}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="mobile-bottom-nav__item mobile-bottom-nav__susbot"
          aria-label="Abrir SusBot"
          onClick={onOpenSusBot}
        >
          <span className="mobile-bottom-nav__icon mobile-bottom-nav__susbot-mark">SB</span>
          <span>SusBot</span>
        </button>

        <button
          type="button"
          className="mobile-bottom-nav__item"
          aria-expanded={maisAberto}
          aria-controls="mobile-more-sheet"
          aria-current={paginaSecundaria ? 'page' : undefined}
          onClick={onToggleMais}
        >
          <span className="mobile-bottom-nav__icon"><MIcon m="menu" size={22} /></span>
          <span>Mais</span>
        </button>
      </div>
    </nav>
  );
}

function MobileMoreSheet({ current, aberta, demoEnabled, onClose, onNav }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.inert = !aberta;
  }, [aberta]);

  useEffect(() => {
    if (!aberta) return;
    const fechar = event => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberta, onClose]);

  return (
    <>
      {aberta && <button className="mobile-more-backdrop" aria-label="Fechar mais opções" onClick={onClose} />}
      <section
        ref={ref}
        id="mobile-more-sheet"
        className="mobile-more-sheet"
        aria-label="Mais áreas do SusPredict"
        aria-hidden={!aberta}
        style={{ transform: aberta ? 'translateY(0)' : 'translateY(calc(100% + 20px))' }}
      >
        <div className="mobile-more-sheet__handle" aria-hidden="true" />
        <div className="mobile-more-sheet__header">
          <div>
            <p className="eyebrow">Mais áreas</p>
            <h2>Análises e conta</h2>
          </div>
          <button type="button" className="touch-target" aria-label="Fechar mais opções" onClick={onClose}>
            <MIcon m="close" size={20} />
          </button>
        </div>

        <div className="mobile-more-sheet__list">
          {NAV_MOBILE_SECUNDARIA.map(item => (
            <button
              key={item.id}
              type="button"
              aria-current={current === item.id ? 'page' : undefined}
              onClick={() => { onNav(item.id); onClose(); }}
            >
              <span><MIcon m={item.icon} size={20} /></span>
              <span>
                <strong>{item.label}</strong>
                <small>{NAV_ANALISES.some(nav => nav.id === item.id) ? 'Análise sob demanda' : item.id === 'documentos' ? 'ETPs e rascunhos' : item.id === 'perfil' ? 'Identidade e acesso' : 'Preferências do sistema'}</small>
              </span>
              <MIcon m="chevron_right" size={20} />
            </button>
          ))}
        </div>

        <p className="mobile-more-sheet__status">
          <span aria-hidden="true" />
          {demoEnabled ? 'Replay histórico ativo' : 'Dados em sincronia · há 8 min'}
        </p>
      </section>
    </>
  );
}

function DemoForaDoEscopo({ page, onNavigate }) {
  const titulo = {
    epidemiologia: 'Epidemiologia fora do replay',
    internacoes: 'Internações fora do replay',
    superlotacao: 'Superlotação fora do replay',
    configuracoes: 'Configurações fora do replay',
    perfil: 'Perfil fora do replay',
  }[page] || 'Página fora do replay';

  const subtitulo = {
    epidemiologia: 'A demo histórica cobre Visão Geral, Alertas e Insumos. As análises ficam bloqueadas neste modo.',
    internacoes: 'A demo histórica cobre Visão Geral, Alertas e Insumos. As análises ficam bloqueadas neste modo.',
    superlotacao: 'A demo histórica cobre Visão Geral, Alertas e Insumos. As análises ficam bloqueadas neste modo.',
    configuracoes: 'A demo histórica não altera as configurações durante o replay.',
    perfil: 'O perfil real fica fora do replay histórico.',
  }[page] || 'Esta página não faz parte do replay histórico.';

  return (
    <div className="rise" style={{ maxWidth: 860 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          {titulo}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>{subtitulo}</p>
      </div>

      <Card className="p-5">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--primary-soft)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MIcon m="lock" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', margin: '2px 0 6px' }}>
              Conteúdo bloqueado na demo histórica
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>
              {subtitulo}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button onClick={() => onNavigate('visao-geral')} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 700 }}>
            Ir para Visão Geral
          </button>
          <button onClick={() => onNavigate('alertas')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--ink-100)', cursor: 'pointer', background: 'var(--elev)', color: 'var(--ink-700)', fontSize: 13, fontWeight: 700 }}>
            Abrir Alertas
          </button>
          <button onClick={() => onNavigate('insumos')} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--ink-100)', cursor: 'pointer', background: 'var(--elev)', color: 'var(--ink-700)', fontSize: 13, fontWeight: 700 }}>
            Abrir Insumos
          </button>
        </div>
      </Card>
    </div>
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
  '--ink-400': '#6F6B63', '--ink-300': '#6F6B63', '--ink-200': '#C9C4BA',
  '--ink-100': '#E5E1D6', '--ink-50': '#EFEBE0',
  '--good': '#2A6B40', '--bad': '#8A2A38', '--warn': '#A6580F', '--info': '#1B5E6E',
  '--risk-alto': '#D94F4F', '--risk-medio': '#E8903A', '--risk-baixo': '#4A9B6F',
};

// Municípios da regional de saúde de Cotia — mock, mesmo conjunto do ranking
// regional da Visão Geral. Vira chamada a /api/cidades/{uf} quando a tela plugar.
const MUNICIPIOS = [
  { ibge6: '351300', nome: 'Cotia',              uf: 'SP' },
  { ibge6: '352220', nome: 'Itapevi',            uf: 'SP' },
  { ibge6: '353440', nome: 'Osasco',             uf: 'SP' },
  { ibge6: '351060', nome: 'Carapicuíba',        uf: 'SP' },
  { ibge6: '351500', nome: 'Embu das Artes',     uf: 'SP' },
  { ibge6: '350570', nome: 'Barueri',            uf: 'SP' },
  { ibge6: '355700', nome: 'Vargem Grande Pta.', uf: 'SP' },
];

function demoAtivaNaUrl() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('demo') === 'crise-historica';
}

function atualizarUrlDemo(ativa) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (ativa) url.searchParams.set('demo', 'crise-historica');
  else url.searchParams.delete('demo');
  window.history.replaceState({}, '', url);
}

async function lerJson(response, fallback) {
  if (!response.ok) {
    throw new Error(fallback);
  }
  return response.json();
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!localStorage.getItem('sus_predict_token'));
  const [rota, setRota] = useState(lerRotaAtual);
  const page = rota.page;
  const [themeId, setThemeId] = useState('teal');
  const [etpOrigem, setEtpOrigem] = useState(null);
  const [etpAtivado, setEtpAtivado] = useState(false);
  const [susBotOpenRequest, setSusBotOpenRequest] = useState(null);
  const [chatAberto, setChatAberto] = useState(false);
  const [mobileMaisAberto, setMobileMaisAberto] = useState(false);
  const [viewportCompacto, setViewportCompacto] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches,
  );
  // Preferência de tela cheia é do posto, não da sessão: quem trabalha com o
  // menu recolhido não quer recolher de novo a cada login.
  const [sidebarAberta, setSidebarAberta] = useState(
    () => localStorage.getItem('sus_predict_sidebar') !== 'oculta'
      && !(typeof window !== 'undefined' && window.matchMedia('(max-width: 1024px)').matches),
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1024px)');
    const sincronizar = event => {
      setViewportCompacto(event.matches);
      if (event.matches) setSidebarAberta(false);
      else setSidebarAberta(localStorage.getItem('sus_predict_sidebar') !== 'oculta');
    };
    setViewportCompacto(media.matches);
    media.addEventListener('change', sincronizar);
    return () => media.removeEventListener('change', sincronizar);
  }, []);
  function alternarSidebar() {
    setSidebarAberta(aberta => {
      const proxima = !aberta;
      if (!viewportCompacto) {
        localStorage.setItem('sus_predict_sidebar', proxima ? 'visivel' : 'oculta');
      }
      return proxima;
    });
  }
  useEffect(() => {
    if (etpOrigem) setEtpAtivado(true);
  }, [etpOrigem]);
  const [municipio, setMunicipio] = useState(MUNICIPIOS[0]);
  const [documentos, setDocumentos] = useState(DOCUMENTOS_INICIAIS);
  const [demoEnabled, setDemoEnabled] = useState(demoAtivaNaUrl);
  const [demo, setDemo] = useState({
    meta: null,
    cutoff: null,
    payload: null,
    loading: false,
    error: null,
  });
  const themeVars = (THEMES[themeId] || THEMES.teal).vars;
  const municipioDemo = demoEnabled ? obterMunicipioDemo(demo, MUNICIPIOS[0]) : null;
  const ibgeDemo = demoEnabled ? obterIbgeDemo(demo, MUNICIPIOS[0].ibge6) : null;
  const municipioAtual = demoEnabled && municipioDemo
    ? { ...municipioDemo, ibge6: ibgeDemo }
    : municipio;
  const municipiosTopbar = demoEnabled && municipioDemo
    ? [{ ...municipioDemo, ibge6: ibgeDemo }]
    : MUNICIPIOS;
  const scenarioIdDemo = demo.payload?.scenario_id || demo.meta?.scenario_id || 'demo-crise-historica-dengue-2024-campinas';
  const documentosVisiveis = demoEnabled
    ? documentos.filter(doc => doc.demoHistorica && doc.scenarioId === scenarioIdDemo)
    : documentos.filter(doc => !doc.demoHistorica);

  const navegar = useCallback((destino, opcoes = {}) => {
    const parcial = typeof destino === 'string' ? { page: destino } : destino;
    const proxima = {
      page: PAGE_PATHS[parcial?.page] ? parcial.page : 'visao-geral',
      alertaId: parcial?.page === 'alertas' ? (parcial.alertaId || null) : null,
      alertaTipo: parcial?.page === 'alertas' ? (parcial.alertaTipo || 'todos') : 'todos',
    };
    const href = urlDaRota(proxima);
    if (opcoes.replace) window.history.replaceState({ page: proxima.page }, '', href);
    else window.history.pushState({ page: proxima.page }, '', href);
    setRota(proxima);
    setMobileMaisAberto(false);
    if (viewportCompacto) setSidebarAberta(false);
  }, [viewportCompacto]);

  useEffect(() => {
    function sincronizarComNavegador() {
      setRota(lerRotaAtual());
    }
    window.addEventListener('popstate', sincronizarComNavegador);
    return () => window.removeEventListener('popstate', sincronizarComNavegador);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/' || !PAGE_PATHS[window.location.pathname.split('/').filter(Boolean)[0]]) {
      window.history.replaceState({ page }, '', urlDaRota(rota));
    }
  }, []);

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

  function handleEtpGerado(_documento, origem) {
    if (!demoEnabled || !origem?.alertaId) return;
    void marcarAlertaEmAndamento?.(origem.alertaId);
  }

  async function carregarMetaEEstado(cutoffDesejado = null) {
    setDemo(prev => ({ ...prev, loading: true, error: null }));
    try {
      const metaResp = await fetch(`${API_BASE}/api/demo/crise-historica/meta`);
      const meta = await lerJson(metaResp, 'Falha ao carregar a meta da demo');
      const cutoff = cutoffDesejado || meta.cortes?.mes_inicial || meta.cortes?.cortes?.[0]?.mes || '2024-01';
      const estadoResp = await fetch(`${API_BASE}/api/demo/crise-historica/estado?cutoff=${encodeURIComponent(cutoff)}`);
      const payload = await lerJson(estadoResp, 'Falha ao carregar o corte da demo');

      setDemo({
        meta,
        cutoff: payload.cutoff || cutoff,
        payload,
        loading: false,
        error: null,
      });
    } catch (error) {
      setDemo(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Falha ao carregar a demo',
      }));
    }
  }

  async function carregarEstado(cutoff) {
    setDemo(prev => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await fetch(`${API_BASE}/api/demo/crise-historica/estado?cutoff=${encodeURIComponent(cutoff)}`);
      const payload = await lerJson(resp, 'Falha ao carregar o corte da demo');
      setDemo(prev => ({
        ...prev,
        cutoff: payload.cutoff || cutoff,
        payload,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setDemo(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Falha ao carregar o corte da demo',
      }));
    }
  }

  function iniciarDemo() {
    atualizarUrlDemo(true);
    setDemoEnabled(true);
  }

  async function reiniciarDemo() {
    if (!demoEnabled) return iniciarDemo();
    setDemo(prev => ({ ...prev, loading: true, error: null }));
    try {
      const resp = await fetch(`${API_BASE}/api/demo/crise-historica/reset`, { method: 'POST' });
      const payload = await lerJson(resp, 'Falha ao reiniciar a demo');
      setDemo(prev => ({
        ...prev,
        cutoff: payload.cutoff || prev.meta?.cortes?.mes_inicial || '2024-01',
        payload,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setDemo(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Falha ao reiniciar a demo',
      }));
    }
  }

  function obterCutoffVizinho(passos) {
    const cortes = demo.meta?.cortes?.cortes || [];
    const atual = demo.cutoff || demo.meta?.cortes?.mes_inicial || cortes[0]?.mes;
    const indiceAtual = cortes.findIndex(item => item.mes === atual);
    if (indiceAtual < 0) return null;
    const alvo = cortes[indiceAtual + passos];
    return alvo?.mes || null;
  }

  async function voltarMes() {
    const anterior = obterCutoffVizinho(-1);
    if (anterior) await carregarEstado(anterior);
  }

  async function avancarMes() {
    const proximo = obterCutoffVizinho(1);
    if (proximo) await carregarEstado(proximo);
  }

  async function marcarAlertaEmAndamento(alertaId) {
    if (!demoEnabled) return null;
    const cutoff = demo.cutoff || demo.meta?.cortes?.mes_inicial || '2024-01';
    try {
      const resp = await fetch(
        `${API_BASE}/api/demo/crise-historica/alertas/${encodeURIComponent(alertaId)}/andamento?cutoff=${encodeURIComponent(cutoff)}`,
        { method: 'POST' },
      );
      const payload = await lerJson(resp, 'Falha ao atualizar o alerta da demo');
      setDemo(prev => ({
        ...prev,
        cutoff: payload.cutoff || cutoff,
        payload,
        loading: false,
        error: null,
      }));
      return payload;
    } catch (error) {
      setDemo(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Falha ao atualizar o alerta da demo',
      }));
      return null;
    }
  }

  useEffect(() => {
    if (!demoEnabled) return;
    carregarMetaEEstado();
  }, [demoEnabled]);

  const demoState = {
    enabled: demoEnabled,
    meta: demo.meta,
    cutoff: demo.cutoff,
    payload: demo.payload,
    loading: demo.loading,
    error: demo.error,
    iniciarDemo,
    avancarMes,
    voltarMes,
    reiniciarDemo,
    marcarAlertaEmAndamento,
  };

  const dataState = dataStateFromDemo(demoState);

  const alertasBadge = demoEnabled && demo.payload
    ? (demo.payload.alertas || []).filter(a => a.status === 'novo' || a.status === 'andamento').length
    : 3;

  if (!authed) {
    return (
      <Suspense fallback={<CarregandoPagina />}>
        <LoginScreen onEnter={() => setAuthed(true)} />
      </Suspense>
    );
  }

  function render() {
    const foraDoEscopoDemo = demoEnabled && ['epidemiologia', 'internacoes', 'superlotacao', 'configuracoes', 'perfil'].includes(page);
    if (foraDoEscopoDemo) {
      return <DemoForaDoEscopo page={page} onNavigate={navegar} />;
    }

    switch (page) {
      case 'visao-geral':   return <VisaoGeral onNavigate={navegar} onGerarEtp={o => setEtpOrigem(o)} onOpenSusBot={prompt => setSusBotOpenRequest(prev => ({ id: (prev?.id || 0) + 1, prompt }))} demoState={demoState} />;
      case 'alertas':       return <Alertas onNavigate={navegar} onGerarEtp={o => setEtpOrigem(o)} onOpenSusBot={prompt => setSusBotOpenRequest(prev => ({ id: (prev?.id || 0) + 1, prompt }))} demoState={demoState} deepLinkAlertaId={rota.alertaId} filtroInicial={rota.alertaTipo} onFiltroChange={alertaTipo => navegar({ page: 'alertas', alertaId: rota.alertaId, alertaTipo }, { replace: true })} onDeepLinkClose={() => navegar({ page: 'alertas', alertaTipo: rota.alertaTipo }, { replace: true })} />;
      case 'insumos':       return <Insumos onNavigate={navegar} onGerarEtp={o => setEtpOrigem(o)} demoState={demoState} />;
      case 'documentos':    return <Documentos onNavigate={navegar} onGerarEtp={o => setEtpOrigem(o)} documentos={documentosVisiveis} demoState={demoState} />;
      case 'epidemiologia': return <Epidemiologia onNavigate={navegar} demoState={demoState} />;
      case 'internacoes':   return <Internacoes onNavigate={navegar} demoState={demoState} />;
      case 'superlotacao':  return <Superlotacao onNavigate={navegar} demoState={demoState} />;
      case 'configuracoes': return <PageConfiguracoes onNavigate={navegar} demoState={demoState} />;
      case 'perfil':        return <PagePerfil onNavigate={navegar} onLogout={() => { localStorage.removeItem('sus_predict_token'); setAuthed(false); }} demoState={demoState} />;
      default:              return <VisaoGeral onNavigate={navegar} onGerarEtp={o => setEtpOrigem(o)} onOpenSusBot={prompt => setSusBotOpenRequest(prev => ({ id: (prev?.id || 0) + 1, prompt }))} demoState={demoState} />;
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      {/* Canvas = cor da sidebar: é o que aparece nas calhas entre os cards
          (esquerda da sidebar, gap central, respiro do painel do SusBot). */}
      <div style={{ ...SEMANTIC_TOKENS, ...themeVars, minHeight: '100dvh', background: SB }}>
        <Sidebar current={page} onNav={navegar} aberta={sidebarAberta} alertasBadge={alertasBadge} demoEnabled={demoEnabled} />
        {viewportCompacto && sidebarAberta && (
          <button
            type="button"
            className="app-sidebar-backdrop"
            aria-label="Fechar menu"
            onClick={() => setSidebarAberta(false)}
          />
        )}
        <Topbar
          page={page}
          municipio={municipioAtual}
          municipios={municipiosTopbar}
          onTrocarMunicipio={setMunicipio}
          onNavigate={navegar}
          sidebarAberta={sidebarAberta}
          onToggleSidebar={alternarSidebar}
          demoEnabled={demoEnabled}
        />
        {/* Uma linguagem visual só: o conteúdo é sempre um card destacado do
            canvas, com o mesmo respiro do painel do SusBot. Abrir o chat mexe
            em uma propriedade só (`right`) — o card não muda de identidade, e o
            FAB flutua sobre a calha, não sobre texto rolável. */}
        <main className={`app-main${chatAberto ? ' app-main--chat-open' : ''}`} style={{
          position: 'fixed', top: 'var(--topbar-h)', bottom: 0, background: SB,
          left: sidebarAberta ? 'var(--sb-w)' : 0,
          right: chatAberto ? 'var(--chat-inset)' : 0,
          transition: 'left .3s cubic-bezier(0.2,0.7,0.3,1), right .3s cubic-bezier(0.2,0.7,0.3,1)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Faixa persistente de estado do dado (auditoria P1-1) — fica acima
              do card de conteúdo, então sobrevive à troca de página e não
              some ao rolar. REAL não renderiza nada (ver DataStateBar). */}
          <DataStateBar state={dataState} />
          {/* Duas camadas de propósito: a de fora arredonda e recorta, a de
              dentro rola. Com `border-radius` e `overflow-y: auto` no MESMO
              elemento, o Firefox pinta a barra de rolagem no scrollport, que
              não é recortado pelo raio — os cantos direitos saem retos (o
              Chrome recorta a ::-webkit-scrollbar, por isso lá não aparece).
              Com o recorte em um pai `overflow: hidden`, a barra fica dentro da
              área já arredondada e os quatro cantos valem em qualquer motor. */}
          <div className="app-content-frame" style={{
            flex: 1, minHeight: 0,
            margin: 'var(--gap)',
            background: 'var(--content)',
            borderRadius: 18,
            border: '1px solid var(--sb-border)',
            boxShadow: '0 8px 28px rgba(26,24,20,0.12)',
            overflow: 'hidden',
          }}>
            <div className="app-content-scroll" style={{ height: '100%', overflowY: 'auto' }}>
              {/* Folga extra embaixo: o FAB do SusBot flutua sobre o canto
                  inferior direito do card, e sem isso o último bloco de conteúdo
                  fica embaixo dele quando a página chega ao fim da rolagem. */}
              <div className="app-page-content" style={{ padding: '28px 36px 84px', maxWidth: 1600, margin: '0 auto' }}>
                <Suspense fallback={<CarregandoPagina />}>
                  {render()}
                </Suspense>
              </div>
            </div>
          </div>
        </main>
        <MobileMoreSheet
          current={page}
          aberta={mobileMaisAberto}
          demoEnabled={demoEnabled}
          onClose={() => setMobileMaisAberto(false)}
          onNav={navegar}
        />
        <MobileBottomNav
          current={page}
          alertasBadge={alertasBadge}
          maisAberto={mobileMaisAberto}
          onNav={navegar}
          onOpenSusBot={() => setSusBotOpenRequest(prev => ({ id: (prev?.id || 0) + 1, prompt: '' }))}
          onToggleMais={() => setMobileMaisAberto(aberto => !aberto)}
        />
        <Suspense fallback={null}>
          {etpAtivado && <GeradorEtp origem={etpOrigem} onClose={() => setEtpOrigem(null)} onSalvarDocumento={salvarDocumento} onEtpGerado={handleEtpGerado} demoState={demoState} />}
          <SusBotPanel page={page} onNavigate={navegar} ibge6={municipioAtual.ibge6} onOpenChange={setChatAberto} openRequest={susBotOpenRequest} />
        </Suspense>
      </div>
    </ThemeContext.Provider>
  );
}
