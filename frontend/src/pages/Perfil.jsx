import { useState, useEffect } from 'react';
import { Card } from '../shared/ui.jsx';
import { authenticatedFetch, getCurrentUser } from '../shared/auth.js';

// CardHead não é exportado por shared/ui.jsx (é específico de Configurações/Perfil
// no protótipo original) — declarado localmente para não acoplar os dois módulos.
function LocalCardHead({ title, hint }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
      <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 700, color: '#1A1814' }}>{title}</h2>
      {hint && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-300)' }}>{hint}</span>}
    </div>
  );
}

// ─── Page: Perfil ──────────────────────────────────────────────────────────────
//
// A auditoria de UX (P1-2) removeu o log de "atividades recentes" — era uma
// lista estática inventada, sem lastro em nenhum evento real do backend, e
// os botões "Editar perfil" / "Trocar senha" não tinham destino nenhum. Sem
// endpoint de auditoria de ações do usuário no MVP, a tela mostra só o que
// `/api/auth/me` de fato retorna, e nada que pareça funcionalidade ausente.

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function PagePerfil({ onLogout }) {
  const [user, setUser] = useState(getCurrentUser);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(() => !getCurrentUser());

  useEffect(() => {
    if (user) return;
    authenticatedFetch('/api/auth/me')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Falha ao carregar perfil.');
        return r.json();
      })
      .then(setUser)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [user]);

  const email = user?.email || '—';
  const nome = user?.user_metadata?.nome || (user?.email ? email.split('@')[0] : 'Usuário');
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
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Perfil do usuário</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>O que a sessão autenticada informa sobre você.</p>
      </div>

      {erro && <Card className="p-4 mb-5" style={{ color: '#8A2A38', background: '#FBEAEA', border: '1px solid #E9C2C2' }}>{erro}</Card>}

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Cartão de identidade */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {carregando ? '···' : iniciais}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, fontWeight: 800, color: '#1A1814', lineHeight: 1.1, marginBottom: 4 }}>{carregando ? 'Carregando…' : nome}</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: 0 }}>{email}</p>
              </div>
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
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, textAlign: 'right' }}>{r.v}</span>
              </div>
            ))}
          </Card>

          {/* Sair */}
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1814', marginBottom: 2 }}>Sair do SusPredict</p>
                <p style={{ fontSize: 11, color: 'var(--ink-400)', lineHeight: 1.4 }}>Sua sessão neste navegador será encerrada.</p>
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
