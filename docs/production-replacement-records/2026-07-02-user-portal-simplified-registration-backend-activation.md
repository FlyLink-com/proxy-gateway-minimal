# User Portal Simplified Registration Backend Overlay Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Backend artifact: `admin-backend-candidate-20260702-007`

Backend SHA-256: `79E475CE02FF7764EE2C13DF9BA98EEB8776838F9C892F0358CAB142AF668307`

## Scope

Approved and executed:

- Verified staged backend archive SHA-256.
- Backed up current release files that would be overwritten.
- Applied `backend-overlay` files into:

  `/opt/proxy-gateway-minimal-candidate/current`

- Kept existing runtime data, environment, and secrets untouched.
- Ran `systemctl daemon-reload`.
- Restarted `proxy-gateway-candidate.service`.

No DB migration, DNS change, firewall change, Nginx config change, env change,
token output, or customer data dump was performed.

## Backup

Backup directory:

`/opt/proxy-gateway-minimal-candidate/backups/admin-backend-candidate-20260702-007-current-overlay-20260702T092144Z`

Backup summary:

- overwritten files backed up: 10
- new overlay files: 0

## Purpose

This activation applies the backend needed for the simplified User Portal
self-registration flow:

- email-login account creation;
- email verification before registration;
- password session creation after registration;
- 7-day trial creation;
- duplicate-email trial blocking;
- source-based registration abuse throttling;
- email-verification send throttling by source and submitted email;
- single-subscription policy for self-registered users.

## Validation

- Staged backend archive SHA-256 matched the approved value.
- Backup directory was created.
- Current release overlay files matched the staged overlay for key files:
  - `server/app.mjs`
  - `server/routes/user-portal.mjs`
  - `server/services/platform/portal-registration.mjs`
  - `server/services/platform/portal-registration-email-verification.mjs`
  - `server/services/platform/user-portal-auth.mjs`
  - `server/state.mjs`
- `proxy-gateway-candidate.service` was active after restart.
- `nginx` remained active.
- `nginx -t` passed.
- Local `http://127.0.0.1:3456/api/admin-auth/session` returned a safe
  session response.
- Local `http://127.0.0.1:3456/api/admin/platform/accounts` returned `401`
  without an Admin session.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`
  - `https://portal.gccwebos.com/api/admin/platform/accounts` returned `404`
  - `https://gccwebos.com/api/admin` returned `404`
  - `https://gccwebos.com/api/admin/platform/accounts` returned `404`
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- Portal registration API rejected a registration submit without email
  verification and did not create an account.
- Remote targeted tests passed from the active current release:

  `node --test server/tests/portal-registration-routes.test.mjs server/tests/rate-limit.test.mjs server/tests/resend-registration-email-sender.test.mjs`

  Result: 17 passed, 0 failed.

During the activation command, a final diagnostic hash-print line failed because
the remote shell interpreted an `awk` field reference under `set -u`. The
overlay copy and service restart had already completed before that diagnostic
line. Independent follow-up validation confirmed file parity, service state,
Nginx state, API boundaries, and targeted tests.

## Rollback

If rollback is required, restore the backed-up files from:

`/opt/proxy-gateway-minimal-candidate/backups/admin-backend-candidate-20260702-007-current-overlay-20260702T092144Z/files`

Then run:

1. `systemctl daemon-reload`
2. `systemctl restart proxy-gateway-candidate.service`
3. `nginx -t`

Revoke Admin or Portal sessions if any were created during validation. Keep the
staged artifact unless a separate cleanup approval removes it.
