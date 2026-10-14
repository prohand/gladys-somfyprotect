// -----------------------------------------------------------------------------
// Somfy Protect account: OAuth2 tokens.
//
// Somfy Protect has no public API key: like the official app (and every
// open-source client, Home Assistant included), the integration logs in with
// the account email and password (OAuth2 "password" grant) using the app's own
// public client id. The access token lasts about an hour; it is renewed with
// the refresh token, and the password grant is only replayed when the refresh
// token is refused.
//
// The SSO answers 429 with `X-RateLimit-Retry-After` when it is asked too
// often: past that, every call fails fast until the delay has passed, instead
// of hammering the SSO and extending the ban.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SomfyAuthError, SomfyError, SomfyRateLimitError } from './errors.js';

const logger = createLogger({ name: 'somfy-auth' });

export const TOKEN_URL = 'https://sso.myfox.io/oauth/oauth/v2/token/jwt';

// Public client of the Somfy Protect mobile app, base64 as the reference
// clients ship it. Not a secret of the user: the account credentials are.
const CLIENT_ID = Buffer.from(
  'ODRlZGRmNDgtMmI4ZS0xMWU1LWIyYTUtMTI0Y2ZhYjI1NTk1XzQ3NWJ1cXJmOHY4a2d3' +
    'b280Z293MDhna2tjMGNrODA0ODh3bzQ0czhvNDhzZzg0azQw',
  'base64',
).toString('utf8');
const CLIENT_SECRET = Buffer.from(
  'NGRzcWZudGlldTB3Y2t3d280MGt3ODQ4Z3c0bzBjOGs0b3djODBrNGdvMGNzMGs4NDQ=',
  'base64',
).toString('utf8');

/** A token is renewed this long before it expires. */
const EXPIRY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_AFTER_S = 60;

/**
 * @param {object} options
 * @param {string} options.username account email
 * @param {string} options.password account password
 * @param {object} options.tokenStore see tokenStore.js
 * @param {typeof fetch} [options.fetch]
 * @param {() => number} [options.now]
 */
export function createSomfyAuth({
  username,
  password,
  tokenStore,
  fetch = globalThis.fetch,
  now = Date.now,
}) {
  let token = null;
  let loaded = false;
  let pending = null;
  let blockedUntil = 0;

  async function requestToken(params) {
    if (now() < blockedUntil) {
      throw new SomfyRateLimitError('Somfy SSO rate limit still running', {
        retryAfter: Math.ceil((blockedUntil - now()) / 1000),
      });
    }
    let response;
    try {
      response = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'Somfy Protect',
        },
        body: new URLSearchParams({
          ...params,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new SomfyError(`Somfy SSO unreachable: ${err.message}`, { cause: err });
    }

    if (response.status === 429) {
      const header = Number(response.headers.get('x-ratelimit-retry-after'));
      const retryAfter = Number.isFinite(header) && header > 0 ? header : DEFAULT_RETRY_AFTER_S;
      blockedUntil = now() + retryAfter * 1000;
      throw new SomfyRateLimitError(`Somfy SSO rate limit (retry after ${retryAfter} s)`, {
        retryAfter,
      });
    }

    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') {
      // The SSO answers 400 invalid_grant to a wrong password as well as to a
      // stale refresh token: the caller knows which grant it tried.
      const reason = body.error_description || body.error || `HTTP ${response.status}`;
      const ErrorClass =
        response.status >= 400 && response.status < 500 ? SomfyAuthError : SomfyError;
      throw new ErrorClass(`Somfy SSO refused the ${params.grant_type} grant: ${reason}`, {
        status: response.status,
      });
    }

    return {
      access_token: body.access_token,
      refresh_token: body.refresh_token ?? params.refresh_token ?? null,
      expires_at: now() + Number(body.expires_in ?? 3600) * 1000,
    };
  }

  async function renew() {
    if (!loaded) {
      loaded = true;
      token = token ?? (await tokenStore.load(username));
    }
    if (token && token.expires_at - EXPIRY_MARGIN_MS > now()) {
      return token;
    }
    if (token?.refresh_token) {
      try {
        logger.debug('Refreshing the Somfy token');
        token = await requestToken({
          grant_type: 'refresh_token',
          refresh_token: token.refresh_token,
        });
        await tokenStore.save(username, token);
        return token;
      } catch (err) {
        if (err instanceof SomfyRateLimitError || !(err instanceof SomfyAuthError)) {
          throw err;
        }
        logger.info('Refresh token refused, logging in again');
      }
    }
    logger.info('Logging in to Somfy Protect');
    token = await requestToken({ grant_type: 'password', username, password });
    await tokenStore.save(username, token);
    return token;
  }

  return {
    /** A valid access token; concurrent callers share one renewal. */
    async getAccessToken() {
      if (!pending) {
        pending = renew().finally(() => {
          pending = null;
        });
      }
      return (await pending).access_token;
    },

    /** Called on a 401: the next call renews the access token. */
    invalidate() {
      if (token) {
        token = { ...token, expires_at: 0 };
      }
    },
  };
}
