// A small router: path patterns, JSON bodies, role guards, and one error shape.
// It works on plain request and response objects, so the same routes run under
// Node's http server and as a Supabase function.
//
//   request:  { method, path, query, headers, body, ip, secure }
//   response: { status, headers, body }
import { config } from './config.js';

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const MAX_BODY_BYTES = 64 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const json = (status, body, headers = {}) => ({
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  body: JSON.stringify(body),
});

function parseBody(request) {
  const type = (request.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Requests must be sent as JSON.');
  if (!request.body) return {};
  let value;
  try {
    value = JSON.parse(request.body);
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  return value;
}

// A browser says which page a request came from. Changes are accepted only
// from this server's own pages, or from an address listed in allowedOrigins
// (the GitHub Pages site). Apps that are not browsers send no Origin at all.
function assertAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
  if (host === request.headers.host || config.allowedOrigins.includes(origin)) return;
  throw new HttpError(403, 'Cross-site requests are not allowed.');
}

export function createRouter({ authenticate }) {
  const routes = [];

  // opts.role: 'any' (signed in, the default), 'admin', 'staff', or 'public'.
  function add(method, pattern, opts, handler) {
    if (typeof opts === 'function') [opts, handler] = [{}, opts];
    const keys = [];
    const source = pattern.replace(/:([a-z_]+)/gi, (_, key) => {
      keys.push(key);
      return '(\\d+)';
    });
    routes.push({ method, regex: new RegExp(`^${source}/?$`), keys, role: opts.role || 'any', handler });
  }

  async function dispatch(request) {
    const matching = routes.filter((r) => r.regex.test(request.path));
    if (matching.length === 0) throw new HttpError(404, 'Not found.');
    const route = matching.find((r) => r.method === request.method);
    if (!route) throw new HttpError(405, 'Method not allowed.');

    const mutating = MUTATING.has(request.method);
    if (mutating) assertAllowedOrigin(request);

    const user = await authenticate(request.headers);
    if (route.role !== 'public') {
      if (!user) throw new HttpError(401, 'Please sign in to continue.');
      if (route.role !== 'any' && user.role !== route.role) {
        throw new HttpError(403, 'Your account does not have access to this.');
      }
    }

    const match = route.regex.exec(request.path);
    const params = {};
    route.keys.forEach((key, i) => (params[key] = Number(match[i + 1])));

    const headers = {};
    let raw = null;
    const ctx = {
      request,
      user,
      params,
      query: request.query,
      body: mutating ? parseBody(request) : {},
      status: 200,
      setHeader: (name, value) => (headers[name] = value),
      // For the rare response that is not JSON (a CSV download).
      raw: (status, rawHeaders, body) => (raw = { status, headers: rawHeaders, body }),
    };
    const result = await route.handler(ctx);
    return raw ?? json(ctx.status, result ?? { ok: true }, headers);
  }

  async function handle(request) {
    try {
      return await dispatch(request);
    } catch (err) {
      if (err instanceof HttpError) return json(err.status, { error: { message: err.message, ...err.extra } });
      console.error(err);
      return json(500, { error: { message: 'Something went wrong on the server.' } });
    }
  }

  const router = { handle };
  for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
    router[method.toLowerCase()] = (pattern, opts, handler) => add(method, pattern, opts, handler);
  }
  return router;
}

// ---- input validation ------------------------------------------------------

export function text(value, label, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') {
    if (min === 0 && value == null) return '';
    throw new HttpError(400, `${label} is required.`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min) throw new HttpError(400, `${label} is required.`);
  if (trimmed.length > max) throw new HttpError(400, `${label} must be ${max} characters or fewer.`);
  return trimmed;
}

export function number(value, label, { min = -Infinity, max = Infinity, integer = false } = {}) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new HttpError(400, `${label} must be a number.`);
  if (integer && !Number.isInteger(n)) throw new HttpError(400, `${label} must be a whole number.`);
  if (n < min || n > max) throw new HttpError(400, `${label} must be between ${min} and ${max}.`);
  return n;
}

export function oneOf(value, label, options) {
  if (!options.includes(value)) throw new HttpError(400, `${label} must be one of: ${options.join(', ')}.`);
  return value;
}

export function isoDate(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, `${label} must be a date like 2026-01-31.`);
  }
  return value;
}
