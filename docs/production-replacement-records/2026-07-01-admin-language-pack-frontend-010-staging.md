# Admin Language Pack Frontend Artifact Staging

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `admin-preview-20260701-010`

SHA-256: `A52590B9FDC8B5A14ABCC1120B41FA42D83ADE1FE69F58106862EBAB864C4FB0`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-010`

No `current` symlink change was performed during staging. No Nginx change,
systemd change, DNS change, firewall change, env change, backend change, token
output, or customer data dump was performed.

## Purpose

Candidate `010` publishes the current Admin frontend candidate, including the
Admin shell language-pack work and the latest protected Admin UI fixes already
validated locally.

## Validation

- Local Admin tests passed: `npm run admin:test`.
- Local Admin build passed: `npm run admin:build`.
- Full repository test suite passed: `npm test`.
- Diff whitespace check passed: `git diff --check origin/master...HEAD`.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote `manifest.json` was stored beside the release archive.
- `admin-dist/index.html` was present after extraction.
- `admin-dist/assets` was present and contained the expected built assets.
- Remote static file SHA-256 values matched the local release manifest.
- `admin-dist` contained 6 static files.

## Rollback

If staging needs to be removed, delete only:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-010`
