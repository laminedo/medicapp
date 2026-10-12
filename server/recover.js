// Creates a one-time recovery code for a locked-out admin, when the server runs
// under Node with SQLite:  npm run recover
// (On Supabase, run  select medicapp_new_recovery_code();  in the SQL editor.)
import { createHash, randomInt } from 'node:crypto';
import { run, useDatabase } from './db.js';
import { sqlite } from './db-sqlite.js';

useDatabase(sqlite);

const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
const group = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
const code = [group(), group(), group(), group()].join('-');
const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const save = (key, value) => run('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, value);
await save('recovery_code_hash', createHash('sha256').update(code).digest('hex'));
await save('recovery_code_expires', expires);

console.log(`Recovery code: ${code}`);
console.log('Valid for one hour, for one use. On the sign-in screen choose "Forgot password?".');
