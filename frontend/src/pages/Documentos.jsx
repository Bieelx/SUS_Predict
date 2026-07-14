// Tela 04 — Histórico de Documentos (docs/telas/04-gerador-etp.md)
//
// Aba leve, de baixa prioridade no menu — consulta ocasional dos ETPs já gerados ou
// em rascunho. O histórico é sincronizado com o modal de ETP via App.jsx.

import { Card, MIcon } from '../shared/ui.jsx';
import { baixarEtpPdf } from '../shared/etp.js';

const STATUS_LABEL = { finalizado: 'Finalizado', rascunho: 'Rascunho' };
const STATUS_COR = { finalizado: 'var(--good)', rascunho: 'var(--warn)' };

// Fallback canônico para [Continuar] — usado só se algum documento rascunho vier sem
// payload completo do item (o fluxo normal salva `doc.item` via GeradorEtp.jsx).
const RASCUNHO_SORO = { nome: 'Soro fisiológico 1L', diasRestantes: 28, consumoSemanal: 340 };

const estiloBotaoPrimario = {
  padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--primary)', color: 'white', fontSize: 11.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloBotaoOutline = {
  padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  border: '1px solid var(--ink-100)', background: 'var(--elev)', color: 'var(--ink-700)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloTh = {
  textAlign: 'left', padding: '10px 18px', fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)',
};

const estiloTd = { padding: '13px 18px', fontSize: 12.5, color: 'var(--ink-900)' };

function StatusChip({ status }) {
  const cor = STATUS_COR[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '3px 9px', borderRadius: 999,
      fontSize: 10.5, fontWeight: 700, background: cor + '22', color: cor,
    }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function EstadoVazio() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: '68px 24px', background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 14,
    }}>
      <span style={{ color: 'var(--ink-300)', display: 'flex', marginBottom: 14 }}>
        <MIcon m="description" size={38} />
      </span>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 6px' }}>
        Nenhum documento gerado ainda
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
        Os ETPs nascem de um alerta ou item de Insumos — não existe um ETP genérico sem contexto.
      </p>
    </div>
  );
}

function TabelaDocumentos({ documentos, onGerarEtp }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ink-100)' }}>
              <th style={estiloTh}>Item relacionado</th>
              <th style={estiloTh}>Origem</th>
              <th style={estiloTh}>Data</th>
              <th style={estiloTh}>Status</th>
              <th style={estiloTh}></th>
            </tr>
          </thead>
          <tbody>
            {documentos.map((doc, i) => (
              <tr key={doc.id} style={{ borderBottom: i === documentos.length - 1 ? 'none' : '1px solid var(--ink-100)' }}>
                <td style={{ ...estiloTd, fontWeight: 700 }}>{doc.nome}</td>
                <td style={estiloTd}>{doc.origem}</td>
                <td style={{ ...estiloTd, fontFamily: 'JetBrains Mono, monospace' }}>{doc.data}</td>
                <td style={estiloTd}><StatusChip status={doc.status} /></td>
                <td style={{ ...estiloTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {doc.status === 'finalizado' ? (
                    <button onClick={() => baixarEtpPdf(doc)} style={estiloBotaoOutline}>
                      <MIcon m="download" size={14} /> Baixar
                    </button>
                  ) : (
                    <button onClick={() => onGerarEtp(doc.item || RASCUNHO_SORO)} style={estiloBotaoPrimario}>
                      Continuar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function Documentos({ onNavigate, onGerarEtp, documentos = [] }) {
  const continuarRascunho = item => {
    if (typeof onGerarEtp !== 'function') return;
    onGerarEtp({ tipo: 'insumo', item });
  };

  return (
    <div className="rise">
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Documentos
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          ETPs gerados
        </p>
      </div>

      {documentos.length === 0 ? (
        <EstadoVazio />
      ) : (
        <TabelaDocumentos documentos={documentos} onGerarEtp={continuarRascunho} />
      )}
    </div>
  );
}
