import { api } from '../api.js';
import { h } from '../dom.js';
import { getPosition } from '../geo.js';
import { eventBadge, eventTitle, eventWhere } from '../clock.js';
import { fmtClock, fmtDay, fmtDistance, fmtDuration, fmtTime, fmtWhen, greeting, plural } from '../format.js';
import { badge, button, callout, dataView, empty, group, pageHead, row, section, withBusy } from '../ui.js';
import { geofenceRing, positionCaption } from '../ring.js';

const TICK_MS = 20000;

export function mount(root, ctx) {
  // What this device last reported, kept across refreshes of the server data.
  const local = { position: null, notice: null, pulse: false };
  let ticker = null;

  const view = dataView(root, {
    load: async () => {
      const [status, round] = await Promise.all([api.get('/api/clock/status'), api.get('/api/tasks?carry=1')]);
      return { status, round };
    },
    render: draw,
  });

  function draw({ status, round }) {
    clearInterval(ticker);
    const card = clockCard(status);
    ticker = setInterval(card.tick, TICK_MS);
    return [
      pageHead(`${greeting()}, ${ctx.user.name.split(' ')[0]}`, fmtDay(new Date())),
      h('div', { class: 'shift-layout' }, card.el, h('div', { class: 'shift-side' }, roundSummary(round), recentEvents(status.recent))),
    ];
  }

  function clockCard(status) {
    const { facility } = status;
    const onShift = status.clocked_in;
    const figure = h('p', { class: 'clock-figure nums' });
    const hint = h('p', { class: 'clock-hint', role: 'status' });
    // Time on shift, or the time of day. Units are set smaller than the digits.
    const tick = () => {
      const parts = onShift ? durationParts(Date.now() - Date.parse(status.since)) : timeParts(new Date());
      figure.setAttribute('aria-label', onShift ? `On shift for ${fmtDuration(Date.now() - Date.parse(status.since))}` : fmtTime(new Date()));
      figure.replaceChildren(...parts.map(([value, unit]) => h('span', { 'aria-hidden': 'true' }, value, unit && h('span', { class: 'clock-unit' }, unit))));
    };
    tick();

    const primary = button(onShift ? 'Clock out' : 'Clock in', {
      variant: onShift ? 'secondary' : 'primary',
      size: 'lg',
      icon: 'pin',
      block: true,
      onClick: () => clock(onShift ? 'out' : 'in', primary, hint),
    });
    const check = button('Check my location', { variant: 'ghost', icon: 'locate', block: true, onClick: () => checkLocation(check, hint, facility) });

    const pulse = local.pulse;
    local.pulse = false; // the ripple plays once, on the render right after a clock event

    const el = h(
      'section',
      { class: `clock panel${onShift ? ' clock--on' : ''}`, 'aria-label': 'Clock in and out' },
      h(
        'div',
        { class: 'clock-top' },
        h(
          'div',
          { class: 'clock-head' },
          h('p', { class: 'clock-state' }, h('span', { class: 'clock-dot', 'aria-hidden': 'true' }), onShift ? 'On shift' : 'Off shift'),
          figure,
          h('p', { class: 'clock-sub' }, onShift ? `Clocked in at ${fmtTime(status.since)}` : facility.name),
        ),
        geofenceRing({ facility, position: local.position, pulse, size: 188 }),
      ),
      facility.location_set
        ? h('p', { class: 'clock-caption' }, positionCaption(local.position, facility))
        : callout('warn', 'Clock-in is not available yet', 'An admin needs to set the facility location in Settings first.'),
      local.notice && callout(local.notice.tone, local.notice.title, local.notice.text),
      h('div', { class: 'clock-actions' }, primary, check),
      hint,
    );
    return { el, tick };
  }

  async function locate(hint) {
    hint.textContent = 'Finding your location…';
    try {
      local.position = await getPosition();
      return local.position;
    } catch (err) {
      local.notice = { tone: 'danger', title: err.title, text: err.message };
      return null;
    } finally {
      hint.textContent = '';
    }
  }

  async function clock(type, btn, hint) {
    local.notice = null;
    await withBusy(btn, async () => {
      const position = await locate(hint);
      if (!position) return;
      try {
        const { event } = await api.post(`/api/clock/${type}`, position);
        local.pulse = true;
        if (type === 'in') {
          local.notice = { tone: 'ok', title: 'You are clocked in.', text: `Recorded at ${fmtTime(event.at)}, ${fmtDistance(event.distance_m)} from the centre of the site.` };
        } else if (event.on_site) {
          local.notice = { tone: 'ok', title: 'You are clocked out.', text: `Recorded at ${fmtTime(event.at)}. Thank you for today.` };
        } else {
          local.notice = { tone: 'warn', title: 'You are clocked out, off-site.', text: `Recorded at ${fmtTime(event.at)}, ${fmtDistance(event.distance_m)} from the site. Your admin can see this.` };
        }
      } catch (err) {
        local.notice = err.data?.code === 'outside_geofence' ? blockedNotice(err.data) : { tone: 'danger', title: err.message };
      }
    });
    view.refresh({ quiet: true });
  }

  function blockedNotice({ distance_m: distance, radius_m: radius, accuracy_m: accuracy, facility_name: name }) {
    let text = `Your device puts you ${fmtDistance(distance)} from ${name}. Clock-in opens within ${fmtDistance(radius)}.`;
    if (accuracy && accuracy > radius) {
      text += ` Your location is only accurate to about ${fmtDistance(accuracy)}, so try again near a window or with Wi-Fi turned on.`;
    }
    return { tone: 'danger', title: 'You must be on-site to clock in.', text };
  }

  async function checkLocation(btn, hint) {
    local.notice = null;
    await withBusy(btn, () => locate(hint));
    view.refresh({ quiet: true });
  }

  function roundSummary({ tasks }) {
    const late = tasks.filter((t) => t.status === 'overdue' || t.status === 'missed');
    const due = tasks.filter((t) => t.status === 'due');
    const next = tasks.find((t) => t.status === 'upcoming');
    const rows = [];
    if (late.length) rows.push(row({ title: plural(late.length, 'late dose'), subtitle: late.map((t) => t.patient_name).filter(unique).join(', '), trailing: badge('danger', 'Late'), chevron: true, href: '#/meds' }));
    if (due.length) rows.push(row({ title: `${plural(due.length, 'dose')} due now`, subtitle: due.map((t) => t.patient_name).filter(unique).join(', '), trailing: badge('warn', 'Due'), chevron: true, href: '#/meds' }));
    if (next) rows.push(row({ title: `Next at ${fmtClock(next.time)}`, subtitle: `${next.med_name} for ${next.patient_name}`, chevron: true, href: '#/meds' }));
    if (rows.length === 0) rows.push(row({ title: 'All doses for today are given', subtitle: 'Nothing is waiting on this round.', chevron: true, href: '#/meds' }));
    return section('Medication round', null, group(rows));
  }

  function recentEvents(events) {
    if (events.length === 0) {
      return section('Your clock history', null, empty({ icon: 'clock', title: 'No clock events yet', text: 'Your clock-ins and clock-outs will be listed here.' }));
    }
    return section(
      'Your clock history',
      null,
      group(
        events.slice(0, 6).map((e) =>
          row({ title: eventTitle(e), subtitle: `${fmtWhen(e.at)} · ${eventWhere(e)}`, detail: e.note, trailing: eventBadge(e) }),
        ),
      ),
    );
  }

  return () => {
    clearInterval(ticker);
    view.stop();
  };
}

const unique = (value, index, list) => list.indexOf(value) === index;

function durationParts(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return [[minutes, 'min']];
  return [[Math.floor(minutes / 60), 'h'], [String(minutes % 60).padStart(2, '0'), 'm']];
}

const clockFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function timeParts(date) {
  const parts = clockFormat.formatToParts(date);
  const digits = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  return [[digits, parts.find((p) => p.type === 'dayPeriod')?.value]];
}
