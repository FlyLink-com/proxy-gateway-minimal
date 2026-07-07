# Admin Single-Subscription Backend Overlay Activation

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `admin-backend-candidate-20260701-005`

SHA-256: `DC0416CBA44B49D0F551038E6B8831D423BCEE108F108A386EE857C3A8671121`

Backup:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/backups/admin-backend-candidate-20260701-005-activation-20260701T131200Z`

## Scope

Approved and executed:

- Backed up the current release files that would be overwritten.
- Applied `backend-overlay` files into
  `/opt/proxy-gateway-minimal-candidate/current`.
- Preserved existing runtime data, environment files, secrets, and protected
  runtime material.
- Ran `systemctl daemon-reload`.
- Restarted `proxy-gateway-candidate.service`.

No DB migration, DNS change, firewall change, Nginx config change, env change,
token output, or customer data dump was performed.

## Purpose

This activation enforces the single-subscription policy for future
portal-created accounts. New portal registrations carry a one-subscription
limit marker, and protected portal access request handling rejects additional
subscription requests for accounts with that marker. Existing accounts without
the marker are not retroactively changed by this activation.

## Validation

- Staged archive SHA-256 matched the approved value.
- Backup directory was created and contained 7 pre-overwrite files.
- Current release overlay file hashes matched the staged overlay file hashes.
- `proxy-gateway-candidate.service` was active after restart.
- `nginx` remained active.
- `nginx -t` passed.
- Local backend `/api/admin-auth/session` returned a safe structured response.
- No-session `/api/admin/platform/accounts` returned locked status.
- `admin.gccwebos.com` served the current Admin shell.
- `admin.gccwebos.com/api/admin/platform/accounts` returned locked status
  without an Admin session.
- Apex and subscription hosts still returned `404` for the Admin platform API.
- The disabled wrong host still did not serve Admin and returned `410`.
- Public high ports `3456`, `5174`, `5175`, `18180`, and `1080` were closed
  or blocked from the local client.

## Rollback

If rollback is required, restore the backed-up files from the backup directory,
run `systemctl daemon-reload`, restart `proxy-gateway-candidate.service`, run
`nginx -t`, and revoke Admin sessions if any were created after activation.
The staged artifact remains available for audit and does not need removal for
rollback.
