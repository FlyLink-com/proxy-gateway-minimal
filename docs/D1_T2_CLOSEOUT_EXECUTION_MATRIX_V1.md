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
5. Apply owner-selected T1 for TOTP: Auth0-managed MFA owns target factors; Portal enrollment is optional and Admin enrollment mandatory. All legacy BWH enc: and v2: values are invalidated at cutover and are never imported, decrypted, transferred or re-encrypted. Prove new enrollment, verification, lockout, recovery, revocation and outage behavior. D1 holds only approved state and opaque refs.
6. Preserve the existing product behavior for registration deduplication, password login, second-factor verification, user-portal identity display, administrator email search/display, and registration Coins canary through explicitly authorized identity/auth lookup paths.
7. Decide which pseudonyms are necessary. If retained, use the separately specified domain-separated keyed digest; delete unnecessary low-entropy digests. Never describe an unkeyed SHA-256 of a low-entropy value as anonymous.

**Acceptance evidence**

- [ ] Data-flow diagram identifies identity and authentication source(s) of truth, D1 references, login/lookup/verify callers, authorization checks, and failure behavior.
- [ ] Field-by-field disposition covers `loginRef`, `displayRef`, `displayName`, all related identity/risk digests, all 11 `platform_portal_password_credentials` columns, and `platform_portal_totp_credentials.encrypted_totp_secret`.
- [ ] Contract tests prove raw identity values, password hashes, encrypted TOTP secrets, and credential capabilities cannot be persisted to D1 or emitted to Worker/log/evidence surfaces.
- [ ] Synthetic compatibility tests preserve registration dedupe, password login, TOTP second-factor verification, portal display, administrator search/display, and Coins-canary behavior.
- [ ] Password-login remains supported through an approved credential authority; DEFER is not treated as permission to disable the current feature.
- [ ] Auth0/T1 MFA ownership, opaque credential binding, new enrollment, verification, recovery, revocation and outage behavior are proven; no first-party target TOTP AES keys are provisioned.
- [ ] Historical-value handling is explicit: deterministic conversion, quarantine, or rejection; no silent fallback.
- [ ] Named Identity/Privacy and Security owner approvals are recorded.

**Required artifact:** [C1 identity/authentication custody decision proposal](D1_T2_C1_IDENTITY_AUTH_CUSTODY_DECISION_V1.md) (DRAFT / partially owner-approved; Auth0/T1 decisions recorded, proof and remaining decisions open), [source audit](D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md), and synthetic compatibility tests.

### T2-C2 — Cryptographic key custody, HMAC rotation, and legacy digest compatibility

**Problem:** Idempotency and PII pseudonyms require a real custody/version/rotation contract. The existing wallet-first setup handoff `idempotency_key_hash` is a separate legacy unkeyed SHA-256 exception and is not one of the six raw idempotency fields. TOTP uses a separate AES-256-GCM protector: the current `v2:aes-256-gcm` envelope has no key ID, `USER_PORTAL_TOTP_SECRET_KEY` supplies the key, and the same protector is passed to both User Portal and Admin TOTP verification. The verifier also accepts legacy `enc:` values by stripping the prefix and treating the remainder as raw Base32; that prefix is not proof of encryption.

**Required decisions and implementation contract**

1. Name the accountable key-custodian roles and approved secret-management boundary for HMAC keys and AES-256-GCM credential-encryption keys. No key material may be committed, placed in D1, logged, or included in fixtures.
2. For HMAC, define key IDs, algorithm/version envelope, domain separation, canonical input encoding, active-write key, candidate-read key set, rotation overlap, retirement condition, and emergency revocation.
3. For first-party TOTP encryption, define a versioned envelope and separate Portal/Admin keys only if that route is separately selected. Under current owner-selected T1, Auth0 owns target MFA; do not provision target first-party TOTP keys and do not decrypt/re-encrypt legacy v2 values.
4. New HMAC writes use only the active key. Reads may consider only explicitly configured retained key IDs. Unknown key IDs, malformed envelopes, and legacy bare SHA-256 values fail closed unless a separately approved compatibility path exists.
5. Preserve separate HMAC domains for the six raw idempotency values, provider-event dedupe, and PII pseudonyms. Never reuse one domain/key contract across semantically different identifiers.
6. Under T1, treat legacy TOTP enc:/unprefixed Base32 and v2 envelope values as non-migrating credentials: invalidate at cutover and require re-enrollment. Never decrypt, transfer, import or re-encrypt them.
7. Resolve `idempotency_key_hash` for wallet-first setup handoffs: identify callers and replay windows; choose explicit re-key, compatibility-read, or retirement behavior; prove duplicate prevention and recovery behavior.

**Acceptance evidence**

- [ ] Key-custody ADR names accountable roles, HMAC and AES-GCM secret boundaries, access models, key separation, rotation/re-encryption, retirement and incident-revocation procedures; it contains no secret values.
- [ ] HMAC envelope parser/writer tests cover active/retained/unknown key, malformed envelope, wrong domain/version, empty input, and rotation overlap.
- [ ] Known-answer vectors independently verify canonical encoding and HMAC output for every domain.
- [ ] Tests prove no fallback from unknown/new HMAC envelopes to legacy bare SHA-256.
- [ ] T1 tests prove legacy v2, enc: and unprefixed Base32 values return re_enroll_required without decrypt/re-encrypt; new Auth0 MFA enrollment/verification/lifecycle proof is separate.
- [ ] User Portal/Admin key sharing is either removed with separate key domains or explicitly accepted by both accountable owners.
- [ ] Wallet-first handoff compatibility tests prove retry/replay does not create duplicate effects across the approved transition.
- [ ] Payment/commerce, Identity and Security owners approve their respective domains and retention dependencies.

**Required artifact:** key-custody/rotation ADR, compatibility decision for the wallet-first handoff digest, and reproducible synthetic vectors.

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
| T2-C1 Identity custody | Auth0 Essentials + Bulk User Import, >72-byte targeted reset, Portal/Admin isolation and T1 re-enrollment policy are owner-approved. T1 follow-up PR #843 is OPEN / DRAFT; tested source HEAD `c6a70b3f` (the 62/62 evidence anchor; APPROVED review 5817942288 binds this head only); PR head before this head-label correction commit `4be249a3`, differing from `c6a70b3f` by 3 documentation-only commits / 6 files; five-file fixed Node v22.23.1 regression passed 62/62 twice at the tested source HEAD. Real Auth0 tenant/provider proof, OIDC/JWKS gateway, password normalization/first-login rehash, email verification, MFA lifecycle, account display and identity ownership remain open | OPEN |
| T2-C2 HMAC and legacy compatibility | HMAC/PII primitives and strict T1 legacy TOTP classifier passed the same exact-head 62/62 two-run regression, including PII vectors 14/14. Actual key custody, named custodians, independent escrow/recovery, Wallet-first legacy digest compatibility, replay/retention/retirement and restore proof remain open | OPEN |
| T2-C3 JSON/ref/generation | 26 fields reconciled: 7 writer families closed, 16 existing source contracts retained/mapped, 2 Passkey fields DEFER, account metadata BLOCKED pending C1 identity custody; independent review absent | OPEN |
| T2-C4 Payment custody | DO SQLite proposal exists; owner, key, lifecycle, and outage decisions remain open | OPEN |
| T2-C5 Retention/G2 residuals | Retention register exists; RET-02–RET-12 and G2 residual dispositions remain open | OPEN |
| T2-C6 Independent review | PR #842 approval remains bound to `bc3f8c9a`. PR #843 is the T1 follow-up review vehicle; tested source HEAD `c6a70b3f` (62/62 tests passing twice; APPROVED review 5817942288 binds this head only); PR head `4be249a3` received docs-only incremental review 5858428230 = CHANGES_REQUESTED (head-label corrections); no approval binds `4be249a3`. Full T2 review across C1–C6, 820-field disposition, 26 JSON writers, payment custody, retention and G2 residuals remains outstanding | OPEN |

No task is marked complete by this matrix. The work is not authorized to cross the production boundary described above.


### Draft progress — 2026-11-07: C1/C2 executable source contracts

- C1: added `server/services/platform/d1-t2-identity-boundary.mjs` and `server/tests/d1-t2-identity-boundary.test.mjs`. The 9 focused tests cover strict opaque actor context, issuer/audience/expiry/factor checks, PII/credential-field rejection, exact account binding, duplicate/unknown/revoked fail-closed behavior and idempotent binding planning. This is a provider-neutral internal boundary contract; it does not verify OIDC/JWKS or implement a selected provider.
- C1 decision sheet: `docs/D1_T2_C1_OWNER_DECISION_SHEET_V1.md`. Historical status before the 2026-11-08 owner decisions: Auth0 Essentials was only a candidate and the >72 UTF-8-byte reset policy was pending. Superseded by the approved Auth0/T1 direction recorded below.
- C2: added `server/services/platform/d1-t2-security-primitives.mjs`, which the new `server/tests/d1-t2-security-primitives.test.mjs` imports directly. The source helper implements HMAC families/domains, strict key rings, active/retained rotation, PII lookup, lease digest grammar, Portal/Admin TOTP key separation, and a generic v3 AES-GCM primitive. T1 supersedes the historical synthetic v2 re-encryption proposal; legacy values now require re-enrollment or quarantine.
- Local mirror verification: Node v22.16.0, 23 C2 tests + 9 C1 tests = 32/32 PASS; syntax checks passed. This 2026-11-07 mirror-only verification note is superseded by the exact-HEAD Node v22.23.1 source-slice and full-suite comparative evidence recorded in the 2026-11-08 update below. No CI was triggered.
- Both C1 and C2 remain OPEN pending remaining owner decisions and hosted provider/key-custody proof. T1 resolves target TOTP ownership but not new-factor lifecycle proof or the other C2 custody gates. No real provider, secret store, key, BWH, D1, deployment or production data was accessed.


### Evidence update — 2026-11-08: C1/C2 exact-head source review

- Review vehicle: [PR #842](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/842), OPEN / DRAFT, not merged and not Ready.
- Review baseline: `bf200c474173d58d855fab66050a9c2b6b1ac4d4`.
- Exact reviewed source HEAD: `bc3f8c9a713de05715f42f733b8fa72ba53d4477`.
- Review ID: `5817529933`; reviewer account: `gccltdco-cmd`; result: `APPROVED`; submitted 2026-11-08T10:28:54Z.
- GitHub REST review `commit_id` exactly matches PR head; no `review_dismissed` event was found at verification time.
- Reviewed cumulative scope: 10 commits / 10 files / +1,836 −14, from the exact baseline to the exact source HEAD.
- Review conclusion is limited to the C1/C2 source slice. It is not formal C1/C2 gate acceptance and not the full T2-C6 review.

#### Fixed-environment tests and full-suite attribution

- Reviewer reran the four related repository test files at exact HEAD in Node v22.23.1: `d1-t2-security-primitives.test.mjs`, `d1-t2-identity-boundary.test.mjs`, `platform-portal-identity-import-rehearsal.test.mjs`, and `platform-portal-totp-verifier.test.mjs`: **48/48 PASS**.
- Full `npm test` comparative evidence at Node v22.23.1:
  - Baseline `bf200c47`: 7,084 tests; 6,922 passed / 156 failed / 6 skipped.
  - Candidate `bc3f8c9a`: 7,112 tests; first run 6,950 passed / 156 failed / 6 skipped; second run had 157 failures.
  - Failure-name comparison: every baseline failure also occurred on candidate; new-failure difference = 0; all 28 added tests passed.
  - The only candidate-only failure name was the usage-ledger kill-timer test; isolated runs were 5/5 PASS on each HEAD, consistent with a full-suite timing flake.
- This is a comparative no-new-regression result, **not** an all-green full-suite result. The 156 baseline failures remain present and outside this C1/C2 source-slice remediation scope.
- PR #842 has no hosted CI run. No CI PASS is claimed.
- The separate 14-case PII security-vector test file noted in the review packet has not yet been run as one complete suite under Node v22.23.1; the 48/48 result above does not supersede that outstanding check.

#### Remaining C1/C2 gate blockers

- C1: final provider selection; >72 UTF-8-byte password policy; Portal/Admin identity isolation; real OIDC/JWKS gateway and provider adapter; hosted synthetic compatibility proof; TOTP re-enrollment and lifecycle acceptance; accountable Identity/Privacy/Security owners.
- C2: actual Cloudflare key-custody boundary; named custodians; independent encrypted escrow/backup and restore; Wallet-first `idempotency_key_hash` and `session_binding_hash` compatibility; synthetic Auth0 MFA enrollment/lifecycle proof (T1 ownership choice is resolved); retention/replay windows and key-retirement proof.
- C1 and C2 therefore remain OPEN.

#### T2-C6 scope distinction

The approval by `gccltdco-cmd` is recorded as a separate GitHub-account review of the exact C1/C2 source slice. It does not by itself establish that the reviewer is a different natural person from the author, and PR #842 did not review all six T2 packages, the complete 820-field disposition, all 26 JSON writer paths, payment custody, retention, or G2 residuals. T2-C6 therefore remains OPEN pending the full-scope review and required independence evidence.

See [remaining owner decisions](D1_T2_C1_C2_REMAINING_OWNER_DECISIONS_2026-11-08.md) and [migration-readiness reassessment](D1_T2_MIGRATION_READINESS_REASSESSMENT_2026-11-08.md).


## Owner decision update — T1 (2026-11-08)

T1 supersedes earlier C1/C2 TOTP transfer, decryption and re-encryption proposals. Auth0-managed MFA is the target; Portal enrollment is optional and Admin enrollment mandatory. All existing BWH enc:, v2: and unprefixed legacy TOTP values are invalidated at cutover. No legacy secret is transferred or decrypted. The first-party v3 TOTP primitive is not provisioned for this migration. Required acceptance evidence is synthetic new-factor enrollment, verification, time-window, lockout, recovery, revocation and outage behavior.



### T1 follow-up fixed-environment evidence — 2026-11-08

- Exact source HEAD: `c6a70b3f216d68c6ee7014af268645e1f9df5925` (PR #843 head at test time; the PR head later advanced through documentation-only commits to `4be249a38c0347337cf51d92cf1fe81b60c2f659` before this head-label correction commit).
- Node v22.23.1; `node --check` passed for four service modules and five test files.
- Five test files: security primitives 18/18, identity boundary 10/10, Auth0 import rehearsal 16/16, Portal TOTP verifier 4/4, PII security vectors 14/14; total **62/62**, 0 failed, 0 skipped. Two combined runs both passed.
- This is bounded source-slice evidence. Full `npm test` was not run at this HEAD; no hosted CI run is claimed. PR #843 remains Draft; C1/C2 and T2 remain OPEN/BLOCKED.
