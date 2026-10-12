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

async function assertUsernameFree(username, exceptId = 0) {
  const taken = await get('SELECT id FROM users WHERE username = ? AND active = 1 AND id != ?', username, exceptId);
  if (taken) throw new HttpError(409, `The username "${username}" is already in use.`);
}

const activeAdminCount = async () => (await get("SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users WHERE role = 'admin' AND active = 1")).n;

async function present(user) {
  const state = user.role === 'staff' ? await clockState(user.id) : { clocked_in: false, since: null };
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

const findActive = (id) => get('SELECT * FROM users WHERE id = ? AND active = 1', id);

export default function userRoutes(router) {
  router.get('/api/users', { role: 'admin' }, async () => {
    const users = await all("SELECT * FROM users WHERE active = 1 ORDER BY role = 'admin' DESC, lower(name)");
    return { users: await Promise.all(users.map(present)) };
  });

  router.post('/api/users', { role: 'admin' }, async (ctx) => {
    const { body } = ctx;
    const name = text(body.name, 'Name', { max: 80 });
    const username = readUsername(body.username);
    const role = oneOf(body.role, 'Role', ['admin', 'staff']);
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    const password = readPassword(body.password);
    await assertUsernameFree(username);

    const user = await get(
      'INSERT INTO users (username, name, role, job_title, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *',
      username, name, role, jobTitle, hashPassword(password), now(),
    );
    ctx.status = 201;
    return { user: await present(user) };
  });

  router.put('/api/users/:id', { role: 'admin' }, async ({ params, body, user: me }) => {
    const existing = await findActive(params.id);
    if (!existing) throw new HttpError(404, 'That account no longer exists.');

    const name = text(body.name, 'Name', { max: 80 });
    const username = readUsername(body.username);
    const role = oneOf(body.role, 'Role', ['admin', 'staff']);
    const jobTitle = text(body.job_title, 'Job title', { min: 0, max: 60 });
    await assertUsernameFree(username, existing.id);

    if (existing.role === 'admin' && role !== 'admin') {
      if (existing.id === me.id) throw new HttpError(400, 'You cannot remove your own admin access.');
      if ((await activeAdminCount()) <= 1) throw new HttpError(400, 'There must be at least one admin account.');
    }

    await run('UPDATE users SET name = ?, username = ?, role = ?, job_title = ? WHERE id = ?', name, username, role, jobTitle, existing.id);
    if (typeof body.password === 'string' && body.password !== '') {
      await run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(readPassword(body.password)), existing.id);
      if (existing.id !== me.id) await destroyUserSessions(existing.id);
    }
    return { user: await present(await findActive(existing.id)) };
  });

  // Removing an account signs it out and blocks sign-in, but keeps the row:
  // clock logs and medication records must keep saying who did what.
  router.delete('/api/users/:id', { role: 'admin' }, async ({ params, user: me }) => {
    const existing = await findActive(params.id);
    if (!existing) throw new HttpError(404, 'That account no longer exists.');
    if (existing.id === me.id) throw new HttpError(400, 'You cannot remove your own account.');
    if (existing.role === 'admin' && (await activeAdminCount()) <= 1) {
      throw new HttpError(400, 'There must be at least one admin account.');
    }
    await run('UPDATE users SET active = 0, removed_at = ? WHERE id = ?', now(), existing.id);
    await destroyUserSessions(existing.id);
    return { ok: true };
  });
}
