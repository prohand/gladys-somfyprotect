import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SomfyRateLimitError } from '../src/somfy/errors.js';
import { createFakeApi, startService } from './helpers/fakeSomfy.js';

test('Test the connection lists every site with its devices', async () => {
  const { gladys } = await startService();
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.fr, /Connecté à Somfy Protect/);
  assert.match(
    ack.data.message.fr,
    /Home : Désactivée, 6 appareil\(s\), 1 injoignable\(s\), 1 pile\(s\) faible\(s\)/,
  );
  assert.match(ack.data.message.es, /Eventos en tiempo real: conectados/);
});

test('Test the connection explains a rate limit instead of failing', async () => {
  const api = createFakeApi();
  const { gladys } = await startService({ api });
  api.failWith = new SomfyRateLimitError('429', { retryAfter: 90 });
  const ack = await gladys.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.match(ack.data.message.de, /90 s/);
});

test('Test the connection asks for the account when there is none', async () => {
  const { gladys } = await startService({ config: { username: '', password: '' } });
  const ack = await gladys.fake.action('test_connection', {});
  assert.match(ack.data.message.en, /Enter the email and the password/);
});
