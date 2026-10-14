// -----------------------------------------------------------------------------
// What each Somfy Protect device becomes in Gladys.
//
// Somfy names its hardware by `device_definition.type`: `box` (Link), `pir`
// (motion sensor), `tag` (IntelliTag), `remote` (key fob), `smoke`, `siren`,
// `camera`, `allinone` (Somfy One / One+), `doorlock`, `videophone`,
// `extender`... A device gets the features its status actually reports
// (battery, temperature, cover) plus the ones its type implies.
//
// Feature keys are forever: Gladys keys the history, the scenes and the
// dashboards on the external ids built from them. Never rename one.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS as UNITS,
} from '@gladysassistant/integration-sdk';
import { SECURITY_LEVELS } from '../somfy/api.js';

export const FEATURE = {
  SECURITY_LEVEL: 'security-level',
  ALARM: 'alarm',
  BATTERY: 'battery',
  TEMPERATURE: 'temperature',
  TAMPER: 'tamper',
  MOTION: 'motion',
  VIBRATION: 'vibration',
  SMOKE: 'smoke',
  PRESENCE: 'presence',
  IMAGE: 'image',
  CAMERA_ACTIVE: 'camera-active',
  LOCK: 'lock',
  DOORBELL: 'doorbell',
};

/** Supported options of the security level select, in the app's order. */
export const SECURITY_LEVEL_OPTIONS = [
  { value: 'disarmed', label: 'Disarmed', sort_order: 0 },
  { value: 'partial', label: 'Partial', sort_order: 1 },
  { value: 'armed', label: 'Armed', sort_order: 2 },
];

function feature(ids, key, name, category, type, extra = {}) {
  return {
    name,
    external_id: ids.feature(key),
    category,
    type,
    read_only: true,
    has_feedback: false,
    keep_history: true,
    // Gladys stores min/max as NOT NULL: every feature declares them.
    min: 0,
    max: 1,
    ...extra,
  };
}

/** The features of the device that stands for a site (the alarm itself). */
export function siteFeatures(ids) {
  return [
    feature(ids, FEATURE.SECURITY_LEVEL, 'Security level', CATEGORIES.TEXT, TYPES.TEXT.SELECT, {
      read_only: false,
      has_feedback: true,
      max: SECURITY_LEVELS.length - 1,
      supported_options: SECURITY_LEVEL_OPTIONS,
    }),
    feature(ids, FEATURE.ALARM, 'Alarm ringing', CATEGORIES.SIREN, TYPES.SIREN.BINARY),
  ];
}

/** Somfy device type, lowercased (`pir`, `tag`, `camera`...). */
export function deviceType(device) {
  return String(device?.device_definition?.type ?? '').toLowerCase();
}

const has = (type, ...names) => names.some((name) => type.includes(name));

/** True for the types Gladys can show a camera image of. */
export function isCamera(device) {
  return has(deviceType(device), 'camera', 'allinone');
}

/**
 * The features of one Somfy device.
 * @param {{ feature(key: string): string }} ids
 * @param {object} device as the API returns it
 */
export function deviceFeatures(ids, device) {
  const type = deviceType(device);
  const status = device.status ?? {};
  const features = [];

  if (has(type, 'pir')) {
    features.push(
      feature(ids, FEATURE.MOTION, 'Motion', CATEGORIES.MOTION_SENSOR, TYPES.SENSOR.BINARY),
    );
  }
  if (has(type, 'tag')) {
    features.push(
      feature(
        ids,
        FEATURE.VIBRATION,
        'Detection',
        CATEGORIES.VIBRATION_SENSOR,
        TYPES.SENSOR.BINARY,
      ),
    );
  }
  if (has(type, 'smoke')) {
    features.push(
      feature(ids, FEATURE.SMOKE, 'Smoke', CATEGORIES.SMOKE_SENSOR, TYPES.SENSOR.BINARY),
    );
  }
  if (has(type, 'remote')) {
    features.push(
      feature(ids, FEATURE.PRESENCE, 'Presence', CATEGORIES.PRESENCE_SENSOR, TYPES.SENSOR.BINARY),
    );
  }
  if (isCamera(device)) {
    features.push(
      feature(ids, FEATURE.IMAGE, 'Image', CATEGORIES.CAMERA, TYPES.CAMERA.IMAGE, {
        keep_history: false,
      }),
      // The motorized privacy shutter of the Somfy cameras: 1 = open, filming.
      feature(ids, FEATURE.CAMERA_ACTIVE, 'Camera active', CATEGORIES.SWITCH, TYPES.SWITCH.BINARY, {
        read_only: false,
        has_feedback: true,
      }),
    );
  }
  if (has(type, 'doorlock')) {
    features.push(
      feature(ids, FEATURE.LOCK, 'Lock', CATEGORIES.LOCK, TYPES.LOCK.BINARY, { read_only: false }),
    );
  }
  if (has(type, 'videophone')) {
    features.push(
      feature(ids, FEATURE.DOORBELL, 'Doorbell', CATEGORIES.DOORBELL, TYPES.DOORBELL.RING),
    );
  }

  if (typeof status.battery_level === 'number') {
    features.push(
      feature(ids, FEATURE.BATTERY, 'Battery', CATEGORIES.BATTERY, TYPES.BATTERY.INTEGER, {
        unit: UNITS.PERCENT,
        max: 100,
      }),
    );
  }
  if (typeof status.temperature === 'number') {
    features.push(
      feature(
        ids,
        FEATURE.TEMPERATURE,
        'Temperature',
        CATEGORIES.TEMPERATURE_SENSOR,
        TYPES.SENSOR.DECIMAL,
        { unit: UNITS.CELSIUS, min: -20, max: 60 },
      ),
    );
  }
  if (typeof status.cover_present === 'boolean') {
    features.push(feature(ids, FEATURE.TAMPER, 'Tamper', CATEGORIES.TAMPER, TYPES.TAMPER.BINARY));
  }
  return features;
}

/**
 * The states the REST status of a device carries. Event-driven values
 * (motion, presence, smoke...) are not in it: the events channel publishes
 * them as they happen.
 */
export function deviceStatusStates(ids, device) {
  const type = deviceType(device);
  const status = device.status ?? {};
  const states = [];
  const push = (key, state) => states.push({ device_feature_external_id: ids.feature(key), state });

  if (typeof status.battery_level === 'number') {
    push(FEATURE.BATTERY, Math.max(0, Math.min(100, Math.round(status.battery_level))));
  }
  if (typeof status.temperature === 'number') {
    push(FEATURE.TEMPERATURE, Math.round(status.temperature * 10) / 10);
  }
  if (typeof status.cover_present === 'boolean') {
    push(FEATURE.TAMPER, status.cover_present ? 0 : 1);
  }
  if (isCamera(device) && typeof status.shutter_state === 'string') {
    push(FEATURE.CAMERA_ACTIVE, status.shutter_state === 'closed' ? 0 : 1);
  }
  if (has(type, 'doorlock') && typeof status.door_lock_status === 'string') {
    push(FEATURE.LOCK, status.door_lock_status === 'locked' ? 1 : 0);
  }
  return states;
}

/** True when the device itself says it lost contact with its Link. */
export function isLost(device) {
  const status = device.status ?? {};
  return status.device_lost === true || status.device_lost === 'true';
}

/** True when the device says its battery is low. */
export function isBatteryLow(device) {
  const status = device.status ?? {};
  if (status.battery_low === true) {
    return true;
  }
  return typeof status.battery_level === 'number' && status.battery_level <= 15;
}

/**
 * Whether a site's REST payload says an alarm is ringing: `true`, `false`,
 * or `undefined` when the payload does not say (the events channel then
 * stays the only source).
 */
export function siteAlarmRinging(site) {
  const status = site?.alarm?.status;
  if (typeof status !== 'string') {
    return undefined;
  }
  return !['', 'none', 'stopped', 'ended', 'off', 'inactive'].includes(status.toLowerCase());
}
