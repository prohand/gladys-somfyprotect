import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SITE_ID, startService } from './helpers/fakeSomfy.js';

const SITE = 'ext:test-integration:site:site-1';
const CAMERA = 'ext:test-integration:device:cam-1';
const SENSOR = 'ext:test-integration:device:pir-1';

test('set_security_level arms the chosen site and outputs the level', async () => {
  const { gladys, api } = await startService();
  const ack = await gladys.fake.sceneAction('set_security_level', { site: SITE, level: 'partial' });
  assert.deepEqual(ack, { success: true, data: { outputs: { level: 'partial' } } });
  assert.deepEqual(api.calls.at(-1), ['setSecurityLevel', SITE_ID, 'partial']);
});

test('a scene action on the wrong kind of device fails that action only', async () => {
  const { gladys, api } = await startService();
  const before = api.calls.length;
  const ack = await gladys.fake.sceneAction('set_security_level', { site: SENSOR, level: 'armed' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /not a Somfy Protect alarm/);
  const camera = await gladys.fake.sceneAction('take_snapshot', { camera: SENSOR });
  assert.equal(camera.success, false);
  assert.equal(api.calls.length, before);
});

test('stop_alarm stops the alarm of the site', async () => {
  const { gladys, api } = await startService();
  const ack = await gladys.fake.sceneAction('stop_alarm', { site: SITE });
  assert.deepEqual(ack.data.outputs, { stopped: true });
  assert.deepEqual(api.calls.at(-1), ['stopAlarm', SITE_ID]);
});

test('set_camera_privacy drives the shutter and outputs whether it films', async () => {
  const { gladys, api } = await startService();
  const ack = await gladys.fake.sceneAction('set_camera_privacy', {
    camera: CAMERA,
    shutter: 'close',
  });
  assert.deepEqual(ack.data.outputs, { active: false });
  assert.deepEqual(api.calls.at(-1), ['deviceAction', SITE_ID, 'cam-1', 'shutter_close']);
});

test('take_snapshot publishes a fresh image on the camera device', async () => {
  const { gladys } = await startService();
  const ack = await gladys.fake.sceneAction('take_snapshot', { camera: CAMERA });
  assert.deepEqual(ack.data.outputs, { taken: true });
  assert.equal(gladys.fake.cameraImages.at(-1).device_external_id, CAMERA);
});

test('scene events carry only flat primitive data', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'alarm.trespass', site_id: SITE_ID, device_id: 'pir-1' });
  await events.emit({ key: 'security.level.change', site_id: SITE_ID, security_level: 'armed' });
  await events.emit({ key: 'alarm.end', site_id: SITE_ID });
  assert.equal(gladys.fake.sceneEvents.length, 3);
  for (const { data } of gladys.fake.sceneEvents) {
    for (const value of Object.values(data)) {
      assert.ok(value === null || ['string', 'number', 'boolean'].includes(typeof value));
    }
  }
});
