// Pairs clock-ins with the clock-outs that follow them, to give worked shifts.
import { all } from './db.js';

const startOfDay = (date) => new Date(`${date}T00:00:00`).toISOString();
const endOfDay = (date) => new Date(`${date}T23:59:59.999`).toISOString();

// Shifts that STARTED between `from` and `to` (local dates, inclusive). A shift
// still open has no clock-out and is never counted towards the totals.
export function buildShifts({ from, to, userId = null, at = new Date() }) {
  const params = [startOfDay(from)];
  let userFilter = '';
  if (userId) {
    userFilter = 'AND e.user_id = ?';
    params.push(userId);
  }
  // No upper bound on purpose: a shift that started in range may end after it.
  const events = all(
    `SELECT e.id, e.user_id, e.type, e.at, e.on_site, e.forced_by, e.note,
            u.name AS user_name, u.job_title, f.name AS forced_by_name
       FROM clock_events e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN users f ON f.id = e.forced_by
      WHERE e.status = 'ok' AND e.at >= ? ${userFilter}
      ORDER BY e.user_id, e.at, e.id`,
    ...params,
  );

  const until = endOfDay(to);
  const shifts = [];
  let open = null;
  const close = (out) => {
    if (open && open.at <= until) {
      const end = out ? Date.parse(out.at) : at.getTime();
      shifts.push({
        user_id: open.user_id,
        user_name: open.user_name,
        job_title: open.job_title,
        in_at: open.at,
        out_at: out?.at ?? null,
        minutes: Math.max(0, Math.round((end - Date.parse(open.at)) / 60000)),
        open: !out,
        off_site_out: Boolean(out) && out.on_site === 0,
        forced_by_name: out?.forced_by_name ?? null,
        note: out?.note ?? '',
      });
    }
    open = null;
  };

  for (const event of events) {
    if (open && open.user_id !== event.user_id) close(null);
    if (event.type === 'in') {
      if (open) close(null);
      open = event;
    } else if (open) {
      close(event);
    }
  }
  if (open) close(null);

  const people = new Map();
  for (const shift of shifts) {
    const person = people.get(shift.user_id) ?? { user_id: shift.user_id, user_name: shift.user_name, job_title: shift.job_title, shifts: 0, minutes: 0, open: false };
    if (shift.open) {
      person.open = true;
    } else {
      person.shifts += 1;
      person.minutes += shift.minutes;
    }
    people.set(shift.user_id, person);
  }

  shifts.sort((a, b) => b.in_at.localeCompare(a.in_at));
  return {
    shifts,
    people: [...people.values()].sort((a, b) => a.user_name.localeCompare(b.user_name)),
    total_minutes: shifts.reduce((sum, s) => sum + (s.open ? 0 : s.minutes), 0),
  };
}
