// Tela 04 — Gerador de ETP (docs/telas/04-gerador-etp.md)
//
// Não é destino de navegação — é uma ação contextual disparada de Insumos ou Alertas.
// O shell (App.jsx) monta este componente sempre; ele só abre um modal quando `origem`
// é definida. Fica montado mesmo depois de fechado, para que o toast de conclusão
// sobreviva ao fechamento do modal. Todos os dados são mock — nenhum fetch/axios.

import { useState, useEffect, useRef } from 'react';
import { MIcon } from '../shared/ui.jsx';
import { REFERENCIA_LEGAL, baixarEtpPdf, dataHojeBr } from '../shared/etp.js';

const ETAPAS = [
  { id: 1, label: 'Dados do sistema' },
  { id: 2, label: 'Dados da secretaria' },
  { id: 3, label: 'Revisão do texto' },
  { id: 4, label: 'Geração' },
];

function justificativaPadrao(item) {
  const qtd = Math.round((item.consumoSemanal || 0) * 26);
  const dias = item.diasRestantes ?? '—';
    return `O consumo de ${item.nome} apresenta tendencia de alta acelerada (+12%), conforme previsao do modelo Holt/SINAN. Mantido o ritmo atual, projeta-se o esgotamento do estoque disponivel em ${dias} dias, o que compromete a continuidade do atendimento caso nao haja reposicao planejada.

Recomenda-se a aquisicao de aproximadamente ${qtd.toLocaleString('pt-BR')} unidades de ${item.nome}, quantidade estimada para cobrir a demanda projetada dos proximos 6 meses.

A formalizacao desta compra por meio de processo planejado, amparado neste Estudo Tecnico Preliminar, evita o recurso a compra emergencial - historicamente 30 a 40% mais cara que a aquisicao planejada - resultando em economia relevante para a Secretaria e garantindo a continuidade da assistencia a populacao.`;
}

// Rascunho pré-existente coerente com o chip "Rascunho — 28/06/2026" de Documentos.jsx
// ([Continuar] retoma exatamente no meio do fluxo, não do zero).
const RASCUNHOS_INICIAIS = {
  'Soro fisiológico 1L': {
    etapa: 2,
    dados: { dotacao: '2026.08.0032 - Farmacia Basica (a confirmar)', unidade: '', responsavel: '' },
    texto: justificativaPadrao({ nome: 'Soro fisiológico 1L', diasRestantes: 28, consumoSemanal: 340 }),
    aprovado: false,
  },
};

const estiloBotaoPrimario = {
  padding: '9px 17px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--primary)', color: 'white', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloBotaoPrimarioDesabilitado = {
  ...estiloBotaoPrimario, background: 'var(--ink-100)', color: 'var(--ink-400)', cursor: 'not-allowed',
};

const estiloBotaoOutline = {
  padding: '9px 17px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: '1px solid var(--ink-100)', background: 'var(--elev)', color: 'var(--ink-700)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ etapaAtual }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 22, padding: '16px 26px',
      borderBottom: '1px solid var(--ink-100)',
    }}>
      {ETAPAS.map(e => {
        const estado = e.id < etapaAtual ? 'concluida' : e.id === etapaAtual ? 'atual' : 'futura';
        const cor = estado === 'futura' ? 'var(--ink-400)' : 'var(--primary)';
        return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10.5, fontWeight: 800,
              background: estado === 'futura' ? 'var(--ink-100)' : 'var(--primary)',
              color: estado === 'futura' ? 'var(--ink-400)' : 'white',
            }}>
              {estado === 'concluida' ? <MIcon m="check" size={13} /> : e.id}
            </span>
            <span style={{ fontSize: 12, fontWeight: estado === 'atual' ? 700 : 600, color: cor }}>
              {e.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Etapa 1 — Dados do sistema (read-only) ────────────────────────────────

function CampoLeitura({ label, valor }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)', margin: '0 0 4px' }}>
        {label}
      </p>
      <p style={{ fontSize: 13.5, color: 'var(--ink-900)', margin: 0, lineHeight: 1.5 }}>
        {valor}
      </p>
    </div>
  );
}

function Etapa1DadosSistema({ item }) {
  const qtd6meses = Math.round((item.consumoSemanal || 0) * 26);
  const desatualizado = item.atualizadoHaDias != null && item.atualizadoHaDias > 15;

  return (
    <div>
      <CampoLeitura label="Medicamento / condição de origem" valor={item.nome} />
      <CampoLeitura
        label="Previsão de demanda"
        valor={`Consumo projetado ${(item.consumoSemanal ?? 0).toLocaleString('pt-BR')}/sem, com tendência de alta — modelo Holt/SINAN`}
      />
      <CampoLeitura
        label="Quantidade estimada para 6 meses"
        valor={`${qtd6meses.toLocaleString('pt-BR')} unidades`}
      />
      <div style={{ marginBottom: 4 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)', margin: '0 0 4px' }}>
          Referência legal aplicável
        </p>
        <p style={{ fontSize: 13.5, color: 'var(--ink-900)', margin: 0 }}>{REFERENCIA_LEGAL}</p>
        <p style={{ fontSize: 10.5, color: 'var(--ink-400)', margin: '3px 0 0', fontStyle: 'italic' }}>
          referência genérica — não substitui parecer jurídico
        </p>
      </div>

      {desatualizado && (
        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'flex-start', gap: 8,
          background: 'var(--warn)22', border: '1px solid var(--warn)', borderRadius: 9,
          padding: '10px 13px',
        }}>
          <span style={{ color: 'var(--warn)', display: 'flex', marginTop: 1 }}>
            <MIcon m="warning" size={16} />
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-700)' }}>
            Estoque atualizado há {item.atualizadoHaDias} dias — confiança reduzida.
            Isso não impede a geração do ETP; avalie se o dado ainda é confiável antes de avançar.
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Etapa 2 — Dados da secretaria ──────────────────────────────────────────

function CampoTexto({ label, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '9px 11px', borderRadius: 8, border: '1px solid var(--ink-100)',
          fontSize: 13, color: 'var(--ink-900)', background: 'var(--elev)',
        }}
      />
    </label>
  );
}

function Etapa2DadosSecretaria({ dados, onChange }) {
  return (
    <div>
      <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '0 0 18px', lineHeight: 1.6 }}>
        Dados que o sistema não tem acesso automático — preenchimento parcial é aceitável
        para deixar um rascunho e continuar depois.
      </p>
      <CampoTexto label="Dotação orçamentária" value={dados.dotacao} onChange={v => onChange({ ...dados, dotacao: v })} />
      <CampoTexto label="Unidade requisitante" value={dados.unidade} onChange={v => onChange({ ...dados, unidade: v })} />
      <CampoTexto label="Responsável técnico" value={dados.responsavel} onChange={v => onChange({ ...dados, responsavel: v })} />
    </div>
  );
}

// ─── Etapa 3 — Revisão da justificativa (trava obrigatória) ────────────────

function Etapa3Revisao({ texto, onTextoChange, aprovado, onAprovadoChange }) {
  return (
    <div>
      <p style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)', margin: '0 0 8px' }}>
        Justificativa técnica (editável)
      </p>
      <textarea
        value={texto}
        onChange={e => onTextoChange(e.target.value)}
        rows={9}
        style={{
          width: '100%', padding: '12px 13px', borderRadius: 9, border: '1px solid var(--ink-100)',
          fontSize: 13, lineHeight: 1.6, color: 'var(--ink-900)', background: 'var(--elev)',
          resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      <p style={{ fontSize: 10.5, color: 'var(--ink-400)', margin: '6px 0 16px', fontStyle: 'italic' }}>
        texto gerado com apoio de IA — revisão humana obrigatória
      </p>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={aprovado}
          onChange={e => onAprovadoChange(e.target.checked)}
          style={{ marginTop: 2, width: 15, height: 15, accentColor: 'var(--primary)', cursor: 'pointer' }}
        />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>
          Revisei e aprovo o texto acima
        </span>
      </label>
    </div>
  );
}

// ─── Etapa 4 — Geração ──────────────────────────────────────────────────────

function Etapa4Gerando() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 0', gap: 14 }}>
      <style>{'@keyframes etpSpin { to { transform: rotate(360deg); } }'}</style>
      <span style={{ display: 'flex', color: 'var(--primary)', animation: 'etpSpin 0.9s linear infinite' }}>
        <MIcon m="progress_activity" size={30} />
      </span>
      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>Gerando documento...</p>
    </div>
  );
}

// ─── Toast de conclusão ─────────────────────────────────────────────────────

function ToastEtpGerado({ toast, onClose }) {
  if (!toast) return null;
  return (
    <div
      style={{
        position: 'fixed', left: '50%', bottom: 26, transform: 'translateX(-50%)', zIndex: 90,
        background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 12,
        boxShadow: '0 10px 30px rgba(0,0,0,0.18)', padding: '13px 16px',
        display: 'flex', alignItems: 'center', gap: 16, maxWidth: '90vw',
        animation: 'etpToastIn 0.24s cubic-bezier(0.2, 0.7, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ color: 'var(--good)', display: 'flex' }}>
          <MIcon m="check_circle" size={19} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)' }}>
          ETP gerado — {toast.nome}
        </span>
      </div>
      <button onClick={() => baixarEtpPdf(toast)} style={{ ...estiloBotaoPrimario, padding: '7px 13px', fontSize: 11.5 }}>
        <MIcon m="download" size={14} /> Baixar PDF
      </button>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', display: 'flex' }}>
        <MIcon m="close" size={17} />
      </button>
    </div>
  );
}

// ─── Modal principal ────────────────────────────────────────────────────────

export default function GeradorEtp({ origem, onClose, onSalvarDocumento }) {
  // rascunhos: { [nomeItem]: { etapa, dados, texto, aprovado } } — sobrevive ao
  // fechamento do modal porque o componente fica sempre montado (contrato do shell).
  const [rascunhos, setRascunhos] = useState(RASCUNHOS_INICIAIS);
  const [toast, setToast] = useState(null);

  const [etapa, setEtapa] = useState(1);
  const [dados, setDados] = useState({ dotacao: '', unidade: '', responsavel: '' });
  const [texto, setTexto] = useState('');
  const [aprovado, setAprovado] = useState(false);

  const modalRef = useRef(null);

  const chave = origem?.item?.nome ?? null;

  // Ao abrir (origem passa de null para um item, ou troca de item), retoma o rascunho
  // salvo para aquele item, se existir, ou parte do zero pré-preenchido pelo sistema.
  useEffect(() => {
    if (!origem) return;
    const salvo = chave ? rascunhos[chave] : null;
    if (salvo) {
      setEtapa(salvo.etapa);
      setDados(salvo.dados);
      setTexto(salvo.texto);
      setAprovado(salvo.aprovado);
    } else {
      setEtapa(1);
      setDados({ dotacao: '', unidade: '', responsavel: '' });
      setTexto(justificativaPadrao(origem.item));
      setAprovado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origem]);

  // Dispara a geração mock ao entrar na etapa 4.
  useEffect(() => {
    if (etapa !== 4 || !origem) return;
    const nome = origem.item.nome;
    const t = setTimeout(() => {
      const documento = {
        id: `doc-${Date.now()}`,
        nome,
        item: origem.item,
        origem: origem.tipo === 'alerta' ? 'Alertas' : 'Insumos',
        data: dataHojeBr(),
        status: 'finalizado',
        texto,
      };
      setRascunhos(prev => {
        const cp = { ...prev };
        delete cp[nome];
        return cp;
      });
      onSalvarDocumento?.(documento);
      setToast(documento);
      onClose();
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etapa]);

  // Toast some sozinho depois de ~6s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  // Focus trap: ao abrir (ou trocar de etapa), leva o foco para dentro do modal,
  // para que Tab/Enter nunca escapem para a tela de fundo.
  useEffect(() => {
    if (!origem) return;
    const node = modalRef.current;
    if (!node) return;
    const id = requestAnimationFrame(() => {
      const focaveis = elementosFocaveis(node);
      (focaveis[0] || node).focus();
    });
    return () => cancelAnimationFrame(id);
  }, [origem, etapa]);

  function elementosFocaveis(container) {
    return Array.from(
      container.querySelectorAll('button, input, textarea, select, [href], [tabindex]')
    ).filter(el => !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null);
  }

  function handleKeyDownModal(e) {
    if (e.key !== 'Tab') return;
    const node = modalRef.current;
    if (!node) return;
    const focaveis = elementosFocaveis(node);
    if (focaveis.length === 0) { e.preventDefault(); return; }
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const dentro = node.contains(document.activeElement);
    if (e.shiftKey) {
      if (!dentro || document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      }
    } else {
      if (!dentro || document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    }
  }

  function handleTextoChange(v) {
    setTexto(v);
    setAprovado(false); // editar o texto exige nova aprovação
  }

  function handleProximo() {
    if (etapa === 1) { setEtapa(2); return; }
    if (etapa === 2) {
      setEtapa(3);
    }
  }

  function handleVoltar() {
    setEtapa(e => Math.max(1, e - 1));
  }

  function handleGerarDocumento() {
    if (!aprovado) return;
    setEtapa(4);
  }

  // Fechar no [x] antes da etapa 4 salva o rascunho no ponto exato onde parou.
  function fechar() {
    if (chave && etapa < 4) {
      setRascunhos(prev => ({ ...prev, [chave]: { etapa, dados, texto, aprovado } }));
      onSalvarDocumento?.({
        id: `draft-${chave}`,
        nome: chave,
        item: origem?.item,
        origem: origem?.tipo === 'alerta' ? 'Alertas' : 'Insumos',
        data: dataHojeBr(),
        status: 'rascunho',
      });
    }
    onClose();
  }

  return (
    <>
      <style>{`
        @keyframes etpModalIn {
          from { opacity: 0; transform: translate(-50%, -48%); }
          to { opacity: 1; transform: translate(-50%, -50%); }
        }

        @keyframes etpToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
      {origem && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.45)', zIndex: 80 }} />
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="etp-modal-titulo"
            tabIndex={-1}
            onKeyDown={handleKeyDownModal}
            style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 720, maxWidth: '94vw', maxHeight: '85vh',
              background: 'var(--elev)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.28)',
              zIndex: 81, display: 'flex', flexDirection: 'column', outline: 'none',
              animation: 'etpModalIn 0.24s cubic-bezier(0.2, 0.7, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 26px', borderBottom: '1px solid var(--ink-100)', flexShrink: 0 }}>
              <h3 id="etp-modal-titulo" style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 16.5, fontWeight: 800, color: 'var(--ink-900)', margin: 0 }}>
                Gerar ETP — {origem.item.nome}
              </h3>
              <button onClick={fechar} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', display: 'flex' }}>
                <MIcon m="close" size={20} />
              </button>
            </div>

            <div style={{ flexShrink: 0 }}>
              <Stepper etapaAtual={etapa} />
            </div>

            <div style={{ padding: '24px 26px', flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {etapa === 1 && <Etapa1DadosSistema item={origem.item} />}
              {etapa === 2 && <Etapa2DadosSecretaria dados={dados} onChange={setDados} />}
              {etapa === 3 && (
                <Etapa3Revisao
                  texto={texto}
                  onTextoChange={handleTextoChange}
                  aprovado={aprovado}
                  onAprovadoChange={setAprovado}
                />
              )}
              {etapa === 4 && <Etapa4Gerando />}
            </div>

            {etapa < 4 && (
              <div style={{
                display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '16px 26px',
                borderTop: '1px solid var(--ink-100)', boxShadow: '0 -4px 10px rgba(0,0,0,0.05)',
                flexShrink: 0,
              }}>
                {etapa > 1 && (
                  <button onClick={handleVoltar} style={estiloBotaoOutline}>Voltar</button>
                )}
                {etapa < 3 && (
                  <button
                    onClick={handleProximo}
                    style={estiloBotaoPrimario}
                  >
                    Próximo
                  </button>
                )}
                {etapa === 3 && (
                  <button
                    onClick={handleGerarDocumento}
                    disabled={!aprovado}
                    style={aprovado ? estiloBotaoPrimario : estiloBotaoPrimarioDesabilitado}
                  >
                    Gerar documento
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      <ToastEtpGerado toast={toast} onClose={() => setToast(null)} />
    </>
  );
}
