import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, SectionTitle } from '../shared/ui.jsx';
import { EstadoConsulta, FonteReal, Kpi, SeletorPeriodo } from '../shared/dataUi.jsx';
import { useDadosOperacionais } from '../shared/operationalClient.js';

const numero = valor => Number(valor || 0);
const inteiro = valor => numero(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const decimal = valor => numero(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export default function Internacoes({ demoState }) {
  const [periodo, setPeriodo] = useState('12 Meses');
  const [cnes, setCnes] = useState('TODOS');
  const { dados, carregando, erro, recarregar } = useDadosOperacionais('internacoes', { periodo, cnes }, !demoState?.enabled);
  const hospitais = (dados?.hospitais || []).map(item => ({ nome: item.nome_hospital || item.razao_social || item.cnes, internacoes: numero(item.internacoes) }));
  const municipios = dados?.municipios || [];
  const faixas = (dados?.faixa_etaria || []).map(item => ({ faixa: item.faixa_etaria, internacoes: numero(item.internacoes) }));

  return (
    <div className="rise">
      <header style={cabecalho}>
        <div>
          <h1 style={titulo}>Internações <span style={subtitulo}>— SIH</span></h1>
          <p style={descricao}>Pressão hospitalar por dengue no Estado de São Paulo, sem simulação de ocupação em tempo real.</p>
        </div>
        <div style={filtros}>
          <label style={rotuloFiltro}>Estabelecimento
            <select value={cnes} onChange={event => setCnes(event.target.value)} disabled={carregando} style={seletor}>
              <option value="TODOS">Todos os estabelecimentos</option>
              {(dados?.estabelecimentos || []).map(item => <option key={item.cnes} value={item.cnes}>{item.razao_social}</option>)}
            </select>
          </label>
          <SeletorPeriodo value={periodo} onChange={value => { setPeriodo(value); setCnes('TODOS'); }} carregando={carregando} />
        </div>
      </header>
      <EstadoConsulta carregando={carregando} erro={erro} onRetry={recarregar} quantidadeCards={3} />
      {dados && <>
        <FonteReal meta={dados.meta} detalhe={`${cnes === 'TODOS' ? 'Todos os estabelecimentos' : dados.estabelecimentos?.find(item => item.cnes === cnes)?.razao_social || cnes} · ${periodo}`} />
        <div className="responsive-grid-3" style={grid3}>
          <Kpi rotulo="Internações" valor={inteiro(dados.consolidado?.internacoes_atual)} detalhe={dados.consolidado?.possui_base_comparacao ? `${decimal(dados.consolidado.variacao_percentual)}% vs. período anterior` : 'Consolidado SIH'} />
          <Kpi rotulo="Permanência média" valor={`${decimal(dados.permanencia?.permanencia_media_atual)} dias`} detalhe={dados.permanencia?.possui_base_comparacao ? `${decimal(dados.permanencia.diferenca_dias)} dias de diferença` : 'Sem base comparável'} />
          <Kpi rotulo="Mortalidade hospitalar" valor={`${decimal(dados.mortalidade?.taxa_mortalidade)}%`} detalhe={`${inteiro(dados.mortalidade?.obitos)} óbitos no consolidado`} tom="var(--risk-alto)" />
        </div>

        <div className="responsive-grid-2" style={grid2}>
          <Card className="p-5">
            <SectionTitle>Hospitais com mais internações</SectionTitle>
            {hospitais.length ? <ResponsiveContainer width="100%" height={270}>
              <BarChart data={hospitais} layout="vertical" margin={{ left: 16, right: 12 }}>
                <CartesianGrid stroke="var(--ink-100)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="nome" width={145} tick={{ fontSize: 10 }} />
                <Tooltip formatter={inteiro} />
                <Bar dataKey="internacoes" fill="var(--primary)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer> : <Vazio>Ranking hospitalar indisponível.</Vazio>}
          </Card>
          <Card className="p-5">
            <SectionTitle>Internações por faixa etária</SectionTitle>
            {faixas.length ? <ResponsiveContainer width="100%" height={270}>
              <BarChart data={faixas}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="faixa" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={inteiro} /><Bar dataKey="internacoes" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart>
            </ResponsiveContainer> : <Vazio>Distribuição etária indisponível.</Vazio>}
          </Card>
        </div>

        <Card style={{ marginTop: 18, overflow: 'hidden' }}>
          <div style={{ padding: '18px 20px 8px' }}><SectionTitle>Municípios com mais internações</SectionTitle></div>
          {municipios.length ? <div style={{ overflowX: 'auto' }}><table style={tabela}>
            <thead><tr><th style={th}>Posição</th><th style={th}>Município</th><th style={th}>IBGE</th><th style={{ ...th, textAlign: 'right' }}>Internações</th></tr></thead>
            <tbody>{municipios.map(item => <tr key={`${item.ranking}-${item.cod_ibge_municipio}`}><td style={td}>{item.ranking}º</td><td style={{ ...td, fontWeight: 700 }}>{item.nome_municipio}</td><td style={td}>{item.cod_ibge_municipio}</td><td style={{ ...td, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>{inteiro(item.internacoes)}</td></tr>)}</tbody>
          </table></div> : <Vazio>Ranking municipal indisponível.</Vazio>}
        </Card>
        <p style={nota}>A base SIH disponível é hospitalar/estadual. Estes números não representam ocupação de leitos em tempo real.</p>
      </>}
    </div>
  );
}

function Vazio({ children }) { return <p style={{ padding: 48, textAlign: 'center', color: 'var(--ink-400)', fontSize: 13 }}>{children}</p>; }
const cabecalho = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', marginBottom: 18 };
const titulo = { fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-0.02em', margin: 0 };
const subtitulo = { color: 'var(--ink-400)', fontWeight: 450, fontSize: '0.72em' };
const descricao = { fontSize: 13, color: 'var(--ink-400)', margin: '5px 0 0' };
const grid3 = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, marginTop: 18 };
const tabela = { width: '100%', borderCollapse: 'collapse' };
const th = { padding: '10px 18px', textAlign: 'left', fontSize: 11, color: 'var(--ink-400)', borderBottom: '1px solid var(--ink-100)' };
const td = { padding: '12px 18px', fontSize: 13, color: 'var(--ink-700)', borderBottom: '1px solid var(--ink-100)' };
const nota = { fontSize: 11.5, lineHeight: 1.5, color: 'var(--ink-400)', margin: '14px 2px 0' };
const filtros = { display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' };
const rotuloFiltro = { display: 'grid', gap: 5, color: 'var(--ink-400)', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' };
const seletor = { minWidth: 260, maxWidth: 420, height: 36, border: '1px solid var(--ink-100)', borderRadius: 8, background: 'var(--elev)', color: 'var(--ink-700)', padding: '0 34px 0 10px', fontSize: 12.5 };
