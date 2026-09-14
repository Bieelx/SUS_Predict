import { useCallback, useEffect, useState } from 'react';

import { authenticatedFetch } from '../shared/auth.js';
import { Card, MIcon } from '../shared/ui.jsx';
import { normalizarMetricasClara, percentualMetrica } from './claraMetricas.js';
import './clara-metricas.css';


function Sinal({ rotulo, valor, detalhe, tom = 'neutro' }) {
  return (
    <div className={`cm-sinal cm-sinal--${tom}`}>
      <strong>{Number(valor || 0).toLocaleString('pt-BR')}</strong>
      <span>{rotulo}</span>
      <small>{detalhe}</small>
    </div>
  );
}


function Meta({ rotulo, valor, meta, aprovada, detalhe }) {
  return (
    <div className="cm-meta">
      <div>
        <span>{rotulo}</span>
        <small>{detalhe}</small>
      </div>
      <strong>{valor}</strong>
      <span className={`cm-estado ${aprovada ? 'cm-estado--ok' : 'cm-estado--atencao'}`}>
        {aprovada ? <><MIcon m="check" size={14} /> Meta {meta}</> : <>Meta {meta}</>}
      </span>
    </div>
  );
}


export default function ClaraMetricas() {
  const [estado, setEstado] = useState({ carregando: true, erro: '', dados: null });

  const carregar = useCallback(async () => {
    setEstado(anterior => ({ ...anterior, carregando: true, erro: '' }));
    try {
      const resposta = await authenticatedFetch('/api/susbot/metricas-uso');
      if (!resposta.ok) throw new Error('Não foi possível consultar as métricas da Clara.');
      setEstado({ carregando: false, erro: '', dados: normalizarMetricasClara(await resposta.json()) });
    } catch (erro) {
      setEstado({ carregando: false, erro: erro?.message || 'Métricas indisponíveis.', dados: null });
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  if (estado.carregando) {
    return <Card className="cm-card" aria-busy="true"><p className="cm-feedback">Lendo sinais de confiabilidade da Clara…</p></Card>;
  }
  if (estado.erro) {
    return (
      <Card className="cm-card">
        <div className="cm-feedback cm-feedback--erro" role="alert">
          <span>{estado.erro}</span><button type="button" onClick={carregar}>Tentar de novo</button>
        </div>
      </Card>
    );
  }

  const dados = estado.dados;
  const avaliacao = dados.avaliacao;
  return (
    <Card className="cm-card">
      <header className="cm-cabecalho">
        <div>
          <h2>Confiabilidade da Clara</h2>
          <p>Contagens anônimas do processo atual e o último gabarito automatizado.</p>
        </div>
        <button type="button" className="cm-atualizar" onClick={carregar} aria-label="Atualizar métricas da Clara">
          <MIcon m="refresh" size={18} /> Atualizar
        </button>
      </header>

      <div className="cm-faixa">
        <div className="cm-volume">
          <strong>{dados.total.toLocaleString('pt-BR')}</strong>
          <span>respostas observadas desde que a API iniciou</span>
        </div>
        <div className="cm-economia">
          <span>Resolvidas sem LLM</span>
          <strong>{percentualMetrica(dados.semLlm)}</strong>
          <div className="cm-barra" aria-hidden="true"><span style={{ width: percentualMetrica(dados.semLlm) }} /></div>
        </div>
      </div>

      <section aria-labelledby="cm-runtime-title">
        <h3 id="cm-runtime-title">Barreiras em produção</h3>
        <div className="cm-sinais">
          <Sinal rotulo="Escritas bloqueadas" valor={dados.bloqueadas} detalhe="Aguardaram confirmação humana" tom="seguro" />
          <Sinal rotulo="Fallbacks de modelo" valor={dados.fallbacks} detalhe="Trocas após falha do provedor" tom={dados.fallbacks ? 'atencao' : 'neutro'} />
          <Sinal rotulo="Templates seguros" valor={dados.templates} detalhe="Substituíram resposta indisponível" />
          <Sinal rotulo="Divergências barradas" valor={dados.fidelidade} detalhe="Número do LLM não constava na fonte" tom="seguro" />
        </div>
      </section>

      <section className="cm-baseline" aria-labelledby="cm-baseline-title">
        <div className="cm-secao-titulo">
          <div>
            <h3 id="cm-baseline-title">Avaliação offline</h3>
            <p>Baseline de {avaliacao.data ? new Date(`${avaliacao.data}T12:00:00`).toLocaleDateString('pt-BR') : 'data indisponível'}; não representa acerto das conversas reais.</p>
          </div>
          <span>{avaliacao.casosFerramenta + avaliacao.casosJson} verificações</span>
        </div>
        <div className="cm-metas">
          <Meta rotulo="Escolha da ferramenta" valor={percentualMetrica(avaliacao.acertoFerramenta)} meta="≥ 98%" aprovada={avaliacao.acertoFerramenta >= 0.98} detalhe={`${avaliacao.casosFerramenta} formulações com gabarito`} />
          <Meta rotulo="JSON normalizado" valor={percentualMetrica(avaliacao.jsonValido)} meta="≥ 99%" aprovada={avaliacao.jsonValido >= 0.99} detalhe={`${avaliacao.casosJson} variações estruturais`} />
          <Meta rotulo="Escrita sem confirmação" valor={avaliacao.escritasSemConfirmacao.toLocaleString('pt-BR')} meta="0" aprovada={avaliacao.escritasSemConfirmacao === 0} detalhe="Ferramentas com efeito" />
          <Meta rotulo="Número divergente aceito" valor={avaliacao.numerosDivergentes.toLocaleString('pt-BR')} meta="0" aprovada={avaliacao.numerosDivergentes === 0} detalhe="Comparação com a fonte" />
        </div>
      </section>

      <footer className="cm-rodape">
        <MIcon m="privacy_tip" size={17} />
        <span>Não são armazenados pergunta, resposta, usuário ou município. As contagens reiniciam com a API.</span>
      </footer>
    </Card>
  );
}
