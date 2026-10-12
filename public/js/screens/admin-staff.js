import { api } from '../api.js';
import { h } from '../dom.js';
import { openForceClockOut } from '../clock.js';
import { fmtTime, fmtWhen, plural } from '../format.js';
import { avatar, badge, button, callout, confirmSheet, dataView, field, formError, group, input, openSheet, pageHead, row, select, toast, withBusy } from '../ui.js';

const ROLES = [
  { value: 'staff', label: 'Staff: clocks in, gives medication, reads messages' },
  { value: 'admin', label: 'Admin: manages staff, patients and settings' },
];

export function mount(root, ctx) {
  const view = dataView(root, { load: () => api.get('/api/users'), render: draw });
  const reload = () => view.refresh({ quiet: true });

  function draw({ users }) {
    const staffCount = users.filter((u) => u.role === 'staff').length;
    return [
      pageHead('Staff', `${plural(staffCount, 'staff account')} and ${plural(users.length - staffCount, 'admin')}`, button('Add account', { variant: 'primary', icon: 'plus', onClick: () => openForm(null) })),
      group(
        users.map((u) =>
          row({
            leading: avatar(u.name),
            title: [u.name, u.id === ctx.user.id && h('span', { class: 'row-you' }, 'You')],
            subtitle: [u.job_title, `@${u.username}`].filter(Boolean).join(' · '),
            trailing: [
              u.role === 'admin' ? badge('neutral', 'Admin') : u.clocked_in ? badge('ok', `In since ${fmtTime(u.clocked_in_since)}`) : badge('neutral', 'Off shift'),
            ],
            chevron: true,
            onClick: () => openForm(u),
          }),
        ),
      ),
    ];
  }

  function openForm(user) {
    const isSelf = user?.id === ctx.user.id;
    const name = input({ value: user?.name ?? '', maxlength: 80, required: true, autocomplete: 'off' });
    const username = input({ value: user?.username ?? '', maxlength: 32, required: true, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const jobTitle = input({ value: user?.job_title ?? '', maxlength: 60, placeholder: 'Registered Nurse', autocomplete: 'off' });
    const role = select({ disabled: isSelf }, ROLES, user?.role ?? 'staff');
    const password = input({ type: 'password', autocomplete: 'new-password', minlength: 8, required: !user });
    const error = formError();
    const save = button(user ? 'Save changes' : 'Add account', { variant: 'primary', type: 'submit' });
    save.setAttribute('form', 'staff-form');

    async function onSubmit(event) {
      event.preventDefault();
      error.clear();
      await withBusy(save, async () => {
        try {
          const body = { name: name.value, username: username.value, job_title: jobTitle.value, role: role.value, password: password.value };
          if (user) await api.put(`/api/users/${user.id}`, body);
          else await api.post('/api/users', body);
          sheet.close();
          toast(user ? 'Account updated' : `Account created for ${body.name}`);
          reload();
        } catch (err) {
          error.show(err.message);
        }
      });
    }

    async function remove() {
      const ok = await confirmSheet({
        title: `Remove ${user.name}?`,
        message: 'They are signed out and can no longer sign in. Their clock history and medication records are kept.',
        confirmLabel: 'Remove account',
        tone: 'danger',
      });
      if (!ok) return;
      try {
        await api.del(`/api/users/${user.id}`);
        sheet.close();
        toast(`${user.name} removed`);
        reload();
      } catch (err) {
        toast(err.message, 'danger');
      }
    }

    const sheet = openSheet({
      title: user ? 'Edit account' : 'Add an account',
      focus: name,
      content: h(
        'form',
        { class: 'form', id: 'staff-form', onSubmit, novalidate: true },
        user?.clocked_in &&
          h(
            'div',
            { class: 'callout-action' },
            callout('ok', `On shift since ${fmtWhen(user.clocked_in_since)}`, 'If they forgot to clock out, you can close the shift for them.', 'clock'),
            button('Clock out', { size: 'sm', onClick: () => { sheet.close(); openForceClockOut({ userId: user.id, name: user.name, since: user.clocked_in_since }, reload); } }),
          ),
        field('Full name', name),
        field('Job title', jobTitle, { optional: true }),
        field('Username', username, { hint: 'Used to sign in. Letters, numbers, dots and dashes.' }),
        field('Role', role, { hint: isSelf ? 'You cannot change your own role.' : null }),
        field(user ? 'New password' : 'Password', password, {
          optional: Boolean(user),
          hint: user ? 'Leave blank to keep the current password. Setting one signs them out everywhere.' : 'At least 8 characters. Share it with them privately.',
        }),
        error.el,
      ),
      footer: [user && !isSelf && button('Remove', { variant: 'ghost-danger', icon: 'trash', onClick: remove }), h('span', { class: 'spacer' }), button('Cancel', { onClick: () => sheet.close() }), save],
    });
  }

  return () => view.stop();
}
