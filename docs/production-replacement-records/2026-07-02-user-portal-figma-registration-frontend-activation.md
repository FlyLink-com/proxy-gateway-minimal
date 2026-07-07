# User Portal Figma Registration Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260702-004`

SHA-256:
`E5C113E6753F917284BA5AC1C305ADA647A4724DEEC3F91A7AFEF234B4B66EA7`

## Scope

Approved by operator instruction to start production activation and executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-preview-20260702-004`.
- Uploaded the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-004`.
- Verified the uploaded archive SHA-256 before extraction.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No backend overlay change, Nginx config change, DNS change, firewall change,
env change, SQLite schema change, systemd change, service restart, token
output, subscription material output, or customer data dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-004-var-www-globalcircle-portal-20260702T132901Z`

## Purpose

This activation publishes the Figma-aligned User Portal self-registration UI:

- left-side GCC WebOS registration progress panel;
- multi-step flow for account creation, plan confirmation, email verification,
  and completion;
- email/password registration with 7-day Starter Trial copy;
- no Google sign-in UI in the registration page;
- existing backend registration contract remains email-based and does not
  expose internal account IDs in the public registration response.

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
- Existing `/var/www/globalcircle-portal` was present.
- `user-portal-preview-20260702-004` release was absent before upload.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html` and `portal-dist/assets`.
- Remote release contained 5 files.
- Remote bundle was `assets/index-OkP9ATP7.js`.
- Remote bundle contained:
  - `注册领取 7 天试用`;
  - `创建账户`;
  - `选择方案`;
  - `验证邮箱`;
  - `Starter Trial`;
  - `邮箱验证码`.
- Remote bundle did not contain `Google 登录`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Target assets were:
  - `assets/index-OkP9ATP7.js`;
  - `assets/index-bm1aCZAF.css`;
  - `assets/browser-CTN5lvTY.js`.
- `https://portal.gccwebos.com/portal/register/` referenced the new bundle.
- `https://portal.gccwebos.com/` referenced the same new bundle.
- Static assets returned `200`:
  - `assets/index-OkP9ATP7.js`;
  - `assets/index-bm1aCZAF.css`;
  - `assets/browser-CTN5lvTY.js`.
- Live bundle contained:
  - `注册领取 7 天试用`;
  - `创建账户`;
  - `选择方案`;
  - `验证邮箱`;
  - `Starter Trial`;
  - `邮箱验证码`.
- Live bundle did not contain `Google 登录`.
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

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260702-004-var-www-globalcircle-portal-20260702T132901Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
