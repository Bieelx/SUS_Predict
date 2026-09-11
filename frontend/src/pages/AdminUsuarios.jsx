import { useEffect, useMemo, useState } from 'react';
import { Badge, Card } from '../shared/ui.jsx';
import { authenticatedFetch } from '../shared/auth.js';

// ─── Administração de usuários (docs/09, Fase 4 antecipada) ───────────────────
//
// Renderizada dentro de Configurações só quando /api/auth/me diz perfil admin.
// Esconder aqui é cosmético: todo endpoint /api/admin/* confere admin no backend.
// Caso de uso principal: alguém cria conta, o admin acha pelo e-mail e libera.

const PERFIS = ['visitante', 'gestor', 'vigilancia', 'farmacia', 'admin'];
const COR = { admin: '#7A3E9D', gestor: 'var(--primary)', vigilancia: '#A6580F', farmacia: '#2A6B40', visitante: '#6B665D' };

function fmt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

async function chamar(path, options) {
  const r = await authenticatedFetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) } });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(payload.detail || `Falha (${r.status}).`);
  return payload;
}

const btn = { fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--ink-100)', background: '#fff', cursor: 'pointer', color: '#1A1814' };

function Confirmacao({ texto, onConfirmar, onCancelar, ocupado }) {
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.35)', display: 'grid', placeItems: 'center', zIndex: 60 }}>
      <Card className="p-5" style={{ width: 'min(420px, 92vw)' }}>
        <p style={{ fontSize: 14, color: '#1A1814', lineHeight: 1.5, marginBottom: 16 }}>{texto}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" style={btn} onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          <button type="button" style={{ ...btn, background: 'var(--primary)', color: '#fff', border: 'none' }} onClick={onConfirmar} disabled={ocupado} autoFocus>
            {ocupado ? 'Aplicando…' : 'Confirmar'}
          </button>
        </div>
      </Card>
    </div>
  );
}

function Linha({ u, euId, onPerfil, onAtivo, onMunicipios }) {
  const [perfil, setPerfil] = useState(u.perfil || 'gestor');
  const [municipios, setMunicipios] = useState((u.municipios || []).join(', '));
  useEffect(() => setMunicipios((u.municipios || []).join(', ')), [u.municipios]);
  const souEu = u.usuario === euId;
  const semAcesso = u.sem_acesso;
  return (
    <tr style={{ background: semAcesso ? 'color-mix(in srgb, var(--warn, #A6580F) 8%, white)' : 'transparent', borderBottom: '1px solid #EFEBE0' }}>
      <td style={{ padding: '10px 8px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1814', wordBreak: 'break-all' }}>{u.email || <span style={{ color: 'var(--ink-300)' }}>(sem e-mail no Auth)</span>}{souEu && <span style={{ fontSize: 11, color: 'var(--ink-400)', marginLeft: 6 }}>você</span>}</div>
        <div style={{ fontSize: 11, color: 'var(--ink-300)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{u.usuario}</div>
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary>Municípios autorizados ({u.municipios?.length || 0})</summary>
          <p>Estoque local e ações exigem município autorizado. A lista vazia permite apenas as fontes públicas do perfil.</p>
          {!souEu && !semAcesso && <form onSubmit={e => { e.preventDefault(); onMunicipios(u, municipios.split(/[,;\s]+/).filter(Boolean)); }}>
            <label>Códigos IBGE (6 dígitos, separados por vírgula)
              <input aria-label={`Municípios de ${u.email || u.usuario}`} value={municipios} onChange={e => setMunicipios(e.target.value)} style={{ ...btn, display: 'block', width: '100%', minHeight: 44, margin: '6px 0' }} />
            </label>
            <button type="submit" style={{ ...btn, minHeight: 44 }}>Salvar municípios</button>
          </form>}
        </details>
      </td>
      <td style={{ padding: '10px 8px' }}>
        {semAcesso
          ? <Badge label="Sem acesso" color="#A6580F" />
          : <Badge label={u.perfil} color={COR[u.perfil] || '#6B665D'} />}
      </td>
      <td style={{ padding: '10px 8px', fontSize: 12, color: semAcesso ? 'var(--ink-300)' : u.ativo ? 'var(--good)' : '#B3261E', fontWeight: 600 }}>
        {semAcesso ? '—' : u.ativo ? 'Ativo' : 'Desativado'}
      </td>
      <td style={{ padding: '10px 8px', fontSize: 12, color: 'var(--ink-400)', whiteSpace: 'nowrap' }}>{fmt(u.ultimo_acesso)}</td>
      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
        {souEu || u.perfil === 'admin' ? (
          <span style={{ fontSize: 11, color: 'var(--ink-300)' }}>{souEu ? 'Só por SQL' : 'Admin: só por SQL'}</span>
        ) : (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select aria-label={`Perfil de ${u.email || u.usuario}`} value={perfil} onChange={e => setPerfil(e.target.value)} style={{ ...btn, padding: '5px 6px' }}>
              {PERFIS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <button type="button" style={{ ...btn, background: semAcesso ? 'var(--primary)' : '#fff', color: semAcesso ? '#fff' : '#1A1814', border: semAcesso ? 'none' : btn.border }}
              disabled={!semAcesso && perfil === u.perfil} onClick={() => onPerfil(u, perfil)}>
              {semAcesso ? 'Liberar' : 'Alterar'}
            </button>
            {!semAcesso && (
              <button type="button" style={btn} onClick={() => onAtivo(u, !u.ativo)}>{u.ativo ? 'Desativar' : 'Ativar'}</button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminUsuarios({ euId }) {
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [pendente, setPendente] = useState(null); // { texto, executar }
  const [ocupado, setOcupado] = useState(false);

  const carregar = () => {
    setErro('');
    chamar('/api/admin/usuarios').then(setUsuarios).catch(e => setErro(e.message));
  };
  useEffect(carregar, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!usuarios) return [];
    return q ? usuarios.filter(u => (u.email || '').toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q)) : usuarios;
  }, [usuarios, busca]);
  const semAcesso = usuarios ? usuarios.filter(u => u.sem_acesso).length : 0;

  const aplicar = (texto, path, body) => setPendente({
    texto,
    executar: async () => {
      setOcupado(true);
      try {
        await chamar(path, { method: 'PUT', body: JSON.stringify(body) });
        setPendente(null);
        carregar();
      } catch (e) {
        setErro(e.message);
        setPendente(null);
      } finally {
        setOcupado(false);
      }
    },
  });
  const nome = u => u.email || u.usuario;
  const onPerfil = (u, perfil) => aplicar(
    perfil === 'admin'
      ? `Tornar ${nome(u)} ADMINISTRADOR? Essa pessoa poderá gerenciar o acesso de todos os usuários, inclusive promover outros admins. Rebaixá-la depois só por SQL manual.`
      : u.sem_acesso ? `Liberar ${nome(u)} como "${perfil}"?` : `Alterar o perfil de ${nome(u)} de "${u.perfil}" para "${perfil}"?`,
    `/api/admin/usuarios/${encodeURIComponent(u.usuario)}/perfil`, { perfil },
  );
  const onMunicipios = (u, municipios) => aplicar(
    `Autorizar ${nome(u)} para dados locais e ações nos municípios ${municipios.join(', ') || '(nenhum)'}?`,
    `/api/admin/usuarios/${encodeURIComponent(u.usuario)}/municipios`, { municipios },
  );
  const onAtivo = (u, ativo) => aplicar(
    `${ativo ? 'Ativar' : 'Desativar'} o acesso de ${nome(u)}?`,
    `/api/admin/usuarios/${encodeURIComponent(u.usuario)}/ativo`, { ativo },
  );

  return (
    <Card className="p-5" style={{ marginBottom: 20, border: '1px solid var(--ink-100)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #EFEBE0' }}>
        <div>
          <h2 style={{ fontFamily: 'Inter Tight, sans-serif', fontSize: 15, fontWeight: 700, color: '#1A1814' }}>Usuários e acesso</h2>
          <p style={{ fontSize: 12, color: 'var(--ink-400)' }}>Todas as contas do Auth, inclusive quem nunca entrou. Rebaixar um admin existente só por SQL manual.</p>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: semAcesso ? '#A6580F' : 'var(--ink-300)' }}>
          {usuarios ? `${usuarios.length} contas · ${semAcesso} sem acesso` : 'administração'}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input type="search" placeholder="Buscar por e-mail ou UUID" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar usuário"
          style={{ flex: 1, fontSize: 13, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--ink-100)' }} />
        <button type="button" style={btn} onClick={carregar}>Atualizar</button>
      </div>

      {erro && <p role="alert" style={{ fontSize: 13, color: '#B3261E', marginBottom: 10 }}>{erro}</p>}
      {!usuarios && !erro && <p style={{ fontSize: 13, color: 'var(--ink-400)' }}>Carregando…</p>}
      {usuarios && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ink-300)', textAlign: 'left' }}>
                {['Usuário', 'Perfil', 'Status', 'Último acesso', 'Ações'].map(h => <th key={h} style={{ padding: '6px 8px', fontWeight: 700 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(u => <Linha key={u.usuario} u={u} euId={euId} onPerfil={onPerfil} onAtivo={onAtivo} onMunicipios={onMunicipios} />)}
              {filtrados.length === 0 && <tr><td colSpan={5} style={{ padding: 14, fontSize: 13, color: 'var(--ink-400)' }}>Nenhum usuário encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {pendente && <Confirmacao texto={pendente.texto} onConfirmar={pendente.executar} onCancelar={() => setPendente(null)} ocupado={ocupado} />}
    </Card>
  );
}
