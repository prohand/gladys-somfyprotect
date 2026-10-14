import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { normalizeConfig } from '../src/config.js';
import { createSomfyService, PULSE_MS, SCENE_TRIGGERS } from '../src/service.js';
import { SomfyAuthError } from '../src/somfy/errors.js';
import { createFakeApi, SITE_ID, startService } from './helpers/fakeSomfy.js';

const SITE = 'ext:test-integration:site:site-1';
const dev = (id) => `ext:test-integration:device:${id}`;

test('publishes one device per site and per Somfy device with a feature', async () => {
  const { gladys } = await startService();
  const names = gladys.fake.discoveredDevices.map((d) => d.name);
  // The Link reports nothing Gladys can show: it is not published.
  assert.deepEqual(names, [
    'Somfy Protect Home',
    'Hall sensor',
    'Front door',
    'Alex key fob',
    'Kitchen smoke',
    'Living room camera',
  ]);
  const site = gladys.fake.discoveredDevices[0];
  assert.equal(site.external_id, SITE);
  const level = site.features.find((f) => f.external_id === `${SITE}:security-level`);
  assert.equal(level.type, 'select');
  assert.deepEqual(
    level.supported_options.map((o) => o.value),
    ['disarmed', 'partial', 'armed'],
  );
  for (const device of gladys.fake.discoveredDevices) {
    for (const feature of device.features) {
      assert.equal(typeof feature.min, 'number', `${feature.external_id} min`);
      assert.equal(typeof feature.max, 'number', `${feature.external_id} max`);
    }
  }
});

test('publishes the REST states: level, battery, temperature, tamper, camera shutter', async () => {
  const { gladys } = await startService();
  assert.equal(gladys.fake.lastState(`${SITE}:security-level`), 'disarmed');
  assert.equal(gladys.fake.lastState(`${SITE}:alarm`), 0);
  assert.equal(gladys.fake.lastState(`${dev('pir-1')}:battery`), 80);
  assert.equal(gladys.fake.lastState(`${dev('pir-1')}:temperature`), 19.5);
  assert.equal(gladys.fake.lastState(`${dev('pir-1')}:tamper`), 0);
  assert.equal(gladys.fake.lastState(`${dev('cam-1')}:camera-active`), 1);
});

test('reports the transports: cloud, and unreachable for a lost device', async () => {
  const { gladys } = await startService();
  const last = new Map(gladys.fake.transports.map((t) => [t.device_external_id, t]));
  assert.equal(last.get(SITE).transport, 'cloud');
  assert.equal(last.get(SITE).degraded, undefined);
  assert.equal(last.get(dev('pir-1')).transport, 'cloud');
  assert.equal(last.get(dev('smoke-1')).transport, 'unreachable');
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('a refresh re-publishes the devices only when they changed', async () => {
  const { gladys, service, api } = await startService();
  const before = gladys.fake.requests.filter((r) => r.path.includes('discovered')).length;
  await service.refresh();
  assert.equal(gladys.fake.requests.filter((r) => r.path.includes('discovered')).length, before);
  api.devices.push({
    device_id: 'pir-2',
    label: 'Garage sensor',
    device_definition: { type: 'pir' },
    status: {},
  });
  await service.refresh();
  assert.ok(gladys.fake.discoveredDevices.some((d) => d.name === 'Garage sensor'));
});

test('without credentials, says so in the Configuration screen and reads nothing', async () => {
  const gladys = createFakeGladys();
  const api = createFakeApi();
  const service = createSomfyService({
    gladys,
    createClient: () => ({ api, auth: {} }),
    createEvents: () => assert.fail('no events without an account'),
  });
  await gladys.connect();
  await service.start(normalizeConfig({}));
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.fr, /mot de passe/);
  assert.deepEqual(api.calls, []);
});

test('a refused account shows the advice and marks every device unreachable', async () => {
  const { gladys, service, api } = await startService();
  api.failWith = new SomfyAuthError('invalid_grant', { status: 400 });
  await assert.rejects(service.refresh(), SomfyAuthError);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /email and the password/);
  const last = new Map(gladys.fake.transports.map((t) => [t.device_external_id, t.transport]));
  assert.equal(last.get(SITE), 'unreachable');
  assert.equal(last.get(dev('pir-1')), 'unreachable');
});

test('setting the security level calls Somfy and publishes the new level', async () => {
  const { gladys, api } = await startService();
  const site = gladys.fake.discoveredDevices[0];
  const feature = site.features.find((f) => f.external_id.endsWith(':security-level'));
  const ack = await gladys.fake.setValue(site, feature, 'armed');
  assert.deepEqual(ack, { success: true });
  assert.deepEqual(api.calls.at(-1), ['setSecurityLevel', SITE_ID, 'armed']);
  assert.equal(gladys.fake.lastState(`${SITE}:security-level`), 'armed');

  const refused = await gladys.fake.setValue(site, feature, 'everything');
  assert.equal(refused.success, false);
});

test('the camera switch opens and closes the privacy shutter', async () => {
  const { gladys, api } = await startService();
  const camera = gladys.fake.discoveredDevices.find((d) => d.external_id === dev('cam-1'));
  const feature = camera.features.find((f) => f.external_id.endsWith(':camera-active'));
  await gladys.fake.setValue(camera, feature, 0);
  assert.deepEqual(api.calls.at(-1), ['deviceAction', SITE_ID, 'cam-1', 'shutter_close']);
  assert.equal(gladys.fake.lastState(`${dev('cam-1')}:camera-active`), 0);
  // Shutter closed: no image to take.
  const image = await gladys.fake.getImage(camera);
  assert.equal(image.success, false);
});

test('a camera image is fetched from Somfy on demand', async () => {
  const { gladys, api } = await startService();
  const camera = gladys.fake.discoveredDevices.find((d) => d.external_id === dev('cam-1'));
  const ack = await gladys.fake.getImage(camera);
  assert.equal(ack.success, true);
  assert.match(ack.data.image, /^image\/jpg;base64,/);
  assert.deepEqual(api.calls.at(-1), ['cameraSnapshot', SITE_ID, 'cam-1']);
});

test('a level change heard on the events channel updates the state and fires the trigger', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'security.level.change', site_id: SITE_ID, security_level: 'partial' });
  assert.equal(gladys.fake.lastState(`${SITE}:security-level`), 'partial');
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: SCENE_TRIGGERS.SECURITY_LEVEL_CHANGED,
    data: { site: SITE, level: 'partial', site_name: 'Home' },
  });
  // The same level again is not a change.
  const count = gladys.fake.sceneEvents.length;
  await events.emit({ key: 'security.level.change', site_id: SITE_ID, security_level: 'partial' });
  assert.equal(gladys.fake.sceneEvents.length, count);
});

test('an intrusion rings the alarm, pulses the sensor and fires alarm_triggered once', async () => {
  const { gladys, events, timers } = await startService();
  const message = {
    key: 'alarm.trespass',
    site_id: SITE_ID,
    device_id: 'pir-1',
    device_type: 'pir',
  };
  await events.emit(message);
  await events.emit(message);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(`${SITE}:alarm`), 1);
  assert.equal(gladys.fake.lastState(`${dev('pir-1')}:motion`), 1);
  const triggered = gladys.fake.sceneEvents.filter((e) => e.key === 'alarm_triggered');
  assert.deepEqual(triggered, [
    {
      key: 'alarm_triggered',
      data: { site: SITE, kind: 'intrusion', site_name: 'Home', device_name: 'Hall sensor' },
    },
  ]);

  // The detection falls back to 0 after the pulse.
  const pulse = [...timers.pending.values()].find((t) => t.ms === PULSE_MS);
  assert.ok(pulse, 'a pulse timer is armed');
  await timers.runAll('timeout');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(`${dev('pir-1')}:motion`), 0);
});

test('the end of the alarm resets it and fires alarm_ended', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'alarm.panic', site_id: SITE_ID });
  await events.emit({ key: 'alarm.end', site_id: SITE_ID });
  assert.equal(gladys.fake.lastState(`${SITE}:alarm`), 0);
  assert.deepEqual(gladys.fake.sceneEvents.at(-1), {
    key: 'alarm_ended',
    data: { site: SITE, site_name: 'Home' },
  });
});

test('a fire alarm sets the smoke detectors it names, and its end clears them', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'alarm.domestic.fire', site_id: SITE_ID, devices: ['smoke-1'] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(`${dev('smoke-1')}:smoke`), 1);
  assert.equal(gladys.fake.sceneEvents.at(-1).data.kind, 'fire');
  assert.equal(gladys.fake.sceneEvents.at(-1).data.device_name, 'Kitchen smoke');
  await events.emit({ key: 'alarm.domestic.fire.end', site_id: SITE_ID, devices: ['smoke-1'] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.lastState(`${dev('smoke-1')}:smoke`), 0);
});

test('key fob presence follows presence_in / presence_out', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'presence_in', site_id: SITE_ID, device_id: 'fob-1' });
  assert.equal(gladys.fake.lastState(`${dev('fob-1')}:presence`), 1);
  await events.emit({ key: 'presence_out', site_id: SITE_ID, device_id: 'fob-1' });
  assert.equal(gladys.fake.lastState(`${dev('fob-1')}:presence`), 0);
});

test('without the events channel, a level change seen by the refresh fires the trigger', async () => {
  const { gladys, service, api } = await startService({ config: { realtime: false } });
  api.sites[0].security_level = 'armed';
  await service.refresh();
  assert.equal(gladys.fake.lastState(`${SITE}:security-level`), 'armed');
  assert.equal(gladys.fake.sceneEvents.at(-1).key, SCENE_TRIGGERS.SECURITY_LEVEL_CHANGED);
});

test('the site badge is degraded while the events channel is down', async () => {
  const { gladys, service, events } = await startService();
  events.connected = false;
  await service.publishTransports();
  const site = gladys.fake.transports.filter((t) => t.device_external_id === SITE).at(-1);
  assert.equal(site.transport, 'cloud');
  assert.equal(site.degraded, true);
  assert.match(site.message.de, /Echtzeit/);
});

test('stop() cancels every timer and closes the events channel', async () => {
  const { service, events, timers } = await startService({ config: { snapshot_interval: 60 } });
  assert.ok(timers.pending.size > 0);
  service.stop();
  assert.equal(events.started, false);
  assert.equal(timers.pending.size, 0);
});

test('a saved configuration restarts the service and publishes again', async () => {
  const { gladys, api } = await startService();
  const reads = api.calls.filter(([name]) => name === 'getSites').length;
  await gladys.fake.configUpdated({
    username: 'me@example.com',
    password: 'secret',
    realtime: false,
  });
  assert.equal(api.calls.filter(([name]) => name === 'getSites').length, reads + 1);
  assert.ok(gladys.fake.discoveredDevices.length > 0);
});
