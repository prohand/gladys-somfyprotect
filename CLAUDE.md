# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step) for the
**Somfy Protect** alarm system. It runs in its own sandboxed Docker container and talks
to Gladys through [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
and to the Somfy cloud (`api.myfox.io`, `sso.myfox.io`, `websocket.myfox.io`) with the
account email and password. Cloud only: Somfy offers no local API (manifest
`"transports": ["cloud"]`). It started from the official JavaScript template
(GladysAssistant/integration-template-js). Runtime dependencies: the SDK and `jpeg-js`
(pure-JS camera snapshot resizing).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/service.test.js          # one file
node --test --test-name-pattern "widget"  # tests whose name matches
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22 and
24; pull requests also run the store checks and build the Docker image. Run the three
commands before pushing.

## Architecture

```
index.js                     real dependencies (Somfy client, events, token file) + connect()
src/app.js                   SDK wiring: every Gladys handler, registered on the service
src/service.js               the engine: REST refresh, events, states, badges, commands
src/somfy/auth.js            OAuth2 password + refresh grants, SSO rate limit (429)
src/somfy/tokenStore.js      refresh token cached in /data (owner-only, bound to the account)
src/somfy/api.js             REST client (sites, devices, security level, alarm, camera)
src/somfy/events.js          WebSocket client: ack, token renewal, reconnect, recycle
src/somfy/image.js           snapshot -> Gladys image (<= 150 KB, downscaled with jpeg-js)
src/somfy/errors.js          SomfyAuthError / SomfyRateLimitError + user-facing advice
src/devices/index.js         catalog: sites and devices -> Gladys devices and states
src/devices/features.js      features per Somfy device type (pir, tag, remote, smoke, camera...)
src/capabilities/scenes.js   scene actions (manifest `scene_actions`) + trigger keys
src/capabilities/widget.js   "Somfy Protect alarm" dashboard widget
src/actions.js               "Test the connection" (manifest `actions`)
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                  languages (en, fr, de, es) + shared labels
src/logging.js               "Detailed logs" switch (LOG_LEVEL)
test/helpers/fakeSomfy.js    fake Somfy API, fake events channel, manual timers
```

### Invariants worth knowing

- **External ids are forever.** Sites are `externalIds('site', site_id)`, devices
  `externalIds('device', device_id)`, both ids given by Somfy. Feature keys
  (`security-level`, `alarm`, `motion`, `camera-active`...) are stored by Gladys with the
  history, scenes and dashboards: never rename one. Same for manifest keys
  (`config_schema`, `actions`, `scene_triggers`, `scene_actions`, `widgets`).
- **Two sources of truth.** REST (every `poll_frequency` s) for levels, batteries,
  temperatures, camera shutters; the events WebSocket for what happens (alarm, level
  change, detections, presence, smoke). Event-only values are never overwritten by a
  REST read. Detections are pulses: 1, then 0 after `PULSE_MS`.
- **Scene triggers fire from events**, once per transition (`alarm_triggered` is
  de-duplicated per site/kind/device for a minute). Without the events channel, a level
  change seen by the REST read fires `security_level_changed` instead. A scene action
  never fires a trigger itself.
- **The SSO rate-limits logins hard.** The refresh token is cached in `/data`; a 429
  blocks every login until `X-RateLimit-Retry-After` has passed. Never add a code path
  that logs in again in a loop.
- **No polling by Gladys.** Devices are published without `should_poll`; the service
  runs its own timer (one REST read covers every device of a site). Gladys
  `poll_frequency` values are milliseconds from an enum: never publish seconds.
- **Every feature declares `min`/`max`** (NOT NULL in Gladys). The security level is a
  `text`/`select` feature with `supported_options`; its value is published as `{ text }`.
- **Widget safety.** Disarming and stopping the alarm from the widget need its
  `allow_disarm` setting, checked again when the button is pressed. Every widget button
  asks for confirmation. Widget action keys are unique per content.
- **Transport badges.** `cloud`, `unreachable` when the cloud fails or the device is
  `device_lost`; the site badge is `degraded` while the events channel is down. A
  `message` is only accepted with `degraded: true`.
- **Secrets.** Never log the password, the tokens, or a URL carrying `?token=`.
- **The container rootfs is read-only.** Write only under `/data`.

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit `version`
  in `package.json` or in the manifest, nor the `docker_image` tag, by hand.
  `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in
  `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a
  version heading: the Release workflow moves the section
  (`.github/scripts/changelog-release.mjs`), and it becomes the GitHub Release notes.
- **Manifest.** Every text is a multi-language object `{ en, fr, de, es }`: `label`,
  `description`, `placeholder` alike. The catalog `description` holds 10 to 100
  characters per language. `widgets`, `scene_triggers`, `scene_actions` need
  `gladys_version >= 5.1.0`. `test/manifest.test.js` ties the manifest to the code:
  change both sides together.
- **User-facing text** is written in English, French, German and Spanish (built with
  `localize`/`pick` from `src/i18n.js`): action messages, connection status, widget,
  badges, and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in
  English. Tests never touch the network: inject `fetch`, `WebSocketImpl`, timers.
