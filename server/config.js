// How this copy of the server is being run. It starts from environment
// variables and can be overridden by the entry point (the Supabase function
// sets its own values), so the rest of the server never asks where it is.

const env = (key) => (typeof Deno !== 'undefined' ? Deno.env.get(key) : process.env[key]) || '';

export const config = {
  production: env('NODE_ENV') === 'production',

  // The sample data has known passwords. It is for trying the app out and is
  // never loaded on a production server unless MEDICAPP_DEMO=1 forces it.
  demoData: env('MEDICAPP_DEMO') ? env('MEDICAPP_DEMO') === '1' : env('NODE_ENV') !== 'production',

  // A secret the operator sets. Whoever creates the first admin account on a
  // public address has to know it. (It can also be stored, hashed, in the
  // app_settings table: see routes/setup.js.)
  setupCode: env('MEDICAPP_SETUP_CODE').trim(),

  // True when the database is somewhere that survives restarts and deploys.
  persistentStorage: Boolean(env('MEDICAPP_DATA_DIR') || env('RAILWAY_VOLUME_MOUNT_PATH')),

  // Other web addresses allowed to call this server from a browser, for when
  // the pages are hosted separately (GitHub Pages). Comma-separated.
  allowedOrigins: env('MEDICAPP_ALLOWED_ORIGINS').split(',').map((s) => s.trim()).filter(Boolean),
};

export const configure = (overrides) => Object.assign(config, overrides);
