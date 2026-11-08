# D1 T2-C2 Key Custody and Rotation ADR v1

> Status: TARGET ARCHITECTURE APPROVED BY PROJECT OWNER — 2026-11-08. C2 implementation, named custodians, concrete escrow mechanism, non-production integration, real recovery proof and production provisioning remain OPEN / NOT AUTHORIZED.
> Source anchor: master@be261abc60f28bb2733764fa5364ab44b3e76844
> Draft branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
> Scope: HMAC pseudonyms/idempotency, provider-event dedupe, TOTP encryption, key separation, rotation and failure behavior.
> Production authority: BWH remains the only production writer. No production key or customer data was accessed.

## 1. Decision summary

C2 now has an executable, Cloudflare-compatible cryptographic primitive module and a focused repository test file. This closes the gap where known-answer tests previously reimplemented HMAC logic only inside the test file.

The implementation is deliberately not wired into production writers, the BWH runtime, D1, or a Worker deployment. It accepts key rings injected by the caller and does not generate, persist, export, or provision production keys.

Approved target architecture (owner decision 2026-11-08):

1. Keep cryptographic keys out of the business control-plane Worker.
2. Put each key family behind a narrowly scoped crypto/identity service Worker. Expose only operations such as digest, verify, encrypt, re-encrypt, or TOTP verification; never return raw key bytes.
3. Reach that service only through private Worker service bindings. Do not expose a public route for key operations. The OIDC/authentication gateway must validate the caller before making the internal call; Cloudflare Service Bindings do not propagate Access context automatically.
4. For a key consumed by exactly one Worker, prefer a per-Worker secret binding. Use Cloudflare Secrets Store only when account-level sharing across Workers is genuinely required. Secrets Store is currently open beta and is a secret distribution/storage service, not a non-exportable HSM/KMS.
5. Maintain an independently approved encrypted key escrow/backup outside the repository and Notion. Cloudflare's secret value is not viewable again in the dashboard after creation; do not make the Cloudflare binding the only recoverable copy.
6. Do not create real keys, stores, bindings, tenants, or production resources until the owner approves the custody boundary and recovery/escrow method.

Cloudflare references:
- Workers Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Secrets Store overview: https://developers.cloudflare.com/secrets-store/
- Secrets Store Workers integration: https://developers.cloudflare.com/secrets-store/integrations/workers/
- Secrets Store access control: https://developers.cloudflare.com/secrets-store/access-control/
- Worker Service Bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/
- Workers Web Crypto: https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

## 2. Key families and non-reuse

The following key families are separate. Different key IDs do not make reuse of the same key bytes acceptable.

| Family | Purpose | Allowed consumers |
|---|---|---|
| idempotency-hmac | Six raw idempotency fields and their fixed source domains | Commerce/idempotency crypto boundary |
| provider-event-hmac | Payment provider event dedupe | Payment-event crypto boundary |
| pii-hmac | Account email, registration source-IP and request-context pseudonyms | Identity/privacy crypto boundary |
| portal-totp-aes | First-party Portal TOTP secret encryption, only if the selected identity provider does not own the factors | Portal identity/TOTP boundary |
| admin-totp-aes | First-party Admin TOTP secret encryption, only if the selected identity provider does not own the factors | Admin identity/TOTP boundary |

Lease tokens use the separately specified domain-separated SHA-256 digest and do not require a secret key.

Portal and Admin TOTP keys must be distinct. The helper includes a key-ring separation assertion. If C1 selects a managed identity provider that owns TOTP factors, the target may not need either first-party AES key family; the provider becomes the factor custody authority and the old BWH key is used only in an approved one-time transfer process.

## 3. HMAC envelope and canonical encoding

Persisted envelope:

hmac-sha256:v1:<key-id>:<64-lowercase-hex>

Key ID grammar: [A-Za-z0-9][A-Za-z0-9._-]{0,31}. The key ID is public metadata and is included in the MAC input.

LP(x) is a four-byte unsigned big-endian byte length followed by UTF-8 bytes. Do not concatenate ambiguous variable-length fields without length prefixes.

### 3.1 Idempotency

HMAC-SHA-256(K[key_id],
  UTF8("flylink:d1:idempotency:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(actor_scope)) ||
  LP(UTF8(operation_type)) ||
  LP(UTF8(raw_idempotency_key)))

The implementation allowlists exactly these six domains:
- coin-wallet-operation-receipt/v1
- coin-commerce-operation-receipt/v1
- deferred-transition-operation-receipt/v1
- payment-order-create/v1
- wallet-first-deferred-checkout-reserve/v1
- portal-registration-welcome-grant/v1

The source uniqueness scope and replay semantics do not change. Same-scope/same-key/same-request returns the original result; same-scope/same-key/different-request retains the existing conflict behavior. No cross-scope dedupe is introduced.

### 3.2 Provider-event dedupe

HMAC-SHA-256(K_provider[key_id],
  UTF8("flylink:d1:provider-event:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(merchant_scope_digest)) ||
  LP(UTF8(raw_event_dedupe_key)))

Provider-event keys are not reused for idempotency or PII pseudonyms.

### 3.3 PII pseudonyms

HMAC-SHA-256(K_pii[key_id],
  UTF8("flylink:d1:pii-digest:v1\0") ||
  LP(UTF8(key_id)) ||
  LP(UTF8(domain)) ||
  LP(UTF8(legacy_sha256_digest_hex)))

Fixed PII domains:
- account-email-lookup/v1
- registration-source-ip/v1
- registration-request-key/v1

The exact source normalization is preserved: email is trim + lowercase; source IP and request-context strings are trimmed. The legacy SHA-256 value is computed in memory and then keyed. The unkeyed low-entropy digest is not a valid target runtime fallback.

## 4. TOTP envelope and legacy behavior

New first-party TOTP envelope:

v3:aes-256-gcm:<key-id>:<iv-base64url>:<tag-base64url>:<ciphertext-base64url>

- AES-256-GCM, 96-bit IV, 128-bit authentication tag.
- Additional authenticated data binds the envelope to the v3 purpose prefix, key ID, Portal/Admin scope and opaque credential reference.
- The decrypt path requires the same scope and credential reference; swapping ciphertext between accounts or between Portal and Admin fails.
- New writes use only the active key ID. Reads accept only configured active/retained IDs.
- The helper uses Web Crypto, so the primitive is usable in Node 22 and Cloudflare Workers without Node-only crypto imports.
- Key-ring material is hidden behind a WeakMap-backed object; callers receive only public family/key-ID metadata. Temporary key copies are best-effort zeroized after import/use. JavaScript runtime memory zeroization is not a hardware guarantee.

Legacy behavior:
- The existing v2 AES-GCM envelope has no key ID. A one-time isolated conversion therefore requires the exact legacy key supplied explicitly by the authorized migration process; the runtime must not guess which key applies.
- A valid legacy v2 envelope can be decrypted in memory and re-encrypted directly to v3. The helper returns only the new envelope, never plaintext.
- Legacy enc: values and unprefixed Base32 values are raw secret material, not ciphertext. The current C1 synthetic policy remains RE_ENROLL_REQUIRED; no automatic runtime fallback or silent import is introduced.
- Malformed v2 values are quarantined. Unknown keys, modified tags, wrong credential refs, wrong scope and malformed envelopes fail closed.

If Auth0 or another managed identity provider is selected and owns TOTP factors, this first-party v3 envelope is a fallback/transition capability, not a reason to keep TOTP secrets in D1 or the business Worker.

## 5. Rotation, retirement and recovery

### 5.1 HMAC rotation

1. Generate a new random 256-bit key in the approved secret-generation environment and preserve it in independent encrypted escrow. No key is generated by this Draft work.
2. Publish a new key ID and configure readKeyIds with the new active key first, followed by every retained key.
3. New writes use only the active key. Lookups generate candidates for active and retained keys; envelope verification selects only the key ID in the envelope.
4. Keep old keys while any live row, replay window, provider retry window, registration lookup or restore path still depends on them.
5. HMAC is not reversible. Re-keying requires the canonical source value or the retained legacy digest in a protected process. Do not pretend that an existing HMAC envelope can be transformed into another key's envelope.
6. Retire an old key only after row-count/reconciliation proof by key ID, all dependent retention windows closed or data re-keyed, restore tests passed, and owner approval recorded.

### 5.2 AES-GCM rotation

1. Add the new key to the read ring and mark it active.
2. Read old ciphertext by its embedded key ID, authenticate using the stored scope and credential reference, then encrypt under the active key with a fresh random IV.
3. Verify the new envelope before replacing the old value.
4. Prove no live ciphertext depends on the old key, complete restore/recovery tests, then obtain owner approval before retirement.

### 5.3 Failure and incident rules

- Missing key ring, unknown key ID, malformed envelope, authentication-tag failure, or unavailable custody service fails closed.
- No fallback to plaintext, unkeyed SHA-256, an unknown historical key, or a shared Portal/Admin key.
- If an HMAC key is compromised, rotate and recompute only from available canonical source/legacy digest material. If no safe source exists, preserve the old key only if Security approves; otherwise fail closed and reconcile affected replay/lookup behavior.
- If an AES key is compromised, re-encrypt all live records under a new key or require factor re-enrollment; do not continue silently using the compromised key.
- Do not log key material, raw PII, raw idempotency keys, TOTP secrets, decrypted legacy values, or complete secret envelopes.

## 6. Outstanding compatibility decision: wallet-first handoff hashes

The source has a separate wallet-first setup handoff idempotency_key_hash and session_binding_hash. They are existing domain-separated unkeyed SHA-256 values, not members of the six raw idempotency fields. The input validator does not prove minimum entropy.

Recommendation: do not preserve them as a permanent unkeyed exception. First inventory all callers, uniqueness/replay scopes and retention windows; then decide whether to HMAC the legacy digest under a separately allowlisted domain or retire the old path with an explicit compatibility window. No domain has been added to the runtime allowlist for this exception yet.

This remains a C2 blocker.

## 7. Source implementation and synthetic verification

Added:
- server/services/platform/d1-t2-security-primitives.mjs
- server/tests/d1-t2-security-primitives.test.mjs

The helper now implements:
- strict key-ring construction and JSON secret parsing;
- hidden key material, explicit key families, key ID validation and best-effort destroy/zeroization;
- Web Crypto HMAC-SHA-256, strict versioned envelope parsing and Web Crypto verify;
- six allowlisted idempotency domains, separate provider-event domain and three PII pseudonym domains;
- active-write / retained-read candidate generation and rotation verification;
- domain-separated lease token SHA-256 and field-specific issuer grammar;
- TOTP v3 AES-256-GCM with key ID, scope/credential AAD, active/retained rotation and controlled v2 re-encryption.

Local mirror verification on Node v22.16.0: 23/23 focused tests PASS; node --check passed for the primitive and local focused test files. The repository-focused test file has been added, but the project-fixed Node v22.23.1 environment has not yet rerun the exact repository test file. No full repository suite or CI was run. This is source/synthetic evidence only.

## 8. C2 acceptance status

Implemented in Draft:
- primitive-level HMAC and PII algorithms are now exercised through the source helper rather than test-local copies;
- active/retained key behavior and no legacy SHA-256 fallback;
- strict key ID, family and domain validation;
- Portal/Admin TOTP key separation, v3 AAD binding and rotation;
- synthetic v2 re-encryption and legacy enc/raw Base32 re-enrollment disposition.

Target architecture approved by the project owner on 2026-11-08:
- Dedicated Crypto Worker + private Service Binding; no public key-operation endpoint or raw key return.
- Per-Worker secret bindings by default; Secrets Store only for demonstrated multi-Worker sharing, not as an HSM/KMS.
- Independent encrypted escrow outside Cloudflare/GitHub/Notion, with two-person recovery/revocation.
- Separate key material and domains by purpose.
- Active-write / retained-read rotation and evidence-based retirement.
- No first-party Portal/Admin TOTP AES provisioning under the T1/Auth0-managed MFA decision.

Still OPEN:
1. Name the actual accountable Platform/Security key custodians and Identity/Privacy and Payment/Commerce domain owners.
2. Select the concrete independent escrow/wrapping mechanism (external KMS/HSM or approved offline recovery) and complete the two-person recovery/revocation runbook.
3. Implement and test the Crypto Worker + private Service Binding in isolated non-production, including caller authentication/authorization, no public endpoint, no raw key return, and fail-closed behavior.
4. Obtain domain-owner approval for payment-event and PII HMAC purposes, source normalization, and allowed consumers.
5. Resolve Wallet-first digest compatibility and delivered-row replay/retention duration separately; this is not included in the target architecture approval.
6. Define key-family-specific retention/replay windows and evidence required before old-key retirement.
7. Complete independent exact-HEAD review and remaining C2 formal acceptance evidence.

No production keys, Cloudflare Secrets Store, Worker bindings, D1 schema, customer rows, BWH host, deployment, dual-write, CI, PR Ready transition, merge or cutover were used or authorized by this ADR. BWH remains the only production writer.

## 14. Superseding Wallet-first digest decision and grouped custody proposal — 2026-11-08

The earlier Section 6 recommendation to consider HMAC conversion or retirement is superseded by the source-grounded audit in `docs/D1_T2_C2_WALLET_FIRST_DIGEST_COMPATIBILITY_AUDIT_V1.md`.

The audited contract uses two distinct domain-separated SHA-256 v1 digests over transient inputs. The Portal session reference is server-side and random; the first-party idempotency path now uses cryptographically secure UUIDv4 generation, and the Wallet-first service boundary rejects non-canonical values. The exact v1 digest formula and existing rows remain unchanged. These values are not PII HMAC pseudonyms and do not require a new HMAC key family. The separate 10-minute claim lease is not a row-retention TTL; delivered-row retention remains an owner decision.

A grouped key-custody recommendation is available in `docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md`. It consolidates the crypto Worker/private Service Binding boundary, per-Worker secret binding default, independent encrypted escrow, family separation, active-write/retained-read rotation, restore acceptance, and the already-approved T1 decision not to provision first-party Portal/Admin TOTP AES keys while Auth0 owns target MFA.

The owner has since approved the target custody architecture on 2026-11-08. The Wallet-first audit remains a separate source/compatibility record, not included in this architecture approval. C2 remains OPEN pending named custodians, concrete escrow mechanism and independent recovery, non-production service-binding integration, domain-owner approvals, replay/retention decisions and independent review. The synthetic escrow rehearsal has passed 10/10 twice but is not a real external backup or production restore.

## 15. Synthetic escrow contract and fixed-runtime validation — 2026-11-08

Added the pure synthetic key-escrow contract `server/services/platform/d1-t2-key-escrow-contract.mjs` and 10-case test `server/tests/d1-t2-key-escrow-contract.test.mjs`. It proves AES-256-GCM wrap/restore with family/key-ID/algorithm AAD, metadata-only inventory projection, wrong-key/tamper rejection, and key-family material separation.

Under Node v22.23.1 in an isolated non-production sandbox, the suite passed 10/10 twice; `node --check` 2/2 PASS. TAP hashes: `86bd5b1c9c8efd655b017161be263ef1a5f24e978e131d38b39063ad0e611a56` and `7b071c69b87e61231e186143371886a2f16af5de41a576d67524afe405d67729`.

This is not a real KMS/HSM, Cloudflare secret, escrow backup, or production restore. No real key or binding was created. The target architecture is owner-approved; C2 implementation and formal acceptance remain OPEN.


## 16. Owner approval — target architecture baseline — 2026-11-08

The project owner approved the C2 target architecture described in this ADR and the grouped proposal:

1. Dedicated, narrowly scoped Crypto Worker; no raw key material in the business control-plane Worker and no raw key return to callers.
2. Private Worker Service Binding only; caller identity and authorization must be validated before the internal invocation; no public key-operation route.
3. Per-Worker secret bindings are the default. Cloudflare Secrets Store is permitted only for a demonstrated multi-Worker sharing requirement and is not considered an HSM/KMS.
4. Independent encrypted escrow outside Cloudflare/GitHub/Notion, with two-person recovery and revocation. The actual external wrapping provider or approved offline mechanism remains to be selected.
5. Separate key material and domains for idempotency HMAC, provider-event HMAC, PII HMAC and any separately approved future AES purpose.
6. Active-write / retained-read rotation, explicit dependent-row/replay/retention evidence before retirement, and fail-closed behavior.
7. No first-party Portal/Admin TOTP AES key provisioning under the already-approved T1 decision that Auth0 owns target MFA and legacy BWH TOTP values are invalidated at cutover.

This decision approves the target architecture only. It does not approve or perform implementation or provisioning. The following remain open: named Platform/Security custodians and domain owners; concrete external escrow/wrapping mechanism; two-person recovery runbook and real recovery evidence; isolated non-production Crypto Worker/Service Binding integration and authorization tests; payment-event and PII domain approvals; Wallet-first digest compatibility and replay/retention decision; key-family-specific retention windows; independent review and formal C2 acceptance.

No real key, Cloudflare secret, binding, Worker, Durable Object, KMS/HSM resource or escrow backup has been created by this decision. No BWH access, production data read, D1 mutation, deployment, dual-write, cutover or production writer-authority change is authorized. BWH remains the only production control-data writer.
