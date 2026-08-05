import { useEffect, useMemo, useState } from 'react';
import { Card } from '../shared/ui.jsx';
import {
  inviteUser,
  listUsers,
  requestPasswordRecovery,
} from '../shared/authClient.js';

function formatDate(value, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', includeTime
    ? { dateStyle: 'short', timeStyle: 'short' }
    : { dateStyle: 'medium' });
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

export default function PagePerfil({ user, onLogout }) {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [form, setForm] = useState({ fullName: '', email: '', jobTitle: '' });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);

  const displayName = user?.full_name || user?.email?.split('@')[0] || 'Administrador';
  const isAdmin = user?.role === 'admin';

  async function loadUsers() {
    if (!isAdmin) return;
    setUsersLoading(true);
    try {
      const payload = await listUsers();
      setUsers(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Não foi possível listar os usuários.' });
    } finally {
      setUsersLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
  }, [isAdmin]);

  const sortedUsers = useMemo(
    () => users.slice().sort((a, b) => String(a.full_name || a.email).localeCompare(String(b.full_name || b.email), 'pt-BR')),
    [users],
  );

  async function submitInvite(event) {
    event.preventDefault();
    setFeedback(null);
    setSubmitting(true);
    try {
      const payload = await inviteUser(form);
      const invited = payload.user;
      setUsers(current => [invited, ...current.filter(item => item.id !== invited.id)]);
      setForm({ fullName: '', email: '', jobTitle: '' });
      setFeedback({
        type: 'success',
        text: 'Convite enviado. O usuário definirá a própria senha pelo link recebido.',
      });
    } catch (error) {
      setFeedback({ type: 'error', text: error.message || 'Não foi possível enviar o convite.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function sendPasswordLink() {
    setPasswordFeedback(null);
    try {
      const payload = await requestPasswordRecovery(user.email);
      setPasswordFeedback({
        type: 'success',
        text: payload.message || 'Enviamos as instruções para o seu e-mail.',
      });
    } catch (error) {
      setPasswordFeedback({ type: 'error', text: error.message || 'Não foi possível enviar o link.' });
    }
  }

  return (
    <div className="rise">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', letterSpacing: '-0.02em', marginBottom: 4 }}>
          Perfil do Usuário
        </h1>
        <p style={{ fontSize: 13, color: '#8A8579' }}>
          Dados da conta, segurança e gestão dos acessos administrativos.
        </p>
      </div>

      <div className="profile-main-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, .75fr)', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', gap: 17 }}>
              <div style={{ width: 66, height: 66, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary-dark), var(--accent))', display: 'grid', placeItems: 'center', color: '#FFF', fontSize: 19, fontWeight: 750, flexShrink: 0 }}>
                {initials(displayName)}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, fontWeight: 800, color: '#1A1814', margin: '0 0 3px' }}>{displayName}</h2>
                <p style={{ fontSize: 13, color: '#8A8579', margin: 0, overflowWrap: 'anywhere' }}>{user?.email}</p>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                  <span style={{ padding: '4px 9px', borderRadius: 99, fontSize: 10, fontWeight: 750, letterSpacing: '.05em', color: '#1B5E6E', background: '#EBF4F7', border: '1px solid #D6E9EE' }}>ADMIN</span>
                  {user?.job_title && <span style={{ padding: '4px 9px', borderRadius: 99, fontSize: 10, fontWeight: 650, color: '#6B665D', background: '#F5F2EB' }}>{user.job_title}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px 22px', marginTop: 22, paddingTop: 18, borderTop: '1px solid #EFEBE0' }}>
              {[
                ['ID do usuário', user?.id ? user.id.slice(0, 8) : '—'],
                ['Perfil de acesso', 'Administrador'],
                ['Conta criada', formatDate(user?.created_at)],
                ['Último acesso', formatDate(user?.last_sign_in_at, true)],
              ].map(([label, value]) => (
                <div key={label}>
                  <p style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.07em', color: '#A8A39A', fontWeight: 700, margin: '0 0 3px' }}>{label}</p>
                  <p style={{ fontSize: 12, color: '#3D3A33', fontWeight: 650, margin: 0, overflowWrap: 'anywhere' }}>{value}</p>
                </div>
              ))}
            </div>
          </Card>

          {isAdmin && (
            <Card className="p-5">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 16, fontWeight: 750, color: '#1A1814', margin: '0 0 4px' }}>Cadastrar novo usuário</h2>
                  <p style={{ fontSize: 12, color: '#8A8579', lineHeight: 1.45, margin: 0 }}>O cadastro é feito por convite. A role inicial é Administrador.</p>
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
                  <button type="submit" disabled={submitting} style={{ padding: '10px 15px', borderRadius: 9, border: 0, background: 'var(--primary)', color: '#FFF', fontSize: 12, fontWeight: 750, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? .7 : 1 }}>
                    {submitting ? 'Enviando convite…' : 'Enviar convite seguro'}
                  </button>
                </div>
              </form>
              {feedback && <div style={{ marginTop: 14 }}><Feedback type={feedback.type}>{feedback.text}</Feedback></div>}
            </Card>
          )}

          {isAdmin && (
            <Card className="p-5">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 16, fontWeight: 750, color: '#1A1814', margin: '0 0 3px' }}>Usuários com acesso</h2>
                  <p style={{ fontSize: 11, color: '#8A8579', margin: 0 }}>Contas cadastradas no Supabase Auth.</p>
                </div>
                <button type="button" onClick={loadUsers} disabled={usersLoading} style={{ border: 0, background: 'none', color: 'var(--primary)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Atualizar</button>
              </div>
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
                      <span style={{ padding: '3px 7px', borderRadius: 99, fontSize: 9, fontWeight: 750, color: item.confirmed_at ? '#2A6B40' : '#A6580F', background: item.confirmed_at ? '#EAF4ED' : '#FBF1E3' }}>
                        {item.confirmed_at ? 'ATIVO' : 'CONVITE PENDENTE'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card className="p-5">
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span className="material-symbols-rounded" aria-hidden="true" style={{ color: '#2A6B40', fontSize: 22 }}>verified_user</span>
              <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 750, color: '#1A1814', margin: 0 }}>Segurança da conta</h2>
            </div>
            <p style={{ fontSize: 11, lineHeight: 1.55, color: '#6B665D', margin: '0 0 14px' }}>
              A senha não é armazenada pelo SUS Predict. O Supabase Auth mantém apenas o hash seguro.
            </p>
            <button type="button" onClick={sendPasswordLink} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-soft)', border: '1px solid var(--primary-soft-border)', cursor: 'pointer' }}>
              Enviar link para trocar senha
            </button>
            {passwordFeedback && <div style={{ marginTop: 12 }}><Feedback type={passwordFeedback.type}>{passwordFeedback.text}</Feedback></div>}
          </Card>

          <Card className="p-5">
            <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 750, color: '#1A1814', margin: '0 0 5px' }}>Encerrar sessão</h2>
            <p style={{ fontSize: 11, lineHeight: 1.5, color: '#8A8579', margin: '0 0 14px' }}>
              O logout revoga as sessões do Supabase e remove os cookies deste navegador.
            </p>
            <button type="button" onClick={onLogout} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, color: '#D94F4F', background: '#D94F4F12', border: '1px solid #D94F4F33', cursor: 'pointer' }}>
              Sair do SUS Predict
            </button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
