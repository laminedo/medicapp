import { all, get, now, run } from '../db.js';
import { HttpError, number, oneOf, text } from '../router.js';

// A message with no recipient is a broadcast to all staff. New starters only
// see broadcasts sent after their account was created.
const INBOX_WHERE = '(m.recipient_id = ? OR (m.recipient_id IS NULL AND m.created_at >= ?))';

// Replies live in a private thread between one staff member and the admins,
// even when the message itself went to everyone.
async function thread(messageId, staffId) {
  const replies = await all(
    `SELECT r.id, r.body, r.created_at, r.read_at, r.author_id, a.name AS author_name, a.role AS author_role
       FROM message_replies r JOIN users a ON a.id = r.author_id
      WHERE r.message_id = ? AND r.staff_id = ?
      ORDER BY r.created_at, r.id`,
    messageId, staffId,
  );
  return replies.map((r) => ({ ...r, from_staff: r.author_id === staffId }));
}

async function inbox(user) {
  const messages = await all(
    `SELECT m.id, m.subject, m.body, m.priority, m.created_at, m.recipient_id,
            s.name AS sender_name, s.job_title AS sender_title, r.read_at, r.acknowledged_at
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       LEFT JOIN message_reads r ON r.message_id = m.id AND r.user_id = ?
      WHERE ${INBOX_WHERE}
      ORDER BY m.created_at DESC, m.id DESC`,
    user.id, user.id, user.created_at,
  );
  return Promise.all(
    messages.map(async (m) => {
      const replies = await thread(m.id, user.id);
      return {
        ...m,
        to_all: m.recipient_id === null,
        replies,
        // Unread if never opened, or if an admin has answered since.
        unread: !m.read_at || replies.some((r) => !r.from_staff && !r.read_at),
      };
    }),
  );
}

async function sent() {
  const staff = await all("SELECT id, name, created_at FROM users WHERE role = 'staff' AND active = 1 ORDER BY lower(name)");
  const messages = await all(
    `SELECT m.id, m.subject, m.body, m.priority, m.created_at, m.recipient_id,
            s.name AS sender_name, t.name AS recipient_name
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       LEFT JOIN users t ON t.id = m.recipient_id
      ORDER BY m.created_at DESC, m.id DESC`,
  );
  return Promise.all(
    messages.map(async (m) => {
      const reads = new Map((await all('SELECT user_id, read_at, acknowledged_at FROM message_reads WHERE message_id = ?', m.id)).map((r) => [r.user_id, r]));
      const audience =
        m.recipient_id === null
          ? staff.filter((u) => u.created_at <= m.created_at)
          : [{ id: m.recipient_id, name: m.recipient_name }];
      const recipients = await Promise.all(
        audience.map(async (u) => {
          const replies = await thread(m.id, u.id);
          return {
            id: u.id,
            name: u.name,
            read_at: reads.get(u.id)?.read_at ?? null,
            acknowledged_at: reads.get(u.id)?.acknowledged_at ?? null,
            replies,
            unread_replies: replies.filter((r) => r.from_staff && !r.read_at).length,
          };
        }),
      );
      return {
        ...m,
        to_all: m.recipient_id === null,
        recipients,
        reply_count: recipients.reduce((n, r) => n + r.replies.filter((x) => x.from_staff).length, 0),
        unread_replies: recipients.reduce((n, r) => n + r.unread_replies, 0),
      };
    }),
  );
}

async function inboxMessage(messageId, user) {
  const message = await get(`SELECT m.id FROM messages m WHERE m.id = ? AND ${INBOX_WHERE}`, messageId, user.id, user.created_at);
  if (!message) throw new HttpError(404, 'That message is not in your inbox.');
  return message;
}

const markRead = (messageId, userId) =>
  run('INSERT INTO message_reads (message_id, user_id, read_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', messageId, userId, now());

export default function messageRoutes(router) {
  router.get('/api/messages', async ({ user }) => ({ messages: user.role === 'admin' ? await sent() : await inbox(user) }));

  // The number behind the nav badge: unread messages for staff, unread
  // replies for admins.
  router.get('/api/messages/unread', async ({ user }) => {
    if (user.role === 'admin') {
      const row = await get('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM message_replies WHERE author_id = staff_id AND read_at IS NULL');
      return { count: row.n };
    }
    return { count: (await inbox(user)).filter((m) => m.unread).length };
  });

  router.post('/api/messages', { role: 'admin' }, async (ctx) => {
    const { body, user } = ctx;
    const subject = text(body.subject, 'Subject', { max: 120 });
    const content = text(body.body, 'Message', { max: 4000 });
    const priority = oneOf(body.priority ?? 'normal', 'Priority', ['normal', 'important']);

    let recipientId = null;
    if (body.recipient_id != null && body.recipient_id !== 'all' && body.recipient_id !== '') {
      recipientId = number(body.recipient_id, 'Recipient', { integer: true, min: 1 });
      const recipient = await get("SELECT id FROM users WHERE id = ? AND role = 'staff' AND active = 1", recipientId);
      if (!recipient) throw new HttpError(400, 'Choose a current staff member to send this to.');
    }
    await run(
      'INSERT INTO messages (sender_id, recipient_id, subject, body, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      user.id, recipientId, subject, content, priority, now(),
    );
    ctx.status = 201;
    return { messages: await sent() };
  });

  // Opening a message marks it, and any admin answers in its thread, as read.
  router.post('/api/messages/:id/read', { role: 'staff' }, async ({ params, user }) => {
    const message = await inboxMessage(params.id, user);
    await markRead(message.id, user.id);
    await run('UPDATE message_replies SET read_at = ? WHERE message_id = ? AND staff_id = ? AND author_id != staff_id AND read_at IS NULL', now(), message.id, user.id);
    return { ok: true };
  });

  // Acknowledging is deliberate: "I have read this and will act on it."
  router.post('/api/messages/:id/acknowledge', { role: 'staff' }, async ({ params, user }) => {
    const message = await inboxMessage(params.id, user);
    await markRead(message.id, user.id);
    await run('UPDATE message_reads SET acknowledged_at = ? WHERE message_id = ? AND user_id = ? AND acknowledged_at IS NULL', now(), message.id, user.id);
    return { ok: true };
  });

  // Staff reply into their own thread. Admins reply into a named staff
  // member's thread (staff_id), and only if that person received the message.
  router.post('/api/messages/:id/replies', async (ctx) => {
    const { params, user, body } = ctx;
    const content = text(body.body, 'Reply', { max: 2000 });
    let staffId;
    if (user.role === 'staff') {
      await inboxMessage(params.id, user);
      await markRead(params.id, user.id);
      staffId = user.id;
    } else {
      staffId = number(body.staff_id, 'Staff member', { integer: true, min: 1 });
      const staff = await get("SELECT id, created_at FROM users WHERE id = ? AND role = 'staff'", staffId);
      const message = staff && (await get(`SELECT m.id FROM messages m WHERE m.id = ? AND ${INBOX_WHERE}`, params.id, staff.id, staff.created_at));
      if (!message) throw new HttpError(404, 'That person did not receive this message.');
    }
    await run(
      'INSERT INTO message_replies (message_id, staff_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      params.id, staffId, user.id, content, now(),
    );
    ctx.status = 201;
    return { replies: await thread(params.id, staffId) };
  });

  // An admin has looked at a message's replies.
  router.post('/api/messages/:id/seen', { role: 'admin' }, async ({ params }) => {
    await run('UPDATE message_replies SET read_at = ? WHERE message_id = ? AND author_id = staff_id AND read_at IS NULL', now(), params.id);
    return { ok: true };
  });
}
