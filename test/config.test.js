import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, hasCredentials, normalizeConfig } from '../src/config.js';

test('an empty config gets the defaults', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
  assert.equal(hasCredentials(normalizeConfig()), false);
});

test('numbers typed as strings are read, and kept within bounds', () => {
  const config = normalizeConfig({ poll_frequency: '30', snapshot_interval: '7200' });
  assert.equal(config.poll_frequency, 60);
  assert.equal(config.snapshot_interval, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 120);
});

test('a snapshot interval under a minute is a minute, 0 stays off', () => {
  assert.equal(normalizeConfig({ snapshot_interval: 10 }).snapshot_interval, 60);
  assert.equal(normalizeConfig({ snapshot_interval: 0 }).snapshot_interval, 0);
  assert.equal(normalizeConfig({ snapshot_interval: -5 }).snapshot_interval, 0);
});

test('the email is trimmed, the password never', () => {
  const config = normalizeConfig({ username: ' me@example.com ', password: ' pw ' });
  assert.equal(config.username, 'me@example.com');
  assert.equal(config.password, ' pw ');
  assert.equal(hasCredentials(config), true);
});

test('real-time events stay on unless explicitly turned off', () => {
  assert.equal(normalizeConfig({ realtime: undefined }).realtime, true);
  assert.equal(normalizeConfig({ realtime: false }).realtime, false);
});
