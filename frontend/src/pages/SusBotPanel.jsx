import { useState, useRef, useEffect } from 'react';
import { MIcon } from '../shared/ui.jsx';

// ─── Tela 08 — Painel de Conversa do SusBot ────────────────────────────────────
//
// Dock lateral direito (não modal, não bolha) — o dashboard segue visível por
// trás. Conversas são threads discretas (não uma linha do tempo única): fechar
// o painel [x] apenas esconde, "Nova conversa" arquiva a atual no histórico e
// abre uma em branco, nada é apagado. Ver docs/telas/08-painel-susbot.md.
//
// Mock-only: nenhum fetch. Respostas são geradas localmente por palavra-chave
// (askSusBot) e o histórico é semeado com duas conversas pré-existentes.

// ─── Rótulos de tela para o microtexto de contexto ("· enviado em Insumos") ───
const PAGE_LABELS = {
  'visao-geral': 'Visão Geral',
  'alertas': 'Alertas',
  'insumos': 'Insumos',
  'epidemiologia': 'Epidemiologia',
  'internacoes': 'Internações',
  'superlotacao': 'Superlotação',
  'documentos': 'Documentos',
  'configuracoes': 'Configurações',
  'perfil': 'Perfil',
};

let idSeq = 0;
function uid(prefixo = 'm') {
  idSeq += 1;
  return `${prefixo}-${idSeq}-${Date.now().toString(36)}`;
}

// ─── Motor de resposta mock (por palavra-chave) ────────────────────────────────

function detectarCategoria(perguntaLower) {
  if (perguntaLower.includes('erro')) return 'erro';
  if (['estoque', 'soro', 'dipirona'].some(k => perguntaLower.includes(k))) return 'estoque';
  if (['dengue', 'surto'].some(k => perguntaLower.includes(k))) return 'epidemio';
  if (perguntaLower.includes('alerta')) return 'alertas';
  return 'geral';
}

const ETAPA_LABEL = {
  estoque: 'consultando estoque...',
  epidemio: 'consultando indicadores epidemiológicos...',
  alertas: 'consultando alertas ativos...',
  erro: 'consultando...',
  geral: 'processando pergunta...',
};

const RESPOSTAS = {
  estoque: {
    texto:
      'Seu estoque de **Soro Fisiológico 1L** aguenta **28 dias** no consumo atual — dentro do limiar de segurança.\n\n' +
      '**Dipirona 500mg** está em situação mais crítica: **22 dias** restantes, abaixo do limiar de reposição de 30 dias.',
    link: { label: 'ver em Insumos →', page: 'insumos' },
  },
  epidemio: {
    texto:
      'Os casos notificados de **dengue** estão **+18%** em relação ao mês anterior. ' +
      'O modelo preditivo aponta **surto previsto para março**, com confiança de 78%.',
    link: { label: 'ver em Epidemiologia →', page: 'epidemiologia' },
  },
  alertas: {
    texto:
      'Você tem **3 novos alertas** aguardando triagem:\n' +
      '- 1 ruptura crítica (Dipirona 500mg)\n' +
      '- 1 surto previsto (dengue)\n' +
      '- 1 ocupação acima do threshold (UTI Adulto)',
    link: { label: 'ver em Alertas →', page: 'alertas' },
  },
  geral: {
    texto:
      'Ainda estou aprendendo essa. Posso ajudar com **estoque de insumos**, **tendências epidemiológicas** ' +
      'ou o **resumo de alertas ativos**. Reformule e eu tento de novo!',
    link: null,
  },
};

/**
 * Mock local — sem custo, funciona offline. Para ligar o backend do agente
 * (spec de arquitetura separado, fora do escopo desta tela), troque o corpo
 * por um fetch mantendo a mesma assinatura `async (categoria) => { texto, link }`.
 */
async function askSusBot(categoria) {
  await new Promise(r => setTimeout(r, 1200));
  if (categoria === 'erro') throw new Error('falha simulada de demonstração');
  return RESPOSTAS[categoria] || RESPOSTAS.geral;
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

// ─── Data relativa mock ("há 2 dias") ──────────────────────────────────────────

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
  const primeira = thread.mensagens.find(m => m.autor === 'user');
  if (!primeira) return 'Nova conversa';
  return primeira.texto.length > 48 ? `${primeira.texto.slice(0, 48)}…` : primeira.texto;
}

// ─── Seed do histórico (2 conversas pré-existentes) ───────────────────────────

function criarThreadSeed() {
  const doisD = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  const cincoD = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  const thread1 = {
    id: uid('t'),
    criadaEm: doisD,
    mensagens: [
      { id: uid(), autor: 'user', texto: 'Quanto dura meu estoque de soro?', page: 'insumos', ts: doisD },
      { id: uid(), autor: 'bot', texto: RESPOSTAS.estoque.texto, link: RESPOSTAS.estoque.link, ts: doisD },
      { id: uid(), autor: 'user', texto: 'E a dipirona, também está ok?', page: 'insumos', ts: doisD },
      {
        id: uid(), autor: 'bot',
        texto: 'A **Dipirona 500mg** está com **22 dias** restantes — abaixo do limiar de reposição, vale gerar um ETP.',
        link: RESPOSTAS.estoque.link, ts: doisD,
      },
    ],
  };

  const thread2 = {
    id: uid('t'),
    criadaEm: cincoD,
    mensagens: [
      { id: uid(), autor: 'user', texto: 'Tendência de dengue este mês', page: 'epidemiologia', ts: cincoD },
      { id: uid(), autor: 'bot', texto: RESPOSTAS.epidemio.texto, link: RESPOSTAS.epidemio.link, ts: cincoD },
    ],
  };

  return [thread1, thread2];
}

function criarThreadVazia() {
  return { id: uid('t'), criadaEm: new Date(), mensagens: [] };
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

function Bolha({ msg, onNavigate }) {
  const isUser = msg.autor === 'user';
  const isErro = msg.autor === 'error';

  if (isErro) {
    return (
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <SusBotAvatar size={24} />
        <div style={{
          maxWidth: '84%', padding: '9px 13px', fontSize: 13, lineHeight: 1.55,
          borderRadius: '12px 12px 12px 4px', background: 'color-mix(in srgb, var(--bad, #8A2A38) 10%, var(--elev))',
          border: '1px solid color-mix(in srgb, var(--bad, #8A2A38) 30%, transparent)', color: 'var(--ink-700)',
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
      }}>
        {isUser ? <p style={{ margin: 0 }}>{msg.texto}</p> : renderMd(msg.texto)}
        {isUser && (
          <p style={{
            margin: '5px 0 0', fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5,
            color: 'var(--ink-400)', textAlign: 'right',
          }}>
            · enviado em {PAGE_LABELS[msg.page] || msg.page}
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
        {formatRelativo(thread.criadaEm)} · {thread.mensagens.filter(m => m.autor === 'user').length} pergunta(s)
      </p>
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────

export function SusBotPanel({ page = 'visao-geral', onNavigate }) {
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState('chat'); // 'chat' | 'history'
  const [threads, setThreads] = useState(() => criarThreadSeed());
  const [current, setCurrent] = useState(() => criarThreadVazia());
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [etapa, setEtapa] = useState('');

  const fimRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (viewMode === 'chat') fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [current.mensagens, enviando, viewMode]);

  useEffect(() => {
    if (open && viewMode === 'chat') inputRef.current?.focus();
  }, [open, viewMode, current.id]);

  function adicionarMensagem(msg) {
    setCurrent(c => ({ ...c, mensagens: [...c.mensagens, msg] }));
  }

  async function enviar(textoForcado) {
    const pergunta = (textoForcado ?? input).trim();
    if (!pergunta || enviando) return;
    setInput('');

    const categoria = detectarCategoria(pergunta.toLowerCase());
    adicionarMensagem({ id: uid(), autor: 'user', texto: pergunta, page, ts: new Date() });
    setEnviando(true);
    setEtapa(ETAPA_LABEL[categoria]);

    try {
      const resp = await askSusBot(categoria);
      adicionarMensagem({ id: uid(), autor: 'bot', texto: resp.texto, link: resp.link, ts: new Date() });
    } catch {
      adicionarMensagem({
        id: uid(), autor: 'error',
        texto: 'Não consegui consultar os dados agora. Pode ser instabilidade temporária — tente de novo.',
        perguntaOriginal: pergunta, onRetry: enviar, ts: new Date(),
      });
    } finally {
      setEnviando(false);
      setEtapa('');
    }
  }

  function novaConversa() {
    if (current.mensagens.length > 0) {
      setThreads(ts => [current, ...ts]);
    }
    setCurrent(criarThreadVazia());
    setViewMode('chat');
  }

  function abrirThread(threadId) {
    const alvo = threads.find(t => t.id === threadId);
    if (!alvo) return;
    setThreads(ts => {
      const resto = ts.filter(t => t.id !== threadId);
      return current.mensagens.length > 0 ? [current, ...resto] : resto;
    });
    setCurrent(alvo);
    setViewMode('chat');
  }

  const semMensagens = current.mensagens.length === 0;

  return (
    <>
      <style>{`
        @keyframes susbotPanelIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Dock lateral — sempre montado, translada para fora quando fechado */}
      <div
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 400, maxWidth: '92vw',
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
            {threads.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center', padding: '24px 0' }}>
                Nenhuma conversa anterior ainda.
              </p>
            ) : (
              threads.map(t => <ItemHistorico key={t.id} thread={t} onAbrir={abrirThread} />)
            )}
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {semMensagens && !enviando && (
                <div style={{ textAlign: 'center', padding: '32px 12px', color: 'var(--ink-300)' }}>
                  <MIcon m="forum" size={28} />
                  <p style={{ fontSize: 12.5, color: 'var(--ink-400)', marginTop: 8 }}>
                    Pergunte algo sobre os dados desta tela — estoque, epidemiologia, alertas e mais.
                  </p>
                </div>
              )}

              {current.mensagens.map(m => (
                <Bolha key={m.id} msg={m} onNavigate={onNavigate} />
              ))}

              {enviando && <TypingIndicator etapa={etapa} />}
              <div ref={fimRef} />
            </div>

            {/* Input */}
            <div style={{ padding: 12, borderTop: '1px solid var(--ink-100)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                  placeholder="Pergunte ao SusBot..."
                  style={{
                    flex: 1, fontSize: 13, padding: '10px 14px', borderRadius: 99,
                    border: '1px solid var(--ink-100)', color: 'var(--ink-900)', outline: 'none',
                    background: 'var(--canvas)',
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
                SusBot pode cometer erros · respostas em modo demonstração
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
          style={{
            position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%',
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
