// The SQLite engine, used when the server runs under Node (your own machine,
// or a host with a disk). Node's built-in driver, so there is nothing to install.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { DATA_DIR, DB_PATH } from './paths.js';

mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Schema changes are ordered migrations. The database remembers how many it has
// applied (PRAGMA user_version), so an existing database upgrades in place and
// keeps its data. To change the schema, append a migration; never edit an old one.
const MIGRATIONS = [
  // 1. The original schema.
  `
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'staff')),
    job_title     TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    removed_at    TEXT
  );
  -- Removed accounts keep their rows (the audit trail points at them), so a
  -- username only has to be unique among accounts that can still sign in.
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_active ON users (username) WHERE active = 1;

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS facility (
    id         INTEGER PRIMARY KEY CHECK (id = 1),
    name       TEXT NOT NULL,
    address    TEXT NOT NULL DEFAULT '',
    latitude   REAL NOT NULL,
    longitude  REAL NOT NULL,
    radius_m   INTEGER NOT NULL DEFAULT 100,
    updated_at TEXT NOT NULL
  );

  -- distance_m and radius_m are recorded as they were at the time, so the log
  -- stays truthful after an admin moves or resizes the geofence.
  CREATE TABLE IF NOT EXISTS clock_events (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    type       TEXT NOT NULL CHECK (type IN ('in', 'out')),
    status     TEXT NOT NULL CHECK (status IN ('ok', 'blocked')),
    at         TEXT NOT NULL,
    latitude   REAL NOT NULL,
    longitude  REAL NOT NULL,
    accuracy_m REAL,
    distance_m REAL NOT NULL,
    radius_m   INTEGER NOT NULL,
    on_site    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS clock_events_user_at ON clock_events (user_id, at);
  CREATE INDEX IF NOT EXISTS clock_events_at ON clock_events (at);

  CREATE TABLE IF NOT EXISTS patients (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    room        TEXT NOT NULL,
    notes       TEXT NOT NULL DEFAULT '',
    active      INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    archived_at TEXT
  );

  -- A medication row is one version of a prescription. Changing the name,
  -- dosage or times ends the row and starts a new one, so past days keep the
  -- schedule they actually had.
  CREATE TABLE IF NOT EXISTS medications (
    id           INTEGER PRIMARY KEY,
    patient_id   INTEGER NOT NULL REFERENCES patients (id),
    name         TEXT NOT NULL,
    dosage       TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    times        TEXT NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT NOT NULL,
    ended_at     TEXT
  );
  CREATE INDEX IF NOT EXISTS medications_patient ON medications (patient_id);

  CREATE TABLE IF NOT EXISTS administrations (
    id             INTEGER PRIMARY KEY,
    medication_id  INTEGER NOT NULL REFERENCES medications (id),
    patient_id     INTEGER NOT NULL REFERENCES patients (id),
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    med_name       TEXT NOT NULL,
    dosage         TEXT NOT NULL,
    given_by       INTEGER NOT NULL REFERENCES users (id),
    given_at       TEXT NOT NULL,
    note           TEXT NOT NULL DEFAULT '',
    UNIQUE (medication_id, scheduled_date, scheduled_time)
  );
  CREATE INDEX IF NOT EXISTS administrations_date ON administrations (scheduled_date);

  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY,
    sender_id    INTEGER NOT NULL REFERENCES users (id),
    recipient_id INTEGER REFERENCES users (id),
    subject      TEXT NOT NULL,
    body         TEXT NOT NULL,
    priority     TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important')),
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS message_reads (
    message_id INTEGER NOT NULL REFERENCES messages (id),
    user_id    INTEGER NOT NULL REFERENCES users (id),
    read_at    TEXT NOT NULL,
    PRIMARY KEY (message_id, user_id)
  );
  `,

  // 2. Dose outcomes (given / refused / held), voiding with an audit trail,
  //    as-needed (PRN) medications, admin clock-outs, and message replies.
  `
  ALTER TABLE medications ADD COLUMN prn INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE medications ADD COLUMN prn_min_hours REAL;
  ALTER TABLE medications ADD COLUMN prn_max_daily INTEGER;

  -- Rebuilt rather than altered: the one-record-per-dose rule has to stop
  -- counting voided records, and an as-needed dose has no scheduled time.
  CREATE TABLE administrations_v2 (
    id             INTEGER PRIMARY KEY,
    medication_id  INTEGER NOT NULL REFERENCES medications (id),
    patient_id     INTEGER NOT NULL REFERENCES patients (id),
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT,
    med_name       TEXT NOT NULL,
    dosage         TEXT NOT NULL,
    outcome        TEXT NOT NULL DEFAULT 'given' CHECK (outcome IN ('given', 'refused', 'held')),
    recorded_by    INTEGER NOT NULL REFERENCES users (id),
    recorded_at    TEXT NOT NULL,
    note           TEXT NOT NULL DEFAULT '',
    voided_at      TEXT,
    voided_by      INTEGER REFERENCES users (id),
    void_reason    TEXT
  );
  INSERT INTO administrations_v2 (id, medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, outcome, recorded_by, recorded_at, note)
    SELECT id, medication_id, patient_id, scheduled_date, scheduled_time, med_name, dosage, 'given', given_by, given_at, note FROM administrations;
  DROP TABLE administrations;
  ALTER TABLE administrations_v2 RENAME TO administrations;
  CREATE UNIQUE INDEX administrations_slot ON administrations (medication_id, scheduled_date, scheduled_time)
    WHERE voided_at IS NULL AND scheduled_time IS NOT NULL;
  CREATE INDEX administrations_date ON administrations (scheduled_date);
  CREATE INDEX administrations_medication ON administrations (medication_id, recorded_at);

  -- Rebuilt so a clock-out entered by an admin can exist without a location.
  CREATE TABLE clock_events_v2 (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users (id),
    type       TEXT NOT NULL CHECK (type IN ('in', 'out')),
    status     TEXT NOT NULL CHECK (status IN ('ok', 'blocked')),
    at         TEXT NOT NULL,
    latitude   REAL,
    longitude  REAL,
    accuracy_m REAL,
    distance_m REAL,
    radius_m   INTEGER,
    on_site    INTEGER,
    forced_by  INTEGER REFERENCES users (id),
    note       TEXT NOT NULL DEFAULT ''
  );
  INSERT INTO clock_events_v2 (id, user_id, type, status, at, latitude, longitude, accuracy_m, distance_m, radius_m, on_site)
    SELECT id, user_id, type, status, at, latitude, longitude, accuracy_m, distance_m, radius_m, on_site FROM clock_events;
  DROP TABLE clock_events;
  ALTER TABLE clock_events_v2 RENAME TO clock_events;
  CREATE INDEX clock_events_user_at ON clock_events (user_id, at);
  CREATE INDEX clock_events_at ON clock_events (at);

  ALTER TABLE message_reads ADD COLUMN acknowledged_at TEXT;

  -- One private thread per message and staff member. read_at is set when the
  -- other side has seen the reply.
  CREATE TABLE message_replies (
    id         INTEGER PRIMARY KEY,
    message_id INTEGER NOT NULL REFERENCES messages (id),
    staff_id   INTEGER NOT NULL REFERENCES users (id),
    author_id  INTEGER NOT NULL REFERENCES users (id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at    TEXT
  );
  CREATE INDEX message_replies_thread ON message_replies (message_id, staff_id);
  `,

  // 3. The facility's time zone (so a server on UTC still knows what "8:00"
  //    means locally), stored settings, and sign-in throttling that survives
  //    restarts. A function, because the default zone is this machine's.
  (database) => {
    database.exec(`
      ALTER TABLE facility ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC';
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE login_attempts (key TEXT PRIMARY KEY, first_at TEXT NOT NULL, attempts INTEGER NOT NULL);
    `);
    database.prepare('UPDATE facility SET timezone = ?').run(new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  },
];

for (let version = db.prepare('PRAGMA user_version').get().user_version; version < MIGRATIONS.length; version += 1) {
  const migration = MIGRATIONS[version];
  db.exec('BEGIN');
  try {
    if (typeof migration === 'function') migration(db);
    else db.exec(migration);
    db.exec(`PRAGMA user_version = ${version + 1}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// The driver is synchronous. Wrapping it in async functions gives it the same
// shape as the Postgres engine, and because nothing here actually waits, a
// transaction still runs start to finish without another request cutting in.
const orNull = (value) => (value === undefined ? null : value);

export const sqlite = {
  get: async (sql, params) => db.prepare(sql).get(...params.map(orNull)),
  all: async (sql, params) => db.prepare(sql).all(...params.map(orNull)),
  run: async (sql, params) => {
    db.prepare(sql).run(...params.map(orNull));
  },
  async tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = await fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },
  isUniqueViolation: (err) => String(err?.message).includes('UNIQUE'),
};
