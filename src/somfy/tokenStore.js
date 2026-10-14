// -----------------------------------------------------------------------------
// Where the Somfy tokens are kept between two starts of the container.
//
// The Somfy SSO rate-limits the password grant hard: an integration that logs
// in again at every restart (Gladys update, host reboot, configuration saved)
// soon gets a 429 and then nothing at all for a while. The refresh token is
// therefore written to /data, the only writable volume of the container, with
// owner-only permissions. It is bound to a hash of the account email, so
// switching accounts never reuses the previous one's token.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'token-store' });

/** The token file, under the writable volume of the container. */
export const DEFAULT_TOKEN_FILE = join(process.env.DATA_DIR || '/data', 'somfy-token.json');

/** Hash of an account email: identifies the owner without storing the email. */
export function accountHash(username) {
  return createHash('sha256').update(String(username).trim().toLowerCase()).digest('hex');
}

/**
 * A token store on disk. Read and write failures are logged and swallowed: the
 * integration still works without the cache, it only logs in more often.
 */
export function createFileTokenStore(file = DEFAULT_TOKEN_FILE) {
  return {
    async load(username) {
      try {
        const saved = JSON.parse(await readFile(file, 'utf8'));
        return saved?.account === accountHash(username) ? saved.token : null;
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Cannot read the saved Somfy token (${err.code ?? err.message})`);
        }
        return null;
      }
    },

    async save(username, token) {
      try {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        // Write then rename: a crash mid-write never leaves half a token.
        const tmp = `${file}.tmp`;
        await writeFile(tmp, JSON.stringify({ account: accountHash(username), token }), {
          mode: 0o600,
        });
        await rename(tmp, file);
      } catch (err) {
        logger.warn(`Cannot save the Somfy token (${err.code ?? err.message})`);
      }
    },

    async clear() {
      try {
        await writeFile(file, '{}', { mode: 0o600 });
      } catch {
        // Nothing saved, nothing to clear.
      }
    },
  };
}

/** A token store in memory, for the tests. */
export function createMemoryTokenStore() {
  const saved = new Map();
  return {
    saved,
    async load(username) {
      return saved.get(accountHash(username)) ?? null;
    },
    async save(username, token) {
      saved.set(accountHash(username), token);
    },
    async clear() {
      saved.clear();
    },
  };
}
