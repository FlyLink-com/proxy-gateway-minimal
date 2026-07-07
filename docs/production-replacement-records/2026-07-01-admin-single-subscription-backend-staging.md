# Admin Single-Subscription Backend Candidate Staging

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `admin-backend-candidate-20260701-005`

SHA-256: `DC0416CBA44B49D0F551038E6B8831D423BCEE108F108A386EE857C3A8671121`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260701-005`

No `current` symlink change, Nginx change, systemd change, DNS change, firewall
change, env change, service restart, public Admin exposure, token output, or
customer data dump was performed.

## Purpose

Candidate `005` adds backend policy enforcement for portal-created accounts:
new portal registrations are marked as single-subscription accounts, and the
portal access request service rejects additional subscription requests for
accounts carrying that policy. Existing accounts without the policy marker are
not retroactively limited by this candidate.

## Validation

- Local artifact SHA-256 matched the approved value before upload.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote manifest was present after extraction.
- Required overlay files were present after extraction:
  - `backend-overlay/server/routes/user-portal.mjs`
  - `backend-overlay/server/services/platform/portal-access-requests.mjs`
  - `backend-overlay/server/services/platform/portal-registration.mjs`
  - `backend-overlay/server/state.mjs`
- `current` symlink remained unchanged and still resolved to the prior runtime
  release.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If staging needs to be reverted before activation, remove only:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260701-005`
