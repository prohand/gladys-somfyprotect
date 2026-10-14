// -----------------------------------------------------------------------------
// Entry point of the Somfy Protect integration for Gladys.
//
// Builds the real dependencies (Somfy cloud client, events channel, token
// file in /data) and hands them to the app (src/app.js), which registers the
// Gladys handlers. Handlers are registered BEFORE connect().
//
// Environment variables provided by the Gladys supervisor to the container:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// The SDK reads them automatically.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';
import { createSomfyApi } from './src/somfy/api.js';
import { createSomfyAuth } from './src/somfy/auth.js';
import { createSomfyEvents } from './src/somfy/events.js';
import { createFileTokenStore } from './src/somfy/tokenStore.js';

const gladys = new GladysIntegration();
const tokenStore = createFileTokenStore();

const service = createApp(gladys, {
  createClient: (config) => {
    const auth = createSomfyAuth({
      username: config.username,
      password: config.password,
      tokenStore,
    });
    return { auth, api: createSomfyApi({ auth }) };
  },
  createEvents: (options) => createSomfyEvents(options),
});

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown((signal) => {
  logger.info(`Received ${signal} -> graceful shutdown`);
  service.stop();
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled promise rejection', err);
});

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Somfy Protect integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
