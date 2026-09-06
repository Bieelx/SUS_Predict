import { useState } from 'react';
import { LogoIcon, API_BASE, MIcon, THEMES } from '../shared/ui.jsx';
import { LegalLinks } from './Legal.jsx';
import { saveSession } from '../shared/auth.js';

// O acesso institucional usa autenticação real. A entrada de demonstração usa
// uma sessão isolada emitida pelo backend quando SUS_PREDICT_DEV_AUTH está ativo.
export default function LoginScreen({ onEnter }) {
  const [erro, setErro] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [acaoCarregando, setAcaoCarregando] = useState('');
  const [modo, setModo] = useState('entrar'); // 'entrar' | 'criar'
  const [nome, setNome] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [aviso, setAviso] = useState('');
  const [etapa, setEtapa] = useState('credenciais'); // 'credenciais' | 'codigo'
  const [codigo, setCodigo] = useState('');

  async function concluirLogin(resp) {
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.detail || 'Não foi possível autenticar com os dados informados.');
    saveSession(data);
    onEnter(data.user || null);
  }

  async function loginDemonstracao() {
    setErro('');
    setAcaoCarregando('demo');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'marcia.oliveira@dev.local', password: 'dev' }),
      });
      await concluirLogin(resp);
    } catch (err) {
      setErro(err.message || 'Não foi possível acessar a demonstração.');
    } finally {
      setAcaoCarregando('');
    }
  }

  function trocarModo(novo) {
    setModo(novo);
    setEtapa('credenciais');
    setErro('');
    setAviso('');
    setSenha('');
    setConfirmaSenha('');
    setCodigo('');
  }

  async function handleSignup(e) {
    e.preventDefault();
    setErro('');
    setAviso('');
    if (!nome.trim() || !email.trim() || !senha) {
      setErro('Informe nome, e-mail e senha para criar a conta.');
      return;
    }
    if (senha.length < 8) {
      setErro('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (senha !== confirmaSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    setAcaoCarregando('signup');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: senha, nome: nome.trim() }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'Não foi possível criar a conta.');
      // A API responde igual para e-mail novo e já cadastrado, de propósito.
      trocarModo('entrar');
      setAviso(data.mensagem || 'Verifique seu e-mail para confirmar a conta.');
    } catch (err) {
      setErro(err.message || 'Não foi possível criar a conta.');
    } finally {
      setAcaoCarregando('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!email.trim() || !senha) {
      setErro('Informe o e-mail institucional e a senha para continuar.');
      return;
    }

    setAcaoCarregando('login');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: senha }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'Não foi possível autenticar com os dados informados.');

      if (data.codigo_enviado) {
        // Segundo fator: a senha certa ainda não devolve sessão.
        setEtapa('codigo');
        setCodigo('');
        setAviso(`Enviamos um código de verificação para ${data.email || email.trim()}.`);
        return;
      }

      // Demonstração local (sem Supabase): entra direto, não há e-mail para o código.
      saveSession(data);
      onEnter(data.user || null);
    } catch (err) {
      setErro(err.message || 'Não foi possível autenticar.');
    } finally {
      setAcaoCarregando('');
    }
  }

  async function handleCodigo(e) {
    e.preventDefault();
    setErro('');
    const informado = codigo.replace(/\D/g, '');
    if (informado.length < 6) {
      setErro('Digite os 6 dígitos do código enviado por e-mail.');
      return;
    }

    setAcaoCarregando('codigo');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/verificar-codigo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), codigo: informado }),
      });
      await concluirLogin(resp);
    } catch (err) {
      setErro(err.message || 'Código inválido ou expirado.');
    } finally {
      setAcaoCarregando('');
    }
  }

  async function reenviarCodigo() {
    setErro('');
    setAcaoCarregando('reenvio');
    try {
      const resp = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password: senha }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.detail || 'Não foi possível reenviar o código.');
      setAviso('Código reenviado. Verifique o e-mail.');
    } catch (err) {
      setErro(err.message || 'Não foi possível reenviar o código.');
    } finally {
      setAcaoCarregando('');
    }
  }

  const carregando = !!acaoCarregando;
  const temaLogin = THEMES.teal.vars;

  return (
    <div className="login-page" style={temaLogin}>
      <header className="login-masthead">
        <div className="login-masthead__brand">
          <LogoIcon size={56} />
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

      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>
      <main id="conteudo-principal" tabIndex={-1} className="login-main">
        <section className="login-access" aria-labelledby="login-access-title">
          <div className="login-access__heading">
            <p className="login-eyebrow">Acesso institucional</p>
            <h2 id="login-access-title">
              {etapa === 'codigo'
                ? 'Verificação em duas etapas'
                : modo === 'criar' ? 'Criar conta de acesso' : 'Entrar no SusPredict'}
            </h2>
            <p>
              {etapa === 'codigo'
                ? 'Digite o código de 6 dígitos que enviamos para o seu e-mail.'
                : modo === 'criar'
                  ? 'Novas contas entram como visitante até a liberação por um administrador.'
                  : 'Acesse seu ambiente de análise em saúde pública.'}
            </p>
          </div>

          {etapa === 'credenciais' && (
            <div className="login-tabs" role="group" aria-label="Modo de acesso">
              <button type="button" aria-pressed={modo === 'entrar'} className="login-tab" onClick={() => trocarModo('entrar')} disabled={carregando}>Entrar</button>
              <button type="button" aria-pressed={modo === 'criar'} className="login-tab" onClick={() => trocarModo('criar')} disabled={carregando}>Criar conta</button>
            </div>
          )}

          {etapa === 'codigo' ? (
            <form onSubmit={handleCodigo} className="login-form" aria-busy={carregando}>
              <div className="login-field">
                <label htmlFor="login-codigo">Código de verificação</label>
                <input
                  id="login-codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  autoFocus
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="login-input-codigo"
                  disabled={carregando}
                />
              </div>

              <button type="submit" disabled={carregando} className="login-submit touch-target">
                {acaoCarregando === 'codigo' ? 'Verificando código…' : 'Confirmar e entrar'}
              </button>

              <div className="login-codigo-acoes">
                <button type="button" className="login-link" onClick={() => trocarModo('entrar')} disabled={carregando}>
                  Usar outro e-mail
                </button>
                <button type="button" className="login-link" onClick={reenviarCodigo} disabled={carregando}>
                  {acaoCarregando === 'reenvio' ? 'Reenviando…' : 'Reenviar código'}
                </button>
              </div>
            </form>
          ) : (
          <form onSubmit={modo === 'criar' ? handleSignup : handleSubmit} className="login-form" aria-busy={carregando}>
            {modo === 'criar' && (
              <div className="login-field">
                <label htmlFor="login-nome">Nome de identificação</label>
                <input
                  id="login-nome"
                  type="text"
                  required
                  autoComplete="name"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Como devemos chamar você"
                  disabled={carregando}
                />
              </div>
            )}

            <div className="login-field">
              <label htmlFor="login-email">E-mail institucional</label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nome@saude.municipio.gov.br"
                disabled={carregando}
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-senha">Senha</label>
              <input
                id="login-senha"
                minLength={modo === 'criar' ? 8 : undefined}
                aria-describedby={modo === 'criar' ? 'signup-privacy' : undefined}
                type="password"
                required
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                value={senha}
                onChange={e => setSenha(e.target.value)}
                disabled={carregando}
              />
            </div>

            {modo === 'criar' && (
              <div className="login-field">
                <label htmlFor="login-confirma">Confirmar senha</label>
                <input
                  id="login-confirma"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmaSenha}
                  onChange={e => setConfirmaSenha(e.target.value)}
                  disabled={carregando}
                />
              </div>
            )}

            {modo === 'criar' && <p id="signup-privacy" className="form-privacy">
              Use ao menos 8 caracteres na senha. Nome e e-mail identificam sua conta e seu acesso institucional.
              Consulte os <a href="/termos" target="_blank" rel="noopener noreferrer">termos de uso (nova aba)</a> e a <a href="/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade (nova aba)</a> antes de criar a conta.
            </p>}
            <button type="submit" disabled={carregando} className="login-submit touch-target">
              {modo === 'criar'
                ? (acaoCarregando === 'signup' ? 'Criando conta…' : 'Criar conta')
                : (acaoCarregando === 'login' ? 'Verificando credenciais…' : 'Entrar com credenciais')}
            </button>
          </form>
          )}

          {aviso && (
            <div className="login-feedback login-feedback--ok" role="status" aria-live="polite">
              <MIcon m="check_circle" size={19} />
              <span>{aviso}</span>
            </div>
          )}

          {erro && (
            <div className="login-feedback" role="alert" aria-live="assertive">
              <MIcon m="error" size={19} />
              <span>{erro}</span>
            </div>
          )}

          {etapa === 'credenciais' && (
            <div className="login-demo">
              <p className="login-demo__description">Conheça a plataforma sem uma conta institucional.</p>
              <button
                type="button"
                onClick={loginDemonstracao}
                disabled={carregando}
                className="login-demo__button touch-target"
              >
                {acaoCarregando === 'demo' ? 'Preparando demonstração…' : 'Acessar demonstração'}
                <MIcon m="arrow_forward" size={17} />
              </button>
            </div>
          )}

          <p className="login-access__footer">A demonstração depende de habilitação neste ambiente.</p>
          <details className="login-useful-links">
            <summary>Links úteis</summary>
            <LegalLinks />
          </details>
        </section>
      </main>

      <footer className="login-footer">
        <span>Projeto acadêmico FIAP 2026</span>
        <span>Fontes públicas DATASUS</span>
      </footer>
    </div>
  );
}
