import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Badge, Card, MIcon, SectionTitle } from './ui.jsx';
import { EstadoConsulta, FonteReal, Kpi, SeletorPeriodo, botao } from './dataUi.jsx';
import { useDadosOperacionais } from './operationalClient.js';

const IBGE_PADRAO = '351300';
const n = valor => Number(valor || 0);
const inteiro = valor => n(valor).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
const decimal = valor => n(valor).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const moeda = valor => n(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const riscoCor = risco => String(risco).toUpperCase() === 'ALTO' ? 'var(--risk-alto)' : String(risco).toUpperCase() === 'MODERADO' ? 'var(--risk-medio)' : 'var(--risk-baixo)';

function useRuptura(periodo) {
  return useDadosOperacionais('ruptura', { ibge: IBGE_PADRAO, periodo });
}

export function VisaoGeralReal({ onNavigate, onOpenSusBot, onDemo }) {
  const periodo = '12 Meses';
  const estado = useRuptura(periodo);
  const dados = estado.dados;
  const alertas = dados?.alertas || [];
  const resumo = dados?.resumo;
  if (!dados) return <div className="rise"><header style={header}><div><h1 style={titulo}>Visão Geral <span style={subtitulo}>— Cotia, SP</span></h1><p style={descricao}>O que exige atenção no planejamento de aquisições.</p></div><button onClick={onDemo} style={botao}>Abrir demo histórica</button></header><EstadoConsulta carregando={estado.carregando} erro={estado.erro} onRetry={estado.recarregar} /></div>;
  const altos = alertas.filter(item => String(item.faixa_risco_aquisicao).toUpperCase() === 'ALTO');
  const prioritario = alertas[0];
  return <div className="rise">
    <header style={header}><div><h1 style={titulo}>Visão Geral <span style={subtitulo}>— {dados.municipio.nome}, {dados.municipio.uf}</span></h1><p style={descricao}>O que exige atenção no planejamento de aquisições.</p></div><button onClick={onDemo} style={botao}>Abrir demo histórica</button></header>
    <FonteReal meta={dados.meta} detalhe={`Competência ${dados.competencia?.competencia_referencia || 'não informada'}`} />
    <div className="responsive-grid-4" style={grid4}>
      <Kpi rotulo="Itens em risco alto" valor={inteiro(resumo?.itens_risco_alto_atual ?? altos.length)} detalhe="Indicador de aquisição, não estoque físico" tom="var(--risk-alto)" />
      <Kpi rotulo="Risco moderado" valor={inteiro(resumo?.itens_risco_moderado_atual)} detalhe="Itens que pedem acompanhamento" tom="var(--risk-medio)" />
      <Kpi rotulo="Casos de dengue" valor={inteiro(resumo?.casos_atual)} detalhe={`${decimal(resumo?.variacao_casos_pct)}% vs. período anterior`} />
      <Kpi rotulo="Valor adquirido" valor={moeda(resumo?.valor_adquirido_atual)} detalhe="Compras públicas identificadas" />
    </div>
    <div className="responsive-grid-2" style={grid2}>
      <Card className="p-5">
        <p className="eyebrow">Situação prioritária</p>
        <h2 style={{ fontSize: 19, margin: '8px 0' }}>{prioritario?.insumo_padronizado || 'Nenhum item crítico identificado'}</h2>
        <p style={texto}>{prioritario?.mensagem_analitica || 'A fonte real não retornou alerta de aquisição para o município.'}</p>
        {prioritario && <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}><button onClick={() => onNavigate?.('alertas')} style={primario}>Ver alertas</button><button onClick={() => onOpenSusBot?.(`Analise o risco de aquisição de ${prioritario.insumo_padronizado} em ${dados.municipio.nome}. Use apenas as fontes disponíveis e explique as limitações.`)} style={botao}>Analisar com SusBot</button></div>}
      </Card>
      <Card className="p-5">
        <SectionTitle>Leitura correta do indicador</SectionTitle>
        <p style={texto}>As tabelas reais medem <strong>risco de aquisição</strong> a partir de dengue, internações e compras públicas. Elas não informam quantidade atual em almoxarifado nem dias de cobertura.</p>
        <button onClick={() => onNavigate?.('insumos')} style={{ ...botao, marginTop: 14 }}>Explorar insumos monitorados</button>
      </Card>
    </div>
  </div>;
}

export function AlertasReais({ onOpenSusBot, deepLinkAlertaId }) {
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
        <button onClick={() => onOpenSusBot?.(`Explique o alerta real de aquisição para ${item.insumo_padronizado} em ${dados.municipio.nome}: ${item.mensagem_analitica}. Não trate isso como estoque físico.`)} style={{ ...botao, marginTop: 12 }}><MIcon m="smart_toy" size={15} /> Analisar com SusBot</button>
      </article>) : <Vazio texto="Nenhum alerta real retornado para o município." />}
    </Card>
  </div>;
}

export function InsumosReais() {
  const [periodo, setPeriodo] = useState('12 Meses');
  const estado = useRuptura(periodo);
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
