// Tela 06b — Internações (SIH), nível 2 do menu (docs/telas/06-analises-nivel2.md)
//
// Consulta aprofundada, sob demanda: ao contrário da Visão Geral (sem filtro, mostra o
// que importa agora), aqui a razão de existir da tela é o usuário escolher o recorte
// (grupo diagnóstico, período, hospital). Caso de uso guia (doc): identificar quais
// diagnósticos geram mais internação e custo, para projetar demanda futura de leitos.
// Tela de CONSULTA PURA — nenhum link de saída para Insumos/Alertas/ETP (decisão fechada
// nº 1 do doc). Todos os dados abaixo são mock estático — nenhum fetch/axios nesta tela.

import { useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar, Line,
  PieChart, Pie, Cell,
} from 'recharts';
import { Card, SectionTitle, MIcon } from '../shared/ui.jsx';

// ─── Mock: fatos canônicos do município (Cotia — SP) ──────────────────────────

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };

// Série mensal (12 meses, ago/25–jul/26): volume de internações + custo total do mês
// (soma de VAL_TOT das AIH do período — dado que já vem do DATASUS, decisão fechada nº 2
// do doc, não é cadastro manual). O total de internações (2.418) e o custo total
// (R$ 3,84 mi) exibidos nos KPIs são a soma desta série, para os números baterem entre
// o resumo e o gráfico.
const MENSAL = [
  { mes: 'ago/25', internacoes: 185, custo: 293800 },
  { mes: 'set/25', internacoes: 190, custo: 301700 },
  { mes: 'out/25', internacoes: 198, custo: 314400 },
  { mes: 'nov/25', internacoes: 205, custo: 325500 },
  { mes: 'dez/25', internacoes: 215, custo: 341400 },
  { mes: 'jan/26', internacoes: 235, custo: 373200 },
  { mes: 'fev/26', internacoes: 250, custo: 397000 },
  { mes: 'mar/26', internacoes: 240, custo: 381100 },
  { mes: 'abr/26', internacoes: 205, custo: 325500 },
  { mes: 'mai/26', internacoes: 190, custo: 301700 },
  { mes: 'jun/26', internacoes: 175, custo: 277900 },
  { mes: 'jul/26', internacoes: 130, custo: 206400 },
];

const TOTAL_INTERNACOES = MENSAL.reduce((soma, m) => soma + m.internacoes, 0); // 2.418
const CUSTO_TOTAL = MENSAL.reduce((soma, m) => soma + m.custo, 0); // 3.839.600 ≈ R$ 3,84 mi
const PERMANENCIA_MEDIA = 5.2;
const TAXA_REINTERNACAO = 9.1;

// Principais grupos de causa: volume + custo médio por internação — soma dos volumes
// bate com TOTAL_INTERNACOES (2.418), consistente com o KPI e o gráfico central.
const GRUPOS_CAUSA = [
  { grupo: 'Respiratórias', volume: 640, custoMedio: 1850, permanenciaMedia: 5.1 },
  { grupo: 'Cardiovasculares', volume: 512, custoMedio: 3120, permanenciaMedia: 6.9 },
  { grupo: 'Infecciosas', volume: 488, custoMedio: 1540, permanenciaMedia: 4.4 },
  { grupo: 'Obstétricas', volume: 402, custoMedio: 1210, permanenciaMedia: 3.1 },
  { grupo: 'Traumas', volume: 376, custoMedio: 2780, permanenciaMedia: 6.5 },
];

const ORIGEM_AIH = [
  { origem: 'Pronto-Socorro', pct: 46, cor: 'var(--primary)' },
  { origem: 'Eletiva', pct: 22, cor: 'var(--accent)' },
  { origem: 'Encaminhamento UBS', pct: 19, cor: 'var(--info)' },
  { origem: 'Transferência', pct: 13, cor: 'var(--ink-300)' },
];

// Tabela detalhada — internações por AIH (~10 linhas mock). Nº AIH no formato de 13
// dígitos usado pelo DATASUS/SIH.
const INTERNACOES_AIH = [
  { aih: '4123456700123', cid: 'J18.9', diagnostico: 'Pneumonia não especificada', hospital: 'Hospital Regional Oeste', entrada: '02/07/2026', permanencia: 6, custo: 2150 },
  { aih: '4123456700124', cid: 'I21.9', diagnostico: 'Infarto agudo do miocárdio', hospital: 'Santa Casa de Cotia', entrada: '28/06/2026', permanencia: 9, custo: 5420 },
  { aih: '4123456700125', cid: 'O80', diagnostico: 'Parto único espontâneo', hospital: 'Hospital Regional Oeste', entrada: '25/06/2026', permanencia: 2, custo: 980 },
  { aih: '4123456700126', cid: 'A09', diagnostico: 'Diarreia e gastroenterite', hospital: 'UPA Central', entrada: '20/06/2026', permanencia: 3, custo: 740 },
  { aih: '4123456700127', cid: 'S72.0', diagnostico: 'Fratura do colo do fêmur', hospital: 'Hospital Regional Oeste', entrada: '15/06/2026', permanencia: 8, custo: 4680 },
  { aih: '4123456700128', cid: 'J45', diagnostico: 'Asma', hospital: 'Santa Casa de Cotia', entrada: '10/06/2026', permanencia: 4, custo: 1320 },
  { aih: '4123456700129', cid: 'I10', diagnostico: 'Complicação hipertensiva', hospital: 'Hospital Regional Oeste', entrada: '05/06/2026', permanencia: 7, custo: 3150 },
  { aih: '4123456700130', cid: 'A15', diagnostico: 'Tuberculose respiratória', hospital: 'Santa Casa de Cotia', entrada: '30/05/2026', permanencia: 12, custo: 2980 },
  { aih: '4123456700131', cid: 'O14', diagnostico: 'Pré-eclâmpsia', hospital: 'UPA Central', entrada: '22/05/2026', permanencia: 5, custo: 1860 },
  { aih: '4123456700132', cid: 'S06.0', diagnostico: 'Traumatismo craniano leve', hospital: 'Hospital Regional Oeste', entrada: '18/05/2026', permanencia: 3, custo: 2240 },
];

const OPCOES_GRUPO = [
  { value: 'todos', label: 'Todos' },
  { value: 'respiratorias', label: 'Respiratórias' },
  { value: 'cardiovasculares', label: 'Cardiovasculares' },
  { value: 'infecciosas', label: 'Infecciosas' },
  { value: 'obstetricas', label: 'Obstétricas' },
  { value: 'traumas', label: 'Traumas' },
];

const OPCOES_PERIODO = [
  { value: '3m', label: 'Últimos 3 meses' },
  { value: '6m', label: 'Últimos 6 meses' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: '24m', label: 'Últimos 24 meses' },
];

const OPCOES_HOSPITAL = [
  { value: 'todos', label: 'Todos' },
  { value: 'regional-oeste', label: 'Hospital Regional Oeste' },
  { value: 'santa-casa-cotia', label: 'Santa Casa de Cotia' },
  { value: 'upa-central', label: 'UPA Central' },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatarReal(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatarMilhoes(valor) {
  return `R$ ${(valor / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mi`;
}

function baixarCsvMock(nomeArquivo, cabecalho, linhas) {
  const conteudo = [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportarResumo() {
  baixarCsvMock(
    'internacoes-sih-resumo.csv',
    ['mes', 'internacoes', 'custo_total'],
    MENSAL.map(m => [m.mes, m.internacoes, m.custo]),
  );
}

function exportarTabelaAih() {
  baixarCsvMock(
    'internacoes-por-aih.csv',
    ['numero_aih', 'cid', 'diagnostico', 'hospital', 'entrada', 'permanencia_dias', 'custo'],
    INTERNACOES_AIH.map(r => [r.aih, r.cid, r.diagnostico, r.hospital, r.entrada, r.permanencia, r.custo]),
  );
}

// ─── Estilos reutilizados ───────────────────────────────────────────────────

const estiloBotaoPrimario = {
  padding: '8px 15px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--primary)', color: 'white', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloBotaoOutline = {
  padding: '8px 15px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: '1px solid var(--ink-100)', background: 'var(--elev)', color: 'var(--ink-700)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloTh = {
  textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)',
};
const estiloTd = { padding: '11px 14px', fontSize: 12.5, color: 'var(--ink-900)' };
const estiloTdMono = { ...estiloTd, fontFamily: 'JetBrains Mono, monospace' };

// ─── Sub-componentes ────────────────────────────────────────────────────────

function SelectFiltro({ label, value, onChange, options }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '7px 10px', borderRadius: 8, border: '1px solid var(--ink-100)',
          fontSize: 12.5, color: 'var(--ink-900)', background: 'var(--elev)', minWidth: 168,
          cursor: 'pointer',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function BarraFiltro({ filtros, onMudarFiltro, recalculando, onRecalcular, onExportar }) {
  return (
    <Card className="p-4" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <SelectFiltro
            label="Grupo diagnóstico" value={filtros.grupo}
            onChange={v => onMudarFiltro('grupo', v)} options={OPCOES_GRUPO}
          />
          <SelectFiltro
            label="Período" value={filtros.periodo}
            onChange={v => onMudarFiltro('periodo', v)} options={OPCOES_PERIODO}
          />
          <SelectFiltro
            label="Hospital" value={filtros.hospital}
            onChange={v => onMudarFiltro('hospital', v)} options={OPCOES_HOSPITAL}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onRecalcular} disabled={recalculando} style={{ ...estiloBotaoPrimario, opacity: recalculando ? 0.7 : 1, cursor: recalculando ? 'default' : 'pointer' }}>
            <MIcon m="refresh" size={15} /> {recalculando ? 'Recalculando…' : 'Recalcular'}
          </button>
          <button onClick={onExportar} style={estiloBotaoOutline}>
            <MIcon m="download" size={15} /> Exportar
          </button>
        </div>
      </div>
    </Card>
  );
}

function ParteKpi({ valor, label }) {
  return (
    <span>
      <strong style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 800, color: 'var(--ink-900)' }}>{valor}</strong>{' '}
      <span style={{ color: 'var(--ink-700)' }}>{label}</span>
    </span>
  );
}

function KpisResumo() {
  return (
    <p style={{ fontSize: 15.5, lineHeight: 1.8, margin: '0 0 24px' }}>
      <ParteKpi valor={TOTAL_INTERNACOES.toLocaleString('pt-BR')} label="internações" />
      <span style={{ color: 'var(--ink-300)', margin: '0 12px' }}>·</span>
      <ParteKpi valor={PERMANENCIA_MEDIA.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} label="dias permanência média" />
      <span style={{ color: 'var(--ink-300)', margin: '0 12px' }}>·</span>
      <ParteKpi valor={`${TAXA_REINTERNACAO.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%`} label="reinternação em 30 dias" />
      <span style={{ color: 'var(--ink-300)', margin: '0 12px' }}>·</span>
      <ParteKpi valor={formatarMilhoes(CUSTO_TOTAL)} label="custo total SIH" />
    </p>
  );
}

function TooltipInternacoes({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const internacoes = payload.find(p => p.dataKey === 'internacoes')?.value;
  const custo = payload.find(p => p.dataKey === 'custo')?.value;
  return (
    <div style={{
      background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{label}</p>
      <p style={{ color: 'var(--ink-500)', margin: '0 0 2px' }}>
        Internações: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>{internacoes?.toLocaleString('pt-BR')}</span>
      </p>
      <p style={{ color: 'var(--ink-500)', margin: 0 }}>
        Custo mensal: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>{formatarReal(custo)}</span>
      </p>
    </div>
  );
}

function GraficoCentral() {
  return (
    <Card className="p-5" style={{ marginBottom: 22 }}>
      <SectionTitle>Internações × custo mensal</SectionTitle>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={MENSAL} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-100)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis
            yAxisId="left" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={40}
          />
          <YAxis
            yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false}
            tickLine={false} width={56} tickFormatter={v => `${(v / 1000).toLocaleString('pt-BR')}k`}
          />
          <Tooltip content={<TooltipInternacoes />} />
          <Bar yAxisId="left" dataKey="internacoes" fill="var(--primary)" radius={[4, 4, 0, 0]} barSize={22} isAnimationActive={false} />
          <Line yAxisId="right" dataKey="custo" stroke="var(--accent)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 18, marginTop: 4, fontSize: 11, color: 'var(--ink-500)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--primary)', display: 'inline-block' }} />
          Internações (volume)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--accent)', display: 'inline-block' }} />
          Custo mensal (R$)
        </span>
      </div>
    </Card>
  );
}

function CardGruposCausa() {
  const max = Math.max(...GRUPOS_CAUSA.map(g => g.volume));
  return (
    <Card className="p-5">
      <SectionTitle>Principais grupos de causa</SectionTitle>
      {GRUPOS_CAUSA.slice().sort((a, b) => b.volume - a.volume).map(g => (
        <div key={g.grupo} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5, gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)' }}>{g.grupo}</span>
            <span style={{ fontSize: 11.5, color: 'var(--ink-500)', whiteSpace: 'nowrap' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>
                {g.volume.toLocaleString('pt-BR')}
              </span>{' '}
              · custo médio {formatarReal(g.custoMedio)}
            </span>
          </div>
          <div style={{ height: 9, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ width: `${(g.volume / max) * 100}%`, height: '100%', borderRadius: 99, background: 'var(--primary)' }} />
          </div>
        </div>
      ))}
    </Card>
  );
}

function CardPermanenciaPorGrupo() {
  const max = 9; // teto do range documentado (3–9 dias)
  return (
    <Card className="p-5">
      <SectionTitle>Permanência média por grupo</SectionTitle>
      {GRUPOS_CAUSA.slice().sort((a, b) => b.permanenciaMedia - a.permanenciaMedia).map(g => (
        <div key={g.grupo} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <div style={{ width: 108, flexShrink: 0, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-900)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {g.grupo}
          </div>
          <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ width: `${(g.permanenciaMedia / max) * 100}%`, height: '100%', borderRadius: 99, background: 'var(--accent)' }} />
          </div>
          <div style={{ width: 46, flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>
            {g.permanenciaMedia.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} d
          </div>
        </div>
      ))}
    </Card>
  );
}

function CardOrigemAih() {
  return (
    <Card className="p-5">
      <SectionTitle>Origem da AIH</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie
              data={ORIGEM_AIH} dataKey="pct" nameKey="origem" cx="50%" cy="50%"
              innerRadius={34} outerRadius={54} paddingAngle={2} isAnimationActive={false} stroke="none"
            >
              {ORIGEM_AIH.map(o => <Cell key={o.origem} fill={o.cor} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ flex: 1, minWidth: 0 }}>
          {ORIGEM_AIH.map(o => (
            <div key={o.origem} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: o.cor, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: 'var(--ink-700)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {o.origem}
              </span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-900)' }}>
                {o.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TabelaAih() {
  return (
    <Card>
      <div style={{ padding: '16px 18px 0' }}>
        <SectionTitle action={undefined}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Internações por AIH
          </span>
        </SectionTitle>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 18px 12px' }}>
        <button onClick={exportarTabelaAih} style={estiloBotaoOutline}>
          <MIcon m="download" size={15} /> .xlsx
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ink-100)' }}>
              <th style={estiloTh}>Nº AIH</th>
              <th style={estiloTh}>Diagnóstico (CID)</th>
              <th style={estiloTh}>Hospital</th>
              <th style={estiloTh}>Entrada</th>
              <th style={estiloTh}>Permanência</th>
              <th style={{ ...estiloTh, textAlign: 'right' }}>Custo</th>
            </tr>
          </thead>
          <tbody>
            {INTERNACOES_AIH.map((r, i) => (
              <tr
                key={r.aih}
                style={{
                  borderBottom: i === INTERNACOES_AIH.length - 1 ? 'none' : '1px solid var(--ink-100)',
                  background: i % 2 === 1 ? 'var(--subtle)' : 'transparent',
                }}
              >
                <td style={estiloTdMono}>{r.aih}</td>
                <td style={estiloTd}>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, marginRight: 6 }}>{r.cid}</span>
                  <span style={{ color: 'var(--ink-500)' }}>{r.diagnostico}</span>
                </td>
                <td style={estiloTd}>{r.hospital}</td>
                <td style={estiloTd}>{r.entrada}</td>
                <td style={estiloTdMono}>{r.permanencia} d</td>
                <td style={{ ...estiloTdMono, textAlign: 'right', fontWeight: 700 }}>{formatarReal(r.custo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Internacoes({ onNavigate }) {
  const [filtros, setFiltros] = useState({ grupo: 'todos', periodo: '12m', hospital: 'todos' });
  const [recalculando, setRecalculando] = useState(false);

  const mudarFiltro = (chave, valor) => setFiltros(prev => ({ ...prev, [chave]: valor }));

  const recalcular = () => {
    setRecalculando(true);
    setTimeout(() => setRecalculando(false), 600);
  };

  return (
    <div className="rise">
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800,
          color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4,
        }}>
          Internações{' '}
          <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
            — {MUNICIPIO.nome}, {MUNICIPIO.uf}
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          Quais diagnósticos geram mais internação e custo — para projetar demanda futura de leitos.
        </p>
      </div>

      <BarraFiltro
        filtros={filtros}
        onMudarFiltro={mudarFiltro}
        recalculando={recalculando}
        onRecalcular={recalcular}
        onExportar={exportarResumo}
      />

      <KpisResumo />

      <GraficoCentral />

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 20, marginBottom: 22 }}>
        <CardGruposCausa />
        <CardPermanenciaPorGrupo />
        <CardOrigemAih />
      </div>

      <TabelaAih />
    </div>
  );
}
