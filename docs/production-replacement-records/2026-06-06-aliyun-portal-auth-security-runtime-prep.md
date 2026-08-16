# 2026-06-06 Aliyun Portal Auth Security Runtime Prep


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_portal_auth_security_runtime_prep
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


## Scope

- Risk: A
- Status: prepared locally, not deployed
- Candidate release: `portal-auth-security-runtime-20260606-0145`
- Artifact:
  `.codex-artifacts/proxy-gateway-portal-auth-security-runtime-20260606-0145.zip`
- Artifact SHA-256:
  `CF4D48E2A008D8357C5683C7888A8AD0D8170D32061516348AB6B3D65A7CE657`

## Root Cause

The deployed portal static bundle already calls the session-scoped security
endpoints used by the authenticator flow:

- `GET /api/portal/security/current`
- `POST /api/portal/security/totp/enrollment`
- `POST /api/portal/security/totp/enrollment/confirm`

The current Aliyun candidate runtime exposes password login and second-factor
completion, but the security endpoints are not routed through the user portal
adapter. They are therefore blocked before the portal session can be used.

## Local Fix

- Added the security endpoints to the user-portal public path allowlist.
- Added session-scoped security state, TOTP enrollment start, and TOTP
  enrollment confirm methods to the user portal auth service.
- Added user-portal routes for the security endpoints.
- Kept TOTP enrollment pending state in process memory until confirmation; the
  durable TOTP credential is written only after a valid 6-digit TOTP code is
  verified.
- Did not add schema changes or external dependencies.

## Validation

- Targeted backend tests:
  `node --test server/tests/user-portal-routes.test.mjs server/tests/platform-user-portal-auth.test.mjs server/tests/state.test.mjs`
  passed, 27/27.
- Full server test suite: `npm test` passed, 616/616.
- Clean candidate validation:
  `node --test server/tests/user-portal-routes.test.mjs server/tests/platform-user-portal-auth.test.mjs server/tests/state.test.mjs server/tests/platform-portal-totp-verifier.test.mjs`
  passed, 29/29.
- Candidate zip does not contain `node_modules`.

## Production Gate

Deploy requires a separate explicit approval for Aliyun candidate runtime only.
The expected production validation is:

- health ok
- portal static ok
- Admin blocked
- security routes no longer return console-auth `Unauthorized`
- missing/invalid portal session returns `invalid_session`
- password + authenticator second-factor flow reaches the user center
- no live order creation

Rollback is restoring the current candidate runtime release and restarting only
`proxy-gateway-candidate.service`.
