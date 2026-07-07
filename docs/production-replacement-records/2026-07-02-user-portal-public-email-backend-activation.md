# User Portal Public Email Backend Overlay Activation

Date: 2026-07-02 America/Los_Angeles / 2026-07-02 UTC.

Risk: A.

Target: `vul1/gccgw-vultr-candidate`

Backend artifact: `admin-backend-candidate-20260702-009`

Backend SHA-256:
`F5443AB58C951970FCE24E2D24ADAD355FF9E8D64063A73D31E30B7CB048857C`

## Scope

Approved and executed:

- Verified the staged backend archive SHA-256.
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

`/opt/proxy-gateway-minimal-candidate/backups/admin-backend-candidate-20260702-009-current-overlay-20260702T135144Z`

Backup summary:

- overwritten files backed up: 11
- new overlay files: 0

## Purpose

This activation applies the backend side of the User Portal public identity
contract:

- user-facing portal session summaries use the login email as `userRef`;
- registration/session flows do not expose internal backend account ids to the
  User Portal UI;
- password login can resolve email-login accounts through stored safe metadata;
- portal registration, email verification, and resend adapter dependencies stay
  present in the active runtime overlay.

## Validation

- Staged backend archive SHA-256 matched the approved value.
- Backup directory was created.
- Current release overlay files matched staged overlay file hashes.
- `proxy-gateway-candidate.service` was active after restart.
- `nginx` remained active.
- `nginx -t` passed.
- Local `http://127.0.0.1:3456/api/admin-auth/session` returned `200` with a
  safe unauthenticated response and no token/secret/password/credential markers.
- Local `http://127.0.0.1:3456/api/admin/platform/accounts` returned `401`
  without an Admin session.
- Public Admin routes stayed blocked:
  - `https://portal.gccwebos.com/api/admin` returned `404`
  - `https://gccwebos.com/api/admin` returned `404`
- Protected Admin route stayed session-gated:
  - `https://admin.gccwebos.com/api/admin/platform/accounts` returned `401`
    without a session.
- Remote targeted tests passed from the active current release:

  `node --test server/tests/portal-registration-routes.test.mjs server/tests/user-portal-routes.test.mjs server/tests/platform-user-portal-auth.test.mjs server/tests/state.test.mjs server/tests/resend-registration-email-sender.test.mjs`

  Result: 59 passed, 0 failed.

## Rollback

If rollback is required, restore the backed-up files from:

`/opt/proxy-gateway-minimal-candidate/backups/admin-backend-candidate-20260702-009-current-overlay-20260702T135144Z/files`

Then run:

1. `systemctl daemon-reload`
2. `systemctl restart proxy-gateway-candidate.service`
3. `nginx -t`

Revoke Admin or Portal sessions if any were created during validation. Keep the
staged artifact unless a separate cleanup approval removes it.
