import { useEffect, useRef, useState } from 'react';
import { operationalInputsClient as api } from '../../shared/operationalInputsClient.js';
import { SkeletonRegistros } from './componentes.jsx';
import './registros-estabelecimento.css';

const MODULOS = {
  vacinacao: { nome: 'Vacinas', item: 'Vacina', ajuda: 'Entradas somam doses ao estoque. Saídas descontam doses disponíveis.', exemplo: 'Entrada de 500 doses da vacina COVID-19' },
  medicamento: { nome: 'Medicamentos', item: 'Medicamento e apresentação', ajuda: 'Cada apresentação tem seu próprio estoque, contado em embalagens.', exemplo: 'Saída de 2 embalagens de Paracetamol; concentração 500 mg; forma comprimido; embalagem caixa; 20 unidades por embalagem' },
  internacao: { nome: 'Leitos', item: 'Tipo de leito', ajuda: 'Informe a situação atual. Os novos números substituem a atualização anterior.', exemplo: 'UTI: 19 leitos ocupados e 1 disponível' },
};
const data = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : 'Sem data informada';
const nome = (tipo, p) => tipo === 'vacinacao' ? p.nome_vacina : tipo === 'internacao' ? p.tipo_leito : `${p.nome_medicamento} · ${p.concentracao}`;
const apresentacao = p => `${p.forma_farmaceutica} · ${p.tipo_embalagem} com ${p.quantidade_por_embalagem} unidades`;
const quantidade = (tipo, p) => tipo === 'internacao'
  ? `${p.qtd_leitos_ocupados} ocupados · ${p.qtd_leitos_disponiveis} ${p.qtd_leitos_disponiveis === 1 ? 'disponível' : 'disponíveis'}`
  : tipo === 'vacinacao' ? `${p.qtd_doses} doses` : `${p.qtd_embalagens} embalagens`;

export default function RegistrosEstabelecimento({ onOpenClara, onLegado }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState([]);
  const [unidade, setUnidade] = useState(null);
  const [buscando, setBuscando] = useState(true);
  const [erroBusca, setErroBusca] = useState('');
  const [tipo, setTipo] = useState('vacinacao');
  const [aba, setAba] = useState('saldo');
  const [dados, setDados] = useState(null);
  const [pendentes, setPendentes] = useState([]);
  const [metricas, setMetricas] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [texto, setTexto] = useState('');
  const [editando, setEditando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState('');
  const [revisao, setRevisao] = useState(0);
  const trava = useRef(false);
  const chave = useRef(null);
  const modulo = MODULOS[tipo];

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscando(true); setErroBusca('');
      try {
        const resposta = await api.listarEstabelecimentos({ busca, signal: controller.signal });
        if (!controller.signal.aborted) setLista(resposta.itens || []);
      } catch (e) { if (!controller.signal.aborted) setErroBusca(e.message); }
      finally { if (!controller.signal.aborted) setBuscando(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busca]);

  useEffect(() => {
    if (!unidade) return;
    const controller = new AbortController();
    setCarregando(true); setDados(null); setPendentes([]); setMetricas(null); setErro('');
    Promise.all([api.obterRegistros(unidade.id, { signal: controller.signal }), api.listarRascunhos({ id_estabelecimento: unidade.id, signal: controller.signal }), api.obterMetricasPiloto(unidade.id, { signal: controller.signal })])
      .then(([resposta, rascunhos, sinais]) => {
        if (controller.signal.aborted) return;
        setDados(resposta); setPendentes((rascunhos.itens || []).filter(r => r.id_estabelecimento === unidade.id)); setMetricas(sinais);
      })
      .catch(e => { if (!controller.signal.aborted) setErro(e.message); })
      .finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [unidade, revisao]);

  async function executar(operacao, mensagem) {
    if (trava.current) return;
    trava.current = true; setOcupado(true); setErro(''); setAviso('');
    try {
      await operacao(); setAviso(mensagem); setRevisao(v => v + 1);
    } catch (e) { setErro(e.message); }
    finally { trava.current = false; setOcupado(false); }
  }
  function criar(evento) {
    evento.preventDefault();
    const fingerprint = `${unidade.id}:${texto}`;
    if (chave.current?.fingerprint !== fingerprint) chave.current = { fingerprint, id: crypto.randomUUID() };
    void executar(async () => {
      await api.criarRascunho(unidade.id, texto, chave.current.id);
      setTexto(''); setEditando(false); setAba('pendentes'); chave.current = null;
    }, 'Rascunho preparado. Confira os valores antes de confirmar.');
  }
  const registros = dados?.[tipo]?.[aba] || [];
  const rascunhos = pendentes.filter(r => r.tipo === tipo);
  return <div className="rl-page re-page">
    <header className="rl-header"><div><span className="eyebrow">Gestão da unidade</span><h1>Estoques e leitos</h1><p>Consulte a situação da unidade e registre entradas, saídas ou disponibilidade de leitos.</p></div>
      <button className="re-link" onClick={onLegado}>Atividades locais anteriores ↗</button>
    </header>
    <section className="re-unidade" aria-label="Selecionar unidade">
      <label className="rl-campo"><span>Buscar unidade por nome ou CNES</span><input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite o nome ou o código CNES" disabled={ocupado} /></label>
      <label className="rl-campo"><span>Unidade de saúde</span><select value={unidade?.id || ''} disabled={buscando || ocupado} onChange={e => {
        setUnidade(lista.find(item => item.id === e.target.value) || null); setDados(null); setPendentes([]); setTexto(''); setEditando(false); setAviso('');
      }}><option value="">{buscando ? 'Buscando unidades…' : 'Selecione uma unidade'}</option>
        {unidade && !lista.some(item => item.id === unidade.id) && <option value={unidade.id}>{unidade.no_fantasia || unidade.cnes}</option>}
        {lista.map(item => <option key={item.id} value={item.id}>{item.no_fantasia || item.cnes} · CNES {item.cnes}</option>)}
      </select></label>
      <p className="re-unidade-meta">{unidade ? `${unidade.nome_municipio || unidade.no_municipio || 'Município cadastrado'} · CNES ${unidade.cnes}` : 'Escolha o estabelecimento ao qual este registro pertence.'}</p>
      {erroBusca && <p role="alert">{erroBusca}</p>}
      {!buscando && !erroBusca && !lista.length && <p>Nenhuma unidade encontrada. Tente outro nome ou CNES.</p>}
    </section>
    <p role="status" className={aviso ? 'rl-sucesso' : 'sr-only'}>{aviso}</p>
    {erro && <div className="rl-aviso rl-aviso--erro" role="alert">{erro} <button className="re-link" disabled={ocupado} onClick={() => setRevisao(v => v + 1)}>Recarregar dados</button></div>}
    {!unidade ? <div className="re-inicio"><span className="eyebrow">Uma unidade, três controles</span><h2>O que você precisa atualizar?</h2><p>Vacinas em doses, medicamentos por apresentação e leitos por tipo. Cada registro fica vinculado à unidade selecionada.</p><ol><li>Selecione a unidade acima.</li><li>Descreva a movimentação ou situação atual.</li><li>Revise e confirme para atualizar os dados.</li></ol></div> : <>
      <nav className="re-modulos" aria-label="Tipo de registro">{Object.entries(MODULOS).map(([key, m]) => <button key={key} aria-pressed={tipo === key} disabled={ocupado} onClick={() => { setTipo(key); setEditando(false); setTexto(''); }}>{m.nome}</button>)}</nav>
      <div className="re-titulo"><div><h2>{modulo.nome}</h2><p>{modulo.ajuda}</p></div><button className="rl-botao-primario" disabled={ocupado || carregando} onClick={() => setEditando(v => !v)}>{editando ? 'Fechar preenchimento' : 'Novo registro'}</button></div>
      {metricas?.confirmados > 0 && <section className="re-piloto" aria-label="Métricas do piloto nesta unidade"><div><strong>{(metricas.taxa_interpretados_sem_correcao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</strong><span>confirmados sem corrigir a interpretação</span></div><div><strong>{metricas.tempo_mediano_confirmacao_segundos < 60 ? `${metricas.tempo_mediano_confirmacao_segundos} s` : `${Math.round(metricas.tempo_mediano_confirmacao_segundos / 60)} min`}</strong><span>tempo mediano até confirmar</span></div><p>Amostra: {metricas.confirmados.toLocaleString('pt-BR')} registros confirmados nesta unidade.</p></section>}
      {editando && <form className="re-form" onSubmit={criar}><label htmlFor="re-relato">Descreva o que aconteceu na unidade</label><p>A Clara prepara os campos para sua revisão. Os dados só mudam depois de confirmar.</p><textarea id="re-relato" autoFocus required maxLength={4000} rows={3} value={texto} disabled={ocupado} onChange={e => setTexto(e.target.value)} placeholder={modulo.exemplo} />
        <p className="re-exemplo">Exemplo: {modulo.exemplo}</p><div className="rl-acoes"><button className="rl-botao-primario" disabled={ocupado || !texto.trim()}>{ocupado ? 'Preparando…' : 'Preparar para revisão'}</button>
          {onOpenClara && <button type="button" className="rl-botao" disabled={ocupado} onClick={() => onOpenClara('', { intencao: 'input_operacional', estabelecimento: { id: unidade.id, cnes: unidade.cnes, nome: unidade.no_fantasia, municipio: unidade.nome_municipio || unidade.no_municipio }, rota_retorno: '/registros-unidade' }, { origem: 'registros-unidade', unidade: unidade.no_fantasia })}>Abrir conversa com a Clara</button>}</div></form>}
      <nav className="rl-abas" aria-label="Visualização dos registros">{[['saldo', 'Situação atual'], ['pendentes', `Para revisar (${rascunhos.length})`], ['historico', 'Histórico']].map(([key, label]) => <button key={key} aria-current={aba === key ? 'page' : undefined} onClick={() => setAba(key)}>{label}</button>)}</nav>
      {carregando ? <SkeletonRegistros /> : !dados ? null : aba === 'pendentes' ? <>
        {!rascunhos.length && <div className="re-vazio"><h3>Nenhum registro para revisar</h3><p>Os novos rascunhos desta categoria aparecerão aqui antes de atualizar a unidade.</p></div>}
        {rascunhos.map(r => <article className="re-revisao" key={r.id}><span className="eyebrow">Aguardando sua confirmação</span><h3>{nome(r.tipo, r.payload_proposto)}</h3><p>{r.payload_proposto.tipo_movimentacao === 'entrada' ? 'Entrada · ' : r.payload_proposto.tipo_movimentacao === 'saida' ? 'Saída · ' : ''}{quantidade(r.tipo, r.payload_proposto)}</p>{r.tipo === 'medicamento' && <p>{apresentacao(r.payload_proposto)}</p>}<p className="re-exemplo">{r.estabelecimento?.no_fantasia} · {data(r.criado_em)}</p><blockquote>{r.texto_original}</blockquote><div className="rl-acoes"><button className="rl-botao-primario" disabled={ocupado} onClick={() => executar(() => api.confirmar(r.id, r.versao, `confirmar-${r.id}-v${r.versao}`), 'Registro confirmado. A situação da unidade foi atualizada.')}>Confirmar registro</button><button className="rl-botao" disabled={ocupado} onClick={() => executar(() => api.rejeitar(r.id, r.versao, `rejeitar-${r.id}-v${r.versao}`), 'Rascunho descartado.')} >Descartar</button></div></article>)}
      </> : !registros.length ? <div className="re-vazio"><h3>{aba === 'saldo' ? 'Ainda não há dados registrados' : 'Nenhuma movimentação registrada'}</h3><p>Use “Novo registro” para informar os dados desta unidade. Ausência de registro não significa saldo zero.</p></div> : <div className="re-tabela-wrap"><table className="rl-tabela"><caption>{aba === 'saldo' ? 'Última situação registrada para esta unidade' : 'Até 50 registros mais recentes desta categoria, incluindo registros feitos fora da Clara'}</caption><thead><tr><th scope="col">{modulo.item}</th>{aba === 'historico' && tipo !== 'internacao' && <th scope="col">Movimentação</th>}<th scope="col">{tipo === 'internacao' ? 'Situação dos leitos' : aba === 'saldo' ? 'Saldo disponível' : 'Quantidade'}</th><th scope="col">Atualização</th></tr></thead><tbody>{registros.map(r => <tr key={r.id}><td><strong>{nome(tipo, r)}</strong>{tipo === 'medicamento' && <small>{apresentacao(r)}</small>}</td>{aba === 'historico' && tipo !== 'internacao' && <td>{r.tipo_movimentacao === 'entrada' ? 'Entrada' : 'Saída'}</td>}<td className="rl-valor">{quantidade(tipo, r)}</td><td>{data(r.data_atualizacao)}</td></tr>)}</tbody></table></div>}
      <p className="re-rodape">Registros informados pela equipe da unidade. Estoque de vacinas não representa doses aplicadas nem cobertura vacinal.</p>
    </>}
  </div>;
}
