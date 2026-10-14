import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { ALARM_WIDGET, WIDGET_ACTIONS } from '../src/capabilities/widget.js';
import { createFakeApi, SITE_ID, startService } from './helpers/fakeSomfy.js';

const SITE = 'ext:test-integration:site:site-1';

async function content(gladys, settings = {}) {
  const ack = await gladys.fake.widgetGet(ALARM_WIDGET, {
    settings,
    language: 'fr',
    units: 'metric',
  });
  assert.equal(ack.success, true, ack.error);
  return ack.data.content;
}

const buttons = (c) => c.components.filter((x) => x.type === 'button');

test('the content fits the widget vocabulary and budget', async () => {
  const { gladys, events } = await startService();
  assert.deepEqual(validateWidgetContent(await content(gladys)), []);
  await events.emit({ key: 'alarm.trespass', site_id: SITE_ID, device_id: 'pir-1' });
  assert.deepEqual(validateWidgetContent(await content(gladys, { allow_disarm: true })), []);
});

test('shows the level, the alarm, unreachable devices and low batteries', async () => {
  const { gladys } = await startService();
  const status = (await content(gladys)).components.find((x) => x.type === 'status');
  const byLabel = Object.fromEntries(status.items.map((i) => [i.label.en, i]));
  assert.equal(byLabel['Security level'].value.en, 'Disarmed');
  assert.equal(byLabel.Alarm.value.en, 'Quiet');
  assert.equal(byLabel.Devices.value.en, '5 / 6 reachable');
  assert.equal(byLabel['Low battery'].value, 'Front door');
});

test('no disarm nor stop button unless the widget allows it', async () => {
  const { gladys, events } = await startService();
  await events.emit({ key: 'security.level.change', site_id: SITE_ID, security_level: 'armed' });
  await events.emit({ key: 'alarm.trespass', site_id: SITE_ID, device_id: 'pir-1' });
  const locked = buttons(await content(gladys)).map((b) => b.action.key);
  assert.deepEqual(locked, [WIDGET_ACTIONS.PARTIAL]);

  const allowed = buttons(await content(gladys, { allow_disarm: true })).map((b) => b.action.key);
  assert.deepEqual(allowed, [
    WIDGET_ACTIONS.PARTIAL,
    WIDGET_ACTIONS.DISARM,
    WIDGET_ACTIONS.STOP_ALARM,
  ]);
  for (const button of buttons(await content(gladys, { allow_disarm: true }))) {
    assert.equal(button.action.confirm, true, 'every button asks for a confirmation');
  }
});

test('the buttons arm the site, and disarming is checked again on press', async () => {
  const { gladys, api } = await startService();
  const armed = await gladys.fake.widgetAction(
    ALARM_WIDGET,
    WIDGET_ACTIONS.ARM,
    { site: SITE_ID },
    { settings: {} },
  );
  assert.equal(armed.success, true);
  assert.equal(armed.data.message.fr, 'Niveau de sécurité : Totale');
  assert.deepEqual(api.calls.at(-1), ['setSecurityLevel', SITE_ID, 'armed']);

  const refused = await gladys.fake.widgetAction(
    ALARM_WIDGET,
    WIDGET_ACTIONS.DISARM,
    { site: SITE_ID },
    { settings: { allow_disarm: false } },
  );
  assert.equal(refused.success, false);
  const stop = await gladys.fake.widgetAction(
    ALARM_WIDGET,
    WIDGET_ACTIONS.STOP_ALARM,
    { site: SITE_ID },
    { settings: {} },
  );
  assert.equal(stop.success, false);
  assert.ok(!api.calls.some(([name]) => name === 'stopAlarm'));
  assert.ok(!api.calls.some(([, , level]) => level === 'disarmed'));
});

test('a widget pinned to a site shows that site', async () => {
  const { gladys } = await startService();
  const heading = (await content(gladys, { site: SITE })).components.find((x) => x.type === 'text');
  assert.equal(heading.text, 'Home');
});

test('without any site, the widget explains what to do', async () => {
  const { gladys } = await startService({ api: createFakeApi({ sites: [] }) });
  const c = await content(gladys);
  assert.deepEqual(validateWidgetContent(c), []);
  assert.match(c.components[0].text.fr, /Somfy Protect/);
});
