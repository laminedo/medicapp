import { get, now, run } from '../db.js';
import { number, text } from '../router.js';
import { THRESHOLDS } from '../schedule.js';

// A facility created by first-run setup starts at 0, 0 until an admin sets
// its real location. Nobody can clock in against that placeholder.
export function getFacility() {
  const facility = get('SELECT name, address, latitude, longitude, radius_m, updated_at FROM facility WHERE id = 1');
  return facility && { ...facility, location_set: !(facility.latitude === 0 && facility.longitude === 0) };
}

export default function facilityRoutes(router) {
  router.get('/api/facility', () => ({ facility: getFacility(), thresholds: THRESHOLDS }));

  router.put('/api/facility', { role: 'admin' }, ({ body }) => {
    const name = text(body.name, 'Facility name', { max: 80 });
    const address = text(body.address, 'Address', { min: 0, max: 160 });
    const latitude = number(body.latitude, 'Latitude', { min: -90, max: 90 });
    const longitude = number(body.longitude, 'Longitude', { min: -180, max: 180 });
    const radius = number(body.radius_m, 'Radius', { min: 10, max: 5000, integer: true });
    run(
      'UPDATE facility SET name = ?, address = ?, latitude = ?, longitude = ?, radius_m = ?, updated_at = ? WHERE id = 1',
      name, address, latitude, longitude, radius, now(),
    );
    return { facility: getFacility(), thresholds: THRESHOLDS };
  });
}
