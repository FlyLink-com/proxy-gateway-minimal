# Portal Static Entry Fix Activation

Date: 2026-07-07 UTC

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `portal-static-entry-fix-20260706-210424`

## Reason

The previous portal static replacement used the full Admin build output for
`/var/www/globalcircle-portal`. That package exposed the wrong frontend entry
for the user portal. This fix replaces the user portal static directory with
the Portal-only build output from `admin/dist-portal`.

## Approval

Approved scope:

- only replace `/var/www/globalcircle-portal` with `portal-dist`;
- do not change backend files;
- do not restart `proxy-gateway-candidate.service`;
- do not update `admin-preview/current`;
- do not change DNS, Nginx, firewall, environment files, or SQLite schema;
- back up the current incorrect static directory before replacement.

## Artifact

- `portal-static-entry-fix-20260706-210424-portal-dist.zip`
  - SHA256: `C6E226FB713C072B5482ADCED845EE7365BB936EB6C38900C2AC43FF2BA69022`
  - source files: 9

Local validation:

- `npm run admin:portal:build`: passed.
- `npm run admin:portal:verify`: passed.
- Portal-only build contained `/api/portal/password/session` and
  `accountEntitlements`.
- Portal-only build had no Admin shell marker and no secret marker.

## Preflight

- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- Existing `/var/www/globalcircle-portal` contained 10 files.
- Existing portal static assets contained an Admin build environment marker.
- Existing portal static assets contained `accountEntitlements`.
- Remote uploaded zip SHA256 matched the local artifact hash.

## Execution

Created remote release:

`/opt/proxy-gateway-minimal-candidate/releases/portal-static-entry-fix-20260706-210424`

Created backup:

`/opt/proxy-gateway-minimal-candidate/backups/portal-static-entry-fix-20260706-210424-20260707T040638Z-var-www-globalcircle-portal`

Replaced `/var/www/globalcircle-portal` from the staged `portal-dist`.

No backend file was changed. `proxy-gateway-candidate.service` was not
restarted. `admin-preview/current` was not changed. No DNS, Nginx config,
firewall, environment file, or SQLite schema change was made.

Note: the first replacement shell script completed the backup and static
replacement steps but exited non-zero on a final marker-check quoting issue.
All post-deployment validation below was then run independently.

## Validation

- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `nginx -t`: passed.
- Backup directory exists and contains 10 files.
- `/var/www/globalcircle-portal` contains 9 files:
  - `assets/browser-Dbugg7pd.js`;
  - `assets/index-C8cV34to.css`;
  - `assets/index-T7IDFril.js`;
  - `favicon.svg`;
  - `guide/clash-subscription-import.png`;
  - `guide/clash-system-proxy.png`;
  - `index.html`;
  - `payment-alipay-icon.png`;
  - `payment-wechat-pay-icon.svg`.
- Deployed portal assets contain `/api/portal/password/session`.
- Deployed portal assets contain `accountEntitlements`.
- Deployed portal assets contain no Admin marker:
  `VITE_ADMIN_CONSOLE_TOKEN`, `AdminLayout`, or `Portal Requests`.

HTTP checks:

- `https://portal.gccwebos.com/`: 200.
- `https://portal.gccwebos.com/portal`: 200.
- `https://portal.gccwebos.com/portal/register/`: 200.
- `POST https://portal.gccwebos.com/api/portal/human-challenges`: 201.
- `https://portal.gccwebos.com/api/portal/access-requests/current`: 401 without a portal session.
- `https://portal.gccwebos.com/api/admin/status`: 404 publicly.

## Rollback

If rollback is required:

1. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-static-entry-fix-20260706-210424-20260707T040638Z-var-www-globalcircle-portal`.
2. Run `nginx -t`.
3. Do not restart `proxy-gateway-candidate.service` unless a separate backend
   change is made.
4. Do not update `admin-preview/current` unless separately approved.
