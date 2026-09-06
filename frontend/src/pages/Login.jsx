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
    setErro('');
    setAviso('');
    setSenha('');
    setConfirmaSenha('');
  }

  async function handleSignup(e) {
    e.preventDefault();
    setErro('');
    setAviso('');
    if (!nome.trim() || !email.trim() || !senha) {
      setErro('Informe nome, e-mail e senha para criar a conta.');
      return;
    }
    if (senha.length < 6) {
      setErro('A senha precisa ter pelo menos 6 caracteres.');
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
      if (!resp.ok) throw new Error(data.detail || data.msg || 'Não foi possível criar a conta.');
      if (data.access_token) {
        // Supabase devolveu sessão: entra direto. Perfil inicial é visitante (docs/09).
        saveSession(data);
        onEnter(data.user || null);
        return;
      }
      // Confirmação de e-mail ligada no Supabase: sem sessão até confirmar.
      trocarModo('entrar');
      setAviso('Conta criada. Confirme o e-mail recebido e depois entre com suas credenciais. O acesso aos dados é liberado por um administrador.');
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
      await concluirLogin(resp);
    } catch (err) {
      setErro(err.message || 'Não foi possível autenticar.');
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
              <dd>Vigilância epidemiológica, aquisições e planejamento</dd>
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
            <h2 id="login-access-title">{modo === 'criar' ? 'Criar conta de acesso' : 'Entrar no ambiente de trabalho'}</h2>
            <p>{modo === 'criar' ? 'Novas contas entram como visitante até a liberação por um administrador.' : 'Use as credenciais fornecidas pela sua organização.'}</p>
          </div>

          <div className="login-tabs" role="group" aria-label="Modo de acesso">
            <button type="button" aria-pressed={modo === 'entrar'} className="login-tab" onClick={() => trocarModo('entrar')} disabled={carregando}>Entrar</button>
            <button type="button" aria-pressed={modo === 'criar'} className="login-tab" onClick={() => trocarModo('criar')} disabled={carregando}>Criar conta</button>
          </div>

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
                minLength={modo === 'criar' ? 6 : undefined}
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
              Use ao menos 6 caracteres na senha. Nome e e-mail identificam sua conta e seu acesso institucional.
              Consulte os <a href="/termos" target="_blank" rel="noopener noreferrer">termos de uso (nova aba)</a> e a <a href="/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade (nova aba)</a> antes de criar a conta.
            </p>}
            <button type="submit" disabled={carregando} className="login-submit touch-target">
              {modo === 'criar'
                ? (acaoCarregando === 'signup' ? 'Criando conta…' : 'Criar conta')
                : (acaoCarregando === 'login' ? 'Verificando credenciais…' : 'Entrar com credenciais')}
            </button>
          </form>

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

          <div className="login-demo">
            <div className="login-demo__copy">
              <div>
                <span className="login-demo__badge">Ambiente de demonstração</span>
                <h3>Explorar sem credenciais institucionais</h3>
              </div>
              <p>Acesso local de demonstração, quando habilitado. Os painéis consultam as mesmas fontes de dados; esta entrada não cria estoques ou preços fictícios.</p>
            </div>
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

          <p className="login-access__footer">
            Acesso restrito. As ações realizadas no ambiente institucional devem seguir os fluxos de revisão e aprovação do município.
          </p>
        </section>
      </main>

      <footer className="login-footer">
        <span>Projeto acadêmico FIAP 2026</span>
        <span>Fontes públicas DATASUS</span>
        <LegalLinks />
      </footer>
    </div>
  );
}
