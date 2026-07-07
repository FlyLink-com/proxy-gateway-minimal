# Portal Entitlement Gate Production Activation

Date: 2026-07-07 UTC

Target: `vul1/gccgw-vultr-candidate`

Artifact: `portal-entitlement-gate-20260706-205145`

## Approval

Approved scope:

- apply `backend-overlay/server/routes/user-portal.mjs` only;
- restart `proxy-gateway-candidate.service`;
- replace `/var/www/globalcircle-portal`;
- update `/opt/proxy-gateway-minimal-candidate/admin-preview/current`;
- do not change DNS, Nginx, firewall, environment files, or SQLite schema;
- use the current backup rollback approach.

## Artifact Hashes

- `portal-entitlement-gate-20260706-205145-backend-overlay.zip`
  - SHA256: `C7D6D3970035EB8391B76BE6D8DCAA2A09935EE3BBA82CB80603AE7107F45C5B`
- `portal-entitlement-gate-20260706-205145-portal-dist.zip`
  - SHA256: `37508C51B7698D0B6CFA4473188614C2846F6F0D5816ADBA2CBAFFC3FB343554`
- `portal-entitlement-gate-20260706-205145-admin-dist.zip`
  - SHA256: `1922A6234DDEFE6F43CC91643D3ED6FED8359E2E78AD605C36DE6B1971691BAB`

## Preflight

- Remote host resolved as `gccgw-vultr-candidate`.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `nginx -t`: passed.
- Previous traffic quota backup directory existed.
- `/var/www/globalcircle-portal`: existed.
- Remote upload hashes matched the local artifact hashes.

## Execution

Created remote release:

`/opt/proxy-gateway-minimal-candidate/releases/portal-entitlement-gate-20260706-205145`

Created backup:

`/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-gate-20260706-205145-20260707T035629Z`

Backed up:

- current `server/routes/user-portal.mjs`;
- current `/var/www/globalcircle-portal`;
- previous `admin-preview/current` symlink target.

Applied:

- installed the new `server/routes/user-portal.mjs` as `root:root` mode `0644`;
- ran `node --check` on the deployed route file;
- restarted `proxy-gateway-candidate.service`;
- replaced `/var/www/globalcircle-portal` from staged `portal-dist`;
- created Admin preview release:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`;
- switched `admin-preview/current` to the new release.

No DNS, Nginx config, firewall, environment file, or SQLite schema change was made.

## Validation

- `proxy-gateway-candidate.service`: active after restart.
- `nginx -t`: passed after deployment.
- Remote backend file SHA256:
  `d996076c553c3af5a9a8d66062af13eff043534a31af6fef3697951a012d0b30`.
- Deployed backend route includes `accountEntitlements` and `listEntitlements`.
- `/var/www/globalcircle-portal` contains 10 files.
- Portal static bundle includes `accountEntitlements`.
- Admin preview static bundle includes `accountEntitlements`.
- `admin-preview/current` resolves to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/portal-entitlement-gate-20260706-205145`.

HTTP checks:

- `https://portal.gccwebos.com/`: 200.
- `https://portal.gccwebos.com/portal`: 200.
- `https://portal.gccwebos.com/api/portal/access-requests/current`: 401 without a portal session.
- `https://portal.gccwebos.com/api/admin/status`: 404 publicly.

Recent service journal showed the expected restart and listener startup. No
deployment-time service failure was observed.

## Rollback

If rollback is required:

1. Restore `server/routes/user-portal.mjs` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-gate-20260706-205145-20260707T035629Z/backend-overlay/server/routes/user-portal.mjs`.
2. Restart `proxy-gateway-candidate.service`.
3. Restore `/var/www/globalcircle-portal` from:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-gate-20260706-205145-20260707T035629Z/var-www-globalcircle-portal`.
4. Restore `admin-preview/current` to the path recorded in:
   `/opt/proxy-gateway-minimal-candidate/backups/portal-entitlement-gate-20260706-205145-20260707T035629Z/admin-preview-current-target.txt`.
5. Run `nginx -t`.
6. Do not reload Nginx unless a separate Nginx configuration change is made.
