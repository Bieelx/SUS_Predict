import { useState, useEffect, useRef } from 'react';
import { Card } from '../shared/ui.jsx';
import { authenticatedFetch, getCurrentUser, setCurrentUser } from '../shared/auth.js';

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
// A auditoria de UX (P1-2) removeu o log de "atividades recentes" — era uma lista
// estática inventada, sem lastro em nenhum evento real do backend. O que voltou
// aqui não é enfeite: nome, foto, e-mail e senha são gravados de verdade via
// `PUT /api/auth/me`, que fala com o GoTrue do Supabase.
//
// A foto mora no `user_metadata` do próprio usuário, como data URL de no máximo
// 150KB — por isso o corte para 256px em JPEG acontece no navegador, antes de
// enviar. Sem bucket de Storage, sem upload de arquivo cru: um avatar não
// justifica infraestrutura de arquivos. Se um dia precisar de imagem grande ou
// de várias, aí sim vale o Supabase Storage.

const AVATAR_PX = 256;

function fmtDataHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

// Redimensiona e recorta a imagem escolhida num quadrado de 256px, devolvendo
// data URL JPEG (~15KB). Sem biblioteca: canvas basta.
function arquivoParaAvatar(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const lado = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = AVATAR_PX;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, AVATAR_PX, AVATAR_PX);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler essa imagem.')); };
    img.src = url;
  });
}

const inputStyle = {
  width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E1D6',
  background: '#FDFDFD', fontSize: 13, color: '#1A1814', fontFamily: 'inherit',
};

function Campo({ label, hint, ...props }) {
  return (
    <label style={{ display: 'block', marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6B665D', marginBottom: 5 }}>{label}</span>
      <input style={inputStyle} {...props} />
      {hint && <span style={{ display: 'block', fontSize: 11, color: 'var(--ink-400)', marginTop: 5, lineHeight: 1.4 }}>{hint}</span>}
    </label>
  );
}

function Botao({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        padding: '9px 18px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: 'none',
        color: 'white', background: 'var(--primary-dark)', cursor: props.disabled ? 'default' : 'pointer',
        opacity: props.disabled ? 0.5 : 1, ...props.style,
      }}
    >
      {children}
    </button>
  );
}

function Aviso({ tipo, children }) {
  if (!children) return null;
  const cor = tipo === 'erro'
    ? { color: '#8A2A38', background: '#FBEAEA', border: '1px solid #E9C2C2' }
    : { color: '#1F5D45', background: '#E9F5EF', border: '1px solid #BFE0D0' };
  return (
    <p style={{ ...cor, padding: '9px 12px', borderRadius: 8, fontSize: 12, lineHeight: 1.5, marginBottom: 14 }}>{children}</p>
  );
}

export default function PagePerfil({ onLogout, user: userProp, onUserChange }) {
  const [user, setUser] = useState(() => userProp || getCurrentUser());
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(() => !userProp && !getCurrentUser());

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

  // Uma única porta de saída para as três edições: guarda o usuário novo no
  // estado local, no cache da sessão e no App (sidebar), tudo de uma vez.
  async function salvar(campos) {
    const r = await authenticatedFetch('/api/auth/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campos),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(corpo.detail || 'Não foi possível salvar.');
    const atualizado = { ...user, ...corpo };
    setUser(atualizado);
    setCurrentUser(atualizado);
    onUserChange?.(atualizado);
    return corpo;
  }

  const email = user?.email || '—';
  const nome = user?.user_metadata?.nome || (user?.email ? email.split('@')[0] : 'Usuário');
  const avatar = user?.user_metadata?.avatar || '';
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
        <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Seus dados de acesso ao SusPredict.</p>
      </div>

      {erro && <Card className="p-4 mb-5" style={{ color: '#8A2A38', background: '#FBEAEA', border: '1px solid #E9C2C2' }}>{erro}</Card>}

      <div className="responsive-grid-2" style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* Coluna esquerda */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <CardIdentidade
            nome={nome} email={email} avatar={avatar} iniciais={iniciais}
            carregando={carregando} salvar={salvar}
          />
          <CardEmail emailAtual={email} salvar={salvar} />
          <CardSenha salvar={salvar} />
        </div>

        {/* Coluna direita */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dados cadastrais */}
          <Card className="p-5">
            <LocalCardHead title="Dados cadastrais" />
            {perfilCadastro.map(r => (
              <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 0', fontSize: 13, borderBottom: '1px solid #F5F2EB' }}>
                <span style={{ color: '#6B665D', flexShrink: 0 }}>{r.k}</span>
                <span style={{ fontWeight: 600, color: '#1A1814', fontFamily: 'JetBrains Mono, monospace', fontSize: 13, textAlign: 'right', wordBreak: 'break-word' }}>{r.v}</span>
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
              <button onClick={onLogout} style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#8A2A38', background: '#D94F4F12', border: '1px solid #D94F4F33', cursor: 'pointer', flexShrink: 0 }}>
                Sair
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Identidade: foto + nome ───────────────────────────────────────────────────

function CardIdentidade({ nome, email, avatar, iniciais, carregando, salvar }) {
  const [rascunho, setRascunho] = useState(nome);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');
  const fileRef = useRef(null);

  useEffect(() => { setRascunho(nome); }, [nome]);

  async function aplicar(campos, sucesso) {
    setSalvando(true); setErro(''); setMsg('');
    try {
      await salvar(campos);
      setMsg(sucesso);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  async function escolherFoto(evento) {
    const file = evento.target.files?.[0];
    evento.target.value = '';           // permite reescolher o mesmo arquivo
    if (!file) return;
    try {
      const dataUrl = await arquivoParaAvatar(file);
      await aplicar({ avatar: dataUrl }, 'Foto atualizada.');
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <Card className="p-5">
      <Aviso tipo="erro">{erro}</Aviso>
      <Aviso>{msg}</Aviso>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: 18 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg, var(--primary-dark) 0%, var(--accent) 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: 'white', flexShrink: 0 }}>
          {avatar
            ? <img src={avatar} alt={`Foto de ${nome}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (carregando ? '···' : iniciais)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 20, fontWeight: 800, color: '#1A1814', lineHeight: 1.1, marginBottom: 4 }}>{carregando ? 'Carregando…' : nome}</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-400)', margin: '0 0 10px' }}>{email}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input ref={fileRef} type="file" accept="image/*" onChange={escolherFoto} style={{ display: 'none' }} />
            <button
              type="button" disabled={salvando} onClick={() => fileRef.current?.click()}
              style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#1A1814', background: '#FDFDFD', border: '1px solid #E5E1D6', cursor: 'pointer' }}
            >
              {avatar ? 'Trocar foto' : 'Enviar foto'}
            </button>
            {avatar && (
              <button
                type="button" disabled={salvando} onClick={() => aplicar({ avatar: '' }, 'Foto removida.')}
                style={{ padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#8A2A38', background: 'transparent', border: '1px solid #D94F4F33', cursor: 'pointer' }}
              >
                Remover
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); aplicar({ nome: rascunho }, 'Nome atualizado.'); }}>
        <Campo
          label="Nome de exibição" value={rascunho} onChange={(e) => setRascunho(e.target.value)}
          minLength={2} required hint="É o nome que aparece no menu lateral e nas exportações."
        />
        <Botao type="submit" disabled={salvando || rascunho.trim() === nome.trim()}>
          {salvando ? 'Salvando…' : 'Salvar nome'}
        </Botao>
      </form>
    </Card>
  );
}

// ── Troca de e-mail ───────────────────────────────────────────────────────────

function CardEmail({ emailAtual, salvar }) {
  const [novo, setNovo] = useState('');
  const [senhaAtual, setSenhaAtual] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setMsg('');
    try {
      await salvar({ email: novo.trim(), senha_atual: senhaAtual });
      setNovo(''); setSenhaAtual('');
      setMsg('Enviamos um link de confirmação para o endereço novo. O e-mail só muda depois que você abrir esse link.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="p-5">
      <LocalCardHead title="Alterar e-mail" hint="Confirmação por e-mail" />
      <Aviso tipo="erro">{erro}</Aviso>
      <Aviso>{msg}</Aviso>
      <form onSubmit={enviar} style={{ marginTop: 14 }}>
        <Campo label="Novo e-mail" type="email" value={novo} required autoComplete="email"
               onChange={(e) => setNovo(e.target.value)} hint={`Atual: ${emailAtual}`} />
        <Campo label="Sua senha atual" type="password" value={senhaAtual} required autoComplete="current-password"
               onChange={(e) => setSenhaAtual(e.target.value)} />
        <Botao type="submit" disabled={salvando || !novo.trim() || !senhaAtual}>
          {salvando ? 'Enviando…' : 'Solicitar troca'}
        </Botao>
      </form>
    </Card>
  );
}

// ── Troca de senha ────────────────────────────────────────────────────────────

const SENHA_MINIMA = 8;

function CardSenha({ salvar }) {
  const [senhaAtual, setSenhaAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState('');
  const [erro, setErro] = useState('');

  const divergem = confirmacao.length > 0 && nova !== confirmacao;
  const valido = senhaAtual && nova.length >= SENHA_MINIMA && nova === confirmacao;

  async function enviar(e) {
    e.preventDefault();
    setSalvando(true); setErro(''); setMsg('');
    try {
      await salvar({ senha: nova, senha_atual: senhaAtual });
      setSenhaAtual(''); setNova(''); setConfirmacao('');
      setMsg('Senha alterada. Use a nova no próximo login.');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Card className="p-5">
      <LocalCardHead title="Alterar senha" />
      <Aviso tipo="erro">{erro}</Aviso>
      <Aviso>{msg}</Aviso>
      <form onSubmit={enviar} style={{ marginTop: 14 }}>
        <Campo label="Senha atual" type="password" value={senhaAtual} required autoComplete="current-password"
               onChange={(e) => setSenhaAtual(e.target.value)} />
        <Campo label="Nova senha" type="password" value={nova} required autoComplete="new-password"
               minLength={SENHA_MINIMA} onChange={(e) => setNova(e.target.value)}
               hint={`Pelo menos ${SENHA_MINIMA} caracteres.`} />
        <Campo label="Repita a nova senha" type="password" value={confirmacao} required autoComplete="new-password"
               onChange={(e) => setConfirmacao(e.target.value)}
               hint={divergem ? 'As senhas não são iguais.' : undefined} />
        <Botao type="submit" disabled={salvando || !valido}>
          {salvando ? 'Salvando…' : 'Alterar senha'}
        </Botao>
      </form>
    </Card>
  );
}
