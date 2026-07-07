# Admin User Management Portal-Backed Backend Candidate Staging

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `admin-backend-candidate-20260701-004`

SHA-256: `E6103EFD77938B969F43F3B968126A7B027E1CB5487995FA51B1787B40C7467E`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260701-004`

No `current` symlink change, Nginx change, systemd change, DNS change, firewall
change, env change, service restart, public Admin exposure, token output, or
customer data dump was performed.

## Root Cause

Admin User Management was reading broad `platform_accounts` rows. User portal
accounts are portal-backed accounts evidenced by portal credentials, entries,
sessions, or portal access requests. Candidate `004` adds a portal-backed user
account query and wires Admin User Management to that safer source.

## Validation

- Local artifact SHA-256 matched the approved value before upload.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote manifest was present after extraction.
- Required overlay files were present after extraction:
  - `backend-overlay/server/services/platform/account-entitlement-shell.mjs`
  - `backend-overlay/server/services/platform/subscription-control-db.mjs`
  - `backend-overlay/server/tests/platform-subscription-control-db.test.mjs`
- `current` symlink remained unchanged and still resolved to the prior runtime
  release.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.

## Rollback

If staging needs to be reverted before activation, remove only:

`/opt/proxy-gateway-minimal-candidate/backend-candidates/releases/admin-backend-candidate-20260701-004`
