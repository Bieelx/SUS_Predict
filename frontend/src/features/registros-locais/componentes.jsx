// Componentes da área "Registros da unidade" (docs/15).
// Trabalham com registros já normalizados por regras.js (ver docs/16).

import { useEffect, useRef, useState } from 'react';
import { MIcon } from '../../shared/ui.jsx';
import { dataBr, decimal, inteiro } from '../../shared/formatters.js';
import {
  ABAS, ATALHOS_PERIODO, ESTADOS_RELATO, estadoDaVersao, intervaloDoAtalho,
  rotuloPendencia, textoCobertura, ehDataValida,
} from './regras.js';

// ─── Estados de página ───────────────────────────────────────────────────────

export function EstadoLocal({ titulo, descricao, acao, tom = 'neutro' }) {
  return (
    <div className={`rl-vazio${tom === 'erro' ? ' rl-aviso--erro' : ''}`} role={tom === 'erro' ? 'alert' : undefined}>
      <h2>{titulo}</h2>
      {descricao && <p>{descricao}</p>}
      {acao}
    </div>
  );
}

export function SkeletonRegistros() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <div className="skeleton" style={{ width: '46%', height: 14, borderRadius: 6, marginBottom: 16 }} />
      {[0, 1, 2, 3].map(indice => (
        <div key={indice} className="skeleton" style={{ width: '100%', height: 56, borderRadius: 10, marginBottom: 10 }} />
      ))}
      <span className="sr-only">Carregando registros da unidade…</span>
    </div>
  );
}

export function EstadoDaVersao({ status }) {
  const { rotulo, cor } = estadoDaVersao(status);
  return (
    <span className="rl-estado" style={{ color: cor }}>
      <span aria-hidden="true" />{rotulo}
    </span>
  );
}

// ─── Contexto: unidade e período ─────────────────────────────────────────────

export function ContextoUnidade({ unidades, unidadeId, onUnidade, periodo, onPeriodo, desabilitado }) {
  const unidade = unidades.find(item => item.id === unidadeId) || null;
  const unica = unidades.length === 1;

  function trocarAtalho(atalho) {
    if (atalho === 'personalizado') { onPeriodo({ ...periodo, atalho }); return; }
    onPeriodo({ ...intervaloDoAtalho(atalho), atalho });
  }

  return (
    <section className="rl-contexto" aria-label="Unidade e período em consulta">
      <div className="rl-campo">
        <span className="eyebrow">Unidade</span>
        {unica ? (
          <strong style={{ fontSize: 'var(--fs-sm)' }}>
            {unidade?.nome}
            <span style={{ display: 'block', fontWeight: 500, color: 'var(--ink-500)' }}>
              CNES {unidade?.cnes || 'não informado'}
            </span>
          </strong>
        ) : (
          <select
            aria-label="Unidade em consulta"
            value={unidadeId || ''}
            disabled={desabilitado}
            onChange={evento => onUnidade(evento.target.value)}
          >
            {!unidadeId && <option value="">Selecione uma unidade</option>}
            {unidades.map(item => (
              <option key={item.id} value={item.id}>{item.nome} · CNES {item.cnes || 'não informado'}</option>
            ))}
          </select>
        )}
      </div>

      <div className="rl-campo">
        <span className="eyebrow">Período</span>
        <select aria-label="Atalho de período" value={periodo.atalho} onChange={evento => trocarAtalho(evento.target.value)}>
          {ATALHOS_PERIODO.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </div>

      {periodo.atalho === 'personalizado' && <>
        <label className="rl-campo">
          <span className="eyebrow">Data inicial</span>
          <input type="date" value={periodo.inicio} max={periodo.fim} onChange={evento => onPeriodo({ ...periodo, inicio: evento.target.value })} />
        </label>
        <label className="rl-campo">
          <span className="eyebrow">Data final</span>
          <input type="date" value={periodo.fim} min={periodo.inicio} onChange={evento => onPeriodo({ ...periodo, fim: evento.target.value })} />
        </label>
      </>}

      <p className="rl-contexto-resumo">
        {dataBr(periodo.inicio)} a {dataBr(periodo.fim)} · Origem: registros da unidade
        {unidade?.ibge6 ? ` · Município da unidade (IBGE): ${unidade.ibge6}` : ''}
        {unidade?.papel ? ` · Seu papel: ${unidade.papel.replace('_', ' ')}` : ''}
      </p>
    </section>
  );
}

// ─── Abas ────────────────────────────────────────────────────────────────────

export function AbasRegistros({ aba, onAba, pendentes }) {
  const refs = useRef([]);

  function navegarPorTeclado(evento, indice) {
    const teclas = { ArrowRight: indice + 1, ArrowLeft: indice - 1, Home: 0, End: ABAS.length - 1 };
    const destino = teclas[evento.key];
    if (destino === undefined) return;
    evento.preventDefault();
    const alvo = (destino + ABAS.length) % ABAS.length;
    onAba(ABAS[alvo].id);
    refs.current[alvo]?.focus();
  }

  return (
    <div className="rl-abas" role="tablist" aria-label="Visões dos registros da unidade">
      {ABAS.map((item, indice) => (
        <button
          key={item.id}
          ref={elemento => { refs.current[indice] = elemento; }}
          type="button"
          role="tab"
          id={`rl-aba-${item.id}`}
          aria-selected={aba === item.id}
          aria-controls="rl-painel"
          tabIndex={aba === item.id ? 0 : -1}
          onClick={() => onAba(item.id)}
          onKeyDown={evento => navegarPorTeclado(evento, indice)}
        >
          {item.label}{item.id === 'pendentes' && pendentes != null ? ` (${pendentes})` : ''}
        </button>
      ))}
    </div>
  );
}

// ─── Resumo ──────────────────────────────────────────────────────────────────

export function ResumoConfirmado({ grupos }) {
  if (!grupos?.length) return null;
  return (
    <section className="rl-resumo-grid" aria-label="Resumo dos registros confirmados no período">
      {grupos.map(item => {
        const cobertura = textoCobertura(item.cobertura);
        return (
          <article key={item.codigo} className="rl-resumo-item">
            <p className="eyebrow" style={{ marginBottom: 6 }}>{item.nome}</p>
            {item.total != null
              ? <strong>
                  {inteiro(item.total)} <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 500, color: 'var(--ink-500)' }}>{item.unidade_medida}</span>
                </strong>
              : <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-500)' }}>
                  Total único não disponível: os registros deste indicador usam detalhamentos diferentes.
                </span>}
            {item.grupos.length > 0 && (
              <ul>
                {item.grupos.map(grupo => (
                  <li key={grupo.rotulo}><span>{grupo.rotulo}</span><span>{inteiro(grupo.valor)}</span></li>
                ))}
              </ul>
            )}
            {cobertura && <small>{cobertura}</small>}
          </article>
        );
      })}
    </section>
  );
}

// ─── Lista ───────────────────────────────────────────────────────────────────

function dimensoesTexto(dimensoes) {
  const entradas = Object.entries(dimensoes || {});
  if (!entradas.length) return 'Sem dimensões informadas';
  return entradas.map(([chave, valor]) => `${chave}: ${valor}`).join(' · ');
}

function valorFormatado(item) {
  if (item.valor == null) return 'Não informado';
  const valor = Number.isInteger(item.valor) ? inteiro(item.valor) : decimal(item.valor);
  return `${valor} ${item.indicador?.unidade_medida || ''}`.trim();
}

function dataOperacional(item) {
  if (!item.periodo_inicio) return 'Data não informada';
  return item.periodo_fim && item.periodo_fim !== item.periodo_inicio
    ? `${dataBr(item.periodo_inicio)} a ${dataBr(item.periodo_fim)}`
    : dataBr(item.periodo_inicio);
}

export function ListaRegistros({ itens, aba, onAbrir, carregandoMais, proximaPagina, onCarregarMais }) {
  return (
    <div className="rl-fade">
      <div className="rl-tabela-wrapper" style={{ overflowX: 'auto' }}>
        <table className="rl-tabela">
          <caption>
            {itens.length} {itens.length === 1 ? 'registro carregado' : 'registros carregados'} nesta visão.
            Ordenados pelo registro mais recente.
          </caption>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Indicador e detalhes</th>
              <th scope="col">Quantidade</th>
              <th scope="col">Responsável</th>
              <th scope="col">Estado</th>
              <th scope="col">Abrir</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(item => (
              <tr key={item.registro_id}>
                <td>{dataOperacional(item)}</td>
                <td>
                  <strong style={{ color: 'var(--ink-900)' }}>{item.indicador?.nome || 'Indicador não informado'}</strong>
                  <span style={{ display: 'block', color: 'var(--ink-500)', fontSize: 'var(--fs-xs)' }}>{dimensoesTexto(item.dimensoes)}</span>
                </td>
                <td className="rl-valor">{valorFormatado(item)}</td>
                <td>{item.status === 'confirmado' ? (item.confirmador || item.autor) : item.autor}</td>
                <td><EstadoDaVersao status={item.status} /></td>
                <td>
                  <button type="button" className="rl-botao" onClick={() => onAbrir(item.registro_id)}>
                    Ver registro<span className="sr-only"> de {item.indicador?.nome} em {dataOperacional(item)}</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="rl-lista-mobile">
        {itens.map(item => (
          <li key={item.registro_id}>
            <article className="rl-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <strong style={{ fontSize: 'var(--fs-sm)' }}>{item.indicador?.nome || 'Indicador não informado'}</strong>
                <EstadoDaVersao status={item.status} />
              </div>
              <dl>
                <dt>Data</dt><dd>{dataOperacional(item)}</dd>
                <dt>Quantidade</dt><dd>{valorFormatado(item)}</dd>
                <dt>Detalhes</dt><dd>{dimensoesTexto(item.dimensoes)}</dd>
                <dt>Responsável</dt><dd>{item.status === 'confirmado' ? (item.confirmador || item.autor) : item.autor}</dd>
              </dl>
              <button type="button" className="rl-botao" onClick={() => onAbrir(item.registro_id)}>
                Ver registro<span className="sr-only"> de {item.indicador?.nome} em {dataOperacional(item)}</span>
              </button>
            </article>
          </li>
        ))}
      </ul>

      {proximaPagina && (
        <button type="button" className="rl-botao" disabled={carregandoMais} onClick={onCarregarMais}>
          {carregandoMais ? 'Carregando…' : 'Carregar mais'}
        </button>
      )}
      {aba !== 'confirmados' && (
        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-400)', marginTop: 10 }}>
          Esta visão mostra a contagem de itens carregados. Somente registros confirmados e vigentes entram nos totais.
        </p>
      )}
    </div>
  );
}

// ─── Detalhe ─────────────────────────────────────────────────────────────────

export function DetalheRegistro({
  registro, catalogo, onVoltar, onConfirmar, onSalvarRascunho, onRejeitar, onCorrigir,
  onCancelar, onAbrirConversa, onRecarregar, unidade, salvando, aviso, erroAcao,
}) {
  const [valor, setValor] = useState(registro?.valor ?? '');
  const [data, setData] = useState(registro?.periodo_inicio || '');
  const [dimensoes, setDimensoes] = useState(registro?.dimensoes || {});
  const [motivo, setMotivo] = useState('');
  const [modo, setModo] = useState(null); // 'corrigir' | 'cancelar' | 'rejeitar'
  const [erroCampo, setErroCampo] = useState('');
  const erroRef = useRef(null);

  useEffect(() => {
    setValor(registro?.valor ?? '');
    setData(registro?.periodo_inicio || '');
    setDimensoes(registro?.dimensoes || {});
    setModo(null);
    setMotivo('');
    setErroCampo('');
  }, [registro?.registro_id, registro?.versao_esperada]);

  useEffect(() => { if (erroCampo) erroRef.current?.focus(); }, [erroCampo]);

  if (!registro) return null;
  const capacidades = registro.capacidades || {};
  const definicao = (catalogo?.indicadores || []).find(item => item.codigo === registro.indicador?.codigo);
  const rascunho = registro.status === 'rascunho';
  const valoresEditados = () => ({
    valor: valor === '' ? null : String(valor),
    dimensoes: Object.fromEntries(Object.entries(dimensoes).filter(([, v]) => String(v).trim() !== '')),
    periodo_inicio: data || null,
    periodo_fim: data || null,
  });

  function confirmarRevisao() {
    const faltantes = [];
    if (valor === '' || !Number.isSafeInteger(Number(valor)) || Number(valor) < 0) faltantes.push('Informe uma quantidade inteira igual ou maior que zero.');
    if (!ehDataValida(data)) faltantes.push('Informe a data do fechamento.');
    for (const dimensao of definicao?.dimensoes || []) {
      if (dimensao.obrigatoria && !String(dimensoes[dimensao.codigo] || '').trim()) faltantes.push(`Informe ${dimensao.nome.toLocaleLowerCase('pt-BR')}.`);
    }
    if (!definicao) faltantes.push('Aguarde o catálogo de campos antes de confirmar.');
    if (faltantes.length) { setErroCampo(faltantes.join(' ')); return; }
    setErroCampo('');
    onConfirmar(valoresEditados());
  }

  function comMotivo(acao) {
    if (!motivo.trim()) {
      setErroCampo('Informe o motivo antes de continuar.');
      return;
    }
    setErroCampo('');
    acao({ ...valoresEditados(), motivo: motivo.trim() });
  }

  return (
    <div className="rl-detalhe rl-fade">
      <button type="button" className="rl-botao" onClick={onVoltar} style={{ marginBottom: 16 }}>
        <MIcon m="arrow_back" size={16} /> Voltar aos registros
      </button>

      <div className="rl-revisao-cabecalho">
      <span className="eyebrow">{rascunho ? 'Revisar e confirmar' : 'Registro da unidade'}</span>
      <h2 style={{ fontFamily: 'var(--ff-tight)', fontSize: 'var(--fs-lg)', margin: '0 0 6px' }}>
        {registro.indicador?.nome || 'Indicador não informado'}
      </h2>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 'var(--fs-lg)', margin: '0 0 4px', color: 'var(--ink-900)', fontVariantNumeric: 'tabular-nums' }}>
        {registro.valor == null ? 'Valor não informado' : `${inteiro(registro.valor)} ${registro.indicador?.unidade_medida || ''}`}
      </p>
      <p style={{ margin: '0 0 18px' }}><EstadoDaVersao status={registro.status} /></p>
      </div>
      <div className="rl-revisao-layout"><div className="rl-revisao-principal">

      {registro.correcao_em_elaboracao && (
        <p className="rl-aviso">
          Existe uma correção em elaboração. O valor confirmado que continua valendo é
          {' '}<strong>{inteiro(registro.valor_confirmado_vigente)}</strong> até a correção ser confirmada.
        </p>
      )}
      {aviso && <p className="rl-aviso">{aviso}</p>}
      {erroAcao && <div className="rl-aviso rl-aviso--erro" role="alert"><p>{erroAcao}</p>{onRecarregar && <button type="button" className="rl-botao" disabled={salvando} onClick={onRecarregar}>Recarregar registro</button>}</div>}

      <dl>
        <dt>Unidade</dt><dd>{unidade?.nome || 'Unidade do registro'}{unidade?.cnes && <small className="rl-cnes">CNES {unidade.cnes}</small>}</dd>
        {!rascunho && <>
          <dt>Data operacional</dt><dd>{dataOperacional(registro)}</dd>
          <dt>Detalhes</dt><dd>{dimensoesTexto(registro.dimensoes)}</dd>
          <dt>Versão exibida</dt><dd>{registro.numero_versao ?? 'Não informada'}</dd>
        </>}
      </dl>

      {rascunho && (capacidades.editar_rascunho || capacidades.confirmar) && (
        <section className="rl-formulario" aria-labelledby="rl-revisao">
          <h2 id="rl-revisao">Revise os dados</h2>
          <p className="rl-ajuda">Confira o que aconteceu na unidade. Ao confirmar, os dados passam a compor apenas os registros locais.</p>
          {erroCampo && !modo && <p role="alert" className="rl-campo-erro" ref={erroRef} tabIndex={-1}>{erroCampo}</p>}
          {!definicao && <p className="rl-aviso">Carregando os campos do indicador. Se não aparecerem, <button type="button" className="rl-botao" onClick={() => window.location.reload()}>Tentar novamente</button></p>}
          {registro.pendencias.length > 0 && (
            <ul style={{ margin: '0 0 12px', paddingLeft: 18, color: 'var(--warn)', fontSize: 'var(--fs-sm)' }}>
              {registro.pendencias.map(pendencia => (
                <li key={pendencia}>{rotuloPendencia(pendencia, catalogo, registro.indicador?.codigo)}</li>
              ))}
            </ul>
          )}
          <fieldset disabled={salvando}>
          <legend className="sr-only">Dados do rascunho</legend>
          <label className="rl-campo">
            <span className="eyebrow">Data do fechamento</span>
            <input type="date" value={data} onChange={evento => setData(evento.target.value)} />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="eyebrow">Quantidade ({registro.indicador?.unidade_medida})</span>
            <input type="number" min="0" step="1" value={valor} onChange={evento => setValor(evento.target.value)} aria-describedby="rl-valor-ajuda" />
            <span id="rl-valor-ajuda" style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-400)' }}>
              Zero é um valor medido válido. Informação não mencionada deve continuar ausente.
            </span>
          </label>
          {(definicao?.dimensoes || []).map(dimensao => (
            <label key={dimensao.codigo} style={{ display: 'block', marginBottom: 12 }}>
              <span className="eyebrow">{dimensao.nome}{dimensao.obrigatoria ? ' (obrigatória)' : ''}</span>
              {dimensao.valores_permitidos
                ? <select value={dimensoes[dimensao.codigo] || ''} onChange={evento => setDimensoes({ ...dimensoes, [dimensao.codigo]: evento.target.value })}>
                    <option value="">Não informado</option>
                    {dimensao.valores_permitidos.map(opcao => <option key={opcao} value={opcao}>{opcao}</option>)}
                  </select>
                : <input type="text" value={dimensoes[dimensao.codigo] || ''} onChange={evento => setDimensoes({ ...dimensoes, [dimensao.codigo]: evento.target.value })} />}
            </label>
          ))}
          </fieldset>
          <div className="rl-acoes rl-confirmacao">
            {capacidades.editar_rascunho && (
              <button type="button" className="rl-botao" disabled={salvando} onClick={() => onSalvarRascunho(valoresEditados())}>
                Salvar rascunho
              </button>
            )}
            {capacidades.confirmar
              ? <button type="button" className="rl-botao-primario" disabled={salvando} onClick={confirmarRevisao}>
                  {salvando ? 'Salvando e confirmando…' : 'Confirmar registro'}
                </button>
              : <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-500)', margin: 0, alignSelf: 'center' }}>
                  A confirmação será feita por uma pessoa autorizada da unidade.
                </p>}
            {capacidades.rejeitar && (
              <button type="button" className="rl-botao" disabled={salvando} onClick={() => setModo(modo === 'rejeitar' ? null : 'rejeitar')}>
                Rejeitar rascunho
              </button>
            )}
          </div>
        </section>
      )}

      {(capacidades.corrigir || capacidades.cancelar) && (
        <section aria-labelledby="rl-acoes-confirmado">
          <h2 id="rl-acoes-confirmado">Ações</h2>
          <div className="rl-acoes">
            {capacidades.corrigir && <button type="button" className="rl-botao" onClick={() => setModo(modo === 'corrigir' ? null : 'corrigir')}>Corrigir registro</button>}
            {capacidades.cancelar && <button type="button" className="rl-botao" onClick={() => setModo(modo === 'cancelar' ? null : 'cancelar')}>Cancelar registro</button>}
          </div>
        </section>
      )}

      {modo && (
        <section aria-labelledby="rl-motivo-titulo">
          <h2 id="rl-motivo-titulo">
            {modo === 'corrigir' ? 'Corrigir registro' : modo === 'cancelar' ? 'Cancelar registro' : 'Rejeitar rascunho'}
          </h2>
          {modo === 'corrigir' && <>
            <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--ink-500)' }}>
              Valor confirmado atual: <strong>{inteiro(registro.valor)}</strong> · Valor proposto: <strong>{valor === '' ? 'não informado' : inteiro(Number(valor))}</strong>
            </p>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span className="eyebrow">Novo valor</span>
              <input type="number" min="0" step="1" value={valor} onChange={evento => setValor(evento.target.value)} />
            </label>
          </>}
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span className="eyebrow">Motivo</span>
            <textarea
              rows={3}
              value={motivo}
              onChange={evento => setMotivo(evento.target.value)}
              aria-describedby={erroCampo ? 'rl-motivo-erro' : undefined}
              aria-invalid={erroCampo ? 'true' : undefined}
            />
            {erroCampo && <p className="rl-campo-erro" id="rl-motivo-erro" ref={erroRef} tabIndex={-1}>{erroCampo}</p>}
          </label>
          <div className="rl-acoes">
            <button type="button" className="rl-botao" onClick={() => { setModo(null); setErroCampo(''); }}>Voltar</button>
            <button
              type="button"
              className="rl-botao-primario"
              disabled={salvando}
              onClick={() => comMotivo(modo === 'corrigir' ? onCorrigir : modo === 'cancelar' ? onCancelar : onRejeitar)}
            >
              {salvando ? 'Enviando…' : modo === 'corrigir' ? 'Enviar correção' : modo === 'cancelar' ? 'Confirmar cancelamento' : 'Confirmar rejeição'}
            </button>
          </div>
        </section>
      )}

      {rascunho && !capacidades.editar_rascunho && !capacidades.confirmar && <p className="rl-aviso">Seu acesso permite consultar este registro. A confirmação precisa ser feita por um revisor ou gestor vinculado à unidade.</p>}
      </div><aside className="rl-revisao-origem">
      {registro.relato?.texto && <div className="rl-relato"><span className="eyebrow">Relato recebido pela Clara</span><blockquote>{registro.relato.texto}</blockquote><p>Compare o relato com os campos da revisão antes de confirmar.</p></div>}
      <section aria-labelledby="rl-origem">
        <h2 id="rl-origem">Origem</h2>
        <dl>
          <dt>Autor</dt><dd>{registro.autor || 'Não informado'}</dd>
          <dt>Canal</dt><dd>{registro.relato?.canal || 'Não informado'}</dd>
          <dt>Momento do relato</dt><dd>{dataBr(registro.relato?.recebido_em)}</dd>
          <dt>Processamento do relato</dt><dd>{ESTADOS_RELATO[registro.relato?.status] || 'Não informado'}</dd>
          <dt>Confirmação</dt>
          <dd>{registro.confirmador ? `${registro.confirmador} em ${dataBr(registro.confirmado_em)}` : 'Ainda não confirmado'}</dd>
        </dl>
        {!registro.relato?.texto && <p className="rl-ajuda">Relato de origem indisponível.</p>}
        {registro.relato?.conversa_id && onAbrirConversa && (
          <button type="button" className="rl-botao" style={{ marginTop: 10 }} onClick={() => onAbrirConversa(registro.relato.conversa_id)}>
            Abrir conversa de origem
          </button>
        )}
      </section>

      <details className="rl-historico">
        <summary id="rl-historico">Histórico de versões ({registro.versoes.length})</summary>
        <ul className="rl-versoes">
          {registro.versoes.map(versao => (
            <li key={versao.numero_versao}>
              <strong>Versão {versao.numero_versao}</strong> · {estadoDaVersao(versao.status).rotulo} · {inteiro(versao.valor)} · {versao.autor} · {dataBr(versao.data)}
              {versao.motivo && <span style={{ display: 'block', color: 'var(--ink-500)' }}>Motivo: {versao.motivo}</span>}
            </li>
          ))}
        </ul>
      </details>
      </aside></div>
    </div>
  );
}
