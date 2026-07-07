# Admin User Management Backend Overlay Activation - 2026-07-01

## Scope

- Risk: A
- Target: `vul1/gccgw-vultr-candidate`
- Artifact: `admin-backend-candidate-20260701-003`
- SHA256: `5F280930A6AD80794034395ED30A4E19CEEC06B1CA41D4F8A45D7445B383CDFB`
- Purpose: activate the Admin User Management persistent control-store wiring so the protected Admin user page reads and mutates safe account summaries from the existing control database instead of an in-process temporary shell.

## Actions Performed

- Verified the staged backend candidate and required overlay files.
- Backed up the current release files that would be overwritten.
- Applied these backend overlay files into `/opt/proxy-gateway-minimal-candidate/current`:
  - `server/state.mjs`
  - `server/services/platform/account-entitlement-shell.mjs`
  - `server/services/platform/subscription-control-db.mjs`
- Ran `systemctl daemon-reload`.
- Restarted `proxy-gateway-candidate.service`.

No DNS, firewall, Nginx config, DB migration, runtime env, token, secret, subscription URL, or customer-data action was performed.

## Validation

- Current release overlay file hashes match the staged candidate.
- `proxy-gateway-candidate.service`: active.
- `nginx`: active.
- `nginx -t`: ok.
- `https://admin.gccwebos.com/`: 200.
- `https://admin.gccwebos.com/api/admin-auth/session`: safe unauthenticated response.
- No-session `https://admin.gccwebos.com/api/admin/platform/accounts`: 401 locked.
- `https://gccwebos.com/api/admin/platform/accounts`: 404.
- `https://sub.gccwebos.com/api/admin/platform/accounts`: 404.
- `https://admin.globalcirclecat.cloud/`: 410.
- Public high ports checked on `admin.gccwebos.com`: `3456`, `5174`, `5175`, `18180`, and `1080` closed.

## Rollback

Rollback remains available by restoring the backed-up current release files from the activation backup directory, running `systemctl daemon-reload`, restarting `proxy-gateway-candidate.service`, and confirming `nginx -t`.

The staged artifact was kept.
