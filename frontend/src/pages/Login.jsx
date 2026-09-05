import { useState } from 'react';
import { LogoIcon, API_BASE, MIcon, THEMES } from '../shared/ui.jsx';
import { saveSession } from '../shared/auth.js';

// O acesso institucional usa autenticação real. A entrada de demonstração usa
// uma sessão isolada emitida pelo backend quando SUS_PREDICT_DEV_AUTH está ativo.
export default function LoginScreen({ onEnter }) {
  const [erro, setErro] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [acaoCarregando, setAcaoCarregando] = useState('');

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
            <h2 id="login-access-title">Entrar no ambiente de trabalho</h2>
            <p>Use as credenciais fornecidas pela sua organização.</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form" noValidate>
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
                type="password"
                required
                autoComplete="current-password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                disabled={carregando}
              />
            </div>

            <button type="submit" disabled={carregando} className="login-submit touch-target">
              {acaoCarregando === 'login' ? 'Verificando credenciais…' : 'Entrar com credenciais'}
            </button>
          </form>

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
      </footer>
    </div>
  );
}
