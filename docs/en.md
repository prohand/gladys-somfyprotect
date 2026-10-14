# Somfy Protect for Gladys

Control your **Somfy Protect** alarm from Gladys: arm and disarm it, see what
its sensors and cameras report, and react to alarms in your scenes.

Somfy Protect is a **cloud** service: the integration talks to the Somfy
servers, exactly like the Somfy Protect app. An Internet connection is needed,
and Somfy offers no local access.

## What you get

| In Somfy Protect         | In Gladys                                                       |
| ------------------------ | --------------------------------------------------------------- |
| Each site (alarm system) | A device "Somfy Protect _site_": security level + alarm ringing |
| Motion sensor            | Motion (1 for 30 s at each detection), battery, temperature     |
| IntelliTag               | Detection (1 for 30 s), battery, temperature                    |
| Key fob                  | Presence (1 = at home), battery                                 |
| Smoke detector           | Smoke, battery                                                  |
| Indoor camera, Somfy One | Camera image, "Camera active" switch (privacy shutter)          |
| Door lock                | Lock (1 = locked)                                               |
| Video doorbell           | Doorbell ring                                                   |
| Siren, Link, extender    | Battery, temperature, tamper, when the device reports them      |

The security level is a list with three choices: **Disarmed**, **Partial**
and **Armed**. Changing it in Gladys changes it in Somfy Protect.

Each device carries a **Cloud** badge. It turns to **Unreachable** when the
Somfy cloud does not answer, or when the Link lost contact with the device. The
badge of the site gets an orange dot when real-time events are down.

## Setup

1. In Gladys, open **Integrations**, find **Somfy Protect** and install it.
2. In the **Configuration** screen, type the **email** and the **password** of
   your Somfy Protect account, then save.
3. Press **Test the connection**: it lists your sites and devices.
4. Open the **Discovery** tab and create the devices you want.

> Tip: create a dedicated user in the Somfy Protect app (Settings, Users) for
> Gladys. You keep your own account private, and you can remove that user at
> any time.

### Settings

| Setting                      | Default | What it does                                                                        |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Refresh interval (s)         | 120     | How often batteries, temperatures and states are read (60 to 3600)                  |
| Real-time events             | on      | Alarms, level changes and detections arrive within a second. Needed by the triggers |
| Camera snapshot interval (s) | 0       | Push a camera image every N seconds. 0 = only when asked                            |
| Detailed logs (debug)        | off     | Log every request and event, to diagnose a problem                                  |

## Scenes

### Triggers

- **Somfy Protect alarm triggered**: an intrusion, a panic or a fire alarm.
  Filter on the site and the kind. Variables: site name, kind, name of the
  device that detected it.
- **Somfy Protect alarm ended**: the alarm stopped.
- **Somfy Protect security level changed**: filter on the new level.

The device states (motion, presence, smoke, security level...) also work with
the standard **Device state** trigger.

### Actions

- **Set the Somfy Protect security level**
- **Stop the Somfy Protect alarm**
- **Open or close a camera's privacy shutter**
- **Take a Somfy Protect camera snapshot**: put it before the core action
  **Send camera image** to receive a fresh picture.

Example: "when the alarm is triggered, take a snapshot of the living room
camera, then send it to me".

## Dashboard widget

Add the **Somfy Protect alarm** widget to a dashboard. It shows the security
level, the alarm, the devices that are unreachable or low on battery, and
buttons to arm the site.

The **Disarm** and **Stop alarm** buttons only appear when the widget setting
**Allow disarming** is ticked. Leave it off on a dashboard anyone can reach
(a tablet in the hall, for example). Every button asks for a confirmation.

## Troubleshooting

- **"Somfy Protect refused the account"**: check the email and the password in
  the Somfy Protect app first.
- **"Somfy Protect limits the requests"**: Somfy blocks accounts that log in
  too often. Wait the number of seconds shown; the integration retries alone.
  Avoid saving the configuration many times in a row.
- **No real-time events**: check that the container can reach
  `websocket.myfox.io` on port 443. The states still refresh at the refresh
  interval.
- **No camera image**: the privacy shutter of the camera is closed, or the
  camera is offline.
- Turn on **Detailed logs**, reproduce the problem, then read the logs of the
  integration. Passwords and tokens are never written in them.

## Privacy and security

- Your password is only sent to Somfy. It is stored by Gladys as a secret.
- The integration keeps a Somfy refresh token in its private `/data` volume,
  so a restart does not log in again.
- This integration is not made nor supported by Somfy. It uses the same
  servers as the Somfy Protect app.
