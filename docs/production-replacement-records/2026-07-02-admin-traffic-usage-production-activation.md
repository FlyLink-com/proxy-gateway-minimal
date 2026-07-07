# Admin Traffic Usage Production Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Backend overlay artifact: `admin-traffic-usage-20260702-016-backend-overlay.zip`

Backend overlay SHA-256:
`3E13DCCAA7743E522890707C4989A7DA5394AD1A3909F1739771B5B87B69FD3D`

Admin static artifact: `admin-traffic-usage-20260702-016-admin-dist.zip`

Admin static SHA-256:
`137C895399CC725CE09597652EF48D1D47E609F17B17C48360A8A20A3F90D58E`

Admin release: `admin-preview-20260702-016`

## Approval

The operator approved Admin production traffic usage activation with:

- `target=vul1/gccgw-vultr-candidate`
- `scope=backend overlay for subscription usage userAggregates + protected Admin static artifact`
- service restart allowed
- `admin-preview/current` symlink update allowed
- no DNS, Nginx config, firewall, or SQLite schema change
- no token or customer data output
- rollback by restoring the backend backup and previous `admin-preview/current`

## Scope

Executed:

- Uploaded the reviewed backend overlay and Admin static artifact to
  `/opt/proxy-gateway-minimal-candidate/backend-candidates/admin-traffic-usage-20260702-016/`.
- Backed up the existing backend file before overlay replacement.
- Replaced only:
  `/opt/proxy-gateway-minimal-candidate/current/server/services/platform/subscription-usage-monitor.mjs`.
- Installed the protected Admin static release at:
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-016/admin-dist/`.
- Updated `admin-preview/current` to `admin-preview-20260702-016`.
- Restarted `proxy-gateway-candidate.service`.

Not executed:

- No DNS change.
- No Nginx config change.
- No firewall change.
- No SQLite schema change.
- No Vercel deployment.
- No token, credential, subscription URL, customer row, or raw usage row output.

## Notes

The first Admin static activation placed files at the release root instead of
the expected `admin-dist/` subdirectory, causing the protected Admin shell to
return `500`. The Admin symlink was restored to `admin-preview-20260702-015`,
the `016` release was rebuilt with the expected `admin-dist/` layout, and the
symlink was then updated back to `admin-preview-20260702-016`.

## Validation

Local validation before activation:

- `node --test server/tests/platform-subscription-usage-monitor.test.mjs`
  passed.
- `npm run test --prefix admin -- --run src/test/subscription-usage-monitor.test.tsx src/test/admin-safe-read-projection.test.ts`
  passed.
- `npm run admin:build` passed.
- `npm run admin:test` passed.
- `npm test` passed.
- `git diff --check` returned exit code `0` with only existing line-ending
  warnings in the broader dirty worktree.

Remote validation after activation:

- `admin-preview/current` resolves to
  `/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-016`.
- Backend overlay contains the `userAggregates` path.
- `proxy-gateway-candidate.service` is active.
- `nginx` is active.
- `nginx -t` passed.
- Remote file SHA-256:
  - Admin `index.html`:
    `b3f7caeb932adc76837d2fc3f6a106978e804d4f2f2fc2ec66a1ffac3e2df154`
  - Admin JS `assets/index-CkC_AK9v.js`:
    `7a6dc2a34fa43befed5e21f9ccd21e9ea4cf77cc0dfc20182320acb395ab4caa`
  - Backend overlay file:
    `b9ef36ce5fc469ce1811843462904fed436d5b00e85990ece6e5fe2b18cfee24`
- `https://admin.gccwebos.com/?deploy=admin-preview-20260702-016`
  returned `200`.
- `https://admin.gccwebos.com/assets/index-CkC_AK9v.js` returned `200`.
- Served JS contains the expected user-aggregate markers:
  `userAggregates`,
  `Live user traffic ledger aggregated from order measurements`,
  `User/account · safe ref`, and
  `Order count · measured / pending`.
- Served JS no longer contains the older account/order ledger markers:
  `Account/order traffic ledger` or
  `Live account and order traffic ledger`.
- Unauthenticated
  `https://admin.gccwebos.com/api/admin/platform/subscription-usage-monitor`
  returned `401`.
- Unauthenticated
  `https://admin.gccwebos.com/api/admin/platform/node-bandwidth`
  returned `401`.
- `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `https://gccwebos.com/api/admin/platform/subscription-usage-monitor`
  returned `404`.

Authenticated Admin payload rows were not printed or inspected in this record.
The production Admin session gateway rejects direct Bearer access to
`/api/admin`, so payload shape validation remains limited to local automated
tests, remote file hashes, served JS markers, and protected-route boundary
checks unless an operator provides a valid Admin session for a redacted browser
smoke.

## Rollback

Backend backup:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/backups/admin-traffic-usage-20260702-016-activation-20260702T080350Z`

Previous Admin static release:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260702-015`

Rollback sequence:

1. Restore the backed-up
   `server/services/platform/subscription-usage-monitor.mjs` into
   `/opt/proxy-gateway-minimal-candidate/current/`.
2. Update `/opt/proxy-gateway-minimal-candidate/admin-preview/current` back to
   `admin-preview-20260702-015`.
3. Run `nginx -t`.
4. Restart `proxy-gateway-candidate.service`.
5. Recheck protected Admin shell `200`, protected Admin API unauthenticated
   `401`, and service active state.
