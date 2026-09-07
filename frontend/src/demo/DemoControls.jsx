import { MIcon } from '../shared/ui.jsx';
import { TRANSPARENCIA } from './adapter.js';
import './demo.css';

export default function DemoControls({ replay, cortes, onCorte, onSair, onReset, onEtp }) {
  const indice = cortes.indexOf(replay.cutoff);
  return <section className="demo-controls" aria-label="Demonstração histórica">
    <div className="demo-controls__row">
      <strong><MIcon m="history" size={18} /> Demo histórica · Campinas 2024</strong>
      <div className="demo-controls__actions">
        <button type="button" aria-label="Mês anterior da demonstração" disabled={indice === 0} onClick={() => onCorte(cortes[indice - 1])}><MIcon m="chevron_left" size={18} /></button>
        <label><span className="sr-only">Mês da demonstração</span><select aria-label="Mês da demonstração" value={replay.cutoff} onChange={event => onCorte(event.target.value)}>{cortes.map(mes => <option key={mes} value={mes}>{new Date(`${mes}-15T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>)}</select></label>
        <button type="button" aria-label="Próximo mês da demonstração" disabled={indice === cortes.length - 1} onClick={() => onCorte(cortes[indice + 1])}><MIcon m="chevron_right" size={18} /></button>
        <button type="button" onClick={onSair}>Sair da demo</button>
      </div>
    </div>
    <p>{TRANSPARENCIA}</p>
    <details><summary>Roteiro e premissas</summary><p>Avance de janeiro a maio: acompanhe a alta dos casos, os alertas e o consumo do estoque fictício. As projeções usam apenas os meses até o corte escolhido. SIH, risco regional e mapa não fazem parte deste cenário.</p><p>Fonte: {replay.meta.fonte} <a href={replay.meta.fonte_url} target="_blank" rel="noreferrer">Consultar fonte histórica</a></p><div className="demo-controls__actions"><button type="button" onClick={onReset}>Reiniciar demonstração</button><button type="button" onClick={onEtp}>Preparar rascunho de ETP demo</button></div></details>
  </section>;
}
