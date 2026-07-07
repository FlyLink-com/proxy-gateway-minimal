# Admin User Management Actions Frontend Activation

Date: 2026-07-01 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Artifact: `admin-preview-20260701-012`

SHA-256: `114E96B974314FDDDF060659E455F7BBCB523D721CFFDFA520B12F91F65D4264`

## Scope

Approved and executed:

- Built a protected Admin static artifact from the current local Admin UI.
- Uploaded and extracted the artifact to:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-012`.
- Verified the remote archive SHA-256 and static file hashes.
- Updated `admin-preview/current` from `admin-preview-20260701-011` to
  `admin-preview-20260701-012`.
- Ran `nginx -t`.

No Vercel deployment, DNS change, Nginx config change, firewall change, backend
change, env change, service restart, token output, or customer data dump was
performed.

## Purpose

Candidate `012` publishes the Admin User Management action cleanup:

- the selected-account action area now exposes `Edit` and `Delete` only;
- the standalone `Disable` action is removed;
- disabled/suspended account state remains available through the `Edit` form's
  `Status` field.

## Validation

- Local targeted Admin tests passed:
  `npm run admin:test -- --run src/test/admin-safe-read-page.test.tsx src/test/admin-style-contract.test.ts`.
- Local Admin test suite passed: `npm run admin:test`.
- Local Admin build passed: `npm run admin:build`.
- Full repository server test suite passed: `npm test`.
- Diff whitespace check passed: `git diff --check origin/master...HEAD`.
- Local fixture browser validation confirmed the Account Actions buttons were
  `Edit` and `Delete`, with no standalone `Disable` button.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote `admin-dist` contained 6 static files.
- Remote `admin-preview/current` resolved to
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-012`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://admin.gccwebos.com/?deploy=admin-preview-20260701-012` returned
  `200` and referenced `index-3THlJRSm.js`.
- The previous served marker `index-tgW_KHKX.js` was not present in the checked
  Admin shell response.
- No-session `https://admin.gccwebos.com/api/admin/platform/accounts` returned
  `401`.
- `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.

## Rollback

If rollback is required, restore:

`/opt/proxy-gateway-minimal-candidate/admin-preview/current`

to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-011`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
