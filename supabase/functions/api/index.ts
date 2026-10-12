// MedicApp's API as a Supabase Edge Function.
//
// The server code is not copied here. It is loaded from this project's own
// GitHub repository at one exact commit, so what runs is precisely what that
// commit contains. To release a server change: push it, put the new commit's
// id in the five addresses below, and deploy this function again.
import { createApp } from 'https://raw.githubusercontent.com/laminedo/medicapp/49df89c5520d9310c838eadcf2d054ce123db3e4/server/app.js';
import { configure } from 'https://raw.githubusercontent.com/laminedo/medicapp/49df89c5520d9310c838eadcf2d054ce123db3e4/server/config.js';
import { useDatabase } from 'https://raw.githubusercontent.com/laminedo/medicapp/49df89c5520d9310c838eadcf2d054ce123db3e4/server/db.js';
import { MAX_BODY_BYTES } from 'https://raw.githubusercontent.com/laminedo/medicapp/49df89c5520d9310c838eadcf2d054ce123db3e4/server/router.js';
import { postgresEngine } from 'https://raw.githubusercontent.com/laminedo/medicapp/49df89c5520d9310c838eadcf2d054ce123db3e4/supabase/functions/api/db-postgres.js';

// The web addresses allowed to call this API from a browser: where the pages
// are published. The phone app is not a browser and is not affected by this.
const ALLOWED_ORIGINS = ['https://laminedo.github.io'];

configure({ production: true, demoData: false, persistentStorage: true, allowedOrigins: ALLOWED_ORIGINS });
useDatabase(postgresEngine);
const app = createApp();

function cors(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'content-disposition',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  const headers: Record<string, string> = {};
  req.headers.forEach((value, name) => (headers[name.toLowerCase()] = value));

  let body: string | null = null;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
    if (body.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: { message: 'That request is too large.' } }), { status: 413, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
    }
  }

  // Supabase serves this function at /functions/v1/api/..., and the routes
  // are written as /api/..., so the path already lines up once the prefix goes.
  const response = await app.handle({
    method: req.method,
    path: url.pathname.replace(/^\/functions\/v1/, ''),
    query: Object.fromEntries(url.searchParams),
    headers,
    body: body || null,
    ip: (headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown',
    secure: true,
  });
  return new Response(response.body, { status: response.status, headers: { ...response.headers, ...cors(origin) } });
});
