// -----------------------------------------------------------------------------
// The "Somfy Protect alarm" dashboard widget (Gladys 5.1+).
//
// One card per site: its security level, whether the alarm rings, the devices
// that lost contact or run low on battery, whether real-time events flow, and
// buttons to arm the site.
//
// A dashboard can hang on a wall where anyone passes by, and the acting user
// of a widget button is anonymous: disarming and stopping the alarm are
// therefore OFF unless the widget's own "Allow disarming" setting is ticked,
// and checked again when the button is pressed, not only when it is drawn.
// Every button asks for a confirmation.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { deviceName, siteName } from '../devices/index.js';
import { isBatteryLow, isLost } from '../devices/features.js';
import { localize, pick, SECURITY_LEVEL_LABELS } from '../i18n.js';

const logger = createLogger({ name: 'widget' });

export const ALARM_WIDGET = 'somfy_alarm';

/** Keys of the widget buttons' actions (one key per button: the core wants them unique). */
export const WIDGET_ACTIONS = {
  ARM: 'arm',
  PARTIAL: 'partial',
  DISARM: 'disarm',
  STOP_ALARM: 'stop_alarm',
};

/** The level each level button asks for. */
const ACTION_LEVELS = {
  [WIDGET_ACTIONS.ARM]: 'armed',
  [WIDGET_ACTIONS.PARTIAL]: 'partial',
  [WIDGET_ACTIONS.DISARM]: 'disarmed',
};

const LEVEL_COLORS = {
  disarmed: WIDGET_COLORS.NEUTRAL,
  partial: WIDGET_COLORS.WARNING,
  armed: WIDGET_COLORS.SUCCESS,
};

const T = {
  level: {
    en: 'Security level',
    fr: 'Niveau de sécurité',
    de: 'Sicherheitsstufe',
    es: 'Nivel de seguridad',
  },
  alarm: { en: 'Alarm', fr: 'Alarme', de: 'Alarm', es: 'Alarma' },
  ringing: { en: 'Ringing', fr: 'En cours', de: 'Ausgelöst', es: 'Sonando' },
  quiet: { en: 'Quiet', fr: 'Calme', de: 'Ruhig', es: 'En calma' },
  devices: { en: 'Devices', fr: 'Appareils', de: 'Geräte', es: 'Dispositivos' },
  battery: { en: 'Low battery', fr: 'Pile faible', de: 'Batterie schwach', es: 'Batería baja' },
  none: { en: 'None', fr: 'Aucun', de: 'Keine', es: 'Ninguno' },
  realtime: { en: 'Real-time events', fr: 'Temps réel', de: 'Echtzeit', es: 'Tiempo real' },
  on: { en: 'Connected', fr: 'Connecté', de: 'Verbunden', es: 'Conectado' },
  off: { en: 'Off', fr: 'Désactivé', de: 'Aus', es: 'Desactivado' },
  down: { en: 'Disconnected', fr: 'Déconnecté', de: 'Getrennt', es: 'Desconectado' },
  cloud: { en: 'Somfy cloud', fr: 'Cloud Somfy', de: 'Somfy-Cloud', es: 'Nube Somfy' },
  unreachable: { en: 'Unreachable', fr: 'Injoignable', de: 'Nicht erreichbar', es: 'Inaccesible' },
  arm: { en: 'Arm', fr: 'Activer', de: 'Aktivieren', es: 'Activar' },
  partial: { en: 'Partial', fr: 'Partielle', de: 'Teilweise', es: 'Parcial' },
  disarm: { en: 'Disarm', fr: 'Désactiver', de: 'Deaktivieren', es: 'Desactivar' },
  stop: { en: 'Stop alarm', fr: 'Arrêter l’alarme', de: 'Alarm stoppen', es: 'Parar alarma' },
};

const reachable = (n, total) =>
  localize((l) =>
    pick(l, {
      en: `${n} / ${total} reachable`,
      fr: `${n} / ${total} joignables`,
      de: `${n} / ${total} erreichbar`,
      es: `${n} / ${total} accesibles`,
    }),
  );

/** At most 40 characters: the status row's limit. */
function shortList(names) {
  const text = names.join(', ');
  return text.length <= 40 ? text : `${text.slice(0, 39)}…`;
}

function siteOf(service, settings) {
  const sites = service.catalog.sites();
  if (settings?.site) {
    const target = service.catalog.resolve(settings.site);
    if (target?.site) {
      return target.site;
    }
  }
  return sites[0];
}

function notConnected(service) {
  const configured = Boolean(service.config?.username);
  return {
    ttl_seconds: 60,
    components: [
      {
        type: 'text',
        variant: 'body',
        text: configured
          ? localize((l) =>
              pick(l, {
                en: 'Waiting for Somfy Protect: check the Configuration screen of the integration.',
                fr: 'En attente de Somfy Protect : consultez l’écran Configuration de l’intégration.',
                de: 'Warte auf Somfy Protect: Prüfe die Konfigurationsseite der Integration.',
                es: 'Esperando a Somfy Protect: revise la pantalla de configuración de la integración.',
              }),
            )
          : localize((l) =>
              pick(l, {
                en: 'Enter your Somfy Protect account in the Configuration screen of the integration.',
                fr: 'Saisissez votre compte Somfy Protect dans l’écran Configuration de l’intégration.',
                de: 'Gib dein Somfy-Protect-Konto auf der Konfigurationsseite der Integration ein.',
                es: 'Introduzca su cuenta Somfy Protect en la pantalla de configuración de la integración.',
              }),
            ),
      },
    ],
  };
}

function button(site, key, label, style, icon) {
  return {
    type: 'button',
    label,
    icon,
    style,
    action: { key, params: { site: site.site_id }, confirm: true },
  };
}

export const WIDGETS = {
  [ALARM_WIDGET]: {
    async get(service, { settings }) {
      logger.debug(`onWidgetGet <- ${ALARM_WIDGET}`);
      const site = siteOf(service, settings);
      if (!site) {
        return notConnected(service);
      }
      const devices = service.catalog.devices(site.site_id);
      const lost = devices.filter(isLost);
      const lowBattery = devices.filter(isBatteryLow);
      const ringing = service.isAlarmRinging(site.site_id);
      const level = site.security_level;
      const allowDisarm = settings?.allow_disarm === true;

      const items = [
        {
          label: T.level,
          icon: 'shield',
          value: SECURITY_LEVEL_LABELS[level] ?? String(level ?? '?'),
          color: LEVEL_COLORS[level] ?? WIDGET_COLORS.NEUTRAL,
        },
        {
          label: T.alarm,
          icon: 'bell',
          value: ringing ? T.ringing : T.quiet,
          color: ringing ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
        },
        {
          label: T.devices,
          icon: 'cpu',
          value: reachable(devices.length - lost.length, devices.length),
          color: lost.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
        },
        {
          label: T.battery,
          icon: 'battery',
          value: lowBattery.length > 0 ? shortList(lowBattery.map(deviceName)) : T.none,
          color: lowBattery.length > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
        },
        {
          label: T.cloud,
          icon: 'cloud',
          value: service.cloudOk ? T.on : T.unreachable,
          color: service.cloudOk ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
        },
        {
          label: T.realtime,
          icon: 'zap',
          value: !service.config?.realtime ? T.off : service.realtimeConnected ? T.on : T.down,
          color: !service.config?.realtime
            ? WIDGET_COLORS.NEUTRAL
            : service.realtimeConnected
              ? WIDGET_COLORS.SUCCESS
              : WIDGET_COLORS.WARNING,
        },
      ];

      const buttons = [];
      if (level !== 'armed') {
        buttons.push(button(site, WIDGET_ACTIONS.ARM, T.arm, 'primary', 'lock'));
      }
      if (level !== 'partial') {
        buttons.push(button(site, WIDGET_ACTIONS.PARTIAL, T.partial, 'secondary', 'moon'));
      }
      if (allowDisarm && level !== 'disarmed') {
        buttons.push(button(site, WIDGET_ACTIONS.DISARM, T.disarm, 'danger', 'unlock'));
      }
      if (allowDisarm && ringing) {
        buttons.push(button(site, WIDGET_ACTIONS.STOP_ALARM, T.stop, 'danger', 'bell-off'));
      }

      return {
        // The events channel nudges the widget on every change; the TTL is a
        // safety net for the battery and reachability rows.
        ttl_seconds: 120,
        components: [
          { type: 'text', variant: 'heading', text: siteName(site).slice(0, 40) },
          { type: 'status', items },
          ...buttons,
        ],
      };
    },

    async action(service, { actionKey, params, settings }) {
      logger.info(`onWidgetAction <- ${ALARM_WIDGET}.${actionKey}`);
      const site = service.catalog.site(params?.site);
      if (!site) {
        throw new Error('Unknown Somfy Protect site');
      }
      const siteExternalId = service.catalog.siteIds(site).device;
      const allowDisarm = settings?.allow_disarm === true;

      if (ACTION_LEVELS[actionKey]) {
        if (actionKey === WIDGET_ACTIONS.DISARM && !allowDisarm) {
          throw new Error('Disarming is not allowed from this widget');
        }
        const level = await service.setSecurityLevel(siteExternalId, ACTION_LEVELS[actionKey]);
        return localize((l) => {
          const name = pick(l, SECURITY_LEVEL_LABELS[level]);
          return pick(l, {
            en: `Security level: ${name}`,
            fr: `Niveau de sécurité : ${name}`,
            de: `Sicherheitsstufe: ${name}`,
            es: `Nivel de seguridad: ${name}`,
          });
        });
      }
      if (actionKey === WIDGET_ACTIONS.STOP_ALARM) {
        if (!allowDisarm) {
          throw new Error('Stopping the alarm is not allowed from this widget');
        }
        await service.stopAlarm(siteExternalId);
        return localize((l) =>
          pick(l, {
            en: 'Alarm stopped',
            fr: 'Alarme arrêtée',
            de: 'Alarm gestoppt',
            es: 'Alarma detenida',
          }),
        );
      }
      throw new Error(`Unknown widget action: ${actionKey}`);
    },
  },
};
