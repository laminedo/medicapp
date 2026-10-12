// Medication tasks are computed, not stored: a day's list is every scheduled
// dose that was in force that day, matched against what was recorded for it.
import { all } from './db.js';
import { zonedTime } from './time.js';

// Minutes relative to the scheduled time. Change these to tune the round.
export const DUE_OPENS_BEFORE_MIN = 60; // staff may record a dose this early
export const OVERDUE_AFTER_MIN = 30; // nothing recorded this long after: overdue
export const MISSED_AFTER_MIN = 120; // nothing recorded this long after: missed
export const RECORD_CUTOFF_MIN = 12 * 60; // a missed dose can still be recorded late, with a note, until here

export const THRESHOLDS = {
  due_opens_before_min: DUE_OPENS_BEFORE_MIN,
  overdue_after_min: OVERDUE_AFTER_MIN,
  missed_after_min: MISSED_AFTER_MIN,
};

// What can be recorded against a scheduled dose. All three close the dose;
// only "given" means the resident took it.
export const OUTCOMES = ['given', 'refused', 'held'];

const HOUR_MS = 60 * 60 * 1000;

export function parseTimes(json) {
  try {
    const times = JSON.parse(json);
    return Array.isArray(times) ? times : [];
  } catch {
    return [];
  }
}

function statusOf(minutesLate) {
  if (minutesLate < -DUE_OPENS_BEFORE_MIN) return 'upcoming';
  if (minutesLate < OVERDUE_AFTER_MIN) return 'due';
  if (minutesLate < MISSED_AFTER_MIN) return 'overdue';
  return 'missed';
}

const RECORD_COLUMNS = `a.id, a.medication_id, a.patient_id, a.scheduled_date, a.scheduled_time, a.med_name, a.dosage,
       a.outcome, a.recorded_by, a.recorded_at, a.note, a.voided_at, a.void_reason,
       u.name AS recorded_by_name, v.name AS voided_by_name`;
const RECORD_JOINS = `FROM administrations a
       JOIN users u ON u.id = a.recorded_by
       LEFT JOIN users v ON v.id = a.voided_by`;

// A voided record as the audit trail shows it.
const presentVoided = (r) => ({
  id: r.id,
  outcome: r.outcome,
  recorded_at: r.recorded_at,
  recorded_by_name: r.recorded_by_name,
  note: r.note,
  voided_at: r.voided_at,
  voided_by_name: r.voided_by_name,
  void_reason: r.void_reason,
});

// `timeZone` is the facility's: a dose scheduled for 08:00 is due when the
// clocks there read 08:00, wherever the server is.
export async function buildTasks(timeZone, date, at = new Date()) {
  const meds = await all(
    `SELECT m.id, m.patient_id, m.name, m.dosage, m.instructions, m.times, m.created_at, m.ended_at,
            p.name AS patient_name, p.room, p.notes AS patient_notes, p.archived_at
       FROM medications m JOIN patients p ON p.id = m.patient_id
      WHERE m.prn = 0`,
  );
  const records = await all(`SELECT ${RECORD_COLUMNS} ${RECORD_JOINS} WHERE a.scheduled_date = ? AND a.scheduled_time IS NOT NULL ORDER BY a.recorded_at`, date);
  const liveByKey = new Map();
  const voidedByKey = new Map();
  for (const record of records) {
    const key = `${record.medication_id}|${record.scheduled_time}`;
    if (record.voided_at) voidedByKey.set(key, [...(voidedByKey.get(key) ?? []), presentVoided(record)]);
    else liveByKey.set(key, record);
  }
  const tasks = [];

  for (const med of meds) {
    for (const time of parseTimes(med.times)) {
      const when = zonedTime(timeZone, date, time);
      const iso = when.toISOString();
      const key = `${med.id}|${time}`;
      const record = liveByKey.get(key);
      const voided = voidedByKey.get(key) ?? [];
      // A dose only counts if this version of the prescription was in force.
      const inForce = iso >= med.created_at && (!med.ended_at || iso < med.ended_at) && (!med.archived_at || iso < med.archived_at);
      if (!inForce && !record && voided.length === 0) continue;

      const minutesLate = (at.getTime() - when.getTime()) / 60000;
      const status = record ? record.outcome : statusOf(minutesLate);
      tasks.push({
        key: `${med.id}|${date}|${time}`,
        medication_id: med.id,
        patient_id: med.patient_id,
        patient_name: med.patient_name,
        room: med.room,
        patient_notes: med.patient_notes,
        med_name: record ? record.med_name : med.name,
        dosage: record ? record.dosage : med.dosage,
        instructions: med.instructions,
        date,
        time,
        scheduled_at: iso,
        status,
        can_record: !record && inForce && status !== 'upcoming' && minutesLate < RECORD_CUTOFF_MIN,
        note_required: status === 'missed',
        administration_id: record?.id ?? null,
        recorded_at: record?.recorded_at ?? null,
        recorded_by: record?.recorded_by ?? null,
        recorded_by_name: record?.recorded_by_name ?? null,
        late_min: record ? Math.max(0, Math.round((Date.parse(record.recorded_at) - when.getTime()) / 60000)) : null,
        note: record?.note ?? '',
        voided,
      });
    }
  }

  tasks.sort((a, b) => a.time.localeCompare(b.time) || a.room.localeCompare(b.room, undefined, { numeric: true }) || a.med_name.localeCompare(b.med_name));
  return tasks;
}

export function countTasks(tasks) {
  const counts = { total: tasks.length, given: 0, refused: 0, held: 0, due: 0, overdue: 0, missed: 0, upcoming: 0 };
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

// ---- as-needed (PRN) medications ------------------------------------------

// Where an as-needed medication stands against its own limits right now.
export async function prnStanding(med, at = new Date()) {
  const dayAgo = new Date(at.getTime() - 24 * HOUR_MS).toISOString();
  const recent = await all(
    `SELECT a.recorded_at, u.name AS recorded_by_name
       FROM administrations a JOIN users u ON u.id = a.recorded_by
      WHERE a.medication_id = ? AND a.voided_at IS NULL AND a.outcome = 'given' AND a.recorded_at >= ?
      ORDER BY a.recorded_at DESC`,
    med.id, dayAgo,
  );
  const last = recent[0] ?? null;
  const nextAllowed = last && med.prn_min_hours ? new Date(Date.parse(last.recorded_at) + med.prn_min_hours * HOUR_MS) : null;
  const tooSoon = Boolean(nextAllowed && nextAllowed > at);
  const dailyLimitReached = Boolean(med.prn_max_daily && recent.length >= med.prn_max_daily);
  return {
    last_given_at: last?.recorded_at ?? null,
    last_given_by_name: last?.recorded_by_name ?? null,
    given_last_24h: recent.length,
    next_allowed_at: tooSoon ? nextAllowed.toISOString() : null,
    too_soon: tooSoon,
    daily_limit_reached: dailyLimitReached,
  };
}

// Every as-needed medication currently prescribed, with its standing.
export async function buildPrn(at = new Date()) {
  const meds = await all(
    `SELECT m.id, m.patient_id, m.name, m.dosage, m.instructions, m.prn_min_hours, m.prn_max_daily,
            p.name AS patient_name, p.room, p.notes AS patient_notes
       FROM medications m JOIN patients p ON p.id = m.patient_id
      WHERE m.prn = 1 AND m.active = 1 AND p.active = 1`,
  );
  meds.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  const standings = await Promise.all(meds.map((med) => prnStanding(med, at)));
  return meds.map((med, index) => ({
    medication_id: med.id,
    patient_id: med.patient_id,
    patient_name: med.patient_name,
    room: med.room,
    patient_notes: med.patient_notes,
    med_name: med.name,
    dosage: med.dosage,
    instructions: med.instructions,
    min_hours: med.prn_min_hours,
    max_daily: med.prn_max_daily,
    ...standings[index],
  }));
}

// As-needed doses recorded on a day, voided ones included, for the report.
export function prnRecords(date) {
  return all(
    `SELECT ${RECORD_COLUMNS}, p.name AS patient_name, p.room
       ${RECORD_JOINS}
       JOIN patients p ON p.id = a.patient_id
      WHERE a.scheduled_date = ? AND a.scheduled_time IS NULL
      ORDER BY a.recorded_at`,
    date,
  );
}
