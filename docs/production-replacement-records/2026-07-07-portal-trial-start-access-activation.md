# Portal Trial Start Access Activation

Date: 2026-07-07 UTC

Risk: A

## Scope

- Target: `vul1/gccgw-vultr-candidate`
- Release: `portal-trial-start-access-20260706-225341`
- Static portal:
  - `/var/www/globalcircle-portal`
- Not in scope:
  - Backend files
  - `proxy-gateway-candidate.service` restart
  - `admin-preview/current`
  - DNS, Nginx, firewall, env, SQLite schema
  - subscription URLs, tokens, credentials, customer data

## Reason

The user portal setup guide incorrectly required a traffic-quota plan before
entering the guide. Registration-created 7-day trial orders are active access
records, but their trial entitlement does not carry paid traffic quota, so the
frontend sent those users to the purchase modal instead of the setup guide.

## Change

The setup guide gate now allows setup when either condition is true:

- there is an active subscription/access request record; or
- there is a usable traffic entitlement.

Traffic quota displays still use the existing traffic-plan calculation, so the
trial path is allowed to start setup without being counted as a paid traffic
quota plan.

## Backup

- Backup directory:
  `/opt/proxy-gateway-minimal-candidate/backups/portal-trial-start-access-20260706-225341-20260707T055601Z`
- Backed up:
  - previous `/var/www/globalcircle-portal`

## Validation

Local validation before production mutation:

- `npm run admin:test -- user-portal.test.tsx`: 71 passed
- `npm run admin:test`: 35 files, 380 tests passed
- `npm run admin:portal:build`: passed
- `npm run admin:portal:verify`: passed
- `npm run admin:build`: passed, with existing Vite chunk-size warning
- `git diff --check` for touched portal files: exit 0, LF/CRLF warnings only

Remote validation after production mutation:

- Uploaded package SHA-256 matched locally and remotely.
- Staged portal assets were present and did not include test-only markers.
- `https://portal.gccwebos.com/`: HTTP 200.
- `https://portal.gccwebos.com/api/portal/access-requests/current` without a
  portal session: HTTP 401.
- Deployed assets:
  - `browser-Bpdo4wTk.js`
  - `index-BVwqYSau.js`
  - `index-C8cV34to.css`
- `proxy-gateway-candidate.service` PID and active-enter timestamp were
  unchanged, confirming no backend restart.
- `admin-preview/current` remained pointed at its existing release.
- Recent service journal check showed no matching error, exception, failed,
  uncaught, or syntax lines.

## Rollback

Use the backup directory above:

1. Replace `/var/www/globalcircle-portal` with the backed-up static directory.
2. Re-run the same public boundary checks.
3. Do not restart `proxy-gateway-candidate.service` unless a separate backend
   rollback is explicitly approved.
