# Admin Production API Origin Hotfix Frontend Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Artifact: `admin-preview-20260702-015`

SHA-256: `DBF6F701802DF3D19B7F26C86E6AF66BED502EB54EA4ECB3EB6F6A6C499005E1`

## Scope

Approved admin frontend hotfix follow-up:

- Built a sanitized protected Admin static artifact from the current local Admin UI.
- Uploaded and extracted the artifact to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-015`.
- Updated `admin-preview/current` from `admin-preview-20260702-014` to
  `admin-preview-20260702-015`.
- Fixed the release directory mode to keep the static artifact readable by
  Nginx.

No Vercel deployment, DNS change, Nginx config change, firewall change, backend
change, env change, service restart, token output, or customer data dump was
performed.

## Purpose

Candidate `015` fixes the Admin User Management production data fetch failure
introduced by a frontend artifact built with local development `VITE_*`
configuration:

- production public hosts now default Admin API calls to same-origin, even if a
  local API base leaks into the build environment;
- production public hosts discard stored loopback API bases from browser
  `sessionStorage`, covering browsers that logged in while the faulty artifact
  was served;
- local inspection and development sessions keep their local API behavior.

## Validation

- Added failing Admin session tests for production public host API origin
  fallback and old stored loopback session cleanup.
- Targeted Admin session test passed:
  `npm run test --prefix admin -- --run src/test/subscriptions.test.ts`.
- Local Admin test suite passed: `npm run admin:test`.
- Local Admin build passed with sanitized frontend env:
  `VITE_ADMIN_API_BASE_URL=""` and `VITE_ADMIN_CONSOLE_TOKEN=""`.
- Built bundle scan found zero matches for local API bases and non-empty
  frontend Admin API/token env values.
- Full repository server test suite passed: `npm test`.
- Diff whitespace check passed with only existing LF/CRLF working-copy warnings:
  `git diff --check`.
- Remote uploaded archive SHA-256 matched the local artifact.
- Remote static file SHA-256 values matched the local release manifest.
- Remote `admin-preview/current` resolved to
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-015`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://admin.gccwebos.com/?deploy=admin-preview-20260702-015` returned
  `200` and referenced `index-DVaPJnjy.js`.
- The previously served `014` and `013` Admin JS markers were not present in
  the checked Admin shell response.
- Served `index-DVaPJnjy.js` scan found zero matches for local API bases and
  non-empty frontend Admin API/token env values.
- No-session `https://admin.gccwebos.com/api/admin/platform/accounts` returned
  `401`.
- `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- Browser smoke on the deployed Admin URL reached the protected login page;
  the current browser session was unauthenticated, so live table rows were not
  inspected from that browser session.

## Rollback

If rollback is required, restore:

`/opt/proxy-gateway-minimal-candidate/admin-preview/current`

to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-012`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
