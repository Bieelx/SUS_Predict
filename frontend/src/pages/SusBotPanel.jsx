import { useState, useRef, useEffect } from 'react';
import { API_BASE, MIcon } from '../shared/ui.jsx';
import { conversarComSusbot, listarConversasSusbot, listarMensagensSusbot } from '../shared/susbotClient.js';
import { getSusbotPageLabel } from '../shared/susbotContract.js';
import { apiFetch } from '../shared/authClient.js';

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

const SUGESTOES = [
  'Qual é o alerta mais urgente hoje?',
  'Quais insumos rompem estoque nos próximos 30 dias?',
  'Como está a tendência de dengue no município?',
];

const ERRO_SUSBOT_PADRAO ='Não consegui consultar o SusBot agora. Tente novamente em instantes.';
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

// Marca do bot: monograma tipográfico, não avatar de robô. O produto fala em
// vozes editoriais (mono para meta, Inter Tight para título) — o assistente segue a
// mesma gramática em vez do vocabulário genérico de chatbot.
function SusBotMark({ size = 30 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3),
      background: 'var(--primary)', color: '#fff', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'var(--ff-mono, monospace)', fontWeight: 700,
      fontSize: size * 0.38, letterSpacing: '0.02em',
    }}>
      SB
    </span>
  );
}

// Cursor de digitação em vez dos três pontinhos.
function Cursor() {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 14, marginLeft: 1,
      transform: 'translateY(2px)', background: 'var(--primary)',
      animation: 'susbot-caret 1s steps(1) infinite',
    }} />
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
        <p style={{ margin: '6px 0 0', fontSize: 13, lineHeight: 1.5, color: tom === 'danger' ? cor : 'var(--ink-400)' }}>
          {texto}
        </p>
      </div>
      {acao}
    </div>
  );
}

const ROTULO_META = {
  margin: 0, fontFamily: 'var(--ff-mono, monospace)', fontSize: 11,
  letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-400)',
};

// A resposta do bot não é balão: é um bloco de texto com régua lateral — o
// mesmo idioma do card de insight na Visão Geral. A pergunta do usuário é um
// bloco alinhado à direita, sem rabinho.
function Bolha({ msg, onNavigate }) {
  const isUser = msg.autor === 'user';
  const isErro = msg.autor === 'error';
  const isStreaming = msg.autor === 'bot' && msg.streaming;

  if (isUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div style={{
          maxWidth: '88%', padding: '9px 13px', borderRadius: 12,
          background: 'var(--subtle)', border: '1px solid var(--ink-100)',
          fontSize: 13, lineHeight: 1.55, color: 'var(--ink-900)', overflowWrap: 'anywhere',
        }}>
          {msg.texto}
        </div>
        <p style={{ ...ROTULO_META, paddingRight: 2 }}>{getSusbotPageLabel(msg.page)}</p>
      </div>
    );
  }

  const cor = isErro ? 'var(--bad, #8A2A38)' : 'var(--accent)';

  return (
    <div style={{ borderLeft: `2px solid ${cor}`, paddingLeft: 13 }}>
      <p style={{ ...ROTULO_META, display: 'flex', alignItems: 'center', gap: 5, color: isErro ? cor : 'var(--ink-400)' }}>
        {isErro && <MIcon m="error" size={12} />}
        {isErro ? 'não foi possível responder' : 'SusBot'}
      </p>
      <div style={{
        marginTop: 5, fontSize: 13, lineHeight: 1.6,
        color: 'var(--ink-700)', overflowWrap: 'anywhere',
      }}>
        {isErro ? <p style={{ margin: 0 }}>{msg.texto}</p> : renderMd(msg.texto)}
        {isStreaming && <Cursor />}
      </div>

      {isStreaming && msg.status && (
        <p style={{ ...ROTULO_META, marginTop: 6 }}>{msg.status}</p>
      )}

      {isErro && (
        <button
          onClick={() => msg.onRetry?.(msg.perguntaOriginal)}
          style={{
            marginTop: 8, fontSize: 11, fontWeight: 700, color: cor, background: 'none',
            border: `1px solid color-mix(in srgb, ${cor} 40%, transparent)`, borderRadius: 8,
            padding: '4px 10px', cursor: 'pointer',
          }}
        >
          tentar novamente
        </button>
      )}

      {!isErro && msg.link && (
        <button
          onClick={() => onNavigate?.(msg.link.page)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, padding: '5px 11px',
            background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)',
            borderRadius: 999, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--primary)',
          }}
        >
          {msg.link.label}
        </button>
      )}
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
      <p style={{ margin: 0, fontFamily: 'var(--ff-mono, monospace)', fontSize: 11, color: 'var(--ink-400)' }}>
        {formatRelativo(thread.criadaEm)}
      </p>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function SusBotPanel({ page = 'visao-geral', onNavigate, ibge6, onOpenChange }) {
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
  const painelRef = useRef(null);

  // O painel fica montado o tempo todo (translada para fora quando fechado), então
  // precisa sair da árvore de foco ao fechar. `inert` faz as duas coisas: esconde
  // do leitor de tela e impede foco — com aria-hidden sozinho, o [x] que acabou de
  // ser clicado continuava focado dentro de uma subárvore escondida.
  useEffect(() => {
    if (painelRef.current) painelRef.current.inert = !open;
  }, [open]);
  const conversaLoadSeq = useRef(0);
  const ibge6Atual = normalizarIbge6(ibge6);

  useEffect(() => {
    if (viewMode === 'chat') fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [current.mensagens, enviando, viewMode]);

  // Avisa o shell para encolher o conteúdo principal — o painel é um card ao
  // lado do conteúdo, não uma camada sobre ele.
  useEffect(() => { onOpenChange?.(open); }, [open, onOpenChange]);

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
          fetchImpl: apiFetch,
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
        fetchImpl: apiFetch,
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
        fetchImpl: apiFetch,
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
        fetchImpl: apiFetch,
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
        @keyframes susbot-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
        @keyframes susbot-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .susbot-msg { animation: susbot-msg-in .22s cubic-bezier(0.2,0.7,0.3,1) both; }

        .susbot-composer {
          border: 1px solid var(--ink-100);
          border-radius: 14px;
          background: var(--canvas);
          transition: border-color .15s, box-shadow .15s;
        }
        .susbot-composer:focus-within {
          border-color: var(--primary-soft-border);
          box-shadow: 0 0 0 3px var(--primary-soft);
        }

        .susbot-chip {
          text-align: left;
          padding: 9px 12px;
          border: 1px solid var(--ink-100);
          border-radius: 10px;
          background: var(--elev);
          color: var(--ink-700);
          font-size: 12.5;
          line-height: 1.45;
          cursor: pointer;
          transition: border-color .15s, background .15s;
        }
        .susbot-chip:hover { border-color: var(--primary-soft-border); background: var(--primary-soft); }

        .susbot-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--ink-500);
          display: flex; padding: 6px; border-radius: 8; border-radius: 8px;
          transition: background .15s, color .15s;
        }
        .susbot-icon-btn:hover { background: var(--subtle); color: var(--ink-900); }

        .susbot-panel-shell {
          width: min(var(--chat-w), calc(100vw - var(--gap)));
          border-radius: 18px;
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
        .susbot-panel-fab:hover { background: var(--primary-dark); }

        @media (max-width: 720px) {
          .susbot-panel-shell {
            width: calc(100vw - 12px);
            top: 66px !important;
            right: 6px !important;
            bottom: 6px !important;
          }

          .susbot-panel-fab {
            bottom: 16px;
            right: 16px;
          }
        }
      `}</style>

      {/* Dock lateral — sempre montado, translada para fora quando fechado */}
      <div
        ref={painelRef}
        role="dialog"
        aria-label="Painel do SusBot"
        className="susbot-panel-shell"
        style={{
          // Card destacado: afastado de todas as bordas, na mesma caixa visual
          // do card de conteúdo (topbar + respiro no topo, respiro nas demais).
          position: 'fixed', top: 'calc(var(--topbar-h) + var(--gap))', right: 'var(--gap)', bottom: 'var(--gap)',
          background: 'var(--content)', border: '1px solid var(--sb-border)',
          boxShadow: open ? '0 8px 28px rgba(26,24,20,0.12)' : 'none',
          zIndex: 55, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0)' : 'translateX(calc(100% + 16px))',
          transition: 'transform .3s cubic-bezier(0.2,0.7,0.3,1)',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Cabeçalho */}
        <div style={{
          padding: '13px 14px 13px 16px', borderBottom: '1px solid var(--ink-100)', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          {viewMode === 'history' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setViewMode('chat')} title="Voltar" className="susbot-icon-btn">
                <MIcon m="arrow_back" size={19} />
              </button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'var(--ff-tight)' }}>
                Conversas
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SusBotMark size={30} />
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.15, fontFamily: 'var(--ff-tight)' }}>
                  SusBot
                </p>
                <p style={{ ...ROTULO_META, marginTop: 2 }}>
                  {getSusbotPageLabel(page)}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {viewMode === 'chat' && (
              <>
                <button onClick={() => setViewMode('history')} title="Conversas anteriores" className="susbot-icon-btn">
                  <MIcon m="history" size={19} />
                </button>
                <button onClick={novaConversa} title="Nova conversa" className="susbot-icon-btn">
                  <MIcon m="edit_square" size={19} />
                </button>
              </>
            )}
            <button onClick={() => setOpen(false)} title="Fechar (a conversa continua salva)" className="susbot-icon-btn">
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
                      fontSize: 13, fontWeight: 700, color: 'var(--bad, #8A2A38)',
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
                <div style={{ paddingTop: 10 }}>
                  <p style={{
                    margin: 0, fontFamily: 'var(--ff-tight)', fontWeight: 800,
                    fontSize: 20, letterSpacing: '-0.02em', lineHeight: 1.2, color: 'var(--ink-900)',
                  }}>
                    O que você precisa decidir agora?
                  </p>
                  <p style={{ margin: '8px 0 18px', fontSize: 13, lineHeight: 1.5, color: 'var(--ink-400)' }}>
                    Pergunte sobre {getSusbotPageLabel(page)} ou sobre qualquer dado do município.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {SUGESTOES.map(s => (
                      <button key={s} className="susbot-chip" onClick={() => void enviar(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {current.mensagens.map(m => (
                <div key={m.id} className="susbot-msg">
                  <Bolha msg={m} onNavigate={onNavigate} />
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px 12px', flexShrink: 0 }}>
              <div className="susbot-composer" style={{ padding: '10px 10px 8px 12px' }}>
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
                  placeholder="Pergunte sobre este município…"
                  style={{
                    width: '100%', fontSize: 13, border: 'none', outline: 'none', padding: 0,
                    color: 'var(--ink-900)', background: 'transparent', resize: 'none',
                    overflow: 'hidden', lineHeight: 1.5, minHeight: 22, maxHeight: 120,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <p style={{ ...ROTULO_META, color: 'var(--ink-300)' }}>
                    enter envia · shift+enter quebra linha
                  </p>
                  <button
                    onClick={() => enviar()}
                    disabled={!input.trim() || enviando}
                    title="Enviar"
                    style={{
                      width: 30, height: 30, borderRadius: 9, border: 'none', flexShrink: 0,
                      cursor: input.trim() && !enviando ? 'pointer' : 'default',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: input.trim() && !enviando ? 'var(--primary)' : 'var(--ink-100)',
                      color: input.trim() && !enviando ? 'white' : 'var(--ink-300)',
                      transition: 'background .15s',
                    }}
                  >
                    <MIcon m="arrow_upward" size={17} />
                  </button>
                </div>
              </div>
              <p style={{ ...ROTULO_META, color: 'var(--ink-300)', marginTop: 8, textAlign: 'center' }}>
                respostas geradas · confira antes de decidir
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
            position: 'fixed', width: 48, height: 48, borderRadius: '50%',
            background: 'var(--primary)', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', zIndex: 50,
            boxShadow: '0 2px 10px rgba(26,24,20,0.14)',
            transition: 'background .15s',
          }}
        >
          <MIcon m="chat_bubble" size={20} />
        </button>
      )}
    </>
  );
}

export default SusBotPanel;
