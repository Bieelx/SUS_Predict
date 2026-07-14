// Tela 01 — Visão Geral (docs/telas/01-visao-geral.md)
//
// Briefing de risco do município, não um dashboard de BI descritivo: a tela responde
// "eu preciso agir hoje, e em quê" em camadas verticais, da mais crítica para a mais
// acessória (status → SusBot → alertas acionáveis → previsão + ranking regional).
// Todos os dados abaixo são mock estático — nenhum fetch/axios nesta tela.

import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Area, Line,
} from 'recharts';
import { Card, SectionTitle, Badge, MIcon } from '../shared/ui.jsx';

// ─── Mock: fatos canônicos do município (Cotia — SP, Dra. Márcia) ─────────────

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };

const STATUS = {
  nivel: 'alerta',
  cor: 'var(--risk-medio)',
  titulo: 'Município em alerta',
  frase: 'Dengue em alta e 2 insumos críticos',
  indice: 74,
};

const SUSBOT_TEXTO =
  'O município está em tendência de alta de dengue (+18% vs. mês anterior). Com o surto ' +
  'previsto para março, o estoque atual de Dipirona 500mg se esgota em 22 dias. ' +
  'Recomendamos iniciar processo licitatório esta semana.';

const ALERTAS = [
  {
    id: 'AL-1',
    severidade: 'critico',
    titulo: 'Ruptura em 22 dias — Dipirona 500mg',
    evidencia: 'consumo acelerado +12%',
    acao: 'Gerar ETP',
    tipo: 'etp',
    payload: { tipo: 'alerta', item: { nome: 'Dipirona 500mg', diasRestantes: 22, consumoSemanal: 120 } },
  },
  {
    id: 'AL-2',
    severidade: 'alerta',
    titulo: 'Surto previsto — dengue, 60 dias',
    evidencia: 'probabilidade 78% · modelo Holt',
    acao: 'Ver detalhes',
    tipo: 'navegar',
  },
  {
    id: 'AL-3',
    severidade: 'alerta',
    titulo: 'Ocupação UTI Adulto — projeção 87% em 30 dias',
    evidencia: 'Hospital Regional Oeste',
    acao: 'Ver detalhes',
    tipo: 'navegar',
  },
];

// Série mensal de dengue: 12 meses reais (ago/25–jul/26) + 8 meses previstos (ago/26–mar/27).
// jul/26 aparece em `real` e `previsto` (valor igual) só para a linha tracejada nascer sem
// gap visual a partir do último ponto real — não é um dado duplicado, é continuidade visual.
const DENGUE_SERIE = [
  { mes: 'ago/25', real: 65 },
  { mes: 'set/25', real: 48 },
  { mes: 'out/25', real: 42 },
  { mes: 'nov/25', real: 40 },
  { mes: 'dez/25', real: 58 },
  { mes: 'jan/26', real: 180 },
  { mes: 'fev/26', real: 340 },
  { mes: 'mar/26', real: 480 },
  { mes: 'abr/26', real: 290 },
  { mes: 'mai/26', real: 120 },
  { mes: 'jun/26', real: 70 },
  { mes: 'jul/26', real: 55, previsto: 55 },
  { mes: 'ago/26', previsto: 60,  icBaixo: 48,  icRange: 24 },
  { mes: 'set/26', previsto: 50,  icBaixo: 38,  icRange: 25 },
  { mes: 'out/26', previsto: 48,  icBaixo: 35,  icRange: 27 },
  { mes: 'nov/26', previsto: 55,  icBaixo: 40,  icRange: 32 },
  { mes: 'dez/26', previsto: 98,  icBaixo: 75,  icRange: 50 },
  { mes: 'jan/27', previsto: 225, icBaixo: 175, icRange: 105 },
  { mes: 'fev/27', previsto: 410, icBaixo: 320, icRange: 180 },
  { mes: 'mar/27', previsto: 520, icBaixo: 400, icRange: 240 },
];

// Ranking regional: municípios da regional de saúde de Cotia, por índice de risco (0-100).
const RANKING_REGIONAL = [
  { nome: 'Cotia',                valor: 74, voce: true },
  { nome: 'Itapevi',              valor: 61 },
  { nome: 'Osasco',               valor: 58 },
  { nome: 'Carapicuíba',          valor: 52 },
  { nome: 'Embu das Artes',       valor: 47 },
  { nome: 'Barueri',              valor: 34 },
  { nome: 'Vargem Grande Pta.',   valor: 28 },
];

function corFaixaRisco(valor) {
  if (valor >= 70) return 'var(--risk-alto)';
  if (valor >= 40) return 'var(--risk-medio)';
  return 'var(--risk-baixo)';
}

// ─── Sub-componentes da tela ────────────────────────────────────────────────

function BannerStatus({ onNavigate }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
        padding: '20px 26px', borderRadius: 14, marginBottom: 26,
        background: `color-mix(in srgb, ${STATUS.cor} 9%, var(--elev))`,
        border: `1px solid color-mix(in srgb, ${STATUS.cor} 28%, transparent)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <span
          style={{
            width: 14, height: 14, borderRadius: '50%', background: STATUS.cor,
            marginTop: 5, flexShrink: 0, animation: 'dot-pulse 2.4s ease-in-out infinite',
          }}
        />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <p style={{
              fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 15,
              letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-900)', margin: 0,
            }}>
              {STATUS.titulo}
            </p>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700,
              color: 'var(--ink-500)', background: 'var(--elev)', border: '1px solid var(--ink-100)',
              borderRadius: 99, padding: '2px 8px',
            }}>
              índice {STATUS.indice}/100
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink-700)', margin: 0 }}>{STATUS.frase}</p>
        </div>
      </div>
      <button
        onClick={() => onNavigate('alertas')}
        style={{
          flexShrink: 0, padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
          background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 700,
        }}
      >
        Ver plano
      </button>
    </div>
  );
}

function BlocoSusBot() {
  return (
    <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 18, marginBottom: 28, maxWidth: '78ch' }}>
      <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <MIcon m="smart_toy" size={14} /> SusBot
      </p>
      <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--ink-700)', margin: 0 }}>
        {SUSBOT_TEXTO}
      </p>
    </div>
  );
}

function BotaoAlerta({ children, primario, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
        border: primario ? 'none' : '1px solid var(--primary)',
        background: primario ? 'var(--primary)' : 'transparent',
        color: primario ? 'white' : 'var(--primary)',
      }}
    >
      {children}
    </button>
  );
}

function LinhaAlerta({ alerta, isLast, onNavigate, onGerarEtp }) {
  const dotCor = alerta.severidade === 'critico' ? 'var(--risk-alto)' : 'var(--risk-medio)';
  const handleAcao = () => {
    if (alerta.tipo === 'etp') onGerarEtp(alerta.payload);
    else onNavigate('alertas');
  };
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '15px 22px', borderBottom: isLast ? 'none' : '1px solid var(--ink-100)',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--subtle)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotCor, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-900)', whiteSpace: 'nowrap' }}>
          {alerta.titulo}
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {alerta.evidencia}
        </span>
      </div>
      <BotaoAlerta primario={alerta.tipo === 'etp'} onClick={handleAcao}>
        {alerta.acao}
      </BotaoAlerta>
    </div>
  );
}

function AlertasPrioritarios({ onNavigate, onGerarEtp }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionTitle>Alertas prioritários</SectionTitle>
      <Card>
        {ALERTAS.map((a, i) => (
          <LinhaAlerta
            key={a.id}
            alerta={a}
            isLast={i === ALERTAS.length - 1}
            onNavigate={onNavigate}
            onGerarEtp={onGerarEtp}
          />
        ))}
      </Card>
      <button
        onClick={() => onNavigate('alertas')}
        style={{
          marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 12.5, fontWeight: 600, color: 'var(--primary)',
        }}
      >
        Ver todos na Central de Alertas →
      </button>
    </div>
  );
}

function TooltipDengue({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const real = payload.find(p => p.dataKey === 'real')?.value;
  const previsto = payload.find(p => p.dataKey === 'previsto')?.value;
  const valor = real ?? previsto;
  if (valor == null) return null;
  return (
    <div style={{
      background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8,
      padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 2 }}>{label}</p>
      <p style={{ color: 'var(--ink-500)' }}>
        {real != null ? 'Casos reais: ' : 'Casos previstos: '}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>
          {valor.toLocaleString('pt-BR')}
        </span>
      </p>
    </div>
  );
}

function CardPrevisaoDengue() {
  return (
    <Card className="p-5">
      <SectionTitle>Previsão de casos — dengue</SectionTitle>
      <ResponsiveContainer width="100%" height={270}>
        <ComposedChart data={DENGUE_SERIE} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-100)" vertical={false} />
          <XAxis
            dataKey="mes" tick={{ fontSize: 10, fill: 'var(--ink-400)' }}
            axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} interval={1}
          />
          <YAxis tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={40} />
          <Tooltip content={<TooltipDengue />} />
          <Area type="monotone" dataKey="icBaixo" stackId="ic" stroke="none" fill="transparent" isAnimationActive={false} />
          <Area type="monotone" dataKey="icRange" stackId="ic" stroke="none" fill="var(--accent)" fillOpacity={0.16} isAnimationActive={false} />
          <Line type="monotone" dataKey="real" stroke="var(--primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="previsto" stroke="var(--accent)" strokeWidth={2.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: 'flex', gap: 18, marginTop: 4, fontSize: 11, color: 'var(--ink-500)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: 'var(--primary)', display: 'inline-block' }} />
          Real
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, borderTop: '2px dashed var(--accent)', display: 'inline-block' }} />
          Previsto (IC 80%)
        </span>
      </div>
    </Card>
  );
}

function CardRankingRegional() {
  const max = Math.max(...RANKING_REGIONAL.map(r => r.valor));
  return (
    <Card className="p-5">
      <SectionTitle>Ranking regional de risco</SectionTitle>
      <p style={{ fontSize: 11, color: 'var(--ink-400)', marginTop: -10, marginBottom: 14 }}>
        Regional de Saúde de Cotia
      </p>
      <div>
        {RANKING_REGIONAL.map(r => (
          <div key={r.nome} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{
              width: 104, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11.5, fontWeight: r.voce ? 700 : 500, color: 'var(--ink-900)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {r.nome}
              {r.voce && <Badge label="você" color="var(--primary)" />}
            </div>
            <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
              <div style={{
                width: `${(r.valor / max) * 100}%`, height: '100%', borderRadius: 99,
                background: corFaixaRisco(r.valor),
              }} />
            </div>
            <div style={{
              width: 36, flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace',
              fontSize: 12, fontWeight: r.voce ? 700 : 500, color: 'var(--ink-900)',
            }}>
              {r.valor.toLocaleString('pt-BR')}%
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function VisaoGeral({ onNavigate, onGerarEtp }) {
  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{
          fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800,
          color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4,
        }}>
          Visão Geral{' '}
          <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
            — {MUNICIPIO.nome}, {MUNICIPIO.uf}
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          Em 30 segundos: o que precisa da sua decisão agora.
        </p>
      </div>

      <BannerStatus onNavigate={onNavigate} />
      <BlocoSusBot />
      <AlertasPrioritarios onNavigate={onNavigate} onGerarEtp={onGerarEtp} />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20 }}>
        <CardPrevisaoDengue />
        <CardRankingRegional />
      </div>
    </div>
  );
}
