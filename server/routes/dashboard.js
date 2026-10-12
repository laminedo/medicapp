import { all } from '../db.js';
import { buildTasks, countTasks, localDate, shiftDate } from '../schedule.js';
import { clockState } from './clock.js';
import { getFacility } from './facility.js';

export default function dashboardRoutes(router) {
  router.get('/api/dashboard', { role: 'admin' }, () => {
    const at = new Date();
    const today = localDate(at);
    const tasks = buildTasks(today, at);
    // Last night's late doses still need someone's attention this morning.
    const carried = buildTasks(shiftDate(today, -1), at).filter((t) => t.status === 'overdue' || t.status === 'due');
    const attention = [...carried, ...tasks].filter((t) => t.status === 'overdue' || t.status === 'missed');

    const staff = all("SELECT id, name, job_title FROM users WHERE role = 'staff' AND active = 1 ORDER BY name COLLATE NOCASE").map((u) => ({
      ...u,
      ...clockState(u.id),
    }));

    const recent = all(
      `SELECT e.id, e.type, e.status, e.at, e.distance_m, e.on_site, u.name AS user_name, f.name AS forced_by_name
         FROM clock_events e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN users f ON f.id = e.forced_by
        ORDER BY e.at DESC, e.id DESC LIMIT 6`,
    );

    return {
      now: at.toISOString(),
      today,
      facility: getFacility(),
      counts: countTasks(tasks),
      attention,
      staff,
      recent_clock: recent,
    };
  });
}
