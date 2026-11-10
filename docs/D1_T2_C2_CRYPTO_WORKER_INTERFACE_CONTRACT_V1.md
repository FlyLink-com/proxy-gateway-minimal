# D1 T2-C2 Crypto Worker Interface Contract v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_t2_c2_crypto_worker_interface_contract
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> Status: Implemented as a source-only Draft contract on 2026-11-08. The C2 target architecture is owner-approved; this interface contract does not authorize secret provisioning, Service Binding creation, deployment, or production use.
> Owner decision: 2026-11-08.
> Source branch: feat/t2-c4-c5-payment-retention-contracts-20261108.
> Production authority: BWH remains the only production control-data writer.

## 1. Purpose and boundary

This contract defines the first executable boundary for the dedicated Crypto Worker approved by the C2 owner decision.

The Worker is a stateless cryptographic service. It owns the HMAC key-ring bindings and performs only allowlisted digest creation, retained-key candidate generation, and envelope verification. It does not own business authorization, identity sessions, persistence, or customer records.

The original business/control-plane caller must authenticate and authorize the user and domain operation before calling the Crypto Worker. The internal service token authenticates the calling Worker only; it does not replace end-user authorization.

Cloudflare Service Bindings do not automatically propagate Cloudflare Access context. The caller identity and internal bearer credential are therefore explicit.

## 2. Network and caller authorization

Only one route is implemented:

- Method: POST
- Path: /internal/v1/digests
- Content-Type: application/json
- Maximum body: 16 KiB

Required headers:

- x-flylink-internal-caller: control-plane
- Authorization: Bearer <per-caller-service-token>

Runtime secret bindings:

- CRYPTO_CONTROL_PLANE_CALLER_TOKEN — required current token.
- CRYPTO_CONTROL_PLANE_CALLER_TOKEN_PREVIOUS — optional previous token during an explicitly managed rotation overlap.

The current token is always required. A previous token alone is insufficient. The Worker compares SHA-256 token digests using a constant-time byte comparison. The service token is separate from all HMAC key families and must not be logged or persisted.

The caller identity is allowlisted as control-plane only. Adding another caller requires a separate source review and explicit allowlist change.

The Crypto Worker Wrangler configuration sets workers_dev=false and preview_urls=false and declares no routes, account ID, D1, KV, R2, or Durable Object bindings. There is no health endpoint; unknown paths return 404. The private Service Binding is configured by the caller in the next integration step, not by this Worker.

## 3. Versioned request contract

Every request is a JSON object with version=1 and one exact operation name. Unknown fields, missing fields, unsupported operations, or an unsupported version are rejected.

### 3.1 Idempotency HMAC

| Operation | Required fields in addition to version and operation | Result |
| --- | --- | --- |
| idempotency.create | domain, actorScope, operationType, rawKey | One active-key envelope |
| idempotency.candidates | domain, actorScope, operationType, rawKey | Active + retained key candidates |
| idempotency.verify | domain, actorScope, operationType, rawKey, envelope | valid boolean |

Only the six idempotency domains already allowlisted by the shared D1 security primitive are accepted. The canonical encoding, domain separation, HMAC-SHA-256 algorithm, and envelope format remain unchanged.

### 3.2 Provider-event HMAC

| Operation | Required fields in addition to version and operation | Result |
| --- | --- | --- |
| provider-event.create | merchantScopeDigest, rawEventKey | One active-key envelope |
| provider-event.candidates | merchantScopeDigest, rawEventKey | Active + retained key candidates |
| provider-event.verify | merchantScopeDigest, rawEventKey, envelope | valid boolean |

The merchant scope must retain the existing sha256:<64 lowercase hex> grammar. Provider-event keys use their own key family and domain separator.

### 3.3 PII HMAC

| Operation | Required fields in addition to version and operation | Result |
| --- | --- | --- |
| pii.create | domain, legacyDigestHex | One active-key envelope |
| pii.candidates | domain, legacyDigestHex | Active + retained key candidates |
| pii.verify | domain, legacyDigestHex, envelope | valid boolean |

PII requests accept only a precomputed 64-character lowercase SHA-256 digest. The business/source layer performs the already-approved normalization and computes that legacy digest in memory. Raw email, source IP, display name, registration context, or other PII must never be included in a Crypto Worker request or response.

The legacy digest is still sensitive data and is not described as anonymization. It is passed only as the existing canonical input to the purpose-separated keyed HMAC operation. The Crypto Worker does not receive the raw PII value.

The shared security primitive now exposes digest-only lookup-candidate and verification functions while preserving the existing raw-value helper for source-local compatibility.

## 4. Key-ring custody contract

The Worker requires all three key-ring secret bindings on every request:

- IDEMPOTENCY_HMAC_KEYRING_JSON — family idempotency-hmac.
- PROVIDER_EVENT_HMAC_KEYRING_JSON — family provider-event-hmac.
- PII_HMAC_KEYRING_JSON — family pii-hmac.

Each secret follows the existing strict key-ring JSON shape:

- activeKeyId
- readKeyIds, with activeKeyId first
- keys, mapping each configured key ID to a base64url-encoded 32-byte key

The Worker parses the three rings per request, checks pairwise key-material separation across all families, executes the requested operation, and destroys each ring in a finally block. A missing, malformed, or reused family key fails closed with a generic service-unavailable response. There is no partial family operation.

Key IDs are public envelope metadata. Raw key bytes are never returned. No key generation, escrow, KMS/HSM access, secret provisioning, or key persistence occurs in this source slice.

## 5. Response and error behavior

Success responses use version=1 and exactly one of:

- envelope
- candidates
- valid

The response never contains raw key material, raw PII, the internal caller token, or implementation stack details.

| HTTP status | Meaning |
| --- | --- |
| 200 | Operation completed; verification mismatch is valid=false |
| 400 | Invalid JSON, schema, operation, domain, or input |
| 401 | Missing or invalid internal caller identity/token |
| 404 | Unknown path, including health probes |
| 405 | Method other than POST on the internal path |
| 413 | Request body exceeds 16 KiB |
| 415 | Content-Type is not application/json |
| 503 | Missing/invalid key ring, family separation failure, or unavailable crypto operation |

All responses set Cache-Control: no-store and omit CORS headers. The Worker emits no request, key, PII, or envelope logs.

## 6. Explicitly excluded operations

This first Worker does not expose:

- Portal/Admin TOTP AES operations. The approved T1/Auth0 direction owns target MFA; first-party Portal/Admin TOTP AES keys are not provisioned on this path.
- Wallet-first setup handoff SHA-256-domain-v1 conversion. Its existing compatibility and delivered-row replay/retention decision remain separate.
- Lease-token SHA-256 digests, which remain in their existing non-keyed domain-separated contract.
- Generic HMAC, caller-selected algorithm, caller-selected key family, caller-selected domain, arbitrary encrypt/decrypt, or raw-key export.

No D1, KV, R2, Durable Object, queue, external fetch, or persistent state is used.

## 7. Source implementation and verification — 2026-11-08

Added:

- workers/crypto/src/index.mjs
- workers/crypto/wrangler.crypto.jsonc
- workers/crypto/README.md
- server/tests/d1-t2-crypto-worker.test.mjs

Updated the shared security primitive with digest-only PII candidate generation and verification so raw PII never needs to cross the Worker request boundary.

Fixed Node v22.23.1 isolated non-production sandbox:

- Focused Worker contract tests: 11/11 PASS, 0 failed, 0 skipped — Run 1 TAP SHA-256: de2b133fae2748266a51ce22c5b0ae9c407a1c0c8302f6ff2ff61555a758f78d.
- Focused Worker contract tests: 11/11 PASS, 0 failed, 0 skipped — Run 2 TAP SHA-256: 10f2b46f7e30949709fd2d4dde2e5b145b1518a01407ce0f545d308106fd09a6.
- node --check: 3/3 PASS for the shared primitive, Worker entrypoint, and focused test.
- Wrangler 4.99.0 deploy --dry-run: PASS; bundle 28.19 KiB, gzip 6.42 KiB; no bindings found; dry-run exited without deployment.
- Static config test proves workers.dev and preview URLs are disabled and no public routes, account ID, D1, KV, R2, or Durable Object bindings are declared.

The tests invoke the Worker handler directly with synthetic-only key material and synthetic caller tokens. They do not constitute a Miniflare Service Binding integration test, a real Cloudflare secret, a real Service Binding, a deployed Worker, or a production recovery drill.

## 8. Service Binding proof and actual control-plane integration gate

A Miniflare Service Binding proof is now included in workers/control-plane/test/crypto-service-binding.test.mjs. It runs the Crypto Worker and a separate synthetic caller Worker in two Miniflare instances and connects them with a private serviceBindings entry.

Fixed Node v22.23.1 isolated non-production result:

- Miniflare Service Binding proof: 5/5 PASS twice, 0 failed / 0 skipped.
- TAP SHA-256 Run 1: 3b17bb52a8c6997bf184023e2b15ff36fb01e30c158b7ef6bb19fa14ae2dc90b.
- TAP SHA-256 Run 2: 64db515f7eb070728f4c55fb9eded1c16a30f86956803827f232a6d93a018ae4.
- node --check: 4/4 PASS for the shared primitive, Crypto Worker, synthetic caller fixture, and Service Binding test.

The fixture proves that an unauthenticated caller is rejected before the Service Binding is invoked; an authorized synthetic caller uses a separate internal service token; an invalid internal token is rejected by the Crypto Worker; missing bindings/key rings fail closed; and PII digest-only inputs remain enforced across the binding.

This is a synthetic caller fixture, not the actual control-plane Worker integration or an identity-provider integration. The existing G3 control-plane slice currently has only service-level read/write tokens and no end-user/domain authorization context. Adding a general crypto relay route to that Worker now would create an unsafe public capability surface. Therefore the actual control-plane Service Binding declaration and caller wrapper are deliberately deferred until the C1 identity/domain authorization path exists.

Next actual integration gate:

1. Identify the exact production-intended control-plane handler and its completed user/session + domain authorization context.
2. Add the private Service Binding only to the local-only control-plane configuration for that handler.
3. Call the Crypto Worker only after that handler has authorized the original user and operation.
4. Keep the internal service token in a dedicated Worker secret binding; never forward the user bearer token or reveal the internal token to a client.
5. Add Miniflare tests against the actual control-plane handler, including unauthorized user, wrong domain scope, missing binding, missing key ring, no raw PII/key exposure, and fail-closed behavior.

Do not add a generic public crypto relay route. Do not create a Cloudflare account resource, real secret, production binding, public route, deployment, BWH access, D1 mutation, dual-write, or cutover.

C2 remains OPEN pending actual control-plane integration, concrete independent escrow/recovery, named custodians, domain-owner approvals, replay/retention decisions, and independent review. T2 remains BLOCKED. BWH remains the only production control-data writer.
