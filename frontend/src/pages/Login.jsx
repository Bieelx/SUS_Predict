import { useState } from 'react';
import { LogoIcon, API_BASE, MIcon, THEMES } from '../shared/ui.jsx';
import './login.css';
import { LegalLinks } from './Legal.jsx';
import { saveSession } from '../shared/auth.js';

// O acesso institucional usa autenticação real. No App, a demonstração abre
// o replay histórico local. O callback legado de dev-login é mantido para outros consumidores.
// O Supabase emite o código com o tamanho configurado no projeto (Authentication →
// Providers → Email → OTP length), entre 6 e 10 dígitos. Fixar 6 aqui truncava um código
// de 8 e o backend recusava um código correto como inválido.
const CODIGO_MIN = 6;
const CODIGO_MAX = 10;

export default function LoginScreen({ onEnter, onDemoHistorica, demoCarregando = false, demoErro }) {
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
  const [mostrarSenha, setMostrarSenha] = useState(false);

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
    if (informado.length < CODIGO_MIN) {
      setErro('Digite o código completo que enviamos por e-mail.');
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

  const carregando = !!acaoCarregando || demoCarregando;
  const temaLogin = THEMES.teal.vars;
  const tipoSenha = mostrarSenha ? 'text' : 'password';

  const titulo = etapa === 'codigo'
    ? 'Confirme o código'
    : modo === 'criar' ? 'Criar sua conta' : 'Entrar no SusPredict';
  const subtitulo = etapa === 'codigo'
    ? 'Digite o código que enviamos para o seu e-mail.'
    : modo === 'criar'
      ? 'Novas contas entram como visitante até a liberação por um administrador.'
      : 'Use o e-mail institucional da sua secretaria.';

  return (
    <div className="login-page" style={temaLogin}>
      <a className="skip-link" href="#conteudo-principal">Pular para o conteúdo</a>

      <aside className="login-brand" aria-label="Sobre o SusPredict">
        <div className="login-brand__mark">
          <span className="login-brand__logo"><LogoIcon size={30} /></span>
          <span>SusPredict</span>
        </div>

        <div className="login-brand__copy">
          <h1>Prever antes de reagir.</h1>
          <p>Séries do DATASUS, previsões e alertas reunidos para a gestão municipal saber onde agir hoje.</p>
        </div>

        <PrevisaoIlustrativa />

        <div className="login-brand__foot">
          <span>Projeto acadêmico FIAP 2026</span>
          <span>Fontes públicas DATASUS</span>
        </div>
      </aside>

      <main id="conteudo-principal" tabIndex={-1} className="login-main">
        <section className="login-access" aria-labelledby="login-access-title">
          <div className="login-access__heading">
            <h2 id="login-access-title">{titulo}</h2>
            <p>{subtitulo}</p>
          </div>

          {etapa === 'credenciais' && (
            <div className="login-tabs" role="group" aria-label="Modo de acesso" data-modo={modo}>
              <button type="button" aria-pressed={modo === 'entrar'} className="login-tab" onClick={() => trocarModo('entrar')} disabled={carregando}>Entrar</button>
              <button type="button" aria-pressed={modo === 'criar'} className="login-tab" onClick={() => trocarModo('criar')} disabled={carregando}>Criar conta</button>
            </div>
          )}

          {etapa === 'codigo' ? (
            <form key="codigo" onSubmit={handleCodigo} className="login-form login-step" aria-busy={carregando}>
              <div className="login-field">
                <label htmlFor="login-codigo">Código de verificação</label>
                <input
                  id="login-codigo"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODIGO_MAX}
                  required
                  autoFocus
                  value={codigo}
                  onChange={e => setCodigo(e.target.value.replace(/\D/g, '').slice(0, CODIGO_MAX))}
                  placeholder="······"
                  className="login-input-codigo"
                  disabled={carregando}
                />
              </div>

              <button type="submit" disabled={carregando} className="login-submit touch-target">
                {acaoCarregando === 'codigo' ? 'Verificando…' : 'Confirmar e entrar'}
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
          <form key={modo} onSubmit={modo === 'criar' ? handleSignup : handleSubmit} className="login-form login-step" aria-busy={carregando}>
            {modo === 'criar' && (
              <div className="login-field">
                <label htmlFor="login-nome">Nome</label>
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
              <div className="login-password">
                <input
                  id="login-senha"
                  minLength={modo === 'criar' ? 8 : undefined}
                  aria-describedby={modo === 'criar' ? 'signup-privacy' : undefined}
                  type={tipoSenha}
                  required
                  autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder={modo === 'criar' ? 'Mínimo de 8 caracteres' : undefined}
                  disabled={carregando}
                />
                <button
                  type="button"
                  className="login-password__toggle"
                  onClick={() => setMostrarSenha(v => !v)}
                  aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={mostrarSenha}
                  disabled={carregando}
                >
                  <MIcon m={mostrarSenha ? 'visibility_off' : 'visibility'} size={20} />
                </button>
              </div>
            </div>

            {modo === 'criar' && (
              <div className="login-field">
                <label htmlFor="login-confirma">Confirmar senha</label>
                <input
                  id="login-confirma"
                  type={tipoSenha}
                  required
                  autoComplete="new-password"
                  value={confirmaSenha}
                  onChange={e => setConfirmaSenha(e.target.value)}
                  disabled={carregando}
                />
              </div>
            )}

            {modo === 'criar' && <p id="signup-privacy" className="form-privacy">
              Nome e e-mail identificam sua conta e seu acesso institucional.
              Ao criar a conta você concorda com os <a href="/termos" target="_blank" rel="noopener noreferrer">termos de uso (nova aba)</a> e a <a href="/privacidade" target="_blank" rel="noopener noreferrer">política de privacidade (nova aba)</a>.
            </p>}
            <button type="submit" disabled={carregando} className="login-submit touch-target">
              {modo === 'criar'
                ? (acaoCarregando === 'signup' ? 'Criando conta…' : 'Criar conta')
                : (acaoCarregando === 'login' ? 'Verificando…' : 'Entrar')}
            </button>
          </form>
          )}

          {aviso && (
            <div className="login-feedback login-feedback--ok" role="status" aria-live="polite">
              <MIcon m="check_circle" size={19} />
              <span>{aviso}</span>
            </div>
          )}

          {(erro || demoErro) && (
            <div className="login-feedback" role="alert" aria-live="assertive">
              <MIcon m="error" size={19} />
              <span>{erro || demoErro}</span>
            </div>
          )}

          {etapa === 'credenciais' && (
            <>
              <p className="login-demo">ou conheça a plataforma sem conta</p>
              <button
                type="button"
                onClick={onDemoHistorica || loginDemonstracao}
                disabled={carregando}
                className="login-demo__button touch-target"
              >
                {(acaoCarregando === 'demo' || demoCarregando) ? 'Preparando demonstração…' : 'Acessar demonstração'}
                <MIcon m="arrow_forward" size={18} />
              </button>
              <p className="login-access__footer">Replay de Campinas em 2024, com casos históricos e estoque simulado.</p>
            </>
          )}

          <details className="login-useful-links">
            <summary>Links úteis</summary>
            <LegalLinks />
          </details>
        </section>
      </main>
    </div>
  );
}

// Curva ilustrativa: observado em traço contínuo, previsão tracejada com faixa
// de confiança. Estática e decorativa; a animação de desenho vive no CSS.
function PrevisaoIlustrativa() {
  return (
    <svg className="login-chart" viewBox="0 0 520 220" role="img" aria-label="Ilustração de uma série temporal com previsão">
      {[40, 90, 140, 190].map(y => <line key={y} className="login-chart__grid" x1="0" x2="520" y1={y} y2={y} />)}
      <line className="login-chart__grid" x1="372" x2="372" y1="20" y2="200" strokeDasharray="3 5" />
      <path className="login-chart__band" d="M372 96 C400 90 430 80 460 74 L505 66 L505 110 L460 104 C430 100 400 100 372 96 Z" />
      <path className="login-chart__real" pathLength="1"
        d="M15 168 C45 165 60 150 85 152 S130 172 150 160 S185 118 210 126 S245 150 265 142 S300 106 320 96 S350 92 372 96" />
      <path className="login-chart__prev" pathLength="1" d="M372 96 C400 94 430 88 460 84 L505 78" />
      <circle className="login-chart__dot--halo" cx="372" cy="96" r="5" />
      <circle className="login-chart__dot" cx="372" cy="96" r="5" />
      <text className="login-chart__label" x="15" y="208">observado</text>
      <text className="login-chart__label login-chart__label--prev" x="380" y="208">previsto</text>
    </svg>
  );
}
