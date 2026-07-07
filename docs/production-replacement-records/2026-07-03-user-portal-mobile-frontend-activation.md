# User Portal Mobile Frontend Activation

Date: 2026-07-03 America/Los_Angeles / 2026-07-03 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-preview-20260703-009`

SHA-256:
`A8BCB7B6D6E354C2EAC1E93453628ECFD181CEEF693E60F50F0000759AF5BAFB`

## Scope

Approved by operator instruction and executed as a portal-only static frontend
update:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-preview-20260703-009`.
- Uploaded and extracted the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260703-009`.
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

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-009-var-www-globalcircle-portal-20260703T120154Z`

## Purpose

This activation publishes the mobile User Portal frontend update:

- mobile header and brand treatment aligned with the current User Portal shell;
- compact mobile bottom navigation for the primary five user workflows;
- mobile order table uses card labels and keeps status tabs within the viewport;
- mobile purchase modal and client download cards remain within the 390px
  viewport;
- day and night theme mobile surfaces keep the current contrast and CTA rules.

## Validation

Local pre-activation validation:

- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- The immediately preceding local mobile UI validation passed:
  - `git diff --check` with Windows LF/CRLF working-copy warnings only;
  - `npm run admin:test -- src/test/user-portal.test.tsx`: 57 tests;
  - `npm run admin:build`;
  - `npm run admin:test`: 358 tests;
  - `npm test`: 885 server tests;
  - browser mobile audit at 390x844 found no horizontal overflow across
    dashboard, orders, usage, clients, profile/security, support, and purchase
    modal.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` contained 5 files.
- Latest prior user portal release observed:
  `user-portal-preview-20260703-008`.
- Current target assets before activation:
  - `assets/index-BwpO3gtR.js`;
  - `assets/index-DjoBnXAs.css`;
  - `assets/browser-CQAjTDT8.js`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html` and `portal-dist/assets`.
- Remote release contained 5 files.
- Remote assets were:
  - `assets/index-C70pnlK_.js`;
  - `assets/index-DuYEwNC3.css`;
  - `assets/browser-CzHs3OBY.js`.
- Remote bundle/style contained:
  - `portal-v2-mobile-brand`;
  - `grid-template-columns:repeat(5,minmax(0,1fr))`;
  - `portal-v2-download-link`;
  - `#cffafe`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Target assets were:
  - `assets/index-C70pnlK_.js`;
  - `assets/index-DuYEwNC3.css`;
  - `assets/browser-CzHs3OBY.js`;
  - `favicon.svg`.
- `https://portal.gccwebos.com/` returned `200` and referenced the new bundle.
- `https://portal.gccwebos.com/portal/` returned `200` and referenced the new
  bundle.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- Static assets returned `200`.
- Live bundle/style contained:
  - `portal-v2-mobile-brand`;
  - `grid-template-columns:repeat(5,minmax(0,1fr))`;
  - `portal-v2-download-link`;
  - `#cffafe`.
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
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-preview-20260703-009-var-www-globalcircle-portal-20260703T120154Z`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
