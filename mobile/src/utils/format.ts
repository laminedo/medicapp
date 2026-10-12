// Dates, durations and distances, written the way people say them.

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

const pad = (n: number) => String(n).padStart(2, '0');

export const formatTime = (value: string | Date) => timeFormat.format(new Date(value));
export const formatDay = (value: string | Date) => dayFormat.format(new Date(value));

// "08:00" as stored on a schedule, in the reader's own clock format.
export const formatClock = (hhmm: string) => timeFormat.format(new Date(`2000-01-01T${hhmm}:00`));

export function localDate(value: Date = new Date()) {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

// "Today, 2:05 PM" / "Yesterday, 9:10 PM" / "Oct 9, 9:10 PM"
export function formatWhen(value: string | Date) {
  const date = new Date(value);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const day = localDate(date);
  const label = day === localDate() ? 'Today' : day === localDate(yesterday) ? 'Yesterday' : dateFormat.format(date);
  return `${label}, ${formatTime(date)}`;
}

export function formatMinutes(minutes: number) {
  const m = Math.round(Math.abs(minutes));
  if (m < 60) return `${m} min`;
  const rest = m % 60;
  return rest ? `${Math.floor(m / 60)} h ${rest} min` : `${Math.floor(m / 60)} h`;
}

export function formatAgo(value: string, now = Date.now()) {
  const minutes = (now - Date.parse(value)) / 60000;
  return minutes < 1 ? 'just now' : `${formatMinutes(minutes)} ago`;
}

export function formatDistance(metres: number | null) {
  if (metres == null) return '';
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(metres < 10000 ? 1 : 0)} km`;
}

// Time on shift as digits and units, so the units can be set smaller.
export function durationParts(ms: number): [string, string][] {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return [[String(minutes), 'min']];
  return [
    [String(Math.floor(minutes / 60)), 'h'],
    [pad(minutes % 60), 'm'],
  ];
}

export function timeParts(date: Date): [string, string][] {
  const parts = timeFormat.formatToParts(date);
  const digits = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
  return [[digits, parts.find((p) => p.type === 'dayPeriod')?.value ?? '']];
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  if (hour < 5) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
