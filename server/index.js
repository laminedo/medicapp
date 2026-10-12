import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { PUBLIC_DIR } from './paths.js';
import { authenticate } from './auth.js';
import { createRouter, sendJson } from './router.js';
import { seedIfEmpty } from './seed.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import facilityRoutes from './routes/facility.js';
import clockRoutes from './routes/clock.js';
import patientRoutes from './routes/patients.js';
import taskRoutes from './routes/tasks.js';
import messageRoutes from './routes/messages.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import setupRoutes from './routes/setup.js';
import { DEMO_DATA, PERSISTENT_STORAGE, PRODUCTION, SETUP_CODE } from './config.js';
import { get } from './db.js';

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

const router = createRouter({ authenticate });
for (const mount of [authRoutes, setupRoutes, userRoutes, facilityRoutes, clockRoutes, patientRoutes, taskRoutes, messageRoutes, dashboardRoutes, reportRoutes]) {
  mount(router);
}
// For the host's health check: answers as soon as the server can serve requests.
router.get('/api/health', { role: 'public' }, () => ({ ok: true }));

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
    if (url.pathname.startsWith('/api/')) await router.handle(req, res, url);
    else await serveStatic(req, res, url);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: { message: 'Something went wrong on the server.' } });
    else res.end();
  }
});

if (DEMO_DATA) {
  if (await seedIfEmpty()) console.log('First run: added sample data. Demo sign-ins are listed in README.md.');
} else if (get('SELECT COUNT(*) AS n FROM users').n === 0) {
  console.log('No accounts yet. Open the app in a browser to create the first admin account.');
  if (PRODUCTION && !PERSISTENT_STORAGE) console.warn('WARNING: no persistent disk is attached. Setup is blocked until a volume is mounted, or the data would be lost at the next deploy.');
  if (PRODUCTION && !SETUP_CODE) console.warn('WARNING: MEDICAPP_SETUP_CODE is not set. Setup is blocked until it is.');
}

server.listen(PORT, HOST, () => {
  console.log(`MedicApp is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
});
