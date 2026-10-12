import { api } from '../api.js';
import { h, svg } from '../dom.js';
import { brandMark } from '../icons.js';
import { button, callout, field, formError, input, withBusy } from '../ui.js';

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
      ),
    ),
  );
}
