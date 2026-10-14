// -----------------------------------------------------------------------------
// SDK wiring: registers every Gladys handler on the service.
//
// Kept apart from index.js so the tests run the very same wiring against the
// fake Gladys of the SDK, with a fake Somfy cloud injected.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { testConnection } from './actions.js';
import { SCENE_ACTIONS } from './capabilities/scenes.js';
import { WIDGETS } from './capabilities/widget.js';
import { normalizeConfig } from './config.js';
import { applyLogLevel } from './logging.js';
import { createSomfyService } from './service.js';

const logger = createLogger({ name: 'app' });

/** Manifest `actions`, keyed like the manifest. */
export const ACTIONS = {
  test_connection: (service) => testConnection(service),
};

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {Parameters<typeof createSomfyService>[0]} dependencies everything but `gladys`
 */
export function createApp(gladys, dependencies) {
  const service = createSomfyService({ gladys, ...dependencies });

  // Restarts run one after the other, never two at once: a configuration
  // saved while the service is still starting waits for that start.
  let restarting = Promise.resolve();
  function restart(rawConfig) {
    restarting = restarting
      .catch(() => {})
      .then(async () => {
        const config = normalizeConfig(rawConfig);
        applyLogLevel(config);
        await service.start(config);
      });
    return restarting;
  }

  // Discovery: Gladys asks for the list of devices.
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> reading the Somfy cloud');
    await service.refresh();
    await gladys.publishDiscoveredDevices(service.catalog.discovery());
  });

  // Commands: security level, camera shutter, door lock.
  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    await service.setValue(device, feature, value);
  });

  // Camera: a FRESH image (dashboard live view, chat).
  gladys.onGetImage(async (device) => {
    logger.info(`onGetImage <- ${device.external_id}`);
    return service.getImage(device);
  });

  // Configuration screen buttons.
  for (const [key, handler] of Object.entries(ACTIONS)) {
    gladys.onAction(key, () => handler(service));
  }

  // Scene actions (Gladys 5.1+).
  for (const [key, handler] of Object.entries(SCENE_ACTIONS)) {
    gladys.onSceneAction(key, (fields) => handler(service, { gladys, fields }));
  }

  // Dashboard widget (Gladys 5.1+).
  for (const [key, widget] of Object.entries(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => widget.get(service, request));
    gladys.onWidgetAction(key, (actionKey, params, { settings }) =>
      widget.action(service, { actionKey, params, settings }),
    );
  }

  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> restarting with the new configuration');
    await restart(newConfig);
  });

  // On every (re)connection the configuration is read again and the service
  // restarted: it re-publishes the devices, their states and the transport
  // badges, which Gladys may have missed while the link was down.
  gladys.on('connected', async () => {
    try {
      await restart(await gladys.getConfig());
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, prüfe die Protokolle der Integration.',
          es: 'La inicialización ha fallado, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  return service;
}
