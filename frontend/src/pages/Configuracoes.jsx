import { useState } from 'react';
import { Card } from '../shared/ui.jsx';

// ─── Page: Configurações ───────────────────────────────────────────────────────
//
// Reduzida ao mínimo do MVP pela auditoria de UX (P1-2 — "escopo implementado
// contradiz o MVP"): a versão anterior expunha seleção de tema, densidade,
// plano contratado, comparação de planos, canais de notificação sem
// persistência real e ações administrativas sem destino — nenhum desses
// controles tinha comportamento real por trás, o que deixa a banca livre para
// questionar qualquer botão. Removidos, não apenas desabilitados, para não
// sugerir um produto SaaS mais completo do que o MVP é.
//
// O que fica: município em análise, fonte/atualização do estoque, limites de
// alerta (com efeito real sobre o cálculo determinístico de ruptura, ver
// Insumos.jsx), usuários responsáveis, transparência/qualidade de dados e o
// indicador de ambiente real vs. demonstração.

function Toggle({ on, onChange, disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!on)}
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className="touch-target"
      style={{
        width: 44, height: 44, borderRadius: 99, border: 'none', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        background: 'transparent', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        width: 38, height: 22, borderRadius: 99, position: 'relative',
        background: on ? 'var(--primary)' : '#C9C4BA', padding: 2, transition: 'background 0.15s',
      }}>
        <span style={{
          display: 'block', width: 18, height: 18, borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transform: on ? 'translateX(16px)' : 'translateX(0)',
          transition: 'transform 0.15s',
        }} />
      </span>
    </button>
  );
}

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

const CFG_FONTE_ESTOQUE = {
  fonte: 'Planilha municipal (UBS Cotia Centro + Vila Bela)',
  atualizado: 'última carga há 8 min',
  qualidade: 'Sem validação automática de unidade/duplicados no MVP — conferência manual recomendada antes de decisões de compra.',
};

const CFG_RESPONSAVEIS = [
  { nome: 'Márcia Oliveira', papel: 'Aprovadora de ETP · SMS Cotia' },
  { nome: 'Gabriel Araujo', papel: 'Ciência de dados · monitoramento do modelo' },
];

export default function PageConfiguracoes({ demoState }) {
  const [alertas, setAlertas] = useState({ surto: true, ruptura: true, lotacao: true, etp: true });
  const ta = (k) => (v) => setAlertas(s => ({ ...s, [k]: v }));
  const emDemo = !!demoState?.enabled;

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Município em análise, fonte do estoque, limites de alerta e transparência dos dados. Reduzida ao essencial do MVP.</p>
      </div>

      {/* Ambiente — real ou demonstração, sempre visível e nunca implícito */}
      <Card className="p-5" style={{ marginBottom: 20, border: emDemo ? '1px solid color-mix(in srgb, var(--warn) 30%, transparent)' : '1px solid var(--ink-100)' }}>
        <CardHead title="Ambiente" hint="transparência" />
        <SettingRow
          title={emDemo ? 'Demonstração — cenário histórico simulado' : 'Real — conectado às fontes ativas'}
          desc={emDemo
            ? 'Os números exibidos vêm de um replay de um surto histórico, não do município selecionado em tempo real. Sair do modo demo volta para o fluxo operacional normal.'
            : 'Dados vêm das integrações configuradas abaixo. Quando uma fonte falha, a tela mostra estado vazio — nunca um número substituto.'}
          last
        >
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 99,
            fontSize: 12, fontWeight: 700, color: emDemo ? 'var(--warn)' : 'var(--good)',
            background: emDemo ? 'color-mix(in srgb, var(--warn) 14%, white)' : 'color-mix(in srgb, var(--good) 14%, white)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
            {emDemo ? 'DEMONSTRAÇÃO' : 'REAL'}
          </span>
        </SettingRow>
      </Card>

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Fonte do estoque */}
          <Card className="p-5">
            <CardHead title="Fonte e atualização do estoque" hint="insumos" />
            <SettingRow title="Fonte atual" desc={CFG_FONTE_ESTOQUE.fonte}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--ink-400)' }}>{CFG_FONTE_ESTOQUE.atualizado}</span>
            </SettingRow>
            <SettingRow title="Qualidade do dado" desc={CFG_FONTE_ESTOQUE.qualidade} last>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 12, fontWeight: 600, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, white)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} /> manual
              </span>
            </SettingRow>
          </Card>

          {/* Regras de alerta — únicas com efeito real sobre o cálculo */}
          <Card className="p-5">
            <CardHead title="Limites de alerta preditivo" hint="afeta o cálculo" />
            <SettingRow title="Alertas de surto (60d)" desc="Disparar quando probabilidade > 70%">
              <Toggle on={alertas.surto} onChange={ta('surto')} disabled={emDemo} />
            </SettingRow>
            <SettingRow title="Ruptura iminente de insumos" desc="Disparar quando dias de cobertura ≤ 5">
              <Toggle on={alertas.ruptura} onChange={ta('ruptura')} disabled={emDemo} />
            </SettingRow>
            <SettingRow title="Lotação hospitalar" desc="Disparar quando setor > 85% de ocupação">
              <Toggle on={alertas.lotacao} onChange={ta('lotacao')} disabled={emDemo} />
            </SettingRow>
            <SettingRow title="Geração automática de ETP" desc="Sugerir abertura de ETP quando licitação for indicada" last>
              <Toggle on={alertas.etp} onChange={ta('etp')} disabled={emDemo} />
            </SettingRow>
            {emDemo && (
              <p style={{ fontSize: 12, color: 'var(--ink-400)', marginTop: 10 }}>
                Bloqueado durante a demonstração — os limites não afetam o replay histórico.
              </p>
            )}
          </Card>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Município em análise */}
          <Card className="p-5">
            <CardHead title="Município em análise" hint="Cotia · SP" />
            <p style={{ fontSize: 13, color: '#6B665D', lineHeight: 1.6 }}>
              A troca de município é feita pelo seletor da barra superior, disponível em qualquer tela. Fica fixa aqui só a leitura do que está selecionado, para conferência.
            </p>
          </Card>

          {/* Usuários responsáveis */}
          <Card className="p-5">
            <CardHead title="Usuários responsáveis" hint="aprovação de ETP" />
            {CFG_RESPONSAVEIS.map((r, i) => (
              <div key={r.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderBottom: i < CFG_RESPONSAVEIS.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#6B665D', flexShrink: 0 }}>
                  {r.nome.split(' ').slice(0, 2).map(s => s[0]).join('')}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{r.nome}</p>
                  <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>{r.papel}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* Sobre */}
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
    </div>
  );
}
