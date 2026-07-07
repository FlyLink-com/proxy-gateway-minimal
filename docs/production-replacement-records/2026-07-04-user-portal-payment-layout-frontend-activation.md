# User Portal Payment Layout Frontend Activation

Date: 2026-07-04 America/Los_Angeles / 2026-07-04 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `user-portal-payment-layout-20260704-001`

SHA-256:
`0adacb79755ca9f0be9b7b77fe3ac7eec28071234b32ed5c1598f20d58bda857`

## Scope

Approved by operator instruction to start production update and executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated the local artifact and manifest under
  `.codex-artifacts/user-portal-payment-layout-20260704-001`.
- Uploaded and extracted the static artifact to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-payment-layout-20260704-001`.
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

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-payment-layout-20260704-001-20260704T115515Z-var-www-globalcircle-portal`

## Purpose

This activation publishes the User Portal payment layout cleanup:

- removes the large payment provider image block from the payment view;
- keeps the payment view as a compact payment page rather than nested cards;
- moves the expiry countdown under the QR code area;
- moves supported wallets under the order summary panel;
- uses local Alipay and WeChat Pay icon assets for the supported wallets;
- keeps the checkout UI scoped to the authenticated user portal shell.

## Validation

Local pre-activation validation:

- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:test` passed: 35 files, 362 tests.
- `git diff --check` passed with Windows LF/CRLF working-copy warnings only.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` was present with 5 files.
- Current target assets before activation:
  - `assets/browser-Dpl4lPM5.js`;
  - `assets/index--D01cje8.css`;
  - `assets/index-iABoH9hz.js`;
  - `favicon.svg`;
  - `index.html`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded archive SHA-256 matched the local approved value.
- Remote release contained `portal-dist/index.html`, `portal-dist/assets`,
  `portal-dist/payment-alipay-icon.png`, and
  `portal-dist/payment-wechat-pay-icon.svg`.
- Remote release contained 7 files.
- Remote assets were:
  - `assets/browser-OuyY87mV.js`;
  - `assets/index-C2dLZuvr.css`;
  - `assets/index-DbaQlVPe.js`;
  - `favicon.svg`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`;
  - `index.html`.

Post-activation validation:

- `/var/www/globalcircle-portal` contained 7 files after replacement.
- Target assets were:
  - `assets/browser-OuyY87mV.js`;
  - `assets/index-C2dLZuvr.css`;
  - `assets/index-DbaQlVPe.js`;
  - `favicon.svg`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`;
  - `index.html`.
- `https://portal.gccwebos.com/` returned `200`.
- `https://portal.gccwebos.com/portal/` returned `200`.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- Static assets returned `200`.
- Live bundle/style contained:
  - `portal-payment-expiry-qr`;
  - `portal-payment-summary-wallets`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`.
- Live bundle did not contain the removed payment provider image markers:
  - `portal-payment-provider-logo`;
  - `alipay-plus-payment`.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If rollback is required, restore `/var/www/globalcircle-portal` from:

`/opt/proxy-gateway-minimal-candidate/backups/user-portal-payment-layout-20260704-001-20260704T115515Z-var-www-globalcircle-portal`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
