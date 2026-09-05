import { MIcon } from '../shared/ui.jsx';

export const BETA_VARIANTS = [
  { id: 'v1', name: 'Céu', detail: 'Azul aberto, superfícies leves e o menu lateral que você já conhece.', layout: 'Menu lateral', colors: ['#c9e6f5', '#236493', '#f4faff'] },
  { id: 'v2', name: 'Aurora', detail: 'Pêssego e terracota, com as áreas do sistema em abas no topo.', layout: 'Abas superiores', colors: ['#f4daca', '#964528', '#fff9f2'] },
  { id: 'v3', name: 'Jardim', detail: 'Verde fresco e navegação compacta para dar mais espaço ao conteúdo.', layout: 'Menu compacto', colors: ['#cee9d4', '#286443', '#f5fbf3'] },
];

export function readBetaVariant() {
  try {
    const saved = localStorage.getItem('sus_predict_beta_variant');
    return BETA_VARIANTS.some(v => v.id === saved) ? saved : 'v1';
  } catch { return 'v1'; }
}

export function BetaVariantSettings({ value, onChange }) {
  return <section className="beta-variants" aria-labelledby="beta-variants-title">
    <div className="beta-variants-heading">
      <span className="beta-mark">LABORATÓRIO BETA</span>
      <h2 id="beta-variants-title">Um jeito novo de olhar os dados.</h2>
      <p>Escolha uma versão para experimentar. Você pode trocar quando quiser.</p>
    </div>
    <div className="beta-variant-options" role="group" aria-label="Versões da interface beta">
      {BETA_VARIANTS.map(variant => <button key={variant.id} type="button"
        className={`beta-variant-option beta-preview-${variant.id}`}
        aria-pressed={value === variant.id} onClick={() => onChange(variant.id)}
        style={{ '--preview-canvas': variant.colors[0], '--preview-accent': variant.colors[1], '--preview-paper': variant.colors[2] }}>
        <span className="beta-preview" aria-hidden="true">
          <span className="beta-preview-nav"><i /><i /><i /></span>
          <span className="beta-preview-content"><span /><span /><span /></span>
        </span>
        <span className="beta-option-title"><strong>Beta {variant.id} · {variant.name}</strong><MIcon m={value === variant.id ? 'check_circle' : 'radio_button_unchecked'} size={20} /></span>
        <span className="beta-option-detail">{variant.detail}</span>
        <span className="beta-option-layout">{variant.layout}</span>
      </button>)}
    </div>
    <p className="beta-variant-note" role="status">Beta {value} selecionada · Preferência salva neste navegador. A interface original permanece igual.</p>
  </section>;
}

const items = [
  ['visao-geral', 'Visão Geral', 'grid_view'], ['alertas', 'Alertas', 'notifications'],
  ['insumos', 'Insumos', 'medication'], ['epidemiologia', 'Epidemiologia', 'coronavirus'],
  ['internacoes', 'Internações', 'bed'], ['vacinacao', 'Vacinação', 'vaccines'],
  ['documentos', 'Documentos', 'description'], ['configuracoes', 'Configurações', 'settings'], ['perfil', 'Perfil', 'person'],
];

export function BetaTopNav({ current, onNavigate }) {
  return <nav className="beta-top-nav" aria-label="Áreas do sistema beta">
    {items.map(([id, label, icon]) => <button key={id} type="button" aria-current={current === id ? 'page' : undefined} onClick={() => onNavigate(id)}>
      <MIcon m={icon} size={17} /><span>{label}</span>
    </button>)}
  </nav>;
}
