import { Buffer } from 'node:buffer';
import { timingSafeEqual } from 'node:crypto';
import { get, now, run, tx } from '../db.js';
import { HttpError, text } from '../router.js';
import {
  MIN_PASSWORD_LENGTH,
  clearLoginFailures,
  clearedCookie,
  destroySession,
  destroyUserSessions,
  hashPassword,
  loginAllowed,
  publicUser,
  recordLoginFailure,
  sha256,
  startSession,
  verifyPassword,
} from '../auth.js';
import { setupState } from './setup.js';

export default function authRoutes(router) {
  router.post('/api/auth/login', { role: 'public' }, async (ctx) => {
    const username = text(ctx.body.username, 'Username', { max: 64 }).toLowerCase();
    const password = text(ctx.body.password, 'Password', { max: 200 });
    const key = `${ctx.request.ip}|${username}`;
    if (!(await loginAllowed(key))) throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.');

    const user = await get('SELECT * FROM users WHERE username = ? AND active = 1', username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      await recordLoginFailure(key);
      throw new HttpError(401, 'That username and password do not match.');
    }
    await clearLoginFailures(key);
    return startSession(ctx, user);
  });

  router.post('/api/auth/logout', { role: 'public' }, async ({ request, setHeader }) => {
    await destroySession(request.headers);
    setHeader('Set-Cookie', clearedCookie(request.secure));
    return { ok: true };
  });

  // Public so the app can ask "am I signed in?" without treating no as an error.
  router.get('/api/auth/me', { role: 'public' }, async ({ user }) => {
    const facility = await get('SELECT name FROM facility WHERE id = 1');
    return { user: user ? publicUser(user) : null, facility_name: facility?.name ?? 'MedicApp', setup: await setupState() };
  });

  // For an admin who is locked out. The recovery code is created by whoever
  // controls the database (see README: "A locked-out admin"), is valid for an
  // hour, and works once. Staff do not use this: an admin resets them.
  router.post('/api/auth/recover', { role: 'public' }, async ({ request, body }) => {
    const username = text(body.username, 'Username', { max: 64 }).toLowerCase();
    const code = text(body.recovery_code, 'Recovery code', { max: 100 });
    const next = text(body.new_password, 'New password', { max: 200 });
    if (next.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const key = `${request.ip}|recover`;
    if (!(await loginAllowed(key))) throw new HttpError(429, 'Too many attempts. Wait a few minutes and try again.');

    const stored = await get("SELECT value FROM app_settings WHERE key = 'recovery_code_hash'");
    const expires = await get("SELECT value FROM app_settings WHERE key = 'recovery_code_expires'");
    const live = stored && expires && expires.value > now();
    const matches = live && timingSafeEqual(Buffer.from(sha256(code)), Buffer.from(stored.value));
    const user = matches ? await get("SELECT id FROM users WHERE username = ? AND active = 1 AND role = 'admin'", username) : null;
    if (!user) {
      await recordLoginFailure(key);
      // One message for every failure, so it reveals nothing about which part was wrong.
      throw new HttpError(403, 'That did not work. Check the admin username, and that the recovery code is new: it lasts one hour and works once.');
    }

    await tx(async () => {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), user.id);
      await run("DELETE FROM app_settings WHERE key IN ('recovery_code_hash', 'recovery_code_expires')");
    });
    await destroyUserSessions(user.id);
    await clearLoginFailures(key);
    return { ok: true };
  });

  router.post('/api/auth/password', async ({ request, user, body }) => {
    const current = text(body.current_password, 'Current password', { max: 200 });
    const next = text(body.new_password, 'New password', { max: 200 });
    if (next.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const row = await get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is not correct.');
    await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), user.id);
    await destroyUserSessions(user.id, request.headers);
    return { ok: true };
  });
}
