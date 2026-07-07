# Admin Language Pack Frontend Current Activation

Date: 2026-07-01

Risk: A

Target: `vul1/gccgw-vultr-candidate`

Host: `admin.gccwebos.com`

Artifact: `admin-preview-20260701-010`

SHA-256: `A52590B9FDC8B5A14ABCC1120B41FA42D83ADE1FE69F58106862EBAB864C4FB0`

## Scope

Approved and executed:

- Verified staged artifact SHA-256 and static file hashes.
- Updated `admin-preview/current` from `admin-preview-20260701-009` to
  `admin-preview-20260701-010`.
- Ran `nginx -t`.

No DNS change, firewall change, backend change, env change, service restart,
token output, or customer data dump was performed.

## Validation

- `admin-preview/current` resolved to `admin-preview-20260701-010`.
- `proxy-gateway-candidate.service` remained active.
- `nginx` remained active.
- `nginx -t` passed.
- `admin.gccwebos.com` returned `200` for the Admin shell.
- The served Admin shell referenced the new main bundle
  `index-T9UfgoJS.js`.
- The served Admin shell no longer referenced the previous main bundle
  `index-D1ciKohh.js`.
- No-session `https://admin.gccwebos.com/api/admin/platform/accounts`
  returned `401`.
- `https://admin.gccwebos.com/api/admin-auth/session` returned `200`.
- `https://gccwebos.com/api/admin/platform/accounts` returned `404`.

## Rollback

If rollback is required, restore:

`/opt/proxy-gateway-minimal-candidate/admin-preview/current`

to:

`/opt/proxy-gateway-minimal-candidate/admin-preview/releases/admin-preview-20260701-009`

Then run `nginx -t`. Reload Nginx only if required after the test passes.
