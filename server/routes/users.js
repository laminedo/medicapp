import { all, get, now, run } from '../db.js';
import { HttpError, oneOf, text } from '../router.js';
import { MIN_PASSWORD_LENGTH, destroyUserSessions, hashPassword } from '../auth.js';
import { clockState } from './clock.js';

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function readUsername(value) {
  const username = text(value, 'Username', { max: 32 }).toLowerCase();
  if (!USERNAME.test(username)) {
    throw new HttpError(400, 'Username must be 3 to 32 characters: letters, numbers, dots, dashes or underscores.');
  }
  return username;
}

export function readPassword(value) {
  const password = text(value, 'Password', { max: 200 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  return password;
}

function assertUsernameFree(username, exceptId = 0) {
  const taken = get('SELECT id FROM users WHERE username = ? AND active = 1 AND id != ?', username, exceptId);
  if (taken) throw new HttpError(409, `The username "${username}" is already in use.`);
}

const activeAdminCount = () => get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n;

function present(user) {
  const state = user.role === 'staff' ? clockState(user.id) : { clocked_in: false, since: null };
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    job_title: user.job_title,
    created_at: user.created_at,
    clocked_in: state.clocked_in,
    clocked_in_since: state.since,
  };
}

export default function userRoutes(router) {
  router.get('/api/users', { role: 'admin' }, () => {
    const users = all("SELECT * FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, name COLLATE NOCASE");
    return { users: users.map(present) };
  });

  router.post('/api/users', { role: 'admin' }, (ctx) => {
    const { body } = ctx;
    const name = text(body.name, 'Name', { max: 80 });
    const username = readUsername(body.username);
    const role = oneOf(body.role, 'Role', ['admin', 'staff']);
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    const password = readPassword(body.password);
    assertUsernameFree(username);

    const { lastInsertRowid } = run(
      'INSERT INTO users (username, name, role, job_title, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      username, name, role, jobTitle, hashPassword(password), now(),
    );
    ctx.status = 201;
    return { user: present(get('SELECT * FROM users WHERE id = ?', lastInsertRowid)) };
  });

  router.put('/api/users/:id', { role: 'admin' }, ({ params, body, user: me }) => {
    const existing = get('SELECT * FROM users WHERE id = ? AND active = 1', params.id);
    if (!existing) throw new HttpError(404, 'That account no longer exists.');

    const name = text(body.name, 'Name', { max: 80 });
    const username = readUsername(body.username);
    const role = oneOf(body.role, 'Role', ['admin', 'staff']);
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    assertUsernameFree(username, existing.id);

    if (existing.role === 'admin' && role !== 'admin') {
      if (existing.id === me.id) throw new HttpError(400, 'You cannot remove your own admin access.');
      if (activeAdminCount() <= 1) throw new HttpError(400, 'There must be at least one admin account.');
    }

    run('UPDATE users SET name = ?, username = ?, role = ?, job_title = ? WHERE id = ?', name, username, role, jobTitle, existing.id);
    if (typeof body.password === 'string' && body.password !== '') {
      run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(readPassword(body.password)), existing.id);
      if (existing.id !== me.id) destroyUserSessions(existing.id);
    }
    return { user: present(get('SELECT * FROM users WHERE id = ?', existing.id)) };
  });

  // Removing an account signs it out and blocks sign-in, but keeps the row:
  // clock logs and medication records must keep saying who did what.
  router.delete('/api/users/:id', { role: 'admin' }, ({ params, user: me }) => {
    const existing = get('SELECT * FROM users WHERE id = ? AND active = 1', params.id);
    if (!existing) throw new HttpError(404, 'That account no longer exists.');
    if (existing.id === me.id) throw new HttpError(400, 'You cannot remove your own account.');
    if (existing.role === 'admin' && activeAdminCount() <= 1) {
      throw new HttpError(400, 'There must be at least one admin account.');
    }
    run('UPDATE users SET active = 0, removed_at = ? WHERE id = ?', now(), existing.id);
    destroyUserSessions(existing.id);
    return { ok: true };
  });
}
