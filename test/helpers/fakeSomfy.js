// -----------------------------------------------------------------------------
// Test doubles: a Somfy Protect account in memory, a hand-driven events
// channel and manual timers. No network, no clock.
// -----------------------------------------------------------------------------

// Quiet tests: only warnings and errors reach the output.
process.env.LOG_LEVEL ??= 'warn';

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { createApp } from '../../src/app.js';

export const SITE_ID = 'site-1';

export function sampleSites() {
  return [{ site_id: SITE_ID, label: 'Home', security_level: 'disarmed' }];
}

export function sampleDevices() {
  return [
    {
      device_id: 'link-1',
      label: 'Link',
      device_definition: { type: 'box', label: 'Link' },
      status: {},
    },
    {
      device_id: 'pir-1',
      label: 'Hall sensor',
      device_definition: { type: 'pir', label: 'Myfox Security Infrared Sensor' },
      status: { battery_level: 80, temperature: 19.46, cover_present: true },
    },
    {
      device_id: 'tag-1',
      label: 'Front door',
      device_definition: { type: 'tag', label: 'IntelliTag' },
      status: { battery_level: 10, device_lost: false },
    },
    {
      device_id: 'fob-1',
      label: 'Alex key fob',
      device_definition: { type: 'remote', label: 'Key Fob' },
      status: { battery_level: 90 },
    },
    {
      device_id: 'smoke-1',
      label: 'Kitchen smoke',
      device_definition: { type: 'smoke', label: 'Somfy Smoke Detector' },
      status: { battery_level: 70, device_lost: true },
    },
    {
      device_id: 'cam-1',
      label: 'Living room camera',
      device_definition: { type: 'camera', label: 'Somfy Indoor Camera' },
      status: { shutter_state: 'opened', temperature: 21 },
    },
  ];
}

/** The subset of the Somfy API the service calls, in memory. */
export function createFakeApi({ sites = sampleSites(), devices = sampleDevices() } = {}) {
  const calls = [];
  const api = {
    sites,
    devices,
    calls,
    failWith: null,
    snapshot: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    async getSites() {
      calls.push(['getSites']);
      if (api.failWith) {
        throw api.failWith;
      }
      return structuredClone(api.sites);
    },
    async getDevices(siteId) {
      calls.push(['getDevices', siteId]);
      return structuredClone(api.devices);
    },
    async setSecurityLevel(siteId, level) {
      calls.push(['setSecurityLevel', siteId, level]);
      return {};
    },
    async stopAlarm(siteId) {
      calls.push(['stopAlarm', siteId]);
      return {};
    },
    async deviceAction(siteId, deviceId, action) {
      calls.push(['deviceAction', siteId, deviceId, action]);
      return {};
    },
    async accessTrigger(siteId, deviceId, type) {
      calls.push(['accessTrigger', siteId, deviceId, type]);
      return {};
    },
    async cameraSnapshot(siteId, deviceId) {
      calls.push(['cameraSnapshot', siteId, deviceId]);
      return api.snapshot;
    },
  };
  return api;
}

/** An events channel the test drives by hand. */
export function createFakeEvents() {
  const channel = {
    connected: false,
    started: false,
    onMessage: null,
    onStatus: null,
    async start() {
      channel.started = true;
      channel.connected = true;
      channel.onStatus?.(true);
    },
    stop() {
      channel.started = false;
      channel.connected = false;
    },
    emit(message) {
      return channel.onMessage(message);
    },
  };
  return channel;
}

/** setTimeout / setInterval the test fires by hand. */
export function createManualTimers() {
  let next = 1;
  const pending = new Map();
  const add = (kind) => (fn, ms) => {
    const id = next++;
    pending.set(id, { kind, fn, ms });
    return id;
  };
  const remove = (id) => pending.delete(id);
  return {
    pending,
    setTimeout: add('timeout'),
    setInterval: add('interval'),
    clearTimeout: remove,
    clearInterval: remove,
    /** Run every pending timeout (and every interval once). */
    async runAll(kind) {
      for (const [id, timer] of [...pending]) {
        if (kind && timer.kind !== kind) {
          continue;
        }
        if (timer.kind === 'timeout') {
          pending.delete(id);
        }
        await timer.fn();
      }
    },
  };
}

/**
 * The app wired on a fake Gladys, a fake Somfy API and fake events, connected:
 * the 'connected' handler has read the config and started the service.
 */
export async function startService({ config = {}, api = createFakeApi() } = {}) {
  const gladys = createFakeGladys({
    config: { username: 'me@example.com', password: 'secret', ...config },
  });
  const events = createFakeEvents();
  const timers = createManualTimers();
  let clock = Date.parse('2026-10-14T10:00:00Z');
  const service = createApp(gladys, {
    createClient: () => ({ api, auth: { invalidate() {}, getAccessToken: async () => 't' } }),
    createEvents: ({ onMessage, onStatus }) => {
      events.onMessage = onMessage;
      events.onStatus = onStatus;
      return events;
    },
    timers,
    now: () => clock,
  });
  await gladys.connect();
  return {
    gladys,
    service,
    api,
    events,
    timers,
    advance(ms) {
      clock += ms;
    },
  };
}
