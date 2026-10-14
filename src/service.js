// -----------------------------------------------------------------------------
// The integration's engine: reads the Somfy cloud, listens to its events, and
// turns both into Gladys devices, states, scene events and badges.
//
//   - REST, every `poll_frequency` seconds: sites, devices, security levels,
//     batteries, temperatures, camera shutters. Published with
//     publishChangedStates, so a quiet house costs almost nothing.
//   - Events (WebSocket), as they happen: alarm, level change, detections,
//     presence of key fobs, smoke. They drive the scene triggers.
//
// Everything that talks to the outside is injected (Somfy API, events
// channel, timers), so the tests drive it with fakes and never touch the
// network.
// -----------------------------------------------------------------------------

import { createLogger, DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { ALARM_WIDGET } from './capabilities/widget.js';
import { hasCredentials } from './config.js';
import { createCatalog, DEVICE_TYPE, deviceName, SITE_TYPE, siteName } from './devices/index.js';
import { deviceType, FEATURE, isCamera, isLost, siteAlarmRinging } from './devices/features.js';
import { localize, pick } from './i18n.js';
import { LOCK_ACCESS, SECURITY_LEVELS, SHUTTER_ACTIONS } from './somfy/api.js';
import { describeError } from './somfy/errors.js';
import { toGladysImage } from './somfy/image.js';

const logger = createLogger({ name: 'somfy' });

/** Scene trigger keys, as declared in the manifest `scene_triggers`. */
export const SCENE_TRIGGERS = {
  ALARM_TRIGGERED: 'alarm_triggered',
  ALARM_ENDED: 'alarm_ended',
  SECURITY_LEVEL_CHANGED: 'security_level_changed',
};

/** How long a detection (motion, IntelliTag, doorbell) stays at 1. */
export const PULSE_MS = 30_000;

/** The same alarm (site, kind, sensor) fires its scene trigger once per minute. */
const TRIGGER_DEDUPE_MS = 60_000;

/** Unchanged REST values are re-sent this often, so they stay recently dated. */
const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

/** Delay before re-reading the cloud after an alarm ended or a command. */
const FOLLOW_UP_REFRESH_MS = 3_000;

const ALARM_KINDS = {
  'alarm.trespass': 'intrusion',
  'alarm.panic': 'panic',
  'alarm.domestic.fire': 'fire',
};

function chunk(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

/**
 * @param {object} options
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} options.gladys
 * @param {(config: object) => { api: object, auth: object }} options.createClient
 * @param {(options: object) => object} options.createEvents
 * @param {object} [options.timers]
 * @param {() => number} [options.now]
 */
export function createSomfyService({
  gladys,
  createClient,
  createEvents,
  timers = { setInterval, clearInterval, setTimeout, clearTimeout },
  now = Date.now,
}) {
  const catalog = createCatalog(gladys);
  const alarmRinging = new Map();
  const pulseTimers = new Map();
  const lastTriggers = new Map();

  let config = null;
  let client = null;
  let events = null;
  let pollTimer = null;
  let snapshotTimer = null;
  let followUpTimer = null;
  let cloudOk = false;
  let lastError = null;
  let discoverySignature = null;
  let generation = 0;
  let refreshing = null;
  let eventsStarted = false;

  // --- Publishing helpers ----------------------------------------------------

  async function publish(states) {
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }
  }

  function publishLater(states) {
    publish(states).catch((err) => logger.error('Publishing states failed', err));
  }

  function requestWidgetRefresh() {
    try {
      gladys.requestWidgetRefresh(ALARM_WIDGET);
    } catch (err) {
      logger.debug(`Widget refresh not sent: ${err.message}`);
    }
  }

  function fireSceneEvent(key, data) {
    gladys
      .publishSceneEvent(key, data)
      .catch((err) => logger.warn(`Scene event ${key} refused: ${err.message}`));
  }

  /** A detection: 1 now, back to 0 after PULSE_MS (a new one extends it). */
  function pulse(featureExternalId) {
    timers.clearTimeout(pulseTimers.get(featureExternalId));
    publishLater([{ device_feature_external_id: featureExternalId, state: 1 }]);
    pulseTimers.set(
      featureExternalId,
      timers.setTimeout(() => {
        pulseTimers.delete(featureExternalId);
        publishLater([{ device_feature_external_id: featureExternalId, state: 0 }]);
      }, PULSE_MS),
    );
  }

  function transportEntries() {
    // Degraded only once the channel was given its chance: the first badges
    // go out before it opens.
    const realtimeDown = config?.realtime && eventsStarted && !events?.connected;
    const entries = catalog.sites().map((site) => {
      const entry = {
        external_id: catalog.siteIds(site).device,
        transport: cloudOk ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
      };
      if (cloudOk && realtimeDown) {
        entry.degraded = true;
        entry.message = localize((l) =>
          pick(l, {
            en: `Real-time events unavailable: refreshed every ${config.poll_frequency} s.`,
            fr: `Événements en temps réel indisponibles : rafraîchi toutes les ${config.poll_frequency} s.`,
            de: `Echtzeit-Ereignisse nicht verfügbar: Aktualisierung alle ${config.poll_frequency} s.`,
            es: `Eventos en tiempo real no disponibles: actualizado cada ${config.poll_frequency} s.`,
          }),
        );
      }
      return entry;
    });
    // A device the Link lost contact with is unreachable, cloud or not.
    for (const device of catalog.devices()) {
      entries.push({
        external_id: catalog.deviceIds(device).device,
        transport:
          cloudOk && !isLost(device) ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE,
      });
    }
    return entries;
  }

  async function publishTransports() {
    for (const batch of chunk(transportEntries(), 100)) {
      try {
        await gladys.publishTransports(batch);
      } catch (err) {
        logger.warn(`Transport badges refused: ${err.message}`);
      }
    }
  }

  async function setCloudStatus(ok, err) {
    const changed = ok !== cloudOk || (!ok && err?.message !== lastError?.message);
    cloudOk = ok;
    lastError = ok ? null : err;
    if (changed) {
      await gladys
        .setConnectionStatus(ok, ok ? undefined : describeError(err))
        .catch((e) => logger.warn(`Connection status refused: ${e.message}`));
    }
  }

  function alarmState(siteId, ringing) {
    alarmRinging.set(siteId, ringing);
    const site = catalog.site(siteId);
    return site
      ? [
          {
            device_feature_external_id: catalog.siteIds(site).feature(FEATURE.ALARM),
            state: ringing,
          },
        ]
      : [];
  }

  function scheduleFollowUpRefresh() {
    timers.clearTimeout(followUpTimer);
    followUpTimer = timers.setTimeout(() => {
      followUpTimer = null;
      refresh().catch((err) => logger.warn(`Refresh failed: ${err.message}`));
    }, FOLLOW_UP_REFRESH_MS);
  }

  // --- REST refresh ----------------------------------------------------------

  async function readCloud() {
    const run = generation;
    const sites = await client.api.getSites();
    const devicesBySite = new Map();
    for (const site of sites) {
      devicesBySite.set(site.site_id, await client.api.getDevices(site.site_id));
    }
    if (run !== generation) {
      return;
    }

    const previousLevels = new Map(catalog.sites().map((s) => [s.site_id, s.security_level]));
    catalog.update(sites, devicesBySite, new Date(now()));

    const discovery = catalog.discovery();
    const signature = JSON.stringify(discovery);
    if (signature !== discoverySignature) {
      await gladys.publishDiscoveredDevices(discovery);
      discoverySignature = signature;
    }

    const states = catalog.states();
    for (const site of catalog.sites()) {
      const ringing = siteAlarmRinging(site);
      if (ringing !== undefined) {
        states.push(...alarmState(site.site_id, ringing ? 1 : 0));
      } else if (!alarmRinging.has(site.site_id)) {
        states.push(...alarmState(site.site_id, 0));
      }
      // Without the events channel, a level changed from the app or a key fob
      // is only seen here: fire the trigger once, from this side.
      const before = previousLevels.get(site.site_id);
      if (before && before !== site.security_level && !events?.connected) {
        fireLevelChanged(site);
      }
    }
    await publish(states);
    await setCloudStatus(true);
    await publishTransports();
    requestWidgetRefresh();
  }

  /** One read of the cloud at a time; concurrent callers share it. */
  function refresh() {
    if (!client) {
      return Promise.resolve();
    }
    if (!refreshing) {
      const run = generation;
      const current = readCloud()
        .catch(async (err) => {
          // A read started before a restart says nothing about the new account.
          if (run === generation) {
            await setCloudStatus(false, err);
            await publishTransports();
          }
          throw err;
        })
        .finally(() => {
          if (refreshing === current) {
            refreshing = null;
          }
        });
      refreshing = current;
    }
    return refreshing;
  }

  // --- Events channel --------------------------------------------------------

  function fireLevelChanged(site) {
    fireSceneEvent(SCENE_TRIGGERS.SECURITY_LEVEL_CHANGED, {
      site: catalog.siteIds(site).device,
      level: site.security_level,
      site_name: siteName(site),
    });
  }

  function alarmStarted(site, kind, device) {
    const states = alarmState(site.site_id, 1);
    publishLater(states);
    const dedupeKey = `${site.site_id}:${kind}:${device?.device_id ?? ''}`;
    const last = lastTriggers.get(dedupeKey);
    if (last === undefined || now() - last >= TRIGGER_DEDUPE_MS) {
      lastTriggers.set(dedupeKey, now());
      fireSceneEvent(SCENE_TRIGGERS.ALARM_TRIGGERED, {
        site: catalog.siteIds(site).device,
        kind,
        site_name: siteName(site),
        device_name: device ? deviceName(device) : null,
      });
    }
    requestWidgetRefresh();
  }

  function deviceIdsOf(list) {
    return (Array.isArray(list) ? list : [])
      .map((entry) => (typeof entry === 'string' ? entry : entry?.device_id))
      .filter(Boolean);
  }

  async function handleEvent(message) {
    const site = catalog.site(message.site_id);
    if (message.site_id && !site && client) {
      // A site added in the app since the last read: read again.
      scheduleFollowUpRefresh();
    }
    const device = message.device_id ? catalog.device(message.device_id) : undefined;
    const ids = device ? catalog.deviceIds(device) : null;

    switch (message.key) {
      case 'security.level.change': {
        const level = String(message.security_level ?? '').toLowerCase();
        if (!site || !SECURITY_LEVELS.includes(level)) {
          break;
        }
        const changed = site.security_level !== level;
        catalog.patchSite(site.site_id, { security_level: level });
        await publish([
          {
            device_feature_external_id: catalog.siteIds(site).feature(FEATURE.SECURITY_LEVEL),
            text: level,
          },
        ]);
        if (changed) {
          fireLevelChanged(site);
        }
        requestWidgetRefresh();
        break;
      }

      case 'alarm.trespass':
      case 'alarm.panic':
      case 'alarm.domestic.fire': {
        if (!site) {
          break;
        }
        const kind = ALARM_KINDS[message.key];
        if (kind === 'fire') {
          const smokeStates = deviceIdsOf(message.devices)
            .map((id) => catalog.device(id))
            .filter(Boolean)
            .map((d) => ({
              device_feature_external_id: catalog.deviceIds(d).feature(FEATURE.SMOKE),
              state: 1,
            }));
          publishLater(smokeStates);
        }
        if (device && ids) {
          const type = deviceType(device);
          if (type.includes('pir')) {
            pulse(ids.feature(FEATURE.MOTION));
          } else if (type.includes('tag')) {
            pulse(ids.feature(FEATURE.VIBRATION));
          }
        }
        const smokeDevice =
          kind === 'fire' && !device ? catalog.device(deviceIdsOf(message.devices)[0]) : undefined;
        alarmStarted(site, kind, device ?? smokeDevice);
        break;
      }

      case 'alarm.domestic.fire.end': {
        publishLater(
          deviceIdsOf(message.devices)
            .map((id) => catalog.device(id))
            .filter(Boolean)
            .map((d) => ({
              device_feature_external_id: catalog.deviceIds(d).feature(FEATURE.SMOKE),
              state: 0,
            })),
        );
        break;
      }

      case 'alarm.end': {
        if (!site) {
          break;
        }
        const wasRinging = alarmRinging.get(site.site_id) === 1;
        await publish(alarmState(site.site_id, 0));
        if (wasRinging) {
          fireSceneEvent(SCENE_TRIGGERS.ALARM_ENDED, {
            site: catalog.siteIds(site).device,
            site_name: siteName(site),
          });
        }
        requestWidgetRefresh();
        scheduleFollowUpRefresh();
        break;
      }

      case 'presence_in':
      case 'presence_out': {
        if (ids && deviceType(device).includes('remote')) {
          await publish([
            {
              device_feature_external_id: ids.feature(FEATURE.PRESENCE),
              state: message.key === 'presence_in' ? 1 : 0,
            },
          ]);
        }
        break;
      }

      case 'device.status': {
        if (!ids) {
          break;
        }
        const type = deviceType(device);
        if (type.includes('pir')) {
          pulse(ids.feature(FEATURE.MOTION));
        } else if (type.includes('tag')) {
          pulse(ids.feature(FEATURE.VIBRATION));
        }
        break;
      }

      case 'device.ring_door_bell': {
        if (ids && deviceType(device).includes('videophone')) {
          pulse(ids.feature(FEATURE.DOORBELL));
        }
        break;
      }

      case 'device.doorlock_triggered': {
        const status = message.door_lock_status;
        if (ids && (status === 'locked' || status === 'unlocked')) {
          catalog.patchDeviceStatus(device.device_id, { door_lock_status: status });
          await publish([
            {
              device_feature_external_id: ids.feature(FEATURE.LOCK),
              state: status === 'locked' ? 1 : 0,
            },
          ]);
        }
        break;
      }

      default:
        logger.debug(`Event ${message.key} not used`);
    }
  }

  // --- Commands --------------------------------------------------------------

  function api() {
    if (!client) {
      throw new Error('Somfy Protect is not configured: enter the account email and password');
    }
    return client.api;
  }

  function resolveSite(externalId) {
    const target = catalog.resolve(externalId);
    if (target?.kind !== SITE_TYPE) {
      throw new Error(
        `"${externalId}" is not a Somfy Protect alarm (pick the "Somfy Protect <site>" device)`,
      );
    }
    return target.site;
  }

  function resolveDevice(externalId, accept, what) {
    const target = catalog.resolve(externalId);
    if (target?.kind !== DEVICE_TYPE || !accept(target.device)) {
      throw new Error(`"${externalId}" is not a Somfy Protect ${what}`);
    }
    return target.device;
  }

  async function setSecurityLevel(siteExternalId, level) {
    const site = resolveSite(siteExternalId);
    const wanted = String(level).toLowerCase();
    if (!SECURITY_LEVELS.includes(wanted)) {
      throw new Error(`Unknown security level "${level}" (${SECURITY_LEVELS.join(', ')})`);
    }
    logger.info(`Security level of ${siteName(site)} -> ${wanted}`);
    await api().setSecurityLevel(site.site_id, wanted);
    // The events channel confirms it (and fires the trigger); without it the
    // follow-up refresh does.
    scheduleFollowUpRefresh();
    return wanted;
  }

  async function stopAlarm(siteExternalId) {
    const site = resolveSite(siteExternalId);
    logger.info(`Stopping the alarm of ${siteName(site)}`);
    await api().stopAlarm(site.site_id);
    scheduleFollowUpRefresh();
    return true;
  }

  async function setCameraActive(cameraExternalId, active) {
    const camera = resolveDevice(cameraExternalId, isCamera, 'camera');
    await api().deviceAction(
      camera.site_id,
      camera.device_id,
      active ? SHUTTER_ACTIONS.open : SHUTTER_ACTIONS.close,
    );
    catalog.patchDeviceStatus(camera.device_id, { shutter_state: active ? 'opened' : 'closed' });
    await publish([
      {
        device_feature_external_id: catalog.deviceIds(camera).feature(FEATURE.CAMERA_ACTIVE),
        state: active ? 1 : 0,
      },
    ]);
    return active;
  }

  async function captureImage(cameraExternalId) {
    const camera = resolveDevice(cameraExternalId, isCamera, 'camera');
    if (camera.status?.shutter_state === 'closed') {
      throw new Error(`The privacy shutter of ${deviceName(camera)} is closed`);
    }
    return toGladysImage(await api().cameraSnapshot(camera.site_id, camera.device_id));
  }

  async function pushSnapshots() {
    for (const camera of catalog.devices().filter(isCamera)) {
      if (camera.status?.shutter_state === 'closed' || isLost(camera)) {
        continue;
      }
      const externalId = catalog.deviceIds(camera).device;
      try {
        await gladys.publishCameraImage(externalId, await captureImage(externalId));
      } catch (err) {
        logger.warn(`Snapshot of ${deviceName(camera)} failed: ${err.message}`);
      }
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  function stop() {
    generation += 1;
    timers.clearInterval(pollTimer);
    timers.clearInterval(snapshotTimer);
    timers.clearTimeout(followUpTimer);
    pollTimer = null;
    snapshotTimer = null;
    followUpTimer = null;
    // A read still in flight belongs to the previous configuration: the next
    // refresh starts a new one instead of waiting for it.
    refreshing = null;
    for (const timer of pulseTimers.values()) {
      timers.clearTimeout(timer);
    }
    pulseTimers.clear();
    events?.stop();
    events = null;
    eventsStarted = false;
    client = null;
  }

  async function start(newConfig) {
    stop();
    config = newConfig;
    discoverySignature = null;
    if (!hasCredentials(config)) {
      cloudOk = false;
      await gladys.setConnectionStatus(
        false,
        localize((l) =>
          pick(l, {
            en: 'Enter the email and the password of your Somfy Protect account.',
            fr: 'Saisissez l’e-mail et le mot de passe de votre compte Somfy Protect.',
            de: 'Gib die E-Mail und das Passwort deines Somfy-Protect-Kontos ein.',
            es: 'Introduzca el correo y la contraseña de su cuenta Somfy Protect.',
          }),
        ),
      );
      return;
    }

    client = createClient(config);
    pollTimer = timers.setInterval(() => {
      refresh().catch((err) => logger.warn(`Refresh failed: ${err.message}`));
    }, config.poll_frequency * 1000);

    if (config.realtime) {
      events = createEvents({
        auth: client.auth,
        onMessage: handleEvent,
        onStatus: (connected) => {
          logger.info(`Real-time events ${connected ? 'connected' : 'disconnected'}`);
          publishTransports();
        },
      });
    }

    try {
      await refresh();
    } catch (err) {
      logger.error(`Somfy Protect unreachable: ${err.message}`);
    }
    // Started after the first read, so the events find the devices they name.
    if (events) {
      await events.start();
      eventsStarted = true;
    }
    if (config.snapshot_interval > 0) {
      snapshotTimer = timers.setInterval(() => {
        pushSnapshots().catch((err) => logger.warn(`Snapshots failed: ${err.message}`));
      }, config.snapshot_interval * 1000);
    }
  }

  return {
    catalog,
    start,
    stop,
    refresh,
    handleEvent,
    setSecurityLevel,
    stopAlarm,
    setCameraActive,
    captureImage,
    pushSnapshots,
    publishTransports,

    get config() {
      return config;
    },
    get cloudOk() {
      return cloudOk;
    },
    get lastError() {
      return lastError;
    },
    get realtimeConnected() {
      return Boolean(events?.connected);
    },
    isAlarmRinging: (siteId) => alarmRinging.get(siteId) === 1,

    /** onSetValue: the user acted on a feature in Gladys. */
    async setValue(device, feature, value) {
      const target = catalog.resolve(device.external_id);
      if (!target) {
        throw new Error(`Unknown device ${device.external_id}`);
      }
      const key = feature.external_id.slice(device.external_id.length + 1);
      if (target.kind === SITE_TYPE && key === FEATURE.SECURITY_LEVEL) {
        const level = await setSecurityLevel(device.external_id, value);
        await publish([{ device_feature_external_id: feature.external_id, text: level }]);
        return;
      }
      if (target.kind === DEVICE_TYPE && key === FEATURE.CAMERA_ACTIVE) {
        await setCameraActive(device.external_id, Number(value) === 1);
        return;
      }
      if (target.kind === DEVICE_TYPE && key === FEATURE.LOCK) {
        const lock = Number(value) === 1;
        await api().accessTrigger(
          target.device.site_id,
          target.device.device_id,
          lock ? LOCK_ACCESS.lock : LOCK_ACCESS.unlock,
        );
        await publish([{ device_feature_external_id: feature.external_id, state: lock ? 1 : 0 }]);
        return;
      }
      throw new Error(`${feature.external_id} cannot be controlled`);
    },

    /** onGetImage: a fresh snapshot of a camera. */
    async getImage(device) {
      return captureImage(device.external_id);
    },
  };
}
