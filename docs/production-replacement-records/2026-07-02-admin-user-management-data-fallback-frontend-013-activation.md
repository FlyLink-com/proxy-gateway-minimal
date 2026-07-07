# Admin User Management Data Fallback Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Artifact: `admin-preview-20260702-013`

SHA-256: `43ABF8D784502A33D02A47A57B4B2EC301922F697853BC34C489B1BA42D72730`

## Scope

Approved and executed:

- Built a protected Admin static artifact from the current local Admin UI.
- Uploaded and extracted the artifact to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-013`.
- Verified the remote archive SHA-256 and static file hashes.
- Updated `admin-preview/current` from `admin-preview-20260701-012` to
  `admin-preview-20260702-013`.
- Ran `nginx -t`.

No Vercel deployment, DNS change, Nginx config change, firewall change, backend
change, env change, service restart, token output, or customer data dump was
performed.

## Purpose

Candidate `013` publishes the Admin User Management data fallback fix:

- live User Management mode no longer falls back to synthetic fixture rows while
  protected account data is unresolved;
- unresolved live data now renders a loading state;
- failed live protected account reads render an API error state instead of
  `user_001` / `User Alpha` fixture data;
- fixture preview remains available only through the explicit preview flag or
  `#/fixture-preview` route.

## Validation

- Local Admin test suite passed: `npm run admin:test`.
- Local Admin build passed: `npm run admin:build`.
- Full repository server test suite passed: `npm test`.
- Diff whitespace check passed with only existing LF/CRLF working-copy warnings:
  `git diff --check`.
- Clean local non-fixture browser validation confirmed User Management did not
  render `Preview data`, `user_001`, or `User Alpha`; with no local backend
  listening it rendered the expected API unavailable state.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote `admin-dist` contained 6 static files.
- Remote static file SHA-256 values matched the local release manifest.
- Remote `admin-preview/current` resolved to
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-013`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://admin.gccwebos.com/?deploy=admin-preview-20260702-013` returned
  `200` and referenced `index-XkY1SWVf.js`.
- The previous served marker `index-3THlJRSm.js` was not present in the checked
  Admin shell response.
- No-session `https://admin.gccwebos.com/api/admin/platform/accounts` returned
  `401`.
- `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- Browser smoke on the deployed Admin URL showed the protected login page and
  no fixture banner or `user_001` / `User Alpha` fixture rows.
- Remote source host listeners for Admin control ports remained loopback-bound.
  Local HTTP checks against high ports returned proxy-path `502` responses due
  to local fake-IP/TUN resolution, not source host public listeners.

## Rollback

If rollback is required, restore:

`/opt/proxy-gateway-minimal-candidate/admin-preview/current`

to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-012`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
