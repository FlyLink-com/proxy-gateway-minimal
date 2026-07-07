# User Portal Self-Registration Frontend Artifact Staging

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Artifact: `user-portal-preview-20260702-001`

SHA-256: `A44A7900F2EA74D78EACDB5815B7A3646ABD178FA53C556A8B2240824B6BB809`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-001`

No `current` symlink change, `/var/www/globalcircle-portal` replacement,
backend overlay change, Nginx change, systemd change, DNS change, firewall
change, env change, service restart, public Admin exposure, token output, or
customer data dump was performed.

## Purpose

Candidate `user-portal-preview-20260702-001` stages the User Portal static
bundle that keeps the existing account login panel and adds the local
self-service registration entry to `/portal/register/`.

The staged bundle includes:

- existing account/password login surface;
- `/portal/register` portal-only registration routing;
- two-step registration UI: email verification request first, then registration
  submission with a fresh human verification challenge;
- safe visible-once setup handoff UI after registration;
- no Admin shell.

## Validation

- Local artifact SHA-256 matched the approved value before upload.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote manifest was present after extraction.
- Remote `portal-dist/index.html` was present after extraction.
- Remote `portal-dist/assets` was present and contained 3 built assets.
- Existing `portal.gccwebos.com` static response remained unchanged and still
  referenced:
  - `assets/index-BIzKjn5V.js`
  - `assets/index--lFiIfc5.css`
- `user-portal-preview/current` was not created or changed.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `https://portal.gccwebos.com/api/admin` returned `404`.
- `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://gccwebos.com/api/admin` returned `404`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.
- `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
  without a session.

## Rollback

If staging needs to be reverted before activation, remove only:

`/opt/proxy-gateway-minimal-candidate/user-portal-preview/releases/user-portal-preview-20260702-001`
