# User Portal Day Theme Frontend Activation

Date: 2026-07-03 America/Los_Angeles / 2026-07-03 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260703-007`

SHA-256:
`F35EC35E50D94576B1494C4F634A89EA755FD82F7FC40AE318D07B542AABB942`

## Scope

Approved by operator instruction to start production update and executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-preview-20260703-007`.
- Uploaded and extracted the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260703-007`.
- Verified the uploaded archive SHA-256 before extraction.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No Vercel deployment, backend overlay change, Nginx config change, DNS change,
firewall change, env change, SQLite schema change, systemd change, service
restart, token output, subscription material output, or customer data dump was
performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-007-var-www-globalcircle-portal-20260703T100958Z`

## Purpose

This activation publishes the User Portal day/night theme preference:

- language and display theme are combined into one preference control group;
- default display theme is the day theme;
- night theme remains available for low-light use;
- theme preference persists across login, second-factor, registration, and the
  authenticated user portal shell;
- light theme colors are applied to portal shell, sidebar, cards, tables,
  forms, buttons, and modal surfaces.

## Validation

Local pre-activation validation:

- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:test` initially saw one timeout while validation jobs ran in
  parallel, then passed on a clean rerun: 35 files and 357 tests.
- `npm test` passed: 883 server tests.
- `git diff --check` passed with Windows LF/CRLF working-copy warnings only.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` was present with 5 files.
- Latest prior user portal release observed:
  `user-portal-preview-20260703-006`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html` and `portal-dist/assets`.
- Remote release contained 5 files.
- Remote assets were:
  - `assets/index-Cri00ge3.js`;
  - `assets/index-CXjItfyQ.css`;
  - `assets/browser-Ds7lUkVX.js`.
- Remote bundle/style contained:
  - `日间主题`;
  - `夜间主题`;
  - `portal-theme-switch`;
  - `portal-v2-shell`;
  - `data-portal-theme=light`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Target assets were:
  - `assets/index-Cri00ge3.js`;
  - `assets/index-CXjItfyQ.css`;
  - `assets/browser-Ds7lUkVX.js`;
  - `favicon.svg`.
- `https://portal.gccwebos.com/` returned `200` and referenced the new bundle.
- `https://portal.gccwebos.com/portal/` returned `200` and referenced the new
  bundle.
- `https://portal.gccwebos.com/portal/register/` returned `200` and referenced
  the new bundle.
- Static assets returned `200`.
- Live bundle/style contained:
  - `日间主题`;
  - `夜间主题`;
  - `portal-theme-switch`;
  - `portal-v2-shell`;
  - `data-portal-theme=light`.
- Browser visual validation of `https://portal.gccwebos.com/portal/` at
  `1440x900` observed the production login page with the combined
  `中 / EN / 日 / 夜` preference group and day theme selected.
- User Portal API routes remained proxied and validation-gated:
  - `POST https://portal.gccwebos.com/api/portal/human-challenges` returned
    `201`;
  - `POST https://portal.gccwebos.com/api/portal/registration` returned
    business validation `400` for an empty request;
  - `POST https://portal.gccwebos.com/api/portal/registration/email-verification`
    returned business validation `400` for an empty request;
  - `POST https://portal.gccwebos.com/api/portal/password/session` returned
    business validation `400` for an empty request.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-007-var-www-globalcircle-portal-20260703T100958Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
