# Admin User Management Frontend Current Activation

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Artifact: `admin-preview-20260701-009`

SHA-256: `62E06EBF3DE2A5E2AE8495DC327BC2EE8318B7C564AD779FB0E032289381F37D`

## Scope

Approved and executed:

- Verified staged artifact SHA-256.
- Updated `admin-preview/current` from `admin-preview-20260701-008` to
  `admin-preview-20260701-009`.
- Ran `nginx -t`.

No DNS change, firewall change, backend overlay change, env change, service
restart, token output, or customer data dump was performed.

## Validation

- `admin-preview/current` resolved to `admin-preview-20260701-009`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `admin.gccwebos.com` served the Admin shell with the `009` asset marker.
- The main Admin bundle contained the User Management API error-state marker.
- No-session `/api/admin` request returned `401`.
- `/api/admin-auth/session` returned a safe unauthenticated response.
- Apex `/api/admin` request returned `404`.
- Subscription host `/api/admin` request returned `404`.
- Wrong Admin host returned `410` and did not serve the Admin shell.
- Public high ports checked for this activation did not expose HTTP service.

## Rollback

If rollback is required, restore:

`/opt/proxy-gateway-minimal-candidate/admin-preview/current`

to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-008`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
