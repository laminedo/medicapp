// Passwords (scrypt) and cookie sessions.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { get, now, run } from './db.js';

export const SESSION_HOURS = 12;
export const MIN_PASSWORD_LENGTH = 8;
const COOKIE = 'medicapp_sid';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Only a hash of the session token is stored, so a copy of the database
// cannot be replayed as a login.
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  run('DELETE FROM sessions WHERE expires_at < ?', now());
  run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', tokenHash(token), userId, now(), expires);
  return token;
}

export function destroySession(req) {
  const token = readToken(req);
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', tokenHash(token));
}

export function destroyUserSessions(userId, exceptReq = null) {
  const keep = exceptReq ? readToken(exceptReq) : null;
  if (keep) run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, tokenHash(keep));
  else run('DELETE FROM sessions WHERE user_id = ?', userId);
}

function readCookie(req) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

// Browsers carry the session in a cookie. The phone app has no cookie jar it
// can trust across restarts, so it sends the same token as a Bearer header.
function readToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return readCookie(req);
}

function isHttps(req) {
  return Boolean(req.socket.encrypted) || req.headers['x-forwarded-proto'] === 'https';
}

export function sessionCookie(req, token) {
  const secure = isHttps(req) ? '; Secure' : '';
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure}`;
}

export function clearedCookie(req) {
  const secure = isHttps(req) ? '; Secure' : '';
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure}`;
}

export function authenticate(req) {
  const token = readToken(req);
  if (!token) return null;
  const user = get(
    `SELECT u.id, u.username, u.name, u.role, u.job_title, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    tokenHash(token),
    now(),
  );
  return user || null;
}

export const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, job_title: u.job_title });

// ---- sign-in throttling ----------------------------------------------------

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map();

export function loginAllowed(key) {
  const entry = attempts.get(key);
  if (!entry) return true;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return true;
  }
  return entry.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) attempts.set(key, { first: Date.now(), count: 1 });
  else entry.count += 1;
}

export const clearLoginFailures = (key) => attempts.delete(key);
