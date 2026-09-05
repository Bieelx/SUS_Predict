import { Card } from '../shared/ui.jsx';

// ─── Page: Configurações ───────────────────────────────────────────────────────
//
// Reduzida ao que tem lastro real: ambiente (fonte de dados), município em
// análise (vem do seletor da topbar, alimentado por ibge_sp) e o "Sobre".
// Fonte de estoque, usuários responsáveis e limites de alerta saíram: eram
// listas fixas no código sem tabela correspondente no Supabase nem efeito real.

function SettingRow({ title, desc, children, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: last ? 'none' : '1px solid #EFEBE0' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', marginBottom: 2 }}>{title}</p>
        {desc && <p style={{ fontSize: 12, color: 'var(--ink-400)', lineHeight: 1.4 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function CardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 700, color: '#1A1814' }}>{title}</h2>
      {hint && <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-300)' }}>{hint}</span>}
    </div>
  );
}

export default function PageConfiguracoes({ municipio }) {
  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Origem das informações e município em análise.</p>
      </div>

      <Card className="p-5" style={{ marginBottom: 20, border: '1px solid var(--ink-100)' }}>
        <CardHead title="Ambiente" hint="transparência" />
        <SettingRow
          title="Fonte de dados: Supabase"
          desc="Os painéis analíticos consultam tabelas curadas do Supabase. A disponibilidade de cada consulta é indicada na própria tela. A Clara também pode consultar registros locais, que são uma fonte separada."
          last
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 99,
            fontSize: 12, fontWeight: 700, color: 'var(--good)',
            background: 'color-mix(in srgb, var(--good) 14%, white)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            FONTE CONFIGURADA
          </span>
        </SettingRow>
      </Card>

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        <Card className="p-5">
          <CardHead title="Município em análise" hint={`${municipio.nome} · ${municipio.uf}`} />
          <p style={{ fontSize: 13, color: '#6B665D', lineHeight: 1.6 }}>
            A troca de município é feita pelo seletor da barra superior, disponível em qualquer tela. A lista vem da dimensão IBGE de São Paulo no Supabase (código {municipio.ibge7 || municipio.ibge6}).
          </p>
        </Card>

        <Card className="p-5">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
            <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 700, color: '#1A1814' }}>Sobre o SusPredict</h2>
          </div>
          <p style={{ fontSize: 13, color: '#6B665D', lineHeight: 1.6, marginBottom: 14 }}>
            Projeto acadêmico (TCC FIAP 2026). Inteligência preditiva para a Saúde Pública sobre dados públicos do DATASUS.
          </p>
          <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-300)', marginBottom: 8 }}>Equipe</p>
          <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 13, color: '#3D3A33' }}>
            {['Ariadine Amaral', 'Gabriel Araujo', 'Nilton Mikael', 'Vinicius Mascarenhas', 'Yasmin Cristino Miguez'].map(n => <span key={n}>{n}</span>)}
          </div>
        </Card>
      </div>
    </div>
  );
}
