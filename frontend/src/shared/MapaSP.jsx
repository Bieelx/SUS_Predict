import { useEffect, useMemo, useRef, useState } from 'react';

// ─── Mapa coroplético dos 645 municípios de São Paulo ─────────────────────────
//
// Substitui o scatter "doses × incidência", que empilhava os 645 municípios
// contra o eixo Y (distribuição long-tail: um município com 14 mil doses achatava
// todos os outros) para responder uma pergunta que o próprio rodapé desautorizava.
//
// ponytail: sem biblioteca de mapa e sem d3-geo. Um estado só, nesta latitude,
// projeta bem com equirretangular corrigida por cos(lat) — o resto é gerar
// `<path d>` e deixar o SVG do navegador desenhar. Uma lib de mapa aqui seria
// 300KB para substituir as ~20 linhas de projeção abaixo.
//
// A malha vem de `public/geo/sp-municipios.json`, gerada da API de malhas do IBGE
// (estado 35, intrarregião município, qualidade mínima) com coordenadas
// arredondadas para 4 casas (~11m) — 272KB, ~67KB no gzip. `properties.id` é o
// código IBGE de 6 dígitos, o mesmo que o backend usa em `cod_ibge_municipio`.
//
// Formato esperado em `dados`:
//   { ibge6, nome, valor, metricas: [{ rotulo, valor }], nota }
// `valor` decide a cor; `metricas` é o que o usuário lê primeiro (números
// absolutos); `nota` é a linha secundária, normalizada.

const MALHA_URL = '/geo/sp-municipios.json';
const LAT_MEDIA = -22.5;                         // centro aproximado de SP
const FATOR_LON = Math.cos((LAT_MEDIA * Math.PI) / 180);
const LARGURA = 1000;                            // unidades do viewBox

// A malha é a mesma para todas as telas e nunca muda: uma requisição por sessão,
// compartilhada entre montagens do componente.
let malhaCache = null;
let malhaPromise = null;

function carregarMalha() {
  if (malhaCache) return Promise.resolve(malhaCache);
  if (!malhaPromise) {
    malhaPromise = fetch(MALHA_URL)
      .then((r) => {
        if (!r.ok) throw new Error('Não foi possível carregar o mapa de São Paulo.');
        return r.json();
      })
      .then((geo) => { malhaCache = geo; return geo; })
      .catch((e) => { malhaPromise = null; throw e; });
  }
  return malhaPromise;
}

// Converte a FeatureCollection em `{ id, d }` — uma vez por carga da malha, não a
// cada render nem a cada troca de período.
function construirTracados(geo) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const projetar = ([lon, lat]) => {
    const x = lon * FATOR_LON;
    const y = -lat;                              // latitude cresce para o norte, o SVG para baixo
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    return [x, y];
  };

  const brutos = geo.features.map((f) => {
    const poligonos = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    return { id: f.properties.id, aneis: poligonos.flatMap((p) => p.map((anel) => anel.map(projetar))) };
  });

  // Só agora a bbox está completa: escala tudo para a largura do viewBox.
  const escala = LARGURA / (maxX - minX);
  const paraTela = ([x, y]) => `${((x - minX) * escala).toFixed(1)},${((y - minY) * escala).toFixed(1)}`;

  return {
    altura: (maxY - minY) * escala,
    tracados: brutos.map(({ id, aneis }) => ({
      id,
      d: aneis.map((anel) => `M${anel.map(paraTela).join('L')}Z`).join(''),
    })),
  };
}

// Escala sequencial por quantis, não linear: incidência de dengue é assimétrica,
// e uma escala linear jogaria 90% dos municípios na primeira cor por causa de dois
// surtos. Quantis garantem que cada tom carregue mais ou menos o mesmo número de
// municípios — o mapa mostra posição relativa, que é o que se pode afirmar aqui.
const OPACIDADES = [0.14, 0.32, 0.5, 0.72, 1];

function construirEscala(valores) {
  const ordenados = valores.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!ordenados.length) return { cortes: [], faixa: () => 0 };
  const cortes = [0.2, 0.4, 0.6, 0.8].map((q) => ordenados[Math.floor(q * (ordenados.length - 1))]);
  return {
    cortes,
    minimo: ordenados[0],
    maximo: ordenados[ordenados.length - 1],
    faixa: (v) => cortes.reduce((nivel, corte) => (v > corte ? nivel + 1 : nivel), 0),
  };
}

// Busca sem acento e sem caixa: "sao jose" acha "São José dos Campos".
const normalizar = (texto) =>
  String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export default function MapaSP({ dados, formatarValor, rotuloValor, alturaMax = 460 }) {
  const [geo, setGeo] = useState(malhaCache);
  const [erro, setErro] = useState('');
  const [sobre, setSobre] = useState(null);      // { id, x, y } — município sob o cursor
  const [selecionado, setSelecionado] = useState(null);
  const [busca, setBusca] = useState('');
  const wrapRef = useRef(null);

  useEffect(() => {
    if (geo) return;
    let vivo = true;
    carregarMalha().then((g) => vivo && setGeo(g)).catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [geo]);

  const { tracados, altura } = useMemo(
    () => (geo ? construirTracados(geo) : { tracados: [], altura: 0 }),
    [geo],
  );

  // Índice por código IBGE: o mapa tem 645 municípios sempre, os dados podem ter
  // menos. Município sem linha correspondente fica cinza — "sem registro" não é
  // zero, e é uma das limitações que a própria tela declara.
  const porIbge = useMemo(() => {
    const indice = new Map();
    for (const item of dados) if (item.ibge6) indice.set(String(item.ibge6), item);
    return indice;
  }, [dados]);

  const escala = useMemo(() => construirEscala(dados.map((d) => d.valor)), [dados]);

  // A lista é um localizador, não um ranking: ordem alfabética é o que deixa
  // achar um município conhecido rápido. O ranking por doses já está na tabela
  // "Ver dados" logo abaixo.
  const lista = useMemo(() => {
    const alvo = normalizar(busca);
    return [...dados]
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'))
      .filter((m) => !alvo || normalizar(m.nome).includes(alvo));
  }, [dados, busca]);

  if (erro) return <p style={{ ...aviso, color: 'var(--warn)' }}>{erro}</p>;
  if (!geo) return <p style={aviso}>Carregando o mapa de São Paulo…</p>;

  const destacado = selecionado || sobre?.id || null;
  const itemSobre = sobre ? porIbge.get(sobre.id) : null;
  const itemSelecionado = selecionado ? porIbge.get(selecionado) : null;

  return (
    <div className="mapa-sp" style={layout}>
      {/* Mapa */}
      <div ref={wrapRef} style={{ position: 'relative', minWidth: 0 }} onMouseLeave={() => setSobre(null)}>
        <svg
          viewBox={`0 0 ${LARGURA} ${altura}`}
          style={{ width: '100%', maxHeight: alturaMax, display: 'block' }}
          role="img"
          aria-label={`Mapa dos 645 municípios de São Paulo, coloridos por ${rotuloValor.toLowerCase()}. Os valores estão na lista ao lado e na tabela abaixo.`}
        >
          {tracados.map(({ id, d }) => {
            const registro = porIbge.get(id);
            const temDado = registro && Number.isFinite(registro.valor);
            const ativo = destacado === id;
            return (
              <path
                key={id}
                d={d}
                fill={temDado ? 'var(--primary)' : 'var(--ink-100)'}
                fillOpacity={temDado ? OPACIDADES[escala.faixa(registro.valor)] : 1}
                stroke={ativo ? 'var(--ink-900)' : 'white'}
                strokeWidth={ativo ? 2 : 0.35}
                strokeLinejoin="round"
                style={{ cursor: registro ? 'pointer' : 'default' }}
                onMouseMove={(e) => {
                  const caixa = wrapRef.current.getBoundingClientRect();
                  setSobre({ id, x: e.clientX - caixa.left, y: e.clientY - caixa.top });
                }}
                onClick={() => setSelecionado(selecionado === id ? null : id)}
              />
            );
          })}
          {/* O município destacado é redesenhado por último para que o contorno
              escuro não fique escondido sob os vizinhos desenhados depois dele. */}
          {destacado && (() => {
            const traco = tracados.find((t) => t.id === destacado);
            return traco ? <path d={traco.d} fill="none" stroke="var(--ink-900)" strokeWidth={2} strokeLinejoin="round" pointerEvents="none" /> : null;
          })()}
        </svg>

        {sobre && (
          <div style={{ ...tooltip, left: Math.min(sobre.x + 14, 240), top: sobre.y + 14 }}>
            <strong>{itemSobre?.nome || 'Município sem registro'}</strong>
            {itemSobre
              ? <>
                  {itemSobre.metricas.map((m) => (
                    <span key={m.rotulo}><strong style={{ fontVariantNumeric: 'tabular-nums' }}>{m.valor}</strong> {m.rotulo}</span>
                  ))}
                  {itemSobre.nota && <span style={{ color: 'var(--ink-400)' }}>{itemSobre.nota}</span>}
                </>
              : <span style={{ color: 'var(--ink-400)' }}>Sem registro no período</span>}
          </div>
        )}

        <Legenda escala={escala} formatarValor={formatarValor} rotuloValor={rotuloValor} />
      </div>

      {/* Busca + lista */}
      <div style={painel}>
        <label style={{ display: 'block' }}>
          <span className="sr-only" style={rotuloOculto}>Buscar município</span>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar município…"
            style={campoBusca}
          />
        </label>

        {itemSelecionado && (
          <div style={selecionadoBox}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <strong style={{ fontSize: 13, lineHeight: 1.3 }}>{itemSelecionado.nome}</strong>
              <button onClick={() => setSelecionado(null)} style={limpar} aria-label="Limpar seleção">✕</button>
            </div>
            {itemSelecionado.metricas.map((m) => (
              <div key={m.rotulo} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
                <span style={{ color: 'var(--ink-400)' }}>{m.rotulo}</span>
                <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{m.valor}</strong>
              </div>
            ))}
            {itemSelecionado.nota && (
              <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-400)', lineHeight: 1.4 }}>{itemSelecionado.nota}</p>
            )}
          </div>
        )}

        <p style={{ margin: 0, fontSize: 11, color: 'var(--ink-400)' }}>
          {lista.length === dados.length ? `${dados.length} municípios` : `${lista.length} de ${dados.length}`}
        </p>

        <div style={rolagem} role="listbox" aria-label="Municípios">
          {lista.map((m) => {
            const ativo = destacado === m.ibge6;
            return (
              <button
                key={m.ibge6}
                role="option"
                aria-selected={selecionado === m.ibge6}
                onClick={() => setSelecionado(selecionado === m.ibge6 ? null : m.ibge6)}
                style={{ ...linhaLista, background: ativo ? 'var(--subtle)' : 'transparent', fontWeight: ativo ? 700 : 500 }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</span>
                <span style={{ color: 'var(--ink-400)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                  {m.metricas[0]?.valor}
                </span>
              </button>
            );
          })}
          {!lista.length && <p style={{ ...aviso, padding: '18px 0' }}>Nenhum município encontrado.</p>}
        </div>
      </div>
    </div>
  );
}

function Legenda({ escala, formatarValor, rotuloValor }) {
  if (!escala.cortes.length) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>{rotuloValor}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        {OPACIDADES.map((o, i) => (
          <span key={i} title={i === 0 ? `até ${formatarValor(escala.cortes[0])}` : `a partir de ${formatarValor(escala.cortes[i - 1])}`}
                style={{ width: 24, height: 11, background: 'var(--primary)', opacity: o, borderRadius: 2 }} />
        ))}
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-400)' }}>
        {formatarValor(escala.minimo)} → {formatarValor(escala.maximo)}
      </span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--ink-400)' }}>
        <span style={{ width: 11, height: 11, background: 'var(--ink-100)', borderRadius: 2 }} /> sem registro
      </span>
    </div>
  );
}

const layout = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 18, alignItems: 'start' };
const painel = { display: 'grid', gap: 10, alignContent: 'start' };
const campoBusca = {
  width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--ink-100)',
  background: 'white', fontSize: 12.5, color: 'var(--ink-900)', fontFamily: 'inherit',
};
const rotuloOculto = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' };
const selecionadoBox = {
  display: 'grid', gap: 6, padding: '11px 12px', borderRadius: 10,
  border: '1px solid var(--ink-100)', background: 'var(--subtle)',
};
const limpar = { border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink-400)', fontSize: 12, lineHeight: 1, padding: 2 };
const rolagem = { maxHeight: 330, overflowY: 'auto', display: 'grid', gap: 1, border: '1px solid var(--ink-100)', borderRadius: 10, padding: 4 };
const linhaLista = {
  display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center',
  padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 12, color: 'var(--ink-900)', textAlign: 'left', fontFamily: 'inherit', width: '100%',
};
const aviso = { fontSize: 12, color: 'var(--ink-400)', padding: '40px 0', textAlign: 'center' };
const tooltip = {
  position: 'absolute', pointerEvents: 'none', display: 'grid', gap: 3, padding: '9px 11px',
  background: 'white', border: '1px solid var(--ink-100)', borderRadius: 8, fontSize: 11,
  boxShadow: '0 4px 14px rgba(0,0,0,.1)', whiteSpace: 'nowrap', zIndex: 5,
};
