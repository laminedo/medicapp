// The whole API as one router. Shared by every way of running the server:
// Node's http server on your own machine or a host (index.js), and the
// Supabase function (supabase/functions/api/index.ts).
import { authenticate } from './auth.js';
import { createRouter } from './router.js';
import authRoutes from './routes/auth.js';
import setupRoutes from './routes/setup.js';
import userRoutes from './routes/users.js';
import facilityRoutes from './routes/facility.js';
import clockRoutes from './routes/clock.js';
import patientRoutes from './routes/patients.js';
import taskRoutes from './routes/tasks.js';
import messageRoutes from './routes/messages.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';

export function createApp() {
  const router = createRouter({ authenticate });
  for (const mount of [authRoutes, setupRoutes, userRoutes, facilityRoutes, clockRoutes, patientRoutes, taskRoutes, messageRoutes, dashboardRoutes, reportRoutes]) {
    mount(router);
  }
  // For a host's health check: answers as soon as the server can serve requests.
  router.get('/api/health', { role: 'public' }, () => ({ ok: true }));
  return router;
}
