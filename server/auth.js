// Passwords (scrypt) and sessions. A browser on the server's own address
// carries its session in an HttpOnly cookie; the phone app and the separately
// hosted pages send the same token as a Bearer header instead.
import { Buffer } from 'node:buffer';
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

// Only a hash of a secret is ever stored, so a copy of the database cannot be
// replayed as a login.
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export async function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_HOURS * 3600 * 1000).toISOString();
  await run('DELETE FROM sessions WHERE expires_at < ?', now());
  await run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now(), expires);
  return token;
}

function readCookie(headers) {
  const header = headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return rest.join('=');
  }
  return null;
}

function readToken(headers) {
  const header = headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return readCookie(headers);
}

export async function destroySession(headers) {
  const token = readToken(headers);
  if (token) await run('DELETE FROM sessions WHERE token_hash = ?', sha256(token));
}

export async function destroyUserSessions(userId, exceptHeaders = null) {
  const keep = exceptHeaders ? readToken(exceptHeaders) : null;
  if (keep) await run('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?', userId, sha256(keep));
  else await run('DELETE FROM sessions WHERE user_id = ?', userId);
}

export function sessionCookie(secure, token) {
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}${secure ? '; Secure' : ''}`;
}

export function clearedCookie(secure) {
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

export async function authenticate(headers) {
  const token = readToken(headers);
  if (!token) return null;
  const user = await get(
    `SELECT u.id, u.username, u.name, u.role, u.job_title, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    sha256(token),
    now(),
  );
  return user || null;
}

export const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, job_title: u.job_title });

// Starting a session answers with a cookie, or with the token itself for a
// caller that asked for it (the phone app, or pages hosted somewhere else).
export async function startSession(ctx, user) {
  const token = await createSession(user.id);
  const client = ctx.body.client;
  if (client === 'native' || client === 'token') return { user: publicUser(user), token };
  ctx.setHeader('Set-Cookie', sessionCookie(ctx.request.secure, token));
  return { user: publicUser(user) };
}

// ---- throttling: sign-in and setup-code attempts ---------------------------
// Kept in the database, because a hosted function has no memory between calls.

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;

const current = async (key) => {
  const row = await get('SELECT first_at, attempts FROM login_attempts WHERE key = ?', key);
  return row && Date.now() - Date.parse(row.first_at) <= WINDOW_MS ? row : null;
};

export async function loginAllowed(key) {
  const row = await current(key);
  return !row || row.attempts < MAX_ATTEMPTS;
}

export async function recordLoginFailure(key) {
  if (await current(key)) {
    await run('UPDATE login_attempts SET attempts = attempts + 1 WHERE key = ?', key);
  } else {
    await run(
      'INSERT INTO login_attempts (key, first_at, attempts) VALUES (?, ?, 1) ON CONFLICT (key) DO UPDATE SET first_at = excluded.first_at, attempts = 1',
      key, now(),
    );
  }
}

export const clearLoginFailures = (key) => run('DELETE FROM login_attempts WHERE key = ?', key);
