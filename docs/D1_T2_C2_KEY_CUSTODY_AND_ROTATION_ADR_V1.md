# D1 T2-C2 Key Custody and Rotation ADR v1

> Status: CURRENT OWNER-APPROVED C2-D1 AMENDMENT — 2026-11-10. Cloudflare per-Worker runtime Secrets remain the online custody boundary; SOPS v3.13.3 + age v1.3.2 with three independent custody-domain key groups and shamir_threshold 2 is the selected offline recovery format. Stage 2 item 1 is PASS (synthetic); exact offline workstation and real domain configuration remain OPEN. No real identities, runtime keys, Cloudflare/AWS resources, bindings, or production provisioning are authorized.
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

## 8. C2 acceptance status — current as of 2026-11-10

Implemented in Draft source:
- purpose-separated HMAC/PII primitives, key-family validation, active-write / retained-read behavior, and fail-closed handling;
- dedicated Crypto Worker source with synthetic caller authorization and private Service Binding Miniflare proof;
- synthetic escrow contract tests (AES-GCM helper) remain test evidence only and are not the selected production recovery format.

Current owner-approved custody baseline:
- Online runtime key custody remains Cloudflare per-Worker Secrets, bound only to the dedicated Crypto Worker. The business Control Plane Worker does not receive raw key bytes.
- Internal crypto calls remain private Service Binding only, after caller identity and domain authorization; no public crypto endpoint or raw-key return.
- Offline recovery format is SOPS v3.13.3 + age v1.3.2, with exactly three SOPS key groups, exactly one age recipient per group, and `shamir_threshold: 2`.
- The three recovery identities represent three independent custody domains, not a requirement for three natural-person custodians. Single-person control is an explicit limitation and is not two-person approval.
- SOPS is the sole selected offline recovery format. Do not add a second custom AES-GCM / per-envelope KEK / manual Shamir layer unless a future, separately approved threat-model decision requires it.
- The existing `server/services/platform/d1-t2-key-escrow-contract.mjs` and its tests remain synthetic-only; they are not authorized for real key wrapping or production escrow.
- Cloudflare Secrets Store remains optional only for a demonstrated multi-Worker sharing requirement and is not an HSM/KMS.
- No first-party Portal/Admin TOTP AES provisioning under the T1/Auth0-managed MFA decision.

Stage 2 verification:
- SOPS v3.13.3 checksum, Cosign bundle identity, and SLSA provenance verification passed.
- age v1.3.2 release artifact Sigsum verification passed.
- Synthetic 2-of-3 matrix: 10/10 expected outcomes; all three two-domain combinations succeeded and matched the metadata-only manifest; each single domain, non-member, mixed member/non-member, and tampered ciphertext was rejected.
- Evidence: [SOPS_AGE_TOOLCHAIN_VERIFICATION_2026-11-09.md](https://drive.google.com/file/d/1-ALe9oRFd1q5a9K9ia5hWZ_VtxXGOBl1/view), SHA-256 `64eea14eeb92e530cdb6c32e954ea288be866ebebc15fc7fc8b4c771722b880e`.

Still OPEN:
1. Select the exact offline workstation OS/architecture. Muse VM linux/amd64 was only a stand-in and is not the final offline workstation decision.
2. Configure and prove the three real custody domains, including independent credentials, MFA, recovery channels, and administrators. Synthetic labels A=Cloudflare, B=AWS account 580857941765, C=fully offline are placeholders, not provisioned stores. The Cloudflare recovery identity must remain inaccessible to the runtime Crypto Worker and its deployment principal; otherwise Domain A does not qualify. Before AWS can serve as Domain B, replace the AWS root credentials currently on lucky with a dedicated least-privilege IAM identity. The exact final provider/account mapping remains open.
3. Complete Stage 3 offline recovery rehearsal using the approved toolchain and real domain retrieval procedures, under separate authorization.
4. Complete Stage 4 isolated non-production Crypto Worker / Service Binding integration under separate authorization.
5. Obtain domain-purpose approvals for payment-event and PII HMAC, resolve Wallet-first digest/replay/retention decisions, and define family-specific retention windows.
6. Complete independent exact-HEAD review and the remaining C2 formal acceptance evidence.

No real age identity, runtime key, escrow record, Cloudflare Secret, Service Binding, Worker deployment, AWS custody object, BWH access, D1 mutation, dual-write, or cutover has been authorized. C2 remains OPEN; T2 remains BLOCKED. BWH remains the only production control-data writer.

## 14. Historical Wallet-first digest decision and grouped custody proposal — 2026-11-08

> Historical decision record. Its Wallet-first digest disposition remains separate; any old custodian/recovery wording is superseded by the current custody amendment in §21.

The earlier Section 6 recommendation to consider HMAC conversion or retirement is superseded by the source-grounded audit in `docs/D1_T2_C2_WALLET_FIRST_DIGEST_COMPATIBILITY_AUDIT_V1.md`.

The audited contract uses two distinct domain-separated SHA-256 v1 digests over transient inputs. The Portal session reference is server-side and random; the first-party idempotency path now uses cryptographically secure UUIDv4 generation, and the Wallet-first service boundary rejects non-canonical values. The exact v1 digest formula and existing rows remain unchanged. These values are not PII HMAC pseudonyms and do not require a new HMAC key family. The separate 10-minute claim lease is not a row-retention TTL; delivered-row retention remains an owner decision.

A grouped key-custody recommendation is available in `docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md`. It consolidates the crypto Worker/private Service Binding boundary, per-Worker secret binding default, independent encrypted escrow, family separation, active-write/retained-read rotation, restore acceptance, and the already-approved T1 decision not to provision first-party Portal/Admin TOTP AES keys while Auth0 owns target MFA.

The owner has since approved the target custody architecture on 2026-11-08. The Wallet-first audit remains a separate source/compatibility record, not included in this architecture approval. C2 remains OPEN pending named custodians, concrete escrow mechanism and independent recovery, non-production service-binding integration, domain-owner approvals, replay/retention decisions and independent review. The synthetic escrow rehearsal has passed 10/10 twice but is not a real external backup or production restore.

## 15. Synthetic escrow contract and fixed-runtime validation — 2026-11-08

Added the pure synthetic key-escrow contract `server/services/platform/d1-t2-key-escrow-contract.mjs` and 10-case test `server/tests/d1-t2-key-escrow-contract.test.mjs`. It proves AES-256-GCM wrap/restore with family/key-ID/algorithm AAD, metadata-only inventory projection, wrong-key/tamper rejection, and key-family material separation.

Under Node v22.23.1 in an isolated non-production sandbox, the suite passed 10/10 twice; `node --check` 2/2 PASS. TAP hashes: `86bd5b1c9c8efd655b017161be263ef1a5f24e978e131d38b39063ad0e611a56` and `7b071c69b87e61231e186143371886a2f16af5de41a576d67524afe405d67729`.

This is not a real KMS/HSM, Cloudflare secret, escrow backup, or production restore. No real key or binding was created. The target architecture is owner-approved; C2 implementation and formal acceptance remain OPEN.


## 16. Historical owner approval — target architecture baseline — 2026-11-08 (recovery/custody terms superseded by §21)

> Historical baseline. The online Crypto Worker, private Service Binding, per-Worker runtime Secrets, key-family separation, rotation, and T1/Auth0 decisions remain in force. The old two-person / named-custodian and unspecified escrow-mechanism wording is superseded by §21.

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


## 17. Crypto Worker interface contract and source-only implementation — 2026-11-08

The C2 interface contract is recorded in `docs/D1_T2_C2_CRYPTO_WORKER_INTERFACE_CONTRACT_V1.md`.

Implemented in Draft source:
- `workers/crypto/src/index.mjs` provides one internal POST route, strict versioned operation schemas, per-caller bearer authentication, a current/previous credential overlap, bounded request parsing, and generic fail-closed errors.
- It loads the three purpose-separated HMAC key-ring secret bindings, checks pairwise key-material separation, and destroys the in-memory key rings after each operation.
- PII requests accept only the existing precomputed SHA-256 digest; no raw PII enters the Worker request body.
- The Wrangler configuration disables workers.dev and preview URLs and declares no public route, account ID, D1, KV, R2, or Durable Object binding.
- The shared primitive adds digest-only PII candidate generation and verification without changing the existing raw-value helper contract.

Fixed Node v22.23.1 isolated non-production tests: 11/11 PASS twice; node --check 3/3 PASS. Wrangler 4.99.0 deploy --dry-run passed (28.19 KiB bundle / 6.42 KiB gzip; no bindings found; no deployment).

This is direct Worker-handler and bundle evidence only. The control-plane private Service Binding and caller-side authorization wrapper have not yet been integrated or tested through Miniflare. No real key, secret, binding, external escrow, Worker deployment, BWH access, D1 mutation, dual-write, or cutover occurred. C2 remains OPEN and BWH remains the only production writer.


## 18. Miniflare Service Binding proof — synthetic caller only — 2026-11-08

Added `workers/crypto/test/fixtures/authorized-caller.mjs` and `workers/control-plane/test/crypto-service-binding.test.mjs`. The test runs a synthetic caller Worker and the Crypto Worker in separate Miniflare instances joined by a private Service Binding callback.

Fixed Node v22.23.1: 5/5 PASS twice, 0 failed / 0 skipped. TAP hashes: `3b17bb52a8c6997bf184023e2b15ff36fb01e30c158b7ef6bb19fa14ae2dc90b` and `64db515f7eb070728f4c55fb9eded1c16a30f86956803827f232a6d93a018ae4`. Syntax checks: 4/4 PASS.

The fixture proves user authorization occurs before the Service Binding call, the caller uses a separate internal token, invalid internal credentials are rejected, missing binding/key ring fails closed, and PII digest-only behavior remains enforced across the binding.

This is not actual control-plane integration. The existing G3 control-plane slice has service-level read/write tokens but no end-user/domain authorization context. The actual Service Binding declaration and caller wrapper remain deferred until the C1 identity/domain authorization path exists. No public crypto relay route is added. No Cloudflare binding, secret, deployment, production data access, D1 mutation, dual-write, or cutover occurred. C2 remains OPEN; BWH remains the only production writer.


## 19. Historical external escrow provider evaluation — 2026-11-08 (not the selected route)

> Historical source-only comparison. It did not select a provider. The current owner-selected offline recovery format is SOPS + age as recorded in §21; no managed KMS is selected.

Added `docs/D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md` as a source-only options evaluation. It compares Google Cloud KMS, AWS KMS, Azure Key Vault/Managed HSM, HashiCorp Vault Transit, and offline encrypted escrow.

Technical recommendation: use an independent managed KMS with a non-exportable symmetric KEK, metadata-bound AAD/encryption context, distinct key-admin/key-user roles, audit logging, and a separate two-person break-glass approval workflow. Google Cloud KMS is the leading technical candidate if no existing independent KMS account is preferred; AWS KMS is equivalent where a separate AWS organization/account already exists. Azure is viable where an independent Azure tenant exists.

No provider or account is selected by this evaluation. Two-person recovery must be separately enforced and tested; provider role separation alone is not proof of two-person approval. No cloud account, KMS/HSM key, policy, escrow object, real key, Cloudflare secret, or Worker binding was created. The concrete provider, named custodians, and real recovery proof remain OPEN.


## 2026-11-09｜Synthetic escrow envelope strict-shape hardening

The synthetic envelope contract now enforces an exact eight-field envelope schema before either restore or metadata-only inventory projection. It validates schema version, key ID, family, allowed algorithm, canonical timestamp, and canonical nonce/ciphertext/tag lengths. Unknown fields are rejected, so a raw key field cannot ride along in an otherwise valid envelope and be ignored by the inventory projection.

- Source: `server/services/platform/d1-t2-key-escrow-contract.mjs`, commit `1de2fbcc449ce4e640131616e797926153eaa0d8`, blob `101eaa8f6811e7e50cecff1cc81aa82d078366ab`.
- Test: `server/tests/d1-t2-key-escrow-contract.test.mjs`, commit `f3ff14ea4fad016bac687b92fc686f43ec086fc3`, blob `64a3be4f9a0c87d4f0d81e2e62ef3c2d2b355a17`.
- Node v22.23.1, isolated synthetic sandbox: 11/11 PASS twice; 0 failed / 0 skipped; `node --check` PASS.

This is a stricter synthetic envelope contract only. It does not create a KMS/HSM key, external escrow, real ciphertext backup, or recovery workflow. C2 remains OPEN pending provider/account selection, named custodians, two-person restore/revocation procedure, and real non-production recovery evidence.

## 20. Historical owner decision — Cloudflare-native online custody and offline 2-of-3 recovery — 2026-11-08 (recovery details superseded by §21)

> Historical baseline only. The Cloudflare online runtime-secret boundary remains in force. The AES-256-GCM + per-envelope KEK + manually held Shamir shares and three-named-custodian model below are superseded by the SOPS + age / three-independent-domain amendment in §21; do not use this historical section as the current recovery procedure.

The project owner has now selected the concrete custody direction, superseding the earlier open choice between an external managed KMS/HSM and offline recovery:

1. Cloudflare per-Worker Secrets are the online runtime secret store. The three HMAC key-ring secrets are bound only to the dedicated Crypto Worker.
2. No separate GCP, AWS, Azure, or other cloud KMS account is required or selected for C2.
3. The independent recovery copy uses the existing AES-256-GCM envelope shape, with a unique 256-bit recovery KEK per key envelope.
4. The recovery KEK is split using a vetted Shamir Secret Sharing implementation at a 2-of-3 threshold. Three distinct named custodians each hold one share; the encrypted envelope and metadata-only manifest are stored in two independent offline physical locations.
5. The concrete Shamir tool/version/hash, named custodians, and physical custody locations remain open. No custom Shamir implementation is permitted without a separate security review.
6. Cloudflare Secrets Store remains optional only for a demonstrated multi-Worker sharing need and is not treated as an HSM/KMS.

The executable operating boundary is [D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md](D1_T2_C2_OFFLINE_ESCROW_RUNBOOK_V1.md). The existing key-escrow module and tests remain synthetic-only and do not authorize processing real key material.

This decision does not authorize real key or KEK generation, share creation/distribution, Cloudflare Secret or Service Binding creation, Worker deployment, D1 mutation, BWH access, production reads, dual-write, or cutover. C2 remains OPEN pending tool review, named custodians, synthetic 2-of-3 implementation tests, non-production integration, domain-owner approvals, and independent review. BWH remains the only production control-data writer.

## 21. Owner amendment — SOPS + age and three independent custody domains — 2026-11-10

This section is the current authoritative C2-D1 recovery decision. It supersedes the offline recovery format and human-custodian / two-person language in the historical baselines §§14, 16, 19 and 20. The online Cloudflare Crypto Worker architecture in §§1, 16 and 20 remains unchanged.

### 21.1 Selected recovery format

- Selected: SOPS v3.13.3 + age v1.3.2.
- Configure exactly three SOPS `key_groups`, each containing exactly one distinct age recipient, and set `shamir_threshold: 2`.
- Any two of the three independent domain identities must decrypt; any single identity must fail. Do not place multiple recipients in one key group, because that would not represent three independent threshold domains.
- Store one SOPS-encrypted JSON record per runtime key ID and key family. The record contains schemaVersion, keyId, family, algorithm, keyLengthBits, generatedAt, and keyMaterialBase64. The runtime key material is 32 random bytes for the current HMAC key families.
- Keep a separate metadata-only manifest with the same non-secret metadata and the SHA-256 of the decoded key material. The manifest never contains key material or age identities. SOPS authenticated encryption/MAC remains the cryptographic integrity control; the manifest is an independent inventory cross-check.
- SOPS performs the encrypted structured-file handling, data-key management, authenticated encryption/MAC, and Shamir threshold operation. Do not add the historical custom AES-GCM / per-envelope KEK / manual Shamir layer on top of SOPS.
- The synthetic AES-GCM helper remains synthetic-only. It is not a production recovery format and must not receive real key material.

### 21.2 Three independent custody domains, not three people

- The threshold is defined across three independently controlled domains. It does not require three different natural persons at the current single-operator stage.
- Each domain must have its own age identity, independent credentials, MFA, account recovery path, and administrator/control boundary. A common SSO, shared recovery mailbox, or one organization administrator capable of resetting all domains collapses the independence and must be recorded as a single effective domain.
- A single natural person controlling all three domains can still obtain two identities. This design therefore protects against a single account/provider/domain compromise, not whole-person compromise or malicious single-operator action. Natural-person custodian separation is an explicit T2 limitation; two-domain authentication is not two-person approval.
- Stage 2 synthetic fixture labels A=Cloudflare, B=AWS account 580857941765, and C=fully offline are placeholders only. They do not prove those providers/accounts are configured or independently administered. Final provider/account mapping and independence evidence remain OPEN.
- If Cloudflare is retained as Domain A, the age private identity must not be placed in a Worker Secret, exposed to the Crypto Worker, or accessible to the Crypto Worker's deployment principal. If that separation cannot be demonstrated, Cloudflare does not qualify as an independent recovery domain and Domain A must be reassigned.
- Before AWS is accepted as Domain B, replace the AWS root credentials currently on lucky with a dedicated least-privilege IAM identity; independently verify root email/MFA/recovery and organization-level administrator boundaries. AWS is a custody-domain candidate only; this does not select AWS KMS or authorize a new AWS account.
- Domain C is a fully offline identity/custody location. Its physical medium and access procedure remain to be selected and tested.

### 21.3 Artifact storage and offline requirement

- Store the SOPS-encrypted records and metadata-only manifests in at least two physically independent offline locations, separate from the three age-identity custody locations.
- Google Drive may hold an additional ciphertext-only copy; it does not count as either required offline physical location.
- **Owner deviation — designated envelope copies (ruled by the project owner on 2026-11-10):** the two designated copies of the SOPS-encrypted records and metadata-only manifests are (1) Google Drive and (2) the owner's BitLocker-encrypted USB drive, held offline. This is an explicit owner-approved deviation from the two-offline-physical-locations baseline above: one of the two designated copies is an online cloud copy, and this record must not be read as claiming full compliance with that baseline. The deviation covers ciphertext and metadata-only manifests only. Age private identities are never stored in Google Drive or in any single online account — two identities in one place would collapse the 2-of-3 threshold — and the Drive copy is not a custody domain and holds no identity material. The BitLocker recovery key for the USB drive must not be stored in the same Google Drive account. Confidentiality of the SOPS records rests on the 2-of-3 age threshold, not on the storage locations.
- A genuinely offline recovery must be possible without depending on a live provider API to obtain the two required identities. Stage 3 must prove how the two identities are retrieved into the offline workstation while preserving domain separation. If the procedure requires network access, describe it as network-assisted recovery, not air-gapped recovery.
- The exact offline workstation OS/architecture remains an owner selection. The Stage 2 Muse VM linux/amd64 environment was only a stand-in.

### 21.4 Stage 2 evidence and remaining gates

- Stage 2 item 1 is PASS: pinned SOPS/age acquisition and release-integrity verification plus synthetic threshold rehearsal.
- Evidence record: [SOPS_AGE_TOOLCHAIN_VERIFICATION_2026-11-09.md](https://drive.google.com/file/d/1-ALe9oRFd1q5a9K9ia5hWZ_VtxXGOBl1/view); SHA-256 `64eea14eeb92e530cdb6c32e954ea288be866ebebc15fc7fc8b4c771722b880e`.
- Matrix: A+B, A+C, B+C, and A+B+C succeeded; A-only, B-only, C-only, non-member-only, member+non-member, and tampered ciphertext were rejected; 10/10 expected outcomes.
- Stage 2 remains in progress for final offline workstation selection and real custody-domain configuration. Stage 3 offline recovery drill and Stage 4 non-production Cloudflare integration are separate gates and are not authorized by this amendment.
- No real age identities, runtime keys, SOPS escrow records, Cloudflare Secrets, Service Bindings, AWS storage objects, or production resources were created or authorized. C2 remains OPEN; T2 remains BLOCKED; BWH remains the only production control-data writer.
