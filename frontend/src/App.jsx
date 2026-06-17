import { useState, useRef, useEffect, createContext, useContext } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ComposedChart, Legend,
} from 'recharts';

// ─── Esquemas de cores (sidebar + cor primária unificados) ────────────────────
//
// Cada esquema define a sidebar E a cor primária juntos. As cores são aplicadas
// via CSS variables no <div> raiz (ver App), então qualquer var(--token) abaixo
// re-tematiza ao trocar o esquema nas Configurações.

const THEMES = {
  teal: {
    label: 'Teal SusPredict', dot: '#1B5E6E',
    vars: {
      '--sb': '#92B6AB', '--sb-border': '#7DA399', '--sb-text': '#2C4A47',
      '--sb-section': '#4A7A76', '--sb-strong': '#1A2E2C', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#2D5449', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#2D5449',
      '--primary': '#1B5E6E', '--primary-dark': '#1E3C3C', '--accent': '#4DB8A0',
      '--primary-soft': '#EBF4F7', '--primary-soft-border': '#D6E9EE',
      '--primary-field': '#2A5050', '--primary-label': '#6A9090', '--primary-on-dark': '#C8D8D5',
    },
  },
  verde: {
    label: 'Verde-saúde', dot: '#2A6B40',
    vars: {
      '--sb': '#A6C2A0', '--sb-border': '#8FB089', '--sb-text': '#2E4A2C',
      '--sb-section': '#517A4C', '--sb-strong': '#1A2E18', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#2D5436', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#2D5436',
      '--primary': '#2A6B40', '--primary-dark': '#1F4A2E', '--accent': '#5FB87E',
      '--primary-soft': '#EAF4ED', '--primary-soft-border': '#D2E7D8',
      '--primary-field': '#2F5040', '--primary-label': '#7A9A85', '--primary-on-dark': '#CBDDD0',
    },
  },
  ambar: {
    label: 'Âmbar', dot: '#A6580F',
    vars: {
      '--sb': '#D8C4A0', '--sb-border': '#C2A878', '--sb-text': '#4A3A1E',
      '--sb-section': '#8A6A3A', '--sb-strong': '#2E2415', '--sb-icon-bg': '#EDE6DA',
      '--sb-icon-fg': '#6B5C45', '--sb-icon-active-bg': '#6B451A', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#A6580F',
      '--primary': '#A6580F', '--primary-dark': '#5C3410', '--accent': '#E0A040',
      '--primary-soft': '#FBF1E3', '--primary-soft-border': '#ECDCC2',
      '--primary-field': '#5A4530', '--primary-label': '#B59A78', '--primary-on-dark': '#E8DCC8',
    },
  },
  grafite: {
    label: 'Grafite', dot: '#3D3A33',
    vars: {
      '--sb': '#B6BABF', '--sb-border': '#9DA1A8', '--sb-text': '#2E2D2B',
      '--sb-section': '#5C5A56', '--sb-strong': '#1A1814', '--sb-icon-bg': '#E9E9E9',
      '--sb-icon-fg': '#5C656B', '--sb-icon-active-bg': '#3D3A33', '--sb-icon-active-fg': '#FDFDFD',
      '--sb-accent-bar': '#3D3A33',
      '--primary': '#3D3A33', '--primary-dark': '#2A2825', '--accent': '#8A8579',
      '--primary-soft': '#F0EFEC', '--primary-soft-border': '#DDD9D2',
      '--primary-field': '#45433E', '--primary-label': '#A5A29A', '--primary-on-dark': '#DAD7D0',
    },
  },
};

const ThemeContext = createContext({ themeId: 'teal', setThemeId: () => {} });
const useTheme = () => useContext(ThemeContext);

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
  { name: 'Cotia',        value: 30.8, total: 3843, color: 'var(--primary)' },
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
        <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
    <div style={{ background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)', borderRadius: 12, padding: '20px 24px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          MO
        </div>
        <div>
          <p style={{ color: 'white', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Boa tarde, Dr(a). Márcia 👋</p>
          <p style={{ color: 'var(--primary-on-dark)', fontSize: 13 }}>
            O município apresenta <strong style={{ color: 'white' }}>4 alertas críticos</strong> e índice de risco{' '}
            <strong style={{ color: '#D94F4F' }}>72%</strong>. Análise preditiva atualizada há 8 min.
          </p>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'white', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }}>
          Ver alertas
        </button>
        <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--accent)', border: 'none', cursor: 'pointer' }}>
          Gerar ETP
        </button>
      </div>
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar({ fields }) {
  return (
    <div style={{ background: 'var(--primary-dark)', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
      {fields.map(f => (
        <div key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary-label)' }}>{f.label}</label>
          <input defaultValue={f.value} style={{ borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 500, border: 'none', outline: 'none', background: 'var(--primary-field)', color: 'var(--primary-on-dark)', minWidth: f.width || 140 }} />
        </div>
      ))}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary-dark)', background: 'var(--accent)', border: 'none', cursor: 'pointer' }}>Recalcular</button>
        <button style={{ padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: 'var(--primary-on-dark)', background: 'transparent', border: '1px solid var(--primary-field)', cursor: 'pointer' }}>Exportar</button>
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
                <Line type="monotone" dataKey="real" name="Casos reais" stroke="var(--primary)" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="prev" name="Previsão" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p style={{ fontSize: 10, color: '#8A8579', marginTop: 8, paddingTop: 8, borderTop: '1px solid #EFEBE0' }}>
            Pico estimado em Mar/27 · ~485 casos · 218% acima da média 5 anos
          </p>
          <button style={{ marginTop: 6, fontSize: 11, fontWeight: 500, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
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
          <button style={{ fontSize: 11, fontWeight: 500, color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}>Ver todos (6) →</button>
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
                <Line type="monotone" dataKey="atual2026" name="2026 (atual)" stroke="var(--primary)" strokeWidth={2} dot={false} />
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
                <Bar dataKey="casos" name="Casos" fill="var(--primary)" radius={[0, 3, 3, 0]} />
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
                <Bar yAxisId="left" dataKey="int" name="Internações" fill="var(--primary)" radius={[3, 3, 0, 0]} />
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
      <span style={{ marginTop: 20, display: 'inline-flex', alignItems: 'center', padding: '6px 14px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: 'var(--primary-soft-border)', color: 'var(--primary)' }}>
        Em desenvolvimento · FIAP 2026
      </span>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// Tokens da sidebar — agora apontam para CSS variables tematizadas (ver THEMES)
const SB = 'var(--sb)';                       // sidebar bg
const SB_TEXT = 'var(--sb-text)';             // texto inativo
const SB_SECTION = 'var(--sb-section)';       // eyebrow de seção
const ICON_BG = 'var(--sb-icon-bg)';          // container ícone inativo
const ICON_FG = 'var(--sb-icon-fg)';          // ícone inativo
const ICON_BG_ACTIVE = 'var(--sb-icon-active-bg)'; // container ícone ativo
const ICON_FG_ACTIVE = 'var(--sb-icon-active-fg)'; // ícone ativo

// Ícone Material Symbols (Google Fonts). `m` = nome do ícone.
function MIcon({ m, size = 19 }) {
  return (
    <span className="material-symbols-rounded" style={{ fontSize: size, lineHeight: 1 }}>
      {m}
    </span>
  );
}

const NAV = [
  {
    section: 'ANÁLISES',
    items: [
      { id: 'visao-geral',   label: 'Visão Geral',         icon: 'grid_view' },
      { id: 'epidemiologia', label: 'Epidemiologia SINAN', icon: 'coronavirus' },
      { id: 'internacoes',   label: 'Internações SIH',     icon: 'bed' },
      { id: 'vacinal',       label: 'Cobertura Vacinal',   icon: 'vaccines' },
      { id: 'superlotacao',  label: 'Superlotação',        icon: 'emergency' },
      { id: 'insumos',       label: 'Ruptura de Insumos',  icon: 'medication' },
    ],
  },
  {
    section: 'SISTEMA',
    items: [
      { id: 'alertas',       label: 'Alertas',        icon: 'notifications', badge: 4 },
      { id: 'configuracoes', label: 'Configurações',  icon: 'settings' },
      { id: 'perfil',        label: 'Perfil',         icon: 'person' },
    ],
  },
];

// Ícone árvore da vida / saúde para o logo
function LogoIcon() {
  return (
    <svg viewBox="0 0 36 36" width="36" height="36" fill="none">
      {/* tronco */}
      <path d="M18 28v-6" stroke="var(--sb-text)" strokeWidth="2.5" strokeLinecap="round"/>
      {/* raízes */}
      <path d="M18 28l-4 4M18 28l4 4" stroke="var(--sb-text)" strokeWidth="2" strokeLinecap="round"/>
      {/* galhos principais */}
      <path d="M18 22l-6-5M18 22l6-5" stroke="var(--sb-text)" strokeWidth="2" strokeLinecap="round"/>
      {/* galhos secundários esquerda */}
      <path d="M12 17l-4-3M12 17l1-4" stroke="var(--sb-text)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* galhos secundários direita */}
      <path d="M24 17l4-3M24 17l-1-4" stroke="var(--sb-text)" strokeWidth="1.8" strokeLinecap="round"/>
      {/* folhas / bolinhas */}
      <circle cx="8" cy="13.5" r="2.5" fill="var(--sb-text)" fillOpacity=".7"/>
      <circle cx="13" cy="12.5" r="2.5" fill="var(--sb-text)" fillOpacity=".85"/>
      <circle cx="18" cy="11" r="3" fill="var(--sb-text)"/>
      <circle cx="23" cy="12.5" r="2.5" fill="var(--sb-text)" fillOpacity=".85"/>
      <circle cx="28" cy="13.5" r="2.5" fill="var(--sb-text)" fillOpacity=".7"/>
      {/* cruz médica central */}
      <rect x="16.5" y="9.5" width="3" height="3" rx="0.5" fill="white"/>
    </svg>
  );
}

function Sidebar({ current, onNav }) {
  return (
    <aside style={{
      position: 'fixed', left: 0, top: 0, width: 220, height: '100vh',
      background: SB, display: 'flex', flexDirection: 'column', zIndex: 30,
    }}>
      {/* Logo */}
      <div style={{ height: 60, boxSizing: 'border-box', padding: '0 20px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--sb-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon />
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 16, color: 'var(--sb-strong)', lineHeight: 1 }}>
            SusPredict
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
        {NAV.map(group => (
          <div key={group.section} style={{ marginBottom: 18 }}>
            <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: SB_SECTION }}>
              {group.section}
            </p>
            {group.items.map(item => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNav(item.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '7px 10px', textAlign: 'left', border: 'none', cursor: 'pointer',
                    borderRadius: 10, marginBottom: 2, position: 'relative', transition: 'all 0.12s',
                    background: active ? 'white' : 'transparent',
                    boxShadow: active ? '0 1px 6px rgba(44,74,71,0.15)' : 'none',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.35)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* barra esquerda no ativo (com gap das bordas) */}
                  {active && (
                    <span style={{ position: 'absolute', left: -10, top: '22%', bottom: '22%', width: 3, borderRadius: '0 3px 3px 0', background: 'var(--sb-accent-bar)' }} />
                  )}
                  {/* ícone container */}
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: active ? ICON_BG_ACTIVE : ICON_BG,
                    color: active ? ICON_FG_ACTIVE : ICON_FG,
                    boxShadow: active ? '0 2px 5px rgba(45,84,73,0.35)' : 'none',
                    transition: 'all 0.12s',
                  }}>
                    <MIcon m={item.icon} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: active ? 600 : 500, flex: 1, color: active ? 'var(--sb-strong)' : SB_TEXT, lineHeight: 1.2 }}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <span style={{
                      minWidth: 18, height: 18, borderRadius: 99, background: '#D94F4F', color: 'white',
                      fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '0 4px',
                    }}>
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
      <div style={{ padding: '12px 20px 18px', borderTop: '1px solid rgba(44,74,71,0.12)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 14 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3DB887', flexShrink: 0, animation: 'dot-pulse 2.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 10.5, color: SB_SECTION }}>Dados em sincronia · há 8 min</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--sb-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            MO
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--sb-strong)', lineHeight: 1.2 }}>Márcia Oliveira</p>
            <p style={{ fontSize: 10, color: SB_SECTION }}>SMS · ADMIN</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

const CRUMBS = {
  'visao-geral':    ['Início', 'Visão Geral'],
  'epidemiologia':  ['Análises', 'Epidemiologia SINAN'],
  'internacoes':    ['Análises', 'Internações SIH'],
  'vacinal':        ['Análises', 'Cobertura Vacinal'],
  'superlotacao':   ['Análises', 'Superlotação'],
  'insumos':        ['Análises', 'Ruptura de Insumos'],
  'alertas':        ['Sistema', 'Alertas'],
  'configuracoes':  ['Sistema', 'Configurações'],
  'perfil':         ['Sistema', 'Perfil'],
};

function Topbar({ current }) {
  const crumbs = CRUMBS[current] || ['Início'];
  return (
    <header style={{ position: 'fixed', top: 0, right: 0, left: 220, height: 60, background: SB, borderBottom: '1px solid var(--sb-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 36px', zIndex: 20 }}>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <span style={{ color: SB_SECTION, fontSize: 12 }}>/</span>}
            <span style={{ fontSize: 12, fontWeight: i === crumbs.length - 1 ? 600 : 400, color: i === crumbs.length - 1 ? 'var(--sb-strong)' : SB_TEXT }}>{c}</span>
          </span>
        ))}
      </nav>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Buscar dados, relatórios..."
            style={{ width: 260, padding: '6px 12px 6px 32px', fontSize: 12, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', color: '#3D3A33', outline: 'none' }}
          />
          <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#A8A39A" strokeWidth="1.5">
            <circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5 14 14" strokeLinecap="round"/>
          </svg>
        </div>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/>
            <rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/>
          </svg>
        </button>
        <button style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--sb-border)', background: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6B665D" strokeWidth="1.5">
            <path d="M8 1a4 4 0 014 4v3l1.5 2.5h-11L4 8V5a4 4 0 014-4zM6.5 13.5a1.5 1.5 0 003 0"/>
          </svg>
          <span style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: '#D94F4F', color: 'white', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>4</span>
        </button>
      </div>
    </header>
  );
}

// ─── SusBot — assistente conversacional ───────────────────────────────────────

// Sugestões iniciais, agrupadas pelas duas competências do SusBot (ver slides):
// "Navegação no sistema" e "Interpretação dos dados".
const SUSBOT_SUGESTOES = [
  { grupo: 'Navegação',     icon: 'travel_explore', texto: 'Onde vejo a previsão de dengue?' },
  { grupo: 'Navegação',     icon: 'download',        texto: 'Como exporto os dados em planilha?' },
  { grupo: 'Interpretação', icon: 'help',            texto: 'O que significa índice de risco 72%?' },
  { grupo: 'Interpretação', icon: 'insights',        texto: 'Como a previsão é calculada?' },
];

const SUSBOT_SAUDACAO =
  'Olá! Sou o SusBot 👋 Posso te ajudar a navegar pelo SusPredict e a entender os ' +
  'indicadores, alertas e previsões. Escolha uma sugestão abaixo ou escreva sua dúvida.';

/**
 * Gera a resposta do SusBot.
 *
 * MVP: respostas locais por palavra-chave (sem custo, funciona offline).
 * Para ligar o Gemini, troque o corpo desta função por um fetch ao backend,
 * mantendo a mesma assinatura `async (pergunta, contexto) => string`. Ex.:
 *
 *   const r = await fetch('http://localhost:8000/api/chat', {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ pergunta, contexto }),
 *   });
 *   return (await r.json()).resposta;
 *
 * `contexto` carrega a página atual para o bot dar respostas situadas.
 */
async function askSusBot(pergunta, contexto = {}) {
  await new Promise(r => setTimeout(r, 650 + Math.random() * 500)); // simula latência
  const q = pergunta.toLowerCase();

  const regras = [
    { kw: ['previsão', 'previsao', 'prever', 'dengue', 'forecast'],
      r: 'A previsão de casos fica na aba **Visão Geral**, no card "Previsão de casos". ' +
         'Em **Epidemiologia SINAN** você vê a sazonalidade detalhada e compara com a média de 5 anos.' },
    { kw: ['exporta', 'exportar', 'planilha', 'csv', 'xlsx', 'baixar', 'download'],
      r: 'Para exportar, use o botão **Exportar** na barra de filtros (topo da página de análise). ' +
         'O arquivo sai em .xlsx com a série temporal e as distribuições.' },
    { kw: ['risco', '72', 'índice', 'indice'],
      r: 'O **índice de risco** combina 4 fatores (epidemiológico, leitos, estoque crítico e vacinação) ' +
         'numa nota de 0 a 100%. Acima de 75% é **alto**, 55–75% **médio**, abaixo **baixo**. ' +
         '72% indica risco médio-alto puxado pelo componente epidemiológico.' },
    { kw: ['como', 'calcula', 'modelo', 'prophet', 'confiança', 'confianca'],
      r: 'As previsões usam modelos de série temporal (Prophet/Holt, com OLS de reserva) sobre o ' +
         'histórico do DATASUS. A banda tracejada é o intervalo de confiança — quanto mais larga, ' +
         'maior a incerteza.' },
    { kw: ['alerta', 'notifica', 'surto'],
      r: 'Os alertas ativos aparecem em **Visão Geral › Alertas Recentes** e na aba **Alertas**. ' +
         'Cada alerta mostra a fonte (SINAN, estoque, CNES) e o tipo (surto, insumo, lotação).' },
    { kw: ['internaç', 'internac', 'sih', 'leito', 'custo'],
      r: 'Internações ficam em **Internações SIH**: volume mensal, custo, permanência média por causa ' +
         'e origem das AIH.' },
    { kw: ['olá', 'ola', 'oi', 'bom dia', 'boa tarde'],
      r: 'Oi! Em que posso ajudar — navegar pelo sistema ou interpretar algum indicador?' },
  ];

  const hit = regras.find(rg => rg.kw.some(k => q.includes(k)));
  if (hit) return hit.r;

  return 'Ainda estou aprendendo essa. Posso ajudar a **localizar painéis** (previsões, alertas, ' +
    'internações, exportação) ou **explicar indicadores** (índice de risco, sazonalidade, ' +
    'como as previsões são calculadas). Reformule e eu tento de novo!';
}

// Markdown mínimo: **negrito** → <strong>
function renderMd(texto) {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((seg, i) =>
    seg.startsWith('**') && seg.endsWith('**')
      ? <strong key={i} style={{ color: 'var(--sb-strong)' }}>{seg.slice(2, -2)}</strong>
      : <span key={i}>{seg}</span>
  );
}

function SusBotAvatar({ size = 28 }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'white' }}>
      <span className="material-symbols-rounded" style={{ fontSize: size * 0.62 }}>smart_toy</span>
    </span>
  );
}

function TypingDots() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 14px', background: '#F0EDE6', borderRadius: '12px 12px 12px 4px', width: 'fit-content' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#A8A39A', animation: `dot-pulse 1.2s ease-in-out ${i * 0.18}s infinite` }} />
      ))}
    </div>
  );
}

function FloatingChat({ page = 'visao-geral' }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msgs, setMsgs] = useState([
    { autor: 'bot', texto: SUSBOT_SAUDACAO },
  ]);
  const fimRef = useRef(null);
  const inputRef = useRef(null);

  const mostraSugestoes = msgs.length === 1;

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs, enviando]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function enviar(texto) {
    const pergunta = (texto ?? input).trim();
    if (!pergunta || enviando) return;
    setInput('');
    setMsgs(m => [...m, { autor: 'user', texto: pergunta }]);
    setEnviando(true);
    try {
      const resposta = await askSusBot(pergunta, { page });
      setMsgs(m => [...m, { autor: 'bot', texto: resposta }]);
    } catch {
      setMsgs(m => [...m, { autor: 'bot', texto: 'Ops, não consegui responder agora. Tente novamente.' }]);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      {open && (
        <div style={{ position: 'fixed', bottom: 84, right: 24, width: 360, maxWidth: 'calc(100vw - 48px)', height: 520, maxHeight: 'calc(100vh - 120px)', display: 'flex', flexDirection: 'column', borderRadius: 18, border: '1px solid #E5E1D6', background: '#FFFFFF', boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 50, overflow: 'hidden' }} className="rise">
          {/* Header */}
          <div style={{ padding: '14px 16px', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SusBotAvatar size={34} />
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: 'white', lineHeight: 1.1, fontFamily: 'Inter Tight, sans-serif' }}>SusBot</p>
                <p style={{ fontSize: 10.5, color: '#A9CFCB', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3DB887', animation: 'dot-pulse 2.4s ease-in-out infinite' }} />
                  Online · qualquer dúvida, uma pergunta
                </p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} title="Fechar" style={{ color: 'rgba(255,255,255,0.7)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
              <span className="material-symbols-rounded" style={{ fontSize: 20 }}>close</span>
            </button>
          </div>

          {/* Mensagens */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, background: '#FBFAF7' }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexDirection: m.autor === 'user' ? 'row-reverse' : 'row' }}>
                {m.autor === 'bot' && <SusBotAvatar size={26} />}
                <div style={{
                  maxWidth: '78%', padding: '9px 13px', fontSize: 13, lineHeight: 1.5,
                  borderRadius: m.autor === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.autor === 'user' ? 'var(--primary)' : '#F0EDE6',
                  color: m.autor === 'user' ? 'white' : '#3D3A33',
                }}>
                  {m.autor === 'bot' ? renderMd(m.texto) : m.texto}
                </div>
              </div>
            ))}

            {enviando && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <SusBotAvatar size={26} />
                <TypingDots />
              </div>
            )}

            {/* Sugestões iniciais */}
            {mostraSugestoes && !enviando && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 4 }}>
                {SUSBOT_SUGESTOES.map(s => (
                  <button key={s.texto} onClick={() => enviar(s.texto)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 11px',
                    borderRadius: 99, border: '1px solid var(--primary-soft-border)', background: 'var(--primary-soft)',
                    color: 'var(--primary)', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 15 }}>{s.icon}</span>
                    {s.texto}
                  </button>
                ))}
              </div>
            )}
            <div ref={fimRef} />
          </div>

          {/* Input */}
          <div style={{ padding: 12, borderTop: '1px solid #EFEBE0', flexShrink: 0, background: '#FFFFFF' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
                placeholder="Pergunte ao SusBot..."
                style={{ flex: 1, fontSize: 13, padding: '10px 14px', borderRadius: 99, border: '1px solid #E5E1D6', color: '#3D3A33', outline: 'none', background: '#FBFAF7' }}
              />
              <button
                onClick={() => enviar()}
                disabled={!input.trim() || enviando}
                title="Enviar"
                style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: input.trim() && !enviando ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: input.trim() && !enviando ? 'var(--primary)' : '#C9C4BA', color: 'white', transition: 'background 0.15s' }}
              >
                <span className="material-symbols-rounded" style={{ fontSize: 19 }}>send</span>
              </button>
            </div>
            <p style={{ fontSize: 9.5, color: '#C9C4BA', marginTop: 7, textAlign: 'center' }}>
              SusBot pode cometer erros · respostas em modo demonstração
            </p>
          </div>
        </div>
      )}

      <button
        onClick={() => setOpen(o => !o)}
        title="SusBot — assistente"
        style={{ position: 'fixed', bottom: 24, right: 24, width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 22px rgba(27,94,110,0.4)', zIndex: 50, transition: 'transform 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.08)'}
        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
      >
        <span className="material-symbols-rounded" style={{ fontSize: 26, color: 'white' }}>
          {open ? 'close' : 'smart_toy'}
        </span>
      </button>
    </>
  );
}

// ─── Page: Configurações ───────────────────────────────────────────────────────

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: on ? 'var(--primary)' : '#C9C4BA', padding: 2, position: 'relative',
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transform: on ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 0.15s',
      }} />
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: '#EFEBE0', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 600 : 500,
              color: active ? '#1A1814' : '#6B665D',
              background: active ? '#FFFFFF' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            {opt.dot && <span style={{ width: 11, height: 11, borderRadius: '50%', background: opt.dot, flexShrink: 0 }} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({ title, desc, children, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: last ? 'none' : '1px solid #EFEBE0' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', marginBottom: 2 }}>{title}</p>
        {desc && <p style={{ fontSize: 11.5, color: '#8A8579', lineHeight: 1.4 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function CardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>{title}</h2>
      {hint && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A8A39A' }}>{hint}</span>}
    </div>
  );
}

const CFG_INTEGRACOES = [
  { sigla: 'S', nome: 'SINAN — Sistema de Agravos',      sub: 'Sincronização diária às 04:00',         status: 'conectado', tempo: 'há 4 horas' },
  { sigla: 'S', nome: 'SIH/SUS — Hospitalares',          sub: 'Atualização mensal · competência 03/2026', status: 'conectado', tempo: 'há 12 dias' },
  { sigla: 'C', nome: 'CNES — Cadastro de Estabelecimentos', sub: 'Sincronização semanal',              status: 'conectado', tempo: 'há 2 dias' },
  { sigla: 'P', nome: 'PNI — Imunizações',               sub: 'Sincronização diária às 06:00',          status: 'atraso',    tempo: 'há 2 dias' },
  { sigla: 'E', nome: 'Estoque local (UBS)',             sub: 'API municipal · tempo real',             status: 'conectado', tempo: 'há 8 min' },
];

const CFG_ACOES = [
  { icon: 'person_add', label: 'Criar novos usuários' },
  { icon: 'cloud_download', label: 'Atualizar bases SUS' },
  { icon: 'group', label: 'Gerenciar usuários (12)' },
  { icon: 'history', label: 'Logs de auditoria' },
  { icon: 'support_agent', label: 'Falar com Suporte' },
];

function PageConfiguracoes() {
  const { themeId, setThemeId } = useTheme();
  const [densidade, setDensidade] = useState('confortavel');
  const [notif, setNotif] = useState({ email: true, sms: true, whatsapp: true, push: true });
  const [alertas, setAlertas] = useState({ surto: true, ruptura: true, lotacao: true, etp: true });

  const tn = (k) => (v) => setNotif(s => ({ ...s, [k]: v }));
  const ta = (k) => (v) => setAlertas(s => ({ ...s, [k]: v }));

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: '#8A8579' }}>Preferências de notificação, regras de alerta, integrações e gestão de usuários da Secretaria.</p>
      </div>

      {/* Aparência — full width */}
      <Card className="p-5" style={{ marginBottom: 20 }}>
        <CardHead title="Aparência" hint="aplicado imediatamente" />
        <SettingRow title="Esquema de cores" desc="Define a sidebar e a cor primária (botões, links, gráficos e destaques) de uma vez">
          <Segmented value={themeId} onChange={setThemeId} options={
            Object.entries(THEMES).map(([id, t]) => ({ value: id, label: t.label, dot: t.dot }))
          } />
        </SettingRow>
        <SettingRow title="Densidade da interface" desc="Compacta exibe mais informação por tela" last>
          <Segmented value={densidade} onChange={setDensidade} options={[
            { value: 'confortavel', label: 'Confortável' }, { value: 'compacta', label: 'Compacta' },
          ]} />
        </SettingRow>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Notificações */}
          <Card className="p-5">
            <CardHead title="Notificações" hint="canais de entrega" />
            <SettingRow title="E-mail" desc="marcia.oliveira@cotia.sp.gov.br">
              <Toggle on={notif.email} onChange={tn('email')} />
            </SettingRow>
            <SettingRow title="SMS" desc="+55 (11) 9 9876-5432">
              <Toggle on={notif.sms} onChange={tn('sms')} />
            </SettingRow>
            <SettingRow title="WhatsApp Business" desc="Via SusBot · número verificado">
              <Toggle on={notif.whatsapp} onChange={tn('whatsapp')} />
            </SettingRow>
            <SettingRow title="Push no app" desc="Navegador + mobile" last>
              <Toggle on={notif.push} onChange={tn('push')} />
            </SettingRow>
          </Card>

          {/* Regras de alerta */}
          <Card className="p-5">
            <CardHead title="Regras de alerta preditivo" hint="limites de disparo" />
            <SettingRow title="Alertas de surto (60d)" desc="Disparar quando probabilidade > 70%">
              <Toggle on={alertas.surto} onChange={ta('surto')} />
            </SettingRow>
            <SettingRow title="Ruptura iminente de insumos" desc="Disparar quando dias de cobertura ≤ 5">
              <Toggle on={alertas.ruptura} onChange={ta('ruptura')} />
            </SettingRow>
            <SettingRow title="Lotação hospitalar" desc="Disparar quando setor > 85% de ocupação">
              <Toggle on={alertas.lotacao} onChange={ta('lotacao')} />
            </SettingRow>
            <SettingRow title="Geração automática de ETP" desc="Iniciar ETP quando licitação for indicada" last>
              <Toggle on={alertas.etp} onChange={ta('etp')} />
            </SettingRow>
          </Card>

          {/* Integrações */}
          <Card className="p-5">
            <CardHead title="Integrações ativas" hint="DATASUS + locais" />
            {CFG_INTEGRACOES.map((it, i) => {
              const ok = it.status === 'conectado';
              const c = ok ? '#2A6B40' : '#A6580F';
              return (
                <div key={it.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < CFG_INTEGRACOES.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#6B665D', flexShrink: 0 }}>{it.sigla}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{it.nome}</p>
                    <p style={{ fontSize: 11, color: '#8A8579' }}>{it.sub}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, color: c, background: c + '18' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                      {it.status}
                    </span>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#A8A39A', marginTop: 3 }}>{it.tempo}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Plano */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Plano contratado</h2>
              <Badge label="SusPredict Pro" color="var(--primary)" />
            </div>
            {[
              { k: 'Mensalidade', v: 'R$ 5.400,00' },
              { k: 'UBSs cobertas', v: '8 / 10' },
              { k: 'Próxima renovação', v: '14 ago. 2026' },
            ].map(r => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span style={{ color: '#6B665D' }}>{r.k}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 14px', fontSize: 13 }}>
              <span style={{ color: '#6B665D' }}>Suporte dedicado</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2A6B40' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A6B40' }} /> ativo
              </span>
            </div>
            <button style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: 'pointer' }}>Comparar planos</button>
          </Card>

          {/* Sobre */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Sobre o SusPredict</h2>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#A8A39A' }}>v1.0.4</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#6B665D', lineHeight: 1.6, marginBottom: 14 }}>Inteligência preditiva para a Saúde Pública. Desenvolvido pela Startup One — FIAP 2026.</p>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8A39A', marginBottom: 8 }}>Equipe</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 12, color: '#3D3A33', marginBottom: 14 }}>
              {['Ariadine Amaral', 'Gabriel Araujo', 'Nilton Mikael', 'Vinicius Mascarenhas', 'Yasmin Cristino Miguez'].map(n => <span key={n}>{n}</span>)}
            </div>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8A39A', marginBottom: 6 }}>Em parceria</p>
            <p style={{ fontSize: 12, color: '#3D3A33', marginBottom: 14 }}>FIAP · Claro · DATASUS</p>
            <p style={{ fontSize: 10.5, color: '#A8A39A', paddingTop: 12, borderTop: '1px solid #EFEBE0' }}>LGPD em conformidade · Termos · Privacidade</p>
          </Card>

          {/* Ações administrativas */}
          <Card className="p-5">
            <CardHead title="Ações administrativas" hint="requer ADMIN" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {CFG_ACOES.map((a, i) => (
                <button key={a.label} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', border: 'none',
                  borderBottom: i < CFG_ACOES.length - 1 ? '1px solid #EFEBE0' : 'none',
                  background: 'none', cursor: 'pointer', textAlign: 'left', color: '#3D3A33',
                }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 19, color: '#6B665D' }}>{a.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                  <span className="material-symbols-rounded" style={{ fontSize: 18, color: '#C9C4BA' }}>chevron_right</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Page: Perfil ──────────────────────────────────────────────────────────────

const PERFIL_ATIVIDADES = [
  { icon: 'check', cor: '#2A6B40', titulo: 'Aprovou ETP-2026-087',               tempo: 'há 2 horas' },
  { icon: 'error', cor: '#D94F4F', titulo: 'Visualizou Alerta AL-2026-0184',     tempo: 'há 3 horas' },
  { icon: 'edit',  cor: '#4A7FBF', titulo: 'Atualizou estoque UBS Cotia Centro', tempo: 'ontem, 16:20' },
  { icon: 'download', cor: '#6B665D', titulo: 'Exportou relatório de cobertura vacinal Q1', tempo: 'ontem, 11:08' },
  { icon: 'notifications', cor: '#8A8579', titulo: 'Configurou alerta de Hantavirose para Cotia', tempo: 'há 3 dias' },
];

const PERFIL_CADASTRO = [
  { k: 'E-mail institucional', v: 'marcia.oliveira@cotia.sp.gov.br' },
  { k: 'Matrícula',            v: 'SMS-2018-0184' },
  { k: 'No SusPredict desde',  v: 'Janeiro de 2024' },
  { k: 'Último login',         v: 'hoje, 09:14' },
];

const PERFIL_UBSS = [
  { nome: 'UBS Cotia Centro', leitos: '38 leitos · Cotia', status: 'crítico' },
  { nome: 'UBS Vila Bela',    leitos: '24 leitos · Cotia', status: 'crítico' },
];

function PagePerfil() {
  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Perfil do Usuário</h1>
        <p style={{ fontSize: 13, color: '#8A8579' }}>Suas informações, permissões e histórico de atividades no SusPredict.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cartão de identidade */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                MO
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 22, fontWeight: 800, color: '#1A1814', lineHeight: 1.1, marginBottom: 4 }}>Márcia Oliveira</h2>
                <p style={{ fontSize: 13, color: '#8A8579', marginBottom: 12 }}>Secretária Municipal de Saúde · Cotia · SP</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Admin', 'Aprovador de ETP', 'Gestão de UBS'].map(p => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)' }}>{p}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: 'pointer' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 17 }}>edit</span>
                  Editar perfil
                </button>
                <button style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#3D3A33', background: '#FFFFFF', border: '1px solid #E5E1D6', cursor: 'pointer' }}>
                  Trocar senha
                </button>
              </div>
            </div>
          </Card>

          {/* Atividades recentes */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Atividades recentes</h2>
              <span style={{ fontSize: 11, color: '#A8A39A' }}>últimos 7 dias</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {PERFIL_ATIVIDADES.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < PERFIL_ATIVIDADES.length - 1 ? '1px solid #EFEBE0' : 'none', cursor: 'pointer' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: a.cor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: a.cor }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{a.icon}</span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1814', lineHeight: 1.3 }}>{a.titulo}</p>
                    <p style={{ fontSize: 11, color: '#8A8579', marginTop: 1 }}>{a.tempo}</p>
                  </div>
                  <span className="material-symbols-rounded" style={{ fontSize: 18, color: '#C9C4BA', flexShrink: 0 }}>chevron_right</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dados cadastrais */}
          <Card className="p-5">
            <CardHead title="Dados cadastrais" />
            {PERFIL_CADASTRO.map(r => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', fontSize: 13, borderBottom: '1px solid #F5F2EB' }}>
                <span style={{ color: '#6B665D', flexShrink: 0 }}>{r.k}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, textAlign: 'right' }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px', fontSize: 13 }}>
              <span style={{ color: '#6B665D' }}>MFA</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2A6B40', background: '#2A6B4018', padding: '3px 8px', borderRadius: 99 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A6B40' }} /> ativo
              </span>
            </div>
          </Card>

          {/* UBSs sob responsabilidade */}
          <Card className="p-5">
            <CardHead title="UBSs sob sua responsabilidade" hint="Cotia" />
            {PERFIL_UBSS.map((u, i) => (
              <div key={u.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < PERFIL_UBSS.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6B665D' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>local_hospital</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{u.nome}</p>
                  <p style={{ fontSize: 11, color: '#8A8579' }}>{u.leitos}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, color: '#D94F4F', background: '#D94F4F18', flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D94F4F' }} />
                  {u.status}
                </span>
              </div>
            ))}
          </Card>

          {/* Sair */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1814', marginBottom: 2 }}>Sair do SusPredict</p>
                <p style={{ fontSize: 11.5, color: '#8A8579', lineHeight: 1.4 }}>Você será desconectado em todos os dispositivos.</p>
              </div>
              <button style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#D94F4F', background: '#D94F4F12', border: '1px solid #D94F4F33', cursor: 'pointer', flexShrink: 0 }}>
                Sair
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

// ─── Tela de login / cadastro ─────────────────────────────────────────────────
//
// Sistema de autenticação ainda não implementado. Único caminho funcional é
// entrar como Márcia Oliveira (usuário de demonstração). "Criar conta" exibe
// aviso de que o cadastro está em construção.

function LoginScreen({ onEnter }) {
  const [erro, setErro] = useState('');

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: '#F6F5F2',
      fontFamily: 'Inter, sans-serif', overflow: 'hidden',
    }}>
      {/* ── Painel de marca (esquerda) ─────────────────────────────────── */}
      <div style={{
        flex: '1 1 52%', position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 56px',
        background: 'linear-gradient(150deg, #1E3C3C 0%, #1B5E6E 100%)',
        color: '#C8D8D5', overflow: 'hidden',
        // dá ao LogoIcon (usa var(--sb-text)) um tom claro sobre o teal escuro
        '--sb-text': '#DCEBE8',
      }}>
        {/* textura de grade sutil */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* brilho radial */}
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%', width: 520, height: 520,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(77,184,160,0.28) 0%, transparent 70%)',
        }} />

        {/* topo: logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon />
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 20, color: '#FFFFFF', lineHeight: 1, margin: 0 }}>
            SusPredict
          </p>
        </div>

        {/* meio: headline */}
        <div style={{ position: 'relative', maxWidth: 460 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8FCFC0',
            background: 'rgba(77,184,160,0.12)', border: '1px solid rgba(77,184,160,0.3)',
            padding: '5px 11px', borderRadius: 999, marginBottom: 22,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DB8A0' }} />
            Inteligência epidemiológica
          </span>
          <h1 style={{
            fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 38, lineHeight: 1.08,
            color: '#FFFFFF', margin: '0 0 16px', letterSpacing: '-0.02em',
          }}>
            Antecipe a demanda do SUS{' '}
            <span style={{ color: '#7FD4C0' }}>
              antes que ela chegue.
            </span>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#A9CFC9', margin: 0 }}>
            Análise preditiva de óbitos, internações e notificações por município e período.
            Modelos sobre dados públicos do DATASUS.
          </p>

          {/* mini-stats */}
          <div style={{ display: 'flex', gap: 36, marginTop: 36 }}>
            {[['5.570', 'municípios'], ['6', 'bases SUS'], ['Prophet', '+ OLS']].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7FA8A2', marginTop: 6 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* rodapé */}
        <p style={{ position: 'relative', fontSize: 11, color: '#6B928C', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
          TCC 2026 · FIAP · Dados públicos DATASUS
        </p>
      </div>

      {/* ── Painel de acesso (direita) ─────────────────────────────────── */}
      <div style={{
        flex: '1 1 48%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6B665D', margin: '0 0 6px' }}>
            Bem-vinda de volta
          </p>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', margin: '0 0 28px', letterSpacing: '-0.01em' }}>
            Entrar na plataforma
          </h2>

          {/* perfil de demonstração */}
          <button
            onClick={onEnter}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              padding: '14px 16px', background: '#FFFFFF', border: '1px solid #E5E1D6',
              borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s', marginBottom: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4DB8A0'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(27,94,110,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E1D6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
          >
            <span style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1B5E6E 0%, #4DB8A0 100%)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, fontFamily: 'Inter Tight, sans-serif',
            }}>MO</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1A1814', lineHeight: 1.2 }}>Márcia Oliveira</span>
              <span style={{ display: 'block', fontSize: 12, color: '#8A8579', marginTop: 2 }}>Gestora municipal · demonstração</span>
            </span>
            <span className="material-symbols-rounded" style={{ fontSize: 20, color: '#1B5E6E' }}>arrow_forward</span>
          </button>

          {/* divisor */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '22px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#E5E1D6' }} />
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A8A39A' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: '#E5E1D6' }} />
          </div>

          {/* criar conta */}
          <button
            onClick={() => setErro('Estamos trabalhando na criação de contas. Por enquanto, continue como Márcia Oliveira.')}
            style={{
              width: '100%', padding: '13px 16px', background: '#FFFFFF', color: '#3D3A33',
              border: '1.5px solid #E5E1D6', borderRadius: 12, fontSize: 14, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#F0EDE6'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; }}
          >
            <span className="material-symbols-rounded" style={{ fontSize: 18, color: '#6B665D' }}>person_add</span>
            Criar conta
          </button>

          {erro && (
            <div className="rise" style={{
              marginTop: 18, padding: '13px 15px', background: '#FBF1E3', border: '1px solid #ECDCC2',
              borderRadius: 12, display: 'flex', gap: 11, alignItems: 'flex-start',
            }}>
              <span className="material-symbols-rounded" style={{ fontSize: 19, color: '#A6580F', flexShrink: 0 }}>construction</span>
              <span style={{ color: '#7A4A12', fontSize: 13, lineHeight: 1.5 }}>{erro}</span>
            </div>
          )}

          <p style={{ marginTop: 28, fontSize: 11.5, color: '#A8A39A', textAlign: 'center', lineHeight: 1.5 }}>
            Ao continuar você concorda com o uso de dados públicos<br />conforme a política de privacidade do SUS Predict.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [page, setPage] = useState('visao-geral');
  const [themeId, setThemeId] = useState('teal');
  const themeVars = (THEMES[themeId] || THEMES.teal).vars;

  if (!authed) return <LoginScreen onEnter={() => setAuthed(true)} />;

  function render() {
    switch (page) {
      case 'visao-geral':   return <PageVisaoGeral />;
      case 'epidemiologia': return <PageEpidemiologia />;
      case 'internacoes':   return <PageInternacoes />;
      case 'vacinal':       return <PagePlaceholder icon="💉" title="Cobertura Vacinal" description="Painel de cobertura vacinal por imunobiológico, faixa etária e UBS. Integração com SIPNI em desenvolvimento." />;
      case 'superlotacao':  return <PagePlaceholder icon="🏥" title="Superlotação CNES" description="Monitoramento em tempo real de ocupação de leitos, UTI e pronto-socorros. Módulo em desenvolvimento." />;
      case 'insumos':       return <PagePlaceholder icon="💊" title="Ruptura de Insumos" description="Rastreamento de estoque de medicamentos essenciais e alertas de ruptura por UBS." />;
      case 'alertas':       return <PagePlaceholder icon="🔔" title="Central de Alertas" description="Todos os alertas ativos, histórico de notificações e configuração de thresholds." />;
      case 'configuracoes': return <PageConfiguracoes />;
      case 'perfil':        return <PagePerfil />;
      default:              return <PageVisaoGeral />;
    }
  }

  return (
    <ThemeContext.Provider value={{ themeId, setThemeId }}>
      <div style={{ ...themeVars, display: 'flex', minHeight: '100vh', background: '#F6F5F2' }}>
        <Sidebar current={page} onNav={setPage} />
        <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Topbar current={page} />
          <main style={{ position: 'fixed', top: 60, right: 0, left: 220, bottom: 0, background: SB }}>
            <div style={{ height: '100%', background: '#F1F4F3', borderTopLeftRadius: 20, border: '1px solid var(--sb-border)', borderRight: 'none', borderBottom: 'none', boxShadow: '-2px -2px 8px rgba(0,0,0,0.04)', overflowY: 'auto' }}>
              <div style={{ padding: '28px 36px', maxWidth: 1600, margin: '0 auto' }}>
                {render()}
              </div>
            </div>
          </main>
        </div>
        <FloatingChat page={page} />
      </div>
    </ThemeContext.Provider>
  );
}
