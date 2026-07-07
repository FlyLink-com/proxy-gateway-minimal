# Admin User Management Frontend Artifact Staging

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Artifact: `admin-preview-20260701-009`

SHA-256: `62E06EBF3DE2A5E2AE8495DC327BC2EE8318B7C564AD779FB0E032289381F37D`

## Scope

Approved and executed upload/extract only to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-009`

No `current` symlink change, Nginx change, systemd change, DNS change, firewall
change, env change, backend change, public Admin exposure, token output, or
customer data dump was performed.

## Purpose

Candidate `009` updates the protected Admin frontend so User Management reports
an authenticated API failure as an explicit page state instead of rendering an
empty user list. The candidate keeps lifecycle controls gated when account data
is unavailable.

## Validation

- Local artifact SHA-256 matched the approved value before upload.
- Remote uploaded archive SHA-256 matched the approved value.
- Remote manifest was present after extraction.
- `admin-dist/index.html` was present after extraction.
- `admin-dist/assets` was present and contained built assets.
- `admin-preview/current` remained unchanged and still resolved to
  `admin-preview-20260701-008`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- No-session Admin API request returned `401`.
- Apex `/api/admin` request returned `404`.
- Subscription host `/api/admin` request returned `404`.

## Rollback

If staging needs to be reverted before activation, remove only:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-009`
