# Portal Entitlement UI Selection Production Activation

Date: 2026-07-07 UTC

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `portal-entitlement-ui-select-20260706-220000`

## Approval

Approved scope:

- upload and verify `portal-dist`;
- back up and replace `/var/www/globalcircle-portal`;
- do not change backend files;
- do not restart `proxy-gateway-candidate.service`;
- do not update `admin-preview/current`;
- do not change DNS, Nginx, firewall, environment files, or SQLite schema;
- use the current backup rollback approach.

## Artifact Hash

- `portal-entitlement-ui-select-20260706-220000-portal-dist.zip`
  - SHA256: `230F6BC328887F80870FE8259FBC395D593D74AAFEE6CBE393FE44F4835861E1`

## Local Validation

- `npm run admin:test -- user-portal.test.tsx`: passed, 70 tests.
- `npm run admin:test`: passed, 35 files / 379 tests.
- `npm run admin:build`: passed.
- `npm test`: passed, 905 tests.
- `git diff --check`: exit code 0 with Windows LF/CRLF working-copy warnings only.
- `npm run admin:portal:build`: passed.
- `npm run admin:portal:verify`: passed with 9 files, no Admin shell markers,
  no secret material, and portal human challenge contract present.
- In-app browser local render check: portal page loaded without console warnings
  or errors; no-plan setup remained gated by the purchase modal.

## Preflight

- Target host reported `gccgw-vultr-candidate`.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `nginx -t`: passed.
- Existing `/var/www/globalcircle-portal` contained 9 files.
- `admin-preview/current` resolved to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`.
- Public HTTP checks before replacement:
  - `https://portal.gccwebos.com/`: 200.
  - `https://portal.gccwebos.com/portal`: 200.
  - `https://portal.gccwebos.com/portal/register/`: 200.
  - `https://portal.gccwebos.com/guide/clash-subscription-import.png`: 200.
  - `https://portal.gccwebos.com/guide/clash-system-proxy.png`: 200.
  - `https://portal.gccwebos.com/api/portal/access-requests/current`: 401
    without a portal session.
  - `https://portal.gccwebos.com/api/admin/status`: 404 publicly.
- Uploaded remote SHA256 matched the local artifact hash.

## Execution

Created remote release:

`/opt/proxy-gateway-minimal-candidate/releases/portal-entitlement-ui-select-20260706-220000`

Staged package:

`/opt/proxy-gateway-minimal-candidate/releases/portal-entitlement-ui-select-20260706-220000/portal-dist`

Created backup:

`/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-ui-select-20260706-220000-20260707T050453Z`

Backed up:

- current `/var/www/globalcircle-portal`.

Applied:

- replaced `/var/www/globalcircle-portal` from staged `portal-dist`;
- kept `proxy-gateway-candidate.service` running without restart;
- kept `admin-preview/current` unchanged.

No backend file change, backend restart, Admin preview update, DNS change,
Nginx configuration change, firewall change, environment file change, SQLite
schema change, subscription URL output, token output, credential output, or
customer-data dump was performed.

## Validation

Remote validation:

- `proxy-gateway-candidate.service`: active after static replacement.
- `nginx`: active.
- `nginx -t`: passed.
- `admin-preview/current` still resolved to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`.
- `/var/www/globalcircle-portal` contained 9 files.
- Deployed assets:
  - `index-jGCN2W96.js`;
  - `browser-kpyOHcKM.js`;
  - `index-C8cV34to.css`.
- Portal static bundle contained `/api/portal/password/session`.
- Portal static bundle contained `accountEntitlements`.
- Portal static bundle did not contain Admin markers:
  `VITE_ADMIN_CONSOLE_TOKEN`, `AdminLayout`, or `Portal Requests`.
- Portal static bundle did not contain configured secret-material markers.
- Recent `proxy-gateway-candidate.service` journal had no matching error lines.

Public HTTP checks after replacement:

- `https://portal.gccwebos.com/`: 200.
- `https://portal.gccwebos.com/portal`: 200.
- `https://portal.gccwebos.com/portal/register/`: 200.
- `https://portal.gccwebos.com/guide/clash-subscription-import.png`: 200.
- `https://portal.gccwebos.com/guide/clash-system-proxy.png`: 200.
- `https://portal.gccwebos.com/api/portal/access-requests/current`: 401
  without a portal session.
- `https://portal.gccwebos.com/api/admin/status`: 404 publicly.
- `https://portal.gccwebos.com/assets/index-jGCN2W96.js`: 200.
- `https://portal.gccwebos.com/assets/browser-kpyOHcKM.js`: 200.
- `https://portal.gccwebos.com/assets/index-C8cV34to.css`: 200.

## Rollback

If rollback is required:

1. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-ui-select-20260706-220000-20260707T050453Z/var-www-globalcircle-portal`.
2. Run `nginx -t`.
3. Do not restart `proxy-gateway-candidate.service`; this activation did not
   change backend files.
4. Do not update `admin-preview/current`; it was intentionally left unchanged.
