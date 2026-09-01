// Tela 01 — Visão Geral (docs/telas/01-visao-geral.md)
//
// Briefing de risco do município, não um dashboard de BI descritivo: a tela responde
// "eu preciso agir hoje, e em quê" em camadas verticais, da mais crítica para a mais
// acessória (situação e evidência → acesso contextual à Clara → fila de ações → impacto). Zero gráfico e
// zero ranking aqui por decisão de produto (07/08/2026) — a série de dengue e o
// comparativo regional já existem em Epidemiologia (nível 2), esta tela é só a fila.
// Todos os dados abaixo são mock estático — nenhum fetch/axios nesta tela.

import { useEffect, useState } from 'react';
import { Card, SectionTitle, Badge, MIcon, EvidenceChain } from '../shared/ui.jsx';
import { formatarCutoffDemo, obterMunicipioDemo } from '../shared/demo.js';
import { VisaoGeralReal } from '../shared/RupturaReal.jsx';

// ─── Mock: fatos canônicos do município (Cotia — SP, Dra. Márcia) ─────────────

const MUNICIPIO = { nome: 'Cotia', uf: 'SP' };

const STATUS = {
  nivel: 'alerta',
  cor: 'var(--risk-medio)',
  titulo: 'Município em alerta',
  frase: 'Dengue em alta e 2 insumos críticos',
  indice: 74,
};

const ALERTAS = [
  {
    id: 'alt-01',
    severidade: 'critico',
    titulo: 'Ruptura em 22 dias — Dipirona 500mg',
    evidencia: 'consumo acelerado +12%',
    acao: 'Gerar ETP',
    tipo: 'etp',
    payload: { tipo: 'alerta', item: { nome: 'Dipirona 500mg', diasRestantes: 22, consumoSemanal: 120 } },
  },
  {
    id: 'alt-02',
    severidade: 'alerta',
    titulo: 'Surto previsto — dengue, 60 dias',
    evidencia: 'probabilidade 78% · modelo Holt',
    acao: 'Ver detalhes',
    tipo: 'navegar',
  },
  {
    id: 'alt-03',
    severidade: 'alerta',
    titulo: 'Ocupação UTI Adulto — projeção 87% em 30 dias',
    evidencia: 'Hospital Regional Oeste',
    acao: 'Ver detalhes',
    tipo: 'navegar',
  },
];

function construirStatusDemo(payload) {
  const status = payload?.status;
  const epidemiologia = payload?.epidemiologia || {};

  const mapa = {
    critico: {
      cor: 'var(--risk-alto)',
      titulo: 'Município em risco crítico',
      frase: 'Dengue e insumos em ponto de ação imediata.',
      indice: 90,
    },
    atencao: {
      cor: 'var(--risk-medio)',
      titulo: 'Município em alerta',
      frase: 'Dengue em alta e insumos sob pressão.',
      indice: 74,
    },
    estavel: {
      cor: 'var(--risk-baixo)',
      titulo: 'Município estável',
      frase: 'Sem sinais agudos no replay histórico.',
      indice: 38,
    },
  };

  const base = mapa[status] || mapa.atencao;
  const crescimentoValor = epidemiologia.crescimento_pct != null ? Number(epidemiologia.crescimento_pct) : null;
  const crescimento = crescimentoValor != null ? `${crescimentoValor.toFixed(1)}%` : null;

  return {
    ...base,
    frase: crescimentoValor == null
      ? base.frase
      : crescimentoValor > 0
        ? `Dengue em alta de ${crescimento} no corte atual.`
        : crescimentoValor < 0
          ? `Casos de dengue recuaram ${Math.abs(crescimentoValor).toFixed(1)}%, mas a pressão sobre insumos segue crítica.`
          : 'Casos estáveis no corte atual, com atenção operacional mantida.',
  };
}

function construirAlertasDemo(payload) {
  const alertas = Array.isArray(payload?.alertas) ? payload.alertas : ALERTAS;
  const insumos = Array.isArray(payload?.insumos) ? payload.insumos : [];

  return alertas.map((alerta, idx) => {
    const isSurto = alerta.tipo === 'surto';
    const evidenciaTexto = isSurto
      ? (alerta.evidencia?.crescimento_pct != null
          ? `Crescimento mensal de ${Number(alerta.evidencia?.crescimento_pct || 0).toFixed(1)}%`
          : `Próximo mês projetado em ${Number(alerta.evidencia?.casos_previstos || 0).toLocaleString('pt-BR')} casos`)
      : `Cobertura estimada de ${Number(alerta.evidencia?.dias_restantes || 0).toFixed(1)} dias`;
    const itemBase = insumos.find(item => item.item === alerta.item_ou_condicao);
    const payloadEtp = itemBase ? {
      tipo: 'insumo',
      item: {
        nome: itemBase.item,
        diasRestantes: Number(itemBase.dias_restantes || 0),
        consumoSemanal: Math.round(Number(itemBase.consumo_previsto_dia || 0) * 7),
        atualizadoHaDias: 0,
        alertaId: alerta.id || `demo-alerta-${idx}`,
        estoque_demo: true,
        unidade: itemBase.unidade || 'un',
        precoUnitario: itemBase.preco_unitario ?? null,
        cutoff: payload?.cutoff,
      },
      scenarioId: payload?.scenario_id,
      cutoff: payload?.cutoff,
    } : null;

    return {
      id: alerta.id || `demo-alerta-${idx}`,
      tipo: isSurto ? 'surto' : 'ruptura',
      severidade: alerta.severidade === 'alta' ? 'critico' : 'alerta',
      status: alerta.status || 'novo',
      titulo: alerta.titulo || (isSurto ? 'Surto de dengue em aceleração' : `Risco de ruptura: ${alerta.item_ou_condicao}`),
      evidencia: evidenciaTexto,
      acao: isSurto
        ? { tipo: 'drawer', label: 'Ver detalhes' }
        : { tipo: alerta.status === 'andamento' ? 'ver' : 'etp', label: alerta.status === 'andamento' ? 'Ver ETP' : 'Gerar ETP' },
      payload: payloadEtp,
      alertaId: alerta.id || `demo-alerta-${idx}`,
      scenarioId: payload?.scenario_id,
      cutoff: payload?.cutoff,
    };
  });
}

// ─── Sub-componentes da tela ────────────────────────────────────────────────

function BannerStatus({ onNavigate, status = STATUS, acao = 'alertas', rotuloAcao = 'Ver plano', demoState }) {
  const demoAtiva = demoState?.enabled && demoState.payload;
  const cutoff = demoAtiva ? formatarCutoffDemo(demoState.payload?.cutoff || demoState.cutoff) : null;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 16,
        padding: '20px 24px', borderRadius: 14, height: '100%', boxSizing: 'border-box',
        background: `color-mix(in srgb, ${status.cor} 9%, var(--elev))`,
        border: `1px solid color-mix(in srgb, ${status.cor} 28%, transparent)`,
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
          <span
            style={{
              width: 14, height: 14, borderRadius: '50%', background: status.cor,
              marginTop: 5, flexShrink: 0, animation: 'dot-pulse 2.4s ease-in-out infinite',
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
              <p style={{
                fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 15,
                letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--ink-900)', margin: 0,
              }}>
                {status.titulo}
              </p>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700,
                color: 'var(--ink-500)', background: 'var(--elev)', border: '1px solid var(--ink-100)',
                borderRadius: 99, padding: '2px 8px',
              }}>
                índice {status.indice}/100
              </span>
            </div>
            <p style={{ fontSize: 15, color: 'var(--ink-700)', margin: 0 }}>{status.frase}</p>
          </div>
        </div>
        <EvidenceChain
          fontes={['SINAN — epidemiologia', 'Estoque cadastrado — Insumos']}
          competencia={cutoff || 'não disponível (mock estático, sem corte associado)'}
          calculo="Índice combina o sinal de crescimento de casos notificados (SINAN) com a cobertura de estoque dos itens críticos (Insumos); não é uma pontuação de um modelo único."
          premissas={demoAtiva ? 'Casos históricos reais; estoque e preços do cenário demo são fictícios.' : 'não disponível (dados de exemplo estáticos)'}
          limitacoes="Pontuação de priorização interna do produto, não uma métrica epidemiológica ou financeira padronizada — usar como triagem, não como indicador oficial."
          versaoModelo="Combinação determinística (sem modelo único de índice)"
        />
      </div>
      <button
        onClick={() => onNavigate(acao)}
        style={{
          alignSelf: 'flex-start', padding: '9px 18px', borderRadius: 9, border: 'none', cursor: 'pointer',
          background: 'var(--primary)', color: 'white', fontSize: 13, fontWeight: 700,
        }}
      >
        {rotuloAcao}
      </button>
    </div>
  );
}

function FaixaTransparenciaDemo({ demoState }) {
  if (!demoState?.enabled) return null;
  const municipio = obterMunicipioDemo(demoState, MUNICIPIO);
  const cutoff = formatarCutoffDemo(demoState.cutoff || demoState.payload?.cutoff || demoState.meta?.cortes?.mes_inicial);

  return (
    <div className="responsive-grid-2" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 12, marginBottom: 18,
      border: '1px solid color-mix(in srgb, var(--info) 22%, transparent)',
      background: 'color-mix(in srgb, var(--info) 7%, white)',
    }}>
      <Badge label="Demo histórica" color="var(--info)" />
      <span style={{ fontSize: 12.5, color: 'var(--ink-700)' }}>
        Casos históricos reais; estoque e preços são cenário demo fictício.
      </span>
      <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
        {municipio.nome}/{municipio.uf} · corte temporal {cutoff}
      </span>
    </div>
  );
}

function CardClaraContextual({ municipio, alertas, onOpen }) {
  const prioridade = alertas.find(alerta => (alerta.status || 'novo') !== 'resolvido') || null;
  const prompt = prioridade
    ? `Explique por que o alerta "${prioridade.titulo}" exige atenção e quais dados sustentam essa leitura.`
    : 'Resuma a situação atual do município e indique se existe alguma ação prioritária.';

  return (
    <Card style={{ height: '100%', background: 'var(--primary-soft)', borderColor: 'var(--primary-soft-border)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
          <span style={{ width: 38, height: 38, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'var(--primary)', color: 'white' }}>
            <MIcon m="smart_toy" size={20} />
          </span>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink-900)', margin: 0 }}>Clara · leitura rápida</p>
            <p style={{ fontSize: 11.5, color: 'var(--ink-500)', margin: '3px 0 0' }}>IA integrada ao contexto operacional</p>
          </div>
          <span style={{ marginLeft: 'auto' }}><Badge label="Contexto ativo" color="var(--primary)" /></span>
        </div>

        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--ink-700)', margin: 0 }}>
            {prioridade ? (
              <>Prioridade acompanhada: <strong>{prioridade.titulo}</strong>. {prioridade.evidencia}.</>
            ) : (
              <>Nenhum alerta prioritário está ativo neste corte.</>
            )}
          </p>
          <p style={{ fontSize: 11.5, color: 'var(--ink-500)', margin: '4px 0 0' }}>
            Contexto compartilhado: Visão Geral · {municipio.nome}/{municipio.uf} · histórico da conversa
          </p>
        </div>

        <button
          onClick={() => onOpen?.(prompt)}
          aria-label="Abrir Clara com uma pergunta sobre a situação atual"
          style={{ alignSelf: 'flex-start', minHeight: 44, marginTop: 18, padding: '9px 15px', borderRadius: 9, border: '1px solid var(--primary)', cursor: 'pointer', background: 'var(--elev)', color: 'var(--primary)', fontSize: 13, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 7, flexShrink: 0 }}
        >
          Conversar sobre esta situação
          <MIcon m="arrow_forward" size={16} />
        </button>
      </div>
    </Card>
  );
}

function BarDemo({ demoState }) {
  if (!demoState?.enabled) return null;
  const cortes = demoState.meta?.cortes?.cortes || [];
  const indiceAtual = cortes.findIndex(item => item.mes === demoState.cutoff);
  const podeVoltar = indiceAtual > 0;
  const podeAvancar = indiceAtual >= 0 && indiceAtual < cortes.length - 1;

  const botaoSecundario = {
    padding: '8px 15px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 700,
    border: '1px solid var(--ink-100)',
    background: 'var(--elev)',
    color: 'var(--ink-700)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  const botaoPrimario = {
    padding: '8px 15px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    background: 'var(--primary)',
    color: 'white',
    fontSize: 13,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  };

  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 14, alignItems: 'center',
      padding: '12px 16px', borderRadius: 12, marginBottom: 18,
      border: '1px solid color-mix(in srgb, var(--primary) 18%, transparent)',
      background: 'color-mix(in srgb, var(--primary) 6%, white)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Demo histórica
          </span>
          <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>
            dengue 2024 · corte temporal: {formatarCutoffDemo(demoState.cutoff)}
          </span>
          {demoState.loading && <span style={{ fontSize: 12, color: 'var(--ink-500)' }}>carregando...</span>}
        </div>
        {demoState.error && (
          <span style={{ fontSize: 12, color: 'var(--risk-alto)' }}>{demoState.error}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={demoState.voltarMes} disabled={!podeVoltar || demoState.loading} style={botaoSecundario}>Voltar mês</button>
        <button onClick={demoState.avancarMes} disabled={!podeAvancar || demoState.loading} style={botaoPrimario}>Avançar mês</button>
        <button onClick={demoState.reiniciarDemo} disabled={demoState.loading} style={botaoSecundario}>Reiniciar</button>
      </div>
    </div>
  );
}

function ProvaValorDemo({ demoState }) {
  if (!demoState?.enabled || !demoState?.payload?.prova_valor) return null;
  const prova = demoState.payload.prova_valor;
  const mesAcao = prova.mes_acao_recomendado || prova.etp_recomendado_em;
  const mesRuptura = prova.mes_ruptura_prevista || prova.ruptura_estimada_em;
  const antecedencia = prova.antecedencia_operacional_dias != null
    ? `${prova.antecedencia_operacional_dias.toLocaleString('pt-BR')} dias`
    : '—';
  const economia = prova.economia_estimada != null ? `R$ ${prova.economia_estimada.toLocaleString('pt-BR')}` : '—';
  const custoPlanejado = prova.custo_planejado != null ? `R$ ${prova.custo_planejado.toLocaleString('pt-BR')}` : '—';
  const custoEmergencial = prova.custo_emergencial != null ? `R$ ${prova.custo_emergencial.toLocaleString('pt-BR')}` : '—';

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12,
      padding: 16, borderRadius: 14, marginBottom: 24,
      border: '1px solid color-mix(in srgb, var(--good) 20%, transparent)',
      background: 'color-mix(in srgb, var(--good) 6%, white)',
    }}>
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
          Antecedência operacional
        </p>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 800, color: 'var(--good)', margin: 0 }}>
          {antecedencia}
        </p>
      </div>
      <div>
        <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
          Economia estimada
        </p>
        <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 800, color: 'var(--good)', margin: 0 }}>
          {economia}
        </p>
      </div>
      <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--ink-700)', margin: 0 }}>
          ETP recomendado em <strong>{mesAcao || '—'}</strong> · ruptura estimada em <strong>{mesRuptura || '—'}</strong>
        </p>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink-500)', margin: 0 }}>
          Compra planejada {custoPlanejado} vs. emergencial {custoEmergencial}.
        </p>
      </div>
    </div>
  );
}

function RevelacaoCurvaDemo({ payload }) {
  const previsao = Array.isArray(payload?.previsao) ? payload.previsao[0] : null;
  const realizado = Array.isArray(payload?.serie_futura_real) ? payload.serie_futura_real[0] : null;
  if (!previsao || !realizado) return null;

  const diferenca = realizado.casos - previsao.casos_previstos;
  const diferencaPct = previsao.casos_previstos > 0 ? (diferenca / previsao.casos_previstos) * 100 : 0;

  return (
    <Card className="p-5" style={{ marginBottom: 24, border: '1px solid color-mix(in srgb, var(--info) 18%, transparent)', background: 'color-mix(in srgb, var(--info) 4%, white)' }}>
      <SectionTitle>Revelação da curva real</SectionTitle>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 10px' }}>
        No corte <strong>{formatarCutoffDemo(payload?.cutoff)}</strong>, o sistema projetava <strong>{Number(previsao.casos_previstos).toLocaleString('pt-BR')} casos</strong> para <strong>{formatarCutoffDemo(previsao.mes)}</strong>.
        Quando a continuidade real da série é revelada no replay, o município registra <strong>{Number(realizado.casos).toLocaleString('pt-BR')} casos</strong> no mesmo mês.
      </p>
      <p style={{ fontSize: 12, color: 'var(--ink-500)', margin: 0 }}>
        Diferença: {diferenca >= 0 ? '+' : ''}{diferenca.toLocaleString('pt-BR')} casos ({diferencaPct >= 0 ? '+' : ''}{diferencaPct.toFixed(1)}%). Isso explicita que a recomendação de ação foi emitida antes da confirmação completa da curva real.
      </p>
    </Card>
  );
}

function BotaoAlerta({ children, primario, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 700,
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
    if (alerta.acao?.tipo === 'etp' && alerta.payload) onGerarEtp(alerta.payload);
    else onNavigate({ page: 'alertas', alertaId: alerta.id });
  };
  return (
    <div
      className="visao-alert-row"
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
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-900)', whiteSpace: 'nowrap' }}>
          {alerta.titulo}
        </span>
        <span style={{ fontSize: 13, color: 'var(--ink-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {alerta.evidencia}
        </span>
      </div>
      <BotaoAlerta primario={alerta.acao?.tipo === 'etp' || alerta.acao?.tipo === 'plano' || alerta.tipo === 'etp'} onClick={handleAcao}>
        {alerta.acao?.label || alerta.acao}
      </BotaoAlerta>
    </div>
  );
}

function AlertasPrioritarios({ onNavigate, onGerarEtp, alertas = ALERTAS }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <SectionTitle>Alertas prioritários</SectionTitle>
      <Card>
        {alertas.map((a, i) => (
          <LinhaAlerta
            key={a.id}
            alerta={a}
            isLast={i === alertas.length - 1}
            onNavigate={onNavigate}
            onGerarEtp={onGerarEtp}
          />
        ))}
      </Card>
      <button
        onClick={() => onNavigate('alertas')}
        style={{
          marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          fontSize: 13, fontWeight: 600, color: 'var(--primary)',
        }}
      >
        Ver todos na Central de Alertas →
      </button>
    </div>
  );
}

function CardJanelaDecisao({ demoState, status, alertas = [] }) {
  const prova = demoState?.payload?.prova_valor || null;
  const cutoff = demoState?.payload?.cutoff || demoState?.cutoff || null;
  const itemCritico = demoState?.payload?.insumos?.[0] || null;
  const temRuptura = alertas.some(alerta => alerta.tipo === 'ruptura');
  const antecedencia = prova?.antecedencia_operacional_dias;
  const economia = prova?.economia_estimada;
  const mesAcao = prova?.mes_acao_recomendado || prova?.etp_recomendado_em || null;
  const mesRuptura = prova?.mes_ruptura_prevista || prova?.ruptura_estimada_em || null;

  let etapa = 'Monitorar';
  let corEtapa = 'var(--risk-baixo)';
  let resumo = 'A curva ainda está em observação e a janela de compra segue confortável.';

  if (temRuptura && antecedencia != null && antecedencia <= 7) {
    etapa = 'Agir hoje';
    corEtapa = 'var(--risk-alto)';
    resumo = 'A margem de manobra quase fechou. O replay já mostra risco de ruptura no horizonte imediato.';
  } else if (temRuptura || (antecedencia != null && antecedencia <= 31)) {
    etapa = 'Abrir ETP agora';
    corEtapa = 'var(--risk-medio)';
    resumo = 'Este é o melhor corte para transformar o alerta em ação antes da compra emergencial.';
  } else if (status?.indice >= 70) {
    etapa = 'Preparar compra';
    corEtapa = 'var(--risk-medio)';
    resumo = 'O sinal epidemiológico já justificaria preparar a resposta, mesmo antes da ruptura crítica.';
  }

  const etapas = [
    { label: 'Sinal epidemiológico', ativo: status?.indice >= 40, tom: 'var(--risk-baixo)' },
    { label: 'Risco operacional', ativo: !!temRuptura || (itemCritico?.dias_restantes ?? Infinity) <= 60, tom: 'var(--risk-medio)' },
    { label: 'Ação recomendada', ativo: !!mesAcao, tom: corEtapa },
  ];

  return (
    <Card className="p-5">
      <SectionTitle>Janela de decisão</SectionTitle>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -8, marginBottom: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: corEtapa, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: corEtapa }}>
          {etapa}
        </span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink-700)', margin: '0 0 16px' }}>
        {resumo}
      </p>

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--subtle)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
            Antecedência
          </p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 800, color: corEtapa, margin: 0 }}>
            {antecedencia != null ? `${antecedencia.toLocaleString('pt-BR')} dias` : '—'}
          </p>
        </div>
        <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--subtle)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
            Ruptura estimada
          </p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 800, color: 'var(--ink-900)', margin: 0 }}>
            {mesRuptura ? formatarCutoffDemo(mesRuptura) : '—'}
          </p>
        </div>
        <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--subtle)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
            Ação sugerida
          </p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 800, color: 'var(--ink-900)', margin: 0 }}>
            {mesAcao ? formatarCutoffDemo(mesAcao) : '—'}
          </p>
        </div>
        <div style={{ padding: '12px 13px', borderRadius: 10, background: 'var(--subtle)' }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-400)', margin: '0 0 6px' }}>
            Economia estimada
          </p>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 24, fontWeight: 800, color: 'var(--good)', margin: 0 }}>
            {economia != null ? `R$ ${economia.toLocaleString('pt-BR')}` : '—'}
          </p>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        {etapas.map((item, idx) => (
          <div key={item.label} style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.ativo ? item.tom : 'var(--ink-100)', marginTop: 4 }} />
              {idx < etapas.length - 1 && <span style={{ width: 1.5, flex: 1, background: 'var(--ink-100)', minHeight: 24 }} />}
            </div>
            <div style={{ paddingBottom: 14 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: item.ativo ? 'var(--ink-900)' : 'var(--ink-400)', margin: 0 }}>{item.label}</p>
              <p style={{ fontSize: 11, color: 'var(--ink-500)', margin: '2px 0 0' }}>
                {idx === 0 && `Corte atual: ${formatarCutoffDemo(cutoff) || '—'}`}
                {idx === 1 && `${itemCritico?.item || 'Item crítico'} com ${itemCritico?.dias_restantes != null ? Number(itemCritico.dias_restantes).toFixed(1) : '—'} dias de cobertura`}
                {idx === 2 && (mesAcao ? `Abrir ETP em ${formatarCutoffDemo(mesAcao)} para proteger o município antes de ${formatarCutoffDemo(mesRuptura) || '—'}` : 'Aguardando gatilho operacional')}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: 'var(--ink-400)', margin: '0 0 14px' }}>
        Esta leitura prioriza a decisão operacional: quando agir, quanto tempo ainda existe e qual custo pode ser evitado.
      </p>

      <EvidenceChain
        fontes={['SINAN — epidemiologia', 'Estoque cadastrado — Insumos']}
        competencia={cutoff ? formatarCutoffDemo(cutoff) : 'não disponível (mock estático, sem corte associado)'}
        calculo="Antecedência = data de ruptura prevista − data de ação recomendada; economia estimada = custo emergencial − custo planejado."
        premissas={prova ? 'Baseado no cenário demo de estoque e preços — fictício, não é o estoque real do município.' : 'não disponível (dados de exemplo estáticos, sem prova de valor calculada)'}
        limitacoes="Combina sinal epidemiológico (SINAN) e estoque cadastrado (Insumos); a decisão de ruptura e a quantidade recomendada vêm de cálculo determinístico, não da Clara."
        versaoModelo="Cascade Holt → OLS (epidemiologia) + cálculo determinístico (insumos)"
      />
    </Card>
  );
}

// Compara os alertas ativos de hoje com os vistos na última visita (localStorage) e
// devolve quantos são novos — dá a sensação de "o sistema trabalha enquanto você não
// está olhando" (docs/telas/01-visao-geral.md, decisão 07/08/2026).
// ponytail: chave única por navegador, sem multiusuário/expiração — troca por
// campo real de "último acesso" quando existir autenticação de verdade.
const CHAVE_ALERTAS_VISTOS = 'sus_predict_alertas_vistos';

function useAlertasNovosDesdeUltimoAcesso(alertas) {
  const [contagem, setContagem] = useState(0);
  const idsAtivos = alertas.filter(a => (a.status || 'novo') !== 'resolvido').map(a => a.id).join(',');

  useEffect(() => {
    const idsAtuais = idsAtivos ? idsAtivos.split(',') : [];
    let vistos = [];
    try {
      vistos = JSON.parse(localStorage.getItem(CHAVE_ALERTAS_VISTOS) || '[]');
    } catch {
      vistos = [];
    }
    setContagem(idsAtuais.filter(id => !vistos.includes(id)).length);
    localStorage.setItem(CHAVE_ALERTAS_VISTOS, JSON.stringify(idsAtuais));
  }, [idsAtivos]);

  return contagem;
}

// ─── Página ─────────────────────────────────────────────────────────────────

export default function VisaoGeral({ onNavigate, onGerarEtp, onOpenClara, demoState }) {
  const demoAtiva = demoState?.enabled && demoState.payload;
  const municipio = obterMunicipioDemo(demoState, MUNICIPIO);
  const statusDemo = demoAtiva ? construirStatusDemo(demoState.payload) : STATUS;
  const alertasDemo = demoAtiva ? construirAlertasDemo(demoState.payload) : ALERTAS;
  const alertasNovos = useAlertasNovosDesdeUltimoAcesso(alertasDemo);
  const temJanelaConcreta = !!(
    demoAtiva
    && (demoState.payload?.prova_valor?.mes_acao_recomendado
      || demoState.payload?.prova_valor?.etp_recomendado_em)
  );

  if (!demoState?.enabled) {
    return <VisaoGeralReal onNavigate={onNavigate} onOpenClara={onOpenClara} onDemo={() => demoState?.iniciarDemo?.()} />;
  }

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{
              fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800,
              color: 'var(--ink-900)', letterSpacing: '-0.02em', marginBottom: 4,
            }}>
              Visão Geral{' '}
              <span className="ff-serif" style={{ color: 'var(--ink-400)', fontWeight: 400, fontSize: '0.72em' }}>
                — {municipio.nome}, {municipio.uf}
              </span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>
              Em 30 segundos: o que precisa da sua decisão agora.
            </p>
          </div>
        </div>
        {demoState?.enabled ? (
          <>
            <FaixaTransparenciaDemo demoState={demoState} />
            <BarDemo demoState={demoState} />
          </>
        ) : (
          <button
            onClick={() => demoState?.iniciarDemo?.()}
            style={{
              marginTop: 12, border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--ink-100))',
              background: 'white', color: 'var(--primary)', borderRadius: 10, padding: '8px 12px',
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Abrir demo histórica
          </button>
        )}
      </div>

      {demoState?.enabled && demoState.error && !demoState.payload && (
        <div style={{ marginBottom: 18, padding: '12px 14px', borderRadius: 12, border: '1px solid color-mix(in srgb, var(--risk-alto) 24%, transparent)', background: 'color-mix(in srgb, var(--risk-alto) 8%, white)', color: 'var(--ink-700)', fontSize: 13 }}>
          A demo não carregou agora. O layout abaixo segue com o conteúdo padrão até a API responder.
        </div>
      )}

      {alertasNovos > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          fontSize: 13, fontWeight: 700, color: 'var(--primary)',
        }}>
          <MIcon m="notifications_active" size={16} />
          {alertasNovos} {alertasNovos === 1 ? 'alerta novo' : 'alertas novos'} desde seu último acesso
        </div>
      )}

      <div className="visao-resumo-grid">
        <BannerStatus onNavigate={onNavigate} status={statusDemo} acao="alertas" rotuloAcao="Ver plano" demoState={demoState} />
        <CardClaraContextual municipio={municipio} alertas={alertasDemo} onOpen={onOpenClara} />
      </div>
      <AlertasPrioritarios onNavigate={onNavigate} onGerarEtp={onGerarEtp} alertas={alertasDemo} />
      <ProvaValorDemo demoState={demoState} />
      {demoAtiva && <RevelacaoCurvaDemo payload={demoState.payload} />}
      {temJanelaConcreta && <CardJanelaDecisao demoState={demoState} status={statusDemo} alertas={alertasDemo} />}
    </div>
  );
}
