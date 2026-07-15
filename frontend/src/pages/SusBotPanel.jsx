import { useState, useRef, useEffect } from 'react';
import { API_BASE, MIcon } from '../shared/ui.jsx';
import { conversarComSusbot, listarConversasSusbot, listarMensagensSusbot } from '../shared/susbotClient.js';
import { getSusbotPageLabel } from '../shared/susbotContract.js';

// ─── Tela 08 — Painel de Conversa do SusBot ────────────────────────────────────
//
// Dock lateral direito (não modal, não bolha) — o dashboard segue visível por
// trás. Conversas são threads discretas (não uma linha do tempo única): fechar
// o painel [x] apenas esconde, "Nova conversa" arquiva a atual no histórico e
// abre uma em branco, nada é apagado. Ver docs/telas/08-painel-susbot.md.
//
// Integrado ao backend do SusBot via SSE. O layout continua o mesmo; o que saiu
// foi o roteamento local de resposta por palavra-chave.

let idSeq = 0;
function uid(prefixo = 'm') {
  idSeq += 1;
  return `${prefixo}-${idSeq}-${Date.now().toString(36)}`;
}

const ERRO_SUSBOT_PADRAO = 'Não consegui consultar o SusBot agora. Tente novamente em instantes.';
const SUSBOT_IBGE6_PADRAO = '351300';

const SUSBOT_ROUTE_ALIASES = {
  insumos: 'insumos',
  '/insumos': 'insumos',
  estoque: 'insumos',
  estoque_farmacia: 'insumos',
  'estoque-farmacia': 'insumos',
  estoque_municipio: 'insumos',
  'estoque-municipio': 'insumos',
  'estoque_município': 'insumos',
  alertas: 'alertas',
  '/alertas': 'alertas',
  epidemiologia: 'epidemiologia',
  '/epidemiologia': 'epidemiologia',
  internacoes: 'internacoes',
  '/internacoes': 'internacoes',
  superlotacao: 'superlotacao',
  '/superlotacao': 'superlotacao',
  'visao-geral': 'visao-geral',
  '/visao-geral': 'visao-geral',
};

function getAuthHeaders() {
  const token = localStorage.getItem('sus_predict_token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizarRota(rota) {
  return String(rota || '').trim().replace(/^\/+/, '');
}

function resolverRotaSusbot(rota) {
  const normalizada = normalizarRota(rota).toLowerCase();
  if (!normalizada) return '';
  return SUSBOT_ROUTE_ALIASES[normalizada] || normalizada;
}

function normalizarIbge6(valor) {
  const ibge6 = String(valor || '').trim().slice(0, 6);
  return ibge6 || SUSBOT_IBGE6_PADRAO;
}

function criarLinkReferencia(rota, label) {
  const pagina = resolverRotaSusbot(rota);
  if (!pagina) return null;
  const texto = label && !/estoque[_-]farmacia|estoque[_-]municipio|outra tela/i.test(String(label))
    ? label
    : `ver em ${getSusbotPageLabel(pagina)} →`;
  return { label: texto, page: pagina };
}

function atualizarMensagem(thread, mensagemId, mapper) {
  return {
    ...thread,
    mensagens: thread.mensagens.map(msg => (msg.id === mensagemId ? mapper(msg) : msg)),
  };
}

function parseIsoDate(valor) {
  const data = valor ? new Date(valor) : new Date();
  return Number.isNaN(data.getTime()) ? new Date() : data;
}

function conversaParaThread(conversa, mensagens = []) {
  return {
    id: conversa.id,
    conversaId: conversa.id,
    titulo: conversa.titulo || '',
    criadaEm: parseIsoDate(conversa.criada_em),
    mensagens,
  };
}

function mensagemBancoParaMensagens(row, pageFallback = 'visao-geral') {
  const momento = parseIsoDate(row.criado_em);
  return [
    {
      id: `${row.id}-user`,
      autor: 'user',
      texto: row.pergunta,
      page: row.tela_origem || pageFallback,
      ts: momento,
    },
    {
      id: `${row.id}-bot`,
      autor: 'bot',
      texto: row.resposta,
      link: criarLinkReferencia(row.referencia_rota),
      ts: momento,
    },
  ];
}

function montarThreadPersistida(conversa, mensagens = [], pageFallback = 'visao-geral') {
  return conversaParaThread(
    conversa,
    mensagens
      .slice()
      .reverse()
      .flatMap(row => mensagemBancoParaMensagens(row, pageFallback)),
  );
}

// ─── Markdown mínimo: **negrito** e listas "- item" ────────────────────────────

function renderInline(texto, keyBase) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith('**') && seg.endsWith('**')
      ? <strong key={`${keyBase}-${i}`} style={{ fontWeight: 700 }}>{seg.slice(2, -2)}</strong>
      : <span key={`${keyBase}-${i}`}>{seg}</span>
  );
}

function renderMd(texto) {
  const linhas = texto.split('\n');
  const blocos = [];
  let listaAtual = [];

  function flushLista(key) {
    if (!listaAtual.length) return;
    blocos.push(
      <ul key={key} style={{ margin: '2px 0 6px 16px', padding: 0 }}>
        {listaAtual.map((item, j) => (
          <li key={j} style={{ marginBottom: 2 }}>{renderInline(item, `${key}-${j}`)}</li>
        ))}
      </ul>
    );
    listaAtual = [];
  }

  linhas.forEach((linha, i) => {
    const t = linha.trim();
    if (t.startsWith('- ')) {
      listaAtual.push(t.slice(2));
      return;
    }
    flushLista(`ul-${i}`);
    if (t) blocos.push(<p key={`p-${i}`} style={{ margin: '0 0 4px' }}>{renderInline(t, `p-${i}`)}</p>);
  });
  flushLista('ul-end');
  return blocos;
}

// ─── Data relativa ("há 2 dias") ───────────────────────────────────────────────

function formatRelativo(data) {
  const diffMs = Date.now() - data.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'agora mesmo';
  if (diffMin < 60) return `há ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'há 1 dia';
  if (diffD < 30) return `há ${diffD} dias`;
  const diffMes = Math.floor(diffD / 30);
  return diffMes <= 1 ? 'há 1 mês' : `há ${diffMes} meses`;
}

function tituloDe(thread) {
  if (thread.titulo) return thread.titulo;
  const primeira = thread.mensagens.find(m => m.autor === 'user');
  if (!primeira) return 'Nova conversa';
  return primeira.texto.length > 48 ? `${primeira.texto.slice(0, 48)}…` : primeira.texto;
}

function criarThreadVazia() {
  return { id: uid('t'), criadaEm: new Date(), conversaId: null, titulo: '', mensagens: [] };
}

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function SusBotAvatar({ size = 28 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white',
    }}>
      <MIcon m="smart_toy" size={size * 0.6} />
    </span>
  );
}

function TypingIndicator({ etapa }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <SusBotAvatar size={24} />
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px',
        background: 'var(--subtle)', borderRadius: '12px 12px 12px 4px',
      }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{
              width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-300)',
              animation: `dot-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
            }} />
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--ink-400)' }}>{etapa}</span>
      </div>
    </div>
  );
}

function EstadoPainel({ icone, titulo, texto, acao, tom = 'neutral' }) {
  const cor = tom === 'danger' ? 'var(--bad, #8A2A38)' : 'var(--ink-400)';

  return (
    <div style={{
      textAlign: 'center', padding: '28px 14px', color: cor,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <span style={{ display: 'flex', color: cor, opacity: tom === 'neutral' ? 0.65 : 1 }}>
        <MIcon m={icone} size={28} />
      </span>
      <div style={{ maxWidth: 260 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: tom === 'danger' ? cor : 'var(--ink-700)' }}>
          {titulo}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.5, color: tom === 'danger' ? cor : 'var(--ink-400)' }}>
          {texto}
        </p>
      </div>
      {acao}
    </div>
  );
}

function Bolha({ msg, onNavigate }) {
  const isUser = msg.autor === 'user';
  const isErro = msg.autor === 'error';
  const isStreaming = msg.autor === 'bot' && msg.streaming && !msg.texto;

  if (isErro) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <SusBotAvatar size={24} />
        <div style={{
          maxWidth: '84%', padding: '9px 13px', fontSize: 13, lineHeight: 1.55,
          borderRadius: '12px 12px 12px 4px', background: 'color-mix(in srgb, var(--bad, #8A2A38) 10%, var(--elev))',
          border: '1px solid color-mix(in srgb, var(--bad, #8A2A38) 30%, transparent)', color: 'var(--ink-700)',
          overflowWrap: 'anywhere',
        }}>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700, color: 'var(--bad, #8A2A38)' }}>
            <MIcon m="error" size={14} /> Algo deu errado
          </p>
          <p style={{ margin: '4px 0 8px' }}>{msg.texto}</p>
          <button
            onClick={() => msg.onRetry?.(msg.perguntaOriginal)}
            style={{
              fontSize: 11.5, fontWeight: 700, color: 'var(--bad, #8A2A38)', background: 'none',
              border: '1px solid color-mix(in srgb, var(--bad, #8A2A38) 40%, transparent)', borderRadius: 7,
              padding: '4px 10px', cursor: 'pointer',
            }}
          >
            tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <SusBotAvatar size={24} />}
      <div style={{
        maxWidth: '84%', padding: '9px 13px', fontSize: 13.5, lineHeight: 1.55,
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        background: isUser ? 'var(--primary-soft)' : 'var(--subtle)',
        border: isUser ? '1px solid var(--primary-soft-border)' : '1px solid transparent',
        color: 'var(--ink-900)',
        overflowWrap: 'anywhere',
      }}>
        {isUser ? (
          <p style={{ margin: 0 }}>{msg.texto}</p>
        ) : isStreaming ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink-400)' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span
                  key={i}
                  style={{
                    width: 5, height: 5, borderRadius: '50%', background: 'var(--ink-300)',
                    animation: `dot-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: 11.5 }}>{msg.status || 'digitando...'}</span>
          </div>
        ) : (
          renderMd(msg.texto)
        )}
        {isUser && (
          <p style={{
            margin: '5px 0 0', fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5,
            color: 'var(--ink-400)', textAlign: 'right',
          }}>
            · enviado em {getSusbotPageLabel(msg.page)}
          </p>
        )}
        {!isUser && msg.link && (
          <button
            onClick={() => onNavigate?.(msg.link.page)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 8, padding: 0,
              background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              color: 'var(--primary)',
            }}
          >
            {msg.link.label}
          </button>
        )}
      </div>
    </div>
  );
}

function ItemHistorico({ thread, onAbrir }) {
  const titulo = tituloDe(thread);
  return (
    <div
      onClick={() => onAbrir(thread.id)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(thread.id); } }}
      style={{
        padding: '12px 4px', borderBottom: '1px solid var(--ink-50)', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{titulo}</p>
      <p style={{ margin: 0, fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5, color: 'var(--ink-400)' }}>
        {formatRelativo(thread.criadaEm)}
      </p>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function SusBotPanel({ page = 'visao-geral', onNavigate, ibge6 }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'history'
  const [threads, setThreads] = useState([]);
  const [current, setCurrent] = useState(() => criarThreadVazia());
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [erroHistorico, setErroHistorico] = useState('');
  const [carregandoConversaId, setCarregandoConversaId] = useState(null);
  const [erroConversa, setErroConversa] = useState('');

  const fimRef = useRef(null);
  const inputRef = useRef(null);
  const conversaLoadSeq = useRef(0);
  const ibge6Atual = normalizarIbge6(ibge6);

  useEffect(() => {
    if (viewMode === 'chat') fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [current.mensagens, enviando, viewMode]);

  useEffect(() => {
    if (open && viewMode === 'chat') inputRef.current?.focus();
  }, [open, viewMode, current.id]);

  useEffect(() => {
    if (!open || viewMode !== 'chat') return;
    const el = inputRef.current;
    if (!el) return;

    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input, open, viewMode]);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = e => {
      if (e.key === 'Escape' && !enviando) setOpen(false);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, enviando]);

  useEffect(() => {
    if (!open) return;

    let cancelado = false;

    async function carregarHistorico() {
      setCarregandoHistorico(true);
      setErroHistorico('');
      try {
        const data = await listarConversasSusbot({
          baseUrl: API_BASE,
          headers: getAuthHeaders(),
          page: 1,
          pageSize: 100,
        });

        if (cancelado) return;

        const itens = Array.isArray(data?.itens) ? data.itens : [];
        setThreads(
          itens.map(conversa => conversaParaThread(conversa)),
        );
      } catch (error) {
        if (cancelado) return;
        setErroHistorico(error?.message || 'Não foi possível carregar o histórico.');
      } finally {
        if (!cancelado) setCarregandoHistorico(false);
      }
    }

    void carregarHistorico();

    return () => {
      cancelado = true;
    };
  }, [open]);

  async function recarregarHistoricoSilencioso() {
    try {
      setErroHistorico('');
      const data = await listarConversasSusbot({
        baseUrl: API_BASE,
        headers: getAuthHeaders(),
        page: 1,
        pageSize: 100,
      });
      const itens = Array.isArray(data?.itens) ? data.itens : [];
      setThreads(itens.map(conversa => conversaParaThread(conversa)));
    } catch {
      // Não interrompe o fluxo principal do chat.
    }
  }

  async function carregarConversa(conversa) {
    const seq = ++conversaLoadSeq.current;
    setCarregandoConversaId(conversa.id);
    setErroConversa('');
    setCurrent(conversa);

    try {
      const data = await listarMensagensSusbot({
        conversaId: conversa.id,
        baseUrl: API_BASE,
        headers: getAuthHeaders(),
        page: 1,
        pageSize: 100,
      });

      if (conversaLoadSeq.current !== seq) return;

      const mensagensBanco = Array.isArray(data?.itens) ? data.itens : [];
      setCurrent(montarThreadPersistida(conversa, mensagensBanco, page));
    } catch (error) {
      if (conversaLoadSeq.current !== seq) return;
      setErroConversa(error?.message || 'Não foi possível carregar esta conversa.');
      setCurrent(conversa);
    } finally {
      if (conversaLoadSeq.current === seq) {
        setCarregandoConversaId(null);
      }
    }
  }

  function atualizarMensagemAtual(mensagemId, mapper) {
    setCurrent(c => atualizarMensagem(c, mensagemId, mapper));
  }

  async function enviar(textoForcado) {
    const pergunta = (textoForcado ?? input).trim();
    if (!pergunta || enviando) return;
    setInput('');

    const conversaIdAtual = current.conversaId || null;
    const agora = new Date();
    const mensagemUsuario = { id: uid(), autor: 'user', texto: pergunta, page, ts: agora };
    const idResposta = uid();

    setCurrent(c => ({
      ...c,
      criadaEm: c.criadaEm || agora,
      mensagens: [
        ...c.mensagens,
        mensagemUsuario,
        { id: idResposta, autor: 'bot', texto: '', status: 'Planejando resposta', streaming: true, ts: new Date() },
      ],
    }));

    setEnviando(true);
    setEtapa('digitando...');
    setErroConversa('');

    try {
      const resp = await conversarComSusbot({
        pergunta,
        telaAtual: page,
        tela_atual: page,
        tela_origem: page,
        conversaId: conversaIdAtual || undefined,
        ibge6: ibge6Atual,
        baseUrl: API_BASE,
        headers: getAuthHeaders(),
        onStatus: status => {
          const mensagem = typeof status === 'string' ? status : status?.mensagem;
          if (mensagem) setEtapa(mensagem);
          const conversaId = typeof status === 'object' ? status?.conversa_id : null;
          if (conversaId) {
            setCurrent(c => ({ ...c, conversaId }));
          }
          atualizarMensagemAtual(idResposta, msg => ({
            ...msg,
            status: mensagem || msg.status,
          }));
        },
        onToken: tokenParcial => {
          atualizarMensagemAtual(idResposta, msg => ({
            ...msg,
            texto: `${msg.texto || ''}${tokenParcial}`,
            status: msg.status || 'digitando...',
            streaming: true,
          }));
        },
        onReferencia: (rota, dadosReferencia) => {
          atualizarMensagemAtual(idResposta, msg => ({
            ...msg,
            link: criarLinkReferencia(rota, dadosReferencia?.label) || msg.link,
          }));
        },
      });

      if (resp.conversaId) {
        setCurrent(c => ({ ...c, conversaId: resp.conversaId }));
      }

      atualizarMensagemAtual(idResposta, msg => ({
        ...msg,
        texto: resp.resposta || msg.texto,
        streaming: false,
        status: undefined,
        link: criarLinkReferencia(resp.referenciaRota, resp.referenciaLabel) || msg.link || null,
      }));
      void recarregarHistoricoSilencioso();
    } catch (error) {
      atualizarMensagemAtual(idResposta, () => ({
        id: uid(),
        autor: 'error',
        texto: error?.message?.includes('401') || /token|autentic|login/i.test(String(error?.message || ''))
          ? 'Não consegui autenticar no SusBot. Entre novamente com uma conta válida.'
          : ERRO_SUSBOT_PADRAO,
        perguntaOriginal: pergunta,
        onRetry: enviar,
        ts: new Date(),
      }));
    } finally {
      setEnviando(false);
      setEtapa('');
    }
  }

  function novaConversa() {
    if (enviando) return;
    setCurrent(criarThreadVazia());
    setErroConversa('');
    setViewMode('chat');
  }

  function abrirThread(threadId) {
    if (enviando) return;
    const alvo = threads.find(t => t.id === threadId);
    if (!alvo) return;
    setViewMode('chat');
    void carregarConversa(alvo);
  }

  const semMensagens = current.mensagens.length === 0;
  const carregandoConversaAtual = carregandoConversaId != null && carregandoConversaId === current.conversaId;

  return (
    <>
      <style>{`
        @keyframes susbotPanelIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .susbot-panel-shell {
          width: min(420px, calc(100vw - 16px));
          border-radius: 18px 0 0 18px;
          overflow: hidden;
        }

        .susbot-panel-body {
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .susbot-panel-fab {
          bottom: 24px;
          right: 24px;
        }

        @media (max-width: 720px) {
          .susbot-panel-shell {
            width: calc(100vw - 12px);
            top: 6px !important;
            right: 6px !important;
            bottom: 6px !important;
            border-radius: 18px;
          }

          .susbot-panel-fab {
            bottom: 16px;
            right: 16px;
          }
        }
      `}</style>

      {/* Dock lateral — sempre montado, translada para fora quando fechado */}
      <div
        aria-hidden={!open}
        role="dialog"
        aria-label="Painel do SusBot"
        className="susbot-panel-shell"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          background: 'var(--elev)', borderLeft: '1px solid var(--ink-100)',
          boxShadow: open ? '-10px 0 32px rgba(26,24,20,0.14)' : 'none',
          zIndex: 55, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform .3s cubic-bezier(0.2,0.7,0.3,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--ink-100)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          {viewMode === 'history' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => setViewMode('chat')}
                title="Voltar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', display: 'flex' }}
              >
                <MIcon m="arrow_back" size={19} />
              </button>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'Inter Tight, sans-serif' }}>
                Histórico
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SusBotAvatar size={32} />
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.1, fontFamily: 'Inter Tight, sans-serif' }}>
                  SusBot
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--ink-400)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--good)', animation: 'dot-pulse 2.4s ease-in-out infinite' }} />
                  assistente do SusPredict
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {viewMode === 'chat' && (
              <>
                <button
                  onClick={() => setViewMode('history')}
                  title="Histórico de conversas"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', display: 'flex', padding: 6, borderRadius: 8 }}
                >
                  <MIcon m="schedule" size={19} />
                </button>
                <button
                  onClick={novaConversa}
                  title="Nova conversa"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', display: 'flex', padding: 6, borderRadius: 8 }}
                >
                  <MIcon m="add" size={19} />
                </button>
              </>
            )}
            <button
              onClick={() => setOpen(false)}
              title="Fechar (a conversa continua salva)"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', display: 'flex', padding: 6, borderRadius: 8 }}
            >
              <MIcon m="close" size={19} />
            </button>
          </div>
        </div>

        {/* Corpo — histórico ou conversa */}
        {viewMode === 'history' ? (
          <div className="susbot-panel-body" style={{ flex: 1, padding: '4px 16px' }}>
            {carregandoHistorico ? (
              <EstadoPainel
                icone="hourglass_empty"
                titulo="Carregando histórico"
                texto="Buscando suas conversas salvas."
              />
            ) : erroHistorico ? (
              <EstadoPainel
                icone="error"
                titulo="Não foi possível carregar o histórico"
                texto={erroHistorico}
                tom="danger"
                acao={(
                  <button
                    onClick={() => void recarregarHistoricoSilencioso()}
                    style={{
                      border: '1px solid color-mix(in srgb, var(--bad, #8A2A38) 22%, var(--ink-100))',
                      background: 'var(--canvas)', borderRadius: 999, padding: '7px 12px', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, color: 'var(--bad, #8A2A38)',
                    }}
                  >
                    tentar novamente
                  </button>
                )}
              />
            ) : threads.length === 0 ? (
              <EstadoPainel
                icone="forum"
                titulo="Nenhuma conversa ainda"
                texto="Quando você fizer a primeira pergunta, ela aparece aqui no histórico."
              />
            ) : (
              threads.map(t => <ItemHistorico key={t.id} thread={t} onAbrir={abrirThread} />)
            )}
          </div>
        ) : (
          <>
            <div className="susbot-panel-body" style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {carregandoConversaAtual ? (
                <EstadoPainel
                  icone="hourglass_empty"
                  titulo="Carregando conversa"
                  texto="Aguarde alguns instantes enquanto recuperamos as mensagens."
                />
              ) : erroConversa ? (
                <EstadoPainel
                  icone="error"
                  titulo="Não foi possível abrir esta conversa"
                  texto={erroConversa}
                  tom="danger"
                />
              ) : semMensagens && !enviando && (
                <EstadoPainel
                  icone="forum"
                  titulo="Comece uma conversa"
                  texto="Pergunte sobre a tela atual ou sobre um dado que apareceu no dashboard."
                />
              )}

              {current.mensagens.map(m => (
                <Bolha key={m.id} msg={m} onNavigate={onNavigate} />
              ))}
              <div ref={fimRef} />
            </div>

            {/* Input */}
            <div style={{ padding: 12, borderTop: '1px solid var(--ink-100)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <textarea
                  ref={inputRef}
                  value={input}
                  rows={1}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                  placeholder="Pergunte ao SusBot..."
                  style={{
                    flex: 1, fontSize: 13, padding: '10px 14px', borderRadius: 18,
                    border: '1px solid var(--ink-100)', color: 'var(--ink-900)', outline: 'none',
                    background: 'var(--canvas)', resize: 'none', overflow: 'hidden', lineHeight: 1.45,
                    minHeight: 42, maxHeight: 120,
                  }}
                />
                <button
                  onClick={() => enviar()}
                  disabled={!input.trim() || enviando}
                  title="Enviar"
                  style={{
                    width: 36, height: 36, borderRadius: '50%', border: 'none', flexShrink: 0,
                    cursor: input.trim() && !enviando ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: input.trim() && !enviando ? 'var(--primary)' : 'var(--ink-100)',
                    color: input.trim() && !enviando ? 'white' : 'var(--ink-400)',
                    transition: 'background .15s',
                  }}
                >
                  <MIcon m="send" size={17} />
                </button>
              </div>
              <p style={{ fontSize: 9.5, color: 'var(--ink-300)', marginTop: 7, textAlign: 'center' }}>
                SusBot pode cometer erros · respostas via backend em tempo real
              </p>
            </div>
          </>
        )}
      </div>

      {/* Ícone flutuante — abre o painel; some quando já está aberto (o [x] do
          cabeçalho assume o papel de fechar) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="SusBot — assistente"
          className="susbot-panel-fab"
          style={{
            position: 'fixed', width: 56, height: 56, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 22px rgba(27,94,110,0.35)', zIndex: 50, transition: 'transform 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
          <span style={{ color: 'white', display: 'flex' }}>
            <MIcon m="smart_toy" size={26} />
          </span>
        </button>
      )}
    </>
  );
}

export default SusBotPanel;
