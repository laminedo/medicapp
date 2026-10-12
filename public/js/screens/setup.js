// First-run setup: shown once, on an empty database, to create the first admin.
import { api } from '../api.js';
import { h } from '../dom.js';
import { brandMark } from '../icons.js';
import { button, callout, field, formError, input, withBusy } from '../ui.js';

// Why setup cannot go ahead yet, and what the person running the server must do.
const BLOCKED = {
  storage: [
    'Attach a disk before setting up',
    'This server has nowhere permanent to keep its data, so anything entered now would be lost at the next deploy. In Railway, add a Volume to this service, then reload this page.',
  ],
  code: [
    'Set a setup code before setting up',
    'So that a stranger cannot claim the admin account, add a variable named MEDICAPP_SETUP_CODE to this server with a phrase only you know. Then reload this page and enter it here.',
  ],
};

export function render({ setup, onDone }) {
  const panel = (...children) =>
    h(
      'div',
      { class: 'login' },
      h(
        'div',
        { class: 'login-aside' },
        h('div', { class: 'login-brand' }, brandMark(34), h('span', null, 'MedicApp')),
        h('div', { class: 'login-aside-text' }, h('p', { class: 'login-facility' }, 'Welcome'), h('p', { class: 'login-tagline' }, 'A few details and your care home is ready to use.')),
      ),
      h('main', { class: 'login-main' }, h('div', { class: 'login-panel' }, children)),
    );

  if (setup.blocked) {
    const [title, text] = BLOCKED[setup.blocked];
    return panel(h('h1', null, 'Almost ready'), callout('warn', title, text), button('Reload', { variant: 'primary', size: 'lg', block: true, onClick: () => location.reload() }));
  }

  const code = input({ type: 'password', autocomplete: 'off', required: true });
  const facilityName = input({ maxlength: 80, required: true, autocomplete: 'organization', placeholder: 'Maple Grove Care Home' });
  const name = input({ maxlength: 80, required: true, autocomplete: 'name' });
  const jobTitle = input({ maxlength: 60, autocomplete: 'organization-title', placeholder: 'Director of Nursing' });
  const username = input({ maxlength: 32, required: true, autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false' });
  const password = input({ type: 'password', minlength: 8, required: true, autocomplete: 'new-password' });
  const error = formError();
  const submit = button('Create admin account', { variant: 'primary', size: 'lg', type: 'submit', block: true });

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    await withBusy(submit, async () => {
      try {
        const { user } = await api.post('/api/setup', {
          setup_code: code.value,
          facility_name: facilityName.value,
          name: name.value,
          job_title: jobTitle.value,
          username: username.value,
          password: password.value,
        });
        onDone(user, facilityName.value.trim());
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  return panel(
    h('h1', null, 'Set up MedicApp'),
    h('p', { class: 'login-lede' }, 'Create the first admin account. You add everyone else from inside the app.'),
    h(
      'form',
      { class: 'form', onSubmit, novalidate: true },
      setup.code_required && field('Setup code', code, { hint: 'The MEDICAPP_SETUP_CODE you set on the server.' }),
      field('Care home name', facilityName),
      field('Your name', name),
      field('Your job title', jobTitle, { optional: true }),
      field('Username', username, { hint: 'What you will sign in with. Letters, numbers, dots and dashes.' }),
      field('Password', password, { hint: 'At least 8 characters.' }),
      error.el,
      submit,
    ),
  );
}
