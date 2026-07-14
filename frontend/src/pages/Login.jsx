import { useState } from 'react';
import { LogoIcon, API_BASE } from '../shared/ui.jsx';

// ─── Tela de login / cadastro ─────────────────────────────────────────────────
//
// Sistema de autenticação ainda não implementado. Único caminho funcional é
// entrar como Márcia Oliveira (usuário de demonstração). "Criar conta" exibe
// aviso de que o cadastro está em construção.

export default function LoginScreen({ onEnter }) {
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    setCarregando(true);
    try {
      const path = modo === 'login' ? 'login' : 'signup';
      const resp = await fetch(`${API_BASE}/api/auth/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: senha }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Falha na autenticação.');

      if (modo === 'signup') {
        setModo('login');
        setErro('Conta criada. Verifique seu e-mail (se confirmação estiver ativa) e entre.');
        return;
      }
      if (!data.access_token) throw new Error('Resposta de login sem token.');
      localStorage.setItem('sus_predict_token', data.access_token);
      onEnter();
    } catch (err) {
      setErro(err.message || 'Erro ao autenticar.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', background: '#F6F5F2',
      fontFamily: 'Inter, sans-serif', overflow: 'hidden',
    }}>
      {/* ── Painel de marca (esquerda) ─────────────────────────────────── */}
      <div style={{
        flex: '1 1 52%', position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 56px',
        background: 'linear-gradient(150deg, #1E3C3C 0%, #1B5E6E 100%)',
        color: '#C8D8D5', overflow: 'hidden',
        // dá ao LogoIcon (usa var(--sb-text)) um tom claro sobre o teal escuro
        '--sb-text': '#DCEBE8',
      }}>
        {/* textura de grade sutil */}
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.06, pointerEvents: 'none',
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }} />
        {/* brilho radial */}
        <div style={{
          position: 'absolute', top: '-20%', right: '-10%', width: 520, height: 520,
          borderRadius: '50%', pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(77,184,160,0.28) 0%, transparent 70%)',
        }} />

        {/* topo: logo */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <LogoIcon size={44} />
          <p style={{ fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 20, color: '#FFFFFF', lineHeight: 1, margin: 0 }}>
            SusPredict
          </p>
        </div>

        {/* meio: headline */}
        <div style={{ position: 'relative', maxWidth: 460 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 10, fontWeight: 700,
            letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8FCFC0',
            background: 'rgba(77,184,160,0.12)', border: '1px solid rgba(77,184,160,0.3)',
            padding: '5px 11px', borderRadius: 999, marginBottom: 22,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4DB8A0' }} />
            Inteligência epidemiológica
          </span>
          <h1 style={{
            fontFamily: 'Inter Tight, sans-serif', fontWeight: 800, fontSize: 38, lineHeight: 1.08,
            color: '#FFFFFF', margin: '0 0 16px', letterSpacing: '-0.02em',
          }}>
            Antecipe a demanda do SUS{' '}
            <span style={{ color: '#7FD4C0' }}>
              antes que ela chegue.
            </span>
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#A9CFC9', margin: 0 }}>
            Análise preditiva de óbitos, internações e notificações por município e período.
            Modelos sobre dados públicos do DATASUS.
          </p>

          {/* mini-stats */}
          <div style={{ display: 'flex', gap: 36, marginTop: 36 }}>
            {[['5.570', 'municípios'], ['6', 'bases SUS'], ['Prophet', '+ OLS']].map(([v, l]) => (
              <div key={l}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 22, fontWeight: 700, color: '#FFFFFF', lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7FA8A2', marginTop: 6 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* rodapé */}
        <p style={{ position: 'relative', fontSize: 11, color: '#6B928C', margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
          TCC 2026 · FIAP · Dados públicos DATASUS
        </p>
      </div>

      {/* ── Painel de acesso (direita) ─────────────────────────────────── */}
      <div style={{
        flex: '1 1 48%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32,
      }}>
        <div style={{ width: '100%', maxWidth: 380 }}>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6B665D', margin: '0 0 6px' }}>
            Bem-vinda de volta
          </p>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 26, fontWeight: 800, color: '#1A1814', margin: '0 0 28px', letterSpacing: '-0.01em' }}>
            Entrar na plataforma
          </h2>

          {/* formulário de acesso */}
          <form onSubmit={handleSubmit}>
            <input
              type="email" required placeholder="E-mail" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '13px 16px', marginBottom: 10, background: '#FFFFFF',
                border: '1.5px solid #E5E1D6', borderRadius: 12, fontSize: 14, color: '#1A1814',
                boxSizing: 'border-box', outline: 'none',
              }}
            />
            <input
              type="password" required placeholder="Senha" value={senha}
              onChange={e => setSenha(e.target.value)}
              style={{
                width: '100%', padding: '13px 16px', marginBottom: 14, background: '#FFFFFF',
                border: '1.5px solid #E5E1D6', borderRadius: 12, fontSize: 14, color: '#1A1814',
                boxSizing: 'border-box', outline: 'none',
              }}
            />
            <button
              type="submit" disabled={carregando}
              style={{
                width: '100%', padding: '13px 16px', background: '#1B5E6E', color: '#fff',
                border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700,
                cursor: carregando ? 'default' : 'pointer', opacity: carregando ? 0.7 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {carregando ? 'Aguarde...' : (modo === 'login' ? 'Entrar' : 'Criar conta')}
            </button>
          </form>

          {/* acesso rápido — usuário mockado, sem Supabase */}
          <button
            type="button"
            onClick={() => { localStorage.setItem('sus_predict_token', 'mock-token'); onEnter(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left',
              padding: '14px 16px', background: '#FFFFFF', border: '1px solid #E5E1D6',
              borderRadius: 14, cursor: 'pointer', transition: 'all 0.15s', margin: '14px 0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4DB8A0'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(27,94,110,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E1D6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)'; }}
          >
            <span style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1B5E6E 0%, #4DB8A0 100%)', color: '#fff',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, fontFamily: 'Inter Tight, sans-serif',
            }}>MO</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#1A1814', lineHeight: 1.2 }}>Márcia Oliveira</span>
              <span style={{ display: 'block', fontSize: 12, color: '#8A8579', marginTop: 2 }}>Gestora municipal · demonstração</span>
            </span>
            <span className="material-symbols-rounded" style={{ fontSize: 20, color: '#1B5E6E' }}>arrow_forward</span>
          </button>

          {/* alternar login/cadastro */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '18px 0 4px' }}>
            <button
              type="button"
              onClick={() => { setModo(modo === 'login' ? 'signup' : 'login'); setErro(''); }}
              style={{
                width: '100%', padding: '11px 16px', background: 'transparent', color: '#1B5E6E',
                border: '1.5px solid #E5E1D6', borderRadius: 12, fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {modo === 'login' ? 'Não tem conta? Criar conta' : 'Já tem conta? Entrar'}
            </button>
          </div>

          {erro && (
            <div className="rise" style={{
              marginTop: 18, padding: '13px 15px', background: '#FBF1E3', border: '1px solid #ECDCC2',
              borderRadius: 12, display: 'flex', gap: 11, alignItems: 'flex-start',
            }}>
              <span className="material-symbols-rounded" style={{ fontSize: 19, color: '#A6580F', flexShrink: 0 }}>construction</span>
              <span style={{ color: '#7A4A12', fontSize: 13, lineHeight: 1.5 }}>{erro}</span>
            </div>
          )}

          <p style={{ marginTop: 28, fontSize: 11.5, color: '#A8A39A', textAlign: 'center', lineHeight: 1.5 }}>
            Ao continuar você concorda com o uso de dados públicos<br />conforme a política de privacidade do SUS Predict.
          </p>
        </div>
      </div>
    </div>
  );
}
