# Portal Entitlement Artifact Production Activation

Date: 2026-07-07 UTC

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `portal-entitlement-artifact-20260706-213654`

## Approval

Approved scope:

- upload and verify backend overlay with two files:
  - `server/routes/user-portal.mjs`;
  - `server/services/platform/portal-access-requests.mjs`;
- upload and verify `portal-dist`;
- back up the current two backend files and `/var/www/globalcircle-portal`;
- replace the two backend files;
- restart `proxy-gateway-candidate.service`;
- replace `/var/www/globalcircle-portal`;
- do not update `admin-preview/current`;
- do not change DNS, Nginx, firewall, environment files, or SQLite schema;
- use the current backup rollback approach.

## Artifact Hashes

- `portal-entitlement-artifact-20260706-213654-backend-overlay.zip`
  - SHA256: `D7FC999CC0D288DAFCB34D97B4D6136E7A4C6998323F5B69C699207920E3E701`
- `portal-entitlement-artifact-20260706-213654-portal-dist.zip`
  - SHA256: `8144EB70A63F081F628CBA1A7DE6DA6E3CE34CBF02F66D2030BD4CF61CBFF6DF`

## Local Validation

- `npm test`: passed, 905 tests.
- `npm run admin:test`: passed, 35 files / 378 tests.
- `npm run admin:portal:build`: passed.
- `npm run admin:portal:verify`: passed with 9 files, no Admin shell markers,
  no secret material, and portal human challenge contract present.
- `git diff --check`: exit code 0 with Windows LF/CRLF working-copy warnings
  only.
- Backend overlay package contained exactly the intended backend files.
- Portal package contained 9 files from `admin/dist-portal`.

## Preflight

- Target host reported `gccgw-vultr-candidate`.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `nginx -t`: passed.
- Existing `/var/www/globalcircle-portal` contained 9 files.
- `admin-preview/current` resolved to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`.
- Auto-issuance environment keys existed; values were not read or recorded.
- Uploaded remote hashes matched the local artifact hashes.

## Execution

Created remote release:

`/opt/proxy-gateway-minimal-candidate/releases/portal-entitlement-artifact-20260706-213654`

Created backup:

`/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-artifact-20260706-213654-20260707T044049Z`

Backed up:

- current `server/routes/user-portal.mjs`;
- current `server/services/platform/portal-access-requests.mjs`;
- current `/var/www/globalcircle-portal`;
- current `admin-preview/current` symlink target for evidence only.

Applied:

- installed `server/routes/user-portal.mjs` as `root:root` mode `0644`;
- installed `server/services/platform/portal-access-requests.mjs` as
  `root:root` mode `0644`;
- ran `node --check` on both deployed backend files;
- restarted `proxy-gateway-candidate.service`;
- replaced `/var/www/globalcircle-portal` from staged `portal-dist`.

No Admin preview update, DNS change, Nginx config change, firewall change,
environment file change, SQLite schema change, subscription URL output, token
output, credential output, or customer-data dump was performed.

## Validation

Remote validation:

- `proxy-gateway-candidate.service`: active after restart.
- `nginx`: active.
- `nginx -t`: passed.
- `admin-preview/current` still resolved to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`.
- `/var/www/globalcircle-portal` contained 9 files.
- Portal static bundle contained `/api/portal/password/session`.
- Portal static bundle contained `accountEntitlements`.
- Portal static bundle did not contain Admin markers:
  `VITE_ADMIN_CONSOLE_TOKEN`, `AdminLayout`, or `Portal Requests`.
- Deployed `server/routes/user-portal.mjs` contained the paid entitlement
  setup gate and client-supplied entitlement stripping logic.
- Deployed `server/services/platform/portal-access-requests.mjs` contained
  entitlement ownership validation and reusable pending-request delivery logic.
- Recent `proxy-gateway-candidate.service` journal had no matching deployment
  error lines.

Deployed backend file SHA256:

- `server/routes/user-portal.mjs`:
  `e4acb14119ccb341a1acf1b625cabb374fdf2878fd7291eb93178e61344f70fb`
- `server/services/platform/portal-access-requests.mjs`:
  `69c81730e07e2b081bdbaf4c53f0c87f955f66cee6f1b858dd1e69b6f76f4053`

Public HTTP checks:

- `https://portal.gccwebos.com/`: 200.
- `https://portal.gccwebos.com/portal`: 200.
- `https://portal.gccwebos.com/portal/register/`: 200.
- `https://portal.gccwebos.com/guide/clash-subscription-import.png`: 200.
- `https://portal.gccwebos.com/guide/clash-system-proxy.png`: 200.
- `POST https://portal.gccwebos.com/api/portal/human-challenges`: 201.
- `https://portal.gccwebos.com/api/portal/access-requests/current`: 401
  without a portal session.
- `https://portal.gccwebos.com/api/admin/status`: 404 publicly.

## Rollback

If rollback is required:

1. Restore `server/routes/user-portal.mjs` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-artifact-20260706-213654-20260707T044049Z/backend-overlay/server/routes/user-portal.mjs`.
2. Restore `server/services/platform/portal-access-requests.mjs` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-artifact-20260706-213654-20260707T044049Z/backend-overlay/server/services/platform/portal-access-requests.mjs`.
3. Restart `proxy-gateway-candidate.service`.
4. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-artifact-20260706-213654-20260707T044049Z/var-www-globalcircle-portal`.
5. Run `nginx -t`.
6. Do not reload Nginx unless a separate Nginx configuration change is made.
7. Do not update `admin-preview/current`; it was intentionally left unchanged.
