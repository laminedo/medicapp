// Thin wrapper over fetch: JSON in, JSON out, one error type.
//
// The app runs in two arrangements. Served by its own Node server, the session
// is an HttpOnly cookie the page never sees. Served from GitHub Pages, the API
// is at another address where a cookie would be blocked as third-party, so the
// session token is kept here and sent as a Bearer header instead.

const BASE = (window.MEDICAPP?.apiBase || '').replace(/\/+$/, '');
const TOKEN_MODE = BASE !== '';
const TOKEN_KEY = 'medicapp.session';

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const store = {
  read() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null; // storage can be unavailable in a private window
    }
  },
  write(value) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // The session then lasts only until the page is closed.
    }
  },
};

let token = TOKEN_MODE ? store.read() : null;
const setToken = (value) => {
  token = value;
  store.write(value);
};

let onSignedOut = null;
export const setSignedOutHandler = (fn) => (onSignedOut = fn);

// The calls that start a session ask for the token back when in token mode.
const STARTS_SESSION = new Set(['/api/auth/login', '/api/setup']);

async function send(method, path, body) {
  const init = { method, credentials: TOKEN_MODE ? 'omit' : 'same-origin', headers: {} };
  if (token) init.headers.Authorization = `Bearer ${token}`;
  if (method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(TOKEN_MODE && STARTS_SESSION.has(path) ? { ...body, client: 'token' } : (body ?? {}));
  }
  try {
    return await fetch(BASE + path, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
}

async function fail(res, path) {
  const data = await res.json().catch(() => null);
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    setToken(null);
    onSignedOut?.();
  }
  return new ApiError(data?.error?.message || 'Something went wrong. Try again.', res.status, data?.error);
}

async function request(method, path, body) {
  const res = await send(method, path, body);
  if (!res.ok) throw await fail(res, path);
  const data = await res.json().catch(() => null);
  if (TOKEN_MODE && data?.token && STARTS_SESSION.has(path)) setToken(data.token);
  if (path === '/api/auth/logout') setToken(null);
  return data;
}

// Fetches a file and hands it to the browser to save. A plain link cannot do
// this in token mode, because a link cannot carry the Bearer header.
async function download(path, fallbackName) {
  const res = await send('GET', path);
  if (!res.ok) throw await fail(res, path);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
  download,
};
