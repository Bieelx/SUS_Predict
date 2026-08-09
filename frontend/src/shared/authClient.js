import { API_BASE } from './ui.jsx';

export const AUTH_UNAUTHORIZED_EVENT = 'sus-predict:unauthorized';
export const PASSWORD_MIN_LENGTH = 12;

function resolveApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE.replace(/\/$/, '')}${suffix}`;
}

async function errorFromResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  const detail = typeof payload?.detail === 'string' ? payload.detail : '';
  const error = new Error(detail || fallback);
  error.status = response.status;
  return error;
}

async function fetchWithCookies(path, options = {}) {
  return fetch(resolveApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
}

let refreshInFlight = null;

async function refreshSession() {
  if (!refreshInFlight) {
    refreshInFlight = fetchWithCookies('/api/auth/refresh', { method: 'POST' })
      .then(response => response.ok)
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

function notifyUnauthorized() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
  }
}

export async function apiFetch(path, options = {}, retry = true) {
  let response = await fetchWithCookies(path, options);
  if (response.status === 401 && retry) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await fetchWithCookies(path, options);
    }
  }
  if (response.status === 401) notifyUnauthorized();
  return response;
}

async function jsonRequest(path, options, fallback) {
  const response = await fetchWithCookies(path, options);
  if (!response.ok) throw await errorFromResponse(response, fallback);
  return response.json().catch(() => ({}));
}

export async function getCurrentUser() {
  const response = await apiFetch('/api/auth/me', { method: 'GET' });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw await errorFromResponse(response, 'Não foi possível validar sua sessão.');
  const payload = await response.json();
  return payload.user || null;
}

export async function login(email, password) {
  const payload = await jsonRequest(
    '/api/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    'Não foi possível entrar.',
  );
  return payload.user || null;
}

export async function logout() {
  await fetchWithCookies('/api/auth/logout', { method: 'POST' }).catch(() => null);
}

export async function requestPasswordRecovery(email) {
  return jsonRequest(
    '/api/auth/forgot-password',
    {
      method: 'POST',
      body: JSON.stringify({ email }),
    },
    'Não foi possível solicitar a recuperação de senha.',
  );
}

export function readAuthLink(url = window.location.href) {
  const parsedUrl = new URL(url);
  const fragment = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const value = key => fragment.get(key) || parsedUrl.searchParams.get(key);
  const error = value('error_description') || value('error');
  const errorCode = value('error_code');
  const type = value('type');
  const accessToken = fragment.get('access_token');
  const refreshToken = fragment.get('refresh_token');

  if (error) return { error, errorCode, type };
  if (!accessToken || !refreshToken || !['recovery', 'invite'].includes(type)) return null;
  return { accessToken, refreshToken, type };
}

export function clearAuthLinkFromUrl() {
  const url = new URL(window.location.href);
  [
    'access_token',
    'refresh_token',
    'expires_at',
    'expires_in',
    'token_type',
    'type',
    'error',
    'error_code',
    'error_description',
  ].forEach(key => url.searchParams.delete(key));
  url.hash = '';
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}`);
}

export async function acceptAuthLink({ accessToken, refreshToken }) {
  const payload = await jsonRequest(
    '/api/auth/recovery/session',
    {
      method: 'POST',
      body: JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
      }),
    },
    'O link de acesso é inválido ou expirou.',
  );
  return payload.user || null;
}

export async function updatePassword(password) {
  return jsonRequest(
    '/api/auth/password',
    {
      method: 'POST',
      body: JSON.stringify({ password }),
    },
    'Não foi possível alterar a senha.',
  );
}

export async function inviteUser({ email, fullName, jobTitle }) {
  return jsonRequest(
    '/api/admin/users/invite',
    {
      method: 'POST',
      body: JSON.stringify({
        email,
        full_name: fullName,
        job_title: jobTitle,
      }),
    },
    'Não foi possível enviar o convite.',
  );
}

export async function listUsers() {
  const response = await apiFetch('/api/admin/users?per_page=100', { method: 'GET' });
  if (!response.ok) throw await errorFromResponse(response, 'Não foi possível listar os usuários.');
  return response.json();
}

export function passwordRequirements(password) {
  return [
    { label: `${PASSWORD_MIN_LENGTH} caracteres`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'letra maiúscula', ok: /[A-Z]/.test(password) },
    { label: 'letra minúscula', ok: /[a-z]/.test(password) },
    { label: 'número', ok: /\d/.test(password) },
    { label: 'símbolo', ok: /[^A-Za-z0-9\s]/.test(password) },
  ];
}

export function isStrongPassword(password) {
  return passwordRequirements(password).every(item => item.ok) && password.length <= 128;
}
