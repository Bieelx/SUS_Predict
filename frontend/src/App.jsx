import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { THEMES, ThemeContext, MIcon, LogoIcon } from './shared/ui.jsx';
import { EstadoConsulta } from './shared/dataUi.jsx';
import './beta/beta.css';
import { BetaVariantSettings, BetaTopNav, readBetaVariant } from './beta/BetaVariants.jsx';

const LoginScreen = lazy(() => import('./pages/Login.jsx'));
const VisaoGeral = lazy(() => import('./pages/VisaoGeral.jsx'));
const Alertas = lazy(() => import('./pages/Alertas.jsx'));
const Insumos = lazy(() => import('./pages/Insumos.jsx'));
const Documentos = lazy(() => import('./pages/Documentos.jsx'));
const Epidemiologia = lazy(() => import('./pages/Epidemiologia.jsx'));
const Internacoes = lazy(() => import('./pages/Internacoes.jsx'));
const Vacinacao = lazy(() => import('./pages/Vacinacao.jsx'));
const PageConfiguracoes = lazy(() => import('./pages/Configuracoes.jsx'));
const PagePerfil = lazy(() => import('./pages/Perfil.jsx'));
const ClaraPanel = lazy(() => import('./pages/ClaraPanel.jsx').then(modulo => ({ default: modulo.ClaraPanel })));
import { getCurrentUser, signOut, validateSession } from './shared/auth.js';
import { obterDadosOperacionais, preCarregarDadosOperacionais } from './shared/operationalClient.js';

// ─── Sidebar ──────────────────────────────────────────────────────────────────
//
// Estrutura de navegação definida em docs/telas/00-navegacao.md, com ajuste de
// UX pedido pelo grupo: Configurações e Perfil saem do corpo principal e vão para
// o footer da sidebar.
//   OPERACIONAL (nível 1, uso diário)  → Visão Geral, Alertas, Insumos
//   ANÁLISES    (nível 2, sob demanda) → Epidemiologia, Internações, Vacinação
//   Documentos  (item isolado, discreto — histórico de ETPs)
// Clara não é item de menu (flutuante). Cobertura Vacinal e Visão Estadual
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
  { id: 'alertas',     label: 'Alertas',     icon: 'notifications' },
  { id: 'insumos',     label: 'Insumos',     icon: 'medication' },
];

const NAV_ANALISES = [
  { id: 'epidemiologia', label: 'Epidemiologia', icon: 'coronavirus' },
  { id: 'internacoes',   label: 'Internações',   icon: 'bed' },
  { id: 'vacinacao',     label: 'Vacinação',     icon: 'vaccines' },
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
  vacinacao: '/vacinacao',
  configuracoes: '/configuracoes',
  perfil: '/perfil',
};

function lerRotaAtual() {
  if (typeof window === 'undefined') return { page: 'visao-geral', alertaId: null, alertaTipo: 'todos' };
  const partes = window.location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (partes[0] === 'beta') partes.shift();
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
  if (/^\/beta(?:\/|$)/.test(window.location.pathname)) url.pathname = `/beta${url.pathname}`;
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

function nomeDoUsuario(user) {
  const metadata = user?.user_metadata || {};
  const nomeInformado = metadata.nome || metadata.full_name || metadata.name;
  if (nomeInformado?.trim()) return nomeInformado.trim();
  const identificador = String(user?.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  if (!identificador) return 'Usuário';
  return identificador.replace(/\b\p{L}/gu, letra => letra.toLocaleUpperCase('pt-BR'));
}

function iniciaisDoUsuario(nome) {
  const partes = String(nome).trim().split(/\s+/).filter(Boolean);
  return `${partes[0]?.[0] || 'U'}${partes.length > 1 ? partes.at(-1)[0] : ''}`.toLocaleUpperCase('pt-BR');
}

function Sidebar({ current, onNav, aberta, user }) {
  // Abre já expandido quando a página ativa é de Análises — chegar em
  // Epidemiologia por um link de card e não ver o item destacado no menu é
  // desorientador. Reabre também quando a navegação vem de fora da sidebar.
  const emAnalises = NAV_ANALISES.some(i => i.id === current);
  const [analisesOpen, setAnalisesOpen] = useState(emAnalises);
  const nomeUsuario = nomeDoUsuario(user);
  const iniciaisUsuario = iniciaisDoUsuario(nomeUsuario);
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
          <LogoIcon size={52} />
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
              item={item}
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
              {iniciaisUsuario}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p title={nomeUsuario} style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--sb-strong)', lineHeight: 1.2, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nomeUsuario}</p>
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

function Topbar({ page, municipio, municipios, onTrocarMunicipio, onNavigate, sidebarAberta, onToggleSidebar, visaoEstadual, onVisaoEstadual }) {
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
          <LogoIcon size={42} />
          <div>
            <p>{tituloPagina}</p>
            <span>{page === 'internacoes' || (page === 'visao-geral' && visaoEstadual) ? 'Estado de São Paulo' : municipio ? `${municipio.nome} · ${municipio.uf}` : 'Carregando municípios…'}</span>
          </div>
        </div>

        {/* Com o menu recolhido a marca perde a casa dela, então volta aqui —
            o app nunca fica sem identificação no canto superior esquerdo. */}
        {!sidebarAberta && (
          <div className="app-topbar-brand" style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <LogoIcon size={40} />
            <p style={{ fontFamily: 'var(--ff-tight)', fontWeight: 800, fontSize: 'var(--fs-sm)', color: 'var(--sb-strong)', lineHeight: 1, margin: 0 }}>
              SusPredict
            </p>
            <span style={{ width: 1, height: 20, background: 'var(--sb-border)', marginLeft: 5 }} />
          </div>
        )}

        {page !== 'internacoes' && <>
        <span className="eyebrow app-topbar-eyebrow" style={{ color: SB_SECTION }}>{page === 'visao-geral' ? 'Território' : 'Município'}</span>
        <div className="app-municipio-picker" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select
            className="topbar-select"
            aria-label="Município em análise"
            value={page === 'visao-geral' && visaoEstadual ? 'TODOS' : municipio?.ibge6 || ''}
            disabled={!municipios.length}
            onChange={e => {
              onVisaoEstadual(e.target.value === 'TODOS');
              if (e.target.value !== 'TODOS') onTrocarMunicipio(municipios.find(m => m.ibge6 === e.target.value));
            }}
          >
            {page === 'visao-geral' && <option value="TODOS">São Paulo (estado)</option>}
            {municipios.map(m => (
              <option key={m.ibge6} value={m.ibge6}>{m.nome} · {m.uf}</option>
            ))}
          </select>
          <span style={{ position: 'absolute', right: 8, pointerEvents: 'none', color: 'var(--ink-400)', display: 'flex' }}>
            <MIcon m="expand_more" size={16} />
          </span>
        </div>
        </>}
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

function MobileBottomNav({ current, maisAberto, onNav, onOpenClara, onToggleMais }) {
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
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="mobile-bottom-nav__item mobile-bottom-nav__susbot"
          aria-label="Abrir Clara"
          onClick={onOpenClara}
        >
          <span className="mobile-bottom-nav__icon mobile-bottom-nav__susbot-mark">SB</span>
          <span>Clara</span>
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

function MobileMoreSheet({ current, aberta, onClose, onNav }) {
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

      </section>
    </>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
//
// Shell puro: autenticação, tema, roteamento por página e montagem dos
// elementos sempre presentes (Clara flutuante, Gerador de ETP). Nenhuma
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

// A lista de municípios vem de /api/dados/municipios (dimensão ibge_sp do
// Supabase). Só a escolha inicial é preferência de interface: Cotia, município
// de referência do grupo, e depois o último selecionado no posto.
const MUNICIPIO_INICIAL = '351300';
const CHAVE_MUNICIPIO = 'sus_predict_municipio';

function lerMunicipioSalvo() {
  try { return localStorage.getItem(CHAVE_MUNICIPIO) || MUNICIPIO_INICIAL; } catch { return MUNICIPIO_INICIAL; }
}

export default function App() {
  const [authStatus, setAuthStatus] = useState('checking');
  const [authUser, setAuthUser] = useState(getCurrentUser);
  const [rota, setRota] = useState(lerRotaAtual);
  const page = rota.page;
  const beta = /^\/beta(?:\/|$)/.test(window.location.pathname);
  const [betaVariant, setBetaVariant] = useState(readBetaVariant);
  const betaScrollRef = useRef(null);
  useEffect(() => {
    if (beta && betaScrollRef.current) betaScrollRef.current.scrollTop = 0;
  }, [beta, page]);
  function changeBetaVariant(value) {
    setBetaVariant(value);
    try { localStorage.setItem('sus_predict_beta_variant', value); } catch { /* Optional preference. */ }
  }
  const [themeId, setThemeId] = useState('teal');
  const [claraOpenRequest, setClaraOpenRequest] = useState(null);
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

  // Município em análise — único recorte geográfico do app, lido pela topbar
  // e repassado a todas as telas.
  const [municipios, setMunicipios] = useState({ lista: [], carregando: false, erro: null });
  const [municipio, setMunicipio] = useState(null);
  const [visaoEstadual, setVisaoEstadual] = useState(false);
  const carregarMunicipios = useCallback(async (forcar = false) => {
    setMunicipios(anterior => ({ ...anterior, carregando: true, erro: null }));
    try {
      const payload = await obterDadosOperacionais('municipios', {}, { forcar });
      const lista = payload.municipios || [];
      setMunicipios({ lista, carregando: false, erro: null });
      const salvo = lerMunicipioSalvo();
      setMunicipio(atual => atual || lista.find(m => m.ibge6 === salvo) || lista.find(m => m.ibge6 === MUNICIPIO_INICIAL) || lista[0] || null);
    } catch (erro) {
      setMunicipios({ lista: [], carregando: false, erro: erro.message || 'Lista de municípios indisponível.' });
    }
  }, []);
  useEffect(() => {
    if (authStatus === 'authenticated') void carregarMunicipios();
  }, [authStatus, carregarMunicipios]);

  function trocarMunicipio(escolhido) {
    if (!escolhido) return;
    setMunicipio(escolhido);
    try { localStorage.setItem(CHAVE_MUNICIPIO, escolhido.ibge6); } catch { /* preferência opcional */ }
  }

  const themeVars = (THEMES[themeId] || THEMES.teal).vars;

  useEffect(() => {
    if (authStatus !== 'authenticated' || !municipio) return;
    void Promise.allSettled([
      preCarregarDadosOperacionais(municipio.ibge6),
      import('./pages/VisaoGeral.jsx'),
      import('./pages/Alertas.jsx'),
      import('./pages/Insumos.jsx'),
      import('./pages/Epidemiologia.jsx'),
      import('./pages/Internacoes.jsx'),
      import('./pages/Vacinacao.jsx'),
      import('./pages/Documentos.jsx'),
    ]);
  }, [authStatus, municipio]);

  useEffect(() => {
    let ativo = true;
    async function verificarSessao() {
      const user = await validateSession();
      if (ativo) {
        setAuthUser(user);
        setAuthStatus(user ? 'authenticated' : 'unauthenticated');
      }
    }
    void verificarSessao();
    const intervalo = window.setInterval(verificarSessao, 5 * 60 * 1000);
    const sincronizarAbas = () => void verificarSessao();
    window.addEventListener('storage', sincronizarAbas);
    return () => {
      ativo = false;
      window.clearInterval(intervalo);
      window.removeEventListener('storage', sincronizarAbas);
    };
  }, []);

  async function handleLogout() {
    await signOut();
    setAuthUser(null);
    setAuthStatus('unauthenticated');
  }

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
    if (!beta && (window.location.pathname === '/' || !PAGE_PATHS[window.location.pathname.split('/').filter(Boolean)[0]])) {
      window.history.replaceState({ page }, '', urlDaRota(rota));
    }
  }, []);

  const abrirClara = prompt => setClaraOpenRequest(prev => ({ id: (prev?.id || 0) + 1, prompt }));

  if (authStatus === 'checking') return <CarregandoPagina />;

  if (authStatus !== 'authenticated') {
    return (
      <Suspense fallback={<CarregandoPagina />}>
        <LoginScreen onEnter={user => {
          setAuthUser(user || getCurrentUser());
          setAuthStatus('authenticated');
        }} />
      </Suspense>
    );
  }

  function render() {
    // Sem município não há recorte para consultar: a tela mostra o estado da
    // própria lista (carregando ou erro), nunca um município substituto.
    if (!municipio) {
      return <EstadoConsulta carregando={municipios.carregando} erro={municipios.erro || 'Nenhum município retornado pela dimensão IBGE.'} onRetry={() => carregarMunicipios(true)} />;
    }

    switch (page) {
      case 'visao-geral':   return <VisaoGeral municipio={municipio} estadual={visaoEstadual} onNavigate={navegar} onOpenClara={abrirClara} />;
      case 'alertas':       return <Alertas municipio={municipio} onOpenClara={abrirClara} deepLinkAlertaId={rota.alertaId} />;
      case 'insumos':       return <Insumos municipio={municipio} />;
      case 'documentos':    return <Documentos />;
      case 'epidemiologia': return <Epidemiologia municipio={municipio} onOpenClara={abrirClara} />;
      case 'internacoes':   return <Internacoes />;
      case 'vacinacao':     return <Vacinacao municipio={municipio} />;
      case 'configuracoes': return <>{beta && <BetaVariantSettings value={betaVariant} onChange={changeBetaVariant} />}<PageConfiguracoes municipio={municipio} /></>;
      case 'perfil':        return <PagePerfil onLogout={handleLogout} />;
      default:              return <VisaoGeral municipio={municipio} onNavigate={navegar} onOpenClara={abrirClara} />;
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      {/* Canvas = cor da sidebar: é o que aparece nas calhas entre os cards
          (esquerda da sidebar, gap central, respiro do painel da Clara). */}
      <div className={beta ? `beta-app beta-${betaVariant}` : undefined} style={{ ...SEMANTIC_TOKENS, ...themeVars, minHeight: '100dvh', background: SB }}>
        <Sidebar current={page} onNav={navegar} aberta={sidebarAberta} user={authUser} />
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
          municipio={municipio}
          municipios={municipios.lista}
          onTrocarMunicipio={trocarMunicipio}
          visaoEstadual={visaoEstadual}
          onVisaoEstadual={setVisaoEstadual}
          onNavigate={navegar}
          sidebarAberta={beta && betaVariant === 'v2' && !viewportCompacto ? false : sidebarAberta}
          onToggleSidebar={alternarSidebar}
        />
        {beta && betaVariant === 'v2' && <BetaTopNav current={page} onNavigate={navegar} />}
        {/* Uma linguagem visual só: o conteúdo é sempre um card destacado do
            canvas, com o mesmo respiro do painel da Clara. Abrir o chat mexe
            em uma propriedade só (`right`) — o card não muda de identidade, e o
            FAB flutua sobre a calha, não sobre texto rolável. */}
        <main className={`app-main${chatAberto ? ' app-main--chat-open' : ''}`} style={{
          position: 'fixed', top: 'var(--topbar-h)', bottom: 0, background: SB,
          left: sidebarAberta ? 'var(--sb-w)' : 0,
          right: chatAberto ? 'var(--chat-inset)' : 0,
          transition: 'left .3s cubic-bezier(0.2,0.7,0.3,1), right .3s cubic-bezier(0.2,0.7,0.3,1)',
          display: 'flex', flexDirection: 'column',
        }}>
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
            <div ref={betaScrollRef} className="app-content-scroll" style={{ height: '100%', overflowY: 'auto' }}>
              {/* Folga extra embaixo: o FAB da Clara flutua sobre o canto
                  inferior direito do card, e sem isso o último bloco de conteúdo
                  fica embaixo dele quando a página chega ao fim da rolagem. */}
              <div className="app-page-content" style={{ padding: '28px 36px 84px', maxWidth: 1600, margin: '0 auto' }}>
                {beta && <div className="beta-context">
                  <button type="button" className="beta-context-label beta-version-shortcut" onClick={() => navegar('configuracoes')} aria-label={`Beta ${betaVariant}, escolher versão`}><span className="beta-mark">BETA {betaVariant.toUpperCase()}</span> Explorar versões <span aria-hidden="true">↗</span></button>
                  <a href={`${window.location.pathname.replace(/^\/beta/, '') || '/visao-geral'}${window.location.search}${window.location.hash}`}>Interface original <span aria-hidden="true">↗</span></a>
                </div>}
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
          onClose={() => setMobileMaisAberto(false)}
          onNav={navegar}
        />
        <MobileBottomNav
          current={page}
          maisAberto={mobileMaisAberto}
          onNav={navegar}
          onOpenClara={() => abrirClara('')}
          onToggleMais={() => setMobileMaisAberto(aberto => !aberto)}
        />
        <Suspense fallback={null}>
          {municipio && <ClaraPanel page={page} onNavigate={navegar} ibge6={municipio.ibge6} onOpenChange={setChatAberto} openRequest={claraOpenRequest} />}
        </Suspense>
      </div>
    </ThemeContext.Provider>
  );
}
