// Browser geolocation, with errors a person can act on.

export class GeoError extends Error {
  constructor(title, message) {
    super(message);
    this.title = title;
  }
}

export function getPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new GeoError('Location is not available', 'This browser cannot share its location. Try a current version of Safari or Chrome.'));
      return;
    }
    if (!window.isSecureContext) {
      reject(new GeoError('Location needs a secure connection', 'Browsers only share location over HTTPS. Ask your admin for the secure address of this app.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          reject(new GeoError('Location access is turned off', 'Allow location for this site in your browser settings, then try again.'));
        } else if (err.code === err.TIMEOUT) {
          reject(new GeoError('Finding your location took too long', 'Move somewhere with a clearer signal, such as near a window, and try again.'));
        } else {
          reject(new GeoError('Your location could not be found', 'Check that location services are turned on for this device, then try again.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;

export function distanceMeters(a, b) {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass bearing from a to b, in radians clockwise from north.
export function bearing(a, b) {
  const dLng = rad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(rad(b.latitude));
  const x = Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) - Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(dLng);
  return Math.atan2(y, x);
}
