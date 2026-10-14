import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSomfyEvents, EVENTS_URL } from '../src/somfy/events.js';
import { createManualTimers } from './helpers/fakeSomfy.js';

class FakeWebSocket extends EventTarget {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeWebSocket.instances.push(this);
  }
  send(data) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    if (!this.closed) {
      this.closed = true;
      this.dispatchEvent(new Event('close'));
    }
  }
  receive(data) {
    const event = new Event('message');
    event.data = typeof data === 'string' ? data : JSON.stringify(data);
    this.dispatchEvent(event);
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  FakeWebSocket.instances = [];
  const received = [];
  const statuses = [];
  const timers = createManualTimers();
  const auth = {
    invalidated: 0,
    async getAccessToken() {
      return 'tok en';
    },
    invalidate() {
      this.invalidated += 1;
    },
  };
  const events = createSomfyEvents({
    auth,
    onMessage: (m) => received.push(m),
    onStatus: (s) => statuses.push(s),
    WebSocketImpl: FakeWebSocket,
    setTimer: timers.setTimeout,
    clearTimer: timers.clearTimeout,
  });
  return { events, received, statuses, timers, auth };
}

test('opens the socket with the token, acknowledges and dispatches messages', async () => {
  const { events, received, statuses } = setup();
  await events.start();
  const ws = FakeWebSocket.instances[0];
  assert.equal(ws.url, `${EVENTS_URL}?token=tok%20en`);

  ws.receive('{"key":"websocket.connection.ready"}');
  assert.deepEqual(statuses, [true]);
  assert.equal(events.connected, true);

  ws.receive({ message_id: 'm1', key: 'alarm.end', site_id: 's' });
  await tick();
  assert.deepEqual(ws.sent, [{ ack: true, message_id: 'm1', client: 'Android' }]);
  assert.deepEqual(received, [{ message_id: 'm1', key: 'alarm.end', site_id: 's' }]);

  ws.receive('not json');
  await tick();
  assert.equal(received.length, 1);
});

test('a token error renews the token and reconnects', async () => {
  const { events, auth, timers, statuses } = setup();
  await events.start();
  const ws = FakeWebSocket.instances[0];
  ws.receive('{"key":"websocket.connection.ready"}');
  ws.receive('{"key":"websocket.error.token"}');
  assert.equal(auth.invalidated, 1);
  assert.equal(ws.closed, true);
  assert.deepEqual(statuses, [true, false]);
  assert.equal(events.connected, false);

  await timers.runAll('timeout');
  await tick();
  assert.equal(FakeWebSocket.instances.length, 2);
});

test('stop() closes the socket and never reconnects', async () => {
  const { events, timers } = setup();
  await events.start();
  events.stop();
  assert.equal(FakeWebSocket.instances[0].closed, true);
  assert.equal(timers.pending.size, 0);
});
