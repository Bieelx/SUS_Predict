// Tela 06c — Superlotação (docs/telas/06-analises-nivel2.md)
//
// Nível 2 do menu: consulta aprofundada sob demanda, não uma tela de decisão. Diferente
// de Alertas/Insumos, aqui não existe nenhum botão de saída para ETP/Alertas — é 100%
// consulta (decisão fechada nº 1 do doc). O elemento que domina o topo da tela não é um
// KPI, é o selo metodológico "não é tempo real" (decisão fechada nº 3 do doc): o CNES não
// publica ocupação ao vivo, e "Superlotação" é um nome que convida à expectativa errada.
// Todos os dados abaixo são mock estático — nenhum fetch/axios nesta tela.

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  ReferenceLine, PieChart, Pie, Cell,
} from 'recharts';
import { Card, SectionTitle, Badge, MIcon } from '../shared/ui.jsx';

// ─── Mock: fatos canônicos do município (Cotia — SP) ──────────────────────────
//
// Consistência com Alertas (alt-03/alt-05) e Visão Geral: UTI Adulto — Hospital Regional
// Oeste é o alerta ativo nº 1 (87% em 30 dias) e Enfermaria — Hospital Regional Oeste é o
// alerta com plano acionado (82%). Aqui essas mesmas unidades aparecem só como números —
// sem menção a alerta/plano/ação, porque a tela é consulta pura.

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };
const THRESHOLD = 85; // % — limite operacional de risco de saturação

const REGIOES = ['Cotia'];
const UNIDADES_FILTRO = ['Todas', 'Hospital Regional Oeste', 'Santa Casa de Cotia', 'UPA Central', 'UBS Cotia Centro'];
const SETORES_FILTRO = ['Todos', 'UTI', 'Enfermaria', 'Pronto-Socorro'];

// KPIs resumo — números de sistema (12 unidades cadastradas no município), não derivados
// diretamente das 8 linhas de tabela abaixo (que são a lista de observação/risco).
const KPIS = {
  unidadesEmRisco: 3,
  totalUnidades: 12,
  ocupacaoMediaProjetada: 78,
  horizonte: '60–90 dias',
};

// Gráfico central — projeção semanal de ocupação (0 a 13 semanas ≈ 90 dias), 4 unidades
// representativas. `hro` cruza o threshold de 85% por volta da semana 4–5 (~dia 30),
// consistente com o alerta ativo de Alertas.jsx. `hr` fica estável em ~82%, sem cruzar o
// threshold nesta janela — por isso não entra na lista de "risco alto" da tabela abaixo,
// só em "atenção". `sc` é uma média agregada do hospital (não uma unidade específica),
// por isso não aparece na tabela de unidades.
const SERIE_OCUPACAO = [
  { semana: 'S0',  hro: 71, hr: 80, ps: 69, sc: 63 },
  { semana: 'S1',  hro: 74, hr: 80, ps: 72, sc: 64 },
  { semana: 'S2',  hro: 77, hr: 81, ps: 68, sc: 63 },
  { semana: 'S3',  hro: 80, hr: 81, ps: 71, sc: 65 },
  { semana: 'S4',  hro: 84, hr: 82, ps: 70, sc: 64 },
  { semana: 'S5',  hro: 86, hr: 82, ps: 73, sc: 63 },
  { semana: 'S6',  hro: 87, hr: 82, ps: 69, sc: 64 },
  { semana: 'S7',  hro: 87, hr: 82, ps: 72, sc: 65 },
  { semana: 'S8',  hro: 88, hr: 83, ps: 75, sc: 64 },
  { semana: 'S9',  hro: 88, hr: 83, ps: 71, sc: 63 },
  { semana: 'S10', hro: 89, hr: 83, ps: 74, sc: 64 },
  { semana: 'S11', hro: 89, hr: 82, ps: 70, sc: 65 },
  { semana: 'S12', hro: 90, hr: 83, ps: 73, sc: 64 },
  { semana: 'S13', hro: 90, hr: 82, ps: 71, sc: 64 },
];

const LINHAS_OCUPACAO = [
  { key: 'hro', nome: 'UTI Adulto — Hospital Regional Oeste', cor: 'var(--risk-alto)', hospital: 'Hospital Regional Oeste', setor: 'UTI' },
  { key: 'hr',  nome: 'Enfermaria — Hospital Regional Oeste', cor: 'var(--primary)', hospital: 'Hospital Regional Oeste', setor: 'Enfermaria' },
  { key: 'ps',  nome: 'Pronto-Socorro — UPA Central', cor: 'var(--accent)', hospital: 'UPA Central', setor: 'Pronto-Socorro' },
  { key: 'sc',  nome: 'Santa Casa de Cotia (média geral)', cor: 'var(--ink-300)', hospital: 'Santa Casa de Cotia', setor: null },
];

// Breakdown — Camada 4, ranking fixo de 5 unidades (valores canônicos do brief, iguais aos
// campos "Projeção 30d" das linhas correspondentes na tabela abaixo).
const RANKING_RISCO = [
  { nome: 'UTI Adulto — Hospital Regional Oeste', pct: 87 },
  { nome: 'Enfermaria — Hospital Regional Oeste', pct: 82 },
  { nome: 'Pronto-Socorro — UPA Central', pct: 74 },
  { nome: 'UTI Pediátrica — Hospital Regional Oeste', pct: 68 },
  { nome: 'Enfermaria — Santa Casa de Cotia', pct: 61 },
];

const DISTRIBUICAO_SETOR = [
  { setor: 'UTI', pct: 34, cor: 'var(--primary)' },
  { setor: 'Enfermaria', pct: 41, cor: 'var(--accent)' },
  { setor: 'Pronto-Socorro', pct: 25, cor: 'var(--ink-300)' },
];

// Tabela detalhada — Camada 5. 8 unidades, das quais 3 em "Risco alto" (>= threshold em
// 60d), consistente com o KPI "3 de 12 unidades em risco".
const UNIDADES_TABELA = [
  { id: 'u1', unidade: 'UTI Adulto — Hospital Regional Oeste', hospital: 'Hospital Regional Oeste', setor: 'UTI', leitos: 24, atual: 78, p30: 87, p60: 90 },
  { id: 'u2', unidade: 'UTI Neonatal — Hospital Regional Oeste', hospital: 'Hospital Regional Oeste', setor: 'UTI', leitos: 10, atual: 76, p30: 80, p60: 86 },
  { id: 'u3', unidade: 'Pronto-Socorro — Hospital Regional Oeste', hospital: 'Hospital Regional Oeste', setor: 'Pronto-Socorro', leitos: 20, atual: 75, p30: 79, p60: 85 },
  { id: 'u4', unidade: 'Enfermaria — Hospital Regional Oeste', hospital: 'Hospital Regional Oeste', setor: 'Enfermaria', leitos: 80, atual: 79, p30: 82, p60: 83 },
  { id: 'u5', unidade: 'Pronto-Socorro — UPA Central', hospital: 'UPA Central', setor: 'Pronto-Socorro', leitos: 12, atual: 69, p30: 74, p60: 76 },
  { id: 'u6', unidade: 'UTI Pediátrica — Hospital Regional Oeste', hospital: 'Hospital Regional Oeste', setor: 'UTI', leitos: 10, atual: 65, p30: 68, p60: 70 },
  { id: 'u7', unidade: 'Enfermaria — Santa Casa de Cotia', hospital: 'Santa Casa de Cotia', setor: 'Enfermaria', leitos: 60, atual: 58, p30: 61, p60: 63 },
  { id: 'u8', unidade: 'Pronto-Socorro — UBS Cotia Centro', hospital: 'UBS Cotia Centro', setor: 'Pronto-Socorro', leitos: 6, atual: 48, p30: 51, p60: 53 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function situacaoDe(p60) {
  if (p60 >= THRESHOLD) return { rotulo: 'Risco alto', cor: 'var(--risk-alto)' };
  if (p60 >= 70) return { rotulo: 'Atenção', cor: 'var(--risk-medio)' };
  return { rotulo: 'Estável', cor: 'var(--risk-baixo)' };
}

function corPorFaixa(pct) {
  if (pct >= THRESHOLD) return 'var(--risk-alto)';
  if (pct >= 70) return 'var(--risk-medio)';
  return 'var(--risk-baixo)';
}

function baixarCsv(nomeArquivo, linhas) {
  const cabecalho = ['Unidade', 'Setor', 'Leitos (CNES)', 'Ocupação atual estimada', 'Projeção 30d', 'Projeção 60d', 'Situação'];
  const corpo = linhas.map(u => {
    const sit = situacaoDe(u.p60);
    return [u.unidade, u.setor, u.leitos, `${u.atual}%`, `${u.p30}%`, `${u.p60}%`, sit.rotulo].join(',');
  });
  const conteudo = [cabecalho.join(','), ...corpo].join('\n');
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Recorte aplicado (draft/applied — só recalcula quando "Recalcular" é clicado, nunca ao
// digitar/trocar um select). Sem filtro (Unidade=Todas, Setor=Todos) os valores voltam a
// ser exatamente os canônicos do brief (3 de 12, 78%, ranking com os 5 valores literais);
// com filtro, ranking/donut/KPIs passam a ser derivados das 8 unidades da tabela.
function calcularRecorte(filtros) {
  const unidadesFiltradas = UNIDADES_TABELA.filter(u => {
    const passaUnidade = filtros.unidade === 'Todas' || u.hospital === filtros.unidade;
    const passaSetor = filtros.setor === 'Todos' || u.setor === filtros.setor;
    return passaUnidade && passaSetor;
  });

  const semFiltro = filtros.unidade === 'Todas' && filtros.setor === 'Todos';
  if (semFiltro) {
    return {
      kpis: KPIS,
      ranking: RANKING_RISCO,
      donut: DISTRIBUICAO_SETOR,
      unidadesTabela: unidadesFiltradas,
    };
  }

  const total = unidadesFiltradas.length;
  const emRisco = unidadesFiltradas.filter(u => situacaoDe(u.p60).rotulo === 'Risco alto').length;
  const ocupacaoMedia = total > 0
    ? Math.round(unidadesFiltradas.reduce((s, u) => s + u.p60, 0) / total)
    : 0;

  const ranking = unidadesFiltradas
    .slice()
    .sort((a, b) => b.p30 - a.p30)
    .map(u => ({ nome: u.unidade, pct: u.p30 }));

  const contagemSetor = {};
  unidadesFiltradas.forEach(u => { contagemSetor[u.setor] = (contagemSetor[u.setor] || 0) + 1; });
  const donut = Object.entries(contagemSetor).map(([setor, count]) => ({
    setor,
    pct: total > 0 ? Math.round((count / total) * 100) : 0,
    cor: DISTRIBUICAO_SETOR.find(d => d.setor === setor)?.cor || 'var(--ink-300)',
  }));

  return {
    kpis: {
      unidadesEmRisco: emRisco,
      totalUnidades: total,
      ocupacaoMediaProjetada: ocupacaoMedia,
      horizonte: KPIS.horizonte,
    },
    ranking,
    donut,
    unidadesTabela: unidadesFiltradas,
  };
}

// ─── Sub-componentes ────────────────────────────────────────────────────────

function SeloNaoTempoReal() {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
        borderRadius: 10, background: 'var(--subtle)', border: '1px solid var(--ink-100)',
        marginBottom: 20,
      }}
    >
      <span style={{ color: 'var(--ink-500)', display: 'flex', flexShrink: 0 }}>
        <MIcon m="info" size={16} />
      </span>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-500)', margin: 0 }}>
        Projeção baseada em dados históricos (SIH + CNES) — não é monitoramento em tempo real.
      </p>
    </div>
  );
}

function FiltroSelect({ label, value, onChange, options, disabled }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
        {label}
      </span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '7px 10px', borderRadius: 8, border: '1px solid var(--ink-100)',
          fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)', background: 'var(--elev)',
          minWidth: 176, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
        }}
      >
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const estiloBotaoPrimario = {
  padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--primary)', color: 'white', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

const estiloBotaoOutline = {
  padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: '1px solid var(--ink-100)', background: 'var(--elev)', color: 'var(--ink-700)',
  display: 'inline-flex', alignItems: 'center', gap: 6,
};

function BarraFiltro({ draft, onChangeDraft, carregando, onRecalcular, onExportar }) {
  return (
    <Card className="p-4" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <FiltroSelect label="Região" value={draft.regiao} onChange={v => onChangeDraft({ ...draft, regiao: v })} options={REGIOES} disabled={carregando} />
          <FiltroSelect label="Unidade" value={draft.unidade} onChange={v => onChangeDraft({ ...draft, unidade: v })} options={UNIDADES_FILTRO} disabled={carregando} />
          <FiltroSelect label="Setor" value={draft.setor} onChange={v => onChangeDraft({ ...draft, setor: v })} options={SETORES_FILTRO} disabled={carregando} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onRecalcular} disabled={carregando} style={{ ...estiloBotaoOutline, opacity: carregando ? 0.7 : 1 }}>
            <span style={{ display: 'flex', animation: carregando ? 'superlotSpin 0.9s linear infinite' : 'none' }}>
              <MIcon m="refresh" size={15} />
            </span>
            {carregando ? 'Recalculando…' : 'Recalcular'}
          </button>
          <button onClick={onExportar} style={estiloBotaoPrimario}>
            <MIcon m="download" size={15} /> Exportar
          </button>
        </div>
      </div>
    </Card>
  );
}

function KpisResumo({ kpis }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 14, marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 25, fontWeight: 800, color: 'var(--risk-alto)' }}>
          {kpis.unidadesEmRisco} de {kpis.totalUnidades}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>unidades em risco de superlotação</span>
      </div>
      <span style={{ width: 1, height: 32, background: 'var(--ink-100)', margin: '0 30px' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 25, fontWeight: 800, color: 'var(--ink-900)' }}>
          {kpis.ocupacaoMediaProjetada}%
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>taxa de ocupação projetada média</span>
      </div>
      <span style={{ width: 1, height: 32, background: 'var(--ink-100)', margin: '0 30px' }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 25, fontWeight: 800, color: 'var(--ink-900)' }}>
          {kpis.horizonte}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>horizonte de projeção</span>
      </div>
    </div>
  );
}

function TooltipOcupacao({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, padding: '9px 12px', fontSize: 11.5, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color, margin: '2px 0' }}>
          {LINHAS_OCUPACAO.find(l => l.key === p.dataKey)?.nome}:{' '}
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{p.value}%</span>
        </p>
      ))}
    </div>
  );
}

function GraficoOcupacao({ filtros }) {
  const linhasVisiveis = LINHAS_OCUPACAO.filter(l => {
    const passaUnidade = filtros.unidade === 'Todas' || l.hospital === filtros.unidade;
    const passaSetor = filtros.setor === 'Todos' || l.setor === filtros.setor;
    return passaUnidade && passaSetor;
  });

  return (
    <Card className="p-5" style={{ marginBottom: 20 }}>
      <SectionTitle>Projeção de ocupação por unidade — 90 dias</SectionTitle>
      {linhasVisiveis.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center', padding: '40px 0' }}>
          Nenhuma unidade corresponde a este filtro.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={SERIE_OCUPACAO} margin={{ top: 6, right: 16, left: -12, bottom: 0 }}>
            <CartesianGrid stroke="var(--ink-50)" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 10.5, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
            <YAxis domain={[50, 100]} tick={{ fontSize: 10.5, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={38} />
            <Tooltip content={<TooltipOcupacao />} />
            <Legend wrapperStyle={{ fontSize: 11.5, paddingTop: 10 }} />
            <ReferenceLine
              y={THRESHOLD}
              stroke="var(--risk-alto)"
              strokeDasharray="5 4"
              label={{ value: `limite ${THRESHOLD}%`, position: 'insideTopRight', fontSize: 10.5, fill: 'var(--risk-alto)', fontWeight: 700 }}
            />
            {linhasVisiveis.map(l => (
              <Line key={l.key} type="monotone" dataKey={l.key} name={l.nome} stroke={l.cor} strokeWidth={2.4} dot={false} isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function RankingRisco({ dados }) {
  const max = Math.max(...dados.map(r => r.pct), 1);
  return (
    <Card className="p-5">
      <SectionTitle>Ranking de unidades por risco de saturação</SectionTitle>
      {dados.length === 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center', padding: '24px 0' }}>
          Nenhuma unidade corresponde a este filtro.
        </p>
      )}
      {dados.slice().sort((a, b) => b.pct - a.pct).map(r => {
        const cor = corPorFaixa(r.pct);
        return (
          <div key={r.nome} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-900)' }}>{r.nome}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5, fontWeight: 700, color: cor }}>{r.pct}%</span>
            </div>
            <div style={{ height: 9, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
              <div style={{ width: `${(r.pct / max) * 100}%`, height: '100%', borderRadius: 99, background: cor }} />
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function DonutSetor({ dados }) {
  return (
    <Card className="p-5">
      <SectionTitle>Distribuição por setor</SectionTitle>
      {dados.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--ink-400)', textAlign: 'center', padding: '24px 0' }}>
          Nenhuma unidade corresponde a este filtro.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <ResponsiveContainer width="100%" height={170}>
              <PieChart>
                <Pie
                  data={dados}
                  dataKey="pct"
                  nameKey="setor"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  isAnimationActive={false}
                >
                  {dados.map(d => <Cell key={d.setor} fill={d.cor} />)}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value}%`, name]}
                  contentStyle={{ fontSize: 11.5, borderRadius: 8, border: '1px solid var(--ink-100)' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
            {dados.map(d => (
              <div key={d.setor} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: d.cor, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--ink-700)', flex: 1 }}>{d.setor}</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>{d.pct}%</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

const estiloTh = {
  textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)',
};
const estiloTd = { padding: '12px 14px', fontSize: 12.5, color: 'var(--ink-900)' };
const estiloTdMono = { ...estiloTd, fontFamily: 'JetBrains Mono, monospace' };

function TabelaUnidades({ unidades, onExportar }) {
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 0' }}>
        <h2 style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
          Unidades com risco de saturação
        </h2>
        <button onClick={onExportar} style={{ ...estiloBotaoOutline, padding: '6px 12px', fontSize: 11.5 }}>
          <MIcon m="grid_on" size={14} /> .xlsx
        </button>
      </div>
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ink-100)' }}>
              <th style={estiloTh}>Unidade</th>
              <th style={estiloTh}>Setor</th>
              <th style={estiloTh}>Leitos (CNES)</th>
              <th style={estiloTh}>Ocupação atual estimada</th>
              <th style={estiloTh}>Projeção 30d</th>
              <th style={estiloTh}>Projeção 60d</th>
              <th style={estiloTh}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {unidades.map((u, i) => {
              const sit = situacaoDe(u.p60);
              return (
                <tr key={u.id} style={{ borderBottom: i === unidades.length - 1 ? 'none' : '1px solid var(--ink-100)' }}>
                  <td style={{ ...estiloTd, fontWeight: 700 }}>{u.unidade}</td>
                  <td style={estiloTd}>{u.setor}</td>
                  <td style={estiloTdMono}>{u.leitos.toLocaleString('pt-BR')}</td>
                  <td style={estiloTdMono}>{u.atual}%</td>
                  <td style={estiloTdMono}>{u.p30}%</td>
                  <td style={{ ...estiloTdMono, fontWeight: 700, color: sit.cor }}>{u.p60}%</td>
                  <td style={estiloTd}><Badge label={sit.rotulo} color={sit.cor} /></td>
                </tr>
              );
            })}
            {unidades.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--ink-400)' }}>
                  Nenhuma unidade corresponde a este filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

const FILTROS_INICIAIS = { regiao: 'Cotia', unidade: 'Todas', setor: 'Todos' };

export default function Superlotacao({ onNavigate }) {
  // Padrão draft/applied (igual a Epidemiologia.jsx): trocar um select só atualiza o
  // rascunho — nada na tela muda até o usuário clicar em "Recalcular".
  const [draft, setDraft] = useState(FILTROS_INICIAIS);
  const [aplicado, setAplicado] = useState(FILTROS_INICIAIS);
  const [carregando, setCarregando] = useState(false);

  const recorte = useMemo(() => calcularRecorte(aplicado), [aplicado]);

  const recalcular = () => {
    setCarregando(true);
    setTimeout(() => {
      setAplicado(draft);
      setCarregando(false);
    }, 600);
  };

  const semFiltroAplicado = aplicado.unidade === 'Todas' && aplicado.setor === 'Todos';
  const nomeArquivoFiltro = semFiltroAplicado ? 'superlotacao-cotia.csv' : 'superlotacao-cotia-filtrado.csv';

  const exportarFiltro = () => baixarCsv(nomeArquivoFiltro, recorte.unidadesTabela);
  const exportarTabela = () => baixarCsv('superlotacao-cotia-unidades.csv', recorte.unidadesTabela);

  return (
    <div className="rise">
      <style>{'@keyframes superlotSpin { to { transform: rotate(360deg); } }'}</style>

      <SeloNaoTempoReal />

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Superlotação{' '}
          <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
            — {MUNICIPIO.nome}, {MUNICIPIO.uf}
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          Projeção de ocupação de leitos por unidade, cruzando tendência SIH e capacidade instalada CNES.
        </p>
      </div>

      <BarraFiltro draft={draft} onChangeDraft={setDraft} carregando={carregando} onRecalcular={recalcular} onExportar={exportarFiltro} />

      <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity 0.15s', pointerEvents: carregando ? 'none' : 'auto' }}>
        <KpisResumo kpis={recorte.kpis} />

        <GraficoOcupacao filtros={aplicado} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
          <RankingRisco dados={recorte.ranking} />
          <DonutSetor dados={recorte.donut} />
        </div>

        <TabelaUnidades unidades={recorte.unidadesTabela} onExportar={exportarTabela} />
      </div>
    </div>
  );
}
