// A small router: path patterns, JSON bodies, role guards, and one error shape.

export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const MAX_BODY_BYTES = 64 * 1024;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readJson(req) {
  const type = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') throw new HttpError(415, 'Requests must be sent as JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'That request is too large.');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let value;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  return value;
}

// The session cookie is SameSite=Strict; this is a second check that a
// state-changing request really came from our own pages.
function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    throw new HttpError(403, 'Cross-site requests are not allowed.');
  }
  if (host !== req.headers.host) throw new HttpError(403, 'Cross-site requests are not allowed.');
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

  async function dispatch(req, res, url) {
    const matching = routes.filter((r) => r.regex.test(url.pathname));
    if (matching.length === 0) throw new HttpError(404, 'Not found.');
    const route = matching.find((r) => r.method === req.method);
    if (!route) throw new HttpError(405, 'Method not allowed.');

    if (MUTATING.has(req.method)) assertSameOrigin(req);

    const user = authenticate(req);
    if (route.role !== 'public') {
      if (!user) throw new HttpError(401, 'Please sign in to continue.');
      if (route.role !== 'any' && user.role !== route.role) {
        throw new HttpError(403, 'Your account does not have access to this.');
      }
    }

    const match = route.regex.exec(url.pathname);
    const params = {};
    route.keys.forEach((key, i) => (params[key] = Number(match[i + 1])));

    const ctx = {
      req,
      res,
      user,
      params,
      query: Object.fromEntries(url.searchParams),
      body: MUTATING.has(req.method) ? await readJson(req) : {},
      status: 200,
    };
    const result = await route.handler(ctx);
    if (!res.writableEnded) sendJson(res, ctx.status, result ?? { ok: true });
  }

  async function handle(req, res, url) {
    try {
      await dispatch(req, res, url);
    } catch (err) {
      if (res.writableEnded) return;
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { message: err.message, ...err.extra } });
      } else {
        console.error(err);
        sendJson(res, 500, { error: { message: 'Something went wrong on the server.' } });
      }
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
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00`))) {
    throw new HttpError(400, `${label} must be a date like 2026-01-31.`);
  }
  return value;
}
