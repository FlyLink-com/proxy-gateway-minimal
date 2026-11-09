# D1 T2 Closeout Execution Matrix v1

> **Status:** Draft execution checklist. This document does not declare T2 PASS and does not authorize production migration.
> **Repository:** `FlyLink-com/proxy-gateway-minimal`
> **Draft branch:** `docs/d1-target-schema-g6-rehearsal-plan-20261107`
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`
> **Current Draft baseline before this document:** `b8cdbc17bfcc081c0f2afc5bd27bb23314868369`
> **Production authority:** BWH remains the only production writer.

## 1. Purpose and gate rule

Turn the remaining T2 blockers into six independently verifiable work packages. T2 remains **BLOCKED** until all six packages have evidence, the required domain-owner decisions are recorded, and a reviewer who did not author the implementation signs the exact reviewed commit.

The existing 820-field disposition map is structurally reviewed; it is not a target DDL approval or data-load authorization. The source audit has mapped 26 JSON columns, but mapping a writer is not the same as enforcing a closed schema at every persistence boundary.

### Non-negotiable execution boundary

- Repository source, documentation, and deterministic synthetic/local fixtures only.
- No BWH connection, production database inventory, customer-row access, production credential access, or production export.
- No real HMAC key creation or configuration in this phase.
- No remote D1 mutation, remote Worker/DO deployment, secret/binding/route/schedule/DNS change.
- No production dual-write, shadow-write, migration, traffic split, or writer-authority change.
- No CI is triggered by this document. Run only explicitly approved, scoped local tests until a separate CI decision is made.
- Do not mark a task complete from a proposal alone; attach exact commit, commands, outputs, and artifact hashes.

## 2. Six T2 work packages

All work packages begin OPEN. Existing design documents are inputs, not completion evidence.

### T2-C1 — Identity/authentication custody and PII externalization

**Problem:** Source account metadata currently carries raw email values through `loginRef` / `displayRef` and a raw `displayName`. Several low-entropy email, IP, or registration-context SHA-256 digests are not anonymization. The identity boundary also intersects active authentication: `portal-password-credentials.mjs` issues and verifies password hashes through the current control store, while the T2 field map marks the entire `platform_portal_password_credentials` table DEFER. The source path is conditionally wired when User Portal/Admin Auth routes are enabled; production activation is NOT OBSERVED. `platform_portal_totp_credentials.encrypted_totp_secret` is EXTERNALIZE while its status/lock/timestamp fields are KEEP. These dispositions must not silently disable an approved password/TOTP feature or cause credentials to be copied into D1.

**Required decisions and implementation contract**

1. Identify the authoritative identity and authentication service(s), their source-of-truth boundary, and accountable Identity/Privacy/Security owners. Do not invent a new authority in D1.
2. Define stable opaque account, identity, password-credential, and TOTP-credential references. D1 may hold only approved opaque references and non-secret lifecycle facts.
3. Move raw email, display name, password hashes, encrypted TOTP secrets, and any other direct identifier/authentication secret out of D1 rows, Worker request/response bodies, logs, traces, fixture snapshots, and evidence bundles.
4. Reconcile the active password-login path with the field-map disposition: `platform_portal_password_credentials` is DEFER and must not be copied into D1, but the existing login capability must remain available through an approved external credential-verification authority or an explicitly approved replacement. Do not silently turn off password login.
5. Reconcile TOTP custody: `platform_portal_totp_credentials.encrypted_totp_secret` remains EXTERNALIZE; define the external secret reference, encryption-key custody, verify path, enrollment, lockout, rotation, recovery, revocation, and outage behavior. D1 may hold only approved state and opaque refs.
6. Preserve the existing product behavior for registration deduplication, password login, second-factor verification, user-portal identity display, administrator email search/display, and registration Coins canary through explicitly authorized identity/auth lookup paths.
7. Decide which pseudonyms are necessary. If retained, use the separately specified domain-separated keyed digest; delete unnecessary low-entropy digests. Never describe an unkeyed SHA-256 of a low-entropy value as anonymous.

**Acceptance evidence**

- [ ] Data-flow diagram identifies identity and authentication source(s) of truth, D1 references, login/lookup/verify callers, authorization checks, and failure behavior.
- [ ] Field-by-field disposition covers `loginRef`, `displayRef`, `displayName`, all related identity/risk digests, all 11 `platform_portal_password_credentials` columns, and `platform_portal_totp_credentials.encrypted_totp_secret`.
- [ ] Contract tests prove raw identity values, password hashes, encrypted TOTP secrets, and credential capabilities cannot be persisted to D1 or emitted to Worker/log/evidence surfaces.
- [ ] Synthetic compatibility tests preserve registration dedupe, password login, TOTP second-factor verification, portal display, administrator search/display, and Coins-canary behavior.
- [ ] Password-login remains supported through an approved credential authority; DEFER is not treated as permission to disable the current feature.
- [ ] TOTP external custody has an explicit credential-ref, encryption-key, enrollment, verify, rotation, recovery, revocation, and outage contract.
- [ ] Historical-value handling is explicit: deterministic conversion, quarantine, or rejection; no silent fallback.
- [ ] Named Identity/Privacy and Security owner approvals are recorded.

**Required artifact:** [C1 identity/authentication custody decision proposal](D1_T2_C1_IDENTITY_AUTH_CUSTODY_DECISION_V1.md) (DRAFT / not owner-approved), [source audit](D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md), and synthetic compatibility tests.

### T2-C2 — Cryptographic key custody, HMAC rotation, and legacy digest compatibility

**Problem:** Idempotency and PII pseudonyms require a real custody/version/rotation contract. The existing wallet-first setup handoff `idempotency_key_hash` is a separate legacy unkeyed SHA-256 exception and is not one of the six raw idempotency fields. TOTP uses a separate AES-256-GCM protector: the current `v2:aes-256-gcm` envelope has no key ID, `USER_PORTAL_TOTP_SECRET_KEY` supplies the key, and the same protector is passed to both User Portal and Admin TOTP verification. The verifier also accepts legacy `enc:` values by stripping the prefix and treating the remainder as raw Base32; that prefix is not proof of encryption.

**Required decisions and implementation contract**

1. Name the accountable key-custodian roles and approved secret-management boundary for HMAC keys and AES-256-GCM credential-encryption keys. No key material may be committed, placed in D1, logged, or included in fixtures.
2. For HMAC, define key IDs, algorithm/version envelope, domain separation, canonical input encoding, active-write key, candidate-read key set, rotation overlap, retirement condition, and emergency revocation.
3. For TOTP encryption, define a versioned envelope carrying a key ID, key separation between User Portal and Admin authentication (or an explicit owner-approved shared-key exception), old-key decrypt/re-encrypt procedure, retirement condition, and emergency revocation. Do not assume the current keyless `v2:aes-256-gcm` envelope supports safe key rotation.
4. New HMAC writes use only the active key. Reads may consider only explicitly configured retained key IDs. Unknown key IDs, malformed envelopes, and legacy bare SHA-256 values fail closed unless a separately approved compatibility path exists.
5. Preserve separate HMAC domains for the six raw idempotency values, provider-event dedupe, and PII pseudonyms. Never reuse one domain/key contract across semantically different identifiers.
6. Treat legacy TOTP `enc:<base32>` or unprefixed Base32 values as raw secret material, not ciphertext. They must be re-encrypted under the approved key/version or quarantined/rejected before any target load.
7. Resolve `idempotency_key_hash` for wallet-first setup handoffs: identify callers and replay windows; choose explicit re-key, compatibility-read, or retirement behavior; prove duplicate prevention and recovery behavior.

**Acceptance evidence**

- [ ] Key-custody ADR names accountable roles, HMAC and AES-GCM secret boundaries, access models, key separation, rotation/re-encryption, retirement and incident-revocation procedures; it contains no secret values.
- [ ] HMAC envelope parser/writer tests cover active/retained/unknown key, malformed envelope, wrong domain/version, empty input, and rotation overlap.
- [ ] Known-answer vectors independently verify canonical encoding and HMAC output for every domain.
- [ ] Tests prove no fallback from unknown/new HMAC envelopes to legacy bare SHA-256.
- [ ] TOTP envelope tests cover key ID, old-key decrypt/new-key encrypt, wrong key, modified tag/ciphertext, unknown key, malformed envelope, and legacy `enc:` rejection/quarantine.
- [ ] User Portal/Admin key sharing is either removed with separate key domains or explicitly accepted by both accountable owners.
- [ ] Wallet-first handoff compatibility tests prove retry/replay does not create duplicate effects across the approved transition.
- [ ] Payment/commerce, Identity and Security owners approve their respective domains and retention dependencies.
- [ ] The dedicated Crypto Worker accepts only exact versioned internal operations, enforces caller identity/token authorization, bounds request bodies, fails closed, and exposes no public route.
- [ ] The Worker loads all purpose-separated HMAC key rings, rejects cross-family key-material reuse, never returns raw keys, and accepts only precomputed PII digests.
- [x] Miniflare Service Binding fixture with a separate synthetic authorized caller proves binding mechanics, user-auth-before-call, internal token separation, missing-binding/key-ring failure, and digest-only PII behavior (5/5 PASS twice). This is fixture evidence, not actual control-plane integration.
- [ ] Actual control-plane Service Binding integration is completed only after the C1 user/session and domain-authorization context exists; no generic public crypto relay route is allowed.
- [ ] Owner selects an independent external KMS/HSM provider/account and records distinct Key Custodian, Security Approver, Recovery Operator, and KMS Administrator roles.
- [ ] Provider key policy enforces non-exportable KEK use, separate admin/user permissions, two-person recovery approval, short-lived decrypt access, and audit retention.
- [ ] Escrow ciphertext and metadata-only manifest are stored in two independent locations; real non-production restore, AAD binding, HMAC known-answer, and permission-revocation tests pass.
- [ ] Crypto Worker and business control-plane identities have no KMS Decrypt/Unwrap permission.

**Required artifacts:** key-custody/rotation ADR; [Crypto Worker interface contract](D1_T2_C2_CRYPTO_WORKER_INTERFACE_CONTRACT_V1.md) and source-importing tests; [external escrow provider evaluation](D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md); separate Wallet-first handoff digest compatibility decision; reproducible synthetic vectors.

### T2-C3 — Closed JSON schemas, opaque-reference grammar, and generation fencing

**Problem:** The source audit maps 26 JSON columns, but multiple writers still accept generic objects, broad key scans, or unconstrained text. One direct Audit SQL writer bypasses the generic audit writer.

**Required decisions and implementation contract**

1. Define a versioned, closed schema or closed union for every in-scope JSON column. Unknown keys and unknown variants must fail closed.
2. Enforce validation at the persistence boundary, not only at API handlers or current producers.
3. Cover all discovered writer paths, including:
   - account and issuance metadata;
   - generic audit writer and direct `coin-commerce-initial-confirmation` SQL audit insert;
   - edge registered-node channel refs and metadata;
   - portal access-request event variants and wallet-first/reset writers;
   - second-factor allowed factors (unique `totp` / `passkey` enum);
   - Chinese and English commerce notices (count/length limits and URL, markup, PII, secret-like content rejection);
   - offer snapshots, accepted coin types, aggregate allocation, per-lot allocation, before/after wallet-balance snapshots, and order allocation snapshots.
4. Keep aggregate allocation and per-lot allocation as different schema variants. Do not collapse them into a permissive common object.
5. Define opaque-reference grammar, length/character bounds, namespace/version rules, and historical conformance behavior for every retained `*_ref` family in scope.
6. Define and enforce the observed generation grammar for `platform_edge_desired_state_notifications.generation` at the source writer and D1 boundary. Keep the field CONDITIONAL until the low-confidence source contract is resolved.
7. Preserve existing transaction atomicity: in particular, the direct audit writer and initial-confirmation business row must remain in the same transaction or use one shared validated writer without changing the evidence semantics.

**Acceptance evidence**

- [ ] Machine-readable 26-column matrix lists schema version, writer entrypoint(s), callers, validation function, allowed variants/keys, and test file.
- [ ] Static/source audit proves no in-scope persistence path bypasses the validators.
- [ ] Positive and negative tests cover every schema variant, unknown keys, unknown variants, malformed refs, excessive list sizes, oversized strings, URL/markup/PII/secret-like notice content, and invalid generation values.
- [ ] Transaction failure tests prove audit evidence and initial-confirmation state commit or roll back together.
- [ ] Passkey JSON remains DEFER until a production caller, schema, and retention contract are separately approved.
- [ ] Structural recheck against T1 confirms 820/820 disposition keys still match and no target-column collision was introduced.

**Draft progress — 2026-11-07:** The source writer now enforces the exact two observed generation formats and applies `safeControlRef` to notification `id`, `nodeRef`, `channelRef`, and `desiredStateRef`. The second-factor persistence writer rejects empty, duplicate, unknown and non-string factors. Implementation commits: `c39b3987b557274fce2b9c4aabbf11367454245f`, `2a6865bdafcb27f6a741f84171220d27eca77576`, and `11a4a8e6a7872a73cc1d5568a6255b2e0e983e4a`; integration assertions are in `254c0ad408052373de3e2963c3339bee18e9a89d`. A focused Node 22.16.0 validator harness passed 5/5 (SHA-256 `05d124b9461b10966f715b165f64ab5946249aa574c94dcf73b8a9cb5a1e9ab5`). The full `platform-subscription-control-db.test.mjs` file has not yet run; production historical generation values remain NOT OBSERVED, so C3 remains OPEN.

**Draft progress — 2026-11-07:** Issuance metadata is now restricted to the empty, exact CLI, or five-key wallet-first v1 chain variant at both generic create and wallet-first insert/update writers. Edge-node metadata now has an exact first-boot key/type/ref/fingerprint allowlist at the shared store writer. Source commits: `a1b55bcc33e745b7094c93141d4a05530812c216` and `559156cbf8c4f841a80b20b68289811fb89efbba`; regression tests: `0943ffe6b2f98841edb1ec58b866c4034bc3bbc4` and `4c0e3c7c32227dfbb581582f6e3123a495d366de`; preflight fixture alignment: `87e0147a8154b99339a8090f19e4793fc121196f`. Source-mirroring synthetic harnesses passed 10/10 per contract. The actual repository test files and CI have not run. Commerce notices are now bounded and screened at normalization, then revalidated immediately before final offer INSERT (max 8 per locale, 512 UTF-8 bytes/item, URL/markup/email/phone/IP/common-secret patterns rejected). Domain source `e0f568b91e58e74189fe65ace4de5c5623f7ffbe`, final writer `06e5c0dc7a04d3bafb87925982d5d52eefcbc145`, regex correction `60a3a8c200b7caf3bd09c47c19738d1da7fc8228`, tests `d8a055ec8b723c5f50a7402f478c466a4b452d70`; source-mirroring harness 14/14. Actual Node test file remains unrun. Audit metadata and portal event JSON now have shared writer contracts across all current source paths. Audit allows 8 entity/action variants; the initial-confirmation direct INSERT uses the shared fulfillment serializer without moving its atomic transaction. Portal event writers (generic upsert, wallet-first direct writes, link-reset direct write) all use the shared event union. Regression tests were added and malformed historical fixtures now bypass the writer via raw SQL intentionally. Pure source-mirroring event/fulfillment harness passed 30/30; actual repository Node tests and CI remain NOT RUN. C3 remains OPEN for account PII and full 26-field independent review.

**Required artifact:** versioned JSON schema/union registry, writer enforcement matrix, opaque-ref/generation contract, and synthetic tests.

### T2-C4 — Payment action URL / QR capability custody

**Problem:** `next_action_url` and QR/action payloads may contain bearer capabilities in paths, query strings, or encoded data. HTTPS validation alone is insufficient.

**Required decisions and implementation contract**

1. Confirm the accountable Payment/Security owner and the custody system. Durable Objects SQLite Storage is the current proposal, not an approved deployment or a predetermined final choice.
2. D1 stores only an opaque action reference, action type, provider expiry, lifecycle state, and minimum reconciliation metadata.
3. Raw URL/QR/capability payload is encrypted and stored outside D1; define encryption-key custody, per-action access authorization, and least-privilege retrieval.
4. Define expiry no later than provider expiry, terminal-state purge, redacted tombstone retention, replay prevention, and audit evidence.
5. Define restore, provider outage, DO/storage outage, key loss/rotation, and stale action behavior. Never log raw action URLs, QR contents, signed query strings, or bearer paths.

**Acceptance evidence**

- [ ] Payment action-custody ADR names owner, storage boundary, key custody, access path, expiry, terminal purge, tombstone rule, and outage/recovery behavior.
- [ ] D1 schema proposal contains references and lifecycle facts only; source scans and synthetic fixtures prove raw capability absence.
- [ ] Tests cover expired action, terminal purge, unauthorized retrieval, duplicate retrieval/replay, key rotation, and storage outage.
- [ ] Payment owner and Security owner approve the contract.

**Required artifact:** payment-action custody ADR and local synthetic security tests. No DO creation or deployment is part of this package.

### T2-C5 — Retention decisions and G2 compatibility residuals

**Problem:** Retention is not implied by `expires_at`, `valid_until`, lease TTL, or payment-order TTL. G2 also retains compatibility limitations that must be tested or explicitly carried as residual risk.

**Required decisions and implementation contract**

1. Assign named accountable roles for Identity/Privacy, Finance/Legal/Payment, Security/Compliance, Usage/Data, Portal, Ads/Privacy, Wallet/Commerce, and Agent operations as applicable. Do not invent people or retention periods.
2. For every data class, record active lifetime, post-terminal retention, purge trigger/cadence, purge owner, legal-hold behavior, redacted tombstone, and proof of deletion.
3. Keep the existing Leads 90-day purge as the only accepted numeric rule currently evidenced. Do not copy that duration to other classes by analogy.
4. Resolve the retention register's RET-02 through RET-12, including raw usage, finance/ledger/receipts, audit, idempotency/provider replay, sessions/challenges, portal events, deferred transitions, consent, account pseudonyms, payment tombstones, and deferred passkey credentials.
5. Carry G2 residuals explicitly:
   - 58 FK and 27 CHECK checks were attribution-limited in the accepted evidence;
   - 60 ordinary full indexes were definition-only;
   - multi-replica `withSession()` read-after-write behavior remains unverified;
   - concurrent-write pagination snapshot semantics remain unverified.
6. For each G2 residual, either add a scoped synthetic probe in G6 or record a named owner, impact, mitigation, and explicit residual-risk acceptance. Never relabel an untested property as PASS.

**Acceptance evidence**

- [ ] Retention register has an owner and approved rule for every included data class; unresolved rows remain explicitly OPEN and excluded from T2 PASS.
- [ ] Purge/tombstone tests prove bounded retention without deleting required immutable financial/audit facts.
- [ ] G2 residual matrix maps every limitation to a G6 test or a named risk acceptance.
- [ ] Privacy, Finance/Legal, Security/Compliance, and relevant domain owners sign their decisions.

**Required artifact:** approved retention decision register and G2 residual-risk/test matrix.

### T2-C6 — Independent review and formal T2 gate decision

**Problem:** The existing independent review packet is prepared, but no separate reviewer has signed it. A self-review by the author is not an independent sign-off.

**Required decisions and implementation contract**

1. Select a reviewer who did not author the relevant contracts or implementation. Record reviewer identity and review scope.
2. Pin the exact Draft commit and hashes of all reviewed artifacts, tests, and generated evidence.
3. Review all six work packages, the 820-field map, 26-column writer matrix, synthetic vectors, source-diff scope, and all G2 residuals.
4. Require findings to be closed with evidence or explicitly accepted by the accountable owner. No silent waiver and no scope expansion.
5. Record one of: PASS, PASS WITH EXPLICIT RESIDUALS, or BLOCKED. T2 may not be marked PASS while a mandatory blocker or owner decision remains open.

**Acceptance evidence**

- [ ] Reviewer is independent of the author and is explicitly identified.
- [ ] Review packet identifies exact commit SHA, file hashes, test commands, environment, results, and limitations.
- [ ] Every finding has a disposition, evidence, and accountable approver.
- [ ] Formal T2 decision is recorded in the repository and project log.
- [ ] No PR is marked Ready, merged, or deployed by this package.

**Required artifact:** signed independent review report and T2 gate decision.

## 3. T2 exit criteria

T2 may advance only when all are true:

- [ ] T2-C1 through T2-C6 have accepted evidence.
- [ ] Every mandatory domain decision has a named accountable owner and recorded approval.
- [ ] All 26 JSON writer paths are enforced or explicitly excluded with a proven reason.
- [ ] Raw identity, payment capabilities, credentials, and secrets are absent from D1 payloads, Worker outputs, logs, fixtures, and evidence.
- [ ] HMAC domains, key custody, rotation, legacy compatibility, and retention are mutually consistent.
- [ ] G2 compatibility limitations are closed by evidence or accepted as explicit residual risks.
- [ ] Independent reviewer signs the exact final commit.
- [ ] The field disposition map is revalidated against T1.

A T2 structural PASS alone is insufficient. A proposal document alone is insufficient.

## 4. T3 entry and deliverables — target D1 DDL proposal

T3 begins only after the formal T2 gate decision. T3 is still repository/local-only.

Deliverables:

1. Pin the exact approved source commit and rerun all 19 source migration checksum exports at that commit; record actual runtime output.
2. Generate the target DDL from the approved field disposition and T2 contracts; preserve exact source semantics where supported and document every transformation.
3. Use a dedicated local proposal migration namespace. Do not reuse source production migration IDs or imply Wrangler migrations have already been applied.
4. Keep the source `platform_schema_migrations` provenance distinct from Wrangler `d1_migrations`.
5. Include table/column/FK/CHECK/index/trigger inventories and an explicit treatment for conditional archive and feature-gated consent objects.
6. Document D1 compatibility differences, transaction boundaries, keyset pagination, read-after-write/session behavior, and all remaining residual risks.
7. Add schema-level synthetic tests and an independent review of the exact DDL proposal.
8. Do not create or apply remote D1 migrations.

**T3 exit:** exact source checksums, target DDL, mapping, compatibility report, and schema tests all pass independent review. T3 exit still does not authorize data loading or production cutover.

## 5. G6 entry and deliverables — offline migration rehearsal

G6 begins only after the T3 target DDL proposal is reviewed. Use deterministic synthetic fixtures and an isolated local D1/Miniflare environment only.

Required rehearsal evidence:

- Deterministic fixture manifest and SHA-256; include WAL-clean and deliberately active-WAL cases with fail-closed snapshot behavior.
- Exact 19/19 source migration checksum runtime re-execution at the pinned source commit.
- Parent/child load ordering, bounded batches, checkpoint atomicity, idempotent resume, duplicate replay, partial failure, and corrupted-manifest rejection.
- Per-table counts, exclusions, rejection counts, normalized non-sensitive digests, FK/CHECK/unique checks, index/trigger inventories, and financial/business invariants.
- Sensitive-data scanner proves zero raw PII, credentials, subscription material, lease tokens, idempotency tokens, payment capabilities, or secrets in D1, Worker output, fixtures, logs, and evidence.
- Wallet/Commerce, Payment, Referral/Bonus, entitlement/issuance, deferred transitions, and Agent receipt/replay invariants.
- Crash injection at every checkpoint boundary, destroy/recreate, export/restore to a fresh isolated database, and full post-restore reconciliation.
- Measured duration/throughput/restore time, explicitly not extrapolated to production RPO/RTO.
- Independent review of the exact rehearsal commit and complete evidence bundle.

**G6 exit:** all mismatches are zero or explicitly explained and approved; all required invariants pass; recovery and restore are reproducible; sensitive-data scan is clean; independent review signs the exact commit.

G6 PASS authorizes only consideration of the next separately gated step. It does not authorize remote staging changes, production migration, G7 cutover, or G8 recovery execution.

## 6. Current execution ledger

| Package | Current evidence | Status |
|---|---|---|
| T2-C1 Identity custody | C1 custody proposal + provider evaluation + [owner decision sheet](D1_T2_C1_OWNER_DECISION_SHEET_V1.md); provider-neutral opaque actor-context and identity-binding helper/tests added; Auth0 Essentials remains preferred candidate, not selected; hosted provider proof and owner decisions remain outstanding | OPEN |
| T2-C2 HMAC and legacy compatibility | [C2 key custody/rotation ADR](D1_T2_C2_KEY_CUSTODY_AND_ROTATION_ADR_V1.md) + executable Web Crypto primitives + synthetic escrow contract; **target architecture approved 2026-11-08** (Crypto Worker/private Service Binding, per-Worker secrets, independent encrypted escrow/two-person recovery, key-family separation, active-write/retained-read rotation). Named custodians, concrete escrow mechanism and real recovery, non-production integration, domain-owner approvals, Wallet-first replay/retention decision and independent review remain open | OPEN |
| T2-C3 JSON/ref/generation | 26 fields reconciled: 7 writer families closed, 16 existing source contracts retained/mapped, 2 Passkey fields DEFER, account metadata BLOCKED pending C1 identity custody; independent review absent | OPEN |
| T2-C4 Payment custody | DO SQLite proposal exists; owner, key, lifecycle, and outage decisions remain open | OPEN |
| T2-C5 Retention/G2 residuals | Retention register exists; RET-02–RET-12 and G2 residual dispositions remain open | OPEN |
| T2-C6 Independent review | Review packet exists; separate reviewer signature absent | OPEN |

No task is marked complete by this matrix. The work is not authorized to cross the production boundary described above.


### Draft progress — 2026-11-07: C1/C2 executable source contracts

- C1: added `server/services/platform/d1-t2-identity-boundary.mjs` and `server/tests/d1-t2-identity-boundary.test.mjs`. The 9 focused tests cover strict opaque actor context, issuer/audience/expiry/factor checks, PII/credential-field rejection, exact account binding, duplicate/unknown/revoked fail-closed behavior and idempotent binding planning. This is a provider-neutral internal boundary contract; it does not verify OIDC/JWKS or implement a selected provider.
- C1 decision sheet: `docs/D1_T2_C1_OWNER_DECISION_SHEET_V1.md`. Auth0 Essentials remains a recommended managed candidate, not selected. The >72 UTF-8-byte password reset decision is still required; Keycloak custom scrypt remains the no-reset alternative.
- C2: added `server/services/platform/d1-t2-security-primitives.mjs`, which the new `server/tests/d1-t2-security-primitives.test.mjs` imports directly. The new source helper implements HMAC families/domains, strict key rings, active/retained rotation, PII lookup, lease digest grammar, Portal/Admin TOTP key separation, v3 AES-GCM AAD and synthetic v2 re-encryption.
- Local mirror verification: Node v22.16.0, 23 C2 tests + 9 C1 tests = 32/32 PASS; syntax checks passed. The project-fixed Node v22.23.1 exact repository test run remains outstanding. No full repository suite or CI was triggered.
- Both C1 and C2 remain OPEN pending owner decisions and hosted provider/key-custody proof. No real provider, secret store, key, BWH, D1, deployment or production data was accessed.

## 9. C4/C5 parallel source and synthetic progress — 2026-11-08

### T2-C4 — Payment action custody
- Confirmed the live source exposure in `server/services/platform/payment-store.mjs`: raw `next_action_url` is inserted into payment receipts and returned by receipt/order projections while an order is active. The 10-minute order TTL is not a capability retention policy.
- Added a provider-neutral, synthetic-only AES-256-GCM custody contract and tests. Fixed Node v22.23.1 isolated regression: 14/14 PASS; `node --check` 2/2 PASS.
- The prototype has no I/O and is not connected to payment-store, provider callbacks, D1, Worker routes, or a Durable Object. No DO namespace, key, secret binding, or deployment was created.
- C4 remains OPEN pending Payment/Security owner approval of the custody system, key lifecycle, resolver access, outage/recovery, and tombstone replay window.

### T2-C5 — Retention/G2 residuals
- Added `docs/D1_T2_C5_SOURCE_RETENTION_AUDIT_V1.md` and linked it from the retention decision register.
- Confirmed Leads 90 days (plus 2-hour backup prune safety margin) is the only accepted numeric record-retention rule currently evidenced.
- Documented the distinction between active TTL/lease windows and record retention for payment orders, deferred quotes, Portal sessions/challenges, Wallet-first handoffs, and payment-action capabilities.
- The inspected repository paths do not expose a dedicated persistent Portal session/challenge purge method or payment receipt/order purge method; this is recorded as an inspection finding, not a claim about external operator jobs.
- No new numeric retention duration is approved. RET-02–RET-12 remain OPEN/DEFERRED.

### Gate status
C4 and C5 remain OPEN. This source/prototype progress does not close T2, authorize D1 DDL/data loading, or change the production writer. BWH remains the only production control-data writer.

## 10. C3 shared JSON contract focused regression — 2026-11-08

The existing C3 shared JSON contract module/test were fetched from this branch and run in the isolated non-production sandbox under Node v22.23.1:

- `server/tests/control-json-contracts.test.mjs`: **7/7 PASS**, 0 failed, 0 skipped.
- TAP SHA-256: `66b5fb22e9f760c908181c3337cb3cd0f24e8235d1ee8751142e4ad9dc7d8c8d`.
- `node --check`: source and test 2/2 PASS.
- Source blob: `f9e7e4841c11bf77bcfd1aa74df867159013b5ac`.
- Test blob: `0be5a56462402f87a9a5f76666dd9d42ae04e0ff`.

This covers the registered Portal access-event and subscription-fulfillment JSON variants, exact keys, unsafe refs/values, accessor/symbol/non-plain-object rejection and hostile proxy traps. It is not the full C3 writer integration test: `platform-subscription-control-db.test.mjs` and the complete 26-field writer-path review remain unrun. C3 remains OPEN for account metadata/PII and full writer-path evidence.

## 11. C2 grouped key-custody proposal — 2026-11-08

Added `docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md` to consolidate the remaining C2 owner decisions into one grouped approval: crypto Worker/private Service Binding, per-Worker secret binding default, independent encrypted escrow/two-person recovery, key-family separation, active-write/retained-read rotation, and synthetic restore acceptance.

The previous Wallet-first compatibility recommendation in the C2 ADR is superseded by the source audit: preserve the exact domain-separated SHA-256 v1 contract after secure UUIDv4 source hardening; do not add these high-entropy transient token digests to the PII HMAC key family. The delivered-row replay/retention window remains open.

No production key or secret was created. C2 remains OPEN pending the grouped owner decision and synthetic restore evidence.

## 12. C2 synthetic escrow/restore contract — 2026-11-08

Added a pure synthetic AES-256-GCM key-escrow envelope contract and 10-case test. It verifies key ID/family/algorithm AAD, restore under the correct wrapping key, wrong-key/tamper rejection, metadata-only inventory projection, and no key material reuse across families.

Fixed Node v22.23.1 isolated regression: 10/10 PASS twice; `node --check` 2/2 PASS. Evidence and TAP hashes are in `docs/D1_T2_C2_KEY_CUSTODY_OWNER_DECISION_PROPOSAL_V1.md`.

This does not create a real key, external escrow, KMS/HSM integration, Cloudflare secret binding, or production restore. C2 remains OPEN pending the grouped owner decision and real custody plan.

## 13. G6 source-only schema inventory validator — 2026-11-08

Added an offline read-only validator for the pinned source inventory:

- `server/services/platform/d1-control-schema-inventory-contract.mjs`
- `server/tests/d1-control-schema-inventory-contract.test.mjs`
- `scripts/validate-d1-control-schema-inventory.mjs`

The validator checks source-only status, production-writer authority, declared vs recomputed counts, 70 table/820 column totals, 126 foreign-key edges, 88 indexes, 91 triggers, 48 core tables/530 core columns, 22 companion tables/290 companion columns, 19 source migration ordinals/checksums, per-table source blob fingerprints, explicit exclusions, and all production mutation/connection/merge/cutover authorization flags remaining false.

Fixed Node v22.23.1 in the isolated non-production sandbox:
- Inventory CLI: PASS; source commit `be261abc60f28bb2733764fa5364ab44b3e76844`.
- 10/10 PASS twice, 0 failed, 0 skipped.
- Run 1 TAP SHA-256: `a1e2a22d66b9a7af1fd687226ed1767f134dcd27733553e53c15914ed6d99c0b`.
- Run 2 TAP SHA-256: `d5dbf5014978818a4f98cac48110512fbb8cf17e2fc74468dde3dada3b08752b`.
- `node --check` passed for the validator module, test, and CLI (3/3).

This validates the checked-in source inventory artifact only. It does not establish live BWH schema state, D1 parity, current migration application state, or authorize target DDL/data loading. G6 remains an offline rehearsal gate; production database migration remains unauthorized.

## 14. C3 account metadata 26-field disposition audit — 2026-11-08

Added `docs/D1_T2_C3_ACCOUNT_METADATA_26_FIELD_DISPOSITION_AUDIT_V1.md` after exact review of the current child-branch `ACCOUNT_METADATA_FIELDS` and `ACCOUNT_METADATA_DIGEST_FIELDS` source declarations:

- Exact allowlist: **26/26 fields**.
- Unkeyed SHA-256 digest fields: **8/8 identified**.
- Raw email/login and display identifiers separated from opaque Auth0 subject mapping.
- Consent evidence separated from generic account metadata.
- Business policy fields separated from identity/profile data.
- Privacy-sensitive use-case, IP and request-correlation digests default to DROP unless a specific purpose and owner approve keyed, time-bounded processing.

The source module currently documents that the allowlist is a legacy BWH source-writer contract, not a D1 target projection. The disposition audit does not read production values or authorize migration. C3 remains OPEN pending Account/Identity, Privacy and Legal decisions plus a target writer integration regression.

## 15. G6 inventory graph and referential-integrity validator — 2026-11-08

Hardened `server/services/platform/d1-control-schema-inventory-contract.mjs` and its regression suite beyond declared totals:

- Recompute and compare all global and layer-specific counts: 70 tables, 820 columns, 126 FK edges, 88 indexes, 91 triggers; core/companion breakdowns also match.
- Resolve every FK edge to real source/target tables and columns, enforce column arity, layer consistency and known delete actions.
- Resolve every index to an existing table/column, including ASC/DESC order terms; validate uniqueness flag and predicate shape.
- Resolve every trigger to an existing table and supported timing/event shape.
- Bind every table/index/trigger source path + Git blob to the inventory's pinned source-file list.
- Verify table-to-migration references, unique source paths, dependency graph node/kind validity and acyclicity.
- Preserve all source-only and no-production authorization assertions.

Fixed Node v22.23.1, isolated sandbox with network denied during test execution:
- CLI: PASS; validates the pinned source inventory at source commit `be261abc60f28bb2733764fa5364ab44b3e76844`.
- Regression suite: **23/23 PASS twice**, 0 failed, 0 skipped.
- Run 1 TAP SHA-256: `cd2e4b13004aa87c6b4d9889d6f948f067a5faf9f6755da3ea433dbce61e5603`.
- Run 2 TAP SHA-256: `f7649cc1cd8e0ac32cd087b85374207febb9cd80bf71f2097702553880fd4587`.
- `node --check`: 3/3 PASS (validator module, test, CLI).

This is a stronger structural consistency check over the checked-in source inventory. It does not establish live BWH schema state, D1 parity, or source migration ledger application history. It does not apply DDL or load rows; G6 remains offline-only.

## 16. G6 source migration checksum re-execution — 2026-11-08

Added a read-only registry of the actual source-module checksum exports and a CLI verifier:

- `server/services/platform/d1-source-migration-registry.mjs`
- `scripts/validate-d1-source-migration-checksums.mjs`
- `server/tests/d1-source-migration-registry.test.mjs`
- `server/services/platform/payment-store-migrations.mjs` now exposes its existing primary and legacy-archive migration IDs/checksums as a frozen read-only metadata array. No migration behavior or SQL was changed by this export.

The registry imports the real source migration modules (with a throwing `better-sqlite3` stub in the isolated audit sandbox; no database object was constructed) and recomputes the checksums from the modules' existing DDL statements at module load.

Fixed Node v22.23.1:
- **19/19 source migration IDs and DDL SHA-256 checksums match** the pinned source inventory, including the legacy payment archive, Wallet-first/deferred migrations, Portal registration contract, plan switch and Plan C guard.
- CLI: PASS, `expectedCount=19`, `actualCount=19`, `errors=[]`.
- Regression suite: **5/5 PASS twice**, 0 failed, 0 skipped.
- Run 1 TAP SHA-256: `866720d017740772d8293d09e1630691fd32bc7377ce3270d773420de261eb5d`.
- Run 2 TAP SHA-256: `afd3a6f0f8cc6eb9314150342bc96574c3390a872dcf28fc5aadac530a35f192`.
- `node --check`: 19/19 PASS across the imported source modules, registry, test and CLI.

This closes the current-head source DDL checksum re-execution gap for these 19 recorded migrations. It does **not** establish which migrations were ever applied to BWH, their live database identity, or target D1 migration parity. No BWH connection, database read, DDL apply, or row load occurred.

### G6 combined offline acceptance — 2026-11-08

Combined the inventory graph validator and 19-migration source checksum registry into one fixed-runtime regression invocation:

- Node v22.23.1.
- **28/28 PASS twice**, 0 failed, 0 skipped.
- Run 1 TAP SHA-256: `c2ccf80753c8d78eb69e4fe746454c6d26a9f39f76b4ba1ecff9289be2b8a292`.
- Run 2 TAP SHA-256: `692ac794e51cde8cf3e545eca6aecbece80ba215d67fafeff4d6e6d25f55bc91`.

This is combined offline source-artifact acceptance, not a migration rehearsal against a SQLite backup or D1 database.

## 17. T2 field disposition integrity validator — 2026-11-08

Added a machine-checkable integrity contract for the full T2 field disposition artifact:

- `server/services/platform/d1-field-disposition-contract.mjs`
- `server/tests/d1-field-disposition-contract.test.mjs`
- `scripts/validate-d1-field-disposition.mjs`

The CLI verifies the exact inventory Git blob identity and cross-checks all 70 source tables / 820 source columns against the 70 table dispositions / 820 field rows. It validates source type/nullability/PK/unique/default/CHECK metadata, ordinal/order, rule and retention references, test catalog references, inclusion semantics, target column uniqueness, table-level candidate counts, all disposition totals, low-confidence count, DEFER table containment, and the proposal-only / no-production authorization boundary.

Fixed Node v22.23.1:
- CLI: PASS; source inventory Git blob `b04cb13b483cb9088418f9dd469760380cbf6b74` matches the field-map pin.
- Exact map: 70 tables / 820 fields / 790 target candidates / 1 low-confidence field.
- Table dispositions: KEEP 64 / CONDITIONAL 4 / DEFER 2.
- Field dispositions: KEEP 712 / CONDITIONAL 59 / EXTERNALIZE 7 / TRANSFORM 19 / DEFER 23.
- Regression suite: **12/12 PASS twice**, 0 failed, 0 skipped.
- Run 1 TAP SHA-256: `85c13859f2fb0447f33faf72e68e5bdd6ccacfb703c9accab0c2f946ed962307`.
- Run 2 TAP SHA-256: `902011d53397d11d771718487d5b83dc5c010894e761b43eeac1a210079bed6d`.
- `node --check`: 3/3 PASS (contract, test, CLI).

This closes the structural integrity check for the proposed field map, not its domain-owner approval. The one low-confidence generation field and conditional inclusion rules remain explicitly proposed. T2 remains OPEN; no T3 DDL or production migration is authorized by this validation.

## 18. C3 full 26-field writer review and source SQLite regression — 2026-11-08

Added two C3 evidence documents:

- `docs/D1_T2_C3_ACCOUNT_METADATA_SOURCE_TARGET_CONTRACT_V1.md`
- `docs/D1_T2_C3_JSON_26_FIELD_WRITER_REVIEW_V1.md`

The latter records the complete 26-field JSON inventory: 24 active fields have identified writer/reader/transform contracts and focused dynamic coverage; two Passkey credential fields remain explicitly DEFERRED under the future-auth gate. The account metadata field now has a bounded BWH source-writer contract and a pure D1 projection gate. The D1 projection fails closed while raw identity/display fields or legacy unkeyed digests remain; it does not silently discard them.

### Fixed-runtime source test evidence

The evidence documents are based on source and test blobs byte-identical to the current PR #846 branch:
- `subscription-control-db.mjs`: `2bbdc573ec13fd8774ee87bf0904ce8aa7c51454`.
- `platform-subscription-control-db.test.mjs`: `e5ef7c2f87236457b2b01dc9e607905a76d73cb5`.
- `control-json-contracts.mjs`: `9d76d64d897707e5689fe94c275f548ee858707c`.
- `control-json-contracts.test.mjs`: `a60b27f3bdd5d6608e3ba4f8b574eba55fb0e442`.

Recorded isolated Node v22.23.1 / better-sqlite3 12.10.0 / SQLite 3.53.1 results:
- Full SQLite control-store suite: **45/45 PASS twice**; TAP SHA-256 `b7d0e4da530d0b2ae4535adbeeaf27be45c7bb835f0a68c9e76a8d5637ade74a` and `690d044fa2d92675d193827d0bd0192e5c57c80dc54f62da40f27395b23cbc30`.
- Five focused groups: **290 distinct cases per pass**, 5/5 suite groups PASS twice; **580 successful test executions** across both passes.
- Group sizes: 45 control-store; 48 JSON/payment/key-escrow/inventory; 113 commerce; 68 deferred/referral/Portal; 16 Wallet-first.

This closes the source-only 26-field writer/transform inventory review. It does not close the remaining Auth0 identity externalization or C2 keyed-digest replacement. It does not authorize a D1 account-row load or target DDL. T2 remains OPEN.


## 19. C2 target architecture owner decision — 2026-11-08

The project owner approved the C2 target architecture baseline recorded in the C2 owner decision proposal and key custody/rotation ADR.

Approved design baseline:
- Dedicated Crypto Worker and private Service Binding; no public key-operation endpoint or raw key return.
- Per-Worker secret bindings by default; Secrets Store only for demonstrated sharing.
- Independent encrypted escrow outside Cloudflare/GitHub/Notion, with two-person recovery/revocation.
- Separate key material and domains by purpose.
- Active-write / retained-read rotation and evidence-based retirement.
- No first-party Portal/Admin TOTP AES provisioning under T1/Auth0-managed MFA.

Not included: named people, concrete KMS/HSM/offline escrow provider, real keys or bindings, deployed Crypto Worker, non-production integration, actual external recovery rehearsal, Wallet-first digest/replay-retention disposition, payment/PII domain approvals, or production change authorization.

C2 remains OPEN. The synthetic escrow contract passed 10/10 twice under Node v22.23.1, but this is not real escrow or production restore evidence. BWH remains the only production control-data writer; no BWH access, production data read, D1 mutation, Worker/DO deployment, dual-write or cutover is authorized.


**Draft progress — 2026-11-08 (Crypto Worker v1):** Added the versioned interface contract and dedicated Worker source. The source provides idempotency, provider-event and PII HMAC create/candidates/verify operations; PII inputs are digest-only. The three key-ring families are loaded and checked for cross-family reuse on each request. Caller auth, current/previous token overlap, exact schemas, 16 KiB body cap, generic fail-closed errors, no public route, and no persistent bindings are covered by 11/11 focused tests twice under Node v22.23.1; node --check 3/3 PASS. Wrangler 4.99.0 deploy --dry-run passed (28.19 KiB / 6.42 KiB gzip). The Service Binding integration, real secret provisioning, escrow, owner/domain approvals and independent review remain OPEN. No deployment or production operation occurred.


**Draft progress — 2026-11-08 (Miniflare Service Binding proof):** A separate synthetic caller Worker and Crypto Worker now run in two Miniflare instances joined by a private Service Binding. The focused suite passed 5/5 twice under Node v22.23.1; TAP hashes 3b17bb52a8c6997bf184023e2b15ff36fb01e30c158b7ef6bb19fa14ae2dc90b and 64db515f7eb070728f4c55fb9eded1c16a30f86956803827f232a6d93a018ae4; syntax 4/4 PASS. This proves binding mechanics and separate caller credentials only. The actual G3 control-plane has no end-user/domain authorization context yet, so its binding declaration and route wrapper remain deferred rather than adding a generic public crypto relay.


**Draft progress — 2026-11-08 (external escrow evaluation):** Added [D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md](D1_T2_C2_EXTERNAL_ESCROW_PROVIDER_EVALUATION_V1.md). Google Cloud KMS is the leading technical candidate when no independent provider account is already preferred; AWS KMS is an equivalent alternative where a separate AWS organization/account exists; Azure Key Vault is an option for an existing Azure tenant. The evaluation defines non-exportable KEK, metadata-bound AAD/encryption context, distinct admin/user roles, two-person break-glass approval, audit, two ciphertext copies, and isolated restore/revocation acceptance. No provider or resource is selected/created. C2 remains OPEN.
