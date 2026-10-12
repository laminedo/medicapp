// First-run setup: creating the very first admin account on an empty database.
// It exists only until that account does. After that, accounts are created by
// an admin, never by self sign-up.
import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { get, now, run, tx } from '../db.js';
import { HttpError, text } from '../router.js';
import { clearLoginFailures, hashPassword, loginAllowed, recordLoginFailure, sha256, startSession } from '../auth.js';
import { config } from '../config.js';
import { isTimeZone } from '../time.js';
import { readPassword, readUsername } from './users.js';

const userCount = async () => (await get('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users')).n;

// The setup code comes from the server's configuration, or from the database
// (stored as a hash) on hosts where setting a variable is not possible.
async function expectedCodeHash() {
  if (config.setupCode) return sha256(config.setupCode);
  const row = await get("SELECT value FROM app_settings WHERE key = 'setup_code_hash'");
  return row?.value ?? null;
}

// What the app needs to know before anyone is signed in.
export async function setupState() {
  if ((await userCount()) > 0) return { required: false };
  // On a public server setup stays locked until it is safe: the data must be
  // somewhere permanent, and there must be a code so that a stranger who
  // finds the address first cannot claim the admin account.
  const codeHash = await expectedCodeHash();
  let blocked = null;
  if (config.production && !config.persistentStorage) blocked = 'storage';
  else if (config.production && !codeHash) blocked = 'code';
  return { required: true, code_required: Boolean(codeHash), blocked };
}

function codeMatches(value, expectedHash) {
  const given = Buffer.from(sha256(typeof value === 'string' ? value.trim() : ''));
  return timingSafeEqual(given, Buffer.from(expectedHash));
}

export default function setupRoutes(router) {
  router.post('/api/setup', { role: 'public' }, async (ctx) => {
    const { body, request } = ctx;
    const state = await setupState();
    if (!state.required) throw new HttpError(409, 'This app has already been set up. Sign in instead.');
    if (state.blocked === 'storage') throw new HttpError(403, 'Setup is locked: attach a persistent volume to the server first.');
    if (state.blocked === 'code') throw new HttpError(403, 'Setup is locked: a setup code has to be configured on the server first.');

    // Guessing the code is throttled the same way guessing a password is.
    const key = `${request.ip}|setup`;
    if (!(await loginAllowed(key))) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');
    const codeHash = await expectedCodeHash();
    if (codeHash && !codeMatches(body.setup_code, codeHash)) {
      await recordLoginFailure(key);
      throw new HttpError(403, 'That setup code is not correct.');
    }
    await clearLoginFailures(key);

    const facilityName = text(body.facility_name, 'Facility name', { max: 80 });
    const name = text(body.name, 'Your name', { max: 80 });
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    const username = readUsername(body.username);
    const password = readPassword(body.password);
    // The browser reports the time zone it is in, which is almost always the
    // care home's. It can be changed later in Settings.
    const timezone = isTimeZone(body.timezone) ? body.timezone : 'UTC';

    const user = await tx(async () => {
      // Checked again inside the transaction: only one request can win.
      if ((await userCount()) > 0) throw new HttpError(409, 'This app has already been set up. Sign in instead.');
      const at = now();
      if (!(await get('SELECT id FROM facility WHERE id = 1'))) {
        await run(
          'INSERT INTO facility (id, name, address, latitude, longitude, radius_m, timezone, updated_at) VALUES (1, ?, ?, 0, 0, 100, ?, ?)',
          facilityName, '', timezone, at,
        );
      }
      // The code has done its job. It cannot be used again.
      await run("DELETE FROM app_settings WHERE key = 'setup_code_hash'");
      return get(
        "INSERT INTO users (username, name, role, job_title, password_hash, created_at) VALUES (?, ?, 'admin', ?, ?, ?) RETURNING *",
        username, name, jobTitle, hashPassword(password), at,
      );
    });

    return startSession(ctx, user);
  });
}
