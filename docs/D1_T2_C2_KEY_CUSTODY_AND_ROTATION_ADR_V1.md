# D1 T2-C2 Key Custody and Rotation ADR v1

> Status: IMPLEMENTATION DRAFT — synthetic primitives and tests added; key-custody provider, accountable owners, legacy handoff disposition and production provisioning remain unapproved.
> Source anchor: master@be261abc60f28bb2733764fa5364ab44b3e76844
> Draft branch: docs/d1-target-schema-g6-rehearsal-plan-20261107
> Scope: HMAC pseudonyms/idempotency, provider-event dedupe, TOTP encryption, key separation, rotation and failure behavior.
> Production authority: BWH remains the only production writer. No production key or customer data was accessed.

## 1. Decision summary

C2 now has an executable, Cloudflare-compatible cryptographic primitive module and a focused repository test file. This closes the gap where known-answer tests previously reimplemented HMAC logic only inside the test file.

The implementation is deliberately not wired into production writers, the BWH runtime, D1, or a Worker deployment. It accepts key rings injected by the caller and does not generate, persist, export, or provision production keys.

Recommended architecture:

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

Portal and Admin TOTP keys must be distinct only if a first-party TOTP AES path is separately selected. Under owner-selected T1, Auth0 manages target factors and neither first-party AES key family is provisioned. Legacy BWH enc:, raw Base32 and v2: values are invalidated at cutover; no old key access, decryption, transfer or re-encryption is part of this migration.

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
- Owner-selected T1 (2026-11-08) supersedes the earlier one-time conversion proposal: legacy v2: and enc: values are invalidated at cutover and require Auth0 MFA re-enrollment.
- No legacy TOTP value is decrypted, transferred, imported or re-encrypted. The legacy key is not accessed for this migration.
- The source enc: prefix is raw Base32, not ciphertext. The v2 envelope is legacy ciphertext without a key ID, but T1 does not authorize opening it.
- Malformed or unrecognized legacy values remain quarantined. The compatibility classifier returns re_enroll_required for recognized legacy formats and never performs cryptographic conversion.

Under the selected Auth0/T1 path, first-party v3 TOTP encryption is not part of the target migration and no target Portal/Admin TOTP AES keys are provisioned. The generic v3 primitive remains unconfigured and is not a reason to retain legacy secrets in D1 or the business Worker.

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
- generic TOTP v3 AES-256-GCM with key ID, scope/credential AAD and active/retained rotation; this first-party primitive is not selected or provisioned for the Auth0/T1 migration, and no v2 decryption/re-encryption path is used.

Historical local mirror verification on Node v22.16.0: 23/23 focused tests PASS; `node --check` passed for the primitive and local focused test files. Superseding fixed-environment evidence: at exact HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`, the reviewer reran four related repository test files under Node v22.23.1 and recorded 48/48 PASS, including `d1-t2-security-primitives.test.mjs` and `platform-portal-totp-verifier.test.mjs`. The full repository `npm test` was also compared against baseline `bf200c47`: zero new failure names, all 28 added tests passed, and 156 baseline failures remained (a second candidate run had one additional timing-flake failure name, isolated 5/5 on both HEADs). This is comparative evidence, not an all-green suite. No hosted CI PASS is claimed. This is source/synthetic evidence only.

## 8. C2 acceptance status

Implemented in Draft:
- primitive-level HMAC and PII algorithms are now exercised through the source helper rather than test-local copies;
- active/retained key behavior and no legacy SHA-256 fallback;
- strict key ID, family and domain validation;
- Portal/Admin TOTP key separation, v3 AAD binding and rotation;
- strict T1 disposition for valid legacy v2, enc: and raw Base32 values: re-enrollment required; malformed values quarantine; no legacy secret is decrypted or re-encrypted.

Still OPEN:
1. Approve the actual key custody provider and per-Worker secret binding versus account-level Secrets Store use.
2. Name accountable key-custodian and Security owner roles.
3. Approve independent encrypted key escrow, recovery and incident revocation procedures.
4. Resolve wallet-first idempotency_key_hash and session_binding_hash compatibility.
5. Resolved by T1: Auth0-managed MFA owns target factors; no first-party TOTP key provisioning or legacy secret transfer for this migration. Synthetic enrollment/lifecycle proof remains open.
6. Define retention/replay windows needed before HMAC key retirement.
7. **Completed:** the separate 14-case PII security-vector file passed 14/14 under Node v22.23.1 as part of the exact T1 source-head five-file regression at `c6a70b3f`; this closes only the vector-test execution task, not key custody or C2 acceptance.
8. Complete the remaining owner decisions and the full T2 review. The bounded C1/C2 source-slice review is APPROVED at exact HEAD `bc3f8c9a`; it does not constitute full T2-C6 approval.

No production keys, Cloudflare Secrets Store, Worker bindings, D1 schema, customer rows, BWH host, deployment, dual-write, CI, PR Ready transition, merge or cutover were used or authorized by this ADR. BWH remains the only production writer.


## 9. Evidence update — 2026-11-08

PR #842 source-slice review is APPROVED by `gccltdco-cmd` (Review ID `5817529933`) and bound to exact HEAD `bc3f8c9a713de05715f42f733b8fa72ba53d4477`. Under Node v22.23.1, the reviewer reran four related repository test files and recorded 48/48 PASS, including this HMAC/TOTP primitive test file and the Portal TOTP verifier test file.

The full repository suite was also executed on candidate and baseline: 7,112 versus 7,084 tests; the 156 baseline failures all remained, all 28 added tests passed, and the failure-name difference was zero. The second candidate run had one additional usage-ledger timing-flake name, which passed 5/5 isolated runs on each HEAD. This is not an all-green repository suite and no hosted CI PASS is claimed.

Still outstanding: real key custody, named custodians, encrypted escrow and restore; Wallet-first legacy digest compatibility; synthetic Auth0 MFA enrollment/lifecycle proof (T1 target ownership is resolved); retention/replay windows; and the full T2 review. The separate 14-case PII vector test is now PASS at the T1 source head, but C2 remains OPEN.


## Owner decision update — T1 (2026-11-08)

The project owner selected Auth0-managed MFA as the target TOTP authority. Portal enrollment is optional; Admin enrollment is mandatory. All existing BWH enc: and v2: values are invalidated at cutover and require user re-enrollment. They must not be decrypted, imported, transferred or re-encrypted. C2-D05 is therefore resolved for this migration path; it does not close C2 overall. The first-party v3 TOTP primitive remains generic/unconfigured and must not be provisioned for the selected target path without a new owner decision.



## 10. T1 follow-up regression evidence — 2026-11-08

At exact source HEAD `c6a70b3f216d68c6ee7014af268645e1f9df5925`, Node v22.23.1, the following five source-importing test files passed **62/62 twice**, with zero failures and zero skips:

- `d1-t2-security-primitives.test.mjs`: 18/18
- `d1-t2-identity-boundary.test.mjs`: 10/10
- `platform-portal-identity-import-rehearsal.test.mjs`: 16/16
- `platform-portal-totp-verifier.test.mjs`: 4/4
- `d1-t2-security-vectors.test.mjs`: 14/14

`node --check` passed for all four service modules and five test files. Combined TAP log SHA-256 values: `8e467a8807cc3dd5c34b2ea7a02a1f99d6947101d326ea650dfa84aedc2b54be` and `43e852e42bb8bb5fa810e175ad6b0c1e804201f07913d385b4bf075fdd816811`. Full repository `npm test` and hosted CI were not run at this head. See `D1_T2_C1_C2_FIXED_NODE22_REGRESSION_2026-11-08.md` for source blob and file SHA-256 inventory. C2 remains OPEN.

## 11. Wallet-first handoff digest compatibility audit — 2026-11-08

The source-grounded inventory is recorded in `docs/D1_T2_C2_WALLET_FIRST_DIGEST_COMPATIBILITY_AUDIT_V1.md`.

The two handoff fields are generated with distinct domain-separated SHA-256 v1 labels over transient inputs; raw inputs are not persisted. The Portal route obtains the session reference from the authenticated session context. The default server session reference uses 12 random bytes. The first-party setup idempotency helper uses `crypto.randomUUID()` when available, but its fallback currently uses `Date.now()` plus `Math.random()`; this is a concrete hardening item, not a reason to re-key existing records.

Recommended disposition: preserve the exact v1 digest formula for compatibility, remove the weak UI fallback in favor of `crypto.getRandomValues()` (or fail closed), enforce canonical UUIDv4 at the Wallet-first service boundary, and keep the digest fields distinct from PII HMAC families. Existing hashes cannot be transformed to HMAC without the raw input.

The source proves a 10-minute claim lease, not a row-retention TTL. Delivered-row replay/acknowledgement retention and purge remain a bounded owner decision. C2-A04 is therefore partially source-audited but remains OPEN pending disposition and retention approval. No source behavior was changed by this documentation update.

## 12. Wallet-first idempotency entropy hardening — 2026-11-08

The first-party Portal setup idempotency fallback has been hardened on the child Draft branch: native `crypto.randomUUID()` is preferred; `crypto.getRandomValues()` constructs the UUIDv4 fallback; absence/failure of secure randomness fails closed. The Wallet-first service boundary now requires canonical lowercase UUIDv4. The legacy non-Wallet-first path and existing SHA-256 v1 digest formula are unchanged.

The five-case isolated helper harness passed under Node v22.16.0. The fixed Node v22.23.1 repository regression remains pending; this does not close C2-A04 or formal C2 acceptance.
