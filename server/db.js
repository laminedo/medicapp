// The database, as the rest of the server sees it. The actual engine is
// plugged in by the entry point: SQLite when run with Node (db-sqlite.js),
// Postgres when run as a Supabase function. Every call is asynchronous, and
// SQL is written in the subset both engines share, with ? for parameters.

let engine = null;

export function useDatabase(adapter) {
  engine = adapter;
}

export const now = () => new Date().toISOString();

// One row, or undefined.
export const get = (sql, ...params) => engine.get(sql, params);
// Every row.
export const all = (sql, ...params) => engine.all(sql, params);
// A statement whose result is not needed. To get a new row's id, use
// get('INSERT ... RETURNING id') instead.
export const run = (sql, ...params) => engine.run(sql, params);
// Runs fn inside one transaction: everything in it commits, or nothing does.
export const tx = (fn) => engine.tx(fn);
// True when an insert was refused because the row already exists.
export const isUniqueViolation = (err) => engine.isUniqueViolation(err);
