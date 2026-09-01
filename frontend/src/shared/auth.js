import { API_BASE } from './ui.jsx';
import { limparCacheSessao } from './sessionCache.js';

const ACCESS_TOKEN_KEY = 'sus_predict_token';
const REFRESH_TOKEN_KEY = 'sus_predict_refresh_token';
let usuarioAtual = null;

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) || '';
}

export function saveSession(session, { preservarCache = false } = {}) {
  if (!session?.access_token) throw new Error('A autenticação não retornou uma sessão válida.');
  if (!preservarCache && getAccessToken() !== session.access_token) limparCacheSessao();
  localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
  if (session.refresh_token) localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
  if (session.user) usuarioAtual = session.user;
}

export function clearSession() {
  usuarioAtual = null;
  limparCacheSessao();
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function refreshSession() {
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  if (!refreshToken) return false;

  const response = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) return false;
  saveSession(await response.json(), { preservarCache: true });
  return true;
}

export async function authenticatedFetch(path, options = {}) {
  const request = () => fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${getAccessToken()}`,
    },
  });

  let response = await request();
  if (response.status === 401 && await refreshSession()) response = await request();
  if (response.status === 401) clearSession();
  return response;
}

export async function validateSession() {
  if (!getAccessToken()) return null;
  try {
    const response = await authenticatedFetch('/api/auth/me');
    if (!response.ok) return null;
    usuarioAtual = await response.json();
    return usuarioAtual;
  } catch {
    return null;
  }
}

export function getCurrentUser() {
  return usuarioAtual;
}

export async function signOut() {
  const token = getAccessToken();
  try {
    if (token) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  } finally {
    clearSession();
  }
}
