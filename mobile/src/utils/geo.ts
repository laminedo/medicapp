// The device's location, with failures a person can act on. The server makes
// the actual on-site decision; this only gathers the reading and draws it.
import * as Location from 'expo-location';

import type { Position } from '@/api/types';

export class LocationError extends Error {
  constructor(
    public title: string,
    message: string,
    public canOpenSettings = false,
  ) {
    super(message);
  }
}

export async function getPosition(): Promise<Position> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new LocationError(
      'Location access is turned off',
      'MedicApp needs your location at the moment you clock in or out. Allow it in Settings, then try again.',
      !permission.canAskAgain,
    );
  }
  if (!(await Location.hasServicesEnabledAsync())) {
    throw new LocationError('Location services are off', 'Turn on location services for this device, then try again.');
  }
  try {
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy };
  } catch {
    throw new LocationError('Your location could not be found', 'Move somewhere with a clearer signal, such as near a window, and try again.');
  }
}

type Point = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

export function distanceMeters(a: Point, b: Point) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass bearing from a to b, in radians clockwise from north.
export function bearing(a: Point, b: Point) {
  const dLng = rad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(dLng);
  return Math.atan2(y, x);
}
