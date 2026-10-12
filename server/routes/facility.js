import { get, now, run } from '../db.js';
import { HttpError, number, text } from '../router.js';
import { THRESHOLDS } from '../schedule.js';
import { isTimeZone } from '../time.js';

// A facility created by first-run setup starts at 0, 0 until an admin sets
// its real location. Nobody can clock in against that placeholder.
export async function getFacility() {
  const facility = await get('SELECT name, address, latitude, longitude, radius_m, timezone, updated_at FROM facility WHERE id = 1');
  return facility && { ...facility, location_set: !(facility.latitude === 0 && facility.longitude === 0) };
}

export default function facilityRoutes(router) {
  router.get('/api/facility', async () => ({ facility: await getFacility(), thresholds: THRESHOLDS }));

  router.put('/api/facility', { role: 'admin' }, async ({ body }) => {
    const name = text(body.name, 'Facility name', { max: 80 });
    const address = text(body.address, 'Address', { min: 0, max: 160 });
    const latitude = number(body.latitude, 'Latitude', { min: -90, max: 90 });
    const longitude = number(body.longitude, 'Longitude', { min: -180, max: 180 });
    const radius = number(body.radius_m, 'Radius', { min: 10, max: 5000, integer: true });
    // Optional, so an older client that does not send it changes nothing.
    const current = await getFacility();
    const timezone = body.timezone == null || body.timezone === '' ? current.timezone : body.timezone;
    if (!isTimeZone(timezone)) throw new HttpError(400, 'Choose a time zone from the list.');
    await run(
      'UPDATE facility SET name = ?, address = ?, latitude = ?, longitude = ?, radius_m = ?, timezone = ?, updated_at = ? WHERE id = 1',
      name, address, latitude, longitude, radius, timezone, now(),
    );
    return { facility: await getFacility(), thresholds: THRESHOLDS };
  });
}
