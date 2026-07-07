# Admin Static User Management And Order Records UI Activation

Date: 2026-07-05 America/Los_Angeles / 2026-07-05 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Release: `admin-preview-20260705-018`

Artifact: `admin-preview-20260705-018-admin-dist.zip`

SHA-256:
`5052D538AD643471F310D19509CECA88A0539EA9D65B8DFC74866B589ABBC381`

Previous Admin static release:
`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/payment-order-admin-candidate-20260703-001-admin`

## Approval

The operator approved Admin production static activation with:

- target `vul1/gccgw-vultr-candidate`;
- host `admin.gccwebos.com`;
- release `admin-preview-20260705-018`;
- scope: protected Admin static artifact only for User Management and Order
  Records UI;
- upload release and update `admin-preview/current` symlink allowed;
- no backend change, no service restart, no DNS change, no Nginx config change,
  no firewall change, no SQLite schema change, no Vercel deployment;
- no token or customer-data output;
- rollback by restoring the previous `admin-preview/current`.

## Scope

Executed:

- Verified the local Admin static artifact hash.
- Uploaded the static artifact to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018-admin-dist.zip`.
- Verified the remote artifact SHA-256 matched the approved value.
- Extracted the release into:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018/admin-dist/`.
- Updated `/opt/proxy-gateway-minimal-candidate/admin-preview/current` to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018`.

Not executed:

- No backend overlay.
- No service restart.
- No DNS change.
- No Nginx config change.
- No firewall change.
- No SQLite schema change.
- No Vercel deployment.
- No token, credential, subscription URL, raw config/log/env, SQLite row, or
  customer-data output.

## Validation

Local pre-activation validation:

- `git diff --check origin/master...HEAD` passed.
- `npm run admin:test` passed: 35 files, 369 tests.
- `npm run admin:build` passed.
- `npm test` was intentionally not used as an approval signal for backend
  deployment because it failed 4 existing edge lifecycle / host adapter tests
  in `server/tests/state.test.mjs`. This activation did not deploy backend
  changes.

Read-only production inventory before activation:

- Existing `admin-preview/current` resolved to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/payment-order-admin-candidate-20260703-001-admin`.
- `proxy-gateway-candidate.service` was active.
- `nginx` was active.
- `nginx -t` passed.
- `https://admin.gccwebos.com/?deploy=preflight-20260705-order-records`
  returned `200`.
- Unauthenticated `https://admin.gccwebos.com/api/admin/platform/accounts`
  returned `401`.
- `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.

Post-activation validation:

- `admin-preview/current` resolves to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://admin.gccwebos.com/?deploy=admin-preview-20260705-018`
  returned `200`.
- Static assets returned `200`:
  - `/assets/index-Cf9q2pFq.js`;
  - `/assets/index-B_hKSihu.css`;
  - `/payment-alipay-icon.png`;
  - `/payment-wechat-pay-icon.svg`.
- Served Admin JS contained the expected UI markers:
  `Order Records`, `订单记录`, `User Management`, and `用户管理`.
- Unauthenticated Admin API remained gated:
  `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`.
- Admin session endpoint remained reachable:
  `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- Public non-Admin hosts remained isolated:
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - `https://gccwebos.com/api/admin/platform/accounts` returned `404`.

## Rollback

If rollback is required, restore the previous Admin static symlink:

```bash
ln -sfn /opt/proxy-gateway-minimal-candidate/admin-preview/releases/payment-order-admin-candidate-20260703-001-admin \
  /opt/proxy-gateway-minimal-candidate/admin-preview/current.next
mv -Tf /opt/proxy-gateway-minimal-candidate/admin-preview/current.next \
  /opt/proxy-gateway-minimal-candidate/admin-preview/current
nginx -t
```

No service restart should be required for this static-only rollback.
