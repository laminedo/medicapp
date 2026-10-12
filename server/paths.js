import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PUBLIC_DIR = path.join(ROOT, 'public');
// On Railway the database goes on the attached volume, wherever it is mounted.
export const DATA_DIR = process.env.MEDICAPP_DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'medicapp.db');
