// Local dates and times of day belong to the facility's time zone, not to
// wherever the server happens to run (a hosted server usually runs on UTC).
import { get } from './db.js';

const pad = (n) => String(n).padStart(2, '0');
const formatters = new Map();

function partsIn(timeZone, date) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    formatters.set(timeZone, format);
  }
  const parts = {};
  for (const { type, value } of format.formatToParts(date)) parts[type] = Number(value);
  return parts;
}

// How far the zone is ahead of UTC at that instant, in milliseconds.
function offsetMs(timeZone, utcMs) {
  const p = partsIn(timeZone, new Date(utcMs));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(utcMs / 1000) * 1000;
}

export function isTimeZone(value) {
  if (typeof value !== 'string' || !value) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const systemTimeZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export async function timeZone() {
  const row = await get('SELECT timezone FROM facility WHERE id = 1');
  return row?.timezone || 'UTC';
}

// The calendar date in the zone, as YYYY-MM-DD.
export function localDate(timeZone, date = new Date()) {
  const p = partsIn(timeZone, date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// The time of day in the zone, as HH:MM.
export function localTime(timeZone, date) {
  const p = partsIn(timeZone, date);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

// Calendar arithmetic only: no zone is involved in "the day after".
export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// The instant at which the zone's clocks read `date` `time`. The offset is
// looked up twice so the hour either side of a daylight-saving change is right.
export function zonedTime(timeZone, date, time) {
  const naive = Date.parse(`${date}T${time}:00Z`);
  const first = naive - offsetMs(timeZone, naive);
  return new Date(naive - offsetMs(timeZone, first));
}

export const startOfDay = (timeZone, date) => zonedTime(timeZone, date, '00:00');
export const endOfDay = (timeZone, date) => new Date(zonedTime(timeZone, shiftDate(date, 1), '00:00').getTime() - 1);
