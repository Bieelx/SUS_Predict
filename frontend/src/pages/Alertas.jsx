import { useEffect, useState } from 'react';
import { Card, MIcon } from '../shared/ui.jsx';
import { EstadoConsulta, FonteReal } from '../shared/dataUi.jsx';
import { useDadosOperacionais } from '../shared/operationalClient.js';
import { inteiro, numero, rotuloDado } from '../shared/formatters.js';
import './alertas.css';

const normalizar = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const faixa = item => String(item.faixa_risco_aquisicao || '').toUpperCase();
const prioridade = item => ({ ALTO: 0, MODERADO: 1, BAIXO: 2, SEM_ALERTA: 3 }[faixa(item)] ?? 4);
const filtros = [['TODOS', 'Todos'], ['ALTO', 'Risco alto'], ['MODERADO', 'Moderado'], ['OUTROS', 'Outros']];
const corresponde = (item, filtro) => filtro === 'TODOS' || (filtro === 'OUTROS' ? !['ALTO', 'MODERADO'].includes(faixa(item)) : faixa(item) === filtro);

export default function Alertas({ municipio, onOpenClara, deepLinkAlertaId }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('TODOS');
  const estado = useDadosOperacionais('ruptura', { ibge: municipio.ibge6, periodo: '12 Meses' });
  const dados = estado.dados;
  useEffect(() => { setBusca(''); setFiltro('TODOS'); }, [municipio.ibge6, deepLinkAlertaId]);
  useEffect(() => {
    if (dados && deepLinkAlertaId) document.getElementById(deepLinkAlertaId)?.scrollIntoView({ block: 'nearest' });
  }, [dados, deepLinkAlertaId, busca, filtro]);
  const alertas = (dados?.alertas || []).map((item, indice) => ({ ...item, id: `aquisicao-${indice + 1}` }));
  const visiveis = alertas.filter(item => corresponde(item, filtro) && normalizar(`${item.insumo_padronizado} ${rotuloDado(item.categoria_insumo)}`).includes(normalizar(busca.trim())))
    .sort((a, b) => prioridade(a) - prioridade(b) || (numero(b.pontos_risco_aquisicao) ?? -1) - (numero(a.pontos_risco_aquisicao) ?? -1));
  return <div className="rise alerts-page">
    <header className="alerts-header">
      <p className="eyebrow">Monitoramento de aquisições</p>
      <h1>Central de Alertas <span className="page-territory">— {municipio.nome}, {municipio.uf}</span></h1>
      <p>Identifique prioridades e entenda os sinais de risco nas compras públicas.</p>
    </header>
    {!dados ? <EstadoConsulta carregando={estado.carregando} erro={estado.erro} onRetry={estado.recarregar} /> : <>
      <FonteReal meta={dados.meta} competencia={dados.competencia?.competencia_referencia} somenteCompetencia detalhe="Alertas deduplicados por insumo e unidade" />
      <div className="alerts-toolbar">
        <div className="alerts-filters" role="group" aria-label="Filtrar por risco">
          {filtros.map(([valor, label]) => <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}>{label}<span>{alertas.filter(item => corresponde(item, valor)).length}</span></button>)}
        </div>
        <label className="alerts-search"><MIcon m="search" size={19} /><span className="sr-only">Buscar insumo ou categoria</span><input type="search" value={busca} onChange={event => setBusca(event.target.value)} placeholder="Buscar insumo ou categoria" /></label>
      </div>
      <div className="alerts-list-heading"><p role="status">{visiveis.length} {visiveis.length === 1 ? 'alerta exibido' : 'alertas exibidos'}</p><span>Maior risco primeiro</span></div>
      <Card className="alerts-list">
        {visiveis.map(item => <article className={`alert-item${deepLinkAlertaId === item.id ? ' alert-item--selected' : ''}`} id={item.id} key={item.id} aria-label={item.insumo_padronizado || 'Insumo não informado'}>
          <div className="alert-item-heading">
            <div className="alert-item-identity"><div className="alert-item-meta"><span className="alert-severity" data-risk={faixa(item)}>{rotuloDado(item.faixa_risco_aquisicao)}</span><span>{rotuloDado(item.categoria_insumo)}</span>{deepLinkAlertaId === item.id && <span>Alerta selecionado</span>}</div><h2>{item.insumo_padronizado || 'Insumo não informado'}</h2></div>
            <div className="alert-score"><strong>{inteiro(item.pontos_risco_aquisicao)}</strong><span>pontos de risco</span></div>
          </div>
          <p className="alert-message">{item.mensagem_analitica || 'A fonte não informou uma descrição para este alerta.'}</p>
          <div className="alert-actions">
            <details className="alert-evidence" key={`${item.id}-${deepLinkAlertaId}`} open={deepLinkAlertaId === item.id || undefined}><summary>Detalhes da aquisição</summary><dl>
              <div><dt>Quantidade adquirida</dt><dd>{inteiro(item.quantidade_adquirida)} <small>{item.unidade_fornecimento || 'unidade não informada'}</small></dd></div>
              <div><dt>Fornecedores</dt><dd>{inteiro(item.total_fornecedores)}</dd></div>
              <div><dt>Compras nos três meses anteriores</dt><dd>{item.flag_sem_aquisicao_3m === true ? 'Sem aquisição registrada' : item.flag_sem_aquisicao_3m === false ? 'Com aquisição registrada' : 'Não informado'}</dd></div>
            </dl></details>
            {onOpenClara && <button className="alert-clara" type="button" onClick={() => onOpenClara(`Explique o alerta real de aquisição para ${item.insumo_padronizado} em ${municipio.nome}: ${item.mensagem_analitica || 'Descrição não informada'}. Não trate isso como estoque físico.`)}><MIcon m="smart_toy" size={18} />Analisar com Clara</button>}
          </div>
        </article>)}
        {!visiveis.length && <div className="alerts-empty"><MIcon m={alertas.length ? 'search_off' : 'notifications_none'} size={32} /><h2>{alertas.length ? 'Nenhum alerta neste filtro' : 'Nenhum alerta retornado'}</h2><p>{alertas.length ? 'Tente outro insumo ou amplie a seleção de risco.' : `A fonte não retornou alertas de aquisição para ${municipio.nome} nesta competência.`}</p>{alertas.length > 0 && <button type="button" onClick={() => { setBusca(''); setFiltro('TODOS'); }}>Limpar filtros</button>}</div>}
      </Card>
      <p className="alerts-note"><MIcon m="info" size={17} /><span>Os alertas indicam risco de aquisição. Não representam estoque físico nem confirmam falta de insumos nas unidades.</span></p>
    </>}
  </div>;
}
