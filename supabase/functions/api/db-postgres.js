// The Postgres engine, used when the server runs as a Supabase Edge Function.
import { AsyncLocalStorage } from 'node:async_hooks';
import postgres from 'npm:postgres@3.4.5';

// SUPABASE_DB_URL is provided to every Edge Function. Prepared statements are
// off because the connection goes through Supabase's pooler.
const sql = postgres(Deno.env.get('SUPABASE_DB_URL'), { prepare: false, max: 4, idle_timeout: 20 });

// While a transaction is open, every query made inside it has to go to that
// transaction's connection. This remembers which one, per request.
const transaction = new AsyncLocalStorage();

// The shared SQL is written with ? for parameters. Postgres wants $1, $2, ...
function numbered(text) {
  let n = 0;
  return text.replace(/\?/g, () => `$${++n}`);
}

const query = (text, params) => (transaction.getStore() ?? sql).unsafe(numbered(text), params.map((value) => (value === undefined ? null : value)));

export const postgresEngine = {
  get: async (text, params) => (await query(text, params))[0],
  all: async (text, params) => Array.from(await query(text, params)),
  run: async (text, params) => {
    await query(text, params);
  },
  tx: (fn) => sql.begin((connection) => transaction.run(connection, fn)),
  isUniqueViolation: (err) => err?.code === '23505',
};
