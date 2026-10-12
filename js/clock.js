// How a clock event reads, shared by every screen that lists them, plus the
// sheet an admin uses to close a shift for someone who forgot to clock out.
import { api } from './api.js';
import { h } from './dom.js';
import { fmtDistance, fmtWhen, toDateTimeLocal } from './format.js';
import { badge, button, field, formError, input, openSheet, textarea, toast, withBusy } from './ui.js';

export const isForced = (event) => Boolean(event.forced_by_name);

export function eventTitle(event) {
  if (event.status === 'blocked') return 'Clock-in blocked';
  if (isForced(event)) return `Clocked out by ${event.forced_by_name}`;
  return event.type === 'in' ? 'Clocked in' : 'Clocked out';
}

// An admin clock-out has no device behind it, so there is no distance to show.
export const eventWhere = (event) => (isForced(event) ? 'Entered by an admin' : `${fmtDistance(event.distance_m)} from site`);

export function eventBadge(event) {
  if (event.status === 'blocked') return badge('danger', 'Blocked');
  if (isForced(event)) return badge('neutral', 'By admin');
  return event.on_site ? badge('ok', 'On-site') : badge('warn', 'Off-site');
}

export function openForceClockOut({ userId, name, since }, onDone) {
  const at = input({ type: 'datetime-local', value: toDateTimeLocal(), min: toDateTimeLocal(since), max: toDateTimeLocal(), required: true });
  const note = textarea({ maxlength: 200, rows: 2, placeholder: 'Forgot to clock out at the end of the shift' });
  const error = formError();
  const confirm = button('Clock out', { variant: 'primary', type: 'submit' });
  confirm.setAttribute('form', 'force-clock-out');

  async function onSubmit(event) {
    event.preventDefault();
    error.clear();
    if (!at.value) return error.show('Choose the time they left.');
    if (!note.value.trim()) {
      error.show('Add a short reason. It is kept with the record.');
      note.focus();
      return;
    }
    await withBusy(confirm, async () => {
      try {
        await api.post(`/api/users/${userId}/clock-out`, { at: new Date(at.value).toISOString(), note: note.value });
        sheet.close();
        toast(`${name} clocked out`);
        onDone();
      } catch (err) {
        error.show(err.message);
      }
    });
  }

  const sheet = openSheet({
    title: `Clock out ${name}`,
    subtitle: `On shift since ${fmtWhen(since)}`,
    focus: note,
    content: [
      h('form', { class: 'form', id: 'force-clock-out', onSubmit, novalidate: true },
        field('Time they left', at, { hint: 'Their hours are counted up to this time.' }),
        field('Reason', note),
        error.el,
      ),
    ],
    footer: [button('Cancel', { onClick: () => sheet.close() }), confirm],
  });
}
