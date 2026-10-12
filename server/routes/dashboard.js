import { all } from '../db.js';
import { buildTasks, countTasks } from '../schedule.js';
import { localDate, shiftDate, timeZone } from '../time.js';
import { clockState } from './clock.js';
import { getFacility } from './facility.js';

export default function dashboardRoutes(router) {
  router.get('/api/dashboard', { role: 'admin' }, async () => {
    const at = new Date();
    const zone = await timeZone();
    const today = localDate(zone, at);
    const tasks = await buildTasks(zone, today, at);
    // Last night's late doses still need someone's attention this morning.
    const carried = (await buildTasks(zone, shiftDate(today, -1), at)).filter((t) => t.status === 'overdue' || t.status === 'due');
    const attention = [...carried, ...tasks].filter((t) => t.status === 'overdue' || t.status === 'missed');

    const people = await all("SELECT id, name, job_title FROM users WHERE role = 'staff' AND active = 1 ORDER BY lower(name)");
    const staff = await Promise.all(people.map(async (u) => ({ ...u, ...(await clockState(u.id)) })));

    const recent = await all(
      `SELECT e.id, e.type, e.status, e."at", e.distance_m, e.on_site, u.name AS user_name, f.name AS forced_by_name
         FROM clock_events e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN users f ON f.id = e.forced_by
        ORDER BY e."at" DESC, e.id DESC LIMIT 6`,
    );

    return {
      now: at.toISOString(),
      today,
      facility: await getFacility(),
      counts: countTasks(tasks),
      attention,
      staff,
      recent_clock: recent,
    };
  });
}
