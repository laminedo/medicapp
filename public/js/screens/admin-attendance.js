import { api } from '../api.js';
import { h } from '../dom.js';
import { icon } from '../icons.js';
import { eventBadge, isForced, openForceClockOut } from '../clock.js';
import { fmtCoords, fmtDistance, fmtHours, fmtShortDay, fmtTime, localDate, plural, shiftDate } from '../format.js';
import { avatar, badge, button, dataView, empty, field, group, input, pageHead, row, section, segmented, select, toast, withBusy } from '../ui.js';

const mapUrl = (e) => `https://www.openstreetmap.org/?mlat=${e.latitude}&mlon=${e.longitude}#map=18/${e.latitude}/${e.longitude}`;

const table = (headings, rows) =>
  h(
    'div',
    { class: 'group table-wrap' },
    h('table', { class: 'table' }, h('thead', null, h('tr', null, headings.map((label) => h('th', { scope: 'col' }, label)))), h('tbody', null, rows)),
  );

export function mount(root) {
  const today = localDate();
  const state = { view: 'hours', user_id: '', from: shiftDate(today, -6), to: today, blocked: '' };
  let staff = [];

  const query = (keys) => new URLSearchParams(keys.filter((k) => state[k] !== '').map((k) => [k, state[k]]));

  const view = dataView(root, {
    load: async () => {
      if (staff.length === 0) staff = (await api.get('/api/users')).users.filter((u) => u.role === 'staff');
      return state.view === 'hours'
        ? api.get(`/api/reports/hours?${query(['user_id', 'from', 'to'])}`)
        : api.get(`/api/clock/events?${query(['user_id', 'from', 'to', 'blocked'])}`);
    },
    render: (data) => [...head(), state.view === 'hours' ? hours(data) : log(data)].flat(),
  });
  const reload = () => view.refresh({ quiet: true });

  const set = (key) => (event) => {
    state[key] = event.target.value;
    reload();
  };

  function head() {
    const tabs = segmented(
      [{ value: 'hours', label: 'Hours worked' }, { value: 'log', label: 'Clock log' }],
      state.view,
      (value) => {
        state.view = value;
        reload();
      },
    );
    const filters = h(
      'div',
      { class: `filters${state.view === 'hours' ? ' filters--three' : ''}` },
      field('Staff member', select({ onChange: set('user_id') }, [{ value: '', label: 'Everyone' }, ...staff.map((u) => ({ value: u.id, label: u.name }))], state.user_id)),
      field('From', input({ type: 'date', value: state.from, max: state.to, onChange: set('from') })),
      field('To', input({ type: 'date', value: state.to, min: state.from, max: today, onChange: set('to') })),
      state.view === 'log' &&
        field('Show', select({ onChange: set('blocked') }, [{ value: '', label: 'All events' }, { value: '0', label: 'Successful only' }, { value: 'only', label: 'Blocked attempts only' }], state.blocked)),
    );
    return [pageHead('Attendance', 'Hours worked, and every clock-in and clock-out with its time and place.'), h('div', { class: 'tabs' }, tabs), filters];
  }

  // ---- hours worked --------------------------------------------------------

  function hours({ people, shifts, total_minutes: total }) {
    if (shifts.length === 0) {
      return empty({ icon: 'clock', title: 'No shifts in these dates', text: 'A shift appears once someone has clocked in. Widen the dates to see more.' });
    }
    const download = button('Download CSV', {
      icon: 'external',
      onClick: () => withBusy(download, () => api.download(`/api/reports/hours.csv?${query(['user_id', 'from', 'to'])}`, 'hours.csv').catch((err) => toast(err.message, 'danger'))),
    });

    const totals = group(
      people.map((p) =>
        row({
          leading: avatar(p.user_name),
          title: p.user_name,
          subtitle: [p.job_title, plural(p.shifts, 'completed shift')].filter(Boolean).join(' · '),
          trailing: [p.open && badge('ok', 'On shift now'), h('span', { class: 'row-figure nums' }, fmtHours(p.minutes))],
        }),
      ),
    );

    const rows = shifts.map((s) =>
      h(
        'tr',
        null,
        h('td', { 'data-label': 'Date' }, h('span', { class: 'cell-strong' }, fmtShortDay(s.in_at))),
        h('td', { 'data-label': 'Staff member' }, h('span', { class: 'cell-strong' }, s.user_name), h('span', { class: 'cell-sub' }, s.job_title)),
        h('td', { 'data-label': 'In and out' }, h('span', { class: 'cell-strong nums' }, `${fmtTime(s.in_at)} to ${s.out_at ? fmtTime(s.out_at) : 'now'}`), shiftNote(s) && h('span', { class: 'cell-sub' }, shiftNote(s))),
        h('td', { 'data-label': 'Hours' }, h('span', { class: `cell-strong nums${s.open ? ' cell-muted' : ''}` }, fmtHours(s.minutes)), s.open && h('span', { class: 'cell-sub' }, 'So far, not counted')),
        h(
          'td',
          { 'data-label': 'Status' },
          s.open
            ? button('Clock out', { size: 'sm', onClick: () => openForceClockOut({ userId: s.user_id, name: s.user_name, since: s.in_at }, reload) })
            : s.forced_by_name
              ? badge('neutral', 'By admin')
              : s.off_site_out
                ? badge('warn', 'Off-site out')
                : badge('ok', 'Complete'),
        ),
      ),
    );

    return [
      section('Totals', h('span', { class: 'section-meta nums' }, `${fmtHours(total)} across ${plural(people.length, 'person', 'people')}`), totals),
      section('Shifts', download, table(['Date', 'Staff member', 'In and out', 'Hours', 'Status'], rows)),
    ];
  }

  function shiftNote(s) {
    if (s.forced_by_name) return `Clocked out by ${s.forced_by_name}${s.note ? `: ${s.note}` : ''}`;
    if (s.off_site_out) return 'Clocked out away from the site';
    return '';
  }

  // ---- clock log -----------------------------------------------------------

  function log({ events }) {
    if (events.length === 0) {
      return empty({ icon: 'clock', title: 'No clock events match', text: 'Widen the dates or clear the filters to see more.' });
    }
    const rows = events.map((e) =>
      h(
        'tr',
        { class: e.status === 'blocked' ? 'is-blocked' : null },
        h('td', { 'data-label': 'When' }, h('span', { class: 'cell-strong' }, fmtTime(e.at)), h('span', { class: 'cell-sub' }, fmtShortDay(e.at))),
        h('td', { 'data-label': 'Staff member' }, h('span', { class: 'cell-strong' }, e.user_name), !e.user_active && h('span', { class: 'cell-sub' }, 'Account removed')),
        h('td', { 'data-label': 'Event' }, e.status === 'blocked' ? 'Clock-in attempt' : e.type === 'in' ? 'Clock in' : 'Clock out'),
        isForced(e)
          ? h('td', { 'data-label': 'Where' }, h('span', { class: 'cell-strong' }, `Entered by ${e.forced_by_name}`), e.note && h('span', { class: 'cell-sub' }, e.note))
          : h(
              'td',
              { 'data-label': 'Where' },
              h('span', { class: 'cell-strong' }, `${fmtDistance(e.distance_m)} from site`),
              h(
                'span',
                { class: 'cell-sub' },
                h('a', { class: 'link link--quiet', href: mapUrl(e), target: '_blank', rel: 'noopener noreferrer' }, fmtCoords(e.latitude, e.longitude), icon('external', 13)),
                e.accuracy_m != null && ` · ±${fmtDistance(e.accuracy_m)}`,
              ),
            ),
        h('td', { 'data-label': 'Result' }, eventBadge(e)),
      ),
    );
    return [section(plural(events.length, 'event'), null, table(['When', 'Staff member', 'Event', 'Where', 'Result'], rows))];
  }

  return () => view.stop();
}
