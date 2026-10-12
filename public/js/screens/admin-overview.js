import { api } from '../api.js';
import { h } from '../dom.js';
import { eventBadge, eventWhere, isForced, openForceClockOut } from '../clock.js';
import { fmtDay, fmtTime, fmtWhen } from '../format.js';
import { avatar, badge, button, callout, dataView, empty, group, pageHead, roundMeter, row, section } from '../ui.js';
import { taskRow } from './staff-meds.js';

const REFRESH_MS = 60000;
const link = (href, label) => h('a', { class: 'link', href }, label);

export function mount(root) {
  const view = dataView(root, { load: () => api.get('/api/dashboard'), render: draw });
  const timer = setInterval(() => !document.hidden && view.refresh({ quiet: true }), REFRESH_MS);

  function draw(data) {
    const onShift = data.staff.filter((s) => s.clocked_in).length;
    return [
      pageHead('Overview', `${data.facility.name} · ${fmtDay(new Date())}`),
      !data.facility.location_set &&
        h('a', { class: 'callout-link', href: '#/settings' }, callout('warn', 'Set your location so staff can clock in', 'The clock-in zone has no centre yet. Open Settings and use "Use my current location" while you are at the building.')),
      section('Medication round today', link('#/meds', 'Open report'), h('div', { class: 'panel' }, roundMeter(data.counts))),
      h(
        'div',
        { class: 'split' },
        section(
          'Needs attention',
          data.attention.length > 0 && badge('danger', `${data.attention.length} late`),
          data.attention.length
            ? group(data.attention.map((task) => taskRow(task, { today: data.today })))
            : empty({ title: 'Nothing is late', text: 'Every dose that has come due so far has been given.' }),
        ),
        section(
          'Staff',
          h('span', { class: 'section-meta nums' }, `${onShift} of ${data.staff.length} on shift`),
          data.staff.length
            ? group(
                data.staff.map((s) =>
                  row({
                    leading: avatar(s.name),
                    title: s.name,
                    subtitle: s.job_title,
                    trailing: s.clocked_in
                      ? [badge('ok', `In since ${fmtTime(s.since)}`), button(`Clock out ${s.name}`, { icon: 'logout', iconOnly: true, variant: 'ghost', size: 'sm', onClick: () => openForceClockOut({ userId: s.id, name: s.name, since: s.since }, () => view.refresh({ quiet: true })) })]
                      : badge('neutral', 'Off shift'),
                  }),
                ),
              )
            : empty({ icon: 'users', title: 'No staff accounts yet', text: 'Add your team from the Staff screen.' }),
        ),
      ),
      section(
        'Recent clock activity',
        link('#/attendance', 'View log'),
        data.recent_clock.length
          ? group(
              data.recent_clock.map((e) =>
                row({
                  title: `${e.user_name} ${e.status === 'blocked' ? 'was blocked from clocking in' : isForced(e) ? `was clocked out by ${e.forced_by_name}` : e.type === 'in' ? 'clocked in' : 'clocked out'}`,
                  subtitle: `${fmtWhen(e.at)} · ${eventWhere(e)}`,
                  trailing: eventBadge(e),
                }),
              ),
            )
          : empty({ icon: 'clock', title: 'No clock events yet', text: 'Clock-ins appear here as staff arrive.' }),
      ),
    ];
  }

  return () => {
    clearInterval(timer);
    view.stop();
  };
}
