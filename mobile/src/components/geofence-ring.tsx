// The geofence, drawn: the site at the centre, the allowed zone around it, and
// where this device is. North is up. Positions past the edge are pinned to it.
import Svg, { Circle, G, Path, Text as SvgText } from 'react-native-svg';

import type { Facility, Position } from '@/api/types';
import { useBrand } from '@/theme';
import { formatDistance } from '@/utils/format';
import { bearing, distanceMeters } from '@/utils/geo';

const CENTER = 120;
const ZONE_R = 68;
const MAX_R = ZONE_R * 1.5;

export function describePosition(position: Position | null, facility: Facility) {
  if (!position) return null;
  const distance = distanceMeters(facility, position);
  return { distance, inside: distance <= facility.radius_m, angle: bearing(facility, position) };
}

export function positionCaption(position: Position | null, facility: Facility) {
  const where = describePosition(position, facility);
  if (!where || !position) return `Clock-in opens within ${formatDistance(facility.radius_m)} of ${facility.name}.`;
  const accuracy = position.accuracy ? ` Accurate to about ${formatDistance(position.accuracy)}.` : '';
  return where.inside
    ? `You are ${formatDistance(where.distance)} from the centre of the site, inside the ${formatDistance(facility.radius_m)} zone.${accuracy}`
    : `You are ${formatDistance(where.distance)} away, outside the ${formatDistance(facility.radius_m)} zone.${accuracy}`;
}

export function GeofenceRing({ facility, position, size = 180 }: { facility: Facility; position: Position | null; size?: number }) {
  const brand = useBrand();
  const where = describePosition(position, facility);
  const outside = where ? !where.inside : false;
  const you = outside ? brand.dangerSolid : brand.accent;

  let dot = null;
  if (where && position) {
    const r = Math.min(where.distance / facility.radius_m, 1.5) * ZONE_R;
    const halo = position.accuracy ? Math.max(11, Math.min(44, (position.accuracy / facility.radius_m) * ZONE_R)) : 11;
    dot = (
      <G x={CENTER + Math.sin(where.angle) * r} y={CENTER - Math.cos(where.angle) * r}>
        <Circle r={halo} fill={you} opacity={0.16} />
        <Circle r={7} fill={you} stroke={brand.card} strokeWidth={2.5} />
      </G>
    );
  }

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 240 240"
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        where
          ? `You are ${formatDistance(where.distance)} from ${facility.name}, ${where.inside ? 'inside' : 'outside'} the clock-in zone.`
          : `The clock-in zone: ${formatDistance(facility.radius_m)} around ${facility.name}.`
      }>
      <Circle cx={CENTER} cy={CENTER} r={MAX_R} fill="none" stroke={brand.hairline} strokeWidth={1} strokeDasharray="2 6" />
      {/* Outside the zone, the zone itself goes quiet and the device turns brick. */}
      <Circle cx={CENTER} cy={CENTER} r={ZONE_R} fill={outside ? brand.fillSolid : brand.accentWash} stroke={outside ? brand.hairline : brand.accent} strokeWidth={1.5} />
      <Circle cx={CENTER} cy={CENTER} r={ZONE_R / 2} fill="none" stroke={brand.hairline} strokeWidth={1} strokeDasharray="2 6" />
      <Path d={`M${CENTER} ${CENTER - ZONE_R}V${CENTER + ZONE_R}M${CENTER - ZONE_R} ${CENTER}H${CENTER + ZONE_R}`} stroke={brand.hairline} strokeWidth={1} />
      <SvgText x={CENTER} y={13} textAnchor="middle" fontSize={10} fontWeight="600" fill={brand.inkSoft}>
        N
      </SvgText>
      <SvgText x={CENTER + 52} y={CENTER + 66} fontSize={10} fontWeight="600" fill={brand.inkSoft}>
        {formatDistance(facility.radius_m)}
      </SvgText>
      <Circle cx={CENTER} cy={CENTER} r={9} fill={brand.card} stroke={brand.hairline} strokeWidth={1} />
      <Circle cx={CENTER} cy={CENTER} r={4.5} fill={brand.ink} />
      {dot}
    </Svg>
  );
}
