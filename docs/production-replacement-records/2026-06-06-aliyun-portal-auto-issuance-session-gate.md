# 2026-06-06 Aliyun Portal Auto Issuance Session Gate


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_portal_auto_issuance_session_gate
  superseded_by: null
  last_verified_at: 2026-06-06
  production_authority: false
```


## Scope

- Risk: A
- Target: Aliyun candidate runtime only, plus the existing candidate runtime
  environment pointer for node config selection.
- Runtime release:
  `portal-auto-issuance-session-gate-20260606-0350`
- Previous runtime release:
  `portal-auto-issuance-20260606-0324`
- Static portal release remained:
  `portal-auto-issuance-20260606-0324`
- Runtime artifact:
  `.codex-artifacts/proxy-gateway-portal-auto-issuance-session-gate-20260606-0350.zip`
- Runtime artifact SHA-256:
  `BD8EFAD351BC0A80B2B858B78C2EB12A5A66493C7A2BF4B800747B9BCCC59168`

## Guardrails

- Restarted `proxy-gateway-candidate.service` only.
- Did not mutate DNS, Nginx config, firewall/security group, Mihomo config,
  account/password generation, payment, passkey settings, or public Admin.
- Did not create a live order during validation.
- Did not output secrets, tokens, subscription URLs, SQLite rows, raw config, or
  raw environment values.

## Root Cause

The first auto-issuance runtime deploy correctly wired portal order submission
to the auto-issuance service, but enabling the Aliyun TUIC node-config pointer
exposed that unauthenticated portal order POST requests could reach the order
submission service before a portal session was required.

The fix adds a user-portal session gate before portal order create, list,
refresh, and disable routes. The route now derives `portalUserRef` from the
validated portal session instead of trusting request body or query input.

## Execution

1. Verified the local artifact SHA-256.
2. Verified the current Aliyun candidate runtime and service state.
3. Uploaded the approved artifact to the Aliyun host.
4. Reverified the artifact SHA-256 on the host.
5. Extracted the artifact into the candidate releases directory.
6. Installed production dependencies for the new release.
7. Ran syntax checks for the changed runtime entry files.
8. Atomically switched the candidate `current` symlink to
   `portal-auto-issuance-session-gate-20260606-0350`.
9. Restarted `proxy-gateway-candidate.service` only.
10. Backed up `/opt/proxy-gateway-minimal-candidate/.env`.
11. Added `SUBSCRIPTION_PROXY_CONFIG_PATH` pointing at the checked-in Aliyun
    local TUIC template path under the current runtime release.
12. Restarted `proxy-gateway-candidate.service` only.

## Validation

- Current runtime release:
  `portal-auto-issuance-session-gate-20260606-0350`
- Current static portal release:
  `portal-auto-issuance-20260606-0324`
- `proxy-gateway-candidate.service`: active
- `mihomo-tuic.service`: active; not restarted by this change
- `nginx -t`: ok
- Local health: 200
- Public health: 200
- Portal static: 200
- Portal-host Admin API boundary check: 404
- Portal order POST without portal session: 401
- Portal order current GET with `portalUserRef` but without portal session: 401
- Portal order current GET without required query: non-2xx rejection
- `POST /api/portal/human-challenges`: 201
- Password probe with backend challenge and non-real credentials: 401, not
  console-auth `Unauthorized`
- `USER_PORTAL_AUTO_ISSUANCE_NODE_ID`: points at `channel-aliyun-a-tuic`
- `USER_PORTAL_AUTO_ISSUANCE_ENABLED`: enabled
- Node policy check for the Aliyun TUIC template: ok
- Data-plane lifecycle policy check for the Aliyun TUIC template: ok
- Live order creation: not called

## Rollback

Rollback remains available by:

1. Restoring the candidate runtime `current` symlink to
   `portal-auto-issuance-20260606-0324`.
2. Restoring `/opt/proxy-gateway-minimal-candidate/.env` from the backup
   created under
   `/opt/proxy-gateway-minimal-candidate/backups/portal-auto-issuance-env-pointer-session-gate-20260605T195138Z`.
3. Restarting `proxy-gateway-candidate.service`.

No static portal rollback is required for this runtime-only session-gate fix.
