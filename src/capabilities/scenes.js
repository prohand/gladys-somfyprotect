// -----------------------------------------------------------------------------
// Scene triggers and scene actions (Gladys 5.1+).
//
// Triggers say "this happened, with these details" and are fired by the
// service from the Somfy events (src/service.js): an alarm went off (which
// kind, which sensor), it ended, the security level changed. The values
// themselves (level, ringing, motion...) stay device features: they also drive
// the standard "device state" trigger.
//
// Actions are operations a scene author places in a scene: arm or disarm a
// site, stop the alarm, open or close a camera's privacy shutter, take a
// snapshot. Each one receives the RESOLVED fields and returns the declared
// outputs. A scene action is never a condition: a failure throws (the scene
// logs it and goes on), a result is an output the scene can test.
//
// No action fires a trigger by itself: the level change an action causes is
// reported by Somfy's own events channel, like a change made from the app.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { SCENE_TRIGGERS } from '../service.js';

const logger = createLogger({ name: 'scenes' });

/** Every scene trigger key the service fires (checked against the manifest). */
export const SCENE_TRIGGER_KEYS = Object.values(SCENE_TRIGGERS);

/** Kinds of alarm, as the `alarm_triggered` trigger reports them. */
export const ALARM_KINDS = ['intrusion', 'panic', 'fire'];

/** Scene actions, keyed like the manifest `scene_actions`. */
export const SCENE_ACTIONS = {
  async set_security_level(service, { fields }) {
    logger.info(`Scene action set_security_level <- ${fields.site} ${fields.level}`);
    const level = await service.setSecurityLevel(fields.site, fields.level);
    return { level };
  },

  async stop_alarm(service, { fields }) {
    logger.info(`Scene action stop_alarm <- ${fields.site}`);
    return { stopped: await service.stopAlarm(fields.site) };
  },

  async set_camera_privacy(service, { fields }) {
    logger.info(`Scene action set_camera_privacy <- ${fields.camera} ${fields.shutter}`);
    const active = await service.setCameraActive(fields.camera, fields.shutter === 'open');
    return { active };
  },

  async take_snapshot(service, { gladys, fields }) {
    logger.info(`Scene action take_snapshot <- ${fields.camera}`);
    // The image goes through the camera channel: the core's "send camera
    // image" action, placed after this one, sends the fresh picture.
    await gladys.publishCameraImage(fields.camera, await service.captureImage(fields.camera));
    return { taken: true };
  },
};
