# Portal Disabled History Limit Activation

Date: 2026-07-07 UTC

Risk: A

## Scope

- Target: `vul1/gccgw-vultr-candidate`
- Release: `portal-disabled-history-limit-20260706-223210`
- Backend overlay:
  - `server/services/platform/portal-access-requests.mjs`
- Static portal:
  - `/var/www/globalcircle-portal`
- Not in scope:
  - DNS, Nginx, firewall, env, SQLite schema
  - `admin-preview/current`
  - subscription URLs, tokens, credentials, customer data

## Reason

User portal setup requests returned `409 subscription_limit_exceeded` for
single-subscription accounts that only had disabled historical access records.
The production account entitlement data was present, but the disabled history
was counted as an active subscription slot before a new yearly entitlement-backed
request could be created.

## Change

The portal access request limit now counts only occupying states:

- `pending_admin_review`
- `approved_pending_delivery`
- `delivered`
- `issued`

Disabled history no longer blocks a new setup request when a valid paid
entitlement exists.

The static portal was also replaced with the verified `portal-dist` build that
contains the current entitlement display and setup error visibility fixes.

## Backup

- Backup directory:
  `/opt/proxy-gateway-minimal-candidate/backups/portal-disabled-history-limit-20260706-223210-20260707T053827Z`
- Backed up:
  - previous `server/services/platform/portal-access-requests.mjs`
  - previous `/var/www/globalcircle-portal`

## Validation

Local validation before production mutation:

- `node --test --test-name-pattern "disabled history" server/tests/platform-portal-access-requests.test.mjs`: passed
- `node --test server/tests/platform-portal-access-requests.test.mjs server/tests/portal-access-request-routes.test.mjs server/tests/user-portal-routes.test.mjs`: 58 passed
- `npm test`: 906 passed
- `npm run admin:test`: 35 files, 379 tests passed
- `npm run admin:build`: passed, with existing Vite chunk-size warning
- `npm run admin:portal:build`: passed
- `npm run admin:portal:verify`: passed
- `git diff --check`: exit 0, LF/CRLF warnings only

Remote validation after production mutation:

- Uploaded package SHA-256 matched locally and remotely.
- Staged backend passed `node --check`.
- `proxy-gateway-candidate.service`: active after restart.
- `https://portal.gccwebos.com/`: HTTP 200.
- `https://portal.gccwebos.com/api/portal/access-requests/current` without a portal session: HTTP 401.
- Deployed backend contains `OCCUPYING_SUBSCRIPTION_STATUSES`.
- Deployed portal asset contains the current-entitlement marker.
- `admin-preview/current` remained pointed at its existing release.
- Recent service journal check showed no matching error, exception, failed,
  uncaught, syntax, or portal access request error lines.

## Rollback

Use the backup directory above:

1. Restore the backed-up backend file to
   `/opt/proxy-gateway-minimal-candidate/current/server/services/platform/portal-access-requests.mjs`.
2. Replace `/var/www/globalcircle-portal` with the backed-up static directory.
3. Restart `proxy-gateway-candidate.service`.
4. Re-run the same public boundary checks.
