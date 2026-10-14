// -----------------------------------------------------------------------------
// The log level, switchable from the Configuration screen.
//
// The SDK logger re-reads `process.env.LOG_LEVEL` on every line, so writing
// that variable is enough: it takes effect at once for every logger already
// created, the SDK's own connection logs included. A user diagnosing their
// installation cannot set an environment variable on the container, but they
// can tick a box.
//
// An operator who already set `LOG_LEVEL` on the container keeps it: their
// value is the baseline, captured once at startup, and comes back when the
// box is unticked.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'logging' });

const BASELINE = process.env.LOG_LEVEL;

/**
 * Apply the log level a configuration asks for.
 * @param {{ debug_logs?: boolean }} config normalized configuration
 * @returns {string} the level in force afterwards
 */
export function applyLogLevel(config) {
  const wanted = config?.debug_logs ? 'debug' : BASELINE;
  const current = process.env.LOG_LEVEL;
  if (wanted === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = wanted;
  }
  // Said at info, so the line survives the level it announces.
  if (current !== process.env.LOG_LEVEL) {
    logger.info(
      config?.debug_logs
        ? 'Detailed logs turned on'
        : `Detailed logs turned off (level: ${process.env.LOG_LEVEL ?? 'info'})`,
    );
  }
  return process.env.LOG_LEVEL ?? 'info';
}
