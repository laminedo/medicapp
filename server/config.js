// How this copy of the server is being run. Everything here comes from
// environment variables, so one codebase serves both a laptop and a host.

export const PRODUCTION = process.env.NODE_ENV === 'production';

// The sample data has known passwords. It is for trying the app out and is
// never loaded on a production server unless MEDICAPP_DEMO=1 forces it.
export const DEMO_DATA = process.env.MEDICAPP_DEMO ? process.env.MEDICAPP_DEMO === '1' : !PRODUCTION;

// A secret the operator sets on the host. Whoever creates the first admin
// account on a public address has to know it.
export const SETUP_CODE = (process.env.MEDICAPP_SETUP_CODE || '').trim();

// True when the database has been pointed at a disk that survives restarts
// and deploys (a Railway volume, or an explicit data directory).
export const PERSISTENT_STORAGE = Boolean(process.env.MEDICAPP_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH);
