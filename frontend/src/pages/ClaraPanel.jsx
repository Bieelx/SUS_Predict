import { useState, useRef, useEffect } from 'react';
import { briefingDemo } from '../demo/adapter.js';
import QRCode from 'react-qr-code';
import { API_BASE, MIcon } from '../shared/ui.jsx';
import {
  apagarConversaSusbot,
  apagarMemoriaSusbot,
  cancelarPareamentoCanalSusbot,
  confirmarPareamentoCanalSusbot,
  consultarMemoriaSusbot,
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

const SUGESTOES_ICONES = ['notifications_active', 'inventory_2', 'trending_up'];

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
  if (error?.status === 403 && /administrador/i.test(detalhe)) {
    // docs/09 Fase 1: sem linha ativa em usuarios_acesso ou ferramenta fora do perfil.
    return detalhe;
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
function ClaraMark({ size = 30, ativa = false }) {
  return (
    <span className={`susbot-mark${ativa ? ' susbot-mark--ativa' : ''}`} style={{
      width: size, height: size, borderRadius: Math.round(size * 0.32), fontSize: Math.round(size * 0.46),
    }} aria-hidden="true">
      C
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
// Campo sem valor não vai à tela (nem nos detalhes): o card é evidência da
// fonte, e célula vazia lida como zero é pior do que ausência.
function temValor(valor) {
  if (valor === null || valor === undefined) return false;
  const texto = String(valor).trim();
  return texto !== '' && texto !== 'null' && texto !== 'undefined';
}

const detalhesResumo = {
  margin: 0, padding: '6px 10px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.05em', color: 'var(--ink-400)', cursor: 'pointer',
};

// Bloco recolhido: <details> nativo, sem estado nem lib de acordeão.
function Detalhes({ children }) {
  return (
    <details style={{ borderTop: '1px solid var(--ink-100)' }}>
      <summary style={detalhesResumo}>Ver detalhes</summary>
      <div style={{ padding: '0 10px 10px' }}>{children}</div>
    </details>
  );
}

function GradeCampos({ entradas }) {
  return (
    <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(entradas.length, 3)}, 1fr)`, gap: 8 }}>
      {entradas.map(([chave, valor]) => (
        <div key={chave} className="susbot-resumo-card">
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
            {chave.replace(/_/g, ' ')}
          </p>
          <p style={{ margin: '2px 0 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, fontWeight: 800, color: 'var(--ink-900)' }}>
            {String(valor)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TabelaCampos({ colunas, linhas }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>
            {colunas.map(col => (
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
          {linhas.map((linha, i) => (
            <tr key={i}>
              {colunas.map(col => (
                <td key={col} style={{ padding: '6px 10px', borderTop: '1px solid var(--ink-50)', color: 'var(--ink-700)', whiteSpace: 'nowrap' }}>
                  {temValor(linha[col]) ? String(linha[col]) : '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
        <TabelaCampos colunas={artefato.colunas} linhas={artefato.linhas} />
        {!!artefato.colunas_detalhe?.length && (
          <Detalhes>
            <TabelaCampos
              colunas={[artefato.colunas[0], ...artefato.colunas_detalhe]}
              linhas={artefato.linhas}
            />
          </Detalhes>
        )}
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
    const entradas = Object.entries(artefato.campos || {}).filter(([, v]) => temValor(v));
    const detalhes = Object.entries(artefato.detalhes || {}).filter(([, v]) => temValor(v));
    if (!entradas.length && !detalhes.length) return null;
    return (
      <div style={{ marginTop: 10 }}>
        <p style={{ margin: '0 0 6px', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
          {artefato.titulo}
        </p>
        {!!entradas.length && <GradeCampos entradas={entradas} />}
        {!!detalhes.length && (
          <Detalhes>
            <GradeCampos entradas={detalhes} />
          </Detalhes>
        )}
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
        {!!Object.keys(artefato.detalhes || {}).length && (
          <Detalhes>
            <GradeCampos entradas={Object.entries(artefato.detalhes).filter(([, v]) => temValor(v))} />
          </Detalhes>
        )}
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

function Bolha({ msg, onNavigate, onConfirmar, onCancelar, onAbrirMemoria }) {
  const isUser = msg.autor === 'user';
  const isErro = msg.autor === 'error';
  const isStreaming = msg.autor === 'bot' && msg.streaming;

  if (isUser) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <div className="susbot-user">{msg.texto}</div>
        <p className="susbot-meta" style={{ paddingRight: 4 }}>{getSusbotPageLabel(msg.page)}</p>
      </div>
    );
  }

  const cor = isErro ? 'var(--bad, #8A2A38)' : 'var(--accent)';

  return (
    <div className={`susbot-bot${isErro ? ' susbot-bot--erro' : ''}`}>
      <p className="susbot-bot__quem" style={{ color: isErro ? cor : undefined }}>
        {isErro ? <MIcon m="error" size={14} /> : <ClaraMark size={20} ativa={isStreaming} />}
        <span>{isErro ? 'Não foi possível responder' : 'Clara'}</span>
      </p>
      <div className="susbot-bot__texto">
        {isErro ? <p style={{ margin: 0 }}>{msg.texto}</p> : renderMd(msg.texto)}
        {isStreaming && <Cursor />}
      </div>

      {isStreaming && msg.status && (
        <p className="susbot-meta susbot-status">{msg.status}</p>
      )}

      {!isErro && <ArtefatoView artefato={msg.artefato} />}
      {!isErro && <AvisoMemoria estado={msg.memoria} onAbrir={onAbrirMemoria} />}
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

function ItemHistorico({ thread, onAbrir, onApagar }) {
  const titulo = tituloDe(thread);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--ink-50)' }}>
      <div
        onClick={() => onAbrir(thread.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(thread.id); } }}
        style={{
          flex: 1, minWidth: 0, padding: '12px 4px', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 3,
        }}
      >
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{titulo}</p>
        <p style={{ margin: 0, fontFamily: 'var(--ff-mono, monospace)', fontSize: 11, color: 'var(--ink-400)' }}>
          {formatRelativo(thread.atualizadaEm || thread.criadaEm)}
          {thread.totalMensagens > 0 ? ` · ${thread.totalMensagens} ${thread.totalMensagens === 1 ? 'troca' : 'trocas'}` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onApagar(thread.id)}
        title="Apagar conversa"
        aria-label={`Apagar conversa: ${titulo}`}
        className="susbot-icon-btn"
      >
        <MIcon m="delete" size={18} />
      </button>
    </div>
  );
}

// Marcas oficiais desenhadas em path: o Material Symbols só tem genéricos
// ("send", "chat"), que não identificam o aplicativo no ladrilho.
function IconeTelegram({ size = 21 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M23.91 3.79 20.3 20.84c-.25 1.21-.98 1.5-2 .94l-5.5-4.07-2.66 2.57c-.3.3-.55.56-1.1.56-.72 0-.6-.27-.84-.95L6.3 13.7.85 12c-1.18-.35-1.19-1.16.26-1.75l21.26-8.2c.97-.43 1.9.24 1.54 1.74Z" />
    </svg>
  );
}

function IconeWhatsApp({ size = 19 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
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

  const statusTelegram = telegram ? 'on' : pareamento && ['emitido', 'reivindicado'].includes(pareamento.status) ? 'wait' : 'off';
  const rotuloTelegram = telegram ? 'Conectado' : statusTelegram === 'wait' ? 'Aguardando' : 'Não conectado';

  return (
    <div className="susbot-panel-body susbot-canais" aria-busy={carregando || processando}>
      <p className="susbot-canais__intro">
        A Clara é a mesma em qualquer canal: mesma identidade, mesmo histórico, mesmas confirmações. Conectar um canal novo sempre passa pela sua aprovação aqui.
      </p>

      {erro && (
        <p role="alert" className="susbot-canais__erro"><MIcon m="error" size={16} />{erro}</p>
      )}

      {/* Web */}
      <section className="susbot-canal">
        <div className="susbot-canal__topo">
          <span className="susbot-canal__logo susbot-canal__logo--web"><MIcon m="language" size={20} /></span>
          <div className="susbot-canal__nome">
            <strong>SusPredict Web</strong>
            <span>Este painel, com o município e a tela em contexto.</span>
          </div>
          <span className="susbot-status-pill susbot-status-pill--on">Ativo</span>
        </div>
      </section>

      {/* Telegram */}
      <section className={`susbot-canal${statusTelegram === 'wait' ? ' susbot-canal--ativo' : ''}`}>
        <div className="susbot-canal__topo">
          <span className="susbot-canal__logo susbot-canal__logo--telegram"><IconeTelegram /></span>
          <div className="susbot-canal__nome">
            <strong>Telegram</strong>
            <span>{telegram?.external_username ? `@${telegram.external_username}` : 'Converse com a Clara pelo celular.'}</span>
          </div>
          <span className={`susbot-status-pill susbot-status-pill--${statusTelegram}`}>{rotuloTelegram}</span>
        </div>

        {!telegram && !pareamento && (
          <div className="susbot-canal__corpo">
            <button type="button" disabled={processando || carregando} onClick={() => void iniciarPareamento()} className="susbot-btn susbot-btn--primary">
              <MIcon m="link" size={17} /> Conectar Telegram
            </button>
          </div>
        )}

        {telegram && (
          <div className="susbot-canal__corpo">
            <p className="susbot-canal__nota">Novas conversas no Telegram entram neste mesmo histórico. Ações continuam exigindo confirmação.</p>
            <button type="button" disabled={processando} onClick={() => void desconectarTelegram()} className="susbot-btn susbot-btn--danger">
              <MIcon m="link_off" size={17} /> Desconectar
            </button>
          </div>
        )}

        {pareamento?.status === 'emitido' && (
          <div className="susbot-canal__corpo susbot-passos">
            <div className="susbot-passo susbot-passo--atual">
              <span className="susbot-passo__num">1</span>
              <div className="susbot-passo__conteudo">
                <strong>Abra a Clara no Telegram</strong>
                <p>No celular, toque no botão. Em outro aparelho, aponte a câmera para o código. O convite vale por 10 minutos e funciona uma vez.</p>
                {pareamento.deep_link ? (
                  <div className="susbot-convite">
                    <div className="susbot-convite__qr" aria-label="QR Code para abrir a Clara no Telegram">
                      <QRCode value={pareamento.deep_link} size={132} bgColor="#ffffff" fgColor="#14324A" />
                    </div>
                    <div className="susbot-convite__acoes">
                      <a href={pareamento.deep_link} target="_blank" rel="noopener noreferrer" className="susbot-btn susbot-btn--primary">
                        Abrir no Telegram <MIcon m="open_in_new" size={15} />
                      </a>
                      <button type="button" onClick={() => void copiarLinkTelegram()} className="susbot-btn susbot-btn--ghost">
                        <MIcon m={copiado ? 'check' : 'content_copy'} size={15} /> {copiado ? 'Link copiado' : 'Copiar link'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p role="alert" className="susbot-canal__aviso">O usuário oficial do bot ainda não foi configurado. Reinicie o ambiente depois de definir TELEGRAM_BOT_USERNAME.</p>
                )}
              </div>
            </div>
            <div className="susbot-passo">
              <span className="susbot-passo__num"><span className="susbot-passo__pulso" />2</span>
              <div className="susbot-passo__conteudo">
                <strong>Confirme a conta aqui</strong>
                <p>Assim que o Telegram responder, a conta aparece nesta tela para você aprovar.</p>
              </div>
            </div>
            <button type="button" disabled={processando} onClick={() => void cancelarPareamento()} className="susbot-btn susbot-btn--ghost susbot-passos__cancelar">Cancelar convite</button>
          </div>
        )}

        {pareamento?.status === 'reivindicado' && (
          <div className="susbot-canal__corpo susbot-passos" role="group" aria-label="Confirmar conta Telegram">
            <div className="susbot-passo susbot-passo--feito">
              <span className="susbot-passo__num"><MIcon m="check" size={14} /></span>
              <div className="susbot-passo__conteudo"><strong>Clara aberta no Telegram</strong></div>
            </div>
            <div className="susbot-passo susbot-passo--atual">
              <span className="susbot-passo__num">2</span>
              <div className="susbot-passo__conteudo">
                <strong>Confirme a conta encontrada</strong>
                <p>Conectar <b>{pareamento.external_username ? `@${pareamento.external_username}` : 'esta conta do Telegram'}</b> ao seu histórico SusPredict?</p>
                <div className="susbot-convite__acoes susbot-convite__acoes--linha">
                  <button type="button" disabled={processando} onClick={() => void confirmarPareamento()} className="susbot-btn susbot-btn--primary">Confirmar conexão</button>
                  <button type="button" disabled={processando} onClick={() => void cancelarPareamento()} className="susbot-btn susbot-btn--ghost">Cancelar</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pareamento && ['expirado', 'cancelado'].includes(pareamento.status) && (
          <div className="susbot-canal__corpo">
            <p className="susbot-canal__nota">Este convite não está mais disponível.</p>
            <button type="button" onClick={() => { setPareamento(null); void iniciarPareamento(); }} className="susbot-btn susbot-btn--primary">
              <MIcon m="refresh" size={17} /> Gerar novo convite
            </button>
          </div>
        )}
      </section>

      {/* WhatsApp */}
      <section className="susbot-canal susbot-canal--breve">
        <div className="susbot-canal__topo">
          <span className="susbot-canal__logo susbot-canal__logo--whatsapp"><IconeWhatsApp /></span>
          <div className="susbot-canal__nome">
            <strong>WhatsApp</strong>
            <span>Mesmo pareamento seguro, mesmo histórico.</span>
          </div>
          <span className="susbot-status-pill susbot-status-pill--breve">Em breve</span>
        </div>
      </section>

      <p className="susbot-canais__rodape">
        <MIcon m="verified_user" size={15} />
        <span>O convite expira, funciona uma vez e só conclui a conexão depois da sua confirmação aqui.</span>
      </p>
    </div>
  );
}

// ─── O que a Clara sabe sobre mim ─────────────────────────────────────────────
//
// Uma única ficha por usuário (nome, preferência, resumo reescrito pela Clara).
// Só leitura e exclusão: o conteúdo nasce da conversa, não de formulário.

const ROTULO_PREFERENCIA = {
  curta: 'Respostas curtas',
  detalhada: 'Respostas detalhadas',
  com_numeros: 'Respostas com números',
};

function MemoriaClara() {
  const [memoria, setMemoria] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setCarregando(true);
    setErro('');
    try {
      setMemoria(await consultarMemoriaSusbot({ baseUrl: API_BASE, headers: getAuthHeaders() }));
    } catch {
      setErro('Não foi possível carregar a memória da Clara agora.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { void carregar(); }, []);

  async function apagar(chave) {
    if (!chave && !window.confirm('Apagar tudo o que a Clara sabe sobre você? Isso não pode ser desfeito.')) return;
    setProcessando(true);
    setErro('');
    try {
      await apagarMemoriaSusbot({ chave, baseUrl: API_BASE, headers: getAuthHeaders() });
      await carregar();
    } catch {
      setErro('Não foi possível apagar agora. Tente novamente.');
    } finally {
      setProcessando(false);
    }
  }

  const itens = [
    ...(memoria?.fatos || []).map(f => ({
      chave: f.chave,
      rotulo: f.rotulo,
      valor: f.chave === 'preferencia_resposta' ? (ROTULO_PREFERENCIA[f.valor] || f.valor) : f.valor,
      icone: f.chave === 'nome' ? 'badge' : 'tune',
    })),
    ...(memoria?.resumo ? [{ chave: 'resumo', rotulo: 'Resumo sobre você', valor: memoria.resumo, icone: 'notes' }] : []),
  ];
  const atualizado = memoria?.atualizado_em ? parseIsoDate(memoria.atualizado_em) : null;

  return (
    <div className="susbot-panel-body susbot-canais" aria-busy={carregando || processando}>
      <p className="susbot-canais__intro">
        A Clara guarda uma ficha só sobre você e a reescreve conforme vocês conversam. Ela usa isso para ajustar o tom das respostas, nunca como fonte de dados ou permissão.
      </p>

      {erro && <p role="alert" className="susbot-canais__erro"><MIcon m="error" size={16} />{erro}</p>}

      {carregando ? (
        <EstadoPainel icone="hourglass_empty" titulo="Carregando memória" texto="Buscando o que a Clara lembra sobre você." />
      ) : !erro && itens.length === 0 ? (
        <EstadoPainel
          icone="psychology"
          titulo="Nada guardado ainda"
          texto="Conte sobre seu trabalho ou diga “prefiro respostas curtas” e a Clara passa a lembrar."
        />
      ) : (
        itens.map(item => (
          <section key={item.chave} className="susbot-canal">
            <div className="susbot-canal__topo" style={{ alignItems: 'flex-start' }}>
              <span className="susbot-canal__logo susbot-canal__logo--web"><MIcon m={item.icone} size={20} /></span>
              <div className="susbot-canal__nome" style={{ flex: 1, minWidth: 0 }}>
                <strong>{item.rotulo}</strong>
                <span style={{ whiteSpace: 'normal', lineHeight: 1.5 }}>{item.valor}</span>
              </div>
              <button
                type="button"
                disabled={processando}
                onClick={() => void apagar(item.chave)}
                title={`Esquecer ${item.rotulo.toLowerCase()}`}
                aria-label={`Esquecer ${item.rotulo.toLowerCase()}`}
                className="susbot-icon-btn"
              >
                <MIcon m="delete" size={18} />
              </button>
            </div>
          </section>
        ))
      )}

      {!carregando && itens.length > 0 && (
        <button type="button" disabled={processando} onClick={() => void apagar()} className="susbot-btn susbot-btn--danger">
          <MIcon m="delete_sweep" size={17} />
          Apagar tudo
        </button>
      )}

      <p className="susbot-canais__rodape">
        <MIcon m="lock" size={15} />
        <span>
          Cifrado e visível só para você.{atualizado ? ` Atualizado em ${atualizado.toLocaleDateString('pt-BR')}.` : ''} Senhas, dados clínicos e informações sensíveis nunca são guardados.
        </span>
      </p>
    </div>
  );
}

function AvisoMemoria({ estado, onAbrir }) {
  if (estado === 'salvando') {
    return (
      <p className="susbot-memoria susbot-memoria--salvando" role="status">
        <MIcon m="psychology" size={15} />
        <span>Guardando na memória…</span>
      </p>
    );
  }
  if (estado === 'atualizada') {
    return (
      <button type="button" className="susbot-memoria susbot-memoria--ok" onClick={onAbrir} title="Ver o que a Clara sabe sobre você">
        <MIcon m="check_circle" size={15} />
        <span>Memória atualizada</span>
      </button>
    );
  }
  return null;
}

// ─── Componente principal ───────────────────────────────────────────────────

export function ClaraPanel({ page = 'visao-geral', onNavigate, ibge6, onOpenChange, openRequest = null, demoReplay = null }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'history' | 'channels' | 'memory'
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
    if (!open || demoReplay) return;

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

  // Telegram chega por webhook no servidor, sem push para o browser: enquanto o
  // histórico ou uma conversa do Telegram está na tela, relê a cada 3s.
  // ponytail: polling curto; trocar por SSE se o número de usuários simultâneos crescer.
  const conversaTelegramAberta = viewMode === 'chat' && current.canal === 'telegram' && current.conversaId;
  useEffect(() => {
    if (!open || demoReplay || !(viewMode === 'history' || conversaTelegramAberta)) return;
    const timer = window.setInterval(async () => {
      if (document.hidden || enviandoRef.current) return;
      if (viewMode === 'history') {
        void recarregarHistoricoSilencioso();
        return;
      }
      try {
        const data = await listarMensagensSusbot({
          conversaId: current.conversaId, baseUrl: API_BASE, headers: getAuthHeaders(), page: 1, pageSize: 100,
        });
        const itens = Array.isArray(data?.itens) ? data.itens : [];
        setCurrent(c => (c.conversaId === current.conversaId && itens.length * 2 !== c.mensagens.length
          ? { ...c, mensagens: itens.slice().reverse().flatMap(row => mensagemBancoParaMensagens(row, page)) }
          : c));
      } catch {
        // Próxima volta tenta de novo.
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [open, demoReplay, viewMode, conversaTelegramAberta, current.conversaId, page]);

  async function apagarThread(threadId) {
    if (!window.confirm('Apagar esta conversa? Isso não pode ser desfeito.')) return;
    try {
      await apagarConversaSusbot({ conversaId: threadId, baseUrl: API_BASE, headers: getAuthHeaders() });
      setThreads(ts => ts.filter(t => t.id !== threadId));
      if (current.conversaId === threadId) setCurrent(criarThreadVazia());
    } catch (error) {
      setErroHistorico(error?.detail || 'Não foi possível apagar a conversa. Tente novamente.');
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

    if (demoReplay) {
      setCurrent(c => ({ ...c, mensagens: [...c.mensagens,
        { id: uid(), autor: 'user', texto: pergunta, page, ts: new Date() },
        { id: uid(), autor: 'bot', texto: briefingDemo(demoReplay), ts: new Date() },
      ] }));
      return;
    }

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
        onMemoria: estado => {
          // Texto já chegou: para o cursor e mostra só o aviso de memória.
          atualizarMensagemAtual(idResposta, msg => ({
            ...msg,
            streaming: false,
            memoria: estado === 'sem_mudanca' ? undefined : estado,
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
          from { opacity: 0; transform: translateY(8px) scale(0.985); }
          to   { opacity: 1; transform: none; }
        }
        @keyframes susbot-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        @keyframes susbot-halo { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(1.9); opacity: 0; } }
        @keyframes susbot-shimmer { to { background-position: -200% 0; } }

        .susbot-msg { animation: susbot-msg-in .32s cubic-bezier(0.2,0.7,0.2,1) both; }

        /* Marca da Clara: ladrilho com gradiente do azul da casa. */
        .susbot-mark {
          position: relative; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          background: linear-gradient(145deg, var(--accent, #4E8BB8), var(--primary) 60%, var(--primary-dark));
          color: #fff; font-family: var(--ff-tight); font-weight: 800; line-height: 1;
          box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 4px 10px -4px color-mix(in srgb, var(--primary) 60%, transparent);
        }
        .susbot-mark--ativa::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          border: 2px solid var(--primary);
          animation: susbot-halo 1.6s ease-out infinite;
        }

        .susbot-header {
          padding: 12px 12px 12px 16px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          border-bottom: 1px solid var(--ink-100);
          background: color-mix(in srgb, var(--elev) 55%, var(--content));
        }
        .susbot-contexto { margin: 2px 0 0; max-width: 150px; font-size: 12px; color: var(--ink-500); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .susbot-meta { margin: 0; font-size: 11px; color: var(--ink-400); }
        .susbot-status { margin-top: 6px; color: var(--ink-500);
          background: linear-gradient(90deg, var(--ink-400) 0%, var(--primary) 50%, var(--ink-400) 100%);
          background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
          animation: susbot-shimmer 1.8s linear infinite; }

        /* Mensagens */
        .susbot-user {
          max-width: 86%; padding: 10px 14px; border-radius: 16px 16px 4px 16px;
          background: var(--primary); color: #fff;
          font-size: 13px; line-height: 1.55; overflow-wrap: anywhere;
          box-shadow: 0 6px 16px -10px color-mix(in srgb, var(--primary) 70%, transparent);
        }
        .susbot-bot { display: flex; flex-direction: column; align-items: flex-start; }
        .susbot-bot > .susbot-bot__texto, .susbot-bot > div:not([class]) { align-self: stretch; }
        .susbot-bot__quem {
          margin: 0 0 6px; display: flex; align-items: center; gap: 7px;
          font-size: 12px; font-weight: 700; color: var(--ink-700);
        }
        .susbot-bot__texto {
          padding: 12px 14px; border-radius: 4px 16px 16px 16px;
          background: var(--elev); border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          box-shadow: 0 1px 2px rgba(26,24,20,.03), 0 8px 20px -14px rgba(20,50,74,.25);
          font-size: 13px; line-height: 1.6; color: var(--ink-700); overflow-wrap: anywhere;
        }
        .susbot-bot--erro .susbot-bot__texto { border-color: color-mix(in srgb, var(--bad) 30%, transparent); background: color-mix(in srgb, var(--bad) 5%, var(--elev)); }
        .susbot-resumo-card {
          padding: 8px 10px; border-radius: 10px; background: var(--elev);
          border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          box-shadow: 0 4px 12px -10px rgba(20,50,74,.3);
        }

        /* Estado vazio */
        .susbot-vazio { padding: 22px 4px 8px; display: flex; flex-direction: column; align-items: flex-start; animation: susbot-rise .4s cubic-bezier(0.2,0.7,0.2,1) both; }
        .susbot-vazio__titulo { margin: 16px 0 0; font-family: var(--ff-tight); font-weight: 800; font-size: 21px; letter-spacing: -0.025em; line-height: 1.2; color: var(--ink-900); }
        .susbot-vazio__texto { margin: 8px 0 20px; font-size: 13px; line-height: 1.5; color: var(--ink-500); }
        .susbot-vazio__chips { width: 100%; display: flex; flex-direction: column; gap: 8px; }
        .susbot-chip {
          display: flex; align-items: center; gap: 10px; text-align: left;
          padding: 11px 13px; border-radius: 12px;
          border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          background: var(--elev); color: var(--ink-700);
          font-size: 13px; line-height: 1.4; cursor: pointer;
          box-shadow: 0 1px 2px rgba(26,24,20,.03), 0 8px 20px -16px rgba(20,50,74,.3);
          transition: border-color .18s, background .18s, transform .18s cubic-bezier(0.2,0.7,0.2,1), box-shadow .18s;
          animation: susbot-rise .4s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .susbot-chip .material-symbols-rounded { color: var(--primary); flex-shrink: 0; }
        .susbot-chip:hover { border-color: var(--primary-soft-border); background: var(--primary-soft); transform: translateX(3px); }
        .susbot-chip:active { transform: translateX(3px) scale(0.99); }

        /* Composer */
        .susbot-privacy { margin: 0 0 8px; font-size: 11px; line-height: 1.45; color: var(--ink-400); }
        .susbot-privacy a { color: var(--primary); }
        .susbot-composer {
          padding: 10px 10px 8px 14px;
          border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          border-radius: 16px;
          background: var(--elev);
          box-shadow: 0 1px 2px rgba(26,24,20,.04), 0 10px 24px -16px rgba(20,50,74,.3);
          transition: border-color .18s, box-shadow .18s;
        }
        .susbot-composer:focus-within {
          border-color: var(--primary);
          box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary) 14%, transparent), 0 10px 24px -16px rgba(20,50,74,.3);
        }
        .susbot-composer textarea:focus-visible { outline: none; }
        .susbot-dica { margin: 0; font-size: 11px; color: var(--ink-300); }
        .susbot-send {
          width: 34px; height: 34px; border-radius: 11px; border: 0; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          background: linear-gradient(145deg, var(--accent, #4E8BB8), var(--primary) 70%);
          color: #fff; box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--primary) 80%, transparent);
          transition: transform .15s cubic-bezier(0.2,0.7,0.2,1), box-shadow .15s, background .2s, color .2s;
        }
        .susbot-send:hover:not(:disabled) { transform: translateY(-1px); }
        .susbot-send:active:not(:disabled) { transform: scale(0.94); }
        .susbot-send:disabled { background: var(--tint); color: var(--ink-300); box-shadow: none; cursor: default; }
        .susbot-rodape { margin: 8px 0 0; font-size: 11px; color: var(--ink-300); text-align: center; }

        .susbot-icon-btn {
          background: none; border: none; cursor: pointer; color: var(--ink-500);
          display: flex; padding: 7px; border-radius: 9px;
          transition: background .15s, color .15s, transform .12s;
        }
        .susbot-icon-btn:hover { background: var(--tint); color: var(--ink-900); }
        .susbot-icon-btn:active { transform: scale(0.94); }

        /* Botões da Clara (canais e confirmações) */
        .susbot-btn {
          min-height: 40px; padding: 9px 14px; border-radius: 11px; border: 1px solid transparent;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          font-size: 13px; font-weight: 700; cursor: pointer; text-decoration: none; white-space: nowrap;
          transition: transform .15s cubic-bezier(0.2,0.7,0.2,1), box-shadow .15s, background .15s, border-color .15s;
        }
        .susbot-btn:active:not(:disabled) { transform: scale(0.97); }
        .susbot-btn:disabled { opacity: .55; cursor: wait; }
        .susbot-btn--primary {
          background: linear-gradient(145deg, var(--accent, #4E8BB8), var(--primary) 70%); color: #fff;
          box-shadow: 0 6px 14px -8px color-mix(in srgb, var(--primary) 80%, transparent);
        }
        .susbot-btn--primary:hover:not(:disabled) { transform: translateY(-1px); }
        .susbot-btn--ghost { background: var(--elev); color: var(--ink-700); border-color: color-mix(in srgb, var(--ink-100) 80%, transparent); }
        .susbot-btn--ghost:hover:not(:disabled) { border-color: var(--primary-soft-border); background: var(--primary-soft); color: var(--primary); }
        .susbot-btn--danger { background: var(--elev); color: var(--bad); border-color: color-mix(in srgb, var(--bad) 28%, transparent); }
        .susbot-btn--danger:hover:not(:disabled) { background: color-mix(in srgb, var(--bad) 6%, var(--elev)); }

        /* Aviso de memória sob a resposta */
        @keyframes susbot-memoria-pulso { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.12); } }
        .susbot-memoria {
          margin: 10px 0 0; padding: 4px 10px 4px 8px; border-radius: 999px;
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 11px; font-weight: 700; border: 1px solid transparent; font-family: inherit;
          animation: susbot-rise .3s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .susbot-memoria--salvando { color: var(--ink-500); background: var(--subtle); border-color: var(--ink-100); }
        .susbot-memoria--salvando > :first-child { animation: susbot-memoria-pulso 1.1s ease-in-out infinite; }
        .susbot-memoria--ok {
          color: var(--primary); background: var(--primary-soft); border-color: var(--primary-soft-border); cursor: pointer;
        }
        .susbot-memoria--ok:hover { transform: translateY(-1px); }
        @media (prefers-reduced-motion: reduce) {
          .susbot-memoria, .susbot-memoria--salvando > :first-child { animation: none; }
        }

        /* Tela de canais */
        .susbot-canais { flex: 1; padding: 16px; display: flex; flex-direction: column; gap: 10px; animation: susbot-rise .35s cubic-bezier(0.2,0.7,0.2,1) both; }
        .susbot-canais__intro { margin: 0 0 6px; font-size: 13px; line-height: 1.55; color: var(--ink-500); }
        .susbot-canais__erro {
          margin: 0; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start; border-radius: 11px;
          background: color-mix(in srgb, var(--bad) 7%, var(--elev)); border: 1px solid color-mix(in srgb, var(--bad) 25%, transparent);
          color: var(--bad); font-size: 12.5px; line-height: 1.5;
        }
        .susbot-canal {
          border-radius: 14px; background: var(--elev);
          border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          box-shadow: 0 1px 2px rgba(26,24,20,.03), 0 8px 20px -14px rgba(20,50,74,.25);
          animation: susbot-rise .4s cubic-bezier(0.2,0.7,0.2,1) both;
          transition: border-color .2s, box-shadow .2s;
        }
        .susbot-canal:nth-child(3) { animation-delay: .05s; }
        .susbot-canal:nth-child(4) { animation-delay: .10s; }
        .susbot-canal:nth-child(5) { animation-delay: .15s; }
        .susbot-canal--ativo { border-color: var(--primary-soft-border); box-shadow: 0 0 0 3px var(--primary-soft), 0 8px 20px -14px rgba(20,50,74,.25); }
        .susbot-canal--breve { opacity: .72; }
        .susbot-canal__topo { display: flex; align-items: center; gap: 12px; padding: 13px 14px; }
        .susbot-canal__logo {
          width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; color: #fff;
          display: inline-flex; align-items: center; justify-content: center;
          box-shadow: 0 1px 0 rgba(255,255,255,.25) inset, 0 4px 10px -5px rgba(0,0,0,.35);
        }
        .susbot-canal__logo--web { background: linear-gradient(145deg, var(--accent, #4E8BB8), var(--primary) 70%); }
        .susbot-canal__logo--telegram { background: linear-gradient(145deg, #37AEE2, #1E96C8 70%); }
        .susbot-canal__logo--telegram svg { margin: 1px 1px 0 0; }
        .susbot-canal__logo--whatsapp { background: linear-gradient(145deg, #5FD37F, #25A75A 70%); }
        .susbot-canal__nome { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .susbot-canal__nome strong { font-size: 13.5px; font-weight: 700; color: var(--ink-900); }
        .susbot-canal__nome span { font-size: 12px; line-height: 1.4; color: var(--ink-500); overflow-wrap: anywhere; }
        .susbot-status-pill {
          flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 9px 4px 7px; border-radius: 999px; font-size: 11px; font-weight: 700;
          background: var(--tint); color: var(--ink-500);
        }
        .susbot-status-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; opacity: .7; }
        .susbot-status-pill--on { background: color-mix(in srgb, var(--good) 12%, var(--elev)); color: var(--good); }
        .susbot-status-pill--wait { background: var(--primary-soft); color: var(--primary); }
        .susbot-status-pill--wait::before { animation: susbot-caret 1.2s ease-in-out infinite; }
        .susbot-status-pill--breve::before { display: none; }
        .susbot-canal__corpo { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .susbot-canal__nota { margin: 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-500); }
        .susbot-canal__aviso { margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: var(--warn); }

        /* Passos do pareamento */
        .susbot-passos { position: relative; gap: 0; }
        .susbot-passo { display: flex; gap: 12px; padding: 6px 0 14px; position: relative; width: 100%; }
        .susbot-passo + .susbot-passo::before {
          content: ''; position: absolute; left: 13px; top: -8px; height: 14px; width: 2px; border-radius: 1px;
          background: color-mix(in srgb, var(--ink-100) 90%, transparent);
        }
        .susbot-passo__num {
          position: relative; width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          font-family: var(--ff-mono); font-size: 12px; font-weight: 700;
          background: var(--tint); color: var(--ink-500);
        }
        .susbot-passo--atual .susbot-passo__num { background: var(--primary); color: #fff; box-shadow: 0 4px 10px -4px color-mix(in srgb, var(--primary) 70%, transparent); }
        .susbot-passo--feito .susbot-passo__num { background: color-mix(in srgb, var(--good) 14%, var(--elev)); color: var(--good); }
        .susbot-passo__pulso { position: absolute; inset: 0; border-radius: 50%; border: 2px solid var(--primary); opacity: 0; animation: susbot-halo 2s ease-out .6s infinite; }
        .susbot-passo__conteudo { flex: 1; min-width: 0; padding-top: 4px; }
        .susbot-passo__conteudo strong { display: block; font-size: 13px; font-weight: 700; color: var(--ink-900); }
        .susbot-passo__conteudo p { margin: 4px 0 0; font-size: 12.5px; line-height: 1.5; color: var(--ink-500); }
        .susbot-passo__conteudo p b { color: var(--ink-900); font-weight: 700; }
        .susbot-passo:not(.susbot-passo--atual) .susbot-passo__conteudo { opacity: .75; }
        .susbot-convite { margin-top: 12px; display: flex; gap: 14px; align-items: stretch; flex-wrap: wrap; }
        .susbot-convite__qr {
          padding: 8px; border-radius: 12px; background: #fff; line-height: 0;
          border: 1px solid color-mix(in srgb, var(--ink-100) 80%, transparent);
          box-shadow: 0 8px 20px -14px rgba(20,50,74,.35);
          animation: susbot-msg-in .4s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .susbot-convite__acoes { flex: 1; min-width: 150px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
        .susbot-convite__acoes .susbot-btn { width: 100%; }
        .susbot-convite__acoes--linha { flex-direction: row; flex-wrap: wrap; margin-top: 12px; }
        .susbot-convite__acoes--linha .susbot-btn { width: auto; }
        .susbot-passos__cancelar { align-self: flex-start; margin-top: 2px; }
        .susbot-canais__rodape {
          margin: 6px 0 0; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start;
          border-radius: 11px; background: var(--subtle); color: var(--ink-500); font-size: 12px; line-height: 1.5;
        }
        .susbot-canais__rodape .material-symbols-rounded { color: var(--primary); flex-shrink: 0; margin-top: 1px; }

        .susbot-panel-shell {
          width: min(var(--chat-w), calc(100vw - var(--gap)));
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 1px 0 rgba(255,255,255,.35) inset, 0 2px 6px rgba(20,50,74,.10), 0 18px 44px -18px rgba(20,50,74,.35);
        }

        .susbot-panel-body {
          overflow-y: auto;
          overscroll-behavior: contain;
          scrollbar-gutter: stable;
        }

        .susbot-panel-fab {
          position: fixed; bottom: 24px; right: 24px; z-index: 50;
          height: 48px; padding: 0 16px 0 6px; border: 0; border-radius: 999px;
          display: inline-flex; align-items: center; gap: 9px; cursor: pointer;
          background: var(--elev); color: var(--ink-900);
          font-family: var(--ff-tight); font-size: 14px; font-weight: 800; letter-spacing: -0.01em;
          box-shadow: 0 1px 2px rgba(26,24,20,.06), 0 12px 28px -10px rgba(20,50,74,.45);
          transition: transform .2s cubic-bezier(0.2,0.7,0.2,1), box-shadow .2s;
          animation: susbot-rise .35s cubic-bezier(0.2,0.7,0.2,1) both;
        }
        .susbot-panel-fab:hover { transform: translateY(-2px); box-shadow: 0 1px 2px rgba(26,24,20,.06), 0 16px 32px -10px rgba(20,50,74,.5); }
        .susbot-panel-fab:active { transform: scale(0.97); }
        .susbot-panel-fab__mark {
          width: 36px; height: 36px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          background: linear-gradient(145deg, var(--accent, #4E8BB8), var(--primary) 60%, var(--primary-dark));
          color: #fff; font-size: 16px;
          box-shadow: 0 1px 0 rgba(255,255,255,.25) inset;
        }

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
          .susbot-chip { min-height: 44px; font-size: 13px; }
          .susbot-btn { min-height: 44px; }
          .susbot-convite__qr { display: none; }
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
          zIndex: 55, display: 'flex', flexDirection: 'column',
          transform: open ? 'translateX(0) scale(1)' : 'translateX(calc(100% + 24px)) scale(0.98)',
          opacity: open ? 1 : 0,
          transition: 'transform .42s cubic-bezier(0.32, 0.72, 0, 1), opacity .3s',
          pointerEvents: open ? 'auto' : 'none',
        }}
      >
        {/* Cabeçalho */}
        <div className="susbot-header">
          {viewMode !== 'chat' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setViewMode('chat')} title="Voltar" className="susbot-icon-btn">
                <MIcon m="arrow_back" size={19} />
              </button>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', fontFamily: 'var(--ff-tight)' }}>
                {viewMode === 'history' ? 'Conversas' : viewMode === 'memory' ? 'O que a Clara sabe' : 'Canais da Clara'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ClaraMark size={34} ativa={enviando} />
              <div>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--ink-900)', lineHeight: 1.15, fontFamily: 'var(--ff-tight)', letterSpacing: '-0.01em' }}>
                  Clara
                </p>
                <p className="susbot-contexto">
                  {enviando ? 'analisando…' : getSusbotPageLabel(page)}
                </p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            {viewMode === 'chat' && !demoReplay && (
              <>
                <button onClick={() => setViewMode('history')} title="Conversas anteriores" className="susbot-icon-btn">
                  <MIcon m="history" size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('memory')}
                  aria-label="O que a Clara sabe sobre você"
                  title="O que a Clara sabe sobre você"
                  className="susbot-icon-btn"
                >
                  <MIcon m="psychology" size={19} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('channels')}
                  aria-label="Canais conectados (Telegram, WhatsApp)"
                  title="Canais"
                  className="susbot-icon-btn"
                >
                  <MIcon m="hub" size={19} />
                </button>
                <button onClick={novaConversa} title="Nova conversa" className="susbot-icon-btn">
                  <MIcon m="edit_square" size={19} />
                </button>
              </>
            )}
            <button onClick={() => setOpen(false)} title={demoReplay ? "Fechar leitura guiada" : "Fechar (a conversa continua salva)"} className="susbot-icon-btn">
              <MIcon m="close" size={19} />
            </button>
          </div>
        </div>

        {demoReplay && <p style={{ padding: '10px 20px', fontSize: 12, color: 'var(--ink-500)' }} role="status">Clara · leitura guiada da demo ({demoReplay.cutoff}). Respostas locais do cenário; conversa temporária, sem IA conectada.</p>}
        {/* Corpo — histórico ou conversa */}
        {viewMode === 'memory' ? (
          <MemoriaClara />
        ) : viewMode === 'channels' ? (
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
              threadsDoCanal.map(t => <ItemHistorico key={t.id} thread={t} onAbrir={abrirThread} onApagar={apagarThread} />)
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
                <div className="susbot-vazio">
                  <ClaraMark size={48} />
                  <p className="susbot-vazio__titulo">O que você precisa decidir agora?</p>
                  <p className="susbot-vazio__texto">
                    {demoReplay ? `Consulte a leitura guiada do corte ${demoReplay.cutoff}. As perguntas abaixo apresentam o mesmo briefing demonstrativo.` : <>Pergunte sobre {getSusbotPageLabel(page)} ou sobre qualquer dado do município.</>}
                  </p>
                  <div className="susbot-vazio__chips">
                    {(demoReplay ? ['Apresentar o cenário deste mês', 'Explicar o estoque simulado', 'Ver as premissas de planejamento'] : SUGESTOES).map((s, i) => (
                      <button key={s} className="susbot-chip" style={{ animationDelay: `${0.12 + i * 0.06}s` }} onClick={() => void enviar(s)}>
                        <MIcon m={SUGESTOES_ICONES[i] || 'chat_bubble'} size={17} />
                        <span>{s}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {current.mensagens.map(m => (
                <div key={m.id} className="susbot-msg">
                  <Bolha msg={m} onNavigate={onNavigate} onConfirmar={confirmarAcao} onCancelar={cancelarConfirmacao} onAbrirMemoria={() => setViewMode('memory')} />
                </div>
              ))}
              <div ref={fimRef} />
            </div>

            {/* Input */}
            <div style={{ padding: '10px 12px 12px', flexShrink: 0 }}>
              <p id="clara-privacy" className="susbot-privacy">{demoReplay ? 'Conversa temporária da demonstração, descartada ao trocar o corte ou sair.' : 'As conversas podem ser salvas. Não envie dados identificáveis de pacientes.'} <a href="/privacidade" target="_blank" rel="noopener noreferrer">Privacidade (nova aba)</a></p>
              <div className="susbot-composer">
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
                    aria-describedby="clara-privacy"
                  style={{
                    width: '100%', fontSize: 13, border: 'none', padding: 0,
                    color: 'var(--ink-900)', background: 'transparent', resize: 'none',
                    overflow: 'hidden', lineHeight: 1.5, minHeight: 22, maxHeight: 120,
                  }}
                />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <p className="susbot-dica">Enter envia, Shift+Enter quebra linha</p>
                  <button
                    onClick={() => enviar()}
                    disabled={!input.trim() || enviando}
                    title="Enviar"
                    aria-label="Enviar mensagem à Clara"
                    className="susbot-send"
                  >
                    <MIcon m="arrow_upward" size={18} />
                  </button>
                </div>
              </div>
              <p className="susbot-rodape">{demoReplay ? 'Leitura local do cenário. Nenhuma ação real é executada.' : 'Respostas geradas automaticamente. Confira antes de decidir.'}</p>
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
        >
          <span className="susbot-panel-fab__mark">C</span>
          <span className="susbot-panel-fab__label">Clara</span>
        </button>
      )}
    </>
  );
}

export default ClaraPanel;
