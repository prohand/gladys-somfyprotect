# Security policy

This integration drives an **alarm system**: a flaw in it can let someone disarm a
home. Please report any problem privately.

## Supported versions

Only the latest release of the Somfy Protect integration receives security fixes.
Update the integration from the Gladys store before reporting an issue.

| Version      | Supported |
| ------------ | --------- |
| 1.x (latest) | Yes       |
| older        | No        |

## Reporting a vulnerability

Please do **not** open a public issue, pull request or forum post for a security problem.

Report it privately through GitHub: open the **Security** tab of
[prohand/gladys-somfyprotect](https://github.com/prohand/gladys-somfyprotect/security), then
**Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only asks the
maintainers for a private contact, without any detail of the problem, and send the report
there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- any log line that helps (remove emails, passwords, tokens and addresses first).

You should get a first answer within 7 days. A fix is released as a new version of the
integration, and the advisory is published once users can update.

## Scope

In scope: the code of this repository and the Docker image it publishes, in particular:

- handling of the Somfy Protect credentials and tokens (never logged, refresh token kept
  in `/data` with owner-only permissions);
- the commands that change the security level or stop the alarm (Gladys device, scene
  actions, dashboard widget and its `allow_disarm` setting);
- the camera images the integration fetches and hands to Gladys.

Out of scope: Gladys Assistant itself (report to
[GladysAssistant/Gladys](https://github.com/GladysAssistant/Gladys/security)), and Somfy
Protect, its cloud, its app and its devices (report to Somfy). The OAuth client id
embedded in `src/somfy/auth.js` is the public one of the Somfy Protect mobile app, not a
secret of this project.

## Good practices for users

- Create a dedicated Somfy Protect user for Gladys (app: Settings, Users) and remove it
  if you stop using the integration.
- Keep **Allow disarming** off on any dashboard widget a visitor can reach.
- Restrict who can edit your Gladys scenes: a scene can disarm the alarm.
- Keep Gladys and the integration up to date.
