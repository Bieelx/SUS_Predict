import { useMemo, useState } from 'react';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, MIcon, SectionTitle } from './ui.jsx';
import { EstadoConsulta, FonteReal, Kpi, SeletorPeriodo, botao } from './dataUi.jsx';
import { useDadosOperacionais } from './operationalClient.js';

const n = valor => Number(valor || 0);
const inteiro = valor => n(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const decimal = valor => n(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const moeda = valor => n(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const riscoCor = risco => String(risco).toUpperCase() === 'ALTO' ? 'var(--risk-alto)' : String(risco).toUpperCase() === 'MODERADO' ? 'var(--risk-medio)' : 'var(--risk-baixo)';

function useRuptura(periodo, ibge) {
  return useDadosOperacionais('ruptura', { ibge, periodo });
}

export function VisaoGeralReal({ municipio, onNavigate, onDemo }) {
  const [periodo, setPeriodo] = useState('Mes');
  const [territorio, setTerritorio] = useState('TODOS');
  const estado = useDadosOperacionais('visao-geral', { ibge: territorio, periodo });
  const dados = estado.dados;
  if (!dados) return <div className="rise"><header style={header}><div><h1 style={titulo}>Visão Geral</h1><p style={descricao}>Síntese executiva de dengue, pressão hospitalar e suprimento.</p></div><button onClick={onDemo} style={botao}>Abrir demo histórica</button></header><EstadoConsulta carregando={estado.carregando} erro={estado.erro} onRetry={estado.recarregar} /></div>;
  const kpi = dados.kpis || {};
  const serie = dados.serie || [];
  const risco = dados.risco || {};
  const periodoLabel = periodo === 'Mes' ? 'mês anterior' : periodo === 'Trimestre' ? 'trimestre anterior' : 'ano anterior';
  const delta = (valor, unidade = '%') => valor == null ? 'Comparativo indisponível' : `${n(valor) >= 0 ? '+' : ''}${decimal(valor)}${unidade} vs. ${periodoLabel}`;
  const cards = [
    { label: 'Casos notificados', value: inteiro(kpi.casos_notificados), detail: delta(kpi.variacao_casos_pct), key: 'casos_notificados', color: 'var(--primary)' },
    { label: 'Índice de risco regional', value: `${decimal(kpi.indice_risco_regional)}%`, detail: delta(kpi.variacao_indice_risco_pp, ' p.p.'), key: 'indice_risco_regional', color: 'var(--risk-alto)' },
    { label: territorio === 'TODOS' ? 'Municípios em alerta de suprimento' : 'Em alerta de suprimento', value: territorio === 'TODOS' ? inteiro(kpi.municipios_alerta_suprimento) : (kpi.municipios_alerta_suprimento ? 'Sim' : 'Não'), detail: territorio === 'TODOS' ? 'Contagem estadual, sem variação percentual' : 'Indicador municipal, sem variação percentual', key: 'municipios_alerta_suprimento', color: 'var(--risk-medio)' },
    { label: 'Internações SIH', value: inteiro(kpi.internacoes_sih), detail: delta(kpi.variacao_internacoes_pct), key: 'internacoes_sih', color: 'var(--good)' },
  ];
  const evolucao = (dados.evolucao || []).map(item => ({ ...item, competencia: String(item.competencia).slice(0, 7) }));
  const categorias = dados.ruptura_categorias || [];
  return <div className="rise">
    <header style={header}><div><h1 style={titulo}>Visão Geral <span style={subtitulo}>— {dados.municipio.nome}, {dados.municipio.uf}</span></h1><p style={descricao}>Síntese executiva de dengue, pressão hospitalar e suprimento.</p></div><div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}><label><span className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Território</span><select value={territorio} onChange={e => setTerritorio(e.target.value)} style={selectCompacto}><option value="TODOS">São Paulo (estado)</option><option value={municipio.ibge6}>{municipio.nome}, {municipio.uf}</option></select></label><label><span className="eyebrow" style={{ display: 'block', marginBottom: 5 }}>Comparativo</span><select value={periodo} onChange={e => setPeriodo(e.target.value)} style={selectCompacto}><option>Mes</option><option>Trimestre</option><option>Ano</option></select></label><button onClick={onDemo} style={botao}>Abrir demo histórica</button></div></header>
    <FonteReal meta={dados.meta} detalhe={`Competência ${dados.competencia?.competencia_referencia || 'não informada'} · A90 Dengue`} />
    <div className="responsive-grid-4" style={grid4}>
      {cards.map(card => <Card key={card.key} className="p-5"><p className="eyebrow">{card.label}</p><strong style={{ display: 'block', color: card.color, font: '800 27px JetBrains Mono, monospace', margin: '8px 0 4px' }}>{card.value}</strong><p style={{ ...texto, margin: 0 }}>{card.detail}</p><ResponsiveContainer width="100%" height={48}><LineChart data={serie}><Line type="linear" dataKey={card.key} stroke={card.color} strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer><small style={microcopy}>Evolução mensal, 12 meses; independente do comparativo</small></Card>)}
    </div>
    <div className="responsive-grid-2" style={grid2}>
      <Card className="p-5"><SectionTitle>Evolução de casos</SectionTitle><p style={texto}>Histórico SINAN e tendência estimada. O gráfico não muda com o comparativo dos cards.</p><ResponsiveContainer width="100%" height={270}><ComposedChart data={evolucao}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="competencia" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Area dataKey="casos_notificados" fill="var(--primary)" fillOpacity={0.08} stroke="var(--primary)" /><Line dataKey="casos_tendencia" name="Tendência estimada" stroke="var(--ink-400)" strokeDasharray="6 4" dot={false} /></ComposedChart></ResponsiveContainer></Card>
      <Card className="p-5"><SectionTitle>Índice composto analítico</SectionTitle><div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '18px 0' }}><strong style={{ font: '800 42px JetBrains Mono, monospace', color: riscoCor(risco.faixa_risco) }}>{decimal(risco.indice_risco_regional)}</strong><Badge label={risco.faixa_risco || 'SEM FAIXA'} color={riscoCor(risco.faixa_risco)} /></div><p style={texto}>Escala fixa de 0 a 100. Não representa probabilidade de surto.</p>{[['Epidemiológico', risco.score_epidemiologico], ['Pressão hospitalar', risco.score_capacidade], ['Suprimento', risco.score_estoque_critico]].filter(([, value]) => value != null).map(([label, value]) => <div key={label} style={{ marginTop: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}><span>{label}</span><strong>{decimal(value)}</strong></div><div style={track}><span style={{ ...fill, width: `${Math.min(100, n(value))}%` }} /></div></div>)}</Card>
    </div>
    <div className="responsive-grid-2" style={grid2}><Card className="p-5"><SectionTitle>Risco por mesorregião</SectionTitle><div style={{ marginTop: 12 }}>{(dados.mapa_mesorregiao || []).slice(0, 8).map(item => <div key={item.nome_mesorregiao} style={linhaRanking}><span><strong>{item.nome_mesorregiao}</strong><small>{inteiro(item.total_casos)} casos · {inteiro(item.total_internacoes)} internações</small></span><Badge label={`${decimal(item.indice_risco_regional)} · ${item.faixa_risco}`} color={riscoCor(item.faixa_risco)} /></div>)}</div></Card><Card className="p-5"><SectionTitle>Alertas de suprimento por categoria</SectionTitle>{categorias.length ? <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={categorias} dataKey="pct_distribuicao" nameKey="categoria_insumo" innerRadius={58} outerRadius={88}>{categorias.map((item, index) => <Cell key={item.categoria_insumo} fill={['var(--primary)', 'var(--risk-medio)', 'var(--risk-alto)', 'var(--good)', 'var(--info)'][index % 5]} />)}</Pie><Tooltip formatter={value => `${decimal(value)}%`} /></PieChart></ResponsiveContainer> : <Vazio texto="Distribuição por categoria indisponível." />}<button onClick={() => onNavigate?.('insumos')} style={botao}>Explorar insumos</button></Card></div>
    <Card style={{ marginTop: 18, overflow: 'hidden' }}><div style={{ padding: '18px 20px 8px' }}><SectionTitle>Alertas recentes</SectionTitle></div>{(dados.alertas || []).slice(0, 8).map((item, index) => <article key={`${item.ordem}-${item.titulo}`} style={{ padding: '13px 20px', borderTop: '1px solid var(--ink-100)', display: 'flex', justifyContent: 'space-between', gap: 16 }}><span><strong style={{ fontSize: 13 }}>{item.titulo}</strong><small style={{ display: 'block', color: 'var(--ink-400)', marginTop: 3 }}>{item.mensagem}</small></span><Badge label={item.tipo_alerta} color={item.severidade === 'ALTA' ? 'var(--risk-alto)' : 'var(--risk-medio)'} /></article>)}</Card>
  </div>;
}

export function AlertasReais({ onOpenClara, deepLinkAlertaId }) {
  const [periodo, setPeriodo] = useState('12 Meses');
  const estado = useRuptura(periodo);
  const dados = estado.dados;
  if (!dados) return <div className="rise"><header style={header}><div><h1 style={titulo}>Central de Alertas <span style={subtitulo}>— Cotia, SP</span></h1><p style={descricao}>Riscos de aquisição identificados na competência mais recente.</p></div><SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={estado.carregando} /></header><EstadoConsulta carregando={estado.carregando} erro={estado.erro} onRetry={estado.recarregar} /></div>;
  const alertas = dados.alertas || [];
  const selecionado = deepLinkAlertaId ? alertas.find((_, indice) => `aquisicao-${indice + 1}` === deepLinkAlertaId) : null;
  return <div className="rise">
    <header style={header}><div><h1 style={titulo}>Central de Alertas <span style={subtitulo}>— {dados.municipio.nome}, {dados.municipio.uf}</span></h1><p style={descricao}>Riscos de aquisição identificados na competência mais recente.</p></div><SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={estado.carregando} /></header>
    <FonteReal meta={dados.meta} detalhe="Alertas deduplicados por insumo e unidade" />
    <Card style={{ overflow: 'hidden' }}>
      {alertas.length ? alertas.map((item, indice) => <article key={`${item.insumo_padronizado}-${item.unidade_fornecimento}`} style={{ padding: '16px 18px', borderBottom: indice < alertas.length - 1 ? '1px solid var(--ink-100)' : 0, background: selecionado === item ? 'var(--primary-soft)' : 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 250 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 7 }}><Badge label={item.faixa_risco_aquisicao || 'SEM FAIXA'} color={riscoCor(item.faixa_risco_aquisicao)} /><span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{item.categoria_insumo}</span></div><h2 style={{ fontSize: 15, margin: '0 0 6px' }}>{item.insumo_padronizado}</h2><p style={{ ...texto, margin: 0 }}>{item.mensagem_analitica}</p></div>
          <div style={{ textAlign: 'right' }}><strong style={{ fontFamily: 'JetBrains Mono, monospace', color: riscoCor(item.faixa_risco_aquisicao), fontSize: 22 }}>{inteiro(item.pontos_risco_aquisicao)}</strong><p style={{ fontSize: 10.5, color: 'var(--ink-400)', margin: 0 }}>pontos de risco</p></div>
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12, fontSize: 11.5, color: 'var(--ink-500)' }}><span>{inteiro(item.quantidade_adquirida)} {item.unidade_fornecimento || 'un.'} adquiridas</span><span>{inteiro(item.total_fornecedores)} fornecedores</span><span>{item.flag_sem_aquisicao_3m ? 'Sem aquisição nos últimos 3 meses' : 'Aquisição recente identificada'}</span></div>
        <button onClick={() => onOpenClara?.(`Explique o alerta real de aquisição para ${item.insumo_padronizado} em ${dados.municipio.nome}: ${item.mensagem_analitica}. Não trate isso como estoque físico.`)} style={{ ...botao, marginTop: 12 }}><MIcon m="smart_toy" size={15} /> Analisar com Clara</button>
      </article>) : <Vazio texto="Nenhum alerta real retornado para o município." />}
    </Card>
  </div>;
}

export function InsumosReais({ municipio }) {
  const [periodo, setPeriodo] = useState('12 Meses');
  const estado = useRuptura(periodo, municipio.ibge6);
  const dados = estado.dados;
  const serie = useMemo(() => {
    const mapa = new Map();
    (dados?.serie_mensal || []).forEach(item => {
      const chave = String(item.competencia || '').slice(0, 7);
      const atual = mapa.get(chave) || { competencia: chave, risco: 0, valor: 0 };
      atual.risco = Math.max(atual.risco, n(item.pontos_risco_aquisicao));
      atual.valor += n(item.valor_adquirido);
      mapa.set(chave, atual);
    });
    return [...mapa.values()];
  }, [dados]);
  if (!dados) return <div className="rise"><header style={header}><div><h1 style={titulo}>Insumos <span style={subtitulo}>— risco de aquisição</span></h1><p style={descricao}>Sinais reais de compras públicas relacionados à pressão assistencial de dengue.</p></div><SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={estado.carregando} /></header><EstadoConsulta carregando={estado.carregando} erro={estado.erro} onRetry={estado.recarregar} /></div>;
  return <div className="rise">
    <header style={header}><div><h1 style={titulo}>Insumos <span style={subtitulo}>— risco de aquisição</span></h1><p style={descricao}>Sinais reais de compras públicas relacionados à pressão assistencial de dengue.</p></div><SeletorPeriodo value={periodo} onChange={setPeriodo} carregando={estado.carregando} /></header>
    <FonteReal meta={dados.meta} detalhe={`${dados.municipio.nome}, ${dados.municipio.uf}`} />
    <Card className="p-5" style={{ marginBottom: 18, borderColor: 'color-mix(in srgb, var(--info) 25%, transparent)' }}><strong style={{ fontSize: 13 }}>Este painel não representa estoque físico.</strong><p style={{ ...texto, margin: '5px 0 0' }}>Quantidade adquirida, fornecedores e ausência de compras são sinais de aquisição. Dias de cobertura exigem estoque e consumo locais, que não existem nestas tabelas.</p></Card>
    <Card className="p-5" style={{ marginBottom: 18 }}><SectionTitle>Evolução mensal do maior risco</SectionTitle><ResponsiveContainer width="100%" height={230}><LineChart data={serie}><CartesianGrid stroke="var(--ink-100)" vertical={false} /><XAxis dataKey="competencia" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip /><Line dataKey="risco" name="Pontos de risco" stroke="var(--risk-alto)" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></Card>
    <Card style={{ overflow: 'hidden' }}><div style={{ padding: '18px 20px 5px' }}><SectionTitle>Insumos monitorados na competência atual</SectionTitle></div><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>Insumo</th><th style={th}>Risco</th><th style={{ ...th, textAlign: 'right' }}>Quantidade adquirida</th><th style={{ ...th, textAlign: 'right' }}>Valor adquirido</th><th style={{ ...th, textAlign: 'right' }}>Fornecedores</th></tr></thead><tbody>{dados.alertas.map(item => <tr key={`${item.insumo_padronizado}-${item.unidade_fornecimento}`}><td style={{ ...td, fontWeight: 700 }}>{item.insumo_padronizado}<small style={{ display: 'block', color: 'var(--ink-400)', marginTop: 3 }}>{item.unidade_fornecimento || 'unidade não informada'}</small></td><td style={td}><Badge label={item.faixa_risco_aquisicao} color={riscoCor(item.faixa_risco_aquisicao)} /></td><td style={{ ...td, textAlign: 'right' }}>{inteiro(item.quantidade_adquirida)}</td><td style={{ ...td, textAlign: 'right' }}>{moeda(item.valor_adquirido)}</td><td style={{ ...td, textAlign: 'right' }}>{inteiro(item.total_fornecedores)}</td></tr>)}</tbody></table></div></Card>
  </div>;
}

function Vazio({ texto }) { return <p style={{ textAlign: 'center', padding: 48, color: 'var(--ink-400)', fontSize: 13 }}>{texto}</p>; }
const header = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 18 };
const titulo = { fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', margin: 0 };
const subtitulo = { color: 'var(--ink-400)', fontWeight: 450, fontSize: '0.72em' };
const descricao = { fontSize: 13, color: 'var(--ink-400)', margin: '5px 0 0' };
const texto = { color: 'var(--ink-500)', fontSize: 12.5, lineHeight: 1.55 };
const grid4 = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 };
const grid2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, marginTop: 18 };
const primario = { ...botao, background: 'var(--primary)', borderColor: 'var(--primary)', color: 'white' };
const th = { padding: '10px 16px', textAlign: 'left', fontSize: 10.5, color: 'var(--ink-400)', borderBottom: '1px solid var(--ink-100)', textTransform: 'uppercase', letterSpacing: '.04em' };
const td = { padding: '13px 16px', fontSize: 12.5, color: 'var(--ink-700)', borderBottom: '1px solid var(--ink-100)' };
const selectCompacto = { height: 36, border: '1px solid var(--ink-100)', borderRadius: 8, background: 'var(--elev)', color: 'var(--ink-700)', padding: '0 32px 0 10px' };
const microcopy = { display: 'block', color: 'var(--ink-400)', fontSize: 9.5, marginTop: 3 };
const track = { height: 6, marginTop: 5, borderRadius: 99, background: 'var(--ink-100)', overflow: 'hidden' };
const fill = { display: 'block', height: '100%', borderRadius: 99, background: 'var(--primary)' };
const linhaRanking = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--ink-100)', fontSize: 12 };
