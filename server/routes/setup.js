// First-run setup: creating the very first admin account on an empty database.
// It exists only until that account does. After that, accounts are created by
// an admin, never by self sign-up.
import { timingSafeEqual } from 'node:crypto';
import { get, now, run, tx } from '../db.js';
import { HttpError, text } from '../router.js';
import { clearLoginFailures, createSession, hashPassword, loginAllowed, publicUser, recordLoginFailure, sessionCookie } from '../auth.js';
import { PERSISTENT_STORAGE, PRODUCTION, SETUP_CODE } from '../config.js';
import { readPassword, readUsername } from './users.js';

const userCount = () => get('SELECT COUNT(*) AS n FROM users').n;

// What the app needs to know before anyone is signed in.
export function setupState() {
  if (userCount() > 0) return { required: false };
  // On a public server setup stays locked until it is safe: the data must be
  // on a disk that survives deploys, and the operator must have set a code so
  // that a stranger who finds the address first cannot claim the admin account.
  let blocked = null;
  if (PRODUCTION && !PERSISTENT_STORAGE) blocked = 'storage';
  else if (PRODUCTION && !SETUP_CODE) blocked = 'code';
  return { required: true, code_required: Boolean(SETUP_CODE), blocked };
}

function codeMatches(value) {
  const given = Buffer.from(typeof value === 'string' ? value.trim() : '');
  const expected = Buffer.from(SETUP_CODE);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export default function setupRoutes(router) {
  router.post('/api/setup', { role: 'public' }, ({ req, res, body }) => {
    const state = setupState();
    if (!state.required) throw new HttpError(409, 'This app has already been set up. Sign in instead.');
    if (state.blocked === 'storage') throw new HttpError(403, 'Setup is locked: attach a persistent volume to the server first.');
    if (state.blocked === 'code') throw new HttpError(403, 'Setup is locked: set the MEDICAPP_SETUP_CODE variable on the server first.');

    // Guessing the code is throttled the same way guessing a password is.
    const key = `${req.socket.remoteAddress}|setup`;
    if (!loginAllowed(key)) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
    if (SETUP_CODE && !codeMatches(body.setup_code)) {
      recordLoginFailure(key);
      throw new HttpError(403, 'That setup code is not correct.');
    }
    clearLoginFailures(key);

    const facilityName = text(body.facility_name, 'Facility name', { max: 80 });
    const name = text(body.name, 'Your name', { max: 80 });
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    const username = readUsername(body.username);
    const password = readPassword(body.password);

    const id = tx(() => {
      // Checked again inside the transaction: only one request can win.
      if (userCount() > 0) throw new HttpError(409, 'This app has already been set up. Sign in instead.');
      const at = now();
      if (!get('SELECT id FROM facility WHERE id = 1')) {
        run('INSERT INTO facility (id, name, address, latitude, longitude, radius_m, updated_at) VALUES (1, ?, ?, 0, 0, 100, ?)', facilityName, '', at);
      }
      return run(
        "INSERT INTO users (username, name, role, job_title, password_hash, created_at) VALUES (?, ?, 'admin', ?, ?, ?)",
        username, name, jobTitle, hashPassword(password), at,
      ).lastInsertRowid;
    });

    res.setHeader('Set-Cookie', sessionCookie(req, createSession(id)));
    return { user: publicUser(get('SELECT * FROM users WHERE id = ?', id)) };
  });
}
