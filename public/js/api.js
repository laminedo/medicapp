// Thin wrapper over fetch: JSON in, JSON out, one error type.

export class ApiError extends Error {
  constructor(message, status, data = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

let onSignedOut = null;
export const setSignedOutHandler = (fn) => (onSignedOut = fn);

async function request(method, path, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body ?? {});
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new ApiError(data?.error?.message || 'Something went wrong. Try again.', res.status, data?.error);
    if (res.status === 401 && !path.startsWith('/api/auth/')) onSignedOut?.();
    throw error;
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  del: (path) => request('DELETE', path),
};
