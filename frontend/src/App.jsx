import { useEffect, useRef, useState } from 'react';
import { API_BASE, THEMES, ThemeContext, MIcon, LogoIcon } from './shared/ui.jsx';

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
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
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

function Topbar({ municipio, municipios, onTrocarMunicipio, onNavigate, sidebarAberta, onToggleSidebar }) {
  return (
    <header style={{
      position: 'fixed', top: 0, right: 0, height: 'var(--topbar-h)',
      left: sidebarAberta ? 'var(--sb-w)' : 0,
      transition: 'left .3s cubic-bezier(0.2,0.7,0.3,1)',
      background: SB, borderBottom: '1px solid var(--sb-border)', display: 'flex',
      alignItems: 'center', justifyContent: 'space-between', padding: '0 20px 0 24px', zIndex: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Controle da sidebar. Fica na topbar, não flutuando na calha: assim
            ocupa o mesmo ponto nos dois estados (recolher e trazer de volta são
            o mesmo botão), não cobre conteúdo e não exige abrir espaço extra de
            um lado só — a calha do card segue simétrica. */}
        <button
          onClick={onToggleSidebar}
          className="topbar-btn"
          aria-label={sidebarAberta ? 'Recolher o menu' : 'Mostrar o menu'}
          aria-expanded={sidebarAberta}
          title={sidebarAberta ? 'Recolher o menu' : 'Mostrar o menu'}
          style={{
            width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)',
            background: 'var(--elev)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', color: 'var(--ink-500)', flexShrink: 0,
          }}
        >
          <MIcon m={sidebarAberta ? 'left_panel_close' : 'left_panel_open'} size={18} />
        </button>

        {/* Com o menu recolhido a marca perde a casa dela, então volta aqui —
            o app nunca fica sem identificação no canto superior esquerdo. */}
        {!sidebarAberta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <LogoIcon size={28} />
            <p style={{ fontFamily: 'var(--ff-tight)', fontWeight: 800, fontSize: 'var(--fs-sm)', color: 'var(--sb-strong)', lineHeight: 1, margin: 0 }}>
              SusPredict
            </p>
            <span style={{ width: 1, height: 20, background: 'var(--sb-border)', marginLeft: 5 }} />
          </div>
        )}

        <span className="eyebrow" style={{ color: SB_SECTION }}>Município</span>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <select
            className="topbar-select"
            aria-label="Município em análise"
            value={municipio.ibge6}
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
  const [page, setPage] = useState('visao-geral');
  const [themeId, setThemeId] = useState('teal');
  const [etpOrigem, setEtpOrigem] = useState(null);
  const [chatAberto, setChatAberto] = useState(false);
  // Preferência de tela cheia é do posto, não da sessão: quem trabalha com o
  // menu recolhido não quer recolher de novo a cada login.
  const [sidebarAberta, setSidebarAberta] = useState(
    () => localStorage.getItem('sus_predict_sidebar') !== 'oculta',
  );
  useEffect(() => {
    localStorage.setItem('sus_predict_sidebar', sidebarAberta ? 'visivel' : 'oculta');
  }, [sidebarAberta]);
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

  const alertasBadge = demoEnabled && demo.payload
    ? (demo.payload.alertas || []).filter(a => a.status === 'novo' || a.status === 'andamento').length
    : 3;

  if (!authed) return <LoginScreen onEnter={() => setAuthed(true)} />;

  function render() {
    const foraDoEscopoDemo = demoEnabled && ['epidemiologia', 'internacoes', 'superlotacao', 'configuracoes', 'perfil'].includes(page);
    if (foraDoEscopoDemo) {
      return <DemoForaDoEscopo page={page} onNavigate={setPage} />;
    }

    switch (page) {
      case 'visao-geral':   return <VisaoGeral onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} demoState={demoState} />;
      case 'alertas':       return <Alertas onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} demoState={demoState} />;
      case 'insumos':       return <Insumos onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} demoState={demoState} />;
      case 'documentos':    return <Documentos onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} documentos={documentos} demoState={demoState} />;
      case 'epidemiologia': return <Epidemiologia onNavigate={setPage} demoState={demoState} />;
      case 'internacoes':   return <Internacoes onNavigate={setPage} demoState={demoState} />;
      case 'superlotacao':  return <Superlotacao onNavigate={setPage} demoState={demoState} />;
      case 'configuracoes': return <PageConfiguracoes onNavigate={setPage} demoState={demoState} />;
      case 'perfil':        return <PagePerfil onNavigate={setPage} onLogout={() => { localStorage.removeItem('sus_predict_token'); setAuthed(false); }} demoState={demoState} />;
      default:              return <VisaoGeral onNavigate={setPage} onGerarEtp={o => setEtpOrigem(o)} demoState={demoState} />;
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      {/* Canvas = cor da sidebar: é o que aparece nas calhas entre os cards
          (esquerda da sidebar, gap central, respiro do painel do SusBot). */}
      <div style={{ ...SEMANTIC_TOKENS, ...themeVars, minHeight: '100dvh', background: SB }}>
        <Sidebar current={page} onNav={setPage} aberta={sidebarAberta} alertasBadge={alertasBadge} demoEnabled={demoEnabled} />
        <Topbar
          municipio={municipio}
          municipios={MUNICIPIOS}
          onTrocarMunicipio={setMunicipio}
          onNavigate={setPage}
          sidebarAberta={sidebarAberta}
          onToggleSidebar={() => setSidebarAberta(v => !v)}
        />
        {/* Uma linguagem visual só: o conteúdo é sempre um card destacado do
            canvas, com o mesmo respiro do painel do SusBot. Abrir o chat mexe
            em uma propriedade só (`right`) — o card não muda de identidade, e o
            FAB flutua sobre a calha, não sobre texto rolável. */}
        <main style={{
          position: 'fixed', top: 'var(--topbar-h)', bottom: 0, background: SB,
          left: sidebarAberta ? 'var(--sb-w)' : 0,
          right: chatAberto ? 'var(--chat-inset)' : 0,
          transition: 'left .3s cubic-bezier(0.2,0.7,0.3,1), right .3s cubic-bezier(0.2,0.7,0.3,1)',
        }}>
          {/* Duas camadas de propósito: a de fora arredonda e recorta, a de
              dentro rola. Com `border-radius` e `overflow-y: auto` no MESMO
              elemento, o Firefox pinta a barra de rolagem no scrollport, que
              não é recortado pelo raio — os cantos direitos saem retos (o
              Chrome recorta a ::-webkit-scrollbar, por isso lá não aparece).
              Com o recorte em um pai `overflow: hidden`, a barra fica dentro da
              área já arredondada e os quatro cantos valem em qualquer motor. */}
          <div style={{
            height: 'calc(100% - var(--gap) * 2)',
            margin: 'var(--gap)',
            background: 'var(--content)',
            borderRadius: 18,
            border: '1px solid var(--sb-border)',
            boxShadow: '0 8px 28px rgba(26,24,20,0.12)',
            overflow: 'hidden',
          }}>
            <div style={{ height: '100%', overflowY: 'auto' }}>
              {/* Folga extra embaixo: o FAB do SusBot flutua sobre o canto
                  inferior direito do card, e sem isso o último bloco de conteúdo
                  fica embaixo dele quando a página chega ao fim da rolagem. */}
              <div style={{ padding: '28px 36px 84px', maxWidth: 1600, margin: '0 auto' }}>
                {render()}
              </div>
            </div>
          </div>
        </main>
        <GeradorEtp origem={etpOrigem} onClose={() => setEtpOrigem(null)} onSalvarDocumento={salvarDocumento} onEtpGerado={handleEtpGerado} />
        <SusBotPanel page={page} onNavigate={setPage} ibge6={municipio.ibge6} onOpenChange={setChatAberto} />
      </div>
    </ThemeContext.Provider>
  );
}
