import { get, isUniqueViolation, now, run } from '../db.js';
import { HttpError, isoDate, number, oneOf, text } from '../router.js';
import { OUTCOMES, buildPrn, buildTasks, countTasks, prnRecords, prnStanding } from '../schedule.js';
import { localDate, shiftDate, timeZone } from '../time.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const PAST_TENSE = { given: 'given', refused: 'refused', held: 'held' };

export default function taskRoutes(router) {
  // ?date=YYYY-MM-DD (default today). ?carry=1 adds doses from yesterday that
  // are still open, so a night shift does not lose them at midnight.
  router.get('/api/tasks', async ({ query }) => {
    const at = new Date();
    const zone = await timeZone();
    const today = localDate(zone, at);
    const date = query.date ? isoDate(query.date, 'Date') : today;
    let tasks = await buildTasks(zone, date, at);
    if (query.carry === '1' && date === today) {
      const carried = (await buildTasks(zone, shiftDate(today, -1), at)).filter((t) => t.status === 'due' || t.status === 'overdue');
      tasks = [...carried, ...tasks];
    }
    return {
      date,
      today,
      now: at.toISOString(),
      tasks,
      counts: countTasks(tasks),
      prn: date === today ? await buildPrn(at) : [],
      prn_records: await prnRecords(date),
    };
  });

  // Record what happened to a scheduled dose: given, refused or held.
  router.post('/api/tasks/record', async ({ user, body }) => {
    const medicationId = number(body.medication_id, 'Medication', { integer: true, min: 1 });
    const date = isoDate(body.date, 'Date');
    const time = text(body.time, 'Time', { max: 5 });
    if (!TIME.test(time)) throw new HttpError(400, 'Time must look like 08:00.');
    const outcome = oneOf(body.outcome ?? 'given', 'Outcome', OUTCOMES);
    const note = text(body.note, 'Note', { min: 0, max: 500 });

    const zone = await timeZone();
    const find = async () => (await buildTasks(zone, date)).find((t) => t.medication_id === medicationId && t.time === time);
    const task = await find();
    if (!task) throw new HttpError(404, 'That dose is no longer on the schedule. Refresh the list.');
    if (OUTCOMES.includes(task.status)) {
      throw new HttpError(409, `Already recorded as ${PAST_TENSE[task.status]} by ${task.recorded_by_name}.`, { code: 'already_recorded' });
    }
    if (task.status === 'upcoming') throw new HttpError(400, 'It is too early to record this dose.');
    if (!task.can_record) throw new HttpError(400, 'This dose can no longer be recorded. Ask an admin to review it.');
    if (outcome !== 'given' && !note) {
      throw new HttpError(400, `Add the reason this dose was ${PAST_TENSE[outcome]}.`, { code: 'note_required' });
    }
    if (task.note_required && !note) {
      throw new HttpError(400, 'This dose is very late. Add a note explaining why before recording it.', { code: 'note_required' });
    }

    try {
      await run(
        `INSERT INTO administrations (medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, outcome, recorded_by, recorded_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        medicationId, task.patient_id, date, time, task.med_name, task.dosage, outcome, user.id, now(), note,
      );
    } catch (err) {
      // Two people tapping at once: the unique index lets exactly one through.
      if (isUniqueViolation(err)) {
        const winner = await find();
        throw new HttpError(409, `Already recorded as ${PAST_TENSE[winner?.status] ?? 'done'} by ${winner?.recorded_by_name ?? 'someone else'}.`, { code: 'already_recorded' });
      }
      throw err;
    }
    return { task: await find() };
  });

  // Record an as-needed (PRN) dose. A reason is always required. If the
  // medication's own limits would be broken, the caller must confirm it.
  router.post('/api/tasks/prn', async ({ user, body }) => {
    const medicationId = number(body.medication_id, 'Medication', { integer: true, min: 1 });
    const reason = text(body.note, 'Reason', { max: 500 });
    const med = await get(
      `SELECT m.*, p.active AS patient_active FROM medications m JOIN patients p ON p.id = m.patient_id
        WHERE m.id = ? AND m.prn = 1 AND m.active = 1`,
      medicationId,
    );
    if (!med || !med.patient_active) throw new HttpError(404, 'That medication is no longer prescribed. Refresh the list.');

    const standing = await prnStanding(med);
    if ((standing.too_soon || standing.daily_limit_reached) && body.confirm_limit !== true) {
      const message = standing.daily_limit_reached
        ? `${med.name} has already been given ${standing.given_last_24h} times in the last 24 hours, which is its limit.`
        : `${med.name} was last given less than ${med.prn_min_hours} hours ago.`;
      throw new HttpError(409, message, { code: 'prn_limit', ...standing });
    }

    const at = new Date();
    await run(
      `INSERT INTO administrations (medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, outcome, recorded_by, recorded_at, note)
       VALUES (?, ?, ?, NULL, ?, ?, 'given', ?, ?, ?)`,
      med.id, med.patient_id, localDate(await timeZone(), at), med.name, med.dosage, user.id, at.toISOString(), reason,
    );
    return { prn: (await buildPrn()).find((p) => p.medication_id === med.id) };
  });

  // Voiding never deletes: the record stays, marked with who voided it and
  // why, and a scheduled dose becomes open again so it can be recorded properly.
  router.post('/api/administrations/:id/void', { role: 'admin' }, async ({ params, user, body }) => {
    const reason = text(body.reason, 'Reason', { max: 300 });
    const record = await get('SELECT id, voided_at FROM administrations WHERE id = ?', params.id);
    if (!record) throw new HttpError(404, 'That record does not exist.');
    if (record.voided_at) throw new HttpError(409, 'That record has already been voided.');
    await run('UPDATE administrations SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', now(), user.id, reason, record.id);
    return { ok: true };
  });
}
