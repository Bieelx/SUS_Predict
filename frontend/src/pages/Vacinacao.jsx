import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import { Badge, Card, SectionTitle } from '../shared/ui.jsx';
import { EstadoConsulta, FonteReal, Kpi, SeletorPeriodo } from '../shared/dataUi.jsx';
import { useDadosOperacionais } from '../shared/operationalClient.js';

const IBGE_PADRAO = '351300';
const numero = valor => Number(valor || 0);
const inteiro = valor => numero(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const decimal = valor => numero(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const moeda = valor => numero(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Vacinacao({ demoState }) {
  const [periodo, setPeriodo] = useState('12 Meses');
  const { dados, carregando, erro, recarregar } = useDadosOperacionais('vacinacao', { ibge: IBGE_PADRAO, periodo }, !demoState?.enabled);
  const faixas = (dados?.faixa_etaria || []).map(item => ({ faixa: item.faixa_etaria, casos: numero(item.casos), doses: numero(item.doses_aplicadas) }));
  const comparativo = (dados?.comparativo_municipios || []).map(item => ({ nome: item.nome_municipio, doses: numero(item.doses_aplicadas), incidencia: numero(item.incidencia_atual), casos: numero(item.casos_atual) }));
  const amostra = dados?.hospitalar_estadual?.possui_amostragem_suficiente;

  return (
    <div className="rise">
      <header style={cabecalho}>
        <div>
          <h1 style={titulo}>Vacinação <span style={subtitulo}>— Dengue (PNI)</span></h1>
          <p style={descricao}>Doses aplicadas e relação observacional com incidência e desfechos hospitalares.</p>
        </div>
        <SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={carregando} />
      </header>
      <EstadoConsulta carregando={carregando} erro={erro} onRetry={recarregar} />
      {dados && <>
        <FonteReal meta={dados.meta} detalhe={`${dados.municipio.nome}, ${dados.municipio.uf} · ${periodo}`} />
        <div className="responsive-grid-4" style={grid4}>
          <Kpi rotulo="Doses aplicadas" valor={inteiro(dados.doses?.doses_aplicadas)} detalhe="Residentes do município no período" />
          <Kpi rotulo="Casos notificados" valor={inteiro(dados.incidencia?.casos_atual)} detalhe="Mesmo município e janela temporal" />
          <Kpi rotulo="Incidência" valor={decimal(dados.incidencia?.incidencia_atual)} detalhe="casos por 100 mil habitantes" />
          <Kpi rotulo="Internações SIH" valor={inteiro(dados.hospitalar_estadual?.internacoes_atual)} detalhe="Contexto estadual, não municipal" tom="var(--risk-medio)" />
        </div>

        <div className="responsive-grid-2" style={grid2}>
          <Card className="p-5">
            <SectionTitle>Vacinação × incidência nos municípios</SectionTitle>
            <ResponsiveContainer width="100%" height={290}>
              <ScatterChart margin={{ top: 10, right: 14, bottom: 16, left: 8 }}>
                <CartesianGrid stroke="var(--ink-100)" />
                <XAxis type="number" dataKey="doses" name="Doses" tick={{ fontSize: 10 }} label={{ value: 'Doses aplicadas', position: 'insideBottom', offset: -9, fontSize: 10 }} />
                <YAxis type="number" dataKey="incidencia" name="Incidência" tick={{ fontSize: 10 }} width={54} />
                <ZAxis type="number" dataKey="casos" range={[35, 150]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<TooltipMunicipio />} />
                <Scatter data={comparativo} fill="var(--primary)" fillOpacity={0.68} />
              </ScatterChart>
            </ResponsiveContainer>
            <p style={nota}>Cada ponto representa um município. A relação visual é exploratória e não demonstra efeito causal.</p>
          </Card>
          <Card className="p-5">
            <SectionTitle>Casos × doses por faixa etária</SectionTitle>
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={faixas}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="faixa" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={inteiro} /><Bar dataKey="casos" name="Casos" fill="var(--risk-medio)" /><Bar dataKey="doses" name="Doses" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer>
            <p style={nota}>As duas medidas compartilham faixa etária, município e período, mas possuem escalas e origens distintas.</p>
          </Card>
        </div>

        <Card className="p-5" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <p className="eyebrow">Contexto hospitalar estadual</p>
              <h2 style={{ fontSize: 17, margin: '5px 0 7px' }}>Vacinação × internações e custo</h2>
              <p style={{ ...nota, margin: 0, maxWidth: 720 }}>O SIH não oferece cobertura municipal completa neste contrato. Por isso, internações, custo e mortalidade abaixo são consolidados estaduais.</p>
            </div>
            <Badge label={amostra ? 'Amostra suficiente' : 'Amostra insuficiente'} color={amostra ? 'var(--good)' : 'var(--warn)'} />
          </div>
          <div className="responsive-grid-3" style={{ ...grid3, marginTop: 18 }}>
            <Resumo label="Internações" value={inteiro(dados.hospitalar_estadual?.internacoes_atual)} />
            <Resumo label="Custo total" value={moeda(dados.hospitalar_estadual?.custo_total)} />
            <Resumo label="Mortalidade" value={`${decimal(dados.hospitalar_estadual?.taxa_mortalidade)}%`} />
          </div>
        </Card>

        <Card className="p-5" style={{ marginTop: 18, background: 'var(--subtle)' }}>
          <SectionTitle>Limitações de interpretação</SectionTitle>
          <ul style={{ margin: 0, paddingLeft: 20, color: 'var(--ink-500)', fontSize: 12.5, lineHeight: 1.7 }}>{dados.limitacoes.map(item => <li key={item}>{item}</li>)}</ul>
        </Card>
      </>}
    </div>
  );
}

function TooltipMunicipio({ active, payload }) {
  if (!active || !payload?.[0]?.payload) return null;
  const item = payload[0].payload;
  return <div style={tooltip}><strong>{item.nome}</strong><span>{inteiro(item.doses)} doses</span><span>{decimal(item.incidencia)} casos/100 mil</span></div>;
}
function Resumo({ label, value }) { return <div style={resumo}><span>{label}</span><strong>{value}</strong></div>; }
const cabecalho = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginBottom: 18 };
const titulo = { fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', margin: 0 };
const subtitulo = { color: 'var(--ink-400)', fontWeight: 450, fontSize: '0.72em' };
const descricao = { fontSize: 13, color: 'var(--ink-400)', margin: '5px 0 0' };
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, marginTop: 18 };
const nota = { color: 'var(--ink-400)', fontSize: 11.5, lineHeight: 1.5, margin: '9px 0 0' };
const resumo = { border: '1px solid var(--ink-100)', borderRadius: 10, padding: 14, display: 'grid', gap: 6, color: 'var(--ink-400)', fontSize: 11.5 };
const tooltip = { display: 'grid', gap: 3, padding: '9px 11px', background: 'white', border: '1px solid var(--ink-100)', borderRadius: 8, fontSize: 11, boxShadow: '0 4px 14px rgba(0,0,0,.1)' };
