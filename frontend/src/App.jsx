import { useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Legend,
} from 'recharts';

// ─── Mock data ──────────────────────────────────────────────────────────────

const DENGUE_COMBINED = [
  { mes: 'Jan/22', real: 180 }, { mes: 'Fev/22', real: 320 }, { mes: 'Mar/22', real: 410 },
  { mes: 'Abr/22', real: 290 }, { mes: 'Mai/22', real: 140 }, { mes: 'Jun/22', real: 60 },
  { mes: 'Jul/22', real: 30 },  { mes: 'Ago/22', real: 28 },  { mes: 'Set/22', real: 45 },
  { mes: 'Out/22', real: 80 },  { mes: 'Nov/22', real: 130 }, { mes: 'Dez/22', real: 200 },
  { mes: 'Jan/23', real: 240 }, { mes: 'Fev/23', real: 380 }, { mes: 'Mar/23', real: 460 },
  { mes: 'Abr/23', real: 310 }, { mes: 'Mai/23', real: 160 }, { mes: 'Jun/23', real: 70 },
  { mes: 'Jul/23', real: 35 },  { mes: 'Ago/23', real: 32 },  { mes: 'Set/23', real: 55 },
  { mes: 'Out/23', real: 95 },  { mes: 'Nov/23', real: 150 }, { mes: 'Dez/23', real: 230 },
  { mes: 'Jan/24', real: 290 }, { mes: 'Fev/24', real: 440 }, { mes: 'Mar/24', real: 510 },
  { mes: 'Abr/24', real: 340 }, { mes: 'Mai/24', real: 185 }, { mes: 'Jun/24', real: 80 },
  { mes: 'Jul/24', real: 40 },  { mes: 'Ago/24', real: 38 },  { mes: 'Set/24', real: 62 },
  { mes: 'Out/24', real: 105 }, { mes: 'Nov/24', real: 175 }, { mes: 'Dez/24', real: 265 },
  { mes: 'Jan/25', real: 310 }, { mes: 'Fev/25', real: 480 }, { mes: 'Mar/25', real: 560 },
  { mes: 'Abr/25', real: 380 }, { mes: 'Mai/25', real: 200 }, { mes: 'Jun/25', real: 88 },
  { mes: 'Jul/25', real: 44 },  { mes: 'Ago/25', real: 42 },  { mes: 'Set/25', real: 68 },
  { mes: 'Out/25', real: 115 }, { mes: 'Nov/25', real: 190 }, { mes: 'Dez/25', real: 280 },
  // previsão
  { mes: 'Jan/26', prev: 340 }, { mes: 'Fev/26', prev: 520 }, { mes: 'Mar/26', prev: 485 },
  { mes: 'Abr/26', prev: 415 }, { mes: 'Mai/26', prev: 218 }, { mes: 'Jun/26', prev: 96 },
  { mes: 'Jul/26', prev: 48 },  { mes: 'Ago/26', prev: 46 },  { mes: 'Set/26', prev: 75 },
  { mes: 'Out/26', prev: 128 }, { mes: 'Nov/26', prev: 210 }, { mes: 'Dez/26', prev: 300 },
  { mes: 'Jan/27', prev: 355 }, { mes: 'Fev/27', prev: 430 }, { mes: 'Mar/27', prev: 485 },
];

const RISK_SUBSCORES = [
  { label: 'Epidemiológico',   value: 82, level: 'alto' },
  { label: 'Capacidade leitos', value: 68, level: 'medio' },
  { label: 'Estoque crítico',   value: 74, level: 'alto' },
  { label: 'Vacinação',         value: 58, level: 'medio' },
];

const RUPTURA_DONUT = [
  { name: 'Antibióticos',  value: 38, color: '#D94F4F' },
  { name: 'Analgésicos',   value: 24, color: '#E8903A' },
  { name: 'Antitérmicos',  value: 18, color: '#4A7FBF' },
  { name: 'Insulina',      value: 12, color: '#7B6BBF' },
  { name: 'Outros',        value: 8,  color: '#A8A39A' },
];

const ALERTAS = [
  { id: 1, titulo: 'Possível surto de Dengue nos próximos 60 dias', fonte: 'SINAN · Modelo Preditivo', tempo: 'há 12 min', tipo: 'Surto',   cor: '#D94F4F' },
  { id: 2, titulo: 'Ruptura iminente — Dipirona 500mg',              fonte: 'Estoque · UBS Cotia Centro', tempo: 'há 38 min', tipo: 'Insumo',  cor: '#E8903A' },
  { id: 3, titulo: 'Ocupação UTI Adulto acima de 90%',               fonte: 'CNES · Hospital Regional Oeste', tempo: 'há 1h 4min', tipo: 'Lotação', cor: '#D4883A' },
];

const EPI_SAZONALIDADE = [
  { mes: 'Jan', atual2026: 310, ano2025: 260, media5anos: 220 },
  { mes: 'Fev', atual2026: 520, ano2025: 440, media5anos: 380 },
  { mes: 'Mar', atual2026: 485, ano2025: 430, media5anos: 370 },
  { mes: 'Abr', atual2026: 415, ano2025: 370, media5anos: 310 },
  { mes: 'Mai', atual2026: 218, ano2025: 190, media5anos: 165 },
  { mes: 'Jun', atual2026: 96,  ano2025: 82,  media5anos: 72  },
  { mes: 'Jul', atual2026: 48,  ano2025: 38,  media5anos: 32  },
  { mes: 'Ago', atual2026: 46,  ano2025: 36,  media5anos: 30  },
  { mes: 'Set', atual2026: 75,  ano2025: 62,  media5anos: 52  },
  { mes: 'Out', atual2026: 128, ano2025: 110, media5anos: 95  },
  { mes: 'Nov', atual2026: 210, ano2025: 178, media5anos: 155 },
  { mes: 'Dez', atual2026: 300, ano2025: 258, media5anos: 220 },
];

const EPI_CIDADES = [
  { name: 'Cotia',        value: 30.8, total: 3843, color: '#1B5E6E' },
  { name: 'Barueri',      value: 23.4, total: 2921, color: '#4A7FBF' },
  { name: 'Carapicuíba',  value: 17.5, total: 2184, color: '#7B6BBF' },
  { name: 'Osasco',       value: 13.1, total: 1635, color: '#4A9B72' },
  { name: 'Itapevi',      value: 9.5,  total: 1186, color: '#D4883A' },
  { name: 'Jandira',      value: 5.8,  total: 724,  color: '#A8A39A' },
];

const EPI_FAIXA = [
  { faixa: '0–4',   casos: 480  },
  { faixa: '5–14',  casos: 1320 },
  { faixa: '15–29', casos: 2780 },
  { faixa: '30–44', casos: 3300 },
  { faixa: '45–59', casos: 2620 },
  { faixa: '60+',   casos: 1980 },
];

const EPI_GENERO = [
  { name: 'Feminino',  value: 54.8, color: '#B85C6E' },
  { name: 'Masculino', value: 45.2, color: '#4A7FBF' },
];

const EPI_DESFECHO = [
  { ano: '2022', leves: 5200, hosp: 320, obitos: 18 },
  { ano: '2023', leves: 6100, hosp: 380, obitos: 22 },
  { ano: '2024', leves: 7200, hosp: 452, obitos: 26 },
  { ano: '2025', leves: 8400, hosp: 540, obitos: 31 },
  { ano: '2026', leves: 9820, hosp: 620, obitos: 40 },
];

const SIH_MENSAL = [
  { mes: 'Jan', int: 118, custo: 890  }, { mes: 'Fev', int: 152, custo: 1120 },
  { mes: 'Mar', int: 168, custo: 1240 }, { mes: 'Abr', int: 145, custo: 1080 },
  { mes: 'Mai', int: 135, custo: 980  }, { mes: 'Jun', int: 128, custo: 920  },
  { mes: 'Jul', int: 122, custo: 875  }, { mes: 'Ago', int: 119, custo: 860  },
  { mes: 'Set', int: 130, custo: 940  }, { mes: 'Out', int: 142, custo: 1050 },
  { mes: 'Nov', int: 155, custo: 1140 }, { mes: 'Dez', int: 208, custo: 1560 },
];

const SIH_CAUSAS = [
  { grupo: 'A90 Dengue grave',    int: 482, custo: 'R$ 1.690' },
  { grupo: 'J18 Pneumonia',       int: 364, custo: 'R$ 2.210' },
  { grupo: 'I50 Insuf. cardíaca', int: 218, custo: 'R$ 3.490' },
  { grupo: 'J44 DPOC',            int: 184, custo: 'R$ 1.980' },
  { grupo: 'O80 Parto',           int: 162, custo: 'R$ 1.240' },
  { grupo: 'K35 Apendicite',      int: 142, custo: 'R$ 2.891' },
];

const SIH_PERMANENCIA = [
  { grupo: 'Dengue grave',    dias: 4.2, color: '#D94F4F' },
  { grupo: 'Pneumonia',       dias: 5.8, color: '#E8903A' },
  { grupo: 'Insuf. cardíaca', dias: 7.0, color: '#4A7FBF' },
  { grupo: 'DPOC',            dias: 6.2, color: '#7B6BBF' },
  { grupo: 'Parto',           dias: 2.4, color: '#4A9B72' },
  { grupo: 'Apendicite',      dias: 3.1, color: '#B85C6E' },
];

const SIH_ORIGEM = [
  { name: 'Pronto-socorro', value: 42, color: '#D94F4F' },
  { name: 'Eletivo',        value: 26, color: '#4A7FBF' },
  { name: 'Encam. UBS',     value: 18, color: '#4A9B72' },
  { name: 'Transferência',  value: 14, color: '#E8903A' },
];

const HEX_REGIONS = [
  { id: 'grande-sp',  label: 'Grande SP',   x: 230, y: 155, risk: 'alto',  casos: 13240, color: '#D94F4F' },
  { id: 'sorocaba',   label: 'Sorocaba',    x: 148, y: 215, risk: 'medio', casos: 4180,  color: '#E8903A' },
  { id: 'campinas',   label: 'Campinas',    x: 182, y: 98,  risk: 'medio', casos: 6820,  color: '#E8903A' },
  { id: 'ribeirao',   label: 'Ribeirão P.', x: 268, y: 62,  risk: 'medio', casos: 5210,  color: '#E8903A' },
  { id: 'sao-jose',   label: 'S.J.Campos',  x: 330, y: 98,  risk: 'baixo', casos: 3120,  color: '#4A9B6F' },
  { id: 'vale-para',  label: 'Vale Paraíba',x: 370, y: 155, risk: 'baixo', casos: 2840,  color: '#4A9B6F' },
  { id: 'baixada',    label: 'Baixada S.',  x: 278, y: 215, risk: 'alto',  casos: 7650,  color: '#D94F4F' },
  { id: 'aracat',     label: 'Araraquara',  x: 218, y: 30,  risk: 'baixo', casos: 2110,  color: '#4A9B6F' },
  { id: 'franca',     label: 'Franca',      x: 308, y: 22,  risk: 'baixo', casos: 1890,  color: '#4A9B6F' },
  { id: 'marilia',    label: 'Marília',     x: 138, y: 78,  risk: 'baixo', casos: 2450,  color: '#4A9B6F' },
  { id: 'bauru',      label: 'Bauru',       x: 128, y: 138, risk: 'medio', casos: 3640,  color: '#E8903A' },
  { id: 'pres-prud',  label: 'Pres.Prud.',  x: 78,  y: 100, risk: 'baixo', casos: 1980,  color: '#4A9B6F' },
];

// ─── Shared components ────────────────────────────────────────────────────────

function Card({ children, className = '', style = {} }) {
  return (
    <div className={`bg-white rounded-xl border border-ink-100 ${className}`} style={style}>
      {children}
    </div>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div className="flex items-baseline justify-between mb-4">
      <h2 style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814', margin: 0 }}>
        {children}
      </h2>
      {action && (
        <button style={{ fontSize: 11, fontWeight: 500, color: '#1B5E6E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          {action}
        </button>
      )}
    </div>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', background: color + '22', color }}>
      {label}
    </span>
  );
}

function ChartTip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E1D6', borderRadius: 8, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 600, color: '#3D3A33', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0', display: 'flex', gap: 8 }}>
          <span style={{ color: '#6B665D' }}>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{Number(p.value).toLocaleString('pt-BR')}{unit}</span>
        </p>
      ))}
    </div>
  );
}

function Sparkline({ data, color }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const SPARK_CASOS   = [42,55,48,62,70,58,80,75,90,84,96,88].map(v => ({ v }));
const SPARK_RISCO   = [60,62,64,65,66,68,68,70,70,71,72,72].map(v => ({ v }));
const SPARK_RUPTURA = [3,4,4,5,5,6,6,7,7,7,7,7].map(v => ({ v }));
const SPARK_VACINAL = [85,84,84,83,83,83,82,82,82,82,81,81].map(v => ({ v }));

function KpiCard({ label, value, delta, deltaLabel, icon, iconColor, sparkData, rising }) {
  const deltaColor = rising ? '#2A6B40' : '#8A2A38';
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B665D', marginBottom: 4 }}>
            {label}
          </p>
          <p style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 22, fontWeight: 800, color: '#1A1814', lineHeight: 1 }}>
            {value}
          </p>
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: iconColor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      {sparkData && <Sparkline data={sparkData} color={iconColor} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color: deltaColor, fontSize: 11, fontWeight: 700 }}>
          {rising ? '↑' : '↓'} {delta}
        </span>
        <span style={{ color: '#8A8579', fontSize: 11 }}>{deltaLabel}</span>
      </div>
    </Card>
  );
}

// ─── Risk Gauge ───────────────────────────────────────────────────────────────

function RiskGauge({ value }) {
  const r = 78;
  const cx = 100, cy = 100;
  const circumference = Math.PI * r;
  const fillLen = (value / 100) * circumference;
  const color = value >= 75 ? '#D94F4F' : value >= 55 ? '#E8903A' : '#4A9B6F';
  const levelLabel = value >= 75 ? 'ALTO' : value >= 55 ? 'MÉDIO' : 'BAIXO';
  const trackD = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg viewBox="0 0 200 115" style={{ width: '100%', maxWidth: 210 }}>
        <path d={trackD} fill="none" stroke="#E5E1D6" strokeWidth="14" strokeLinecap="round" />
        <path d={trackD} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={`${fillLen} ${circumference}`} />
        <text x="100" y="88" textAnchor="middle" fontFamily="Inter Tight, Inter, sans-serif"
          fontSize="26" fontWeight="800" fill="#1A1814">{value}%</text>
        <text x="100" y="106" textAnchor="middle" fontFamily="Inter, sans-serif"
          fontSize="9" fontWeight="700" letterSpacing="2" fill={color}>{levelLabel}</text>
      </svg>
    </div>
  );
}

// ─── HexMap ──────────────────────────────────────────────────────────────────

function hexPoints(cx, cy, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

function HexMap() {
  const [hovered, setHovered] = useState(null);
  const R = 32;
  return (
    <div>
      <svg viewBox="0 0 450 260" style={{ width: '100%', maxHeight: 260 }}>
        {HEX_REGIONS.map(reg => {
          const pts = hexPoints(reg.x, reg.y, R);
          const isH = hovered === reg.id;
          return (
            <g key={reg.id} onMouseEnter={() => setHovered(reg.id)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
              <polygon points={pts} fill={reg.color} fillOpacity={isH ? 0.95 : 0.7} stroke="white" strokeWidth="2"
                style={{ transition: 'fill-opacity 0.15s' }} />
              <text x={reg.x} y={reg.y - 3} textAnchor="middle" fontFamily="Inter, sans-serif"
                fontSize="7" fontWeight="700" fill="white">{reg.label}</text>
              <text x={reg.x} y={reg.y + 9} textAnchor="middle" fontFamily="JetBrains Mono, monospace"
                fontSize="6.5" fill="rgba(255,255,255,0.85)">{reg.casos.toLocaleString('pt-BR')}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        {[{ label: 'Alto', color: '#D94F4F' }, { label: 'Médio', color: '#E8903A' }, { label: 'Baixo', color: '#4A9B6F' }].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
            <span style={{ fontSize: 11, color: '#6B665D' }}>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Greeting Banner ─────────────────────────────────────────────────────────

function GreetingBanner() {
  return (
    <div style={{ background: 'linear-gradient(135deg, #1E3C3C 0%, #1B5E6E 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#4DB8A0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          MO
        </div>
        <div>
          <p style={{ color: 'white', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Boa tarde, Dr(a). Márcia 👋</p>
          <p style={{ color: '#C8D8D5', fontSize: 13 }}>
            O município apresenta <strong style={{ color: 'white' }}>4 alertas críticos</strong> e índice de risco{' '}
            <strong style={{ color: '#D94F4F' }}>72%</strong>. Análise preditiva atualizada há 8 min.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}>
          Ver alertas
        </button>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1E3C3C', background: '#4DB8A0', border: 'none', cursor: 'pointer' }}>
          Gerar ETP
        </button>
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ fields }) {
  return (
    <div style={{ background: '#1E3C3C', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      {fields.map(f => (
        <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6A9090' }}>{f.label}</label>
          <input defaultValue={f.value} style={{ borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: 'none', outline: 'none', background: '#2A5050', color: '#C8D8D5', minWidth: f.width || 140 }} />
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#1E3C3C', background: '#4DB8A0', border: 'none', cursor: 'pointer' }}>Recalcular</button>
        <button style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#C8D8D5', background: 'transparent', border: '1px solid #2A5050', cursor: 'pointer' }}>Exportar</button>
      </div>
    </div>
  );
}

// ─── Page: Visão Geral ────────────────────────────────────────────────────────

function PageVisaoGeral() {
  return (
    <div className="rise">
      <GreetingBanner />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <KpiCard label="Casos Notificados (30D)" value="4.812" delta="+12,4%" deltaLabel="vs mês anterior" icon="📊" iconColor="#4A7FBF" sparkData={SPARK_CASOS} rising={false} />
        <KpiCard label="Índice de Risco Regional" value="72%" delta="+8,0 p.p." deltaLabel="vs 30D anteriores" icon="⚠️" iconColor="#D94F4F" sparkData={SPARK_RISCO} rising={false} />
        <KpiCard label="UBS em Ruptura ou Alerta" value="7" delta="+2" deltaLabel="vs semana anterior" icon="💊" iconColor="#E8903A" sparkData={SPARK_RUPTURA} rising={false} />
        <KpiCard label="Cobertura Vacinal Média" value="81,3%" delta="-1,8 p.p." deltaLabel="vs trimestre anterior" icon="💉" iconColor="#4A9B72" sparkData={SPARK_VACINAL} rising={false} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Dengue forecast */}
        <Card className="p-5">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B665D', marginBottom: 4 }}>Previsão de casos</p>
              <h3 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 13, fontWeight: 700, color: '#1A1814' }}>Dengue (A90) · próximos 6 meses</h3>
            </div>
            <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#8A8579', background: '#F0EDE6', padding: '4px 8px', borderRadius: 6, textAlign: 'right', lineHeight: 1.4 }}>
              Prophet + XGBoost<br />confiança 89%
            </div>
          </div>
          <div style={{ height: 220, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={DENGUE_COMBINED} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 8, fill: '#A8A39A' }} tickLine={false} axisLine={false} interval={5} />
                <YAxis tick={{ fontSize: 8, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip unit=" casos" />} />
                <Line type="monotone" dataKey="real" name="Casos reais" stroke="#1B5E6E" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="prev" name="Previsão" stroke="#4DB8A0" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 10, color: '#8A8579', marginTop: 8, paddingTop: 8, borderTop: '1px solid #EFEBE0' }}>
            Pico estimado em Mar/27 · ~485 casos · 218% acima da média 5 anos
          </p>
          <button style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: '#1B5E6E', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Detalhar SINAN →
          </button>
        </Card>

        {/* Risk gauge */}
        <Card className="p-5">
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6B665D', marginBottom: 12 }}>Índice de Risco Regional</p>
          <RiskGauge value={72} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {RISK_SUBSCORES.map(s => {
              const c = s.level === 'alto' ? '#D94F4F' : s.level === 'medio' ? '#E8903A' : '#4A9B6F';
              return (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 12, color: '#6B665D', width: 130, flexShrink: 0 }}>{s.label}</span>
                  <div style={{ flex: 1, height: 5, borderRadius: 99, background: '#EFEBE0', overflow: 'hidden' }}>
                    <div style={{ width: `${s.value}%`, height: '100%', background: c, borderRadius: 99, transition: 'width 0.6s' }} />
                  </div>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#3D3A33', width: 24, textAlign: 'right' }}>{s.value}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 6px', borderRadius: 4, color: c, background: c + '18', width: 40, textAlign: 'center' }}>{s.level}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 28 }}>
        <Card className="p-5">
          <SectionTitle>Risco por Região · SP</SectionTitle>
          <HexMap />
        </Card>

        <Card className="p-5">
          <SectionTitle action="Ver insumos →">Ruptura por Categoria</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 148, height: 148, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={RUPTURA_DONUT} cx="50%" cy="50%" innerRadius={42} outerRadius={68} dataKey="value" strokeWidth={0}>
                    {RUPTURA_DONUT.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return <div style={{ background: '#fff', border: '1px solid #E5E1D6', borderRadius: 8, padding: '6px 10px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      <p style={{ fontWeight: 600, color: '#3D3A33' }}>{d.name}</p>
                      <p style={{ color: d.color, fontWeight: 700 }}>{d.value}%</p>
                    </div>;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {RUPTURA_DONUT.map(d => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#3D3A33', flex: 1 }}>{d.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#1A1814' }}>{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Alertas Recentes</h2>
          <button style={{ fontSize: 11, fontWeight: 500, color: '#1B5E6E', background: 'none', border: 'none', cursor: 'pointer' }}>Ver todos (6) →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {ALERTAS.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderBottom: i < ALERTAS.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.cor, marginTop: 6, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1814', lineHeight: 1.4, marginBottom: 2 }}>{a.titulo}</p>
                <p style={{ fontSize: 11, color: '#8A8579' }}>{a.fonte} · {a.tempo}</p>
              </div>
              <Badge label={a.tipo} color={a.cor} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── Page: Epidemiologia ──────────────────────────────────────────────────────

function PageEpidemiologia() {
  return (
    <div className="rise">
      <FilterBar fields={[
        { label: 'Agravo / CID', value: 'A90 Dengue', width: 160 },
        { label: 'Período', value: 'Últimos 12 meses', width: 180 },
        { label: 'Cidade / Região', value: 'Cotia', width: 140 },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Total Casos Notificados" value="12.480" delta="+18,2%" deltaLabel="vs ano anterior" icon="📋" iconColor="#D4883A" sparkData={SPARK_CASOS} rising={false} />
        <KpiCard label="Taxa de Hospitalização" value="6,4%" delta="+0,9 p.p." deltaLabel="vs ano anterior" icon="🏥" iconColor="#4A7FBF" sparkData={SPARK_RISCO} rising={false} />
        <KpiCard label="Taxa de Óbito" value="0,18%" delta="-0,0 p.p." deltaLabel="estável" icon="📉" iconColor="#2A6B40" sparkData={SPARK_VACINAL} rising={true} />
        <KpiCard label="Incidência /100mil hab." value="432" delta="+24,0%" deltaLabel="vs ano anterior" icon="📍" iconColor="#D94F4F" sparkData={SPARK_RISCO} rising={false} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <Card className="p-5">
          <SectionTitle>Sazonalidade · Dengue (A90)</SectionTitle>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={EPI_SAZONALIDADE} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Line type="monotone" dataKey="atual2026" name="2026 (atual)" stroke="#1B5E6E" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="ano2025" name="2025" stroke="#D4883A" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="media5anos" name="Média 5 anos" stroke="#A8A39A" strokeWidth={1} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Distribuição por Cidade</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 148, height: 148, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={EPI_CIDADES} cx="50%" cy="50%" innerRadius={38} outerRadius={66} dataKey="value" strokeWidth={0}>
                    {EPI_CIDADES.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return <div style={{ background: '#fff', border: '1px solid #E5E1D6', borderRadius: 8, padding: '6px 10px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                      <p style={{ fontWeight: 600, color: '#3D3A33' }}>{d.name}</p>
                      <p style={{ color: d.color }}>{d.value}% · {d.total.toLocaleString('pt-BR')} casos</p>
                    </div>;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
              {EPI_CIDADES.map(c => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#3D3A33', flex: 1 }}>{c.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#6B665D' }}>{c.total.toLocaleString('pt-BR')}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, color: '#1A1814', width: 36, textAlign: 'right' }}>{c.value}%</span>
                </div>
              ))}
              <p style={{ fontSize: 10, color: '#8A8579', paddingTop: 6, borderTop: '1px solid #EFEBE0', marginTop: 2 }}>Total: 12.480 casos</p>
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <Card className="p-5">
          <SectionTitle>Distribuição por Faixa Etária</SectionTitle>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={EPI_FAIXA} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <YAxis dataKey="faixa" type="category" tick={{ fontSize: 10, fill: '#6B665D' }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<ChartTip unit=" casos" />} />
                <Bar dataKey="casos" name="Casos" fill="#1B5E6E" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Distribuição por Gênero</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 180, height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={EPI_GENERO} cx="50%" cy="50%" innerRadius={52} outerRadius={80} dataKey="value" strokeWidth={0}>
                    {EPI_GENERO.map((g, i) => <Cell key={i} fill={g.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return <div style={{ background: '#fff', border: '1px solid #E5E1D6', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                      <p style={{ color: d.color, fontWeight: 700 }}>{d.name}: {d.value}%</p>
                    </div>;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', gap: 24, marginTop: 8 }}>
              {EPI_GENERO.map(g => (
                <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: g.color }} />
                  <span style={{ fontSize: 12, color: '#3D3A33' }}>{g.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: '#1A1814' }}>{g.value}%</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 10, color: '#8A8579', marginTop: 10 }}>Total: 12.480 casos</p>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Desfecho Clínico por Ano</SectionTitle>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={EPI_DESFECHO} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="ano" tick={{ fontSize: 10, fill: '#6B665D' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
              <Bar dataKey="leves" name="Casos leves" stackId="a" fill="#4A9B6F" />
              <Bar dataKey="hosp" name="Hospitalizações" stackId="a" fill="#E8903A" />
              <Bar dataKey="obitos" name="Óbitos" stackId="a" fill="#D94F4F" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  );
}

// ─── Page: Internações ────────────────────────────────────────────────────────

function PageInternacoes() {
  return (
    <div className="rise">
      <FilterBar fields={[
        { label: 'Agravo / CID', value: 'Dengue', width: 140 },
        { label: 'Período', value: 'Últimos 12 meses', width: 180 },
        { label: 'Hospital', value: 'Todos', width: 140 },
      ]} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        <KpiCard label="Internações no Período" value="1.742" delta="+14,8%" deltaLabel="vs ano anterior" icon="🏥" iconColor="#4A7FBF" sparkData={SPARK_CASOS} rising={false} />
        <KpiCard label="Permanência Média" value="4,2 dias" delta="-0,3 d." deltaLabel="vs ano anterior" icon="📅" iconColor="#4A9B72" sparkData={SPARK_VACINAL} rising={true} />
        <KpiCard label="Reinternações em 30D" value="8,6%" delta="+1,2 p.p." deltaLabel="vs ano anterior" icon="🔄" iconColor="#D94F4F" sparkData={SPARK_RISCO} rising={false} />
        <KpiCard label="Custo Total SIH" value="12,84 mi BRL" delta="-18,6 p.p." deltaLabel="vs ano anterior" icon="💰" iconColor="#2A6B40" sparkData={SPARK_VACINAL} rising={true} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <Card className="p-5">
          <SectionTitle>Internações e Custo Mensal</SectionTitle>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={SIH_MENSAL} margin={{ top: 4, right: 36, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
                <Bar yAxisId="left" dataKey="int" name="Internações" fill="#1B5E6E" radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="custo" name="Custo (R$ mil)" stroke="#D94F4F" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Principais Grupos de Causa</SectionTitle>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E1D6' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', fontSize: 11, fontWeight: 600, color: '#6B665D' }}>Grupo</th>
                <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 600, color: '#6B665D' }}>Internações</th>
                <th style={{ textAlign: 'right', padding: '8px 0', fontSize: 11, fontWeight: 600, color: '#6B665D' }}>Custo médio</th>
              </tr>
            </thead>
            <tbody>
              {SIH_CAUSAS.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F5F2EB' }}>
                  <td style={{ padding: '9px 0', color: '#3D3A33', fontWeight: 500 }}>{c.grupo}</td>
                  <td style={{ padding: '9px 0', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#1A1814' }}>{c.int}</td>
                  <td style={{ padding: '9px 0', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', color: '#6B665D' }}>{c.custo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card className="p-5">
          <SectionTitle>Permanência Média por Grupo</SectionTitle>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={SIH_PERMANENCIA} layout="vertical" margin={{ top: 0, right: 24, left: 64, bottom: 0 }}>
                <CartesianGrid stroke="#E5E1D6" strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: '#A8A39A' }} tickLine={false} axisLine={false} unit="d" />
                <YAxis dataKey="grupo" type="category" tick={{ fontSize: 9.5, fill: '#6B665D' }} tickLine={false} axisLine={false} width={92} />
                <Tooltip content={<ChartTip unit=" dias" />} />
                <Bar dataKey="dias" name="Dias" radius={[0, 3, 3, 0]}>
                  {SIH_PERMANENCIA.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle>Origem das AIH</SectionTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 158, height: 158, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={SIH_ORIGEM} cx="50%" cy="50%" innerRadius={44} outerRadius={70} dataKey="value" strokeWidth={0}>
                    {SIH_ORIGEM.map((o, i) => <Cell key={i} fill={o.color} />)}
                  </Pie>
                  <Tooltip content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return <div style={{ background: '#fff', border: '1px solid #E5E1D6', borderRadius: 8, padding: '6px 10px', fontSize: 11 }}>
                      <p style={{ color: d.color, fontWeight: 700 }}>{d.name}: {d.value}%</p>
                    </div>;
                  }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SIH_ORIGEM.map(o => (
                <div key={o.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: o.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#3D3A33', flex: 1 }}>{o.name}</span>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 800, color: '#1A1814' }}>{o.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── Placeholder ──────────────────────────────────────────────────────────────

function PagePlaceholder({ icon, title, description }) {
  return (
    <div className="rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 440 }}>
      <div style={{ width: 64, height: 64, borderRadius: 16, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 20 }}>
        {icon}
      </div>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, fontWeight: 700, color: '#1A1814', marginBottom: 8 }}>{title}</h2>
      <p style={{ fontSize: 13, color: '#8A8579', textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>{description}</p>
      <span style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: '#D6E9EE', color: '#1B5E6E' }}>
        Em desenvolvimento · FIAP 2026
      </span>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const NAV = [
  {
    section: 'ANÁLISES',
    items: [
      { id: 'visao-geral',   label: 'Visão Geral',        sub: null,   badge: null,
        icon: <svg viewBox="0 0 16 16" fill="currentColor" width="15" height="15"><path d="M1 2h6v7H1V2zm8 0h6v3H9V2zm0 5h6v7H9V7zm-8 4h6v3H1v-3z"/></svg> },
      { id: 'epidemiologia', label: 'Epidemiologia',       sub: 'SINAN', badge: null,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><path d="M1 12 5 7l3 3 3-5 3 2" strokeLinecap="round" strokeLinejoin="round"/></svg> },
      { id: 'internacoes',   label: 'Internações',         sub: 'SIH',   badge: null,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><rect x="2" y="4" width="12" height="10" rx="1.5"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M8 7v4M6 9h4" strokeLinecap="round"/></svg> },
      { id: 'vacinal',       label: 'Cobertura Vacinal',   sub: null,   badge: null,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round"/></svg> },
      { id: 'superlotacao',  label: 'Superlotação',        sub: 'CNES',  badge: null,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><path d="M8 2v7M2 9h12M4 9v5h8V9" strokeLinecap="round" strokeLinejoin="round"/></svg> },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      { id: 'insumos',  label: 'Ruptura de Insumos', sub: null, badge: null,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" strokeLinecap="round"/></svg> },
      { id: 'alertas',  label: 'Alertas',             sub: null, badge: 4,
        icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="15" height="15"><path d="M8 1.5L14 13H2L8 1.5z" strokeLinejoin="round"/><path d="M8 6v3M8 10.5v.5" strokeLinecap="round"/></svg> },
    ],
  },
];

function Sidebar({ current, onNav }) {
  return (
    <aside style={{ position: 'fixed', left: 0, top: 0, width: 220, height: '100vh', background: '#1E3C3C', display: 'flex', flexDirection: 'column', zIndex: 30 }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#4DB8A0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#1E3C3C" strokeWidth="2.2">
              <path d="M2 13 6 8l4 4 3-6 3 3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 700, fontSize: 15, color: 'white', lineHeight: 1.1 }}>SusPredict</p>
            <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: '#6A9090' }}>v1.0 · FIAP 2026</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, paddingTop: 16, overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: 20 }}>
            <p style={{ padding: '0 20px', marginBottom: 4, fontSize: 9, fontWeight: 700, letterSpacing: '0.13em', color: '#6A9090' }}>{group.section}</p>
            {group.items.map(item => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNav(item.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 20px', textAlign: 'left', background: active ? '#2A5050' : 'transparent',
                    color: active ? '#FFFFFF' : '#C8D8D5', border: 'none', cursor: 'pointer',
                    position: 'relative', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(77,184,160,0.07)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {active && (
                    <span style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 2.5, borderRadius: '0 2px 2px 0', background: '#4DB8A0' }} />
                  )}
                  <span style={{ color: active ? '#4DB8A0' : '#7EB8B0', opacity: active ? 1 : 0.75, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{item.label}</span>
                  {item.sub && <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#6A9090' }}>{item.sub}</span>}
                  {item.badge && (
                    <span style={{ width: 16, height: 16, borderRadius: '50%', background: '#D94F4F', color: 'white', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '12px 20px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4DB8A0', flexShrink: 0, animation: 'dot-pulse 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, color: '#6A9090' }}>Dados em sincronia · há 8 min</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#4A7FBF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>MO</div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'white', lineHeight: 1.2 }}>Márcia Oliveira</p>
            <p style={{ fontSize: 9, color: '#6A9090' }}>SMS · ADMIN</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

const CRUMBS = {
  'visao-geral':   ['Início', 'Visão Geral'],
  'epidemiologia': ['Análises', 'Epidemiologia SINAN'],
  'internacoes':   ['Análises', 'Internações SIH'],
  'vacinal':       ['Análises', 'Cobertura Vacinal'],
  'superlotacao':  ['Análises', 'Superlotação CNES'],
  'insumos':       ['Sistema', 'Ruptura de Insumos'],
  'alertas':       ['Sistema', 'Alertas'],
};

function Topbar({ current }) {
  const crumbs = CRUMBS[current] || ['Início'];
  return (
    <header style={{ position: 'fixed', top: 0, right: 0, left: 220, height: 60, background: '#F6F5F2', borderBottom: '1px solid #E5E1D6', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', zIndex: 20 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: '#C9C4BA', fontSize: 12 }}>/</span>}
            <span style={{ fontSize: 12, fontWeight: i === crumbs.length - 1 ? 600 : 400, color: i === crumbs.length - 1 ? '#1A1814' : '#8A8579' }}>{c}</span>
          </span>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar dados, relatórios..."
            style={{ width: 260, padding: '6px 12px 6px 32px', fontSize: 12, borderRadius: 8, border: '1px solid #E5E1D6', background: '#FFFFFF', color: '#3D3A33', outline: 'none' }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#A8A39A" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14" strokeLinecap="round"/>
          </svg>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1D6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
            <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #E5E1D6', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <path d="M8 1a4 4 0 014 4v3l1.5 2.5h-11L4 8V5a4 4 0 014-4zM6.5 13.5a1.5 1.5 0 003 0"/>
          </svg>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#D94F4F', color: 'white', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>4</span>
        </button>
      </div>
    </header>
  );
}

// ─── Floating chat ────────────────────────────────────────────────────────────

function FloatingChat() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div style={{ position: 'fixed', bottom: 76, right: 24, width: 280, borderRadius: 16, border: '1px solid #E5E1D6', background: '#FFFFFF', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 50, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', background: '#1E3C3C', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>🤖</span>
              <div>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'white', lineHeight: 1 }}>Assistente DATASUS</p>
                <p style={{ fontSize: 9, color: '#6A9090' }}>powered by Gemini</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ color: '#A8A39A', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ padding: 16 }}>
            <p style={{ fontSize: 12, color: '#6B665D', marginBottom: 10 }}>Faça perguntas sobre os dados do município de Cotia.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="Ex: tendência de dengue?" style={{ flex: 1, fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid #E5E1D6', color: '#3D3A33', outline: 'none' }} />
              <button style={{ padding: '7px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'white', background: '#1B5E6E', border: 'none', cursor: 'pointer' }}>→</button>
            </div>
            <p style={{ fontSize: 10, color: '#C9C4BA', marginTop: 8, textAlign: 'center' }}>Em breve — integração Gemini</p>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        title="Assistente DATASUS"
        style={{ position: 'fixed', bottom: 24, right: 24, width: 48, height: 48, borderRadius: '50%', background: '#1E3C3C', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 4px 20px rgba(0,0,0,0.2)', zIndex: 50, transition: 'transform 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        🤖
      </button>
    </>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [page, setPage] = useState('visao-geral');

  function render() {
    switch (page) {
      case 'visao-geral':   return <PageVisaoGeral />;
      case 'epidemiologia': return <PageEpidemiologia />;
      case 'internacoes':   return <PageInternacoes />;
      case 'vacinal':       return <PagePlaceholder icon="💉" title="Cobertura Vacinal" description="Painel de cobertura vacinal por imunobiológico, faixa etária e UBS. Integração com SIPNI em desenvolvimento." />;
      case 'superlotacao':  return <PagePlaceholder icon="🏥" title="Superlotação CNES" description="Monitoramento em tempo real de ocupação de leitos, UTI e pronto-socorros. Módulo em desenvolvimento." />;
      case 'insumos':       return <PagePlaceholder icon="💊" title="Ruptura de Insumos" description="Rastreamento de estoque de medicamentos essenciais e alertas de ruptura por UBS." />;
      case 'alertas':       return <PagePlaceholder icon="🔔" title="Central de Alertas" description="Todos os alertas ativos, histórico de notificações e configuração de thresholds." />;
      default:              return <PageVisaoGeral />;
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F6F5F2' }}>
      <Sidebar current={page} onNav={setPage} />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Topbar current={page} />
        <main style={{ paddingTop: 60, flex: 1 }}>
          <div style={{ padding: '28px 36px', maxWidth: 1280 }}>
            {render()}
          </div>
        </main>
      </div>
      <FloatingChat />
    </div>
  );
}
