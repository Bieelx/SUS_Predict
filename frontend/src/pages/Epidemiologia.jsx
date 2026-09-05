import { useMemo, useState } from 'react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Badge, Card, MIcon, SectionTitle } from '../shared/ui.jsx';
import { EstadoConsulta, FonteReal, Kpi, SeletorPeriodo, botao } from '../shared/dataUi.jsx';
import { useDadosOperacionais } from '../shared/operationalClient.js';

import { numero, inteiro, decimal, moeda, percentual, dias, janelaDados } from '../shared/formatters.js';
const mes = valor => new Date(valor).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', '');
const mesLongo = valor => new Date(valor).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default function Epidemiologia({ municipio, onOpenClara }) {
  const [periodo, setPeriodo] = useState('12 Meses');
  const { dados, carregando, erro, recarregar } = useDadosOperacionais('epidemiologia', { ibge: municipio.ibge6, periodo });

  const previsao = dados?.previsao_3_meses;
  const serieAnalitica = useMemo(() => {
    const observada = (dados?.sazonalidade || []).map(item => ({
      mes: mes(item.mes_ano),
      atual: numero(item.casos_atual),
      anterior: item.casos_ano_anterior == null ? null : numero(item.casos_ano_anterior),
      media: item.media_historica == null ? null : numero(item.media_historica),
      previsto: null,
      baseIntervalo: null,
      amplitudeIntervalo: null,
    }));
    const ultimo = observada.at(-1);
    if (ultimo && previsao?.disponivel) {
      ultimo.previsto = ultimo.atual;
      ultimo.baseIntervalo = ultimo.atual;
      ultimo.amplitudeIntervalo = 0;
    }
    const futura = previsao?.disponivel ? previsao.serie.map(item => ({
      mes: mes(item.mes),
      atual: null,
      anterior: null,
      media: null,
      previsto: numero(item.casos_previstos),
      baseIntervalo: numero(item.limite_inferior),
      amplitudeIntervalo: Math.max(0, numero(item.limite_superior) - numero(item.limite_inferior)),
    })) : [];
    return [...observada, ...futura];
  }, [dados, previsao]);
  const faixa = (dados?.faixa_etaria || []).map(item => ({ faixa: item.faixa_etaria, casos: numero(item.casos) }));
  const genero = (dados?.genero || []).map(item => ({ nome: item.genero, valor: numero(item.percentual) }));
  const desfecho = (dados?.desfecho_anual || []).map(item => ({
    ano: item.ano_referencia,
    leves: numero(item.casos_leves),
    hospitalizacoes: numero(item.hospitalizacoes),
    obitos: numero(item.obitos),
  }));

  return (
    <div className="rise">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <h1 style={titulo}>Epidemiologia <span style={subtitulo}>— SINAN</span></h1>
          <p style={descricao}>Casos de dengue em {municipio.nome}, {municipio.uf}.</p>
        </div>
        <SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={carregando} />
      </header>

      <EstadoConsulta carregando={carregando} erro={erro} onRetry={recarregar} />
      {dados && <>
        <FonteReal meta={dados.meta} detalhe={`${dados.municipio.nome}, ${dados.municipio.uf} · ${periodo} · ${janelaDados(dados.casos)}`} />

        <div className="responsive-grid-4" style={grid4}>
          <Kpi rotulo="Casos notificados" valor={inteiro(dados.casos?.casos_atual)} detalhe={dados.casos?.possui_base_comparacao ? `${decimal(dados.casos.variacao_pct)}% vs. janela anterior` : 'Sem base comparável'} />
          <Kpi rotulo="Incidência" valor={decimal(dados.incidencia?.incidencia_atual)} detalhe="casos por 100 mil habitantes" />
          <Kpi rotulo="Hospitalização" valor={percentual(dados.taxa_hospitalizacao?.taxa_hosp_atual)} detalhe={(dados.taxa_hospitalizacao?.observacao !== 'OK' && dados.taxa_hospitalizacao?.observacao) || 'Taxa calculada sobre notificações'} />
          <Kpi rotulo="Taxa de óbitos" valor={percentual(dados.taxa_obito?.taxa_obito_atual)} detalhe={(dados.taxa_obito?.observacao !== 'OK' && dados.taxa_obito?.observacao) || 'Taxa de óbito no período'} tom="var(--risk-alto)" />
        </div>

        <Card className="p-5" style={{ marginTop: 18 }}>
          <div style={forecastHeader}>
            <div>
              <p className="eyebrow">Previsão epidemiológica</p>
              <SectionTitle>Casos observados e projeção de 90 dias</SectionTitle>
            </div>
            {previsao?.disponivel && <Badge
              label={previsao.status_temporal === 'defasada' ? 'Fonte defasada' : 'Horizonte atual'}
              color={previsao.status_temporal === 'defasada' ? 'var(--warn)' : 'var(--good)'}
            />}
          </div>
          {previsao?.disponivel && previsao.status_temporal === 'defasada' && <div role="note" style={avisoDefasagem}>
            <MIcon m="history" size={18} />
            <span><strong>Esta não é uma previsão do mês atual.</strong> {previsao.aviso}</span>
          </div>}
          {serieAnalitica.length ? <div role="img" aria-label="Série mensal de casos observados, média histórica, ano anterior, previsão de três meses e intervalo de incerteza de 80 por cento">
            <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={serieAnalitica} margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--ink-100)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'var(--ink-400)' }} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--ink-400)' }} width={50} />
              <Tooltip content={<TooltipPrevisao />} />
              <Area dataKey="baseIntervalo" stackId="intervalo" stroke="none" fill="transparent" connectNulls />
              <Area dataKey="amplitudeIntervalo" name="Intervalo de 80%" stackId="intervalo" stroke="none" fill="var(--primary)" fillOpacity={0.12} connectNulls />
              <Line dataKey="media" name="Média histórica" stroke="var(--ink-300)" strokeDasharray="5 4" dot={false} />
              <Line dataKey="anterior" name="Ano anterior" stroke="var(--accent)" dot={false} />
              <Line dataKey="atual" name="Observado" stroke="var(--primary)" strokeWidth={2.6} dot={false} />
              <Line dataKey="previsto" name="Previsto" stroke="var(--risk-medio)" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer></div> : <Vazio texto="Sem série mensal para este município." />}

          {previsao?.disponivel ? <>
            <div className="responsive-grid-3" style={forecastValues}>
              {previsao.serie.map((item, index) => <div key={item.mes} style={forecastValue}>
                <span>{index === 0 ? '30 dias' : index === 1 ? '60 dias' : '90 dias'} · {mesLongo(item.mes)}</span>
                <strong>{inteiro(item.casos_previstos)} casos</strong>
                <small>intervalo: {inteiro(item.limite_inferior)} a {inteiro(item.limite_superior)}</small>
              </div>)}
            </div>
            <div style={forecastFooter}>
              <p><strong>{previsao.modelo}</strong> · intervalo empírico de {previsao.intervalo_confianca_pct}% · treino com {inteiro(previsao.diagnostico?.pontos_treino)} meses. Estimativa estatística, não contagem observada.</p>
              {onOpenClara && <button style={botao} onClick={() => onOpenClara(
                `Analise a previsão de dengue de 30, 60 e 90 dias para ${dados.municipio.nome}. ` +
                `Modelo: ${previsao.modelo}. Valores: ${previsao.serie.map(item => `${mesLongo(item.mes)} ${item.casos_previstos} casos, intervalo ${item.limite_inferior} a ${item.limite_superior}`).join('; ')}. ` +
                `${previsao.aviso} Diferencie claramente dados observados de estimativas e explique a incerteza.`
              )}><MIcon m="smart_toy" size={15} /> Analisar previsão com Clara</button>}
            </div>
          </> : <p style={forecastUnavailable}>Previsão indisponível: {previsao?.motivo || 'a série histórica não possui dados suficientes.'}</p>}
        </Card>

        <div className="responsive-grid-2" style={grid2}>
          <Card className="p-5">
            <SectionTitle>Casos por faixa etária</SectionTitle>
            {faixa.length ? <ResponsiveContainer width="100%" height={230}>
              <BarChart data={faixa}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="faixa" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={inteiro} /><Bar dataKey="casos" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer> : <Vazio texto="Distribuição etária indisponível." />}
          </Card>
          <Card className="p-5">
            <SectionTitle>Distribuição por gênero</SectionTitle>
            {genero.length ? <ResponsiveContainer width="100%" height={230}>
              <PieChart><Pie data={genero} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={82} label={({ nome, valor }) => `${nome} ${decimal(valor)}%`}>
                {genero.map((item, index) => <Cell key={item.nome} fill={index % 2 ? 'var(--accent)' : 'var(--primary)'} />)}
              </Pie><Tooltip formatter={valor => `${decimal(valor)}%`} /></PieChart>
            </ResponsiveContainer> : <Vazio texto="Distribuição por gênero indisponível." />}
          </Card>
        </div>

        <Card className="p-5" style={{ marginTop: 18 }}>
          <SectionTitle>Desfecho clínico anual</SectionTitle><p style={descricao}>Série anual completa da fonte, independente do filtro de período.</p>
          {desfecho.length ? <ResponsiveContainer width="100%" height={245}>
            <BarChart data={desfecho}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="ano" /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={inteiro} /><Bar dataKey="leves" name="Casos leves" stackId="a" fill="var(--risk-baixo)" /><Bar dataKey="hospitalizacoes" name="Hospitalizações" stackId="a" fill="var(--risk-medio)" /><Bar dataKey="obitos" name="Óbitos" stackId="a" fill="var(--risk-alto)" radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer> : <Vazio texto="Desfechos anuais indisponíveis." />}
        </Card>
      </>}
    </div>
  );
}

function Vazio({ texto }) { return <p style={{ color: 'var(--ink-400)', fontSize: 13, padding: '36px 0', textAlign: 'center' }}>{texto}</p>; }
function TooltipPrevisao({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const item = payload[0]?.payload || {};
  return <div style={tooltipForecast}>
    <strong>{label}</strong>
    {item.atual != null && <span>Observado: {inteiro(item.atual)}</span>}
    {item.previsto != null && <span>Previsto: {inteiro(item.previsto)}</span>}
    {item.baseIntervalo != null && item.amplitudeIntervalo > 0 && <small>Intervalo: {inteiro(item.baseIntervalo)} a {inteiro(item.baseIntervalo + item.amplitudeIntervalo)}</small>}
  </div>;
}
const titulo = { fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', margin: 0 };
const subtitulo = { color: 'var(--ink-400)', fontWeight: 450, fontSize: '0.72em' };
const descricao = { fontSize: 13, color: 'var(--ink-400)', margin: '5px 0 0' };
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, marginTop: 18 };
const forecastHeader = { display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' };
const avisoDefasagem = { display: 'flex', gap: 9, alignItems: 'flex-start', margin: '12px 0 2px', padding: '10px 12px', borderRadius: 9, background: 'color-mix(in srgb, var(--warn) 9%, transparent)', color: 'var(--ink-700)', fontSize: 12, lineHeight: 1.5 };
const forecastValues = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', borderTop: '1px solid var(--ink-100)', marginTop: 8 };
const forecastValue = { display: 'grid', gap: 4, padding: '14px 12px 8px', color: 'var(--ink-400)', fontSize: 10.5 };
const forecastFooter = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', borderTop: '1px solid var(--ink-100)', marginTop: 10, paddingTop: 13, color: 'var(--ink-400)', fontSize: 10.5, lineHeight: 1.5 };
const forecastUnavailable = { color: 'var(--ink-400)', fontSize: 12.5, margin: '16px 0 0' };
const tooltipForecast = { display: 'grid', gap: 4, padding: '9px 11px', background: 'var(--elev)', border: '1px solid var(--ink-100)', borderRadius: 8, color: 'var(--ink-700)', fontSize: 11, boxShadow: '0 4px 14px rgba(0,0,0,.1)' };
