import { all, get, now, run, tx } from '../db.js';
import { HttpError, number, text } from '../router.js';
import { parseTimes } from '../schedule.js';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_TIMES_PER_DAY = 8;

function readTimes(value) {
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400, 'Add at least one time of day.');
  if (value.length > MAX_TIMES_PER_DAY) throw new HttpError(400, `A medication can have up to ${MAX_TIMES_PER_DAY} times a day.`);
  for (const time of value) {
    if (typeof time !== 'string' || !TIME.test(time)) throw new HttpError(400, 'Each time must look like 08:00.');
  }
  const unique = [...new Set(value)].sort();
  if (unique.length !== value.length) throw new HttpError(400, 'The same time is listed twice.');
  return unique;
}

const blank = (value) => value == null || value === '';

// A medication is either scheduled (times of day) or as-needed (PRN: no
// times, optional limits on how often it may be given).
function readMedication(body) {
  const prn = body.prn === true;
  return {
    name: text(body.name, 'Medication name', { max: 80 }),
    dosage: text(body.dosage, 'Dosage', { max: 60 }),
    instructions: text(body.instructions, 'Instructions', { min: 0, max: 300 }),
    prn: prn ? 1 : 0,
    times: prn ? [] : readTimes(body.times),
    prn_min_hours: prn && !blank(body.prn_min_hours) ? number(body.prn_min_hours, 'Hours between doses', { min: 0.5, max: 72 }) : null,
    prn_max_daily: prn && !blank(body.prn_max_daily) ? number(body.prn_max_daily, 'Doses in 24 hours', { min: 1, max: 24, integer: true }) : null,
  };
}

function insertMedication(patientId, med, at) {
  return run(
    `INSERT INTO medications (patient_id, name, dosage, instructions, times, prn, prn_min_hours, prn_max_daily, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    patientId, med.name, med.dosage, med.instructions, JSON.stringify(med.times), med.prn, med.prn_min_hours, med.prn_max_daily, at,
  ).lastInsertRowid;
}

function readPatient(body) {
  return {
    name: text(body.name, 'Name', { max: 80 }),
    room: text(body.room, 'Room', { max: 20 }),
    notes: text(body.notes, 'Notes', { min: 0, max: 1000 }),
  };
}

const presentMed = (m) => ({
  id: m.id,
  patient_id: m.patient_id,
  name: m.name,
  dosage: m.dosage,
  instructions: m.instructions,
  times: parseTimes(m.times),
  prn: m.prn === 1,
  prn_min_hours: m.prn_min_hours,
  prn_max_daily: m.prn_max_daily,
});

function activeMeds(patientId) {
  return all('SELECT * FROM medications WHERE patient_id = ? AND active = 1 ORDER BY prn, name COLLATE NOCASE', patientId).map(presentMed);
}

function findPatient(id) {
  const patient = get('SELECT id, name, room, notes, created_at FROM patients WHERE id = ? AND active = 1', id);
  if (!patient) throw new HttpError(404, 'That patient is no longer on the list.');
  return patient;
}

function findMedication(id) {
  const med = get('SELECT * FROM medications WHERE id = ? AND active = 1', id);
  if (!med) throw new HttpError(404, 'That medication is no longer on the schedule.');
  return med;
}

export default function patientRoutes(router) {
  router.get('/api/patients', { role: 'admin' }, () => {
    const patients = all('SELECT id, name, room, notes, created_at FROM patients WHERE active = 1');
    patients.sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name));
    return { patients: patients.map((p) => ({ ...p, medications: activeMeds(p.id) })) };
  });

  router.get('/api/patients/:id', { role: 'admin' }, ({ params }) => {
    const patient = findPatient(params.id);
    return { patient: { ...patient, medications: activeMeds(patient.id) } };
  });

  router.post('/api/patients', { role: 'admin' }, (ctx) => {
    const { name, room, notes } = readPatient(ctx.body);
    const { lastInsertRowid } = run('INSERT INTO patients (name, room, notes, created_at) VALUES (?, ?, ?, ?)', name, room, notes, now());
    ctx.status = 201;
    return { patient: { ...findPatient(lastInsertRowid), medications: [] } };
  });

  router.put('/api/patients/:id', { role: 'admin' }, ({ params, body }) => {
    const patient = findPatient(params.id);
    const { name, room, notes } = readPatient(body);
    run('UPDATE patients SET name = ?, room = ?, notes = ? WHERE id = ?', name, room, notes, patient.id);
    return { patient: { ...findPatient(patient.id), medications: activeMeds(patient.id) } };
  });

  // Archives rather than deletes: the medication history stays on record.
  router.delete('/api/patients/:id', { role: 'admin' }, ({ params }) => {
    const patient = findPatient(params.id);
    const at = now();
    tx(() => {
      run('UPDATE medications SET active = 0, ended_at = ? WHERE patient_id = ? AND active = 1', at, patient.id);
      run('UPDATE patients SET active = 0, archived_at = ? WHERE id = ?', at, patient.id);
    });
    return { ok: true };
  });

  router.post('/api/patients/:id/medications', { role: 'admin' }, (ctx) => {
    const patient = findPatient(ctx.params.id);
    const id = insertMedication(patient.id, readMedication(ctx.body), now());
    ctx.status = 201;
    return { medication: presentMed(get('SELECT * FROM medications WHERE id = ?', id)) };
  });

  router.put('/api/medications/:id', { role: 'admin' }, ({ params, body }) => {
    const existing = findMedication(params.id);
    const med = readMedication(body);
    const sameSchedule =
      med.name === existing.name &&
      med.dosage === existing.dosage &&
      JSON.stringify(med.times) === existing.times &&
      med.prn === existing.prn &&
      med.prn_min_hours === existing.prn_min_hours &&
      med.prn_max_daily === existing.prn_max_daily;

    if (sameSchedule) {
      run('UPDATE medications SET instructions = ? WHERE id = ?', med.instructions, existing.id);
      return { medication: presentMed(get('SELECT * FROM medications WHERE id = ?', existing.id)) };
    }
    // The prescription itself changed: close this version and open a new one.
    const at = now();
    const id = tx(() => {
      run('UPDATE medications SET active = 0, ended_at = ? WHERE id = ?', at, existing.id);
      return insertMedication(existing.patient_id, med, at);
    });
    return { medication: presentMed(get('SELECT * FROM medications WHERE id = ?', id)) };
  });

  router.delete('/api/medications/:id', { role: 'admin' }, ({ params }) => {
    const existing = findMedication(params.id);
    run('UPDATE medications SET active = 0, ended_at = ? WHERE id = ?', now(), existing.id);
    return { ok: true };
  });
}
