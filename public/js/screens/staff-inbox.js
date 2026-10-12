import { api } from '../api.js';
import { h } from '../dom.js';
import { fmtWhen, plural } from '../format.js';
import { badge, button, callout, dataView, empty, formError, group, openSheet, pageHead, row, textarea, toast, withBusy } from '../ui.js';

export const paragraphs = (body) => h('div', { class: 'message-body' }, body.split(/\n{2,}/).map((p) => h('p', null, p)));

// A reply thread. `mine` says which side of the conversation the reader is on.
export function threadView(replies, mine) {
  return h(
    'div',
    { class: 'thread' },
    replies.map((r) =>
      h('div', { class: `bubble${mine(r) ? ' bubble--mine' : ''}` }, h('p', null, r.body), h('span', { class: 'bubble-meta' }, `${mine(r) ? 'You' : r.author_name} · ${fmtWhen(r.created_at)}`)),
    ),
  );
}

// A one-line reply box. onSend receives the text and returns the updated thread.
export function replyBox({ placeholder, onSend }) {
  const body = textarea({ rows: 2, maxlength: 2000, placeholder, 'aria-label': placeholder });
  const error = formError();
  const send = button('Send', { variant: 'secondary', icon: 'send', type: 'submit' });
  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    if (!body.value.trim()) return body.focus();
    await withBusy(send, async () => {
      try {
        await onSend(body.value);
        body.value = '';
      } catch (err) {
        error.show(err.message);
      }
    });
  }
  return h('form', { class: 'reply', onSubmit, novalidate: true }, h('div', { class: 'reply-line' }, body, send), error.el);
}

export function mount(root, ctx) {
  const view = dataView(root, { load: () => api.get('/api/messages'), render: draw });
  const reload = () => view.refresh({ quiet: true });

  function draw({ messages }) {
    const unread = messages.filter((m) => m.unread).length;
    return [
      pageHead('Inbox', unread ? plural(unread, 'unread message') : 'You have read everything'),
      messages.length === 0
        ? empty({ icon: 'inbox', title: 'No messages yet', text: 'Instructions from your admin will appear here.' })
        : group(messages.map(messageRow)),
    ];
  }

  function messageRow(message) {
    return row({
      unread: message.unread,
      leading: h('span', { class: `unread-dot${message.unread ? '' : ' is-read'}`, 'aria-hidden': 'true' }),
      title: [message.subject, message.unread && h('span', { class: 'visually-hidden' }, ' (unread)')],
      subtitle: [message.sender_name, fmtWhen(message.created_at), message.to_all && 'To all staff'].filter(Boolean).join(' · '),
      detail: message.body.split('\n')[0],
      foot: [
        message.priority === 'important' && badge('danger', 'Important'),
        message.acknowledged_at && badge('ok', 'Acknowledged'),
        message.replies.length > 0 && badge('neutral', plural(message.replies.length, 'reply', 'replies')),
      ],
      chevron: true,
      onClick: () => open(message),
    });
  }

  async function open(message) {
    const thread = h('div');
    const paintThread = (replies) => thread.replaceChildren(replies.length ? threadView(replies, (r) => r.from_staff) : '');
    paintThread(message.replies);

    const acknowledge = button('Acknowledge', {
      variant: 'primary',
      icon: 'check',
      onClick: () =>
        withBusy(acknowledge, async () => {
          try {
            await api.post(`/api/messages/${message.id}/acknowledge`);
            status.replaceChildren(callout('ok', 'You acknowledged this message.'));
            acknowledge.remove();
            toast('Acknowledged');
            reload();
          } catch (err) {
            toast(err.message, 'danger');
          }
        }),
    });
    const status = h('div', null, message.acknowledged_at && callout('ok', `You acknowledged this ${fmtWhen(message.acknowledged_at)}.`));

    const sheet = openSheet({
      title: message.subject,
      subtitle: `${[message.sender_name, message.sender_title].filter(Boolean).join(', ')} · ${fmtWhen(message.created_at)}`,
      content: [
        message.priority === 'important' && h('p', null, badge('danger', 'Important')),
        paragraphs(message.body),
        status,
        thread,
        replyBox({
          placeholder: `Reply to ${message.sender_name.split(' ')[0]}`,
          onSend: async (body) => {
            const { replies } = await api.post(`/api/messages/${message.id}/replies`, { body });
            paintThread(replies);
            reload();
          },
        }),
      ],
      footer: [button('Close', { onClick: () => sheet.close() }), !message.acknowledged_at && acknowledge],
    });

    if (!message.unread) return;
    try {
      await api.post(`/api/messages/${message.id}/read`);
      ctx.refreshUnread();
      reload();
    } catch {
      // Still unread on the server; it will be marked the next time it is opened.
    }
  }

  return () => view.stop();
}
