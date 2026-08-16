import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LogoIcon, MIcon, THEMES } from '../shared/ui.jsx';
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

const DEV_ACCOUNT_EMAIL = 'marcia.oliveira@dev.local';

function Feedback({ type = 'error', children }) {
  const error = type === 'error';
  return (
    <div
      className="login-feedback"
      role={error ? 'alert' : 'status'}
      aria-live={error ? 'assertive' : 'polite'}
      style={error ? undefined : {
        borderColor: '#B8D8C1',
        background: '#EAF4ED',
        color: '#245C38',
      }}
    >
      <MIcon m={error ? 'error' : 'check_circle'} size={19} />
      <span>{children}</span>
    </div>
  );
}

function PasswordChecklist({ password }) {
  const requirements = useMemo(() => passwordRequirements(password), [password]);
  return (
    <div
      aria-label="Requisitos da senha"
      style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 10px', marginTop: 8 }}
    >
      {requirements.map(item => (
        <span
          key={item.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            color: item.ok ? '#2A6B40' : 'var(--login-muted)',
            fontSize: 11,
          }}
        >
          <MIcon m={item.ok ? 'check_circle' : 'radio_button_unchecked'} size={14} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function BackToLoginButton({ disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      className="login-demo__button touch-target"
      onClick={onClick}
      style={{ marginTop: 10 }}
    >
      <MIcon m="arrow_back" size={17} />
      Voltar ao login
    </button>
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
  const passwordInputRef = useRef(null);
  const [mode, setMode] = useState(forceAuthLink ? 'link' : 'login');
  const [linkType, setLinkType] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(forceAuthLink);
  const [error, setError] = useState(initialMessage);
  const [message, setMessage] = useState('');
  const ambienteDesenvolvimento = import.meta.env.DEV;
  const temaLogin = THEMES.teal.vars;

  const validateAuthLink = useCallback(async () => {
    if (!authLink || authLink.error) return;

    // Credenciais de uso único saem da barra assim que são capturadas. Em uma
    // falha transitória, a cópia fica somente na memória para permitir retry.
    clearAuthLinkFromUrl();
    setError('');
    setMessage('');
    setLoading(true);
    setMode('link');
    setLinkType(authLink.type);

    try {
      await acceptAuthLink(authLink);
      setMode('password');
    } catch (err) {
      if (!err?.status || err.status === 429 || err.status >= 500) {
        setError(
          'Não foi possível alcançar o serviço de autenticação. '
          + 'Verifique sua conexão e tente validar novamente.',
        );
        return;
      }

      setError(err.message || 'O link de acesso é inválido ou expirou.');
      setMode('login');
      onAuthLinkFinished();
    } finally {
      setLoading(false);
    }
  }, [authLink, onAuthLinkFinished]);

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

    void validateAuthLink();
  }, [authLink, forceAuthLink, onAuthLinkFinished, validateAuthLink]);

  function resetFeedback() {
    setError('');
    setMessage('');
  }

  function returnToLogin() {
    resetFeedback();
    setPassword('');
    setPasswordConfirm('');
    setMode('login');
  }

  async function submitLogin(event) {
    event.preventDefault();
    resetFeedback();

    if (!email.trim() || !password) {
      setError('Informe o e-mail institucional e a senha para continuar.');
      return;
    }

    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      if (!user || user.role !== 'admin') {
        throw new Error('Usuário sem permissão de Administrador.');
      }
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
      const result = await requestPasswordRecovery(email.trim());
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

  function prepareDemoLogin() {
    resetFeedback();
    setMode('login');
    setEmail(DEV_ACCOUNT_EMAIL);
    setPassword('');
    window.requestAnimationFrame(() => passwordInputRef.current?.focus());
  }

  const heading = mode === 'forgot'
    ? 'Recuperar acesso'
    : mode === 'password'
      ? (linkType === 'invite' ? 'Crie sua senha' : 'Defina uma nova senha')
      : mode === 'link'
        ? (loading ? 'Validando link seguro' : 'Validação temporariamente indisponível')
        : 'Entrar no ambiente de trabalho';

  const description = mode === 'forgot'
    ? 'Informe o e-mail cadastrado. Enviaremos um link de uso único.'
    : mode === 'password'
      ? 'Use uma senha exclusiva. Ela será protegida pelo Supabase Auth.'
      : mode === 'link'
        ? (loading
          ? 'Aguarde enquanto confirmamos a validade deste acesso.'
          : 'O link foi preservado com segurança nesta página para uma nova tentativa.')
        : 'Use as credenciais fornecidas pela sua organização.';

  return (
    <div className="login-page" style={temaLogin}>
      <header className="login-masthead">
        <div className="login-masthead__brand">
          <LogoIcon size={38} />
          <div>
            <p className="login-masthead__name">SusPredict</p>
            <p className="login-masthead__descriptor">Inteligência municipal em saúde</p>
          </div>
        </div>
        <div className="login-masthead__meta">
          <span>Dados públicos</span>
          <span aria-hidden="true">·</span>
          <span>Decisão auditável</span>
        </div>
      </header>

      <main className="login-main">
        <section className="login-context" aria-labelledby="login-context-title">
          <p className="login-eyebrow">Plataforma de trabalho municipal</p>
          <h1 id="login-context-title">Inteligência operacional para a saúde pública</h1>
          <p className="login-context__intro">
            Acompanhe alertas, evidências e necessidades de insumos em um ambiente orientado à decisão. Cada recomendação identifica fonte, competência e limitações.
          </p>

          <dl className="login-institution">
            <div>
              <dt>Organização</dt>
              <dd>Secretaria Municipal de Saúde</dd>
            </div>
            <div>
              <dt>Escopo operacional</dt>
              <dd>Vigilância epidemiológica, estoque e planejamento</dd>
            </div>
            <div>
              <dt>Rastreabilidade</dt>
              <dd>Fontes, cálculos e competências visíveis na análise</dd>
            </div>
          </dl>

          <div className="login-assurance">
            <MIcon m="verified_user" size={19} />
            <p>
              O sistema diferencia dados observados, simulações e informações indisponíveis antes de apoiar uma decisão.
            </p>
          </div>
        </section>

        <section className="login-access" aria-labelledby="login-access-title">
          <div className="login-access__heading">
            <p className="login-eyebrow">Acesso institucional</p>
            <h2 id="login-access-title">{heading}</h2>
            <p>{description}</p>
          </div>

          {mode === 'login' && (
            <form onSubmit={submitLogin} className="login-form" noValidate>
              <div className="login-field">
                <label htmlFor="login-email">E-mail institucional</label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="username"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  placeholder="nome@saude.municipio.gov.br"
                  disabled={loading}
                />
              </div>

              <div className="login-field">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <label htmlFor="login-password">Senha</label>
                  <button
                    type="button"
                    onClick={() => { resetFeedback(); setMode('forgot'); }}
                    disabled={loading}
                    style={{
                      border: 0,
                      padding: 0,
                      background: 'none',
                      color: 'var(--login-accent)',
                      fontSize: 11.5,
                      fontWeight: 700,
                      cursor: loading ? 'wait' : 'pointer',
                    }}
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <input
                  ref={passwordInputRef}
                  id="login-password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={loading}
                />
              </div>

              <button type="submit" disabled={loading} className="login-submit touch-target">
                {loading ? 'Verificando credenciais…' : 'Entrar com credenciais'}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={submitRecovery} className="login-form" noValidate>
              <div className="login-field">
                <label htmlFor="recovery-email">E-mail cadastrado</label>
                <input
                  id="recovery-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading} className="login-submit touch-target">
                {loading ? 'Enviando…' : 'Enviar link de recuperação'}
              </button>
              <BackToLoginButton disabled={loading} onClick={returnToLogin} />
            </form>
          )}

          {mode === 'password' && (
            <form onSubmit={submitPassword} className="login-form" noValidate>
              <div className="login-field">
                <label htmlFor="new-password">Nova senha</label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  disabled={loading}
                />
                <PasswordChecklist password={password} />
              </div>
              <div className="login-field">
                <label htmlFor="new-password-confirm">Confirmar nova senha</label>
                <input
                  id="new-password-confirm"
                  type="password"
                  required
                  minLength={12}
                  maxLength={128}
                  autoComplete="new-password"
                  value={passwordConfirm}
                  onChange={event => setPasswordConfirm(event.target.value)}
                  disabled={loading}
                />
              </div>
              <button type="submit" disabled={loading} className="login-submit touch-target">
                {loading ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          )}

          {mode === 'link' && (
            loading ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginTop: 25,
                  padding: 14,
                  border: '1px solid var(--primary-soft-border)',
                  borderRadius: 8,
                  background: 'var(--primary-soft)',
                  color: 'var(--login-accent)',
                  fontSize: 12,
                }}
              >
                <MIcon m="progress_activity" size={19} />
                Validando o link com o Supabase…
              </div>
            ) : (
              <button
                type="button"
                onClick={validateAuthLink}
                className="login-submit touch-target"
              >
                Tentar validar novamente
              </button>
            )
          )}

          {error && <Feedback>{error}</Feedback>}
          {message && <Feedback type="success">{message}</Feedback>}

          {ambienteDesenvolvimento && mode === 'login' && (
            <div className="login-demo">
              <div className="login-demo__copy">
                <div>
                  <span className="login-demo__badge">Ambiente de demonstração</span>
                  <h3>Usar a conta local de demonstração</h3>
                </div>
                <p>
                  O e-mail será preenchido. Informe no campo Senha o valor local de
                  {' '}<code>SUS_PREDICT_DEV_PASSWORD</code>; ele não é incluído no frontend.
                </p>
              </div>
              <button
                type="button"
                onClick={prepareDemoLogin}
                disabled={loading}
                className="login-demo__button touch-target"
              >
                Preparar acesso de demonstração
                <MIcon m="arrow_forward" size={17} />
              </button>
            </div>
          )}

          <p className="login-access__footer">
            Acesso restrito. Cadastro público desativado. As ações realizadas no ambiente institucional devem seguir os fluxos de revisão e aprovação do município.
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <span>Projeto acadêmico FIAP 2026</span>
        <span>Fontes públicas DATASUS</span>
      </footer>
    </div>
  );
}
