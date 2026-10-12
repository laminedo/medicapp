import { api } from '../api.js';
import { h } from '../dom.js';
import { fmtWhen, plural } from '../format.js';
import { avatar, badge, button, dataView, empty, field, formError, group, input, openSheet, pageHead, row, select, textarea, toast, withBusy } from '../ui.js';
import { paragraphs, replyBox, threadView } from './staff-inbox.js';

// How far a message has got with the people it was sent to.
function receipt(message) {
  const total = message.recipients.length;
  const read = message.recipients.filter((r) => r.read_at).length;
  const acknowledged = message.recipients.filter((r) => r.acknowledged_at).length;
  if (total === 0) return badge('neutral', 'No recipients');
  if (total === 1) return acknowledged ? badge('ok', 'Acknowledged') : read ? badge('neutral', 'Read') : badge('neutral', 'Unread');
  if (acknowledged === total) return badge('ok', `Acknowledged by all ${total}`);
  if (acknowledged) return badge('warn', `Acknowledged by ${acknowledged} of ${total}`);
  return badge(read ? 'warn' : 'neutral', `Read by ${read} of ${total}`);
}

function recipientBadge(r) {
  if (r.acknowledged_at) return badge('ok', `Acknowledged ${fmtWhen(r.acknowledged_at)}`);
  if (r.read_at) return badge('neutral', `Read ${fmtWhen(r.read_at)}`);
  return badge('neutral', 'Not read yet');
}

export function mount(root, ctx) {
  let staff = [];
  const view = dataView(root, {
    load: async () => {
      const [messages, users] = await Promise.all([api.get('/api/messages'), api.get('/api/users')]);
      staff = users.users.filter((u) => u.role === 'staff');
      return messages;
    },
    render: draw,
  });
  const reload = () => view.refresh({ quiet: true });

  function draw({ messages }) {
    return [
      pageHead('Messages', 'Send instructions to one person or the whole team.', button('New message', { variant: 'primary', icon: 'send', onClick: compose })),
      messages.length === 0
        ? empty({ icon: 'inbox', title: 'Nothing sent yet', text: 'Messages you send appear here, with who has read them.' })
        : group(
            messages.map((m) =>
              row({
                unread: m.unread_replies > 0,
                leading: h('span', { class: `unread-dot${m.unread_replies ? '' : ' is-read'}`, 'aria-hidden': 'true' }),
                title: m.subject,
                subtitle: `To ${m.to_all ? 'all staff' : m.recipient_name} · ${fmtWhen(m.created_at)}`,
                detail: m.body.split('\n')[0],
                foot: [
                  m.priority === 'important' && badge('danger', 'Important'),
                  receipt(m),
                  m.unread_replies > 0 ? badge('ok', plural(m.unread_replies, 'new reply', 'new replies')) : m.reply_count > 0 && badge('neutral', plural(m.reply_count, 'reply', 'replies')),
                ],
                chevron: true,
                onClick: () => open(m),
              }),
            ),
          ),
    ];
  }

  async function open(message) {
    // One block per recipient: where they are with the message, then their thread.
    const recipient = (r) => {
      const thread = h('div');
      const paint = (replies) => thread.replaceChildren(replies.length ? threadView(replies, (reply) => !reply.from_staff) : '');
      paint(r.replies);
      return h(
        'div',
        { class: 'recipient' },
        h('div', { class: 'recipient-head' }, avatar(r.name, 'sm'), h('span', { class: 'recipient-name' }, r.name), recipientBadge(r)),
        thread,
        r.replies.length > 0 &&
          replyBox({
            placeholder: `Reply to ${r.name.split(' ')[0]}`,
            onSend: async (body) => {
              const { replies } = await api.post(`/api/messages/${message.id}/replies`, { body, staff_id: r.id });
              paint(replies);
              reload();
            },
          }),
      );
    };

    const sheet = openSheet({
      title: message.subject,
      subtitle: `Sent by ${message.sender_name} · ${fmtWhen(message.created_at)}`,
      content: [
        message.priority === 'important' && h('p', null, badge('danger', 'Important')),
        paragraphs(message.body),
        h('h3', { class: 'form-title' }, plural(message.recipients.length, 'recipient')),
        h('div', { class: 'recipients' }, message.recipients.map(recipient)),
      ],
      footer: [button('Done', { variant: 'primary', onClick: () => sheet.close() })],
    });

    if (!message.unread_replies) return;
    try {
      await api.post(`/api/messages/${message.id}/seen`);
      ctx.refreshUnread();
      reload();
    } catch {
      // The replies stay marked new and are cleared the next time this opens.
    }
  }

  function compose() {
    const to = select({}, [{ value: 'all', label: `All staff (${staff.length})` }, ...staff.map((u) => ({ value: u.id, label: u.name }))], 'all');
    const subject = input({ maxlength: 120, required: true });
    const body = textarea({ maxlength: 4000, rows: 6, required: true });
    const important = h('input', { type: 'checkbox', id: 'message-important' });
    const error = formError();
    const send = button('Send message', { variant: 'primary', icon: 'send', type: 'submit' });
    send.setAttribute('form', 'message-form');

    async function onSubmit(event) {
      event.preventDefault();
      error.clear();
      await withBusy(send, async () => {
        try {
          await api.post('/api/messages', { recipient_id: to.value, subject: subject.value, body: body.value, priority: important.checked ? 'important' : 'normal' });
          sheet.close();
          toast(to.value === 'all' ? 'Sent to all staff' : 'Message sent');
          reload();
        } catch (err) {
          error.show(err.message);
        }
      });
    }

    const sheet = openSheet({
      title: 'New message',
      focus: subject,
      content: h(
        'form',
        { class: 'form', id: 'message-form', onSubmit, novalidate: true },
        field('To', to),
        field('Subject', subject),
        field('Message', body),
        h('label', { class: 'check', for: 'message-important' }, important, h('span', null, h('span', { class: 'check-title' }, 'Mark as important'), h('span', { class: 'check-hint' }, 'Shown with a red label in the inbox. Staff can acknowledge any message.'))),
        error.el,
      ),
      footer: [button('Cancel', { onClick: () => sheet.close() }), send],
    });
  }

  return () => view.stop();
}
