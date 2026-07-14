// Tela 02 — Ruptura de Insumos (docs/telas/02-ruptura-insumos.md)
//
// Não é uma tela de leitura passiva: a história é financeira (economia estimada agindo
// agora), não binária, e depende de um dado que o DATASUS não fornece (estoque) — por
// isso a tela carrega também uma dimensão de entrada de dado (CRUD de estoque). Todos os
// dados abaixo são mock estático — nenhum fetch/axios nesta tela.

import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Line,
  ReferenceLine, ReferenceDot,
} from 'recharts';
import { Card, Badge, MIcon } from '../shared/ui.jsx';

// ─── Mock: fatos canônicos do município (Cotia — SP) ──────────────────────────

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };

const LIMIAR_CRITICO = 30;   // < 30 dias restantes
const LIMIAR_ALERTA = 60;    // 30–60 dias restantes
const LIMIAR_DESATUALIZADO = 15; // > 15 dias sem atualização → confiança reduzida

const ECONOMIA_ESTIMADA = 38400;

// "Hoje" fixo para o mock, usado para derivar data absoluta de última atualização a
// partir de "atualizado há X dias" (dado canônico da tela).
const HOJE = new Date(2026, 6, 14);

const ORIGEM_LABEL = { upload: 'Upload', manual: 'Manual', api: 'API' };

// qtdAtual é derivada do par (diasRestantes, consumoSemanal) canônicos, para que a
// edição no CRUD recalcule dias restantes de forma consistente com os valores oficiais
// da tela: qtdAtual = consumoSemanal * diasRestantes / 7.
const ESTOQUE_INICIAL = [
  { id: 'ins-1', nome: 'Dipirona 500mg', qtdAtual: 377, consumoSemanal: 120, unidade: 'cp', precoUnitario: 0.15, origem: 'manual', atualizadoHaDias: 3 },
  { id: 'ins-2', nome: 'Soro fisiológico 1L', qtdAtual: 1360, consumoSemanal: 340, unidade: 'fr', precoUnitario: 4.80, origem: 'upload', atualizadoHaDias: 3 },
  { id: 'ins-3', nome: 'Insulina NPH', qtdAtual: 291, consumoSemanal: 60, unidade: 'fr', precoUnitario: 22.50, origem: 'manual', atualizadoHaDias: 6, etpGeradoEm: '30/06' },
  { id: 'ins-4', nome: 'Amoxicilina 500mg', qtdAtual: 516, consumoSemanal: 95, unidade: 'cp', precoUnitario: 0.32, origem: 'upload', atualizadoHaDias: 3 },
  { id: 'ins-5', nome: 'Repelente infantil', qtdAtual: 257, consumoSemanal: 40, unidade: 'un', precoUnitario: null, origem: 'manual', atualizadoHaDias: 19 },
  { id: 'ins-6', nome: 'Ondansetrona 8mg', qtdAtual: 168, consumoSemanal: 25, unidade: 'amp', precoUnitario: 3.10, origem: 'upload', atualizadoHaDias: 5 },
  { id: 'ins-7', nome: 'Paracetamol 750mg', qtdAtual: 1560, consumoSemanal: 210, unidade: 'cp', precoUnitario: 0.10, origem: 'upload', atualizadoHaDias: 3 },
  { id: 'ins-8', nome: 'Dexametasona 4mg', qtdAtual: 236, consumoSemanal: 30, unidade: 'amp', precoUnitario: null, origem: 'manual', atualizadoHaDias: 8 },
  { id: 'ins-9', nome: 'Omeprazol 20mg', qtdAtual: 1243, consumoSemanal: 150, unidade: 'cp', precoUnitario: 0.28, origem: 'upload', atualizadoHaDias: 3 },
  { id: 'ins-10', nome: 'Soro glicosado 5%', qtdAtual: 964, consumoSemanal: 90, unidade: 'fr', precoUnitario: 5.20, origem: 'api', atualizadoHaDias: 3 },
  { id: 'ins-11', nome: 'Luva de procedimento M', qtdAtual: 10286, consumoSemanal: 800, unidade: 'par', precoUnitario: 0.45, origem: 'api', atualizadoHaDias: 3 },
];

const SETORES_CONSUMO = [
  { setor: 'Pronto-Socorro', consumoSemanal: 1450 },
  { setor: 'Enfermaria', consumoSemanal: 980 },
  { setor: 'UTI', consumoSemanal: 620 },
  { setor: 'Farmácia ambulatorial', consumoSemanal: 410 },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function diasRestantesDe(item) {
  if (!item.consumoSemanal) return Infinity;
  return Math.round((item.qtdAtual / item.consumoSemanal) * 7);
}

function statusDe(dias) {
  if (dias < LIMIAR_CRITICO) return 'critico';
  if (dias <= LIMIAR_ALERTA) return 'alerta';
  return 'ok';
}

function corStatus(status) {
  if (status === 'critico') return 'var(--risk-alto)';
  if (status === 'alerta') return 'var(--risk-medio)';
  return 'var(--risk-baixo)';
}

function rotuloStatus(status) {
  if (status === 'critico') return 'Crítico';
  if (status === 'alerta') return 'Alerta';
  return 'OK';
}

function formatarDataBR(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function dataDeHaDias(diasAtras) {
  const d = new Date(HOJE);
  d.setDate(d.getDate() - diasAtras);
  return formatarDataBR(d);
}

function formatarPreco(valor) {
  if (valor == null) return '—';
  return `R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function gerarSerieProjecao(item) {
  const semanas = [];
  for (let s = 0; s <= 20; s++) {
    semanas.push({ semana: s, estoque: Math.max(0, item.qtdAtual - item.consumoSemanal * s) });
  }
  return semanas;
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

// ─── Sub-componentes ────────────────────────────────────────────────────────

function Cabecalho({ view, onAtualizarEstoque, onVoltar }) {
  if (view === 'crud') {
    return (
      <div style={{ marginBottom: 22 }}>
        <button
          onClick={onVoltar}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--primary)', marginBottom: 10 }}
        >
          ← Voltar
        </button>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 24, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', margin: 0 }}>
          Gestão de Estoque
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: '4px 0 0' }}>
          Origem dos dados de estoque usados para calcular dias restantes — {MUNICIPIO.nome}, {MUNICIPIO.uf}.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
      <div>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Insumos{' '}
          <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
            — {MUNICIPIO.nome}, {MUNICIPIO.uf}
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
          O que vai faltar, em quanto tempo, e o que fazer agora.
        </p>
      </div>
      <button onClick={onAtualizarEstoque} style={estiloBotaoOutline}>
        <MIcon m="inventory_2" size={15} /> Atualizar estoque
      </button>
    </div>
  );
}

function StatInline({ valor, label, cor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 25, fontWeight: 800, color: cor }}>
        {valor}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>{label}</span>
    </div>
  );
}

function Divisor() {
  return <span style={{ width: 1, height: 32, background: 'var(--ink-100)', margin: '0 30px' }} />;
}

function ResumoExecutivo({ criticos, alertas }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 14, marginBottom: 24 }}>
      <StatInline valor={criticos} label="críticos" cor="var(--risk-alto)" />
      <Divisor />
      <StatInline valor={alertas} label="em alerta" cor="var(--risk-medio)" />
      <Divisor />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--good)', display: 'flex' }}>
            <MIcon m="savings" size={19} />
          </span>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 21, fontWeight: 800, color: 'var(--good)' }}>
            R$ {ECONOMIA_ESTIMADA.toLocaleString('pt-BR')}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-700)' }}>economia estimada agindo agora</span>
        </div>
        <p style={{ fontSize: 11, color: 'var(--ink-400)', margin: '2px 0 0 27px' }}>
          compra planejada vs. emergencial (30–40% mais cara) — estimativa
        </p>
      </div>
    </div>
  );
}

function SegmentedControl({ value, onChange, options }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid var(--ink-100)', borderRadius: 9, padding: 3, background: 'var(--elev)', marginBottom: 18 }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '6px 15px', borderRadius: 7, border: 'none', cursor: 'pointer',
            fontSize: 12.5, fontWeight: 700, transition: 'all 0.12s',
            background: value === opt.value ? 'var(--primary)' : 'transparent',
            color: value === opt.value ? 'white' : 'var(--ink-500)',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function LinhaItem({ item, isLast, onAbrirDrawer, onGerarEtp }) {
  const dias = diasRestantesDe(item);
  const status = statusDe(dias);
  const cor = corStatus(status);
  const desatualizado = item.atualizadoHaDias > LIMIAR_DESATUALIZADO;

  // Enter/Espaço abrem o drawer — só quando o foco está na própria linha, não em um
  // descendente (o botão Gerar ETP já trata sua própria ativação via onClick nativo).
  function handleKeyDown(e) {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAbrirDrawer(item);
    }
  }

  return (
    <div
      onClick={() => onAbrirDrawer(item)}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        padding: '14px 22px', borderBottom: isLast ? 'none' : '1px solid var(--ink-100)',
        cursor: 'pointer', transition: 'background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--subtle)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: 1 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-900)' }}>{item.nome}</span>
            {item.etpGeradoEm && <Badge label={`ETP gerado em ${item.etpGeradoEm}`} color="var(--info)" />}
          </div>
          <p style={{
            fontSize: 11, margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4,
            color: desatualizado ? 'var(--warn)' : 'var(--ink-400)',
          }}>
            {desatualizado && <MIcon m="warning" size={12} />}
            atualizado há {item.atualizadoHaDias} dias{desatualizado ? ' — confiança reduzida' : ''}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22, flexShrink: 0 }}>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 15, fontWeight: 700, color: cor, width: 58, textAlign: 'right' }}>
          {dias} d
        </span>
        <span style={{ fontSize: 12, color: 'var(--ink-500)', width: 68, textAlign: 'right' }}>
          {item.consumoSemanal.toLocaleString('pt-BR')}/sem
        </span>
        <button
          onClick={e => { e.stopPropagation(); onGerarEtp(item); }}
          style={{ ...estiloBotaoPrimario, padding: '6px 13px', fontSize: 11.5 }}
        >
          Gerar ETP
        </button>
      </div>
    </div>
  );
}

function ListaPriorizada({ itens, onAbrirDrawer, onGerarEtp }) {
  return (
    <Card>
      {itens.map((item, i) => (
        <LinhaItem
          key={item.id}
          item={item}
          isLast={i === itens.length - 1}
          onAbrirDrawer={onAbrirDrawer}
          onGerarEtp={onGerarEtp}
        />
      ))}
    </Card>
  );
}

function BarrasPorSetor() {
  const max = Math.max(...SETORES_CONSUMO.map(s => s.consumoSemanal));
  return (
    <Card className="p-5">
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', margin: '0 0 16px' }}>
        Top consumo por setor
      </p>
      {SETORES_CONSUMO.slice().sort((a, b) => b.consumoSemanal - a.consumoSemanal).map(s => (
        <div key={s.setor} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ width: 150, flexShrink: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-900)' }}>
            {s.setor}
          </div>
          <div style={{ flex: 1, height: 10, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' }}>
            <div style={{ width: `${(s.consumoSemanal / max) * 100}%`, height: '100%', borderRadius: 99, background: 'var(--primary)' }} />
          </div>
          <div style={{ width: 74, flexShrink: 0, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700, color: 'var(--ink-900)' }}>
            {s.consumoSemanal.toLocaleString('pt-BR')}/sem
          </div>
        </div>
      ))}
    </Card>
  );
}

function TooltipProjecao({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const valor = payload[0]?.value;
  if (valor == null) return null;
  return (
    <div style={{ background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, padding: '8px 12px', fontSize: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <p style={{ fontWeight: 700, color: 'var(--ink-900)', marginBottom: 2 }}>semana {label}</p>
      <p style={{ color: 'var(--ink-500)' }}>
        Estoque projetado:{' '}
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: 'var(--ink-900)' }}>
          {valor.toLocaleString('pt-BR')}
        </span>
      </p>
    </div>
  );
}

function DrawerDetalhe({ item, onClose, onGerarEtp }) {
  if (!item) return null;
  const dias = diasRestantesDe(item);
  const status = statusDe(dias);
  const cor = corStatus(status);
  const desatualizado = item.atualizadoHaDias > LIMIAR_DESATUALIZADO;
  const serie = gerarSerieProjecao(item);
  const semanaRuptura = Math.min(20, Math.round(dias / 7));

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(20,20,18,0.4)', zIndex: 60 }}
      />
      <div
        className="rise"
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, maxWidth: '92vw',
          background: 'var(--elev)', borderLeft: '1px solid var(--ink-100)', zIndex: 61,
          overflowY: 'auto', boxShadow: '-10px 0 30px rgba(0,0,0,0.14)', padding: '28px 26px',
        }}
      >
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: 20, right: 20, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-400)', display: 'flex' }}
        >
          <MIcon m="close" size={20} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingRight: 30 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: cor, flexShrink: 0 }} />
          <h3 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 18, fontWeight: 800, color: 'var(--ink-900)', margin: 0 }}>
            {item.nome}
          </h3>
        </div>
        <div style={{ marginBottom: 22 }}>
          <Badge label={rotuloStatus(status)} color={cor} />
        </div>

        <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', margin: '0 0 12px' }}>
          Projeção de estoque — 20 semanas
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={serie} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--ink-100)" vertical={false} />
            <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={{ stroke: 'var(--ink-100)' }} tickLine={false} interval={3} />
            <YAxis tick={{ fontSize: 10, fill: 'var(--ink-400)' }} axisLine={false} tickLine={false} width={44} />
            <Tooltip content={<TooltipProjecao />} />
            <ReferenceLine y={0} stroke="var(--bad)" strokeDasharray="4 3" label={{ value: 'ruptura', position: 'insideBottomRight', fontSize: 10, fill: 'var(--bad)' }} />
            <Line type="monotone" dataKey="estoque" stroke={cor} strokeWidth={2.5} dot={false} isAnimationActive={false} />
            <ReferenceDot x={semanaRuptura} y={0} r={5} fill="var(--bad)" stroke="var(--elev)" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>

        <div style={{ background: 'var(--subtle)', borderRadius: 10, padding: '14px 16px', margin: '18px 0' }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', margin: '0 0 6px' }}>
            Composição do cálculo
          </p>
          <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink-700)', margin: 0 }}>
            Estoque atual ({item.qtdAtual.toLocaleString('pt-BR')} {item.unidade}) ÷ consumo médio
            ({item.consumoSemanal.toLocaleString('pt-BR')}/sem, ajustado pela previsão epidemiológica
            do modelo Holt/OLS) = <strong style={{ color: 'var(--ink-900)' }}>{dias} dias restantes</strong> até a ruptura.
          </p>
        </div>

        <div style={{ marginBottom: 22 }}>
          <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: '0 0 4px' }}>
            Última atualização: <strong style={{ color: 'var(--ink-900)' }}>{dataDeHaDias(item.atualizadoHaDias)}</strong>
            {' '}({item.atualizadoHaDias} dias atrás)
          </p>
          <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: 0 }}>
            Origem do dado: <strong style={{ color: 'var(--ink-900)' }}>{ORIGEM_LABEL[item.origem]}</strong>
          </p>
          {desatualizado && (
            <p style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 4, margin: '8px 0 0' }}>
              <MIcon m="warning" size={13} /> Estoque desatualizado há mais de {LIMIAR_DESATUALIZADO} dias — confiança reduzida.
            </p>
          )}
          {item.etpGeradoEm && (
            <p style={{ fontSize: 12, color: 'var(--info)', margin: '8px 0 0' }}>
              ETP já gerado em {item.etpGeradoEm} para este item.
            </p>
          )}
        </div>

        <button onClick={() => onGerarEtp(item)} style={{ ...estiloBotaoPrimario, width: '100%', justifyContent: 'center', padding: '11px 0' }}>
          Gerar ETP
        </button>
      </div>
    </>
  );
}

function EstadoVazio({ onEnviarPlanilha, onCadastrarManual }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      padding: '68px 24px', background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 14,
    }}>
      <span style={{ color: 'var(--ink-300)', display: 'flex', marginBottom: 14 }}>
        <MIcon m="inventory_2" size={38} />
      </span>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-900)', margin: '0 0 6px' }}>
        Nenhum estoque cadastrado
      </p>
      <p style={{ fontSize: 13, color: 'var(--ink-500)', margin: '0 0 24px', maxWidth: 360, lineHeight: 1.6 }}>
        Sem estoque cadastrado não é possível calcular dias restantes até a ruptura.
        Envie uma planilha ou cadastre os itens manualmente para começar.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button onClick={onEnviarPlanilha} style={estiloBotaoPrimario}>
          <MIcon m="upload_file" size={15} /> Enviar planilha de estoque
        </button>
        <button onClick={onCadastrarManual} style={estiloBotaoOutline}>
          Cadastrar manualmente
        </button>
      </div>
    </div>
  );
}

// ─── CRUD de estoque (Gestão de Estoque) ───────────────────────────────────

function CampoTexto({ label, value, onChange, type = 'text' }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)' }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          padding: '8px 10px', borderRadius: 7, border: '1px solid var(--ink-100)',
          fontSize: 12.5, color: 'var(--ink-900)', background: 'var(--elev)',
        }}
      />
    </label>
  );
}

function FormItemEstoque({ inicial, onSalvar, onCancelar }) {
  const [nome, setNome] = useState(inicial?.nome ?? '');
  const [qtdAtual, setQtdAtual] = useState(inicial?.qtdAtual ?? '');
  const [consumoSemanal, setConsumoSemanal] = useState(inicial?.consumoSemanal ?? '');
  const [unidade, setUnidade] = useState(inicial?.unidade ?? 'un');
  const [precoUnitario, setPrecoUnitario] = useState(inicial?.precoUnitario ?? '');

  const salvar = () => {
    if (!nome.trim() || qtdAtual === '' || consumoSemanal === '') return;
    onSalvar({
      nome: nome.trim(),
      qtdAtual: Number(qtdAtual),
      consumoSemanal: Number(consumoSemanal),
      unidade: unidade.trim() || 'un',
      precoUnitario: precoUnitario !== '' ? Number(precoUnitario) : null,
    });
  };

  return (
    <Card className="p-5" style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-400)', margin: '0 0 14px' }}>
        {inicial ? 'Editar item' : 'Novo item de estoque'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 0.8fr 1fr', gap: 12, marginBottom: 16 }}>
        <CampoTexto label="Nome do insumo" value={nome} onChange={setNome} />
        <CampoTexto label="Qtd. atual" value={qtdAtual} onChange={setQtdAtual} type="number" />
        <CampoTexto label="Consumo médio /sem" value={consumoSemanal} onChange={setConsumoSemanal} type="number" />
        <CampoTexto label="Unidade" value={unidade} onChange={setUnidade} />
        <CampoTexto label="Preço unit. (opcional)" value={precoUnitario} onChange={setPrecoUnitario} type="number" />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={salvar} style={estiloBotaoPrimario}>Salvar</button>
        <button onClick={onCancelar} style={estiloBotaoOutline}>Cancelar</button>
      </div>
    </Card>
  );
}

function PreviewDiffUpload({ vazio, onConfirmar, onCancelar }) {
  const texto = vazio
    ? '11 itens novos detectados na planilha — confirmar importação?'
    : '12 itens atualizados · 2 novos · 1 removido — confirmar substituição?';
  return (
    <div style={{
      background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', borderRadius: 12,
      padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: 'var(--primary)', display: 'flex' }}>
          <MIcon m="difference" size={19} />
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-900)' }}>{texto}</span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onConfirmar} style={estiloBotaoPrimario}>Confirmar</button>
        <button onClick={onCancelar} style={estiloBotaoOutline}>Cancelar</button>
      </div>
    </div>
  );
}

const estiloTh = {
  textAlign: 'left', padding: '10px 14px', fontSize: 10.5, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ink-400)',
};
const estiloTd = { padding: '12px 14px', fontSize: 12.5, color: 'var(--ink-900)' };
const estiloTdMono = { ...estiloTd, fontFamily: 'JetBrains Mono, monospace' };

function AcoesLinha({ item, onEditar, onExcluir }) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--bad)' }}>Confirmar exclusão?</span>
        <button
          onClick={() => { onExcluir(item.id); setConfirmando(false); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--bad)' }}
        >
          Sim
        </button>
        <button
          onClick={() => setConfirmando(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11.5, fontWeight: 700, color: 'var(--ink-500)' }}
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <>
      <button onClick={() => onEditar(item)} title="Editar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-500)', marginRight: 6, display: 'inline-flex' }}>
        <MIcon m="edit" size={16} />
      </button>
      <button onClick={() => setConfirmando(true)} title="Excluir" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--bad)', display: 'inline-flex' }}>
        <MIcon m="delete" size={16} />
      </button>
    </>
  );
}

function TabelaEstoque({ itens, onEditar, onExcluir }) {
  return (
    <Card>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--ink-100)' }}>
              <th style={estiloTh}>Item</th>
              <th style={estiloTh}>Qtd. atual</th>
              <th style={estiloTh}>Consumo médio</th>
              <th style={estiloTh}>Preço unit.</th>
              <th style={estiloTh}>Origem</th>
              <th style={estiloTh}>Atualizado</th>
              <th style={estiloTh}></th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it, i) => (
              <tr key={it.id} style={{ borderBottom: i === itens.length - 1 ? 'none' : '1px solid var(--ink-100)' }}>
                <td style={{ ...estiloTd, fontWeight: 700 }}>{it.nome}</td>
                <td style={estiloTdMono}>{it.qtdAtual.toLocaleString('pt-BR')} {it.unidade}</td>
                <td style={estiloTdMono}>{it.consumoSemanal.toLocaleString('pt-BR')}/sem</td>
                <td style={estiloTdMono}>{formatarPreco(it.precoUnitario)}</td>
                <td style={estiloTd}><Badge label={ORIGEM_LABEL[it.origem]} color="var(--info)" /></td>
                <td style={estiloTd}>{dataDeHaDias(it.atualizadoHaDias)}</td>
                <td style={{ ...estiloTd, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <AcoesLinha item={it} onEditar={onEditar} onExcluir={onExcluir} />
                </td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '28px 14px', textAlign: 'center', fontSize: 12.5, color: 'var(--ink-400)' }}>
                  Nenhum item cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function GestaoEstoque({
  estoque, formAberto, itemEditando, uploadPreview,
  onNovoItem, onIniciarUpload, onSalvarNovo, onSalvarEdicao, onEditar, onExcluir,
  onCancelarForm, onConfirmarUpload, onCancelarUpload,
}) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={onNovoItem} style={estiloBotaoPrimario}>
          <MIcon m="add" size={15} /> Novo item
        </button>
        <button onClick={onIniciarUpload} style={estiloBotaoOutline}>
          <MIcon m="upload_file" size={15} /> Enviar planilha (CSV/Excel)
        </button>
      </div>

      {uploadPreview && (
        <PreviewDiffUpload vazio={estoque.length === 0} onConfirmar={onConfirmarUpload} onCancelar={onCancelarUpload} />
      )}

      {formAberto && (
        <FormItemEstoque inicial={null} onSalvar={onSalvarNovo} onCancelar={onCancelarForm} />
      )}
      {itemEditando && (
        <FormItemEstoque inicial={itemEditando} onSalvar={dados => onSalvarEdicao(itemEditando.id, dados)} onCancelar={onCancelarForm} />
      )}

      <TabelaEstoque itens={estoque} onEditar={onEditar} onExcluir={onExcluir} />
    </div>
  );
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function Insumos({ onNavigate, onGerarEtp }) {
  const [estoque, setEstoque] = useState(ESTOQUE_INICIAL);
  const [view, setView] = useState('lista'); // 'lista' | 'crud'
  const [modo, setModo] = useState('medicamento'); // 'medicamento' | 'setor'
  const [itemDrawer, setItemDrawer] = useState(null);
  const [formAberto, setFormAberto] = useState(false);
  const [itemEditando, setItemEditando] = useState(null);
  const [uploadPreview, setUploadPreview] = useState(false);

  const itensOrdenados = [...estoque].sort((a, b) => diasRestantesDe(a) - diasRestantesDe(b));
  const criticos = itensOrdenados.filter(it => statusDe(diasRestantesDe(it)) === 'critico').length;
  const alertas = itensOrdenados.filter(it => statusDe(diasRestantesDe(it)) === 'alerta').length;

  const acionarGerarEtp = item => {
    if (typeof onGerarEtp !== 'function') return;
    onGerarEtp({
      tipo: 'insumo',
      item: {
        nome: item.nome,
        diasRestantes: diasRestantesDe(item),
        consumoSemanal: item.consumoSemanal,
        atualizadoHaDias: item.atualizadoHaDias,
      },
    });
  };

  const irParaCrud = () => setView('crud');
  const voltarDaCrud = () => {
    setView('lista');
    setFormAberto(false);
    setItemEditando(null);
    setUploadPreview(false);
  };

  const abrirEnvioPlanilha = () => { setView('crud'); setUploadPreview(true); setFormAberto(false); setItemEditando(null); };
  const abrirCadastroManual = () => { setView('crud'); setFormAberto(true); setUploadPreview(false); setItemEditando(null); };

  const salvarNovoItem = dados => {
    setEstoque(prev => [...prev, { id: `ins-novo-${Date.now()}`, ...dados, origem: 'manual', atualizadoHaDias: 0 }]);
    setFormAberto(false);
  };

  const salvarEdicaoItem = (id, dados) => {
    setEstoque(prev => prev.map(it => (it.id === id ? { ...it, ...dados, atualizadoHaDias: 0 } : it)));
    setItemEditando(null);
  };

  const excluirItem = id => setEstoque(prev => prev.filter(it => it.id !== id));

  const confirmarUpload = () => {
    setEstoque(prev => (prev.length === 0
      ? ESTOQUE_INICIAL.map(it => ({ ...it, atualizadoHaDias: 0, origem: 'upload' }))
      : prev.map(it => ({ ...it, atualizadoHaDias: 0, origem: 'upload' }))));
    setUploadPreview(false);
  };

  if (view === 'crud') {
    return (
      <div className="rise">
        <Cabecalho view="crud" onVoltar={voltarDaCrud} />
        <GestaoEstoque
          estoque={estoque}
          formAberto={formAberto}
          itemEditando={itemEditando}
          uploadPreview={uploadPreview}
          onNovoItem={() => { setFormAberto(true); setItemEditando(null); setUploadPreview(false); }}
          onIniciarUpload={() => { setUploadPreview(true); setFormAberto(false); setItemEditando(null); }}
          onSalvarNovo={salvarNovoItem}
          onSalvarEdicao={salvarEdicaoItem}
          onEditar={item => { setItemEditando(item); setFormAberto(false); setUploadPreview(false); }}
          onExcluir={excluirItem}
          onCancelarForm={() => { setFormAberto(false); setItemEditando(null); }}
          onConfirmarUpload={confirmarUpload}
          onCancelarUpload={() => setUploadPreview(false)}
        />
      </div>
    );
  }

  return (
    <div className="rise">
      <Cabecalho view="lista" onAtualizarEstoque={irParaCrud} />

      {itensOrdenados.length === 0 ? (
        <EstadoVazio onEnviarPlanilha={abrirEnvioPlanilha} onCadastrarManual={abrirCadastroManual} />
      ) : (
        <>
          <ResumoExecutivo criticos={criticos} alertas={alertas} />
          <SegmentedControl
            value={modo}
            onChange={setModo}
            options={[
              { value: 'medicamento', label: 'Por medicamento' },
              { value: 'setor', label: 'Por setor' },
            ]}
          />
          {modo === 'medicamento' ? (
            <ListaPriorizada itens={itensOrdenados} onAbrirDrawer={setItemDrawer} onGerarEtp={acionarGerarEtp} />
          ) : (
            <BarrasPorSetor />
          )}
        </>
      )}

      <DrawerDetalhe item={itemDrawer} onClose={() => setItemDrawer(null)} onGerarEtp={acionarGerarEtp} />
    </div>
  );
}
