// The geofence, drawn: the site at the centre, the allowed zone around it, and
// where the device is. North is up. Positions past the edge are pinned to it.
import { svg } from './dom.js';
import { bearing, distanceMeters } from './geo.js';
import { fmtDistance } from './format.js';

const CENTER = 120;
const ZONE_R = 68;
const MAX_R = ZONE_R * 1.5;

export function describePosition(position, facility) {
  if (!position) return null;
  const distance = distanceMeters(facility, position);
  return { distance, inside: distance <= facility.radius_m, angle: bearing(facility, position) };
}

export function positionCaption(position, facility) {
  const where = describePosition(position, facility);
  if (!where) return `Clock-in opens within ${fmtDistance(facility.radius_m)} of ${facility.name}.`;
  const accuracy = position.accuracy ? ` Accurate to about ${fmtDistance(position.accuracy)}.` : '';
  return where.inside
    ? `You are ${fmtDistance(where.distance)} from the centre of the site, inside the ${fmtDistance(facility.radius_m)} zone.${accuracy}`
    : `You are ${fmtDistance(where.distance)} away, outside the ${fmtDistance(facility.radius_m)} zone.${accuracy}`;
}

export function geofenceRing({ facility, position = null, pulse = false, size = 220 }) {
  const where = describePosition(position, facility);
  const state = !where ? 'idle' : where.inside ? 'inside' : 'outside';
  const label = !where
    ? `The clock-in zone: ${fmtDistance(facility.radius_m)} around ${facility.name}.`
    : `You are ${fmtDistance(where.distance)} from ${facility.name}, ${where.inside ? 'inside' : 'outside'} the clock-in zone.`;

  const root = svg(
    'svg',
    { class: `ring ring--${state}`, viewBox: '0 0 240 240', width: size, height: size, role: 'img', 'aria-label': label },
    svg('circle', { class: 'ring-guide', cx: CENTER, cy: CENTER, r: MAX_R }),
    svg('circle', { class: 'ring-zone', cx: CENTER, cy: CENTER, r: ZONE_R }),
    svg('circle', { class: 'ring-guide', cx: CENTER, cy: CENTER, r: ZONE_R / 2 }),
    svg('path', { class: 'ring-cross', d: `M${CENTER} ${CENTER - ZONE_R}V${CENTER + ZONE_R}M${CENTER - ZONE_R} ${CENTER}H${CENTER + ZONE_R}` }),
    svg('text', { class: 'ring-label', x: CENTER, y: 13, 'text-anchor': 'middle' }, 'N'),
    svg('text', { class: 'ring-label', x: CENTER + 52, y: CENTER + 66 }, fmtDistance(facility.radius_m)),
    svg('circle', { class: 'ring-site-halo', cx: CENTER, cy: CENTER, r: 9 }),
    svg('circle', { class: 'ring-site', cx: CENTER, cy: CENTER, r: 4.5 }),
  );

  if (where) {
    const r = Math.min(where.distance / facility.radius_m, 1.5) * ZONE_R;
    const x = CENTER + Math.sin(where.angle) * r;
    const y = CENTER - Math.cos(where.angle) * r;
    const halo = position.accuracy ? Math.max(11, Math.min(44, (position.accuracy / facility.radius_m) * ZONE_R)) : 11;
    root.append(
      svg(
        'g',
        { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` },
        svg(
          'g',
          { class: 'ring-you' },
          pulse && svg('circle', { class: 'ring-pulse', r: 8 }),
          svg('circle', { class: 'ring-accuracy', r: halo.toFixed(1) }),
          svg('circle', { class: 'ring-dot', r: 7 }),
        ),
      ),
    );
  }
  return root;
}
