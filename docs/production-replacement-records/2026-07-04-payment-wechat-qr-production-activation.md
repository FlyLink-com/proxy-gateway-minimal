# Payment WeChat QR Production Activation

Date: 2026-07-04 America/Los_Angeles / 2026-07-04 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `payment-wechat-qr-candidate-20260704-001`

Backend SHA-256:
`B274FB966789302FB9DD10C45EBF5B487E6CCEF961683A483B9B00BAF270310B`

Portal SHA-256:
`A026695CFC10D13E8391FC5F1B881C5AEA8A66EA1CA43275FC972C8356DBE5E7`

## Scope

Approved by operator instruction to start production update and executed:

- Built and verified the portal-only static bundle from `admin/dist-portal`.
- Generated local candidate artifacts under
  `.codex-artifacts/payment-wechat-qr-candidate-20260704-001`.
- Uploaded and extracted the candidate artifacts to
  `/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/payment-wechat-qr-candidate-20260704-001`.
- Verified the uploaded archive SHA-256 values before extraction.
- Applied a backend overlay for
  `server/services/platform/niuniu-pay-adapter.mjs`.
- Restarted `proxy-gateway-candidate.service`.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from staged
  `portal-dist` only.

No DNS change, Nginx config change, firewall change, env/key change, SQLite
schema change, live checkout creation, webhook simulation, token output,
subscription material output, or customer data dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/payment-wechat-qr-candidate-20260704-001-20260704T132922Z`

Backed up:

- `server/services/platform/niuniu-pay-adapter.mjs`
- `/var/www/globalcircle-portal`

## Purpose

This activation publishes the WeChat payment chain fix:

- the Niuniu Pay adapter now preserves common WeChat QR fields including
  `code_url`, `qr_url`, and `url_scheme`;
- the User Portal no longer renders a fake WeChat QR code from a hosted
  checkout URL;
- if a WeChat checkout returns only a hosted URL on desktop, the portal shows a
  user-facing fallback instead of a non-scannable QR code;
- the latest payment page layout and local Alipay/WeChat Pay icon assets remain
  published in the portal bundle.

## Validation

Local pre-activation validation:

- `node --test server/tests/platform-niuniu-pay-adapter.test.mjs server/tests/platform-portal-payment-orders.test.mjs server/tests/portal-payment-routes.test.mjs server/tests/platform-payment-routes.test.mjs` passed.
- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed with:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:test` passed: 35 files, 363 tests.
- `npm test` passed: 889 tests.
- `git diff --check` for relevant files passed with Windows LF/CRLF warnings
  only.

Read-only production inventory before activation:

- Target host reported `gccgw-vultr-candidate`.
- Existing `/var/www/globalcircle-portal` was present with 7 files.
- Current target assets before activation:
  - `assets/browser-OuyY87mV.js`;
  - `assets/index-C2dLZuvr.css`;
  - `assets/index-DbaQlVPe.js`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.

Remote staging validation:

- Uploaded backend archive SHA-256 matched the local approved value.
- Uploaded portal archive SHA-256 matched the local approved value.
- Remote backend release contained one overlay file.
- Remote portal release contained 7 files:
  - `assets/browser-O_UMV0qL.js`;
  - `assets/index-BlUwObeL.css`;
  - `assets/index-Bf28XNSD.js`;
  - `favicon.svg`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`;
  - `index.html`.

Post-activation validation:

- `proxy-gateway-candidate.service` remained active after restart.
- `nginx` remained active.
- `nginx -t` passed.
- Current backend file contained the `code_url`, `qr_url`, and `url_scheme`
  mapping markers.
- `/var/www/globalcircle-portal` contained 7 files after replacement.
- `https://portal.gccwebos.com/` returned `200`.
- `https://portal.gccwebos.com/portal/` returned `200`.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- Static assets returned `200`.
- `POST https://portal.gccwebos.com/api/portal/human-challenges` returned
  `201`.
- Unauthenticated
  `POST https://portal.gccwebos.com/api/portal/payments/checkout` returned
  `401`.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - `https://gccwebos.com/api/admin` returned `404`.
- Live portal assets contained:
  - `wxpay`;
  - `WeChat Pay has not returned`;
  - `微信支付暂未返回`;
  - `portal-payment-summary-wallets`.
- Live CSS did not contain `font-weight:750`.

## Rollback

If rollback is required:

1. Restore the backend overlay file from:
   `/opt/proxy-gateway-minimal-candidate/backups/payment-wechat-qr-candidate-20260704-001-20260704T132922Z/backend-overlay/server/services/platform/niuniu-pay-adapter.mjs`
2. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/payment-wechat-qr-candidate-20260704-001-20260704T132922Z/var-www-globalcircle-portal`
3. Run `systemctl daemon-reload`.
4. Restart `proxy-gateway-candidate.service`.
5. Run `nginx -t`.
