import { isoDate, number } from '../router.js';
import { buildShifts } from '../shifts.js';
import { localDate, localTime, shiftDate, timeZone } from '../time.js';

async function readRange(query) {
  const zone = await timeZone();
  const today = localDate(zone);
  const to = query.to ? isoDate(query.to, 'To date') : today;
  const from = query.from ? isoDate(query.from, 'From date') : shiftDate(to, -6);
  const userId = query.user_id ? number(query.user_id, 'Staff member', { integer: true, min: 1 }) : null;
  return { timeZone: zone, from: from <= to ? from : to, to, userId };
}

// Spreadsheets run cells that start with = + - or @ as formulas. Names are
// typed in by people, so those cells are neutralised before quoting.
function csvCell(value) {
  let cell = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return `"${cell.replace(/"/g, '""')}"`;
}

const hours = (minutes) => (minutes / 60).toFixed(2);

export default function reportRoutes(router) {
  router.get('/api/reports/hours', { role: 'admin' }, async ({ query }) => {
    const range = await readRange(query);
    return { from: range.from, to: range.to, ...(await buildShifts(range)) };
  });

  router.get('/api/reports/hours.csv', { role: 'admin' }, async ({ query, raw }) => {
    const range = await readRange(query);
    const zone = range.timeZone;
    const { shifts, people } = await buildShifts(range);
    const rows = [['Staff member', 'Job title', 'Date', 'Clock in', 'Clock out', 'Hours', 'Notes']];
    for (const s of [...shifts].sort((a, b) => a.user_name.localeCompare(b.user_name) || a.in_at.localeCompare(b.in_at))) {
      const notes = [];
      if (s.open) notes.push('Still on shift (not counted)');
      if (s.off_site_out) notes.push('Clocked out off-site');
      if (s.forced_by_name) notes.push(`Clocked out by ${s.forced_by_name}${s.note ? `: ${s.note}` : ''}`);
      const start = new Date(s.in_at);
      rows.push([s.user_name, s.job_title, localDate(zone, start), localTime(zone, start), s.out_at ? localTime(zone, new Date(s.out_at)) : '', s.open ? '' : hours(s.minutes), notes.join('; ')]);
    }
    rows.push([]);
    rows.push(['Totals']);
    for (const p of people) rows.push([p.user_name, p.job_title, '', '', '', hours(p.minutes), `${p.shifts} completed ${p.shifts === 1 ? 'shift' : 'shifts'}`]);

    // The BOM makes Excel read the file as UTF-8, so accented names survive.
    raw(
      200,
      {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="hours-${range.from}-to-${range.to}.csv"`,
        'Cache-Control': 'no-store',
      },
      `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`,
    );
  });
}
