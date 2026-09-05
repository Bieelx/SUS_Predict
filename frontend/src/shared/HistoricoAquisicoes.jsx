import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, SectionTitle } from './ui.jsx';
import { inteiro, moeda, numero } from './formatters.js';

export function dentroDaJanela(item, resumo) {
  if (!resumo?.periodo_inicio || !resumo?.periodo_fim) return true;
  const mes = String(item.competencia || '').slice(0, 7);
  return mes >= resumo.periodo_inicio.slice(0, 7) && mes <= resumo.periodo_fim.slice(0, 7);
}

export default function HistoricoAquisicoes({ linhas = [], resumo }) {
  const [escolha, setEscolha] = useState('');
  const itens = useMemo(() => [...new Map(linhas.map(item => {
    const key = JSON.stringify([item.insumo_padronizado, item.unidade_fornecimento]);
    return [key, `${item.insumo_padronizado} · ${item.unidade_fornecimento || 'unidade não informada'}`];
  })).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [linhas]);
  const selecionado = itens.some(([key]) => key === escolha) ? escolha : itens[0]?.[0] || '';
  const serie = linhas.filter(item => JSON.stringify([item.insumo_padronizado, item.unidade_fornecimento]) === selecionado && dentroDaJanela(item, resumo)).map(item => ({
    mes: String(item.competencia).slice(0, 7), quantidade: numero(item.quantidade_adquirida), valor: numero(item.valor_adquirido),
  }));
  return <Card className="p-5" style={{ marginBottom: 18 }}>
    <SectionTitle>Histórico de aquisições por insumo</SectionTitle>
    <p style={{ fontSize: 12.5, color: 'var(--ink-500)', marginBottom: 12 }}>Quantidade e valor registrados nas compras públicas. Cada apresentação é consultada separadamente; estes valores não representam estoque disponível.</p>
    {itens.length > 0 && <label style={{ display: 'grid', gap: 6, marginBottom: 18, fontSize: 12 }}>
      Insumo e apresentação
      <select value={selecionado} onChange={event => setEscolha(event.target.value)} style={{ width: '100%', maxWidth: 480, padding: 9, border: '1px solid var(--ink-100)', borderRadius: 8, background: 'var(--elev)' }}>
        {itens.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>}
    {serie.length ? <ResponsiveContainer width="100%" height={250}>
      <ComposedChart data={serie}>
        <CartesianGrid stroke="var(--ink-100)" vertical={false} />
        <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="quantidade" tick={{ fontSize: 10 }} />
        <YAxis yAxisId="valor" orientation="right" tick={{ fontSize: 10 }} />
        <Tooltip formatter={(valor, nome) => nome === 'Valor adquirido (R$)' ? moeda(valor) : inteiro(valor)} />
        <Bar yAxisId="quantidade" dataKey="quantidade" name="Quantidade adquirida" fill="var(--primary)" />
        <Line yAxisId="valor" dataKey="valor" name="Valor adquirido (R$)" stroke="var(--warn)" dot={false} />
      </ComposedChart>
    </ResponsiveContainer> : <p style={{ padding: '24px 0', color: 'var(--ink-500)' }}>Histórico de aquisições indisponível para este recorte.</p>}
    <p style={{ fontSize: 11.5, color: 'var(--ink-500)' }}>Barras: quantidade (eixo esquerdo). Linha: valor em reais (eixo direito). {resumo?.periodo_inicio ? 'O gráfico acompanha o período selecionado.' : 'Janela não informada; exibindo a série disponível.'}</p>
  </Card>;
}
