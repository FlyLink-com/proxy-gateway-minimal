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

### T2-C1 — Account identity custody and PII externalization

**Problem:** Source account metadata currently carries raw email values through `loginRef` / `displayRef` and a raw `displayName`. Several low-entropy email, IP, or registration-context SHA-256 digests are not anonymization.

**Required decisions and implementation contract**

1. Identify the authoritative identity store/service and accountable Identity/Privacy owner. Do not invent a new authority in D1.
2. Define stable opaque account and identity references. D1 may hold only the approved opaque reference and lifecycle facts.
3. Move raw email, display name, and any other direct identifier out of D1 rows, Worker request/response bodies, logs, traces, fixture snapshots, and evidence bundles.
4. Preserve the existing product behavior for registration deduplication, user-portal login identity display, administrator email search, administrator display name, and registration Coins canary through an explicitly authorized identity lookup path.
5. Decide which pseudonyms are necessary. If retained, use the separately specified domain-separated keyed digest; delete unnecessary low-entropy digests. Never describe an unkeyed SHA-256 of a low-entropy value as anonymous.

**Acceptance evidence**

- [ ] Data-flow diagram identifies the source of truth, D1 reference, lookup caller, authorization check, and failure behavior.
- [ ] Field-by-field disposition covers `loginRef`, `displayRef`, `displayName`, and every related identity/risk digest.
- [ ] Contract tests prove raw identity values cannot be persisted to D1 or emitted to Worker/log/evidence surfaces.
- [ ] Synthetic compatibility tests preserve registration dedupe, portal display, administrator search/display, and Coins-canary behavior.
- [ ] Historical-value handling is explicit: deterministic conversion, quarantine, or rejection; no silent fallback.
- [ ] Named Identity/Privacy owner approval is recorded.

**Required artifact:** identity-custody decision record plus synthetic compatibility tests.

### T2-C2 — HMAC key custody, rotation, and legacy digest compatibility

**Problem:** Idempotency and PII pseudonyms require a real custody/version/rotation contract. The existing wallet-first setup handoff `idempotency_key_hash` is a separate legacy unkeyed SHA-256 exception and is not one of the six raw idempotency fields.

**Required decisions and implementation contract**

1. Name the accountable key custodian role and the approved secret-management boundary. No key material may be committed, placed in D1, logged, or included in fixtures.
2. Define key IDs, algorithm/version envelope, domain separation, canonical input encoding, active-write key, candidate-read key set, rotation overlap, retirement condition, and emergency revocation.
3. New writes use only the active key. Reads may consider only explicitly configured retained key IDs. Unknown key IDs, malformed envelopes, and legacy bare SHA-256 values fail closed unless a separately approved compatibility path exists.
4. Preserve separate domains for the six raw idempotency values, provider-event dedupe, and PII pseudonyms. Never reuse one domain/key contract across semantically different identifiers.
5. Resolve `idempotency_key_hash` for wallet-first setup handoffs: identify callers and replay windows; choose explicit re-key, compatibility-read, or retirement behavior; prove duplicate prevention and recovery behavior.

**Acceptance evidence**

- [ ] Key-custody ADR names accountable role, secret boundary, access model, rotation and incident-revocation procedure; it contains no secret values.
- [ ] Envelope parser/writer tests cover valid active key, retained key, unknown key, malformed envelope, wrong domain, wrong version, empty input, and rotation overlap.
- [ ] Known-answer vectors independently verify canonical encoding and HMAC output for each domain.
- [ ] Tests prove no fallback from unknown/new envelopes to legacy bare SHA-256.
- [ ] Wallet-first handoff compatibility tests prove retry/replay does not create duplicate effects across the approved transition.
- [ ] Payment/commerce and Identity owners approve their respective domains and retention dependencies.

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
| T2-C1 Identity custody | PII/HMAC proposal exists; identity authority and externalization decision remain open | OPEN |
| T2-C2 HMAC and legacy compatibility | HMAC domains/vectors drafted; key custody approval and wallet-first digest decision remain open | OPEN |
| T2-C3 JSON/ref/generation | 26 writer paths mapped; exact allowlists and enforcement remain open | OPEN |
| T2-C4 Payment custody | DO SQLite proposal exists; owner, key, lifecycle, and outage decisions remain open | OPEN |
| T2-C5 Retention/G2 residuals | Retention register exists; RET-02–RET-12 and G2 residual dispositions remain open | OPEN |
| T2-C6 Independent review | Review packet exists; separate reviewer signature absent | OPEN |

No task is marked complete by this matrix. The work is not authorized to cross the production boundary described above.
