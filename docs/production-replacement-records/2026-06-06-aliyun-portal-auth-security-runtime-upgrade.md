# 2026-06-06 Aliyun Portal Auth Security Runtime Upgrade

## Scope

- Risk: A
- Target: Aliyun candidate runtime only
- Release: `portal-auth-security-runtime-20260606-0145`
- Previous release: `portal-auth-runtime-20260606-001`
- Artifact:
  `.codex-artifacts/proxy-gateway-portal-auth-security-runtime-20260606-0145.zip`
- Artifact SHA-256:
  `CF4D48E2A008D8357C5683C7888A8AD0D8170D32061516348AB6B3D65A7CE657`

## Guardrails

- Runtime env: no mutation.
- Static portal files: no mutation.
- Nginx: no config mutation; `nginx -t` validation only; no reload.
- Mihomo: no config mutation; no start/restart.
- No DNS, firewall/security group, payment, account/password generation,
  live order creation, passkey enablement, token/password/subscription URL
  output, SQLite row dump, `sub.globalcirclecat.com` behavior change, `ss-sg`
  change, or AWS mutation.

## Root Cause

The portal static bundle already used session-scoped security endpoints for
authenticator state and TOTP enrollment, but the runtime did not expose those
user portal routes. The security endpoints were therefore blocked before the
portal session could be used.

## Execution

1. Verified the local artifact SHA-256.
2. Verified current Aliyun candidate release was
   `portal-auth-runtime-20260606-001`.
3. Uploaded the approved artifact to the Aliyun host.
4. Reverified artifact SHA-256 on the host.
5. Extracted the artifact into the candidate releases directory.
6. Installed production dependencies for the new release.
7. Ran syntax checks for the changed runtime entry files.
8. Atomically switched the candidate `current` symlink to
   `portal-auth-security-runtime-20260606-0145`.
9. Restarted `proxy-gateway-candidate.service` only.

## Validation

- Current release: `portal-auth-security-runtime-20260606-0145`
- `proxy-gateway-candidate.service`: active, result success
- `mihomo-tuic.service`: active; not restarted by this change
- `nginx -t`: ok
- `https://sub.globalcirclecat.com/api/health`: 200
- `https://portal.globalcirclecat.com/`: 200
- Portal-host Admin API boundary check: 404
- `GET /api/portal/security/current` without a portal session: 401
  `invalid_session`
- `POST /api/portal/security/totp/enrollment` without a portal session: 401
  `invalid_session`
- `POST /api/portal/security/totp/enrollment/confirm` without a portal
  session: 401 `invalid_session`
- `POST /api/portal/human-challenges`: 201, response shape ok
- Password probe with a backend-issued challenge and non-real credentials:
  401 `invalid_login`
- Live order creation: not called

## Rollback

Rollback remains available by restoring the candidate `current` symlink to
`portal-auth-runtime-20260606-001` and restarting
`proxy-gateway-candidate.service`.
