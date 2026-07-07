# User Portal Registration Verify UI Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260702-005`

SHA-256:
`6442A23E8E4E3E49C0DB981B8D927EE3CB05CC189E006069EDA955EAB03C7956`

## Scope

Approved by operator instruction to perform the production replacement and
executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-preview-20260702-005`.
- Uploaded the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-005`.
- Verified the uploaded archive SHA-256 before extraction.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No backend overlay change, Nginx config change, DNS change, firewall change,
env change, SQLite schema change, systemd change, service restart, token
output, subscription material output, or customer data dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-005-var-www-globalcircle-portal-20260702T140531Z`

## Purpose

This activation replaces the live registration email-verification screen with
the Figma-aligned UI:

- dark left-side GCC WebOS registration progress panel;
- visible four-step progress rail;
- email verification step with six separate verification-code boxes;
- compact verification button and resend/help copy;
- no Google sign-in UI in the registration page;
- existing backend registration contract remains email-based.

## Validation

Local pre-activation validation:

- `git diff --check` passed with Windows LF/CRLF working-copy warnings only.
- `npm run admin:test -- src/test/user-portal.test.tsx` passed, 51 tests.
- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:test` passed, 35 files and 348 tests.
- `npm test` passed, 866 server tests.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` was present with 5 files.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html` and `portal-dist/assets`.
- Remote release contained 5 files.
- Remote bundle was `assets/index-BxrHl4M_.js`.
- Remote CSS was `assets/index-odlH_jw_.css`.
- Remote bundle/style contained:
  - `检查你的邮箱`;
  - `验证邮箱`;
  - `portal-registration-otp-slots`.
- Remote bundle did not contain `Google 登录`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Target assets were:
  - `assets/index-BxrHl4M_.js`;
  - `assets/index-odlH_jw_.css`;
  - `assets/browser-BATiQ4EY.js`;
  - `favicon.svg`.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- `https://portal.gccwebos.com/` returned `200`.
- Static assets returned `200`:
  - `assets/index-BxrHl4M_.js`;
  - `assets/index-odlH_jw_.css`;
  - `assets/browser-BATiQ4EY.js`;
  - `favicon.svg`.
- Live bundle contained:
  - `检查你的邮箱`;
  - `验证邮箱`;
  - `portal-registration-otp-slots`.
- Live bundle did not contain `Google 登录`.
- Browser visual validation of
  `https://portal.gccwebos.com/portal/register/` reached the email verification
  step using mocked API responses only and observed:
  - title `检查你的邮箱`;
  - left sidebar width `384px`;
  - shell grid columns `384px 1056px`;
  - 6 verification-code slots.
- User Portal API routes remained proxied and validation-gated:
  - `POST https://portal.gccwebos.com/api/portal/registration` returned
    business validation `400` for an empty request.
  - `POST https://portal.gccwebos.com/api/portal/registration/email-verification`
    returned business validation `400` for an empty request.
  - `POST https://portal.gccwebos.com/api/portal/password/session` returned
    business validation `400` for an empty request.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - `https://gccwebos.com/api/admin` returned `404`;
  - `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- Temporary upload archive under `/tmp` was removed after staging.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-005-var-www-globalcircle-portal-20260702T140531Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
