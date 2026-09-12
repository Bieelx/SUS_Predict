// Tela "Registros da unidade" — informações declaradas pelos profissionais das
// unidades (docs/15; contrato real do serviço em docs/16).
//
// Origem local e origem oficial nunca se misturam aqui: esta tela não consulta
// /api/dados/*, não soma com o DataSUS e não altera indicador ou previsão.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '../features/registros-locais/registros-locais.css';
import {
  AbasRegistros, ContextoUnidade, DetalheRegistro, EstadoLocal, ListaRegistros,
  ResumoConfirmado, SkeletonRegistros,
} from '../features/registros-locais/componentes.jsx';
import { criarClienteDemonstracao, modoDemonstracaoAtivo } from '../features/registros-locais/fixtures.js';
import { chaveIdempotencia, criarClienteRegistrosLocais, mensagemDoErro } from '../shared/registrosLocaisClient.js';
import {
  adaptarResumo, hojeOperacional, intervaloDoAtalho, normalizarCatalogo, normalizarRegistro,
  normalizarUnidade, periodoValido, podeConsolidar, podeRegistrar,
} from '../features/registros-locais/regras.js';
import { getCurrentUser } from '../shared/auth.js';

const CHAVE_UNIDADE = 'sus_predict_registros_unidade';
const TAMANHO_PAGINA = 30;

export default function RegistrosUnidade({ rota, onNavegar, onOpenClara }) {
  const demonstracao = modoDemonstracaoAtivo();
  const api = useMemo(() => (demonstracao ? criarClienteDemonstracao() : criarClienteRegistrosLocais()), [demonstracao]);
  // Identidade do usuário decide apenas apresentação (editar rascunho próprio);
  // a autorização continua sendo do serviço.
  const usuario = getCurrentUser()?.id || getCurrentUser()?.usuario || null;

  const params = rota.registrosParams || {};
  const registroId = rota.registroId || null;

  const [unidades, setUnidades] = useState({ lista: null, carregando: true, erro: null, tipo: null });
  const [catalogo, setCatalogo] = useState(null);
  const [consulta, setConsulta] = useState({ itens: null, resumo: null, resumoBloqueado: false, carregando: false, erro: null, tipo: null, proximaPagina: null });
  const [detalhe, setDetalhe] = useState({ registro: null, carregando: false, erro: null, tipo: null });
  const [acao, setAcao] = useState({ salvando: false, erro: null, aviso: null });
  const [anuncio, setAnuncio] = useState('');
  const [pagina, setPagina] = useState(1);
  const geracao = useRef(0);

  const unidadeId = params.unidade || null;
  const unidade = (unidades.lista || []).find(item => item.id === unidadeId) || null;
  const periodo = {
    inicio: params.inicio || intervaloDoAtalho('7dias').inicio,
    fim: params.fim || hojeOperacional(),
    atalho: params.atalho || '7dias',
  };
  const aba = params.aba || 'confirmados';

  const atualizarRota = useCallback((mudanca, opcoes = {}) => {
    onNavegar({
      page: 'registros-unidade',
      registroId: mudanca.registroId !== undefined ? mudanca.registroId : registroId,
      registrosParams: { ...params, ...(mudanca.params || {}) },
    }, opcoes);
  }, [onNavegar, params, registroId]);

  // ─── Unidades autorizadas ──────────────────────────────────────────────────
  useEffect(() => {
    let ativo = true;
    setUnidades({ lista: null, carregando: true, erro: null, tipo: null });
    api.listarUnidades()
      .then(payload => {
        if (!ativo) return;
        const lista = (payload?.itens || []).map(normalizarUnidade);
        setUnidades({ lista, carregando: false, erro: null, tipo: null });
        if (!unidadeId && lista.length) {
          // Uma unidade dispensa escolha. Com várias, a preferência anterior só
          // volta depois de ser revalidada contra a lista autorizada.
          const salva = (() => { try { return localStorage.getItem(CHAVE_UNIDADE); } catch { return null; } })();
          const restaurada = lista.length === 1 ? lista[0] : lista.find(item => item.id === salva);
          if (restaurada) atualizarRota({ params: { unidade: restaurada.id } }, { replace: true });
        }
      })
      .catch(erro => {
        if (ativo) setUnidades({ lista: null, carregando: false, erro: mensagemDoErro(erro), tipo: erro?.tipo });
      });
    return () => { ativo = false; };
  }, [api]);

  useEffect(() => {
    if (!unidadeId) return;
    try { localStorage.setItem(CHAVE_UNIDADE, unidadeId); } catch { /* preferência opcional */ }
  }, [unidadeId]);

  // ─── Catálogo ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!unidadeId) { setCatalogo(null); return undefined; }
    let ativo = true;
    api.obterCatalogo(unidadeId)
      .then(payload => { if (ativo) setCatalogo(normalizarCatalogo(payload)); })
      .catch(() => { if (ativo) setCatalogo(null); });
    return () => { ativo = false; };
  }, [api, unidadeId]);

  useEffect(() => { setPagina(1); }, [unidadeId, periodo.inicio, periodo.fim, aba, params.indicador]);

  // ─── Lista e resumo ────────────────────────────────────────────────────────
  const carregarConsulta = useCallback(async (paginaAlvo = 1, acumular = false) => {
    if (!unidadeId || !periodoValido(periodo) || registroId) return;
    const requisicao = ++geracao.current;
    // Troca de unidade/período limpa imediatamente: nenhum valor do contexto
    // anterior sobrevive ao carregamento, nem por resposta atrasada.
    setConsulta(anterior => ({
      itens: acumular ? anterior.itens : null,
      resumo: acumular ? anterior.resumo : null,
      resumoBloqueado: acumular ? anterior.resumoBloqueado : false,
      carregando: true, erro: null, tipo: null,
      proximaPagina: acumular ? anterior.proximaPagina : null,
    }));
    const filtros = { unidade: unidadeId, inicio: periodo.inicio, fim: periodo.fim, aba, indicador: params.indicador, pagina: paginaAlvo, tamanho: TAMANHO_PAGINA };
    try {
      const lista = await api.listarRegistros(filtros);
      // Totais só existem para quem tem capacidade de consolidação; sem ela a
      // lista continua útil e nenhum total é inventado.
      let resumo = null;
      let resumoBloqueado = false;
      if (aba === 'confirmados' && podeConsolidar(unidade)) {
        try {
          resumo = adaptarResumo(await api.obterResumo(filtros));
        } catch (erro) {
          if (erro?.tipo === 'papel_insuficiente' || erro?.tipo === 'nao_autorizado') resumoBloqueado = true;
          else throw erro;
        }
      } else if (aba === 'confirmados') {
        resumoBloqueado = true;
      }
      if (requisicao !== geracao.current) return;
      const itens = (lista?.itens || []).map(item => normalizarRegistro(item, { aba, usuario }));
      setConsulta(anterior => ({
        itens: acumular ? [...(anterior.itens || []), ...itens] : itens,
        resumo, resumoBloqueado, carregando: false, erro: null, tipo: null,
        proximaPagina: lista?.proxima_pagina || null,
      }));
    } catch (erro) {
      if (requisicao !== geracao.current) return;
      setConsulta({ itens: null, resumo: null, resumoBloqueado: false, carregando: false, erro: mensagemDoErro(erro), tipo: erro?.tipo, proximaPagina: null });
    }
  }, [api, unidadeId, unidade, periodo.inicio, periodo.fim, aba, params.indicador, registroId, usuario]);

  useEffect(() => { void carregarConsulta(1, false); }, [carregarConsulta]);

  // ─── Detalhe ───────────────────────────────────────────────────────────────
  const carregarDetalhe = useCallback(async () => {
    if (!registroId) { setDetalhe({ registro: null, carregando: false, erro: null, tipo: null }); return; }
    const requisicao = ++geracao.current;
    setDetalhe({ registro: null, carregando: true, erro: null, tipo: null });
    try {
      const payload = await api.obterRegistro(registroId);
      if (requisicao === geracao.current) {
        setDetalhe({ registro: normalizarRegistro(payload, { aba: 'historico', usuario }), carregando: false, erro: null, tipo: null });
      }
    } catch (erro) {
      // 403 nunca renderiza o que já estava carregado.
      if (requisicao === geracao.current) setDetalhe({ registro: null, carregando: false, erro: mensagemDoErro(erro), tipo: erro?.tipo });
    }
  }, [api, registroId, usuario]);

  useEffect(() => { void carregarDetalhe(); }, [carregarDetalhe]);

  async function executar(nome, operacao, mensagemSucesso) {
    if (acao.salvando) return; // Duplo clique não vira segunda gravação.
    setAcao({ salvando: true, erro: null, aviso: null });
    try {
      await operacao();
      setAcao({ salvando: false, erro: null, aviso: null });
      setAnuncio(mensagemSucesso);
      await carregarDetalhe();
      await carregarConsulta(1, false);
    } catch (erro) {
      const tipo = erro?.tipo;
      const duplicado = erro?.detalhe?.registro_id;
      setAcao({
        salvando: false,
        erro: mensagemDoErro(erro),
        aviso: tipo === 'versao_desatualizada'
          ? 'Recarregue o registro e compare os valores antes de reenviar. Sua proposta continua nesta tela.'
          : tipo === 'duplicidade'
            ? `Veja o registro existente${duplicado ? '' : ''} e, se estiver autorizado, inicie uma correção. Somar os dois valores não é uma opção.`
            : tipo === 'campos_invalidos' && erro?.codigo === 'campos_pendentes'
              ? 'Complete os campos pendentes antes de confirmar.'
              : null,
      });
      if (tipo === 'nao_autorizado') setDetalhe({ registro: null, carregando: false, erro: mensagemDoErro(erro), tipo });
      void nome;
    }
  }

  const registro = detalhe.registro;
  const mutacao = (acaoNome, metodo) => dados => executar(
    acaoNome,
    () => api[metodo](registroId, dados, registro?.versao_esperada, chaveIdempotencia(acaoNome, registroId, registro?.versao_esperada)),
    {
      confirmar: 'Registro confirmado.',
      salvarRascunho: 'Rascunho salvo.',
      rejeitar: 'Rascunho rejeitado.',
      corrigir: 'Correção enviada para confirmação.',
      cancelar: 'Registro cancelado.',
    }[metodo],
  );

  function registrarComClara() {
    if (!unidade) return;
    onOpenClara?.('', {
      intencao: 'registro_local',
      unidade: { id: unidade.id, nome: unidade.nome, cnes: unidade.cnes, ibge6: unidade.ibge6 },
      rota_retorno: '/registros-unidade',
    }, { origem: 'registros-unidade', unidade: unidade.nome });
  }

  // ─── Render ────────────────────────────────────────────────────────────────
  const cabecalho = (
    <header className="rl-header">
      <div>
        <h1>Registros da unidade</h1>
        <p>Informações declaradas pelos profissionais das unidades. Não são dados oficiais do DataSUS e não alteram indicadores ou previsões.</p>
      </div>
      {unidade && podeRegistrar(unidade) && (
        <button type="button" className="rl-botao-primario" onClick={registrarComClara}>Registrar com a Clara</button>
      )}
    </header>
  );

  if (unidades.carregando) return <div className="rise">{cabecalho}<SkeletonRegistros /></div>;

  if (unidades.erro) {
    const indisponivel = unidades.tipo === 'indisponivel';
    return (
      <div className="rise">
        {cabecalho}
        <EstadoLocal
          tom="erro"
          titulo={indisponivel ? 'Os registros da unidade ainda não estão disponíveis.' : 'Não foi possível carregar os registros.'}
          descricao={indisponivel
            ? 'A integração com o serviço de registros locais ainda não está habilitada neste ambiente. Nenhuma confirmação é simulada aqui.'
            : unidades.erro}
          acao={!indisponivel && <button type="button" className="rl-botao" onClick={() => window.location.reload()}>Tentar novamente</button>}
        />
      </div>
    );
  }

  if (!unidades.lista?.length) {
    return (
      <div className="rise">
        {cabecalho}
        <EstadoLocal
          titulo="Nenhuma unidade vinculada ao seu acesso."
          descricao="Fale com o administrador da implantação para receber vínculo com uma unidade de saúde."
        />
      </div>
    );
  }

  return (
    <div className="rise">
      {demonstracao && <p className="rl-demo-flag"><span aria-hidden="true">●</span> Demonstração — dados fictícios, sem integração com o serviço</p>}
      {cabecalho}
      <p aria-live="polite" className="sr-only">{anuncio}</p>

      {registroId ? (
        detalhe.carregando ? <SkeletonRegistros />
          : detalhe.erro ? (
            <EstadoLocal
              tom="erro"
              titulo={detalhe.tipo === 'nao_autorizado' ? 'Acesso indisponível'
                : detalhe.tipo === 'nao_encontrado' ? 'Registro não encontrado.'
                  : detalhe.tipo === 'indisponivel' ? 'Os registros da unidade ainda não estão disponíveis.'
                    : 'Não foi possível carregar os registros.'}
              descricao={detalhe.erro}
              acao={<button type="button" className="rl-botao" onClick={() => atualizarRota({ registroId: null })}>Voltar aos registros</button>}
            />
          ) : (
            <DetalheRegistro
              registro={registro}
              catalogo={catalogo}
              salvando={acao.salvando}
              aviso={acao.aviso}
              erroAcao={acao.erro}
              onVoltar={() => atualizarRota({ registroId: null })}
              onConfirmar={mutacao('confirmar', 'confirmar')}
              onSalvarRascunho={mutacao('editar', 'salvarRascunho')}
              onRejeitar={mutacao('rejeitar', 'rejeitar')}
              onCorrigir={mutacao('corrigir', 'corrigir')}
              onCancelar={mutacao('cancelar', 'cancelar')}
            />
          )
      ) : (
        <>
          <ContextoUnidade
            unidades={unidades.lista}
            unidadeId={unidadeId}
            onUnidade={valor => atualizarRota({ params: { unidade: valor } })}
            periodo={periodo}
            onPeriodo={valor => atualizarRota({ params: { inicio: valor.inicio, fim: valor.fim, atalho: valor.atalho } })}
          />

          {!unidadeId ? (
            <EstadoLocal titulo="Selecione uma unidade" descricao="Você tem acesso a mais de uma unidade. Escolha qual deseja consultar." />
          ) : (
            <>
              <AbasRegistros aba={aba} onAba={valor => atualizarRota({ params: { aba: valor } })} pendentes={aba === 'pendentes' ? consulta.itens?.length : null} />
              <div id="rl-painel" role="tabpanel" aria-labelledby={`rl-aba-${aba}`} tabIndex={0}>
                {catalogo?.indicadores?.length > 0 && (
                  <label className="rl-campo" style={{ marginBottom: 16 }}>
                    <span className="eyebrow">Indicador</span>
                    <select value={params.indicador || ''} onChange={evento => atualizarRota({ params: { indicador: evento.target.value || null } })}>
                      <option value="">Todos</option>
                      {catalogo.indicadores.map(item => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}
                    </select>
                  </label>
                )}

                {consulta.carregando && !consulta.itens ? <SkeletonRegistros />
                  : consulta.erro ? (
                    <EstadoLocal
                      tom="erro"
                      titulo={consulta.tipo === 'indisponivel' ? 'Os registros da unidade ainda não estão disponíveis.'
                        : consulta.tipo === 'nao_autorizado' ? 'Acesso indisponível'
                          : 'Não foi possível carregar os registros.'}
                      descricao={consulta.erro}
                      acao={<button type="button" className="rl-botao" onClick={() => void carregarConsulta(1, false)}>Tentar novamente</button>}
                    />
                  ) : !consulta.itens?.length ? (
                    <EstadoLocal
                      titulo={
                        params.indicador ? 'Nenhum registro encontrado com estes filtros.'
                          : aba === 'pendentes' ? 'Nenhum registro aguardando revisão.'
                            : aba === 'historico' ? 'Nenhum registro neste período.'
                              : 'Ainda não há registros confirmados neste período.'
                      }
                      descricao={aba === 'confirmados' && !params.indicador ? 'Você pode registrar o fechamento da unidade conversando com a Clara.' : null}
                      acao={params.indicador
                        ? <button type="button" className="rl-botao" onClick={() => atualizarRota({ params: { indicador: null, status: null } })}>Limpar filtros</button>
                        : aba === 'confirmados' && podeRegistrar(unidade)
                          ? <button type="button" className="rl-botao" onClick={registrarComClara}>Registrar com a Clara</button>
                          : null}
                    />
                  ) : (
                    <>
                      {aba === 'confirmados' && <ResumoConfirmado grupos={consulta.resumo} />}
                      {aba === 'confirmados' && consulta.resumoBloqueado && (
                        <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--ink-500)', marginBottom: 14 }}>
                          Os totais consolidados da unidade só aparecem para quem tem papel de gestão nela. A lista abaixo mostra cada registro confirmado.
                        </p>
                      )}
                      <ListaRegistros
                        itens={consulta.itens}
                        aba={aba}
                        proximaPagina={consulta.proximaPagina}
                        carregandoMais={consulta.carregando}
                        onCarregarMais={() => {
                          const proxima = consulta.proximaPagina;
                          setPagina(proxima);
                          void carregarConsulta(proxima, true);
                        }}
                        onAbrir={id => atualizarRota({ registroId: id })}
                      />
                      {pagina > 1 && <span className="sr-only">Página {pagina} carregada.</span>}
                    </>
                  )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
