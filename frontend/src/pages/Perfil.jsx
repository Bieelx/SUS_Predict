import { useState, useEffect } from 'react';
import { Card, API_BASE } from '../shared/ui.jsx';

// CardHead não é exportado por shared/ui.jsx (é específico de Configurações/Perfil
// no protótipo original) — declarado localmente para não acoplar os dois módulos.
function LocalCardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>{title}</h2>
      {hint && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#A8A39A' }}>{hint}</span>}
    </div>
  );
}

// ─── Page: Perfil ──────────────────────────────────────────────────────────────

const PERFIL_ATIVIDADES = [
  { icon: 'check', cor: '#2A6B40', titulo: 'Aprovou ETP-2026-087',               tempo: 'há 2 horas' },
  { icon: 'error', cor: '#D94F4F', titulo: 'Visualizou Alerta AL-2026-0184',     tempo: 'há 3 horas' },
  { icon: 'edit',  cor: '#4A7FBF', titulo: 'Atualizou estoque UBS Cotia Centro', tempo: 'ontem, 16:20' },
  { icon: 'download', cor: '#6B665D', titulo: 'Exportou relatório de cobertura vacinal Q1', tempo: 'ontem, 11:08' },
  { icon: 'notifications', cor: '#8A8579', titulo: 'Configurou alerta de Hantavirose para Cotia', tempo: 'há 3 dias' },
];

const PERFIL_UBSS = [
  { nome: 'UBS Cotia Centro', leitos: '38 leitos · Cotia', status: 'crítico' },
  { nome: 'UBS Vila Bela',    leitos: '24 leitos · Cotia', status: 'crítico' },
];

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function PagePerfil({ onNavigate, onLogout }) {
  const [user, setUser] = useState(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sus_predict_token');
    if (!token || token === 'mock-token') { setCarregando(false); return; }
    fetch(`${API_BASE}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Falha ao carregar perfil.');
        return r.json();
      })
      .then(setUser)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const email = user?.email || 'marcia.oliveira@cotia.sp.gov.br';
  const nome = user?.user_metadata?.nome || email.split('@')[0];
  const iniciais = nome.split(/[.\s]+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || 'US';

  const perfilCadastro = [
    { k: 'E-mail institucional', v: email },
    { k: 'ID de usuário',        v: user?.id ? user.id.slice(0, 8) : '—' },
    { k: 'No SusPredict desde',  v: user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—' },
    { k: 'Último login',         v: fmtDataHora(user?.last_sign_in_at) },
  ];

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Perfil do Usuário</h1>
        <p style={{ fontSize: 13, color: '#8A8579' }}>Suas informações, permissões e histórico de atividades no SusPredict.</p>
      </div>

      {erro && <Card className="p-4 mb-5" style={{ color: '#8A2A38', background: '#FBEAEA', border: '1px solid #E9C2C2' }}>{erro}</Card>}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cartão de identidade */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {carregando ? '···' : iniciais}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 22, fontWeight: 800, color: '#1A1814', lineHeight: 1.1, marginBottom: 4 }}>{carregando ? 'Carregando…' : nome}</h2>
                <p style={{ fontSize: 13, color: '#8A8579', marginBottom: 12 }}>{email}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Admin', 'Aprovador de ETP', 'Gestão de UBS'].map(p => (
                    <span key={p} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)' }}>{p}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <button style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: 'pointer' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 17 }}>edit</span>
                  Editar perfil
                </button>
                <button style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500, color: '#3D3A33', background: '#FFFFFF', border: '1px solid #E5E1D6', cursor: 'pointer' }}>
                  Trocar senha
                </button>
              </div>
            </div>
          </Card>

          {/* Atividades recentes */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 14, fontWeight: 700, color: '#1A1814' }}>Atividades recentes</h2>
              <span style={{ fontSize: 11, color: '#A8A39A' }}>últimos 7 dias</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {PERFIL_ATIVIDADES.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < PERFIL_ATIVIDADES.length - 1 ? '1px solid #EFEBE0' : 'none', cursor: 'pointer' }}>
                  <span style={{ width: 32, height: 32, borderRadius: 8, background: a.cor + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: a.cor }}>
                    <span className="material-symbols-rounded" style={{ fontSize: 18 }}>{a.icon}</span>
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: '#1A1814', lineHeight: 1.3 }}>{a.titulo}</p>
                    <p style={{ fontSize: 11, color: '#8A8579', marginTop: 1 }}>{a.tempo}</p>
                  </div>
                  <span className="material-symbols-rounded" style={{ fontSize: 18, color: '#C9C4BA', flexShrink: 0 }}>chevron_right</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dados cadastrais */}
          <Card className="p-5">
            <LocalCardHead title="Dados cadastrais" />
            {perfilCadastro.map(r => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', fontSize: 13, borderBottom: '1px solid #F5F2EB' }}>
                <span style={{ color: '#6B665D', flexShrink: 0 }}>{r.k}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, textAlign: 'right' }}>{r.v}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px', fontSize: 13 }}>
              <span style={{ color: '#6B665D' }}>MFA</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#2A6B40', background: '#2A6B4018', padding: '3px 8px', borderRadius: 99 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2A6B40' }} /> ativo
              </span>
            </div>
          </Card>

          {/* UBSs sob responsabilidade */}
          <Card className="p-5">
            <LocalCardHead title="UBSs sob sua responsabilidade" hint="Cotia" />
            {PERFIL_UBSS.map((u, i) => (
              <div key={u.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i < PERFIL_UBSS.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6B665D' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 18 }}>local_hospital</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{u.nome}</p>
                  <p style={{ fontSize: 11, color: '#8A8579' }}>{u.leitos}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 10.5, fontWeight: 600, color: '#D94F4F', background: '#D94F4F18', flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D94F4F' }} />
                  {u.status}
                </span>
              </div>
            ))}
          </Card>

          {/* Sair */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1814', marginBottom: 2 }}>Sair do SusPredict</p>
                <p style={{ fontSize: 11.5, color: '#8A8579', lineHeight: 1.4 }}>Você será desconectado em todos os dispositivos.</p>
              </div>
              <button onClick={onLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#D94F4F', background: '#D94F4F12', border: '1px solid #D94F4F33', cursor: 'pointer', flexShrink: 0 }}>
                Sair
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
