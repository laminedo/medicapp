import { api } from '../api.js';
import { h } from '../dom.js';
import { getPosition } from '../geo.js';
import { fmtDistance, fmtMinutes } from '../format.js';
import { button, callout, dataView, field, formError, input, pageHead, section, select, toast, withBusy } from '../ui.js';
import { geofenceRing, positionCaption } from '../ring.js';

const MIN_RADIUS = 10;
const MAX_RADIUS = 5000;
const SLIDER_MAX = 500;

export function mount(root, ctx) {
  let devicePosition = null;
  const view = dataView(root, { load: () => api.get('/api/facility'), render: draw });

  function draw({ facility, thresholds }) {
    const name = input({ value: facility.name, maxlength: 80, required: true });
    const address = input({ value: facility.address, maxlength: 160 });
    const latitude = input({ value: facility.latitude, inputmode: 'decimal', required: true, class: 'input nums' });
    const longitude = input({ value: facility.longitude, inputmode: 'decimal', required: true, class: 'input nums' });
    const radius = input({ type: 'number', value: facility.radius_m, min: MIN_RADIUS, max: MAX_RADIUS, step: 5, required: true, class: 'input nums' });
    const slider = h('input', { type: 'range', class: 'range', min: MIN_RADIUS, max: SLIDER_MAX, step: 5, value: Math.min(facility.radius_m, SLIDER_MAX), 'aria-label': 'Radius' });
    // Every zone the browser knows, plus the saved one in case it is not listed.
    const zones = [...new Set([facility.timezone, ...(Intl.supportedValuesOf?.('timeZone') ?? [])])].sort();
    const timezone = select({}, zones.map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') })), facility.timezone);
    const error = formError();
    const located = h('div');
    const preview = h('div', { class: 'geofence-preview' });
    const save = button('Save settings', { variant: 'primary', type: 'submit' });

    // The form as it stands, or null while a field holds something unusable.
    const draft = () => {
      const lat = Number(latitude.value);
      const lng = Number(longitude.value);
      const r = Number(radius.value);
      if (latitude.value.trim() === '' || longitude.value.trim() === '' || ![lat, lng, r].every(Number.isFinite)) return null;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || r < MIN_RADIUS || r > MAX_RADIUS) return null;
      return { name: name.value.trim() || 'the site', latitude: lat, longitude: lng, radius_m: r };
    };

    const paintPreview = () => {
      const site = draft();
      if (!site) {
        preview.replaceChildren(h('p', { class: 'geofence-caption' }, 'Enter a valid latitude, longitude and radius to preview the zone.'));
        return;
      }
      preview.replaceChildren(
        geofenceRing({ facility: site, position: devicePosition, size: 200 }),
        h('p', { class: 'geofence-caption' }, devicePosition ? positionCaption(devicePosition, site) : `Staff can clock in within ${fmtDistance(site.radius_m)} of this point.`),
      );
    };

    radius.addEventListener('input', () => {
      slider.value = Math.min(Number(radius.value) || MIN_RADIUS, SLIDER_MAX);
      paintPreview();
    });
    slider.addEventListener('input', () => {
      radius.value = slider.value;
      paintPreview();
    });
    latitude.addEventListener('input', paintPreview);
    longitude.addEventListener('input', paintPreview);

    const useHere = button('Use my current location', {
      icon: 'locate',
      onClick: () =>
        withBusy(useHere, async () => {
          try {
            devicePosition = await getPosition();
            latitude.value = devicePosition.latitude.toFixed(6);
            longitude.value = devicePosition.longitude.toFixed(6);
            located.replaceChildren(
              callout('ok', 'Location filled in from this device.', `Accurate to about ${fmtDistance(devicePosition.accuracy)}. Stand near the main entrance for the best result, then save.`),
            );
            paintPreview();
          } catch (err) {
            located.replaceChildren(callout('danger', err.title || 'Location failed', err.message));
          }
        }),
    });

    async function onSubmit(event) {
      event.preventDefault();
      error.clear();
      if (!draft()) return error.show('Check the latitude, longitude and radius. Radius must be between 10 m and 5 km.');
      await withBusy(save, async () => {
        try {
          const res = await api.put('/api/facility', { name: name.value, address: address.value, latitude: latitude.value, longitude: longitude.value, radius_m: radius.value, timezone: timezone.value });
          ctx.setFacilityName(res.facility.name);
          toast('Settings saved');
        } catch (err) {
          error.show(err.message);
        }
      });
    }

    paintPreview();
    return [
      pageHead('Settings', 'The facility and its clock-in zone.'),
      h(
        'form',
        { class: 'settings', onSubmit, novalidate: true },
        section(
          'Facility',
          null,
          h(
            'div',
            { class: 'panel form' },
            field('Name', name),
            field('Address', address, { optional: true }),
            field('Time zone', timezone, { hint: 'Medication times and "today" follow this zone, wherever the server runs.' }),
          ),
        ),
        section(
          'Clock-in zone',
          null,
          h(
            'div',
            { class: 'panel geofence' },
            h(
              'div',
              { class: 'form' },
              h('p', { class: 'prose' }, 'Staff can only clock in when their device is inside this circle. Set the centre to your building, then choose how far out the zone reaches.'),
              h('div', null, useHere),
              located,
              h('div', { class: 'field-pair' }, field('Latitude', latitude), field('Longitude', longitude)),
              field('Radius in metres', h('div', { class: 'radius-control' }, slider, radius), { hint: 'Around 100 m suits most buildings. Go wider if phones inside report poor accuracy.' }),
            ),
            preview,
          ),
        ),
        section(
          'Medication timing',
          null,
          h(
            'div',
            { class: 'panel' },
            h(
              'dl',
              { class: 'facts facts--wide' },
              h('div', null, h('dt', null, 'Can be given from'), h('dd', null, `${fmtMinutes(thresholds.due_opens_before_min)} before the scheduled time`)),
              h('div', null, h('dt', null, 'Marked overdue'), h('dd', null, `${fmtMinutes(thresholds.overdue_after_min)} after`)),
              h('div', null, h('dt', null, 'Marked missed'), h('dd', null, `${fmtMinutes(thresholds.missed_after_min)} after`)),
            ),
          ),
        ),
        error.el,
        h('div', { class: 'form-actions' }, save),
      ),
    ];
  }

  return () => view.stop();
}
