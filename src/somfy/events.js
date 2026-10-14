// -----------------------------------------------------------------------------
// Somfy Protect real-time events (wss://websocket.myfox.io).
//
// The mobile app learns of an alarm, a level change or a detection through
// this WebSocket, within a second. Polling the REST API cannot give that: an
// intrusion must reach Gladys scenes now, not at the next refresh.
//
// The protocol, as the app speaks it:
//   - the access token goes in the URL (`?token=`);
//   - every message carrying a `message_id` is acknowledged, or the server
//     sends it again;
//   - `websocket.error.token` means the token expired: renew it and reconnect.
//
// The connection is re-opened with a growing delay when it drops, and
// recycled every 50 minutes anyway, before the token it was opened with
// expires: a quiet house sends nothing for hours, and a silently dead socket
// would look exactly like that.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'somfy-events' });

export const EVENTS_URL = 'wss://websocket.myfox.io/events/websocket';

const RECYCLE_MS = 50 * 60 * 1000;
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60 * 1000;

/**
 * @param {object} options
 * @param {{ getAccessToken(): Promise<string>, invalidate(): void }} options.auth
 * @param {(message: object) => void|Promise<void>} options.onMessage
 * @param {(connected: boolean) => void} [options.onStatus]
 * @param {typeof WebSocket} [options.WebSocketImpl]
 * @param {typeof setTimeout} [options.setTimer]
 * @param {typeof clearTimeout} [options.clearTimer]
 */
export function createSomfyEvents({
  auth,
  onMessage,
  onStatus = () => {},
  WebSocketImpl = globalThis.WebSocket,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let socket = null;
  let stopped = true;
  let reconnectTimer = null;
  let recycleTimer = null;
  let attempts = 0;
  let ready = false;

  function clearTimers() {
    clearTimer(reconnectTimer);
    clearTimer(recycleTimer);
    reconnectTimer = null;
    recycleTimer = null;
  }

  function scheduleReconnect() {
    if (stopped || reconnectTimer) {
      return;
    }
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempts);
    attempts += 1;
    logger.info(`Events channel closed, reconnecting in ${Math.round(delay / 1000)} s`);
    reconnectTimer = setTimer(() => {
      reconnectTimer = null;
      open().catch((err) => {
        logger.warn(`Events channel: ${err.message}`);
        scheduleReconnect();
      });
    }, delay);
  }

  function setReady(value) {
    if (ready !== value) {
      ready = value;
      onStatus(value);
    }
  }

  function send(payload) {
    try {
      socket?.send(JSON.stringify(payload));
    } catch (err) {
      logger.debug(`Events channel: cannot send (${err.message})`);
    }
  }

  async function handle(raw) {
    const text = typeof raw === 'string' ? raw : Buffer.from(raw).toString('utf8');
    if (text.includes('websocket.connection.ready')) {
      attempts = 0;
      setReady(true);
      logger.info('Events channel ready');
      return;
    }
    if (text.includes('websocket.error.token')) {
      logger.info('Events channel: token expired, renewing');
      auth.invalidate();
      socket?.close();
      return;
    }
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      logger.debug('Events channel: non-JSON message ignored');
      return;
    }
    if (!message || typeof message !== 'object') {
      return;
    }
    if (message.message_id) {
      send({ ack: true, message_id: message.message_id, client: 'Android' });
    }
    if (message.key) {
      logger.debug(`Event ${message.key}`);
      await onMessage(message);
    }
  }

  async function open() {
    if (stopped) {
      return;
    }
    const token = await auth.getAccessToken();
    if (stopped) {
      return;
    }
    const ws = new WebSocketImpl(`${EVENTS_URL}?token=${encodeURIComponent(token)}`);
    socket = ws;
    ws.addEventListener('message', (event) => {
      handle(event.data).catch((err) => logger.error('Event handling failed', err));
    });
    ws.addEventListener('error', (event) => {
      logger.debug(`Events channel error: ${event?.message ?? 'unknown'}`);
    });
    ws.addEventListener('close', () => {
      if (socket !== ws) {
        return;
      }
      socket = null;
      setReady(false);
      clearTimer(recycleTimer);
      recycleTimer = null;
      scheduleReconnect();
    });
    recycleTimer = setTimer(() => {
      logger.debug('Events channel: recycling the connection');
      ws.close();
    }, RECYCLE_MS);
  }

  return {
    get connected() {
      return ready;
    },

    async start() {
      if (!stopped) {
        return;
      }
      stopped = false;
      attempts = 0;
      try {
        await open();
      } catch (err) {
        logger.warn(`Events channel: ${err.message}`);
        scheduleReconnect();
      }
    },

    stop() {
      stopped = true;
      clearTimers();
      const ws = socket;
      socket = null;
      setReady(false);
      try {
        ws?.close();
      } catch {
        // Already closed.
      }
    },
  };
}
