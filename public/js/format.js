// Dates, durations and distances, written the way people say them.

const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const shortDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const pad = (n) => String(n).padStart(2, '0');
const asDate = (value) => (value instanceof Date ? value : new Date(value));

export const fmtTime = (value) => timeFmt.format(asDate(value));
export const fmtDay = (value) => dayFmt.format(asDate(value));
export const fmtShortDay = (value) => shortDayFmt.format(asDate(value));

// "08:00" as stored on a schedule, shown in the reader's own clock format.
export const fmtClock = (hhmm) => timeFmt.format(new Date(`2000-01-01T${hhmm}:00`));

export function localDate(value = new Date()) {
  const d = asDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}

export const dateFromLocal = (date) => new Date(`${date}T12:00:00`);

// "Today, 2:05 PM" / "Yesterday, 9:10 PM" / "Oct 9, 9:10 PM"
export function fmtWhen(value) {
  const d = asDate(value);
  const day = localDate(d);
  const today = localDate();
  const label = day === today ? 'Today' : day === shiftDate(today, -1) ? 'Yesterday' : dateFmt.format(d);
  return `${label}, ${fmtTime(d)}`;
}

export function fmtDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${pad(minutes % 60)}m`;
}

export function fmtMinutes(minutes) {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

// "3 h 10 min ago" / "just now"
export function fmtAgo(value, now = Date.now()) {
  const minutes = (now - asDate(value).getTime()) / 60000;
  return minutes < 1 ? 'just now' : `${fmtMinutes(minutes)} ago`;
}

// A whole number of minutes as "8h 05m", for shift lengths and totals.
export const fmtHours = (minutes) => fmtDuration(minutes * 60000);

// A Date as the value a <input type="datetime-local"> expects.
export function toDateTimeLocal(value = new Date()) {
  const d = asDate(value);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDistance(metres) {
  if (metres == null) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

export const fmtCoords = (lat, lng) => `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`;

export function initials(name) {
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
