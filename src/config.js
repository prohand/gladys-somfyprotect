// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults and
// normalizes the received object, so the rest of the code never deals with
// `undefined` nor with numbers arriving as strings.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// manifest `config_schema` (test/manifest.test.js checks it).
export const DEFAULT_CONFIG = {
  username: '',
  password: '',
  // Seconds between two reads of the Somfy cloud (sites + devices). The
  // events channel carries what happens in between (alarm, level change,
  // detections), so this is a safety net for battery levels and temperatures.
  poll_frequency: 120,
  // Real-time events through the Somfy WebSocket.
  realtime: true,
  // Seconds between two camera snapshots pushed to the dashboard; 0 = only on
  // demand (dashboard live view, scene action).
  snapshot_interval: 0,
  debug_logs: false,
};

/** Bounds of the refresh interval, in seconds (mirrors the manifest min/max). */
export const POLL_FREQUENCY_BOUNDS = { min: 60, max: 3600 };

/** Bounds of the snapshot interval: 0 (off), otherwise at least a minute. */
export const SNAPSHOT_INTERVAL_BOUNDS = { min: 60, max: 3600 };

function clamp(value, { min, max }, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const snapshot = Number(raw.snapshot_interval ?? DEFAULT_CONFIG.snapshot_interval);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    username: String(raw.username ?? '').trim(),
    // A password may legitimately start or end with a space: never trim it.
    password: String(raw.password ?? ''),
    poll_frequency: clamp(
      raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency,
      POLL_FREQUENCY_BOUNDS,
      DEFAULT_CONFIG.poll_frequency,
    ),
    // The form sends booleans; anything but an explicit false keeps the default on.
    realtime: raw.realtime !== false,
    snapshot_interval:
      Number.isFinite(snapshot) && snapshot > 0
        ? clamp(snapshot, SNAPSHOT_INTERVAL_BOUNDS, 0)
        : DEFAULT_CONFIG.snapshot_interval,
    debug_logs: raw.debug_logs === true,
  };
}

/** True once the user typed both credentials. */
export function hasCredentials(config) {
  return Boolean(config.username) && Boolean(config.password);
}
