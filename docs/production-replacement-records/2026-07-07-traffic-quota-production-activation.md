# Traffic Quota Production Activation

Date: 2026-07-06 America/Los_Angeles / 2026-07-07 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `portal.gccwebos.com`

Artifact: `traffic-quota-20260706-202758`

## Scope

Approved by operator instruction and executed:

- uploaded and SHA-256 verified the approved backend, portal, and Admin static
  artifacts under the production staging directory;
- backed up the current backend overlay files, `/var/www/globalcircle-portal`,
  and the current Admin preview symlink target;
- replaced three backend platform service files in
  `/opt/proxy-gateway-minimal-candidate/current`;
- ran `systemctl daemon-reload` and restarted
  `proxy-gateway-candidate.service`;
- replaced `/var/www/globalcircle-portal` from the staged `portal-dist`;
- updated `/opt/proxy-gateway-minimal-candidate/admin-preview/current` to the
  staged Admin release.

No DNS change, Nginx config change, firewall change, environment change,
SQLite schema migration, payment-provider key change, live checkout, webhook
simulation, subscription material output, token output, or customer data dump
was performed.

## Artifacts

- `traffic-quota-20260706-202758-backend-overlay.zip`
  - SHA-256:
    `47407B13AF47FEC7AB0E8A374A93AC55EE9139A57CE9C967B8F71E8F319B0EDA`
- `traffic-quota-20260706-202758-portal-dist.zip`
  - SHA-256:
    `2AECC190278F7FCBAECA2E95F06DACCE02A8133FBF25F41A886A55260C8F6D5D`
- `traffic-quota-20260706-202758-admin-dist.zip`
  - SHA-256:
    `DF83E6F4CCF9447CE7EFBF931967D3453EBEA62D631811DC66794CB3F5BFABA2`

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/traffic-quota-20260706-202758-20260707T033148Z`

Backed up:

- 3 backend platform service files;
- 7 files from the previous `/var/www/globalcircle-portal`;
- previous Admin preview target:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018`.

## Validation

Local pre-activation validation:

- `npm run admin:portal:build` passed.
- `npm run admin:portal:verify` passed:
  - no Admin shell markers;
  - no secret material;
  - portal human challenge contract present.
- `npm run admin:build` passed with the existing Vite chunk-size warning.
- `npm run admin:test` passed: 35 files, 376 tests.
- `npm test` passed: 898 tests.
- `git diff --check` passed with Windows LF/CRLF working-copy warnings only.
- Local artifact scan found zero matches for legacy subscription-slot fields
  or wording in backend overlay, portal static, and Admin static outputs.

Read-only production inventory before activation:

- target host reported `gccgw-vultr-candidate`;
- current backend release:
  `/opt/proxy-gateway-minimal-candidate/releases/japan-sgp-vless-host-unify-20260622-001`;
- `proxy-gateway-candidate.service` was active;
- `nginx` was active;
- `nginx -t` passed;
- existing `/var/www/globalcircle-portal` contained 7 files;
- production backend still contained legacy subscription-slot references in
  two of the target files before overlay.

Post-activation validation:

- `proxy-gateway-candidate.service` is active.
- `nginx` is active.
- `nginx -t` passed.
- The three updated backend platform files have zero matches for
  `subscriptionSlots`, `quota.seats`, or `seats`.
- `/var/www/globalcircle-portal` contains 9 files:
  - `assets/browser-DNjjxodQ.js`;
  - `assets/index-C5cIl4Xp.js`;
  - `assets/index-C8cV34to.css`;
  - `favicon.svg`;
  - `guide/clash-subscription-import.png`;
  - `guide/clash-system-proxy.png`;
  - `index.html`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`.
- Admin preview current points to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/traffic-quota-20260706-202758`.
- Admin preview static contains 10 files and zero legacy subscription-slot
  matches.
- Public validation:
  - `https://portal.gccwebos.com/` returned `200`;
  - `https://portal.gccwebos.com/portal/` returned `200`;
  - `https://portal.gccwebos.com/portal/register/` returned `200`;
  - `https://portal.gccwebos.com/guide/clash-subscription-import.png`
    returned `200`;
  - `https://portal.gccwebos.com/guide/clash-system-proxy.png` returned `200`;
  - `https://portal.gccwebos.com/api/admin` returned `404`;
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`;
  - no-session
    `https://portal.gccwebos.com/api/portal/access-requests/current`
    returned `401`;
  - `POST https://portal.gccwebos.com/api/portal/human-challenges` returned
    `201`.
- Live portal bundle scan found zero legacy subscription-slot matches.

## Rollback

If rollback is required:

1. Restore the three backend platform files from:
   `/opt/proxy-gateway-minimal-candidate/backups/traffic-quota-20260706-202758-20260707T033148Z/backend-overlay`.
2. Run `systemctl daemon-reload`.
3. Restart `proxy-gateway-candidate.service`.
4. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/traffic-quota-20260706-202758-20260707T033148Z/var-www-globalcircle-portal`.
5. Restore Admin preview current to:
   `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260705-018`.
6. Run `nginx -t`.

Reload Nginx only if a later Nginx test or config change requires it.
