import { api } from '../api.js';
import { h, svg } from '../dom.js';
import { brandMark } from '../icons.js';
import { button, callout, field, formError, input, openSheet, toast, withBusy } from '../ui.js';

// The geofence rings again, large and cropped by the panel edge.
function rings() {
  return svg(
    'svg',
    { class: 'login-rings', viewBox: '0 0 600 600', 'aria-hidden': 'true' },
    [110, 190, 270, 350].map((r, i) => svg('circle', { class: `login-ring login-ring--${i}`, cx: 300, cy: 300, r })),
    svg('circle', { class: 'login-ring-dot', cx: 300, cy: 300, r: 9 }),
    svg('circle', { class: 'login-ring-you', cx: 372, cy: 236, r: 7 }),
  );
}

function openRecovery() {
  const username = input({ autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const code = input({ autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', required: true });
  const password = input({ type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const error = formError();
  const save = button('Set new password', { variant: 'primary', type: 'submit' });
  save.setAttribute('form', 'recover-form');

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    await withBusy(save, async () => {
      try {
        await api.post('/api/auth/recover', { username: username.value, recovery_code: code.value, new_password: password.value });
        sheet.close();
        toast('Password changed. Sign in with the new one.');
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  const sheet = openSheet({
    title: 'Forgot password?',
    content: [
      callout('neutral', 'Staff', 'Ask an admin. They can set a new password for you from the Staff screen.'),
      callout('neutral', 'Admins', 'Another admin can do the same for you. If there is no other admin, the person who manages this installation can create a one-time recovery code. Enter it here.'),
      h(
        'form',
        { class: 'form', id: 'recover-form', onSubmit, novalidate: true },
        field('Admin username', username),
        field('Recovery code', code, { hint: 'Valid for one hour, for one use.' }),
        field('New password', password, { hint: 'At least 8 characters.' }),
        error.el,
      ),
    ],
    footer: [button('Cancel', { onClick: () => sheet.close() }), save],
  });
}

export function render({ facilityName, notice, onSignedIn }) {
  const error = formError();
  const username = input({ name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const password = input({ name: 'password', type: 'password', autocomplete: 'current-password', required: true });
  const submit = button('Sign in', { variant: 'primary', size: 'lg', type: 'submit', block: true });

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    await withBusy(submit, async () => {
      try {
        const { user } = await api.post('/api/auth/login', { username: username.value, password: password.value });
        onSignedIn(user);
      } catch (err) {
        error.show(err.message);
        password.value = '';
        password.focus();
      }
    });
  }

  return h(
    'div',
    { class: 'login' },
    h(
      'div',
      { class: 'login-aside' },
      rings(),
      h('div', { class: 'login-brand' }, brandMark(34), h('span', null, 'MedicApp')),
      h(
        'div',
        { class: 'login-aside-text' },
        h('p', { class: 'login-facility' }, facilityName),
        h('p', { class: 'login-tagline' }, 'Shifts, medication rounds and staff messages in one place.'),
      ),
    ),
    h(
      'main',
      { class: 'login-main' },
      h(
        'div',
        { class: 'login-panel' },
        h('h1', null, 'Sign in'),
        h('p', { class: 'login-lede' }, 'Use the username and password from your admin.'),
        notice && callout('neutral', notice),
        h('form', { class: 'form', onSubmit, novalidate: true }, field('Username', username), field('Password', password), error.el, submit),
        h('p', { class: 'login-help' }, h('button', { type: 'button', class: 'link link--button', onClick: openRecovery }, 'Forgot password?')),
      ),
    ),
  );
}
