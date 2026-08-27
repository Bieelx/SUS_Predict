import { useEffect, useMemo, useState } from 'react';
import { Card } from '../shared/ui.jsx';
import {
  getCurrentUser,
  inviteUser,
  listUsers,
  requestPasswordRecovery,
} from '../shared/authClient.js';

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

const PERFIL_UBSS = [
  { nome: 'UBS Cotia Centro', leitos: '38 leitos · Cotia', status: 'crítico' },
  { nome: 'UBS Vila Bela', leitos: '24 leitos · Cotia', status: 'crítico' },
];

const INPUT_STYLE = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '10px 12px',
  borderRadius: 9,
  border: '1px solid #DDD8CC',
  background: '#FFF',
  color: '#1A1814',
  fontSize: 13,
  outline: 'none',
};

function fmtDataHora(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('pt-BR')}, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmtMesAno(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function initials(name) {
  return String(name || 'Administrador')
    .split(/[.\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(item => item[0]?.toUpperCase())
    .join('') || 'AD';
}

function Feedback({ type = 'success', children }) {
  const error = type === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      style={{
        padding: '11px 13px',
        borderRadius: 9,
        color: error ? '#8A2A38' : '#245C38',
        background: error ? '#FBEAEA' : '#EAF4ED',
        border: `1px solid ${error ? '#E9C2C2' : '#C8E0CF'}`,
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B665D', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

export default function PagePerfil({ user: authenticatedUser, onLogout }) {
  const [user, setUser] = useState(authenticatedUser || null);
  const [profileLoading, setProfileLoading] = useState(!authenticatedUser);
  const [profileError, setProfileError] = useState('');
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', jobTitle: '' });
  const [submitting, setSubmitting] = useState(false);
  const [inviteFeedback, setInviteFeedback] = useState(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (authenticatedUser) {
      setUser(authenticatedUser);
      setProfileError('');
      setProfileLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setProfileLoading(true);
    getCurrentUser()
      .then(currentUser => {
        if (cancelled) return;
        if (!currentUser) {
          setProfileError('Não foi possível carregar os dados da sessão.');
          return;
        }
        setUser(currentUser);
        setProfileError('');
      })
      .catch(error => {
        if (!cancelled) {
          setProfileError(error?.message || 'Não foi possível carregar o perfil.');
        }
      })
      .finally(() => {
        if (!cancelled) setProfileLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [authenticatedUser]);

  const isAdmin = user?.role === 'admin' || user?.roles?.includes('admin');
  const email = user?.email || '—';
  const displayName = user?.full_name
    || user?.user_metadata?.full_name
    || user?.user_metadata?.nome
    || (user?.email ? user.email.split('@')[0] : 'Administrador');

  const profileRows = [
    { key: 'E-mail institucional', value: email },
    { key: 'ID de usuário', value: user?.id ? user.id.slice(0, 8) : '—' },
    { key: 'No SusPredict desde', value: fmtMesAno(user?.created_at) },
    { key: 'Último login', value: fmtDataHora(user?.last_sign_in_at) },
  ];

  async function loadUsers() {
    if (!isAdmin) {
      setUsers([]);
      setUsersLoading(false);
      return;
    }

    setUsersLoading(true);
    setUsersError('');
    try {
      const payload = await listUsers();
      setUsers(Array.isArray(payload?.items) ? payload.items : []);
    } catch (error) {
      setUsersError(error?.message || 'Não foi possível listar os usuários.');
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, [isAdmin]);

  const sortedUsers = useMemo(
    () => users
      .slice()
      .sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email), 'pt-BR')),
    [users],
  );

  async function submitInvite(event) {
    event.preventDefault();
    setInviteFeedback(null);
    setSubmitting(true);
    try {
      const payload = await inviteUser({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        jobTitle: form.jobTitle.trim(),
      });
      const invited = payload?.user;
      if (invited) {
        setUsers(current => [invited, ...current.filter(item => item.id !== invited.id)]);
      }
      setForm({ fullName: '', email: '', jobTitle: '' });
      setInviteFeedback({
        type: 'success',
        text: 'Convite enviado. O usuário definirá a própria senha pelo link recebido.',
      });
    } catch (error) {
      setInviteFeedback({ type: 'error', text: error?.message || 'Não foi possível enviar o convite.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function sendPasswordLink() {
    if (!user?.email) {
      setPasswordFeedback({ type: 'error', text: 'O perfil não possui um e-mail válido.' });
      return;
    }

    setPasswordFeedback(null);
    setPasswordSubmitting(true);
    try {
      const payload = await requestPasswordRecovery(user.email);
      setPasswordFeedback({
        type: 'success',
        text: payload?.message || 'Enviamos as instruções para o seu e-mail.',
      });
    } catch (error) {
      setPasswordFeedback({ type: 'error', text: error?.message || 'Não foi possível enviar o link.' });
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>Perfil do Usuário</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Suas informações, permissões, segurança e gestão dos acessos administrativos.</p>
      </div>

      {profileError && (
        <div style={{ marginBottom: 20 }}>
          <Feedback type="error">{profileError}</Feedback>
        </div>
      )}

      <div className="responsive-grid-2 profile-main-grid" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                {profileLoading ? '···' : initials(displayName)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, fontWeight: 800, color: '#1A1814', lineHeight: 1.1, marginBottom: 4 }}>{profileLoading ? 'Carregando…' : displayName}</h2>
                <p style={{ fontSize: 13, color: 'var(--ink-400)', marginBottom: 12, overflowWrap: 'anywhere' }}>{email}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {['Admin', 'Aprovador de ETP', 'Gestão de UBS'].map(permission => (
                    <span key={permission} style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)' }}>{permission}</span>
                  ))}
                  {user?.job_title && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#6B665D', background: '#F5F2EB', border: '1px solid #E5E1D6' }}>{user.job_title}</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {isAdmin && (
            <Card className="p-5">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 16, fontWeight: 750, color: '#1A1814', margin: '0 0 4px' }}>Cadastrar novo usuário</h2>
                  <p style={{ fontSize: 12, color: '#8A8579', lineHeight: 1.45, margin: 0 }}>O cadastro é feito por convite. A permissão inicial é Administrador.</p>
                </div>
                <span className="material-symbols-rounded" aria-hidden="true" style={{ color: 'var(--primary)', fontSize: 24 }}>person_add</span>
              </div>

              <form onSubmit={submitInvite}>
                <div className="profile-form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13 }}>
                  <Field label="Nome completo">
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      autoComplete="off"
                      value={form.fullName}
                      onChange={event => setForm(current => ({ ...current, fullName: event.target.value }))}
                      style={INPUT_STYLE}
                    />
                  </Field>
                  <Field label="E-mail institucional">
                    <input
                      required
                      type="email"
                      maxLength={254}
                      autoComplete="off"
                      value={form.email}
                      onChange={event => setForm(current => ({ ...current, email: event.target.value }))}
                      style={INPUT_STYLE}
                    />
                  </Field>
                  <Field label="Cargo (opcional)">
                    <input
                      maxLength={120}
                      autoComplete="off"
                      value={form.jobTitle}
                      onChange={event => setForm(current => ({ ...current, jobTitle: event.target.value }))}
                      style={INPUT_STYLE}
                    />
                  </Field>
                  <Field label="Permissão">
                    <input value="Administrador" disabled style={{ ...INPUT_STYLE, background: '#F5F2EB', color: '#6B665D' }} />
                  </Field>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 15 }}>
                  <button type="submit" disabled={submitting} style={{ padding: '10px 15px', borderRadius: 9, border: 0, background: 'var(--primary)', color: '#FFF', fontSize: 12, fontWeight: 750, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                    {submitting ? 'Enviando convite…' : 'Enviar convite seguro'}
                  </button>
                </div>
              </form>
              {inviteFeedback && <div style={{ marginTop: 14 }}><Feedback type={inviteFeedback.type}>{inviteFeedback.text}</Feedback></div>}
            </Card>
          )}

          {isAdmin && (
            <Card className="p-5">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 16, fontWeight: 750, color: '#1A1814', margin: '0 0 3px' }}>Usuários com acesso</h2>
                  <p style={{ fontSize: 11, color: '#8A8579', margin: 0 }}>Contas cadastradas no Supabase Auth.</p>
                </div>
                <button type="button" onClick={loadUsers} disabled={usersLoading} style={{ border: 0, background: 'none', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: usersLoading ? 'wait' : 'pointer', opacity: usersLoading ? 0.7 : 1 }}>Atualizar</button>
              </div>

              {usersError && <div style={{ marginBottom: 12 }}><Feedback type="error">{usersError}</Feedback></div>}
              {usersLoading ? (
                <p role="status" style={{ fontSize: 12, color: '#8A8579', padding: '12px 0', margin: 0 }}>Carregando usuários…</p>
              ) : sortedUsers.length === 0 ? (
                <p style={{ fontSize: 12, color: '#8A8579', padding: '12px 0', margin: 0 }}>Nenhum usuário retornado.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {sortedUsers.map((item, index) => (
                    <div key={item.id || item.email} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderTop: index ? '1px solid #F1EEE7' : 0 }}>
                      <div style={{ width: 33, height: 33, borderRadius: '50%', background: '#EBF4F7', color: '#1B5E6E', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 750, flexShrink: 0 }}>
                        {initials(item.full_name || item.email)}
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1814', margin: 0 }}>{item.full_name || item.email}</p>
                        <p style={{ fontSize: 10, color: '#8A8579', margin: '2px 0 0', overflowWrap: 'anywhere' }}>{item.email}</p>
                      </div>
                      <span style={{ padding: '3px 7px', borderRadius: 99, fontSize: 9, fontWeight: 750, color: item.confirmed_at ? '#2A6B40' : '#A6580F', background: item.confirmed_at ? '#EAF4ED' : '#FBF1E3', textAlign: 'center' }}>
                        {item.confirmed_at ? 'E-MAIL CONFIRMADO' : 'CONVITE PENDENTE'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card className="p-5">
            <LocalCardHead title="Dados cadastrais" />
            {profileRows.map(row => (
              <div key={row.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', fontSize: 13, borderBottom: '1px solid #F5F2EB' }}>
                <span style={{ color: '#6B665D', flexShrink: 0 }}>{row.key}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, textAlign: 'right', overflowWrap: 'anywhere' }}>{profileLoading ? '—' : row.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0 2px', fontSize: 13 }}>
              <span style={{ color: '#6B665D' }}>MFA</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#6B665D', background: '#F0EDE6', padding: '3px 8px', borderRadius: 99 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9A958A' }} />
                não configurado
              </span>
            </div>
          </Card>

          <Card className="p-5">
            <LocalCardHead title="UBSs sob sua responsabilidade" hint="Cotia" />
            {PERFIL_UBSS.map((ubs, index) => (
              <div key={ubs.nome} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: index < PERFIL_UBSS.length - 1 ? '1px solid #EFEBE0' : 'none' }}>
                <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#6B665D' }}>
                  <span className="material-symbols-rounded" style={{ fontSize: 20 }}>local_hospital</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', lineHeight: 1.3 }}>{ubs.nome}</p>
                  <p style={{ fontSize: 11, color: 'var(--ink-400)' }}>{ubs.leitos}</p>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: '#D94F4F', background: '#D94F4F18', flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D94F4F' }} />
                  {ubs.status}
                </span>
              </div>
            ))}
          </Card>

          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span className="material-symbols-rounded" aria-hidden="true" style={{ color: '#2A6B40', fontSize: 22 }}>verified_user</span>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 750, color: '#1A1814', margin: 0 }}>Segurança da conta</h2>
            </div>
            <p style={{ fontSize: 11, lineHeight: 1.55, color: '#6B665D', margin: '0 0 14px' }}>
              A senha não é armazenada pelo SUS Predict. O Supabase Auth mantém apenas o hash seguro.
            </p>
            <button type="button" onClick={sendPasswordLink} disabled={passwordSubmitting || !user?.email} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: passwordSubmitting ? 'wait' : 'pointer', opacity: passwordSubmitting || !user?.email ? 0.7 : 1 }}>
              {passwordSubmitting ? 'Enviando link…' : 'Enviar link para trocar senha'}
            </button>
            {passwordFeedback && <div style={{ marginTop: 12 }}><Feedback type={passwordFeedback.type}>{passwordFeedback.text}</Feedback></div>}
          </Card>

          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1814', marginBottom: 2 }}>Sair do SusPredict</p>
                <p style={{ fontSize: 11, color: 'var(--ink-400)', lineHeight: 1.4 }}>Você será desconectado em todos os dispositivos.</p>
              </div>
              <button type="button" onClick={onLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#D94F4F', background: '#D94F4F12', border: '1px solid #D94F4F33', cursor: 'pointer', flexShrink: 0 }}>
                Sair
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
