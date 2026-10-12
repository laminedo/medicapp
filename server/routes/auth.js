import { get, run } from '../db.js';
import { HttpError, text } from '../router.js';
import { setupState } from './setup.js';
import {
  MIN_PASSWORD_LENGTH,
  clearLoginFailures,
  clearedCookie,
  createSession,
  destroySession,
  destroyUserSessions,
  hashPassword,
  loginAllowed,
  publicUser,
  recordLoginFailure,
  sessionCookie,
  verifyPassword,
} from '../auth.js';

export default function authRoutes(router) {
  router.post('/api/auth/login', { role: 'public' }, ({ req, res, body }) => {
    const username = text(body.username, 'Username', { max: 64 }).toLowerCase();
    const password = text(body.password, 'Password', { max: 200 });
    const key = `${req.socket.remoteAddress}|${username}`;
    if (!loginAllowed(key)) throw new HttpError(429, 'Too many sign-in attempts. Wait a few minutes and try again.');

    const user = get('SELECT * FROM users WHERE username = ? AND active = 1', username);
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordLoginFailure(key);
      throw new HttpError(401, 'That username and password do not match.');
    }
    clearLoginFailures(key);
    const token = createSession(user.id);
    // The phone app asks for the token itself; browsers get an HttpOnly cookie
    // that page scripts can never read.
    if (body.client === 'native') return { user: publicUser(user), token };
    res.setHeader('Set-Cookie', sessionCookie(req, token));
    return { user: publicUser(user) };
  });

  router.post('/api/auth/logout', { role: 'public' }, ({ req, res }) => {
    destroySession(req);
    res.setHeader('Set-Cookie', clearedCookie(req));
    return { ok: true };
  });

  // Public so the app can ask "am I signed in?" without treating no as an error.
  router.get('/api/auth/me', { role: 'public' }, ({ user }) => {
    const facility = get('SELECT name FROM facility WHERE id = 1');
    return { user: user ? publicUser(user) : null, facility_name: facility?.name ?? 'MedicApp', setup: setupState() };
  });

  router.post('/api/auth/password', ({ req, user, body }) => {
    const current = text(body.current_password, 'Current password', { max: 200 });
    const next = text(body.new_password, 'New password', { max: 200 });
    if (next.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    const row = get('SELECT password_hash FROM users WHERE id = ?', user.id);
    if (!verifyPassword(current, row.password_hash)) throw new HttpError(400, 'Your current password is not correct.');
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), user.id);
    destroyUserSessions(user.id, req);
    return { ok: true };
  });
}
