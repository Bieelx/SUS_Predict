import { useEffect, useMemo, useRef, useState } from 'react';
import { LogoIcon } from '../shared/ui.jsx';
import {
  acceptAuthLink,
  clearAuthLinkFromUrl,
  isStrongPassword,
  login,
  logout,
  passwordRequirements,
  requestPasswordRecovery,
  updatePassword,
} from '../shared/authClient.js';

const INPUT_STYLE = {
  width: '100%',
  padding: '12px 14px',
  background: '#FFFFFF',
  border: '1.5px solid #E5E1D6',
  borderRadius: 11,
  fontSize: 14,
  color: '#1A1814',
  boxSizing: 'border-box',
  outline: 'none',
};

function Feedback({ type = 'error', children }) {
  const error = type === 'error';
  return (
    <div
      role={error ? 'alert' : 'status'}
      className="rise"
      style={{
        marginTop: 16,
        padding: '12px 14px',
        background: error ? '#FBEAEA' : '#EAF4ED',
        border: `1px solid ${error ? '#E9C2C2' : '#C8E0CF'}`,
        color: error ? '#8A2A38' : '#245C38',
        borderRadius: 11,
        display: 'flex',
        gap: 9,
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 19 }}>
        {error ? 'error' : 'check_circle'}
      </span>
      <span>{children}</span>
    </div>
  );
}

function PasswordChecklist({ password }) {
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 10px', marginTop: 8 }}>
      {requirements.map(item => (
        <span
          key={item.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: item.ok ? '#2A6B40' : '#8A8579',
            fontSize: 11,
          }}
        >
          <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 14 }}>
            {item.ok ? 'check_circle' : 'radio_button_unchecked'}
          </span>
          {item.label}
        </span>
      ))}
    </div>
  );
}

export default function LoginScreen({
  onEnter,
  authLink = null,
  forceAuthLink = false,
  onAuthLinkFinished = () => {},
  initialMessage = '',
}) {
  const linkStartedRef = useRef(false);
  const [mode, setMode] = useState(forceAuthLink ? 'link' : 'login');
  const [linkType, setLinkType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(forceAuthLink);
  const [error, setError] = useState(initialMessage);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!authLink) {
      if (forceAuthLink) {
        setError('O link de acesso não contém uma sessão válida.');
        setMode('login');
        setLoading(false);
        onAuthLinkFinished();
      }
      return;
    }
    if (linkStartedRef.current) return;
    linkStartedRef.current = true;

    if (authLink.error) {
      setError('Este link é inválido ou expirou. Solicite um novo link.');
      clearAuthLinkFromUrl();
      setMode('login');
      setLoading(false);
      onAuthLinkFinished();
      return;
    }

    setLoading(true);
    setLinkType(authLink.type);
    acceptAuthLink(authLink)
      .then(() => {
        clearAuthLinkFromUrl();
        setMode('password');
      })
      .catch(err => {
        clearAuthLinkFromUrl();
        setError(err.message || 'O link de acesso é inválido ou expirou.');
        setMode('login');
        onAuthLinkFinished();
      })
      .finally(() => setLoading(false));
  }, [authLink, forceAuthLink, onAuthLinkFinished]);

  function resetFeedback() {
    setError('');
    setMessage('');
  }

  async function submitLogin(event) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);
    try {
      const user = await login(email, password);
      if (!user || user.role !== 'admin') throw new Error('Usuário sem permissão de Administrador.');
      onAuthLinkFinished();
      onEnter(user);
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.');
    } finally {
      setLoading(false);
    }
  }

  async function submitRecovery(event) {
    event.preventDefault();
    resetFeedback();
    setLoading(true);
    try {
      const result = await requestPasswordRecovery(email);
      setMessage(
        result.message
        || 'Se houver uma conta para este e-mail, enviaremos as instruções de acesso.',
      );
    } catch (err) {
      setError(err.message || 'Não foi possível solicitar a recuperação.');
    } finally {
      setLoading(false);
    }
  }

  async function submitPassword(event) {
    event.preventDefault();
    resetFeedback();
    if (!isStrongPassword(password)) {
      setError('A nova senha ainda não atende a todos os requisitos.');
      return;
    }
    if (password !== passwordConfirm) {
      setError('A confirmação não corresponde à nova senha.');
      return;
    }

    setLoading(true);
    try {
      await updatePassword(password);
      await logout();
      onAuthLinkFinished();
      setPassword('');
      setPasswordConfirm('');
      setEmail('');
      setMode('login');
      setMessage(
        linkType === 'invite'
          ? 'Senha criada com sucesso. Entre com seu e-mail para acessar a plataforma.'
          : 'Senha alterada com sucesso. Entre novamente com a nova senha.',
      );
    } catch (err) {
      setError(err.message || 'Não foi possível definir a nova senha.');
    } finally {
      setLoading(false);
    }
  }

  const heading = mode === 'forgot'
    ? 'Recuperar acesso'
    : mode === 'password'
      ? (linkType === 'invite' ? 'Crie sua senha' : 'Defina uma nova senha')
      : mode === 'link'
        ? 'Validando link seguro'
        : 'Entrar na plataforma';

  return (
    <div className="login-layout" style={{
      minHeight: '100dvh',
      display: 'flex',
      background: '#F6F5F2',
      fontFamily: 'Inter, sans-serif',
    }}>
      <section className="login-brand-panel" style={{
        flex: '1 1 52%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 56px',
        background: 'linear-gradient(150deg, #1E3C3C 0%, #1B5E6E 100%)',
        color: '#C8D8D5',
        overflow: 'hidden',
        '--sb-text': '#DCEBE8',
      }}>
        <div aria-hidden="true" style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.06,
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute',
          top: '-20%',
          right: '-10%',
          width: 520,
          height: 520,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(77,184,160,0.28) 0%, transparent 70%)',
        }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={44} />
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 20, color: '#FFF', margin: 0 }}>
            SUS Predict
          </p>
        </div>

        <div style={{ position: 'relative', maxWidth: 470 }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#8FCFC0',
            background: 'rgba(77,184,160,0.12)',
            border: '1px solid rgba(77,184,160,0.3)',
            padding: '5px 11px',
            borderRadius: 999,
            marginBottom: 22,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DB8A0' }} />
            Inteligência epidemiológica
          </span>
          <h1 style={{
            fontFamily: 'Inter Tight, sans-serif',
            fontWeight: 800,
            fontSize: 38,
            lineHeight: 1.08,
            color: '#FFF',
            margin: '0 0 16px',
            letterSpacing: '-0.02em',
          }}>
            Antecipe a demanda do SUS <span style={{ color: '#7FD4C0' }}>antes que ela chegue.</span>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#A9CFC9', margin: 0 }}>
            Análise preditiva de dados públicos do DATASUS para apoiar decisões municipais de saúde.
          </p>
          <div style={{ display: 'flex', gap: 32, marginTop: 34 }}>
            {[['São Paulo', 'escopo atual'], ['6', 'bases SUS'], ['Admin', 'acesso restrito']].map(([value, label]) => (
              <div key={label}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 17, fontWeight: 700, color: '#FFF' }}>{value}</div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7FA8A2', marginTop: 5 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <p style={{ position: 'relative', fontSize: 11, color: '#6B928C', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
          TCC 2025/2026 · FIAP · Dados públicos DATASUS
        </p>
      </section>

      <main className="login-form-panel" style={{
        flex: '1 1 48%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
      }}>
        <div style={{ width: '100%', maxWidth: 390 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6B665D', margin: '0 0 6px' }}>
            Acesso administrativo
          </p>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 27, fontWeight: 800, color: '#1A1814', margin: '0 0 8px' }}>
            {heading}
          </h2>
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#8A8579', margin: '0 0 24px' }}>
            {mode === 'forgot'
              ? 'Informe o e-mail cadastrado. Enviaremos um link de uso único.'
              : mode === 'password'
                ? 'Use uma senha exclusiva. Ela será protegida pelo Supabase Auth.'
                : mode === 'link'
                  ? 'Aguarde enquanto confirmamos a validade deste acesso.'
                  : 'Use seu e-mail institucional e sua senha.'}
          </p>

          {mode === 'login' && (
            <form onSubmit={submitLogin}>
              <label htmlFor="login-email" style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#3D3A33', marginBottom: 6 }}>E-mail</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                placeholder="nome@instituicao.gov.br"
                value={email}
                onChange={event => setEmail(event.target.value)}
                style={{ ...INPUT_STYLE, marginBottom: 14 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <label htmlFor="login-password" style={{ fontSize: 12, fontWeight: 650, color: '#3D3A33' }}>Senha</label>
                <button
                  type="button"
                  onClick={() => { resetFeedback(); setMode('forgot'); }}
                  style={{ border: 0, background: 'none', color: '#1B5E6E', fontSize: 12, fontWeight: 650, cursor: 'pointer', padding: 0 }}
                >
                  Esqueci minha senha
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="Sua senha"
                value={password}
                onChange={event => setPassword(event.target.value)}
                style={{ ...INPUT_STYLE, marginBottom: 16 }}
              />
              <button type="submit" disabled={loading} className="auth-primary-button" style={{
                width: '100%',
                padding: '13px 16px',
                background: '#1B5E6E',
                color: '#FFF',
                border: 0,
                borderRadius: 11,
                fontSize: 14,
                fontWeight: 750,
                cursor: loading ? 'wait' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}>
                {loading ? 'Validando…' : 'Entrar'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submitRecovery}>
              <label htmlFor="recovery-email" style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#3D3A33', marginBottom: 6 }}>E-mail cadastrado</label>
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                style={{ ...INPUT_STYLE, marginBottom: 16 }}
              />
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px 16px', background: '#1B5E6E', color: '#FFF',
                border: 0, borderRadius: 11, fontSize: 14, fontWeight: 750,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
              <button
                type="button"
                onClick={() => { resetFeedback(); setMode('login'); }}
                style={{ width: '100%', marginTop: 10, padding: 10, border: 0, background: 'none', color: '#1B5E6E', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}
              >
                Voltar ao login
              </button>
            </form>
          )}

          {mode === 'password' && (
            <form onSubmit={submitPassword}>
              <label htmlFor="new-password" style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#3D3A33', marginBottom: 6 }}>Nova senha</label>
              <input
                id="new-password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                style={INPUT_STYLE}
              />
              <PasswordChecklist password={password} />
              <label htmlFor="new-password-confirm" style={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#3D3A33', margin: '15px 0 6px' }}>Confirmar nova senha</label>
              <input
                id="new-password-confirm"
                type="password"
                required
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={event => setPasswordConfirm(event.target.value)}
                style={{ ...INPUT_STYLE, marginBottom: 16 }}
              />
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '13px 16px', background: '#1B5E6E', color: '#FFF',
                border: 0, borderRadius: 11, fontSize: 14, fontWeight: 750,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          )}

          {mode === 'link' && (
            <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16, borderRadius: 11, background: '#EBF4F7', color: '#1B5E6E', fontSize: 13 }}>
              <span className="material-symbols-rounded" aria-hidden="true">progress_activity</span>
              Validando o link com o Supabase…
            </div>
          )}

          {error && <Feedback>{error}</Feedback>}
          {message && <Feedback type="success">{message}</Feedback>}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 26, color: '#8A8579', fontSize: 11 }}>
            <span className="material-symbols-rounded" aria-hidden="true" style={{ fontSize: 15 }}>lock</span>
            Cadastro público desativado · sessão protegida
          </div>
        </div>
      </main>
    </div>
  );
}
