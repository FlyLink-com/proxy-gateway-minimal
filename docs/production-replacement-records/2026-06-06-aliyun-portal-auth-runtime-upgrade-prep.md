# Aliyun Portal Auth Runtime Upgrade Prep


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_portal_auth_runtime_upgrade_prep
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


Date: 2026-06-06 Asia/Shanghai.

Risk tier: A.

## Problem

The portal static UI was newer than the Aliyun candidate runtime. The runtime
release `ae68072d727b` did not include the complete portal authentication stack,
so login preflight requests were blocked by console auth and returned
`Unauthorized`.

## Local Fix Boundary

The prepared candidate is a minimal backend runtime overlay on base commit
`ae68072d727bf7da4698701837832e5d15c0ad71`.

Included backend scope:

- portal public path allowlist for login preflight routes
- portal human challenge route and service
- portal password session route and credential service
- portal password second-factor route
- runtime `state.mjs` wiring for env-gated user portal auth
- server-side TOTP verifier for `enc:<base32>` credentials
- portal support request service required by current route imports

Excluded scope:

- no DNS, Nginx, firewall, payment, account/password generation, subscription
  URL/token/password output, SQLite row dump, or Mihomo config mutation
- no live order creation
- no public Admin exposure

## Candidate Artifact

- release: `portal-auth-runtime-20260606-001`
- artifact:
  `.codex-artifacts/proxy-gateway-portal-auth-runtime-20260606-001.zip`
- archive sha256:
  `52A6703A2C6E07C5AB870D40CB997565A0F235138C8035F09BFD1B26C2804496`
- artifact excludes `node_modules` and local runtime state.

## Validation

Local dirty-tree validation:

- `node --test server/tests/platform-portal-totp-verifier.test.mjs server/tests/state.test.mjs`
  passed
- `node --test server/tests/user-portal-routes.test.mjs server/tests/platform-user-portal-auth.test.mjs`
  passed
- `npm test` passed with 615 server tests

Clean candidate validation:

- candidate staging was created from `git archive HEAD` plus the reviewed backend
  overlay only
- `npm rebuild better-sqlite3` completed after `npm ci --ignore-scripts`
  skipped native binding build
- targeted portal auth/state tests passed
- `npm test` passed with 594 server tests
- zip inspection confirmed required backend files are present and
  `node_modules` is excluded

Aliyun read-only preflight:

- current release: `ae68072d727b`
- proxy service: active
- portal runtime env keys needed for portal auth and edge lifecycle are present
- control DB exists with portal account, password, TOTP, session, and challenge
  tables present
- visible test account metadata shows active account, active password credential,
  and active TOTP credential without exposing secret material
- health: 200
- portal static: 200
- public Admin route: blocked

## Production Gate

Deployment still requires exact operator approval before uploading or switching
the Aliyun candidate runtime.
