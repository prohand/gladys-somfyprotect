// -----------------------------------------------------------------------------
// Somfy Protect REST API (https://api.myfox.io), the subset this integration
// uses. Every call carries the access token of auth.js; a 401 renews it once
// and replays the call.
//
// Somfy publishes no documentation for this API: the routes and payloads are
// those of the mobile app, as the open-source clients use them.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SomfyError, SomfyRateLimitError } from './errors.js';

const logger = createLogger({ name: 'somfy-api' });

export const API_URL = 'https://api.myfox.io';

const REQUEST_TIMEOUT_MS = 15_000;

/** The security levels the API accepts. */
export const SECURITY_LEVELS = ['disarmed', 'partial', 'armed'];

/** Camera privacy shutter orders (`/action`). */
export const SHUTTER_ACTIONS = { open: 'shutter_open', close: 'shutter_close' };

/** Door lock orders (`/access/trigger`). */
export const LOCK_ACCESS = { lock: 'lock', unlock: 'unlock' };

/**
 * @param {object} options
 * @param {ReturnType<import('./auth.js').createSomfyAuth>} options.auth
 * @param {typeof fetch} [options.fetch]
 * @param {string} [options.baseUrl]
 */
export function createSomfyApi({ auth, fetch = globalThis.fetch, baseUrl = API_URL }) {
  async function send(method, path, { body, binary = false } = {}) {
    const token = await auth.getAccessToken();
    let response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: binary ? 'image/jpeg, */*' : 'application/json',
          'User-Agent': 'Somfy Protect',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SomfyError(`${method} ${path} failed: ${err.message}`, { cause: err });
    }
    return response;
  }

  async function request(method, path, options = {}) {
    let response = await send(method, path, options);
    if (response.status === 401) {
      logger.debug(`${method} ${path} -> 401, renewing the token`);
      auth.invalidate();
      response = await send(method, path, options);
    }
    logger.debug(`${method} ${path} -> ${response.status}`);

    if (response.status === 429) {
      const header = Number(response.headers.get('retry-after'));
      const retryAfter = Number.isFinite(header) && header > 0 ? header : 60;
      throw new SomfyRateLimitError(`${method} ${path} rate limited`, { retryAfter });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new SomfyError(
        `${method} ${path} -> HTTP ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
        { status: response.status },
      );
    }
    if (options.binary) {
      return Buffer.from(await response.arrayBuffer());
    }
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  return {
    /** Sites (one per alarm system) of the account. */
    async getSites() {
      const body = await request('GET', '/v3/site');
      return Array.isArray(body.items) ? body.items : [];
    },

    /** Devices of one site, with their status. */
    async getDevices(siteId) {
      const body = await request('GET', `/v3/site/${encodeURIComponent(siteId)}/device`);
      return Array.isArray(body.items) ? body.items : [];
    },

    /** Arm, partially arm or disarm a site. */
    async setSecurityLevel(siteId, level) {
      if (!SECURITY_LEVELS.includes(level)) {
        throw new Error(`Unknown security level "${level}"`);
      }
      return request('PUT', `/v3/site/${encodeURIComponent(siteId)}/security`, {
        body: { status: level },
      });
    },

    /** Stop the alarm ringing on a site. */
    async stopAlarm(siteId) {
      return request('PUT', `/v3/site/${encodeURIComponent(siteId)}/alarm/stop`, { body: {} });
    },

    /** Run a device action (camera shutter...). */
    async deviceAction(siteId, deviceId, action) {
      return request(
        'POST',
        `/v3/site/${encodeURIComponent(siteId)}/device/${encodeURIComponent(deviceId)}/action`,
        { body: { action } },
      );
    },

    /** Lock or unlock a door lock. */
    async accessTrigger(siteId, deviceId, type) {
      return request(
        'POST',
        `/v3/site/${encodeURIComponent(siteId)}/device/${encodeURIComponent(deviceId)}/access/trigger`,
        { body: { type } },
      );
    },

    /** A fresh JPEG from a camera, as a Buffer. */
    async cameraSnapshot(siteId, deviceId) {
      return request(
        'POST',
        `/video/site/${encodeURIComponent(siteId)}/device/${encodeURIComponent(deviceId)}/snapshot`,
        { body: { refresh: 10 }, binary: true },
      );
    },
  };
}
