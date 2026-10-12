import { all, get, now, run } from '../db.js';
import { HttpError, isoDate, number, text } from '../router.js';
import { distanceMeters } from '../geo.js';
import { endOfDay, startOfDay, timeZone } from '../time.js';
import { getFacility } from './facility.js';

// Whether someone is on shift is simply their most recent successful event.
export async function clockState(userId) {
  const last = await get(`SELECT type, "at" FROM clock_events WHERE user_id = ? AND status = 'ok' ORDER BY "at" DESC, id DESC LIMIT 1`, userId);
  const clockedIn = last?.type === 'in';
  return { clocked_in: clockedIn, since: clockedIn ? last.at : null };
}

function readPosition(body) {
  return {
    latitude: number(body.latitude, 'Latitude', { min: -90, max: 90 }),
    longitude: number(body.longitude, 'Longitude', { min: -180, max: 180 }),
    accuracy: body.accuracy == null ? null : number(body.accuracy, 'Accuracy', { min: 0, max: 1e7 }),
  };
}

function record(userId, type, status, position, facility, distance) {
  return get(
    `INSERT INTO clock_events (user_id, type, status, "at", latitude, longitude, accuracy_m, distance_m, radius_m, on_site)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    userId, type, status, now(), position.latitude, position.longitude, position.accuracy,
    Math.round(distance * 10) / 10, facility.radius_m, distance <= facility.radius_m ? 1 : 0,
  );
}

async function statusFor(userId) {
  return {
    ...(await clockState(userId)),
    recent: await all(
      `SELECT e.*, f.name AS forced_by_name FROM clock_events e LEFT JOIN users f ON f.id = e.forced_by
        WHERE e.user_id = ? ORDER BY e."at" DESC, e.id DESC LIMIT 12`,
      userId,
    ),
    facility: await getFacility(),
  };
}

export default function clockRoutes(router) {
  router.get('/api/clock/status', { role: 'staff' }, ({ user }) => statusFor(user.id));

  router.post('/api/clock/in', { role: 'staff' }, async ({ user, body }) => {
    const position = readPosition(body);
    const facility = await getFacility();
    if ((await clockState(user.id)).clocked_in) throw new HttpError(409, 'You are already clocked in.');
    if (!facility.location_set) {
      throw new HttpError(409, 'Clock-in is not available yet. An admin needs to set the facility location in Settings first.', { code: 'location_not_set' });
    }

    const distance = distanceMeters(position, facility);
    if (distance > facility.radius_m) {
      // Blocked attempts are logged too: an admin should be able to see them.
      await record(user.id, 'in', 'blocked', position, facility, distance);
      throw new HttpError(403, 'You must be on-site to clock in.', {
        code: 'outside_geofence',
        distance_m: Math.round(distance),
        radius_m: facility.radius_m,
        accuracy_m: position.accuracy,
        facility_name: facility.name,
      });
    }
    const event = await record(user.id, 'in', 'ok', position, facility, distance);
    return { event, ...(await statusFor(user.id)) };
  });

  // Clocking out is never blocked, so nobody is left stuck on shift after
  // leaving the building. It is still located, and flagged if off-site.
  router.post('/api/clock/out', { role: 'staff' }, async ({ user, body }) => {
    const position = readPosition(body);
    const facility = await getFacility();
    if (!(await clockState(user.id)).clocked_in) throw new HttpError(409, 'You are not clocked in.');
    const event = await record(user.id, 'out', 'ok', position, facility, distanceMeters(position, facility));
    return { event, ...(await statusFor(user.id)) };
  });

  // An admin closes a shift for someone who forgot to clock out. There is no
  // location to record, so the event carries who entered it and why instead.
  router.post('/api/users/:id/clock-out', { role: 'admin' }, async ({ params, user, body }) => {
    const staff = await get("SELECT id, name FROM users WHERE id = ? AND role = 'staff'", params.id);
    if (!staff) throw new HttpError(404, 'That staff member does not exist.');
    const state = await clockState(staff.id);
    if (!state.clocked_in) throw new HttpError(409, `${staff.name} is not clocked in.`);
    const note = text(body.note, 'Reason', { max: 200 });

    let at = new Date();
    if (body.at != null && body.at !== '') {
      at = new Date(body.at);
      if (Number.isNaN(at.getTime())) throw new HttpError(400, 'The clock-out time is not a valid date and time.');
      if (at.getTime() > Date.now() + 60 * 1000) throw new HttpError(400, 'The clock-out time cannot be in the future.');
      if (at.toISOString() <= state.since) throw new HttpError(400, 'The clock-out time must be after they clocked in.');
    }
    await run(
      `INSERT INTO clock_events (user_id, type, status, "at", forced_by, note) VALUES (?, 'out', 'ok', ?, ?, ?)`,
      staff.id, at.toISOString(), user.id, note,
    );
    return { ok: true, ...(await clockState(staff.id)) };
  });

  router.get('/api/clock/events', { role: 'admin' }, async ({ query }) => {
    const zone = await timeZone();
    const where = [];
    const params = [];
    if (query.user_id) {
      where.push('e.user_id = ?');
      params.push(number(query.user_id, 'Staff member', { integer: true }));
    }
    if (query.from) {
      where.push('e."at" >= ?');
      params.push(startOfDay(zone, isoDate(query.from, 'From date')).toISOString());
    }
    if (query.to) {
      where.push('e."at" <= ?');
      params.push(endOfDay(zone, isoDate(query.to, 'To date')).toISOString());
    }
    if (query.blocked === '0') where.push("e.status = 'ok'");
    if (query.blocked === 'only') where.push("e.status = 'blocked'");

    const events = await all(
      `SELECT e.*, u.name AS user_name, u.job_title, u.active AS user_active, f.name AS forced_by_name
         FROM clock_events e
         JOIN users u ON u.id = e.user_id
         LEFT JOIN users f ON f.id = e.forced_by
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY e."at" DESC, e.id DESC LIMIT 500`,
      ...params,
    );
    return { events };
  });
}
