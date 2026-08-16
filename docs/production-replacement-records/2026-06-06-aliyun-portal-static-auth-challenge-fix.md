# 2026-06-06 Aliyun Portal Static Auth Challenge Fix


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_portal_static_auth_challenge_fix
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


## Scope

- Risk: A
- Target: `/var/www/globalcircle-portal` only
- Static release: `auth-challenge-fix-20260606-0125-6fc9314e`
- Previous static release: `ui-order-session-fix-20260604-2341-93694756`
- Artifact:
  `.codex-artifacts/globalcircle-portal-static-auth-challenge-fix-20260606-0125.zip`
- Artifact SHA-256:
  `6FC9314EB1789BC44E430223D1A8D88C66485D514060C70D9D15F15F5A8DD65B`

## Guardrails

- Backend runtime: no mutation, no restart.
- Nginx: no config mutation; `nginx -t` validation only; no reload.
- Mihomo: no config mutation; no start/restart.
- No DNS, firewall/security group, payment, account/password generation,
  live order creation, passkey enablement, token/password/subscription URL
  output, SQLite row dump, `sub.globalcirclecat.com` behavior change, `ss-sg`
  change, or AWS mutation.

## Root Cause

The backend runtime had been upgraded to require backend-issued portal human
challenge references. The deployed portal static bundle was still the older
June 4 static release and could keep the login form on a local math challenge
fallback path. A correct visible answer could therefore submit a challenge that
the backend did not recognize, producing `human_verification_failed`.

## Execution

1. Rebuilt the portal-only static bundle from `admin/dist-portal`.
2. Verified the portal build with `verify:portal-build`.
3. Uploaded the approved static artifact to the Aliyun host.
4. Verified the artifact SHA-256 on the host.
5. Backed up the current static release under
   `/var/www/globalcircle-portal/backups`.
6. Extracted the new static release under
   `/var/www/globalcircle-portal/releases`.
7. Atomically switched `/var/www/globalcircle-portal/current` to the new
   release.

## Validation

- Current static release: `auth-challenge-fix-20260606-0125-6fc9314e`
- `proxy-gateway-candidate.service`: active; not restarted
- `mihomo-tuic.service`: active; not restarted
- `nginx -t`: ok
- `https://portal.globalcirclecat.com/`: 200
- `https://sub.globalcirclecat.com/api/health`: 200
- Portal-host Admin API boundary check: 404
- Served portal JS asset: `index-DV7wi1DE.js`
- Served JS contains `/api/portal/human-challenges`
- Served JS contains `/api/portal/password/session`
- Served JS contains the login pending-challenge gate
- Served JS no longer has the page-local challenge fallback submit path
- `POST /api/portal/human-challenges`: 201
- Password probe with a backend-issued challenge and non-real credentials:
  `invalid_login`, not `human_verification_failed`
- Live order creation: not called

## Rollback

Rollback is available by restoring `/var/www/globalcircle-portal/current` to
`ui-order-session-fix-20260604-2341-93694756` or by restoring the predeploy
backup created under `/var/www/globalcircle-portal/backups`.
