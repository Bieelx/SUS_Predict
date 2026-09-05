import { useState, useRef, useEffect } from 'react';
import QRCode from 'react-qr-code';
import { API_BASE, MIcon } from '../shared/ui.jsx';
import {
  cancelarPareamentoCanalSusbot,
  confirmarPareamentoCanalSusbot,
  consultarPareamentoCanalSusbot,
  conversarComSusbot,
  criarPareamentoCanalSusbot,
  listarCanaisSusbot,
  listarConversasSusbot,
  listarMensagensSusbot,
  revogarCanalSusbot,
} from '../shared/susbotClient.js';
import { getSusbotPageLabel } from '../shared/susbotContract.js';

// ─── Tela 08 — Painel de Conversa da Clara ────────────────────────────────────
//
// Dock lateral direito (não modal, não bolha) — o dashboard segue visível por
// trás. Conversas são threads discretas (não uma linha do tempo única): fechar
// o painel [x] apenas esconde, "Nova conversa" arquiva a atual no histórico e
// abre uma em branco, nada é apagado. Ver docs/telas/08-painel-clara.md.
//
// Integrado ao backend da Clara via SSE. O layout continua o mesmo; o que saiu
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

const ERRO_SUSBOT_PADRAO ='Não consegui consultar a Clara agora. Tente novamente em instantes.';
const SUSBOT_IBGE6_PADRAO = '351300';

function mensagemErroSusbot(error) {
  const detalhe = String(error?.detail || error?.responseText || error?.message || '');
  if (/chave da clara inv[aá]lida/i.test(detalhe)) {
    if (error?.proxyApiKeyInjected === false) {
      return 'O proxy local não enviou a chave da Clara. Configure SUSBOT_API_KEY no .env.local e reinicie o frontend.';
    }
    if (error?.proxyApiKeyInjected === true) {
      return 'O servidor rejeitou a chave enviada pelo proxy. Confirme se SUSBOT_API_KEY corresponde a uma chave ativa no backend e reinicie o frontend.';
    }
    return 'O servidor não aceitou a chave da Clara. Verifique a configuração de acesso do ambiente.';
  }
  if (error?.status === 429 || /limite da clara/i.test(detalhe)) {
    return 'O limite de consultas deste acesso foi atingido. Aguarde um minuto e tente novamente.';
  }
  if (/token ausente|token inv[aá]lido|token expirado|usu[aá]rio autenticado inv[aá]lido/i.test(detalhe)) {
    return 'Sua sessão expirou ou não é válida. Entre novamente com sua conta.';
  }
  return ERRO_SUSBOT_PADRAO;
}

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
    atualizadaEm: parseIsoDate(conversa.atualizada_em || conversa.criada_em),
    canal: conversa.canal === 'telegram' ? 'telegram' : 'app',
    totalMensagens: Number(conversa.total_mensagens || 0),
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
function ClaraMark({ size = 30 }) {
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
function ArtefatoView({ artefato }) {
  if (!artefato) return null;

  if (artefato.tipo === 'tabela') {
    if (!artefato.linhas?.length) return null;
    return (
      <div style={{ marginTop: 10, border: '1px solid var(--ink-100)', borderRadius: 10, overflow: 'hidden' }}>
        <p style={{
          margin: 0, padding: '6px 10px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: '0.05em', color: 'var(--ink-400)', background: 'var(--subtle)',
        }}>
          {artefato.titulo}
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {artefato.colunas.map(col => (
                  <th key={col} style={{
                    textAlign: 'left', padding: '6px 10px', color: 'var(--ink-500)',
                    fontWeight: 700, borderBottom: '1px solid var(--ink-100)', whiteSpace: 'nowrap',
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {artefato.linhas.map((linha, i) => (
                <tr key={i}>
                  {artefato.colunas.map(col => (
                    <td key={col} style={{ padding: '6px 10px', borderTop: '1px solid var(--ink-50)', color: 'var(--ink-700)', whiteSpace: 'nowrap' }}>
                      {String(linha[col] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {artefato.evidencia && (
          <div style={{ padding: '9px 10px', borderTop: '1px solid var(--ink-100)', background: 'var(--subtle)' }}>
            <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--ink-500)' }}>
              <strong style={{ color: 'var(--ink-700)' }}>Fonte:</strong> {artefato.evidencia.fonte}
            </p>
            {!!artefato.evidencia.competencias?.length && (
              <p style={{ margin: '2px 0 0', fontSize: 11, lineHeight: 1.5, color: 'var(--ink-500)' }}>
                <strong style={{ color: 'var(--ink-700)' }}>Competência:</strong>{' '}
                {Array.from(new Set(artefato.evidencia.competencias)).join(', ')}
              </p>
            )}
            <p style={{ margin: '2px 0 0', fontSize: 11, lineHeight: 1.5, color: 'var(--warn)' }}>
              <strong>Limitação:</strong> {artefato.evidencia.limitacao}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (artefato.tipo === 'resumo') {
    const entradas = Object.entries(artefato.campos || {});
    if (!entradas.length) return null;
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ margin: '0 0 6px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
          {artefato.titulo}
        </p>
        <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(entradas.length, 3)}, 1fr)`, gap: 8 }}>
          {entradas.map(([chave, valor]) => (
            <div key={chave} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--subtle)', border: '1px solid var(--ink-100)' }}>
              <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
                {chave.replace(/_/g, ' ')}
              </p>
              <p style={{ margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, color: 'var(--ink-900)' }}>
                {String(valor)}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (artefato.tipo === 'etp') {
    return (
      <div style={{
        marginTop: 10, padding: '10px 12px', borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--good) 22%, transparent)',
        background: 'color-mix(in srgb, var(--good) 6%, white)',
      }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: 'var(--good)' }}>{artefato.titulo}</p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--ink-700)', lineHeight: 1.5 }}>{artefato.justificativa}</p>
      </div>
    );
  }

  return null;
}

function ConfirmacaoAcao({ msg, onConfirmar, onCancelar }) {
  const confirmacao = msg.confirmacao;
  if (!confirmacao) return null;
  const item = String(confirmacao.argumentos?.item || '').trim();
  const geracaoEtp = confirmacao.ferramenta === 'gerar_etp';
  const titulo = geracaoEtp ? 'Confirmação para gerar rascunho de ETP' : 'Confirmação de ação';
  const rotuloConfirmar = geracaoEtp ? 'Confirmar geração do rascunho' : 'Confirmar ação';

  return (
    <div role="group" aria-label={titulo} aria-live="polite" style={{
      marginTop: 10, padding: '10px 12px', borderRadius: 10,
      border: '1px solid color-mix(in srgb, var(--primary) 25%, transparent)',
      background: 'var(--primary-soft)',
    }}>
      <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--ink-900)' }}>{titulo}</p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--ink-700)', lineHeight: 1.5 }}>{confirmacao.resumo}</p>
      {item && (
        <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--ink-500)' }}>
          <strong style={{ color: 'var(--ink-700)' }}>Item:</strong> {item}
        </p>
      )}
      <p style={{ margin: '5px 0 0', fontSize: 11.5, color: 'var(--ink-500)', lineHeight: 1.45 }}>
        A Clara não executa esta ação sem sua autorização. Você pode cancelar sem alterar o alerta.
      </p>
      {!confirmacao.resolvido ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => onConfirmar?.(msg.id, confirmacao.ferramenta, confirmacao.argumentos)}
            disabled={confirmacao.processando}
            aria-busy={confirmacao.processando || undefined}
            style={{
              minHeight: 44, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: confirmacao.processando ? 'wait' : 'pointer',
              background: 'var(--primary)', color: 'white', fontSize: 12, fontWeight: 700,
            }}
          >
            {confirmacao.processando ? 'Confirmando…' : rotuloConfirmar}
          </button>
          <button
            type="button"
            onClick={() => onCancelar?.(msg.id)}
            disabled={confirmacao.processando}
            style={{
              minHeight: 44, padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
              border: '1px solid var(--ink-100)', background: 'transparent', color: 'var(--ink-500)',
            }}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <p role="status" style={{ margin: '6px 0 0', fontSize: 11, color: confirmacao.cancelado ? 'var(--ink-500)' : 'var(--good)' }}>
          {confirmacao.cancelado ? 'Ação cancelada. Nenhuma alteração foi realizada.' : 'Ação confirmada pelo usuário.'}
        </p>
      )}
      {confirmacao.erro && <p role="alert" style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--bad)' }}>{confirmacao.erro}</p>}
    </div>
  );
}

function Bolha({ msg, onNavigate, onConfirmar, onCancelar }) {
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
        {isErro ? 'não foi possível responder' : 'Clara'}
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

      {!isErro && <ArtefatoView artefato={msg.artefato} />}
      {!isErro && <ConfirmacaoAcao msg={msg} onConfirmar={onConfirmar} onCancelar={onCancelar} />}

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
        {formatRelativo(thread.atualizadaEm || thread.criadaEm)}
        {thread.totalMensagens > 0 ? ` · ${thread.totalMensagens} ${thread.totalMensagens === 1 ? 'troca' : 'trocas'}` : ''}
      </p>
    </div>
  );
}

function ContinuidadeCanais({ ibge6 }) {
  const [conexoes, setConexoes] = useState([]);
  const [pareamento, setPareamento] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const telegram = conexoes.find(item => item.provedor === 'telegram');

  async function carregarCanais() {
    setErro('');
    try {
      const data = await listarCanaisSusbot({ baseUrl: API_BASE, headers: getAuthHeaders() });
      setConexoes(Array.isArray(data?.itens) ? data.itens : []);
    } catch (error) {
      setErro(error?.message || 'Não foi possível consultar os canais conectados.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregarCanais(); }, []);

  useEffect(() => {
    if (!pareamento?.id || !['emitido', 'reivindicado'].includes(pareamento.status)) return undefined;
    const timer = window.setInterval(async () => {
      try {
        const atualizado = await consultarPareamentoCanalSusbot({
          pareamentoId: pareamento.id,
          baseUrl: API_BASE,
          headers: getAuthHeaders(),
        });
        setPareamento(atual => ({ ...atual, ...atualizado }));
      } catch {
        // Mantém o estado atual e permite nova tentativa manual pelo fluxo.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pareamento?.id, pareamento?.status]);

  async function iniciarPareamento() {
    setProcessando(true);
    setErro('');
    try {
      const novo = await criarPareamentoCanalSusbot({
        provedor: 'telegram', ibge6, baseUrl: API_BASE, headers: getAuthHeaders(),
      });
      setPareamento(novo);
    } catch (error) {
      setErro(error?.detail || error?.message || 'Não foi possível iniciar a conexão.');
    } finally {
      setProcessando(false);
    }
  }

  async function confirmarPareamento() {
    setProcessando(true);
    setErro('');
    try {
      const conexao = await confirmarPareamentoCanalSusbot({
        pareamentoId: pareamento.id, baseUrl: API_BASE, headers: getAuthHeaders(),
      });
      setConexoes(items => [...items.filter(item => item.provedor !== 'telegram'), conexao]);
      setPareamento(null);
    } catch (error) {
      setErro(error?.message || 'Não foi possível confirmar a conexão.');
    } finally {
      setProcessando(false);
    }
  }

  async function cancelarPareamento() {
    setProcessando(true);
    try {
      await cancelarPareamentoCanalSusbot({
        pareamentoId: pareamento.id, baseUrl: API_BASE, headers: getAuthHeaders(),
      });
      setPareamento(null);
    } catch (error) {
      setErro(error?.message || 'Não foi possível cancelar o pareamento.');
    } finally {
      setProcessando(false);
    }
  }

  async function desconectarTelegram() {
    setProcessando(true);
    setErro('');
    try {
      await revogarCanalSusbot({ provedor: 'telegram', baseUrl: API_BASE, headers: getAuthHeaders() });
      setConexoes(items => items.filter(item => item.provedor !== 'telegram'));
    } catch (error) {
      setErro(error?.message || 'Não foi possível desconectar o Telegram.');
    } finally {
      setProcessando(false);
    }
  }

  async function copiarLinkTelegram() {
    try {
      await navigator.clipboard.writeText(pareamento.deep_link);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro('Não foi possível copiar o link. Use o botão Abrir no Telegram.');
    }
  }

  return (
    <div className="susbot-panel-body" style={{ flex: 1, padding: '18px 16px' }}>
      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink-900)', fontFamily: 'var(--ff-tight)' }}>
        Continuidade entre canais
      </p>
      <p style={{ margin: '7px 0 18px', fontSize: 13, lineHeight: 1.55, color: 'var(--ink-500)' }}>
        Use a mesma identidade e o mesmo histórico onde sua equipe já conversa. Cada novo canal exige sua confirmação no SusPredict.
      </p>
      {erro && (
        <p role="alert" style={{ padding: '10px 12px', borderRadius: 9, background: 'color-mix(in srgb, var(--bad) 8%, var(--elev))', color: 'var(--bad)', fontSize: 12, lineHeight: 1.5 }}>
          {erro}
        </p>
      )}

      <div style={{ borderTop: '1px solid var(--ink-100)' }} aria-busy={carregando || processando}>
        <div style={{ padding: '13px 0', borderBottom: '1px solid var(--ink-100)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 13, color: 'var(--ink-900)' }}>Web</strong>
            <span style={{ ...ROTULO_META, color: 'var(--good)' }}>Ativo</span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-500)' }}>Conversa, contexto de tela e município ativos.</p>
        </div>

        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--ink-100)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <strong style={{ display: 'block', fontSize: 13, color: 'var(--ink-900)' }}>Telegram</strong>
              <span style={{ ...ROTULO_META, color: telegram ? 'var(--good)' : 'var(--ink-400)' }}>
                {telegram ? 'Conectado' : pareamento ? 'Pareamento em andamento' : 'Não conectado'}
              </span>
            </div>
            {!telegram && !pareamento && (
              <button type="button" disabled={processando || carregando} onClick={() => void iniciarPareamento()} className="susbot-channel-primary">
                Conectar
              </button>
            )}
          </div>

          {telegram && (
            <div style={{ marginTop: 12, padding: '11px 12px', borderRadius: 10, background: 'var(--primary-soft)' }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)' }}>
                {telegram.external_username ? `@${telegram.external_username}` : 'Conta Telegram conectada'}
              </p>
              <p style={{ margin: '4px 0 10px', fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-500)' }}>
                Novas conversas entram no mesmo histórico. Ações continuam exigindo confirmação.
              </p>
              <button type="button" disabled={processando} onClick={() => void desconectarTelegram()} className="susbot-channel-danger">
                Desconectar Telegram
              </button>
            </div>
          )}

          {pareamento?.status === 'emitido' && (
            <div style={{ marginTop: 12, padding: '14px', borderRadius: 10, background: 'var(--primary-soft)' }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 800, color: 'var(--ink-900)' }}>1. Abra a Clara no Telegram</p>
              <p style={{ margin: '5px 0 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-500)' }}>
                No celular, toque no botão. Em outro dispositivo, escaneie o QR Code. Este convite expira em 10 minutos e funciona uma vez.
              </p>
              {pareamento.deep_link ? (
                <div className="susbot-channel-connect-options">
                  <div className="susbot-channel-qr" aria-label="QR Code para abrir a Clara no Telegram">
                    <QRCode value={pareamento.deep_link} size={148} bgColor="#fbfaf7" fgColor="#1a1814" />
                  </div>
                  <div className="susbot-channel-connect-actions">
                    <span style={{ fontSize: 11.5, lineHeight: 1.45, color: 'var(--ink-500)' }}>O link já inclui seu convite seguro. Não é necessário copiar nenhum código.</span>
                    <a href={pareamento.deep_link} target="_blank" rel="noopener noreferrer" className="susbot-channel-primary" style={{ textDecoration: 'none' }}>
                      Abrir no Telegram <MIcon m="open_in_new" size={15} />
                    </a>
                    <button type="button" onClick={() => void copiarLinkTelegram()} className="susbot-channel-link">
                      <MIcon m="content_copy" size={15} /> {copiado ? 'Link copiado' : 'Copiar link'}
                    </button>
                  </div>
                </div>
              ) : (
                <p role="alert" style={{ margin: '0 0 9px', fontSize: 11.5, color: 'var(--warn)' }}>O usuário oficial do bot ainda não foi configurado. Reinicie o ambiente depois de definir TELEGRAM_BOT_USERNAME.</p>
              )}
              <button type="button" disabled={processando} onClick={() => void cancelarPareamento()} className="susbot-channel-link" style={{ marginTop: 10 }}>Cancelar convite</button>
            </div>
          )}

          {pareamento?.status === 'reivindicado' && (
            <div role="group" aria-label="Confirmar conta Telegram" style={{ marginTop: 12, padding: '12px', borderRadius: 10, border: '1px solid var(--primary-soft-border)', background: 'var(--elev)' }}>
              <p style={{ margin: 0, fontSize: 12.5, fontWeight: 800, color: 'var(--ink-900)' }}>2. Confirme a conta encontrada</p>
              <p style={{ margin: '5px 0 12px', fontSize: 12, color: 'var(--ink-700)' }}>
                Conectar {pareamento.external_username ? `@${pareamento.external_username}` : 'esta conta do Telegram'} ao seu histórico SusPredict?
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" disabled={processando} onClick={() => void confirmarPareamento()} className="susbot-channel-primary">Confirmar conexão</button>
                <button type="button" disabled={processando} onClick={() => void cancelarPareamento()} className="susbot-channel-link">Cancelar</button>
              </div>
            </div>
          )}

          {pareamento && ['expirado', 'cancelado'].includes(pareamento.status) && (
            <div style={{ marginTop: 10 }}>
              <p style={{ fontSize: 12, color: 'var(--ink-500)' }}>Este pareamento não está mais disponível.</p>
              <button type="button" onClick={() => { setPareamento(null); void iniciarPareamento(); }} className="susbot-channel-primary">Gerar novo link</button>
            </div>
          )}
        </div>

        <div style={{ padding: '13px 0', borderBottom: '1px solid var(--ink-100)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ fontSize: 13, color: 'var(--ink-900)' }}>WhatsApp</strong>
            <span style={{ ...ROTULO_META, color: 'var(--ink-400)' }}>Próximo canal</span>
          </div>
          <p style={{ margin: '5px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--ink-500)' }}>Usará o mesmo pareamento seguro e o mesmo histórico.</p>
        </div>
      </div>
      <p style={{ margin: '16px 0 0', padding: '10px 12px', background: 'var(--subtle)', borderRadius: 8, fontSize: 12, lineHeight: 1.55, color: 'var(--ink-700)' }}>
        O código nunca é permanente: expira, funciona uma vez e só conclui a conexão depois da sua confirmação aqui.
      </p>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ClaraPanel({ page = 'visao-geral', onNavigate, ibge6, onOpenChange, openRequest = null }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'history' | 'channels'
  const [threads, setThreads] = useState([]);
  const [canalHistorico, setCanalHistorico] = useState('app');
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
  const focoAnteriorRef = useRef(null);
  const enviandoRef = useRef(false);

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
    enviandoRef.current = enviando;
  }, [enviando]);

  useEffect(() => {
    if (open) focoAnteriorRef.current = document.activeElement;
  }, [open]);

  useEffect(() => {
    if (open && viewMode === 'chat') inputRef.current?.focus();
  }, [open, viewMode, current.id]);

  useEffect(() => {
    if (!openRequest?.id) return;
    setViewMode('chat');
    setOpen(true);
    if (openRequest.prompt) setInput(openRequest.prompt);
  }, [openRequest?.id]);

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
      if (e.key === 'Escape' && !enviandoRef.current) {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key !== 'Tab' || !painelRef.current) return;
      const focaveis = painelRef.current.querySelectorAll(
        'button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      focoAnteriorRef.current?.focus?.();
      focoAnteriorRef.current = null;
    };
  }, [open]);

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
        onArtefato: artefato => {
          atualizarMensagemAtual(idResposta, msg => ({ ...msg, artefato }));
        },
        onConfirmacaoPendente: dados => {
          atualizarMensagemAtual(idResposta, msg => ({
            ...msg,
            confirmacao: { ferramenta: dados?.ferramenta, argumentos: dados?.argumentos, resumo: dados?.resumo, resolvido: false },
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
        texto: mensagemErroSusbot(error),
        perguntaOriginal: pergunta,
        onRetry: enviar,
        ts: new Date(),
      }));
    } finally {
      setEnviando(false);
      setEtapa('');
    }
  }

  async function confirmarAcao(idMensagemConfirmacao, ferramenta, argumentos) {
    if (enviando) return;

    atualizarMensagemAtual(idMensagemConfirmacao, msg => (
      msg.confirmacao ? { ...msg, confirmacao: { ...msg.confirmacao, processando: true, erro: null } } : msg
    ));

    const idResultado = uid();
    setCurrent(c => ({
      ...c,
      mensagens: [...c.mensagens, { id: idResultado, autor: 'bot', texto: '', status: 'Executando', streaming: true, ts: new Date() }],
    }));
    setEnviando(true);
    setEtapa('executando...');

    try {
      const resp = await conversarComSusbot({
        confirmar: { ferramenta, argumentos },
        telaAtual: page,
        tela_atual: page,
        tela_origem: page,
        conversaId: current.conversaId || undefined,
        ibge6: ibge6Atual,
        baseUrl: API_BASE,
        headers: getAuthHeaders(),
        onStatus: status => {
          const mensagem = typeof status === 'string' ? status : status?.mensagem;
          if (mensagem) setEtapa(mensagem);
          atualizarMensagemAtual(idResultado, msg => ({ ...msg, status: mensagem || msg.status }));
        },
        onToken: tokenParcial => {
          atualizarMensagemAtual(idResultado, msg => ({
            ...msg,
            texto: `${msg.texto || ''}${tokenParcial}`,
            status: msg.status || 'digitando...',
            streaming: true,
          }));
        },
        onReferencia: (rota, dadosReferencia) => {
          atualizarMensagemAtual(idResultado, msg => ({
            ...msg,
            link: criarLinkReferencia(rota, dadosReferencia?.label) || msg.link,
          }));
        },
        onArtefato: artefato => {
          atualizarMensagemAtual(idResultado, msg => ({ ...msg, artefato }));
        },
      });

      atualizarMensagemAtual(idResultado, msg => ({
        ...msg,
        texto: resp.resposta || msg.texto,
        streaming: false,
        status: undefined,
        link: criarLinkReferencia(resp.referenciaRota, resp.referenciaLabel) || msg.link || null,
      }));
      atualizarMensagemAtual(idMensagemConfirmacao, msg => (
        msg.confirmacao ? { ...msg, confirmacao: { ...msg.confirmacao, processando: false, resolvido: true } } : msg
      ));
      void recarregarHistoricoSilencioso();
    } catch (error) {
      atualizarMensagemAtual(idMensagemConfirmacao, msg => (
        msg.confirmacao
          ? { ...msg, confirmacao: { ...msg.confirmacao, processando: false, resolvido: false, erro: 'Não foi possível executar. Revise os dados e tente confirmar novamente.' } }
          : msg
      ));
      atualizarMensagemAtual(idResultado, () => ({
        id: uid(),
        autor: 'error',
        texto: ERRO_SUSBOT_PADRAO,
        ts: new Date(),
      }));
    } finally {
      setEnviando(false);
      setEtapa('');
    }
  }

  function cancelarConfirmacao(idMensagemConfirmacao) {
    atualizarMensagemAtual(idMensagemConfirmacao, msg => (
      msg.confirmacao ? { ...msg, confirmacao: { ...msg.confirmacao, resolvido: true, cancelado: true } } : msg
    ));
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
  const threadsDoCanal = threads.filter(thread => thread.canal === canalHistorico);
  const totaisPorCanal = threads.reduce((totais, thread) => ({
    ...totais,
    [thread.canal]: (totais[thread.canal] || 0) + 1,
  }), { app: 0, telegram: 0 });

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

        .susbot-channel-trigger {
          min-height: 36px;
          padding: 7px 10px;
          border: 1px solid var(--primary-soft-border);
          border-radius: 9px;
          background: var(--primary-soft);
          color: var(--primary);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 800;
          white-space: nowrap;
          transition: border-color .15s, background .15s;
        }
        .susbot-channel-trigger:hover { border-color: var(--primary); }

        .susbot-channel-primary,
        .susbot-channel-link,
        .susbot-channel-danger {
          min-height: 40px;
          padding: 8px 12px;
          border-radius: 9px;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .susbot-channel-primary { border: 1px solid var(--primary); background: var(--primary); color: var(--elev); }
        .susbot-channel-link { border: 1px solid var(--ink-100); background: var(--elev); color: var(--ink-700); }
        .susbot-channel-danger { border: 1px solid color-mix(in srgb, var(--bad) 28%, var(--ink-100)); background: var(--elev); color: var(--bad); }
        .susbot-channel-primary:disabled,
        .susbot-channel-link:disabled,
        .susbot-channel-danger:disabled { opacity: .55; cursor: wait; }
        .susbot-channel-connect-options {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .susbot-channel-qr {
          padding: 9px;
          border: 1px solid var(--ink-100);
          border-radius: 10px;
          background: #fbfaf7;
          line-height: 0;
        }
        .susbot-channel-connect-actions {
          min-width: 160px;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 8px;
        }

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
            width: 100vw;
            top: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            border: 0 !important;
            border-radius: 0;
          }

          .susbot-panel-fab {
            display: none !important;
          }

          .susbot-icon-btn { min-width: 44px; min-height: 44px; justify-content: center; }
          .susbot-channel-trigger { min-height: 44px; }
          .susbot-chip { min-height: 44px; font-size: 13px; }
          .susbot-channel-primary,
          .susbot-channel-link,
          .susbot-channel-danger { min-height: 44px; }
          .susbot-channel-connect-options { flex-direction: column; align-items: stretch; }
          .susbot-channel-qr { display: none; }
        }

        @media (max-width: 360px) {
          .susbot-channel-trigger { width: 44px; padding-inline: 0; }
          .susbot-channel-trigger span { display: none; }
        }
      `}</style>

      {/* Dock lateral — sempre montado, translada para fora quando fechado */}
      <div
        ref={painelRef}
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-hidden={!open}
        aria-label="Painel da Clara"
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
          {viewMode !== 'chat' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setViewMode('chat')} title="Voltar" className="susbot-icon-btn">
                <MIcon m="arrow_back" size={19} />
              </button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'var(--ff-tight)' }}>
                {viewMode === 'history' ? 'Conversas' : 'Canais'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClaraMark size={30} />
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', lineHeight: 1.15, fontFamily: 'var(--ff-tight)' }}>
                  Clara
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
                <button
                  type="button"
                  onClick={() => setViewMode('channels')}
                  aria-label="Conectar canal de mensagens"
                  title="Conectar canal (Telegram, WhatsApp)"
                  className="susbot-channel-trigger"
                >
                  <MIcon m="hub" size={16} />
                  <span>Conectar canal</span>
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
        {viewMode === 'channels' ? (
          <ContinuidadeCanais ibge6={ibge6Atual} />
        ) : viewMode === 'history' ? (
          <div className="susbot-panel-body" style={{ flex: 1, padding: '4px 16px' }}>
            <div
              role="tablist"
              aria-label="Origem das conversas"
              style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4,
                margin: '8px 0 10px', padding: 4, borderRadius: 10,
                background: 'var(--subtle)', border: '1px solid var(--ink-100)',
              }}
            >
              {[
                { id: 'app', label: 'App', icon: 'devices' },
                { id: 'telegram', label: 'Telegram', icon: 'send' },
              ].map(canal => {
                const selecionado = canalHistorico === canal.id;
                return (
                  <button
                    key={canal.id}
                    type="button"
                    role="tab"
                    aria-selected={selecionado}
                    onClick={() => setCanalHistorico(canal.id)}
                    style={{
                      minHeight: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                      border: selecionado ? '1px solid var(--ink-100)' : '1px solid transparent',
                      borderRadius: 7, background: selecionado ? 'var(--elev)' : 'transparent',
                      color: selecionado ? 'var(--ink-900)' : 'var(--ink-500)', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700,
                      boxShadow: selecionado ? '0 1px 3px rgba(20, 16, 8, .06)' : 'none',
                    }}
                  >
                    <MIcon m={canal.icon} size={16} />
                    <span>{canal.label}</span>
                    <span style={{
                      minWidth: 20, padding: '2px 6px', borderRadius: 999,
                      background: selecionado ? 'var(--primary-50)' : 'var(--ink-50)',
                      color: selecionado ? 'var(--primary)' : 'var(--ink-400)',
                      fontFamily: 'var(--ff-mono, monospace)', fontSize: 10,
                    }}>
                      {totaisPorCanal[canal.id] || 0}
                    </span>
                  </button>
                );
              })}
            </div>
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
            ) : threadsDoCanal.length === 0 ? (
              <EstadoPainel
                icone={canalHistorico === 'telegram' ? 'send' : 'forum'}
                titulo={canalHistorico === 'telegram' ? 'Nenhuma conversa do Telegram' : 'Nenhuma conversa do app'}
                texto={canalHistorico === 'telegram'
                  ? 'Depois de conectar o Telegram e conversar com a Clara, as sessões aparecem aqui.'
                  : 'Quando você fizer uma pergunta pelo app, a conversa aparece aqui.'}
              />
            ) : (
              threadsDoCanal.map(t => <ItemHistorico key={t.id} thread={t} onAbrir={abrirThread} />)
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
                  <Bolha msg={m} onNavigate={onNavigate} onConfirmar={confirmarAcao} onCancelar={cancelarConfirmacao} />
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
                    aria-label="Mensagem para a Clara"
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
                    aria-label="Enviar mensagem à Clara"
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
          title="Clara — assistente"
          aria-label="Abrir Clara"
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

export default ClaraPanel;
