# Payment Mobile Redirect Production Activation

Date: 2026-07-03 America/Los_Angeles / 2026-07-03 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Backend artifact:
`payment-mobile-redirect-candidate-20260703-001-backend.zip`

Backend SHA-256:
`EA73376336B44D122C28BE9BFFBA4E047D10908F40BAAD10D484EA22D6945819`

Portal frontend artifact:
`payment-mobile-redirect-candidate-20260703-001-portal.zip`

Portal SHA-256:
`2B182FBD3E26A7538EFAF883A7AAFCB681BB191FF8789229A45964A6DB54E17C`

## Scope

Executed under explicit operator approval:

- Verified staged backend and Portal artifact SHA-256 values.
- Applied the backend overlay into
  `/opt/proxy-gateway-minimal-candidate/current`.
- Allowed only the existing store initialization path to perform the
  idempotent `platform_payment_orders.checkout_expires_at` schema alignment.
- Restarted `proxy-gateway-candidate.service` after `systemctl daemon-reload`.
- Backed up current `/var/www/globalcircle-portal`.
- Replaced `/var/www/globalcircle-portal` static contents from the staged
  `portal-dist` only.

No Nginx config change, DNS change, firewall change, env/key change, live
checkout initiated by Codex, webhook simulation, token output, subscription
material output, or customer data dump was performed.

## Backups

Backend overlay backup:

`/opt/proxy-gateway-minimal-candidate/backups/payment-mobile-redirect-backend-overlay-20260703T150650Z`

Portal static backup:

`/opt/proxy-gateway-minimal-candidate/backups/payment-mobile-redirect-portal-20260703T151154Z-var-www-globalcircle-portal`

## Purpose

This activation publishes the User Portal payment-flow correction:

- desktop payment checkout remains inside the Portal and shows the QR payment
  state;
- mobile payment checkout redirects to the provider checkout URL for wallet
  handoff;
- payment checkout expiry metadata is persisted as a safe order field.

## Validation

Backend activation validation:

- Staged backend archive SHA-256 matched the approved value.
- Backup directory was created before overlay application.
- 12 backend overlay files were applied.
- All staged overlay files matched the current release after application.
- `proxy-gateway-candidate.service` was active after restart.
- `nginx` was active.
- `nginx -t` passed.
- Local `/api/admin-auth/session` returned a safe unauthenticated response.
- No-session `/api/admin/platform/payments` returned `401`.
- Public `/api/admin` remained blocked on `portal.gccwebos.com` and
  `gccwebos.com` with `404`.

Portal activation validation:

- Staged Portal archive SHA-256 matched the approved value.
- Backup directory was created before static replacement.
- `/var/www/globalcircle-portal` contained 5 files after replacement.
- Live assets were:
  - `assets/browser-CeqEr7yJ.js`;
  - `assets/index-1R7irC4U.js`;
  - `assets/index--D01cje8.css`.
- `/var/www/globalcircle-portal` matched the staged `portal-dist`.
- `https://portal.gccwebos.com/` returned `200`.
- `https://portal.gccwebos.com/portal/` returned `200`.
- `https://portal.gccwebos.com/portal/register/` returned `200`.
- Static assets returned `200`.
- Live bundle contained the desktop QR payment state marker.
- Live bundle contained the provider redirect marker.
- Live bundle contained the mobile detection markers.
- `POST https://portal.gccwebos.com/api/portal/human-challenges` returned
  `201`.
- Unauthenticated payment checkout stayed locked with `401`.
- Public `/api/admin` remained blocked on `portal.gccwebos.com` and
  `gccwebos.com` with `404`.
- Protected Admin payment route remained session-gated with `401` without a
  session.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

Backend rollback:

1. Restore the current release files from
   `/opt/proxy-gateway-minimal-candidate/backups/payment-mobile-redirect-backend-overlay-20260703T150650Z`.
2. Run `systemctl daemon-reload`.
3. Restart `proxy-gateway-candidate.service`.
4. Run `nginx -t`.
5. Revoke Admin sessions if any were created during troubleshooting.

Portal rollback:

1. Restore `/var/www/globalcircle-portal` from
   `/opt/proxy-gateway-minimal-candidate/backups/payment-mobile-redirect-portal-20260703T151154Z-var-www-globalcircle-portal`.
2. Run `nginx -t`.
3. Reload Nginx only if required after the test passes.

The staged artifacts remain in place unless a separate cleanup approval removes
them.
