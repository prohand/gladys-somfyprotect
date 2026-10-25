# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-10-25

### Added

- Search keywords in the Gladys catalog (Myfox, Somfy One, IntelliTag, smoke
  detector, door lock...).

### Changed

- Gladys 5.3.0 or later is now required.
- Gladys integration SDK 0.16.

## [1.0.2] - 2026-10-23

- Maintenance release, no functional change.

## [1.0.1] - 2026-10-14

### Added

- First version of the Somfy Protect integration, built from the official
  Gladys integration template.
- One Gladys device per Somfy Protect site: security level (disarmed, partial,
  armed) that Gladys can change, and an "alarm ringing" state.
- Somfy devices: motion sensors, IntelliTags, key fobs (presence), smoke
  detectors, cameras (image and privacy shutter), sirens, door locks and video
  doorbells, with battery, temperature and tamper when the device reports them.
- Real-time events through the Somfy WebSocket: alarms, level changes,
  detections and presence reach Gladys within a second.
- Scene triggers: alarm triggered (intrusion, panic, fire), alarm ended,
  security level changed.
- Scene actions: set the security level, stop the alarm, open or close a
  camera's privacy shutter, take a camera snapshot.
- "Somfy Protect alarm" dashboard widget, with arming buttons; disarming from
  the widget is off unless its setting allows it.
- Cloud transport badge per device (unreachable when the Link lost it).
- "Test the connection" button in the Configuration screen.
- English, French, German and Spanish texts and documentation.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build),
  UI-driven Release workflow, GitHub Releases, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

### Security

- The Somfy refresh token is kept in `/data` with owner-only permissions, and
  passwords and tokens are never logged.

[Unreleased]: https://github.com/prohand/gladys-somfyprotect/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/prohand/gladys-somfyprotect/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/prohand/gladys-somfyprotect/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/prohand/gladys-somfyprotect/releases/tag/v1.0.1
