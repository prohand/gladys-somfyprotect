# Somfy Protect for Gladys Assistant

External integration for [Gladys Assistant](https://gladysassistant.com) that connects
the **Somfy Protect** alarm system (Link, Somfy One / One+, cameras, motion sensors,
IntelliTags, key fobs, smoke detectors, sirens...).

- **Cloud** integration (manifest `"transports": ["cloud"]`): Somfy Protect has no local
  API; the integration uses the same servers as the Somfy Protect app.
- Built from the official template
  [GladysAssistant/integration-template-js](https://github.com/GladysAssistant/integration-template-js),
  with the SDK [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
- Requires **Gladys ≥ 5.3.0** (scene triggers, scene actions, dashboard widget, catalog
  search keywords).
- English, French, German and Spanish.

User documentation: [English](docs/en.md) · [Français](docs/fr.md) ·
[Deutsch](docs/de.md) · [Español](docs/es.md).

## Features

| Surface          | What it does                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| Devices          | One device per site (security level as a select, alarm ringing) + one per Somfy device           |
| Real time        | Somfy WebSocket: alarms, level changes, detections, key fob presence, smoke, doorbell, door lock |
| Cameras          | Fresh image on demand (resized to ≤ 150 KB), optional periodic push, privacy shutter switch      |
| Transport badge  | `cloud` / `unreachable` per device; site badge degraded when real-time events are down           |
| Scene triggers   | `alarm_triggered` (intrusion, panic, fire), `alarm_ended`, `security_level_changed`              |
| Scene actions    | `set_security_level`, `stop_alarm`, `set_camera_privacy`, `take_snapshot`                        |
| Dashboard widget | `somfy_alarm`: level, alarm, unreachable devices, low batteries, arming buttons (disarm opt-in)  |
| Configuration    | Email, password (secret), refresh interval, real-time on/off, snapshot interval, detailed logs   |
| Action           | **Test the connection**: lists sites and devices, or explains the error                          |

## Project structure

```
.
├─ index.js                          # real dependencies + connect()
├─ src/
│  ├─ app.js                         # SDK wiring (every Gladys handler)
│  ├─ service.js                     # REST refresh, events, states, commands
│  ├─ somfy/                         # Somfy cloud: auth, token cache, REST, WebSocket, images
│  ├─ devices/                       # Somfy devices -> Gladys devices and features
│  ├─ capabilities/                  # scene actions/triggers + dashboard widget
│  ├─ actions.js                     # "Test the connection"
│  ├─ config.js · i18n.js · logging.js
├─ docs/{en,fr,de,es}.md             # user documentation (re-hosted by Gladys)
├─ test/                             # node --test, fake Gladys (SDK) + fake Somfy cloud
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs, /data volume
├─ CHANGELOG.md · CLAUDE.md · SECURITY.md
└─ .github/                          # CI, Release, build, GitHub Releases, Dependabot
```

## Development

```bash
npm install
npm test              # unit tests (no network)
npm run lint          # ESLint
npm run format:check  # Prettier
```

Run it against a Gladys instance:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="somfy-protect" \
DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

`DATA_DIR` (default `/data`) is where the Somfy refresh token is cached.

## CI and releases

The workflows are the same as [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel):

- **CI** (`ci.yml`): Prettier, ESLint and tests on Node 22 and 24; on pull requests, the
  store admission checks and a Docker build. The store check fails until the first
  release has pushed the image named in the manifest.
- **Release** (`release.yml`): Actions → Release → patch / minor / major. Bumps
  `package.json` and the manifest, moves `## [Unreleased]` of `CHANGELOG.md` under the
  version, tags, builds the multi-arch image (`linux/amd64`, `linux/arm64`) to
  `ghcr.io/prohand/gladys-somfyprotect`, then publishes the GitHub Release.
- **Build** (`build.yml`): multi-arch image on a `v*` tag, a manual run, or called by
  the Release.
- **GitHub releases** (`github-release.yml`): creates the missing Releases.
- **Dependabot**: npm weekly, GitHub Actions and Docker base image monthly.

Before the first release: add the GitHub topic `gladys-assistant-integration`, make the
GHCR package public, and turn on **Private vulnerability reporting** (see
[`SECURITY.md`](SECURITY.md)).

## Disclaimer

This project is not affiliated with, endorsed or supported by Somfy. "Somfy" and
"Somfy Protect" are trademarks of their owners. The Somfy Protect API is not public: it
may change without notice.

## License

Apache-2.0
