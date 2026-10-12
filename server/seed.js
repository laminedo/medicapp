// Sample data so the app can be tried straight away.
//   npm run reset   wipes the database and seeds it again
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { DB_PATH } from './paths.js';

// Demo sign-ins. Change these passwords (or remove the accounts) before real use.
export const DEMO_ACCOUNTS = [
  { username: 'admin', password: 'maple-admin-2026', name: 'Grace Okafor', role: 'admin', job_title: 'Director of Nursing' },
  { username: 'amara', password: 'maple-staff-2026', name: 'Amara Diallo', role: 'staff', job_title: 'Registered Nurse' },
  { username: 'james', password: 'maple-staff-2026', name: 'James Whitfield', role: 'staff', job_title: 'Licensed Practical Nurse' },
  { username: 'sofia', password: 'maple-staff-2026', name: 'Sofia Reyes', role: 'staff', job_title: 'Medication Aide' },
];

// Placeholder location. Set the real one in Settings (there is a "Use my current location" button).
const FACILITY = { name: 'Maple Grove Care Home', address: '1200 Alder Street', latitude: 45.5231, longitude: -122.6765, radius_m: 100 };

const PATIENTS = [
  {
    name: 'Eleanor Whitaker', room: '101',
    notes: 'Type 2 diabetes. Check blood glucose before breakfast and dinner. Takes tablets with apple sauce.',
    meds: [
      { name: 'Metformin', dosage: '500 mg tablet', instructions: 'Give with food.', times: ['08:00', '18:00'] },
      { name: 'Lisinopril', dosage: '10 mg tablet', instructions: 'Check blood pressure first. Hold if systolic is under 100.', times: ['08:00'] },
    ],
  },
  {
    name: 'Harold Jensen', room: '104',
    notes: "Parkinson's disease. Doses are time-critical, do not delay. Fall risk: assist with standing.",
    meds: [
      { name: 'Carbidopa-Levodopa', dosage: '25/100 mg tablet', instructions: 'Time-critical. Give 30 minutes before meals.', times: ['07:00', '11:00', '15:00', '19:00'] },
      { name: 'Atorvastatin', dosage: '20 mg tablet', instructions: '', times: ['21:00'] },
      { name: 'Acetaminophen', dosage: '500 mg tablet', instructions: 'For pain or fever.', prn: { minHours: 4, maxDaily: 4 } },
    ],
  },
  {
    name: "Margaret O'Connor", room: '108',
    notes: 'Allergy: penicillin. Hard of hearing, speak on her left side.',
    meds: [
      { name: 'Amlodipine', dosage: '5 mg tablet', instructions: '', times: ['09:00'] },
      { name: 'Acetaminophen', dosage: '500 mg tablet', instructions: 'For arthritis pain. No more than 3 doses in 24 hours.', times: ['08:00', '14:00', '20:00'] },
    ],
  },
  {
    name: 'Samuel Brooks', room: '112',
    notes: 'On warfarin: report any bruising or bleeding. Thickened fluids only.',
    meds: [
      { name: 'Warfarin', dosage: '2.5 mg tablet', instructions: 'Check the latest INR result before giving.', times: ['17:00'] },
      { name: 'Furosemide', dosage: '40 mg tablet', instructions: 'Record fluid output.', times: ['08:00'] },
      { name: 'Potassium chloride', dosage: '10 mEq tablet', instructions: 'Give with a full glass of thickened water.', times: ['08:00'] },
      { name: 'Ondansetron', dosage: '4 mg tablet', instructions: 'For nausea.', prn: { minHours: 8, maxDaily: 3 } },
    ],
  },
  {
    name: 'Ruth Abernathy', room: '115',
    notes: 'Mild dementia. May refuse medication: try again after 15 minutes and add a note.',
    meds: [
      { name: 'Levothyroxine', dosage: '50 mcg tablet', instructions: 'Empty stomach, 30 minutes before breakfast.', times: ['06:30'] },
      { name: 'Vitamin D3', dosage: '1000 IU capsule', instructions: '', times: ['09:00'] },
      { name: 'Donepezil', dosage: '10 mg tablet', instructions: 'Give at bedtime.', times: ['21:00'] },
    ],
  },
];

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

export async function seed() {
  const { get, run, tx } = await import('./db.js');
  const { hashPassword } = await import('./auth.js');
  const { buildTasks } = await import('./schedule.js');
  const { localDate, shiftDate, systemTimeZone, zonedTime } = await import('./time.js');

  // The sample care home keeps this machine's time, so "08:00" is 8 in the morning here.
  const zone = systemTimeZone();
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  const today = localDate(zone);
  const yesterday = shiftDate(today, -1);
  const twoDaysAgo = shiftDate(today, -2);
  const insert = async (sql, ...params) => (await get(`${sql} RETURNING id`, ...params)).id;

  await tx(async () => {
    await run(
      'INSERT INTO facility (id, name, address, latitude, longitude, radius_m, timezone, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, ?)',
      FACILITY.name, FACILITY.address, FACILITY.latitude, FACILITY.longitude, FACILITY.radius_m, zone, ago(30 * DAY),
    );

    const ids = {};
    for (const account of DEMO_ACCOUNTS) {
      ids[account.username] = await insert(
        'INSERT INTO users (username, name, role, job_title, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        account.username, account.name, account.role, account.job_title, hashPassword(account.password), ago(30 * DAY),
      );
    }

    // The sample rota: Amara on earlies, Sofia on days, James on lates. Today
    // is arranged so the demo starts the same way at any hour: James has been
    // in since early morning, Amara came in a couple of hours ago (try
    // clocking out as her), and Sofia is off (try clocking in as her).
    const amaraInToday = Date.now() - 130 * MINUTE;
    const giver = (date, time, givenAt, n) => {
      if (date === today) return givenAt >= amaraInToday ? ids.amara : ids.james;
      if (time < '09:00') return ids.amara;
      if (time < '15:00') return n % 2 ? ids.amara : ids.sofia;
      return time < '17:00' && n % 2 ? ids.sofia : ids.james;
    };

    const prnMeds = {};
    for (const patient of PATIENTS) {
      const patientId = await insert('INSERT INTO patients (name, room, notes, created_at) VALUES (?, ?, ?, ?)', patient.name, patient.room, patient.notes, ago(14 * DAY));
      for (const med of patient.meds) {
        const medId = await insert(
          `INSERT INTO medications (patient_id, name, dosage, instructions, times, prn, prn_min_hours, prn_max_daily, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          patientId, med.name, med.dosage, med.instructions, JSON.stringify(med.times ?? []), med.prn ? 1 : 0,
          med.prn?.minHours ?? null, med.prn?.maxDaily ?? null, ago(14 * DAY),
        );
        if (med.prn) prnMeds[med.name] = { id: medId, patientId, dosage: med.dosage };
      }
    }

    // Medication history: two full days, plus today up to the current round.
    // A few gaps are left on purpose so "overdue" and "missed" have something to show.
    let n = 0;
    for (const date of [twoDaysAgo, yesterday, today]) {
      for (const task of await buildTasks(zone, date)) {
        n += 1;
        const due = zonedTime(zone, date, task.time).getTime();
        if (due > Date.now() - 50 * MINUTE) continue;
        if (date === yesterday && task.med_name === 'Donepezil') continue;
        if (date === today && task.med_name === 'Furosemide') continue;

        const late = date === yesterday && task.med_name === 'Warfarin';
        const refused = date === yesterday && task.med_name === 'Vitamin D3';
        const corrected = date === twoDaysAgo && task.med_name === 'Lisinopril';
        const recordedAt = Math.min(due + (late ? 52 : refused ? 25 : corrected ? 20 : ((n * 7) % 19) - 4) * MINUTE, Date.now() - MINUTE);
        const who = giver(date, task.time, recordedAt, n);
        const record = (at, outcome, note) =>
          insert(
            `INSERT INTO administrations (medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, outcome, recorded_by, recorded_at, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            task.medication_id, task.patient_id, date, task.time, task.med_name, task.dosage, outcome, who, new Date(at).toISOString(), note,
          );

        if (corrected) {
          // A mistake and its correction, to show the audit trail.
          const wrong = await record(due + 4 * MINUTE, 'given', '');
          await run('UPDATE administrations SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?',
            new Date(due + 40 * MINUTE).toISOString(), ids.admin, 'Recorded before the blood pressure check. Dose was held, then given at 8:20.', wrong);
        }
        await record(
          recordedAt,
          refused ? 'refused' : 'given',
          late ? 'Waited for the INR result from the lab before giving.' : refused ? 'Refused twice. Said she felt sick this morning.' : '',
        );
      }
    }

    // As-needed doses: one yesterday, and one a few hours ago so its
    // "not before" limit is still in force when the demo starts.
    const prnDose = (name, userId, atMs, reason) =>
      run(
        `INSERT INTO administrations (medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, outcome, recorded_by, recorded_at, note)
         VALUES (?, ?, ?, NULL, ?, ?, 'given', ?, ?, ?)`,
        prnMeds[name].id, prnMeds[name].patientId, localDate(zone, new Date(atMs)), name, prnMeds[name].dosage, userId, new Date(atMs).toISOString(), reason,
      );
    await prnDose('Acetaminophen', ids.sofia, zonedTime(zone, yesterday, '13:20').getTime(), 'Shoulder pain after physiotherapy, 5 out of 10.');
    await prnDose('Acetaminophen', ids.james, Date.now() - 3 * 60 * MINUTE, 'Headache, 4 out of 10.');

    // Clock history. Offsets are metres north/east of the facility.
    const metresToLat = (m) => m / 111320;
    const metresToLng = (m) => m / (111320 * Math.cos((FACILITY.latitude * Math.PI) / 180));
    const clock = (userId, type, at, north, east, { status = 'ok', accuracy = 12 } = {}) => {
      const distance = Math.hypot(north, east);
      return run(
        `INSERT INTO clock_events (user_id, type, status, "at", latitude, longitude, accuracy_m, distance_m, radius_m, on_site)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        userId, type, status, at, FACILITY.latitude + metresToLat(north), FACILITY.longitude + metresToLng(east),
        accuracy, Math.round(distance * 10) / 10, FACILITY.radius_m, distance <= FACILITY.radius_m ? 1 : 0,
      );
    };
    const at = (date, time) => zonedTime(zone, date, time).toISOString();

    await clock(ids.amara, 'in', at(twoDaysAgo, '06:56'), 14, -9);
    await clock(ids.sofia, 'in', at(twoDaysAgo, '08:58'), -22, 17, { accuracy: 18 });
    await clock(ids.james, 'in', at(twoDaysAgo, '14:52'), 31, 6);
    await clock(ids.amara, 'out', at(twoDaysAgo, '15:04'), 9, -12);
    await clock(ids.sofia, 'out', at(twoDaysAgo, '17:21'), 610, -190, { accuracy: 35 }); // forgot, clocked out from the bus stop
    await clock(ids.james, 'out', at(twoDaysAgo, '23:08'), 18, 11);

    await clock(ids.amara, 'in', at(yesterday, '06:53'), 11, -15);
    await clock(ids.sofia, 'in', at(yesterday, '08:55'), -19, 24);
    await clock(ids.james, 'in', at(yesterday, '14:41'), -2150, 840, { status: 'blocked', accuracy: 20 }); // tried from home
    await clock(ids.james, 'in', at(yesterday, '14:57'), 27, 3);
    await clock(ids.amara, 'out', at(yesterday, '15:06'), 6, -8);
    await clock(ids.sofia, 'out', at(yesterday, '17:02'), -25, 20);
    await clock(ids.james, 'out', at(yesterday, '23:04'), 21, 9);

    // Today, only the parts of the rota that have already happened.
    const todayClock = async (userId, type, time, north, east) => {
      if (Date.parse(at(today, time)) < Date.now() - MINUTE) await clock(userId, type, at(today, time), north, east);
    };
    await todayClock(ids.james, 'in', '06:10', 24, 5);
    await todayClock(ids.james, 'out', '23:05', 19, 8);
    await clock(ids.amara, 'in', new Date(amaraInToday).toISOString(), 12, -10); // on shift right now

    const message = async (recipientId, subject, body, priority, sentAt, readBy = [], acknowledgedBy = []) => {
      const id = await insert(
        'INSERT INTO messages (sender_id, recipient_id, subject, body, priority, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        ids.admin, recipientId, subject, body, priority, sentAt,
      );
      for (const userId of readBy) {
        const readAt = new Date(Date.parse(sentAt) + 40 * MINUTE).toISOString();
        await run('INSERT INTO message_reads (message_id, user_id, read_at, acknowledged_at) VALUES (?, ?, ?, ?)', id, userId, readAt, acknowledgedBy.includes(userId) ? readAt : null);
      }
      return id;
    };
    await message(null, 'Flu vaccine clinic on Thursday',
      'The pharmacy team will be in the day room from 10:00 on Thursday. Please have consent forms ready for residents in rooms 101 to 115.\n\nStaff vaccines are available at the same time.',
      'normal', ago(2 * DAY + 3 * 60 * MINUTE), [ids.amara, ids.james]);
    await message(null, 'Room 112: thickened fluids only',
      'Mr. Brooks has been moved to thickened fluids after his swallowing assessment. This includes the water given with his medication.\n\nThe thickener is in the cupboard above the medication fridge.',
      'important', ago(DAY + 2 * 60 * MINUTE), [ids.sofia], [ids.sofia]);
    const levodopa = await message(ids.amara, 'Mr. Jensen: levodopa timing',
      'Thank you for flagging the 11:00 dose. Dr. Patel has confirmed it must stay 30 minutes before lunch, so please ask the kitchen to hold his tray if the dose runs late.',
      'important', ago(5 * 60 * MINUTE), [ids.amara], [ids.amara]);
    // Amara answered; the admin has not opened the reply yet.
    await run('INSERT INTO message_replies (message_id, staff_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
      levodopa, ids.amara, ids.amara, 'Understood. I have spoken to the kitchen and they will hold his tray until I call down.', ago(4 * 60 * MINUTE));
  });
}

export async function seedIfEmpty() {
  const { get } = await import('./db.js');
  if ((await get('SELECT CAST(COUNT(*) AS INTEGER) AS n FROM users')).n > 0) return false;
  await seed();
  return true;
}

// Run directly: node server/seed.js [--reset]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--reset')) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(DB_PATH + suffix, { force: true });
  }
  // The database is opened only now, after any reset has removed the old file.
  const { useDatabase } = await import('./db.js');
  useDatabase((await import('./db-sqlite.js')).sqlite);
  const seeded = await seedIfEmpty();
  console.log(seeded ? 'Database seeded with sample data.' : 'Database already has data. Run "npm run reset" to start over.');
}
