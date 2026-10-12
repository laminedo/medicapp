// Running the server under Node: an http server for the API and the web
// app's files, with SQLite for storage.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createApp } from './app.js';
import { config } from './config.js';
import { get, useDatabase } from './db.js';
import { sqlite } from './db-sqlite.js';
import { PUBLIC_DIR } from './paths.js';
import { MAX_BODY_BYTES, json } from './router.js';
import { seedIfEmpty } from './seed.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
};

useDatabase(sqlite);
const app = createApp();

// Reads the request into the plain shape the router works on.
async function readRequest(req, url) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return {
    method: req.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams),
    headers: req.headers,
    body: size ? Buffer.concat(chunks).toString('utf8') : null,
    ip: req.socket.remoteAddress,
    secure: Boolean(req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https',
  };
}

async function serveApi(req, res, url) {
  const request = await readRequest(req, url);
  const response = request ? await app.handle(request) : json(413, { error: { message: 'That request is too large.' } });
  res.writeHead(response.status, { ...response.headers, 'Content-Length': Buffer.byteLength(response.body) });
  res.end(response.body);
}

async function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  let file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  let info = await stat(file).catch(() => null);
  // Anything that is not a real file is a route inside the single-page app.
  if (!info || info.isDirectory()) {
    if (path.extname(pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    file = path.join(PUBLIC_DIR, 'index.html');
    info = await stat(file);
  }
  const body = await readFile(file);
  res.writeHead(200, {
    'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
  // Behind an HTTPS proxy, tell browsers never to fall back to plain http.
  if (req.headers['x-forwarded-proto'] === 'https') res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await serveApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Something went wrong on the server.' } }));
  }
});

if (config.demoData) {
  if (await seedIfEmpty()) console.log('First run: added sample data. Demo sign-ins are listed in README.md.');
} else if ((await get('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users')).n === 0) {
  console.log('No accounts yet. Open the app in a browser to create the first admin account.');
  if (config.production && !config.persistentStorage) console.warn('WARNING: no persistent disk is attached. Setup is blocked until a volume is mounted, or the data would be lost at the next deploy.');
  if (config.production && !config.setupCode) console.warn('WARNING: MEDICAPP_SETUP_CODE is not set. Setup is blocked until it is.');
}

server.listen(PORT, HOST, () => {
  console.log(`MedicApp is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
