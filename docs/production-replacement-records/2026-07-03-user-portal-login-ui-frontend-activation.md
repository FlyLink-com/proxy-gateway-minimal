# User Portal Login UI Frontend Activation

Date: 2026-07-03 America/Los_Angeles / 2026-07-03 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260703-006`

SHA-256:
`96C0662DC1BEB4BCD80BA99A664732E93C715BAA8906A5A77DEF290C5AEE143E`

## Scope

Approved by operator instruction to perform the production update and executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-preview-20260703-006`.
- Uploaded and extracted the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260703-006`.
- Verified the uploaded archive SHA-256 before extraction.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No backend overlay change, Nginx config change, DNS change, firewall change,
env change, SQLite schema change, systemd change, service restart, token
output, subscription material output, or customer data dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-006-var-www-globalcircle-portal-20260703T092426Z`

## Purpose

This activation publishes the Figma-aligned User Portal login UI:

- dark GCC WebOS brand panel on desktop;
- single-page email/password login form;
- language switcher;
- password visibility control;
- human challenge display;
- registration entry for the 7-day trial;
- user-friendly handling for common backend/HTTP errors such as rate limits.

## Validation

Local pre-activation validation:

- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:test` passed, 35 files and 356 tests.
- `npm test` passed, 883 server tests.
- `git diff --check` passed with Windows LF/CRLF working-copy warnings only.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` was present with 5 files.
- Latest prior user portal release observed:
  `user-portal-preview-20260702-005`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html` and `portal-dist/assets`.
- Remote release contained 5 files.
- Remote bundle was `assets/index-C5bOvu5x.js`.
- Remote CSS was `assets/index-av_AGHxP.css`.
- Remote bundle/style contained:
  - `账号登录`;
  - `请求过于频繁，请稍后再试`;
  - `portal-login-shell`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Target assets were:
  - `assets/index-C5bOvu5x.js`;
  - `assets/index-av_AGHxP.css`;
  - `assets/browser-Dq3mqUtX.js`;
  - `favicon.svg`.
- `https://portal.gccwebos.com/` returned `200` and referenced the new bundle.
- `https://portal.gccwebos.com/portal/` returned `200` and referenced the new bundle.
- `https://portal.gccwebos.com/portal/register/` returned `200` and referenced
  the new bundle.
- Static assets returned `200`.
- Live bundle/style contained:
  - `账号登录`;
  - `请求过于频繁，请稍后再试`;
  - `注册领取 7 天试用`;
  - `portal-login-shell`.
- Live bundle did not contain `Google 登录`.
- Browser visual validation of `https://portal.gccwebos.com/portal/` observed:
  - desktop `1440x900` loaded the login shell with no horizontal overflow;
  - mobile `390x844` loaded the login shell with no horizontal overflow;
  - page title `GCC WebOS - 账号登录`.
- User Portal API routes remained proxied and validation-gated:
  - `POST https://portal.gccwebos.com/api/portal/human-challenges` returned `201`;
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
    without a session;
  - `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-006-var-www-globalcircle-portal-20260703T092426Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
