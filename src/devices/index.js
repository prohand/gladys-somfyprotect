// -----------------------------------------------------------------------------
// The catalog: what the Somfy cloud said at the last refresh, and how it maps
// to Gladys devices.
//
// Unlike a fixed set of hardware, a Somfy Protect account holds any number of
// sites (one per alarm system) and of devices: they are read from the API and
// turned into Gladys devices here. One Gladys device per site (the alarm:
// security level + ringing) and one per Somfy device.
//
// External ids are built from the ids Somfy gives (`site_id`, `device_id`),
// never from a label: renaming a device in the app keeps its Gladys history.
// -----------------------------------------------------------------------------

import { deviceFeatures, deviceStatusStates, FEATURE, siteFeatures } from './features.js';

export const SITE_TYPE = 'site';
export const DEVICE_TYPE = 'device';

/** Display name of a Somfy device. */
export function deviceName(device) {
  return (
    device.label ||
    device.device_definition?.label ||
    device.device_definition?.type ||
    device.device_id
  );
}

/** Display name of a site. */
export function siteName(site) {
  return site.label || site.site_id;
}

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 */
export function createCatalog(gladys) {
  let sites = [];
  let devices = [];
  let refreshedAt = null;
  const byExternalId = new Map();

  const siteIds = (site) => gladys.externalIds(SITE_TYPE, site.site_id);
  const deviceIds = (device) => gladys.externalIds(DEVICE_TYPE, device.device_id);

  return {
    siteIds,
    deviceIds,

    /** Replace the catalog with a fresh read of the cloud. */
    update(siteList, devicesBySite, at = new Date()) {
      sites = siteList.filter((site) => site?.site_id);
      devices = sites.flatMap((site) =>
        (devicesBySite.get(site.site_id) ?? [])
          .filter((device) => device?.device_id)
          .map((device) => ({ ...device, site_id: device.site_id ?? site.site_id })),
      );
      refreshedAt = at;
      byExternalId.clear();
      for (const site of sites) {
        byExternalId.set(siteIds(site).device, { kind: SITE_TYPE, site });
      }
      for (const device of devices) {
        const site = sites.find((s) => s.site_id === device.site_id);
        byExternalId.set(deviceIds(device).device, { kind: DEVICE_TYPE, site, device });
      }
    },

    get refreshedAt() {
      return refreshedAt;
    },

    sites: () => sites,
    devices: (siteId) => (siteId ? devices.filter((d) => d.site_id === siteId) : devices),
    site: (siteId) => sites.find((site) => site.site_id === siteId),
    device: (deviceId) => devices.find((device) => device.device_id === deviceId),

    /** `{ kind, site, device? }` of a Gladys external id, or undefined. */
    resolve: (externalId) => byExternalId.get(externalId),

    /** Update one site in place (a level change heard on the events channel). */
    patchSite(siteId, patch) {
      const site = sites.find((s) => s.site_id === siteId);
      if (site) {
        Object.assign(site, patch);
      }
      return site;
    },

    /** Update the status of one device in place. */
    patchDeviceStatus(deviceId, patch) {
      const device = devices.find((d) => d.device_id === deviceId);
      if (device) {
        device.status = { ...device.status, ...patch };
      }
      return device;
    },

    /** The discovery payload: every site and every device with a feature. */
    discovery() {
      const payload = sites.map((site) => ({
        name: `Somfy Protect ${siteName(site)}`,
        external_id: siteIds(site).device,
        model: 'Somfy Protect alarm',
        features: siteFeatures(siteIds(site)),
      }));
      for (const device of devices) {
        const features = deviceFeatures(deviceIds(device), device);
        if (features.length === 0) {
          continue;
        }
        payload.push({
          name: deviceName(device),
          external_id: deviceIds(device).device,
          model: device.device_definition?.label ?? undefined,
          features,
        });
      }
      return payload;
    },

    /** The states the last REST read carries (security levels, batteries...). */
    states() {
      const states = sites
        .filter((site) => typeof site.security_level === 'string')
        .map((site) => ({
          device_feature_external_id: siteIds(site).feature(FEATURE.SECURITY_LEVEL),
          text: site.security_level,
        }));
      for (const device of devices) {
        states.push(...deviceStatusStates(deviceIds(device), device));
      }
      return states;
    },
  };
}
