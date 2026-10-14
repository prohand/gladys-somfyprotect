// -----------------------------------------------------------------------------
// Buttons of the Configuration screen (manifest `actions`).
// -----------------------------------------------------------------------------

import { hasCredentials } from './config.js';
import { isBatteryLow, isLost } from './devices/features.js';
import { siteName } from './devices/index.js';
import { localize, pick, SECURITY_LEVEL_LABELS } from './i18n.js';
import { describeError } from './somfy/errors.js';

/**
 * "Test the connection": logs in, reads every site and device, publishes them,
 * and says what was found — or what went wrong, in words the user can act on.
 */
export async function testConnection(service) {
  const config = service.config;
  if (!config || !hasCredentials(config)) {
    return localize((l) =>
      pick(l, {
        en: 'Enter the email and the password of your Somfy Protect account, save, then test again.',
        fr: 'Saisissez l’e-mail et le mot de passe de votre compte Somfy Protect, enregistrez, puis testez à nouveau.',
        de: 'Gib E-Mail und Passwort deines Somfy-Protect-Kontos ein, speichere und teste erneut.',
        es: 'Introduzca el correo y la contraseña de su cuenta Somfy Protect, guarde y vuelva a probar.',
      }),
    );
  }
  try {
    await service.refresh();
  } catch (err) {
    return describeError(err);
  }

  const sites = service.catalog.sites();
  if (sites.length === 0) {
    return localize((l) =>
      pick(l, {
        en: 'Connected, but this account has no Somfy Protect site.',
        fr: 'Connecté, mais ce compte n’a aucun site Somfy Protect.',
        de: 'Verbunden, aber dieses Konto hat keinen Somfy-Protect-Standort.',
        es: 'Conectado, pero esta cuenta no tiene ningún sitio Somfy Protect.',
      }),
    );
  }

  return localize((l) => {
    const lines = sites.map((site) => {
      const devices = service.catalog.devices(site.site_id);
      const lost = devices.filter(isLost).length;
      const low = devices.filter(isBatteryLow).length;
      const level = SECURITY_LEVEL_LABELS[site.security_level]
        ? pick(l, SECURITY_LEVEL_LABELS[site.security_level])
        : site.security_level;
      return pick(l, {
        en: `${siteName(site)}: ${level}, ${devices.length} device(s), ${lost} unreachable, ${low} low battery`,
        fr: `${siteName(site)} : ${level}, ${devices.length} appareil(s), ${lost} injoignable(s), ${low} pile(s) faible(s)`,
        de: `${siteName(site)}: ${level}, ${devices.length} Gerät(e), ${lost} nicht erreichbar, ${low} mit schwacher Batterie`,
        es: `${siteName(site)}: ${level}, ${devices.length} dispositivo(s), ${lost} inaccesible(s), ${low} con batería baja`,
      });
    });
    const realtime = !config.realtime
      ? pick(l, {
          en: 'Real-time events: off.',
          fr: 'Événements en temps réel : désactivés.',
          de: 'Echtzeit-Ereignisse: aus.',
          es: 'Eventos en tiempo real: desactivados.',
        })
      : service.realtimeConnected
        ? pick(l, {
            en: 'Real-time events: connected.',
            fr: 'Événements en temps réel : connectés.',
            de: 'Echtzeit-Ereignisse: verbunden.',
            es: 'Eventos en tiempo real: conectados.',
          })
        : pick(l, {
            en: 'Real-time events: not connected yet (see the logs).',
            fr: 'Événements en temps réel : pas encore connectés (voir les logs).',
            de: 'Echtzeit-Ereignisse: noch nicht verbunden (siehe Protokolle).',
            es: 'Eventos en tiempo real: aún no conectados (vea los registros).',
          });
    const ok = pick(l, {
      en: 'Connected to Somfy Protect.',
      fr: 'Connecté à Somfy Protect.',
      de: 'Mit Somfy Protect verbunden.',
      es: 'Conectado a Somfy Protect.',
    });
    return [ok, ...lines, realtime].join('\n');
  });
}
