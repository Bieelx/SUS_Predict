import { useState } from 'react';
import {
  ComposedChart, LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { Card, MIcon } from '../shared/ui.jsx';

// ─── Dados mock (topo do arquivo — sem fetch/axios) ────────────────────────────
//
// Município de referência: Cotia/SP (mesmo padrão de Visão Geral e Insumos).
// Data de hoje assumida: 14/07/2026 — usada só para justificar os deltas de
// "há X dias" abaixo, não é lida em runtime (tudo é estático).

const SEVERIDADE = {
  critico: { rotulo: 'crítico', cor: 'var(--risk-alto)' },
  alerta:  { rotulo: 'alerta',  cor: 'var(--risk-medio)' },
};

const TIPO_ICONE = { surto: 'coronavirus', ruptura: 'inventory_2', ocupacao: 'bed' };
const TIPO_LABEL = { surto: 'Surto', ruptura: 'Ruptura', ocupacao: 'Ocupação' };

const FILTROS_TIPO = [
  { id: 'todos',    label: 'Todos' },
  { id: 'surto',    label: 'Surto' },
  { id: 'ruptura',  label: 'Ruptura' },
  { id: 'ocupacao', label: 'Ocupação' },
];

// Alertas ativos (Novo + Em andamento) — estado inicial, mutável em runtime
// conforme a gestora aciona as ações (Camada 3 do doc da tela).
const ALERTAS_INICIAIS = [
  {
    id: 'alt-01',
    tipo: 'ruptura',
    severidade: 'critico',
    status: 'novo',
    titulo: 'Ruptura — Dipirona 500mg',
    evidencia: '22 dias restantes, consumo acelerado +12%',
    origem: 'Estoque · Insumos',
    tempo: 'há 2h',
    acao: { tipo: 'etp', label: 'Gerar ETP' },
    // payload exigido pelo contrato de onGerarEtp — não alterar as chaves
    item: { nome: 'Dipirona 500mg', diasRestantes: 22, consumoSemanal: 120 },
    detalhe: {
      texto: 'Consumo semanal médio subiu de ~107 para 120 unidades nas últimas 3 semanas — projeção de ruptura em 22 dias no ritmo atual.',
      grafico: 'estoque',
      serie: [
        { label: 'hoje', estoque: 264 },
        { label: '+5d',  estoque: 204 },
        { label: '+10d', estoque: 144 },
        { label: '+15d', estoque: 84 },
        { label: '+20d', estoque: 24 },
        { label: '+22d', estoque: 0 },
      ],
      limiar: 30,
    },
    timeline: [
      { rotulo: 'Detectado', data: 'hoje, 2h atrás' },
    ],
  },
  {
    id: 'alt-02',
    tipo: 'surto',
    severidade: 'alerta',
    status: 'novo',
    titulo: 'Surto previsto — dengue, 60 dias',
    evidencia: 'probabilidade 78% · modelo Holt',
    origem: 'SINAN · Modelo preditivo',
    tempo: 'há 5h',
    acao: { tipo: 'drawer', label: 'Ver detalhes' },
    detalhe: {
      texto: 'Tendência de casos notificados de dengue projetada para os próximos 60 dias, com banda de confiança de 80% pelo modelo Holt (suavização exponencial dupla, log1p).',
      grafico: 'surto',
      probabilidade: 78,
      serie: [
        { semana: 'S1', casos: 38,  min: 30,  max: 46 },
        { semana: 'S2', casos: 45,  min: 35,  max: 55 },
        { semana: 'S3', casos: 54,  min: 40,  max: 68 },
        { semana: 'S4', casos: 66,  min: 47,  max: 85 },
        { semana: 'S5', casos: 79,  min: 54,  max: 104 },
        { semana: 'S6', casos: 94,  min: 61,  max: 127 },
        { semana: 'S7', casos: 112, min: 68,  max: 156 },
        { semana: 'S8', casos: 133, min: 76,  max: 190 },
      ],
    },
    timeline: [
      { rotulo: 'Detectado', data: 'hoje, 5h atrás' },
    ],
  },
  {
    id: 'alt-03',
    tipo: 'ocupacao',
    severidade: 'alerta',
    status: 'novo',
    titulo: 'Ocupação UTI Adulto — Hospital Regional Oeste',
    evidencia: 'projeção 87% em 30 dias',
    origem: 'SIH + CNES',
    tempo: 'há 1 dia',
    acao: { tipo: 'plano', label: 'Acionar Plano' },
    detalhe: {
      texto: 'Projeção de ocupação de leitos de UTI Adulto combinando internações SIH e capacidade instalada CNES — threshold operacional de 85%.',
      grafico: 'ocupacao',
      serie: [
        { label: 'hoje', ocupacao: 71 },
        { label: '+7d',  ocupacao: 76 },
        { label: '+14d', ocupacao: 80 },
        { label: '+21d', ocupacao: 84 },
        { label: '+30d', ocupacao: 87 },
      ],
      threshold: 85,
    },
    timeline: [
      { rotulo: 'Detectado', data: 'ontem' },
    ],
  },
  {
    id: 'alt-04',
    tipo: 'ruptura',
    severidade: 'alerta',
    status: 'andamento',
    titulo: 'Ruptura — Insulina NPH',
    evidencia: 'ETP gerado em 30/06/2026 — aguardando entrega',
    origem: 'Estoque · Insumos',
    tempo: 'há 14 dias',
    diasAguardando: 14,
    acao: { tipo: 'ver', label: 'Ver ETP' },
    detalhe: {
      texto: 'ETP gerado em 30/06/2026 para reposição de Insulina NPH — pedido em trânsito, dentro do prazo de 34 dias restantes de estoque.',
      grafico: 'estoque',
      serie: [
        { label: 'hoje', estoque: 168 },
        { label: '+10d', estoque: 118 },
        { label: '+20d', estoque: 68 },
        { label: '+30d', estoque: 18 },
        { label: '+34d', estoque: 0 },
      ],
      limiar: 30,
    },
    timeline: [
      { rotulo: 'Detectado',            data: '26/06/2026' },
      { rotulo: 'Em andamento',         data: '30/06/2026 — ETP gerado' },
      { rotulo: 'Aguardando confirmação', data: 'em curso há 14 dias' },
    ],
  },
  {
    id: 'alt-05',
    tipo: 'ocupacao',
    severidade: 'alerta',
    status: 'andamento',
    titulo: 'Ocupação — Enfermaria Hospital Regional Oeste',
    evidencia: 'plano acionado em 28/05/2026',
    origem: 'SIH + CNES',
    tempo: 'há 47 dias',
    diasAguardando: 47,
    acao: { tipo: 'ver', label: 'Ver plano' },
    detalhe: {
      texto: 'Plano de contingência de leitos acionado em 28/05/2026 — o sistema ainda não reconfirmou queda de ocupação abaixo do threshold de 85%.',
      grafico: 'ocupacao',
      serie: [
        { label: 'hoje', ocupacao: 89 },
        { label: '+7d',  ocupacao: 88 },
        { label: '+14d', ocupacao: 86 },
        { label: '+21d', ocupacao: 85 },
        { label: '+28d', ocupacao: 83 },
      ],
      threshold: 85,
    },
    timeline: [
      { rotulo: 'Detectado',            data: '20/05/2026' },
      { rotulo: 'Em andamento',         data: '28/05/2026 — plano acionado' },
      { rotulo: 'Aguardando confirmação', data: 'em curso há 47 dias' },
    ],
  },
];

// Histórico (resolvidos) — 14 itens, fev–jun/2026, com as 3 datas de rastreabilidade.
const HISTORICO = [
  { id: 'h-01', tipo: 'surto',    titulo: 'Surto — Chikungunya, Zona Leste',                        surgiu: '02/02', agido: '04/02', resolvido: '19/02' },
  { id: 'h-02', tipo: 'ruptura',  titulo: 'Ruptura — Amoxicilina 500mg',                             surgiu: '06/02', agido: '08/02', resolvido: '24/02' },
  { id: 'h-03', tipo: 'ocupacao', titulo: 'Ocupação — UTI Neonatal, Hospital Municipal',              surgiu: '11/02', agido: '12/02', resolvido: '27/02' },
  { id: 'h-04', tipo: 'surto',    titulo: 'Surto — Diarreia aguda, creches Zona Norte',                surgiu: '18/02', agido: '20/02', resolvido: '08/03' },
  { id: 'h-05', tipo: 'ruptura',  titulo: 'Ruptura — Soro Fisiológico 0,9% 500ml',                    surgiu: '25/02', agido: '27/02', resolvido: '14/03' },
  { id: 'h-06', tipo: 'ocupacao', titulo: 'Ocupação — Enfermaria Pediátrica, UBS Central',             surgiu: '04/03', agido: '05/03', resolvido: '21/03' },
  { id: 'h-07', tipo: 'surto',    titulo: 'Surto — Influenza sazonal',                                 surgiu: '10/03', agido: '12/03', resolvido: '30/03' },
  { id: 'h-08', tipo: 'ruptura',  titulo: 'Ruptura — Losartana 50mg',                                  surgiu: '17/03', agido: '19/03', resolvido: '04/04' },
  { id: 'h-09', tipo: 'ocupacao', titulo: 'Ocupação — UTI Adulto, Hospital Regional Oeste',            surgiu: '24/03', agido: '26/03', resolvido: '15/04' },
  { id: 'h-10', tipo: 'surto',    titulo: 'Surto — Escabiose, unidade prisional',                      surgiu: '02/04', agido: '04/04', resolvido: '22/04' },
  { id: 'h-11', tipo: 'ruptura',  titulo: 'Ruptura — Sais de Reidratação Oral',                        surgiu: '09/04', agido: '11/04', resolvido: '29/04' },
  { id: 'h-12', tipo: 'ocupacao', titulo: 'Ocupação — Pronto-Socorro Municipal',                       surgiu: '16/04', agido: '18/04', resolvido: '08/05' },
  { id: 'h-13', tipo: 'surto',    titulo: 'Surto — Conjuntivite viral, escolas da rede municipal',      surgiu: '23/04', agido: '25/04', resolvido: '13/05' },
  { id: 'h-14', tipo: 'ruptura',  titulo: 'Ruptura — Metformina 850mg',                                 surgiu: '05/06', agido: '07/06', resolvido: '25/06' },
];

// ─── Subcomponentes ─────────────────────────────────────────────────────────

function ChipFiltro({ ativo, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 13px', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer',
        background: ativo ? 'var(--primary)' : 'transparent',
        color: ativo ? 'white' : 'var(--ink-500)',
        border: ativo ? '1px solid var(--primary)' : '1px solid var(--ink-200)',
        transition: 'background .15s, color .15s',
      }}
    >
      {children}
    </button>
  );
}

function ChipEstado({ status, cor }) {
  if (status === 'novo') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4,
        fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
        color: cor, background: `color-mix(in srgb, ${cor} 16%, var(--elev))`,
        border: `1px solid color-mix(in srgb, ${cor} 35%, transparent)`, whiteSpace: 'nowrap',
      }}>
        Novo
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4,
      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
      color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, var(--elev))',
      border: '1px solid color-mix(in srgb, var(--warn) 30%, transparent)', whiteSpace: 'nowrap',
    }}>
      Em andamento
    </span>
  );
}

function BotaoAcao({ alerta, onAcao }) {
  const primario = alerta.acao.tipo === 'etp' || alerta.acao.tipo === 'plano';
  return (
    <button
      onClick={(e) => onAcao(e, alerta)}
      style={{
        flexShrink: 0, padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700,
        cursor: 'pointer', whiteSpace: 'nowrap',
        background: primario ? 'var(--primary)' : 'var(--primary-soft)',
        color: primario ? 'white' : 'var(--primary)',
        border: primario ? '1px solid var(--primary)' : '1px solid var(--primary-soft-border)',
      }}
    >
      {alerta.acao.label}
    </button>
  );
}

function LinhaAlerta({ alerta, onAbrir, onAcao }) {
  const sev = SEVERIDADE[alerta.severidade] || SEVERIDADE.alerta;
  const destaque = alerta.status === 'andamento' && (alerta.diasAguardando || 0) > 30;

  // Enter/Espaço abrem o drawer — mas só quando o foco está na própria linha,
  // não quando o descendente (botão de ação) já trata sua própria ativação.
  function handleKeyDown(e) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAbrir(alerta);
    }
  }

  return (
    <div
      onClick={() => onAbrir(alerta)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 4px',
        borderBottom: '1px solid var(--ink-50)', cursor: 'pointer',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: sev.cor, marginTop: 6, flexShrink: 0 }} />
      <div style={{ marginTop: 1, flexShrink: 0 }}>
        <ChipEstado status={alerta.status} cor={sev.cor} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MIcon m={TIPO_ICONE[alerta.tipo]} size={15} />
          <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>{alerta.titulo}</p>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--ink-500)', margin: '3px 0 0' }}>{alerta.evidencia}</p>
        <p style={{ fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5, color: 'var(--ink-300)', margin: '5px 0 0' }}>
          {alerta.origem} · {alerta.tempo}
        </p>
        {destaque && (
          <p style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, padding: '3px 8px',
            borderRadius: 5, fontSize: 10.5, fontWeight: 700, color: 'var(--warn)',
            background: 'color-mix(in srgb, var(--warn) 12%, var(--elev))',
          }}>
            <MIcon m="schedule" size={12} />
            aguardando confirmação há {alerta.diasAguardando} dias
          </p>
        )}
      </div>
      <div style={{ marginTop: 2 }}>
        <BotaoAcao alerta={alerta} onAcao={onAcao} />
      </div>
    </div>
  );
}

function LinhaHistorico({ item, onAbrir }) {
  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAbrir(item);
    }
  }

  return (
    <div
      onClick={() => onAbrir(item)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px',
        borderBottom: '1px solid var(--ink-50)', cursor: 'pointer',
      }}
    >
      <MIcon m={TIPO_ICONE[item.tipo]} size={14} />
      <p style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-400)', margin: 0 }}>
        {item.titulo}
      </p>
      <p style={{ fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5, color: 'var(--ink-300)', margin: 0, flexShrink: 0 }}>
        surgiu {item.surgiu} · agido {item.agido} · resolvido {item.resolvido}
      </p>
    </div>
  );
}

function GraficoDrawer({ detalhe }) {
  if (!detalhe) return null;

  if (detalhe.grafico === 'surto') {
    return (
      <>
        <ResponsiveContainer width="100%" height={170}>
          <ComposedChart data={detalhe.serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid stroke="var(--ink-50)" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--ink-100)' }} />
            {/* banda de confiança: pinta 0→max, depois "apaga" 0→min por cima com a cor de fundo */}
            <Area type="monotone" dataKey="max" stroke="none" fill="var(--info)" fillOpacity={0.14} isAnimationActive={false} />
            <Area type="monotone" dataKey="min" stroke="none" fill="var(--elev)" fillOpacity={1} isAnimationActive={false} />
            <Line type="monotone" dataKey="casos" stroke="var(--info)" strokeWidth={2.2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
        <p style={{ fontSize: 10.5, color: 'var(--ink-400)', textAlign: 'center', marginTop: 2 }}>
          modelo Holt · confiança {detalhe.probabilidade}%
        </p>
      </>
    );
  }

  if (detalhe.grafico === 'estoque') {
    return (
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={detalhe.serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-50)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--ink-100)' }} />
          <ReferenceLine y={detalhe.limiar} stroke="var(--warn)" strokeDasharray="4 3" label={{ value: 'limiar de reposição', position: 'insideTopRight', fontSize: 9.5, fill: 'var(--warn)' }} />
          <Line type="monotone" dataKey="estoque" stroke="var(--risk-alto)" strokeWidth={2.2} dot={{ r: 2.5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (detalhe.grafico === 'ocupacao') {
    return (
      <ResponsiveContainer width="100%" height={170}>
        <LineChart data={detalhe.serie} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke="var(--ink-50)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--ink-100)' }} />
          <ReferenceLine y={detalhe.threshold} stroke="var(--bad)" strokeDasharray="4 3" label={{ value: `threshold ${detalhe.threshold}%`, position: 'insideTopRight', fontSize: 9.5, fill: 'var(--bad)' }} />
          <Line type="monotone" dataKey="ocupacao" stroke="var(--risk-medio)" strokeWidth={2.2} dot={{ r: 2.5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return null;
}

function Timeline({ passos }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {passos.map((p, i) => (
        <div key={i} style={{ display: 'flex', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--primary)', marginTop: 3 }} />
            {i < passos.length - 1 && <span style={{ width: 1.5, flex: 1, background: 'var(--ink-100)', minHeight: 24 }} />}
          </div>
          <div style={{ paddingBottom: 16 }}>
            <p style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-900)', margin: 0 }}>{p.rotulo}</p>
            <p style={{ fontSize: 11.5, color: 'var(--ink-500)', margin: '2px 0 0' }}>{p.data}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Alertas({ onNavigate, onGerarEtp }) {
  const [alertas, setAlertas] = useState(ALERTAS_INICIAIS);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [historicoAberto, setHistoricoAberto] = useState(false);
  const [drawer, setDrawer] = useState(null); // { kind: 'ativo'|'historico', data }

  const nNovos = alertas.filter(a => a.status === 'novo').length;
  const nAndamento = alertas.filter(a => a.status === 'andamento').length;
  const nResolvidos = HISTORICO.length;

  const ativosFiltrados = alertas.filter(a => filtroTipo === 'todos' || a.tipo === filtroTipo);
  const listaAtiva = [
    ...ativosFiltrados.filter(a => a.status === 'novo'),
    ...ativosFiltrados.filter(a => a.status === 'andamento'),
  ];
  const historicoFiltrado = HISTORICO.filter(h => filtroTipo === 'todos' || h.tipo === filtroTipo);

  function moverParaAndamento(alerta) {
    // rótulo do botão pós-transição: Gerar ETP → Ver ETP · Acionar Plano → Ver plano
    const rotuloVer = alerta.acao.tipo === 'etp' ? 'Ver ETP' : 'Ver plano';
    setAlertas(prev => prev.map(a => (
      a.id === alerta.id
        ? {
            ...a,
            status: 'andamento',
            acao: { tipo: 'ver', label: rotuloVer },
            timeline: [...a.timeline, { rotulo: 'Em andamento', data: 'hoje — ação registrada' }],
          }
        : a
    )));
  }

  function handleAcao(e, alerta) {
    e.stopPropagation();
    if (alerta.acao.tipo === 'etp') {
      onGerarEtp?.({ tipo: 'alerta', item: alerta.item });
      moverParaAndamento(alerta);
    } else if (alerta.acao.tipo === 'plano') {
      moverParaAndamento(alerta);
    } else {
      // 'drawer' (Ver detalhes) e 'ver' (Ver ETP / Ver plano) não mudam estado — só abrem o drawer
      setDrawer({ kind: 'ativo', data: alerta });
    }
  }

  function abrirDrawerAtivo(alerta) {
    setDrawer({ kind: 'ativo', data: alerta });
  }
  function abrirDrawerHistorico(item) {
    setDrawer({ kind: 'historico', data: item });
  }
  function fecharDrawer() {
    setDrawer(null);
  }

  const alertaAtivoDrawer = drawer?.kind === 'ativo' ? alertas.find(a => a.id === drawer.data.id) : null;
  const itemHistoricoDrawer = drawer?.kind === 'historico' ? drawer.data : null;

  return (
    <div className="rise">
      <style>{`
        @keyframes alertasOverlayIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes alertasDrawerIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
            Central de Alertas
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Triagem de surtos, rupturas de insumo e ocupação acima do threshold.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
          <span>
            <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-900)' }}>{nNovos.toLocaleString('pt-BR')}</strong>{' '}
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>novos</span>
          </span>
          <span style={{ color: 'var(--ink-200)' }}>·</span>
          <span>
            <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-900)' }}>{nAndamento.toLocaleString('pt-BR')}</strong>{' '}
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>em andamento</span>
          </span>
          <span style={{ color: 'var(--ink-200)' }}>·</span>
          <span>
            <strong style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-900)' }}>{nResolvidos.toLocaleString('pt-BR')}</strong>{' '}
            <span style={{ fontSize: 12.5, color: 'var(--ink-500)' }}>resolvidos</span>
          </span>
        </div>
      </div>

      {/* Camada 1 — filtro por tipo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {FILTROS_TIPO.map(f => (
          <ChipFiltro key={f.id} ativo={filtroTipo === f.id} onClick={() => setFiltroTipo(f.id)}>
            {f.label}
          </ChipFiltro>
        ))}
      </div>

      {/* Camada 2 + 3 — lista ativa (novos + em andamento) */}
      <Card className="p-5" style={{ marginBottom: 16 }}>
        {listaAtiva.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--ink-400)', textAlign: 'center', padding: '20px 0' }}>
            Nenhum alerta ativo para este filtro.
          </p>
        ) : (
          listaAtiva.map(a => (
            <LinhaAlerta key={a.id} alerta={a} onAbrir={abrirDrawerAtivo} onAcao={handleAcao} />
          ))
        )}
      </Card>

      {/* Camada 4 — histórico */}
      <Card className="p-5">
        <button
          onClick={() => setHistoricoAberto(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none',
            cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink-700)',
          }}
        >
          <MIcon m={historicoAberto ? 'expand_more' : 'chevron_right'} size={17} />
          Histórico ({historicoFiltrado.length.toLocaleString('pt-BR')} resolvidos)
        </button>

        {historicoAberto && (
          <div style={{ marginTop: 12 }}>
            {historicoFiltrado.length === 0 ? (
              <p style={{ fontSize: 12.5, color: 'var(--ink-400)', padding: '10px 0' }}>Nenhum item resolvido para este filtro.</p>
            ) : (
              historicoFiltrado.map(h => (
                <LinhaHistorico key={h.id} item={h} onAbrir={abrirDrawerHistorico} />
              ))
            )}
          </div>
        )}
      </Card>

      {/* Camada 5 — drawer de detalhe */}
      {drawer && (
        <>
          <div
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); fecharDrawer(); }}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.35)', zIndex: 60,
              animation: 'alertasOverlayIn .18s ease-out',
            }}
          />
          <div
            style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw',
              background: 'var(--elev)', borderLeft: '1px solid var(--ink-100)', zIndex: 61,
              boxShadow: '-8px 0 24px rgba(26,24,20,0.12)', overflowY: 'auto',
              animation: 'alertasDrawerIn .22s cubic-bezier(0.2,0.7,0.3,1)',
              padding: '22px 22px 28px',
            }}
          >
            {alertaAtivoDrawer && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                  <div>
                    <ChipEstado status={alertaAtivoDrawer.status} cor={(SEVERIDADE[alertaAtivoDrawer.severidade] || SEVERIDADE.alerta).cor} />
                    <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--ink-900)', margin: '8px 0 0' }}>
                      {alertaAtivoDrawer.titulo}
                    </h2>
                    <p style={{ fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5, color: 'var(--ink-300)', margin: '4px 0 0' }}>
                      {alertaAtivoDrawer.origem} · {alertaAtivoDrawer.tempo}
                    </p>
                  </div>
                  <button onClick={fecharDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', flexShrink: 0 }}>
                    <MIcon m="close" size={20} />
                  </button>
                </div>

                <p style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5, marginBottom: 16 }}>
                  {alertaAtivoDrawer.detalhe.texto}
                </p>

                <div style={{ marginBottom: 20 }}>
                  <GraficoDrawer detalhe={alertaAtivoDrawer.detalhe} />
                </div>

                <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  Linha do tempo do alerta
                </p>
                <Timeline passos={alertaAtivoDrawer.timeline} />

                <div style={{ marginTop: 8 }}>
                  <BotaoAcao alerta={alertaAtivoDrawer} onAcao={handleAcao} />
                </div>
              </>
            )}

            {itemHistoricoDrawer && (
              <>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                  <div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4,
                      fontSize: 9.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: 'var(--good)', background: 'color-mix(in srgb, var(--good) 14%, var(--elev))',
                      border: '1px solid color-mix(in srgb, var(--good) 30%, transparent)',
                    }}>
                      Resolvido
                    </span>
                    <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 17, fontWeight: 800, color: 'var(--ink-900)', margin: '8px 0 0' }}>
                      {itemHistoricoDrawer.titulo}
                    </h2>
                    <p style={{ fontFamily: 'var(--ff-mono, monospace)', fontSize: 10.5, color: 'var(--ink-300)', margin: '4px 0 0' }}>
                      {TIPO_LABEL[itemHistoricoDrawer.tipo]}
                    </p>
                  </div>
                  <button onClick={fecharDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', flexShrink: 0 }}>
                    <MIcon m="close" size={20} />
                  </button>
                </div>

                <p style={{ fontSize: 12.5, color: 'var(--ink-500)', lineHeight: 1.5, marginBottom: 20 }}>
                  Alerta reconfirmado como resolvido pelo sistema em {itemHistoricoDrawer.resolvido} — condição de origem não existe mais no dado.
                </p>

                <p style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--ink-700)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                  Linha do tempo do alerta
                </p>
                <Timeline passos={[
                  { rotulo: 'Detectado', data: itemHistoricoDrawer.surgiu },
                  { rotulo: 'Em andamento', data: itemHistoricoDrawer.agido },
                  { rotulo: 'Resolvido', data: itemHistoricoDrawer.resolvido },
                ]} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
