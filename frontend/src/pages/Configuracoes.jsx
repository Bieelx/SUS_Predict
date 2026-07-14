import { useState } from 'react';
import { Card, Badge, THEMES, useTheme } from '../shared/ui.jsx';

// ─── Page: Configurações ───────────────────────────────────────────────────────

function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
      style={{
        width: 38, height: 22, borderRadius: 99, border: 'none', cursor: 'pointer', flexShrink: 0,
        background: on ? 'var(--primary)' : '#C9C4BA', padding: 2, position: 'relative',
        transition: 'background 0.15s',
      }}
    >
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%', background: 'white',
        boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transform: on ? 'translateX(16px)' : 'translateX(0)',
        transition: 'transform 0.15s',
      }} />
    </button>
  );
}

function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: '#EFEBE0', borderRadius: 8, padding: 3, gap: 2 }}>
      {options.map(opt => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: active ? 600 : 500,
              color: active ? '#1A1814' : '#6B665D',
              background: active ? '#FFFFFF' : 'transparent',
              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.12s',
            }}
          >
            {opt.dot && <span style={{ width: 11, height: 11, borderRadius: '50%', background: opt.dot, flexShrink: 0 }} />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingRow({ title, desc, children, last }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: last ? 'none' : '1px solid #EFEBE0' }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', marginBottom: 2 }}>{title}</p>
        {desc && <p style={{ fontSize: 11.5, color: '#8A8579', lineHeight: 1.4 }}>{desc}</p>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function CardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>{title}</h2>
      {hint && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A8A39A' }}>{hint}</span>}
    </div>
  );
}

const CFG_INTEGRACOES = [
  { sigla: 'S', nome: 'SINAN — Sistema de Agravos',      sub: 'Sincronização diária às 04:00',         status: 'conectado', tempo: 'há 4 horas' },
  { sigla: 'S', nome: 'SIH/SUS — Hospitalares',          sub: 'Atualização mensal · competência 03/2026', status: 'conectado', tempo: 'há 12 dias' },
  { sigla: 'C', nome: 'CNES — Cadastro de Estabelecimentos', sub: 'Sincronização semanal',              status: 'conectado', tempo: 'há 2 dias' },
  { sigla: 'P', nome: 'PNI — Imunizações',               sub: 'Sincronização diária às 06:00',          status: 'atraso',    tempo: 'há 2 dias' },
  { sigla: 'E', nome: 'Estoque local (UBS)',             sub: 'API municipal · tempo real',             status: 'conectado', tempo: 'há 8 min' },
];

const CFG_ACOES = [
  { icon: 'person_add', label: 'Criar novos usuários' },
  { icon: 'cloud_download', label: 'Atualizar bases SUS' },
  { icon: 'group', label: 'Gerenciar usuários (12)' },
  { icon: 'history', label: 'Logs de auditoria' },
  { icon: 'support_agent', label: 'Falar com Suporte' },
];

export default function PageConfiguracoes() {
  const { themeId, setThemeId } = useTheme();
  const [densidade, setDensidade] = useState('confortavel');
  const [notif, setNotif] = useState({ email: true, sms: true, whatsapp: true, push: true });
  const [alertas, setAlertas] = useState({ surto: true, ruptura: true, lotacao: true, etp: true });

  const tn = (k) => (v) => setNotif(s => ({ ...s, [k]: v }));
  const ta = (k) => (v) => setAlertas(s => ({ ...s, [k]: v }));

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Configurações</h1>
        <p style={{ fontSize: 13, color: '#8A8579' }}>Preferências de notificação, regras de alerta, integrações e gestão de usuários da Secretaria.</p>
      </div>

      {/* Aparência — full width */}
      <Card className="p-5" style={{ marginBottom: 20 }}>
        <CardHead title="Aparência" hint="aplicado imediatamente" />
        <SettingRow title="Esquema de cores" desc="Define a sidebar e a cor primária (botões, links, gráficos e destaques) de uma vez">
          <Segmented value={themeId} onChange={setThemeId} options={
            Object.entries(THEMES).map(([id, t]) => ({ value: id, label: t.label, dot: t.dot }))
          } />
        </SettingRow>
        <SettingRow title="Densidade da interface" desc="Compacta exibe mais informação por tela" last>
          <Segmented value={densidade} onChange={setDensidade} options={[
            { value: 'confortavel', label: 'Confortável' }, { value: 'compacta', label: 'Compacta' },
          ]} />
        </SettingRow>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Notificações */}
          <Card className="p-5">
            <CardHead title="Notificações" hint="canais de entrega" />
            <SettingRow title="E-mail" desc="marcia.oliveira@cotia.sp.gov.br">
              <Toggle on={notif.email} onChange={tn('email')} />
            </SettingRow>
            <SettingRow title="SMS" desc="+55 (11) 9 9876-5432">
              <Toggle on={notif.sms} onChange={tn('sms')} />
            </SettingRow>
            <SettingRow title="WhatsApp Business" desc="Via SusBot · número verificado">
              <Toggle on={notif.whatsapp} onChange={tn('whatsapp')} />
            </SettingRow>
            <SettingRow title="Push no app" desc="Navegador + mobile" last>
              <Toggle on={notif.push} onChange={tn('push')} />
            </SettingRow>
          </Card>

          {/* Regras de alerta */}
          <Card className="p-5">
            <CardHead title="Regras de alerta preditivo" hint="limites de disparo" />
            <SettingRow title="Alertas de surto (60d)" desc="Disparar quando probabilidade > 70%">
              <Toggle on={alertas.surto} onChange={ta('surto')} />
            </SettingRow>
            <SettingRow title="Ruptura iminente de insumos" desc="Disparar quando dias de cobertura ≤ 5">
              <Toggle on={alertas.ruptura} onChange={ta('ruptura')} />
            </SettingRow>
            <SettingRow title="Lotação hospitalar" desc="Disparar quando setor > 85% de ocupação">
              <Toggle on={alertas.lotacao} onChange={ta('lotacao')} />
            </SettingRow>
            <SettingRow title="Geração automática de ETP" desc="Iniciar ETP quando licitação for indicada" last>
              <Toggle on={alertas.etp} onChange={ta('etp')} />
            </SettingRow>
          </Card>

          {/* Integrações */}
          <Card className="p-5">
            <CardHead title="Integrações ativas" hint="DATASUS + locais" />
            {CFG_INTEGRACOES.map((it, i) => {
              const ok = it.status === 'conectado';
              const c = ok ? '#2A6B40' : '#A6580F';
              return (
                <div key={it.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < CFG_INTEGRACOES.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#6B665D', flexShrink: 0 }}>{it.sigla}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{it.nome}</p>
                    <p style={{ fontSize: 11, color: '#8A8579' }}>{it.sub}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, color: c, background: c + '18' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
                      {it.status}
                    </span>
                    <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#A8A39A', marginTop: 3 }}>{it.tempo}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Plano */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Plano contratado</h2>
              <Badge label="SusPredict Pro" color="var(--primary)" />
            </div>
            {[
              { k: 'Mensalidade', v: 'R$ 5.400,00' },
              { k: 'UBSs cobertas', v: '8 / 10' },
              { k: 'Próxima renovação', v: '14 ago. 2026' },
            ].map(r => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
                <span style={{ color: '#6B665D' }}>{r.k}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 12.5 }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 14px', fontSize: 13 }}>
              <span style={{ color: '#6B665D' }}>Suporte dedicado</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2A6B40' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A6B40' }} /> ativo
              </span>
            </div>
            <button style={{ width: '100%', padding: '9px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: 'pointer' }}>Comparar planos</button>
          </Card>

          {/* Sobre */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Sobre o SusPredict</h2>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: '#A8A39A' }}>v1.0.4</span>
            </div>
            <p style={{ fontSize: 12.5, color: '#6B665D', lineHeight: 1.6, marginBottom: 14 }}>Inteligência preditiva para a Saúde Pública. Desenvolvido pela Startup One — FIAP 2026.</p>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8A39A', marginBottom: 8 }}>Equipe</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 12px', fontSize: 12, color: '#3D3A33', marginBottom: 14 }}>
              {['Ariadine Amaral', 'Gabriel Araujo', 'Nilton Mikael', 'Vinicius Mascarenhas', 'Yasmin Cristino Miguez'].map(n => <span key={n}>{n}</span>)}
            </div>
            <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#A8A39A', marginBottom: 6 }}>Em parceria</p>
            <p style={{ fontSize: 12, color: '#3D3A33', marginBottom: 14 }}>FIAP · Claro · DATASUS</p>
            <p style={{ fontSize: 10.5, color: '#A8A39A', paddingTop: 12, borderTop: '1px solid #EFEBE0' }}>LGPD em conformidade · Termos · Privacidade</p>
          </Card>

          {/* Ações administrativas */}
          <Card className="p-5">
            <CardHead title="Ações administrativas" hint="requer ADMIN" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {CFG_ACOES.map((a, i) => (
                <button key={a.label} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', border: 'none',
                  borderBottom: i < CFG_ACOES.length - 1 ? '1px solid #EFEBE0' : 'none',
                  background: 'none', cursor: 'pointer', textAlign: 'left', color: '#3D3A33',
                }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 19, color: '#6B665D' }}>{a.icon}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{a.label}</span>
                  <span className="material-symbols-rounded" style={{ fontSize: 18, color: '#C9C4BA' }}>chevron_right</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
