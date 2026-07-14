// Tela 06a — Epidemiologia (SINAN), Nível 2 do menu (docs/telas/06-analises-nivel2.md)
//
// Consulta aprofundada, sob demanda — decisão fechada no doc: NENHUM link/ação de saída
// para Insumos/Alertas/ETP nesta tela ("Gerar ETP", "Acionar Plano" continuam vivendo
// exclusivamente lá). Aqui é 100% leitura: filtro → KPIs → sazonalidade → distribuições →
// tabela exportável. Todos os dados são mock estático — nenhum fetch/axios.

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts';
import { Card, SectionTitle, MIcon } from '../shared/ui.jsx';

// ─── Mock: fatos canônicos (Cotia/SP e municípios vizinhos da região) ─────────
//
// A doença padrão (Dengue) e o filtro Região=Cotia reproduzem exatamente os números
// canônicos do doc: 4.812 casos · 8,4% hospitalização · 0,3% óbito · 62/100 mil hab.
// Trocar o agravo aplica um fator multiplicador simples sobre a mesma série-base — não
// existe um dataset por agravo (decisão do brief, ver relatório final).

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Série mensal-base (dengue, região agregada): ano anterior (2025), ano atual (2026 —
// só até jul, ano corrente) e média histórica de 5 anos (mais suave, sem os picos dos
// anos de surto). 2026 fica ~18% acima de 2025 nos mesmos meses, coerente com dengue.
const SAZONALIDADE_BASE = {
  Jan: { anoAnterior: 98, atual: 116, media5: 89 },
  Fev: { anoAnterior: 137, atual: 162, media5: 118 },
  Mar: { anoAnterior: 157, atual: 185, media5: 128 },
  Abr: { anoAnterior: 137, atual: 162, media5: 118 },
  Mai: { anoAnterior: 98, atual: 116, media5: 89 },
  Jun: { anoAnterior: 69, atual: 81, media5: 69 },
  Jul: { anoAnterior: 49, atual: 57, media5: 59 },
  Ago: { anoAnterior: 39, atual: null, media5: 59 },
  Set: { anoAnterior: 39, atual: null, media5: 59 },
  Out: { anoAnterior: 49, atual: null, media5: 69 },
  Nov: { anoAnterior: 49, atual: null, media5: 59 },
  Dez: { anoAnterior: 59, atual: null, media5: 69 },
};

// Total anual-base (dengue, região agregada) — soma 2022-2026 = 4.812, batendo com o
// KPI canônico do doc para o filtro padrão (Dengue · 2022–2026 · Cotia).
const ANOS_BASE = [
  { ano: 2022, casosBase: 760 },
  { ano: 2023, casosBase: 845 },
  { ano: 2024, casosBase: 1348 }, // surto — coerente com o pico nacional de dengue em 2024
  { ano: 2025, casosBase: 980 },
  { ano: 2026, casosBase: 879, parcial: true }, // jan–jul, ano corrente
];

// Distribuição por cidade (dengue, base) — soma 4.812, igual ao KPI de casos.
const CIDADES_BASE = [
  { nome: 'Cotia', casosBase: 1840 },
  { nome: 'Itapevi', casosBase: 1120 },
  { nome: 'Osasco', casosBase: 980 },
  { nome: 'Carapicuíba', casosBase: 520 },
  { nome: 'Embu das Artes', casosBase: 352 },
];
const TOTAL_CIDADES_BASE = CIDADES_BASE.reduce((s, c) => s + c.casosBase, 0); // 4.812

const FAIXAS_ETARIAS = [
  { faixa: '0-9', pct: 8 },
  { faixa: '10-19', pct: 14 },
  { faixa: '20-39', pct: 38 },
  { faixa: '40-59', pct: 27 },
  { faixa: '60+', pct: 13 },
];

const GENERO = [
  { genero: 'Feminino', pct: 54 },
  { genero: 'Masculino', pct: 46 },
];

// Últimas 10 competências mensais para a tabela detalhada (Out/2025 → Jul/2026).
const MESES_TABELA = [
  { mes: 'Out', ano: 2025 }, { mes: 'Nov', ano: 2025 }, { mes: 'Dez', ano: 2025 },
  { mes: 'Jan', ano: 2026 }, { mes: 'Fev', ano: 2026 }, { mes: 'Mar', ano: 2026 },
  { mes: 'Abr', ano: 2026 }, { mes: 'Mai', ano: 2026 }, { mes: 'Jun', ano: 2026 }, { mes: 'Jul', ano: 2026 },
];

// Taxas de hospitalização/óbito plausíveis por agravo — dengue é o valor canônico do
// doc (8,4%/0,3%); os demais refletem a gravidade clínica relativa de cada doença
// (meningite e tuberculose internam e matam bem mais que dengue/chikungunya).
const AGRAVOS = [
  { id: 'dengue', label: 'Dengue', fator: 1, taxaHosp: 8.4, taxaObito: 0.3 },
  { id: 'tuberculose', label: 'Tuberculose', fator: 0.14, taxaHosp: 35, taxaObito: 4.5 },
  { id: 'meningite', label: 'Meningite', fator: 0.03, taxaHosp: 85, taxaObito: 8 },
  { id: 'chikungunya', label: 'Chikungunya', fator: 0.31, taxaHosp: 4, taxaObito: 0.1 },
  { id: 'leptospirose', label: 'Leptospirose', fator: 0.07, taxaHosp: 52, taxaObito: 6 },
];

const PERIODOS = [
  { id: '2022-2026', label: '2022–2026', anoIni: 2022 },
  { id: '2023-2026', label: '2023–2026', anoIni: 2023 },
  { id: '2024-2026', label: '2024–2026', anoIni: 2024 },
];

const REGIOES = ['Cotia', 'Itapevi', 'Osasco', 'Carapicuíba', 'Embu das Artes'];

const INCIDENCIA_BASE = 62;

// Agravos cujo padrão sazonal é de arbovirose (pico fev–abr, transmissão por mosquito) —
// usado só para o texto dinâmico abaixo do gráfico central, não afeta os números.
const AGRAVOS_ARBOVIROSE = ['dengue', 'chikungunya'];

// ─── Cálculo derivado do filtro (mock reativo, sem fetch) ─────────────────────
//
// "Região: Cotia" representa a região de saúde agregada (soma dos 5 municípios — igual
// ao total do breakdown "Por cidade"). Selecionar outro nome da lista recorta a mesma
// série-base para a fatia estimada daquele município (share dele no total da região) —
// decisão de implementação não explícita no doc, ver relatório final.
function calcularDados({ agravo, periodo, regiao }) {
  const agravoObj = AGRAVOS.find(a => a.id === agravo) || AGRAVOS[0];
  const periodoObj = PERIODOS.find(p => p.id === periodo) || PERIODOS[0];
  const cidadeSelecionada = CIDADES_BASE.find(c => c.nome === regiao);

  const fatorAgravo = agravoObj.fator;
  const fatorRegiao = regiao === 'Cotia' ? 1 : (cidadeSelecionada ? cidadeSelecionada.casosBase / TOTAL_CIDADES_BASE : 1);
  const fatorTotal = fatorAgravo * fatorRegiao;

  const anosFiltrados = ANOS_BASE.filter(a => a.ano >= periodoObj.anoIni);
  const casosTotal = Math.round(anosFiltrados.reduce((s, a) => s + a.casosBase, 0) * fatorTotal);
  const incidencia = Math.round(INCIDENCIA_BASE * fatorTotal * 10) / 10;

  const sazonalidade = MESES.map(mes => {
    const base = SAZONALIDADE_BASE[mes];
    return {
      mes,
      anoAnterior: Math.round(base.anoAnterior * fatorTotal),
      atual: base.atual == null ? null : Math.round(base.atual * fatorTotal),
      media5: Math.round(base.media5 * fatorTotal),
    };
  });

  const porCidade = CIDADES_BASE.map(c => ({
    nome: c.nome,
    casos: Math.round(c.casosBase * fatorAgravo),
    destaque: c.nome === regiao,
  }));

  const faixaEtaria = FAIXAS_ETARIAS.map(f => ({
    faixa: f.faixa,
    casos: Math.round(casosTotal * f.pct / 100),
  }));

  const desfechoPorAno = anosFiltrados.map(a => {
    const casosAno = Math.round(a.casosBase * fatorTotal);
    const hosp = Math.round(casosAno * agravoObj.taxaHosp / 100);
    const obitos = Math.round(casosAno * agravoObj.taxaObito / 100);
    const leves = Math.max(0, casosAno - hosp - obitos);
    return { ano: a.parcial ? `${a.ano} (parcial)` : String(a.ano), leves, hospitalizacoes: hosp, obitos };
  });

  const tabela = MESES_TABELA.map((row, i) => {
    const base = SAZONALIDADE_BASE[row.mes];
    const baseMensal = row.ano === 2025 ? base.anoAnterior : base.atual;
    const cidadeRow = CIDADES_BASE[i % CIDADES_BASE.length];
    const casos = regiao === 'Cotia'
      ? Math.round(baseMensal * fatorAgravo * (cidadeRow.casosBase / TOTAL_CIDADES_BASE))
      : Math.round(baseMensal * fatorTotal);
    return {
      competencia: `${row.mes}/${row.ano}`,
      cidade: regiao === 'Cotia' ? cidadeRow.nome : regiao,
      casos,
      hospitalizacoes: Math.round(casos * agravoObj.taxaHosp / 100),
      obitos: Math.round(casos * agravoObj.taxaObito / 100),
    };
  });

  const notaSazonalidade = AGRAVOS_ARBOVIROSE.includes(agravoObj.id)
    ? `Recorte de tendência multi-ano: ${periodoObj.label} · pico sazonal fev–abr, coerente com o ciclo de ${agravoObj.label.toLowerCase()}.`
    : `Recorte de tendência multi-ano: ${periodoObj.label} · pico sazonal fev–abr conforme padrão histórico de ${agravoObj.label.toLowerCase()}.`;

  return {
    agravoLabel: agravoObj.label,
    periodoLabel: periodoObj.label,
    regiaoLabel: regiao,
    notaSazonalidade,
    kpis: { casos: casosTotal, taxaHosp: agravoObj.taxaHosp, taxaObito: agravoObj.taxaObito, incidencia },
    sazonalidade,
    porCidade,
    faixaEtaria,
    genero: GENERO,
    desfechoPorAno,
    tabela,
  };
}

// ─── Export CSV mock (Blob local — sem fetch) ─────────────────────────────────

function exportarCSV(nomeArquivo, cabecalho, linhas) {
  const conteudo = [cabecalho.join(';'), ...linhas.map(l => l.join(';'))].join('\n');
  const blob = new Blob(['﻿' + conteudo], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Estilos reutilizados ───────────────────────────────────────────────────

const estiloBotaoPrimario = {
  padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'var(--primary)', color: 'white', fontSize: 12.5, fontWeight: 700,
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
};

const estiloBotaoOutline = {
  padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
  border: '1px solid var(--ink-100)', background: 'var(--elev)', color: 'var(--ink-700)',
  display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
};

const estiloTh = {
  textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)',
};
const estiloTd = { padding: '11px 14px', fontSize: 12.5, color: 'var(--ink-900)' };
const estiloTdMono = { ...estiloTd, fontFamily: 'JetBrains Mono, monospace' };

// ─── Sub-componentes ────────────────────────────────────────────────────────

function CampoSelect({ label, value, onChange, options, disabled }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
        {label}
      </span>
      <select
        value={value}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '8px 30px 8px 10px', borderRadius: 7, border: '1px solid var(--ink-100)',
          fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)', background: 'var(--elev)',
          cursor: disabled ? 'default' : 'pointer', minWidth: 152, opacity: disabled ? 0.6 : 1,
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function BarraFiltro({ draft, onChangeDraft, carregando, onRecalcular, onExportar }) {
  return (
    <Card className="p-4" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <CampoSelect
            label="Agravo"
            value={draft.agravo}
            disabled={carregando}
            onChange={v => onChangeDraft({ ...draft, agravo: v })}
            options={AGRAVOS.map(a => ({ value: a.id, label: a.label }))}
          />
          <CampoSelect
            label="Período"
            value={draft.periodo}
            disabled={carregando}
            onChange={v => onChangeDraft({ ...draft, periodo: v })}
            options={PERIODOS.map(p => ({ value: p.id, label: p.label }))}
          />
          <CampoSelect
            label="Região"
            value={draft.regiao}
            disabled={carregando}
            onChange={v => onChangeDraft({ ...draft, regiao: v })}
            options={REGIOES.map(r => ({ value: r, label: r }))}
          />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onRecalcular} disabled={carregando} style={{ ...estiloBotaoPrimario, opacity: carregando ? 0.75 : 1 }}>
            <span style={{ display: 'flex', animation: carregando ? 'epiSpin 0.8s linear infinite' : 'none' }}>
              <MIcon m="refresh" size={15} />
            </span>
            {carregando ? 'Recalculando…' : 'Recalcular'}
          </button>
          <button onClick={onExportar} style={estiloBotaoOutline}>
            <MIcon m="file_download" size={15} /> Exportar
          </button>
        </div>
      </div>
    </Card>
  );
}

function StatInline({ valor, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 23, fontWeight: 800, color: 'var(--ink-900)' }}>
        {valor}
      </span>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-500)' }}>{label}</span>
    </div>
  );
}

function Divisor() {
  return <span style={{ width: 1, height: 26, background: 'var(--ink-100)' }} />;
}

function KpisResumo({ kpis }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 20, marginBottom: 22 }}>
      <StatInline valor={kpis.casos.toLocaleString('pt-BR')} label="casos notificados" />
      <Divisor />
      <StatInline valor={`${kpis.taxaHosp.toLocaleString('pt-BR')}%`} label="taxa de hospitalização" />
      <Divisor />
      <StatInline valor={`${kpis.taxaObito.toLocaleString('pt-BR')}%`} label="taxa de óbito" />
      <Divisor />
      <StatInline valor={kpis.incidencia.toLocaleString('pt-BR')} label="/100 mil hab. incidência" />
    </div>
  );
}

function LegendaLinha({ itens }) {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
      {itens.map(it => (
        <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 16, height: it.tracejado ? 0 : 2.5, borderTop: it.tracejado ? `2px dashed ${it.cor}` : `2.5px solid ${it.cor}`,
          }} />
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-500)' }}>{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function TooltipSazonalidade({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 12px', fontSize: 11.5, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{label}</p>
      {payload.map(p => p.value != null && (
        <p key={p.dataKey} style={{ color: 'var(--ink-500)', margin: '2px 0' }}>
          {p.name}: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>{p.value.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  );
}

function GraficoSazonalidade({ dados, nota }) {
  return (
    <Card className="p-5" style={{ marginBottom: 20 }}>
      <SectionTitle>Sazonalidade mensal — 2026 × 2025 × média 5 anos</SectionTitle>
      <LegendaLinha itens={[
        { label: '2026 (atual)', cor: 'var(--primary)' },
        { label: '2025', cor: 'var(--accent)' },
        { label: 'Média 5 anos', cor: 'var(--ink-300)', tracejado: true },
      ]} />
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={dados} margin={{ top: 4, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-100)" vertical={false} />
          <XAxis dataKey="mes" tick={{ fontSize: 11, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={44} />
          <Tooltip content={<TooltipSazonalidade />} />
          <Line type="monotone" dataKey="media5" name="Média 5 anos" stroke="var(--ink-300)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="anoAnterior" name="2025" stroke="var(--accent)" strokeWidth={2.2} dot={{ r: 2.5 }} isAnimationActive={false} />
          <Line type="monotone" dataKey="atual" name="2026 (atual)" stroke="var(--primary)" strokeWidth={3} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p style={{ fontSize: 11, color: 'var(--ink-400)', margin: '10px 0 0' }}>
        {nota}
      </p>
    </Card>
  );
}

function PorCidade({ dados }) {
  const max = Math.max(...dados.map(d => d.casos), 1);
  return (
    <Card className="p-5">
      <SectionTitle>Por cidade</SectionTitle>
      {dados.map(c => (
        <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
          <div style={{ width: 92, flexShrink: 0, fontSize: 11.5, fontWeight: c.destaque ? 800 : 600, color: c.destaque ? 'var(--ink-900)' : 'var(--ink-500)' }}>
            {c.nome}
          </div>
          <div style={{ flex: 1, height: 9, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ width: `${(c.casos / max) * 100}%`, height: '100%', borderRadius: 99, background: c.destaque ? 'var(--primary)' : 'var(--accent)' }} />
          </div>
          <div style={{ width: 52, flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 11.5, fontWeight: 700, color: 'var(--ink-900)' }}>
            {c.casos.toLocaleString('pt-BR')}
          </div>
        </div>
      ))}
    </Card>
  );
}

function TooltipBarra({ active, payload, label, sufixo }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, padding: '7px 11px', fontSize: 11.5, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>{label}{sufixo || ''}</p>
      <p style={{ color: 'var(--ink-500)', margin: '2px 0 0' }}>
        {payload[0].value.toLocaleString('pt-BR')} casos
      </p>
    </div>
  );
}

function FaixaEtaria({ dados }) {
  return (
    <Card className="p-5">
      <SectionTitle>Faixa etária</SectionTitle>
      <ResponsiveContainer width="100%" height={186}>
        <BarChart data={dados} margin={{ top: 4, right: 6, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-100)" vertical={false} />
          <XAxis dataKey="faixa" tick={{ fontSize: 10.5, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 10.5, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={46} />
          <Tooltip content={<TooltipBarra />} cursor={{ fill: 'var(--subtle)' }} />
          <Bar dataKey="casos" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

const CORES_GENERO = ['var(--primary)', 'var(--accent)'];

function Genero({ dados }) {
  return (
    <Card className="p-5">
      <SectionTitle>Gênero</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <ResponsiveContainer width="100%" height={150}>
          <PieChart>
            <Pie data={dados} dataKey="pct" nameKey="genero" innerRadius={40} outerRadius={62} paddingAngle={2} isAnimationActive={false}>
              {dados.map((d, i) => <Cell key={d.genero} fill={CORES_GENERO[i % CORES_GENERO.length]} stroke="none" />)}
            </Pie>
            <Tooltip formatter={(v, n) => [`${v}%`, n]} contentStyle={{ fontSize: 11.5, borderRadius: 8, border: '1px solid var(--ink-100)' }} />
          </PieChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
          {dados.map((d, i) => (
            <div key={d.genero} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: CORES_GENERO[i % CORES_GENERO.length] }} />
              <span style={{ fontSize: 12, color: 'var(--ink-700)', fontWeight: 600 }}>{d.genero}</span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function TooltipDesfecho({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const rotulos = { leves: 'Leves', hospitalizacoes: 'Hospitalizações', obitos: 'Óbitos' };
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 12px', fontSize: 11.5, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 4 }}>{label}</p>
      {payload.slice().reverse().map(p => (
        <p key={p.dataKey} style={{ color: 'var(--ink-500)', margin: '2px 0' }}>
          {rotulos[p.dataKey]}: <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>{p.value.toLocaleString('pt-BR')}</span>
        </p>
      ))}
    </div>
  );
}

function DesfechoPorAno({ dados }) {
  return (
    <Card className="p-5" style={{ marginTop: 16 }}>
      <SectionTitle>Desfecho clínico por ano</SectionTitle>
      <LegendaLinha itens={[
        { label: 'Leves', cor: 'var(--risk-baixo)' },
        { label: 'Hospitalizações', cor: 'var(--risk-medio)' },
        { label: 'Óbitos', cor: 'var(--risk-alto)' },
      ]} />
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={dados} margin={{ top: 4, right: 14, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-100)" vertical={false} />
          <XAxis dataKey="ano" tick={{ fontSize: 11, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={48} />
          <Tooltip content={<TooltipDesfecho />} cursor={{ fill: 'var(--subtle)' }} />
          <Bar dataKey="leves" name="Leves" stackId="a" fill="var(--risk-baixo)" isAnimationActive={false} />
          <Bar dataKey="hospitalizacoes" name="Hospitalizações" stackId="a" fill="var(--risk-medio)" isAnimationActive={false} />
          <Bar dataKey="obitos" name="Óbitos" stackId="a" fill="var(--risk-alto)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

function TabelaDetalhada({ linhas, onExportar }) {
  return (
    <Card style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '18px 20px 4px' }}>
        <h2 style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>
          Casos por competência
        </h2>
        <button
          onClick={onExportar}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <MIcon m="table_view" size={14} /> .xlsx
        </button>
      </div>
      <div style={{ overflowX: 'auto', padding: '10px 4px 4px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ink-100)' }}>
              <th style={estiloTh}>Competência</th>
              <th style={estiloTh}>Cidade</th>
              <th style={{ ...estiloTh, textAlign: 'right' }}>Casos</th>
              <th style={{ ...estiloTh, textAlign: 'right' }}>Hospitalizações</th>
              <th style={{ ...estiloTh, textAlign: 'right' }}>Óbitos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.competencia}-${l.cidade}`} style={{ background: i % 2 === 1 ? 'var(--subtle)' : 'transparent' }}>
                <td style={{ ...estiloTd, fontWeight: 700 }}>{l.competencia}</td>
                <td style={estiloTd}>{l.cidade}</td>
                <td style={{ ...estiloTdMono, textAlign: 'right' }}>{l.casos.toLocaleString('pt-BR')}</td>
                <td style={{ ...estiloTdMono, textAlign: 'right' }}>{l.hospitalizacoes.toLocaleString('pt-BR')}</td>
                <td style={{ ...estiloTdMono, textAlign: 'right' }}>{l.obitos.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Epidemiologia({ onNavigate }) {
  const [draft, setDraft] = useState({ agravo: 'dengue', periodo: '2022-2026', regiao: 'Cotia' });
  const [aplicado, setAplicado] = useState({ agravo: 'dengue', periodo: '2022-2026', regiao: 'Cotia' });
  const [carregando, setCarregando] = useState(false);

  const dados = useMemo(() => calcularDados(aplicado), [aplicado]);

  function handleRecalcular() {
    setCarregando(true);
    setTimeout(() => {
      setAplicado(draft);
      setCarregando(false);
    }, 600);
  }

  function handleExportarGeral() {
    exportarCSV('epidemiologia_sinan.csv', ['Indicador', 'Valor'], [
      ['Agravo', dados.agravoLabel],
      ['Período', dados.periodoLabel],
      ['Região', dados.regiaoLabel],
      ['Casos notificados', dados.kpis.casos],
      ['Taxa de hospitalização (%)', dados.kpis.taxaHosp],
      ['Taxa de óbito (%)', dados.kpis.taxaObito],
      ['Incidência (/100 mil hab.)', dados.kpis.incidencia],
    ]);
  }

  function handleExportarTabela() {
    exportarCSV(
      'casos_por_competencia.csv',
      ['Competência', 'Cidade', 'Casos', 'Hospitalizações', 'Óbitos'],
      dados.tabela.map(l => [l.competencia, l.cidade, l.casos, l.hospitalizacoes, l.obitos]),
    );
  }

  return (
    <div className="rise">
      <style>{`@keyframes epiSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Epidemiologia{' '}
          <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
            — SINAN
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          Consulta de agravos notificáveis por agravo, período e região — {MUNICIPIO.nome}, {MUNICIPIO.uf}.
        </p>
      </div>

      <BarraFiltro
        draft={draft}
        onChangeDraft={setDraft}
        carregando={carregando}
        onRecalcular={handleRecalcular}
        onExportar={handleExportarGeral}
      />

      <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity 0.15s', pointerEvents: carregando ? 'none' : 'auto' }}>
        <KpisResumo kpis={dados.kpis} />

        <GraficoSazonalidade dados={dados.sazonalidade} nota={dados.notaSazonalidade} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <PorCidade dados={dados.porCidade} />
          <FaixaEtaria dados={dados.faixaEtaria} />
          <Genero dados={dados.genero} />
        </div>

        <DesfechoPorAno dados={dados.desfechoPorAno} />

        <TabelaDetalhada linhas={dados.tabela} onExportar={handleExportarTabela} />
      </div>
    </div>
  );
}
