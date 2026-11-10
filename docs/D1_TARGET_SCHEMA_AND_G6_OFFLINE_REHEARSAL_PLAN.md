# D1 Target Schema & G6 Offline Migration Rehearsal Plan

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_target_schema_g6_offline_rehearsal_plan
  superseded_by: null
  last_verified_at: 2026-11-10
  production_authority: false
```


> **Status:** Draft proposal — repository-only, source/fixture-only.
> **Source anchor:** `master@be261abc60f28bb2733764fa5364ab44b3e76844`.
> **Risk boundary:** B for repository documentation and isolated synthetic/local D1 tests. This document authorizes no BWH access, production inventory, remote Cloudflare resources, production data export, D1 apply, Worker deployment, DNS, or traffic cutover.
> **Owner decision:** Target direction approved; this plan is a technical proposal for review, not production execution authority.

Last updated: 2026-11-07 (America/Los_Angeles).

## 1. Executive decision

The first Cloudflare D1 target is **one database corresponding to the existing shared BWH `control.sqlite` boundary**. Do not split by domain and do not merge the other stores into this database.

- Current production writer remains Node/Express + SQLite on BWH until a separately approved Risk A cutover.
- Future target writer is Cloudflare Worker + one D1 database.
- BWH remains the runtime, renderer, protected material-custody and Agent execution environment.
- JP/Vultr nodes remain data-plane runtime.
- `subscriptions.sqlite`, the optional third-party subscription database, and raw edge credential-material files remain outside G6's first-D1 data scope.
- No dual write, shadow write to remote D1, or traffic split is permitted during the preparation/rehearsal phases.

G6 is an **offline migration rehearsal** using deterministic synthetic data or a separately approved immutable fixture. It is not G5 remote staging, G7 production cutover, or G8 post-cutover recovery authorization.

## 2. Source baseline and evidence scope

The source inventory currently recorded for `master@be261abc...` is:

| Inventory | Count | Interpretation |
|---|---:|---|
| Core tables | 48 | Current source matrix |
| Companion tables | 22 | G1-21 through G1-26 source annexes |
| Integrated table ceiling | 70 | Includes conditional/archive objects; not a production observed count |
| Columns | 820 | 530 core + 290 companion |
| Explicit indexes | 88 | Excludes SQLite autoindexes |
| Triggers | 91 | Source-defined steady-state set |
| Versioned source migrations | 19 | Full IDs, not date/sequence aliases |

The 70/820 inventory is a **source-defined maximum/integrated map**, not proof that all objects exist in the BWH production file. In particular:

- `platform_payment_orders_legacy_archive_20260803` is conditional on exact legacy table fingerprint.
- `platform_ads_consent_decisions` and `platform_ads_click_consent_claims` are conditional on the source feature/schema gate.
- Portal Link Reset hand-prepared objects are not included in the 70/88/91 totals.
- Ads Conversion tables are out of scope.
- Production object presence, source file identity, row counts, WAL state, and integrity remain NOT OBSERVED.

The 19 source migration identities are listed in the project migration mapping v0.2. D1 must preserve the full source `platform_schema_migrations` history separately from Wrangler's `d1_migrations`; neither ledger substitutes for the other. Same-day/same-sequence identities must use the complete migration ID.

### 2.1 Checksum evidence qualification

The 18 historical checksums were previously independently recomputed at the older G1-28 source cut. Current-head diff and tests indicate their original DDL has not changed; this plan does not claim that all 18 Node exports were re-executed on the current head. Plan C migration `20261105_001_coin_commerce_initial_confirmation_guard_plan_c` has a separately recomputed source checksum:

`e001f8d5e45320cd6a87cb53a1ab882acf445f96d3023d5b1891082d76f18ba7`

Before any G6 rehearsal is called reproducible, the rehearsal harness must independently execute the exact 19 source migration checksum exports at its pinned source commit, verify the source migration ledger, and record the complete results. The checksum above alone is not a substitute for that run.

## 3. Target database shape proposal

### 3.1 One logical D1 database, preserve domain boundaries

The target is not a 70-table blind copy and not a database-per-domain rewrite. Start with the current shared control database's transaction and referential-integrity boundary. Preserve source table names and domain ownership wherever semantics remain equivalent; make only explicitly reviewed target transformations.

Proposed target layers:

1. **Business facts and projections:** account, entitlement, issuance, resource authority, wallet, immutable ledger, commerce, payment, referral, quota, usage, audit and control-plane state.
2. **D1 migration provenance:** Wrangler migration history plus an explicit source-provenance snapshot containing source commit, source DB identity (opaque), full source migration ID/checksum/applied time, normalized source DDL fingerprint, target DDL fingerprint, and validation receipt.
3. **Worker operational protocol:** retain the existing G4 Agent protocol tables/contracts as a distinct protocol-owned namespace. Do not confuse their local synthetic migration IDs with source business tables.
4. **Migration/reconciliation control:** a bounded run manifest, per-table checkpoint, aggregate reconciliation receipt and safe error codes. These are migration tooling metadata, not new business authorities; define whether they are ephemeral harness state or durable D1 control records before creating them.

Do not create production DDL from this document. Exact column types, FK actions, CHECK expressions, partial indexes, trigger behavior and object ordering must be generated from the pinned source DDL and reviewed against the target compatibility matrix.

### 3.2 Explicit field disposition

Apply the v0.2 field map as a hard policy:

| Disposition | Target treatment |
|---|---|
| KEEP | Copy only opaque references, bounded enums/numbers, timestamps and schema-validated JSON |
| TRANSFORM | Deterministic, domain-separated digest or validated projection; document version, canonicalization and collision/error behavior |
| EXTERNALIZE | Raw value never enters D1, Worker payload, logs, traces or test artifacts; D1 receives only approved opaque ref/digest/lifecycle facts |
| DEFER | Do not create active target data path until feature and production presence are proven and separately approved |
| CONDITIONAL | Resolve exact source object fingerprint/feature gate before including it in the target manifest |

Mandatory exclusions and transformations:

- Leads email/message: externalize direct identifiers and free text; keep only approved opaque contact/lead reference and workflow facts.
- Portal subscription URL and payment action URLs/QR: externalize until custody, access, expiry, revocation and recovery contracts are approved.
- TOTP secrets, including encrypted blobs: externalize. Legacy `enc:<base32>` is not accepted as proof of encryption.
- Raw UUID/password/private key/rendered config/YAML: remain in protected BWH material custody; D1 receives only approved opaque refs and digests.
- Lease tokens: target stores a one-way capability digest plus generation, deadline and state; raw lease token is returned only to the authorized claimant and is never logged.
- Idempotency keys: use domain-separated digest with canonical request fingerprint and existing actor/scope/operation uniqueness semantics. A digest migration must prove replay equivalence and cannot silently change uniqueness scope.
- JSON columns: versioned allowlists only; reject URLs, secrets, free-form PII, private keys and arbitrary nested payloads. Offer/allocation/balance snapshots must preserve exact financial facts.
- Password credential and Passkey tables: defer real credential rows until source proves active registration and a separately approved credential migration contract exists.
- Usage samples: define minimization, aggregation and retention before bulk copy; do not assume indefinite raw-event retention.
- Conditional Payment legacy archive and Ads Consent: include only after exact object presence/fingerprint is established in the fixture/source inventory.

No target may claim that an opaque reference is safe merely because its column ends in `_ref`. Validate that values are not emails, usernames, URLs, filesystem paths, bearer tokens or embedded runtime secrets.

### 3.3 DDL and integrity contract

For each included target table, store a reviewable mapping record with:

- source table/column, source declared type, nullability, default and PK/FK/CHECK constraints;
- target table/column/type and exact transformation (or explicit exclusion);
- source and target DDL fingerprints;
- FK parent order and delete/update actions;
- indexes (including partial/unique predicates), triggers and immutability behavior;
- retention, data classification, owner and evidence;
- deterministic fixture and negative test IDs.

Preserve all behaviorally relevant source constraints. Do not weaken CHECK, FK, unique or immutable constraints for D1 convenience. If D1 cannot express or reliably enforce an invariant, implement a reviewed application-level guard plus a database-level defense where possible, and document the residual risk. The accepted G2 result has limitations; it is not blanket SQLite equivalence.

## 4. Transaction and consistency design

Do not translate every SQLite transaction into one generic `D1Database.batch()`. Map each business workflow by its actual transaction participants.

| Workflow | Target contract | Required proof |
|---|---|---|
| Wallet / Commerce within shared control DB | Keep wallet lot, hold, allocation, ledger, order and receipt invariants in a single D1 transactional unit where the source currently shares one SQLite handle | Atomic failure tests; immutable ledger; balance projection recomputation; concurrent spend/hold race |
| Payment settlement | Preserve staged Payment → Wallet → Payment completion → Referral/reconciliation semantics; each stage idempotent and explicitly reconcilable | Crash after every stage; provider duplicate/reordered event; amount/currency mismatch; retry; refund/reversal; reconciliation convergence |
| Commerce fulfillment to BWH | D1 transaction writes durable command/outbox and business state; BWH Agent executes idempotently and returns redacted receipt; no distributed ACID claim | D1 commit with lost response; duplicate poll; expired lease; stale generation; Agent success with lost receipt; retry and reconciliation |
| Deferred transitions | Strong atomicity for reservation/allocations/transitions/receipts inside the single D1 database; lease generation and fencing retained | Two concurrent reservations; lease expiry/reclaim; stale owner completion; rebase; crash between transition and effect |
| Reads after writes | Use explicit D1 session/bookmark strategy on balance, entitlement, order, issuance and Agent acknowledgement paths | Same-session read-after-write; bookmark propagation; replica lag/region behavior where applicable |
| Pagination | Stable keyset cursor, bounded page size and explicit snapshot semantics | Concurrent insert/update/delete while paging; duplicate/omitted rows; cursor tampering |

D1 `batch()` is atomic only for its statements in the same D1 database. It is not atomic with BWH, another SQLite file, an external payment provider, or node runtime effects.

## 5. Migration execution design (future gated runbook)

### Phase A — freeze the source contract

1. Pin an exact source commit and clean repository tree.
2. Re-run all 19 source migration checksum exports and compare against the approved ledger.
3. Build a production-specific object-presence manifest only under a separately approved Risk A read-only inventory. For G6, use the deterministic synthetic fixture's exact schema manifest instead.
4. Resolve all conditional objects by fingerprint; fail closed on unknown or partially matching schemas.
5. Produce the final source→target table/column/object mapping and exclusion report.
6. Verify the source DB identity and migration ledger as metadata only; never infer production identity from a filename alone.

### Phase B — establish a consistent snapshot

For G6, generate a deterministic SQLite fixture with WAL enabled and known transaction boundaries, checkpoint it according to the fixture contract, and preserve an immutable copy plus SHA-256. Include a second fixture with a deliberately active WAL and prove the harness either captures a valid consistent snapshot or refuses to proceed.

For a future production cutover, use a maintenance window and freeze all source writers before the final consistent snapshot. Do not introduce a live dual-write or unreviewed CDC path to avoid downtime. Any incremental tail mechanism would need its own source transaction log/outbox, ordering, replay and reconciliation proof plus a separate decision.

### Phase C — transform and load offline

1. Validate source identity, schema fingerprint and migration ledger before reading fixture rows.
2. Generate a deterministic run manifest: run ID, source commit, fixture hash, target DDL hash, mapping version, transformation version and expected object set.
3. Load parent tables before children according to the reviewed FK DAG; preserve stable opaque references.
4. Apply deterministic transformations and record counts/rejection counts without storing raw sensitive values in logs.
5. Use bounded batches with resumable per-table checkpoints; a checkpoint is committed only with the corresponding target batch. Replays must be idempotent.
6. Load immutable facts before derived projections where appropriate; recompute derived wallet/quota/usage projections and compare them with source facts.
7. Apply/rebuild indexes and triggers in a reviewed order; run all FK, CHECK, uniqueness, trigger and immutable-operation probes after load.
8. Record target source-provenance mapping separately from Wrangler migration history.

### Phase D — reconcile and seal the rehearsal

Required evidence for every table:

- source count, target count, intentionally excluded count, rejected count;
- stable primary-key range/count evidence;
- deterministic keyed digest over normalized, non-sensitive rows (never dump raw rows into logs);
- FK orphan count, duplicate/unique violation count and CHECK violations;
- source/target object fingerprint and trigger/index inventory;
- financial invariants: wallet lots sum to balances, held/consumed/reversed/expired units reconcile, ledger is immutable, payment/commerce receipt chain closes, referral reversals reconcile;
- subscription-control invariants: entitlement ↔ issuance ↔ issued-link references, quota/device/revocation state, no raw subscription material;
- Agent invariants: generation monotonicity, lease fencing, idempotent claim/receipt and redacted payloads;
- exclusion and transformation counts explain every source row not copied 1:1.

A run is not PASS if any count/digest mismatch is unexplained, a required invariant is untested, or a sensitive field is found in D1 rows, Worker output, logs or fixtures.

### Phase E — recovery rehearsal

- Destroy only the isolated rehearsal D1 database and recreate it from versioned migrations plus the deterministic fixture.
- Export/backup the rehearsal D1 state, restore to a fresh isolated database, and repeat the full reconciliation.
- Test interruption at each table/checkpoint boundary, retry, corrupted manifest, checksum mismatch, schema drift and partial target state.
- Record elapsed time, throughput, batch sizes, error rates and restore time; do not extrapolate production RPO/RTO from a synthetic dataset.
- Evaluate D1 Time Travel/export/restore mechanics separately. SQLite snapshot/restore runbooks are not D1 backup runbooks.

## 6. Single-writer cutover and rollback contract (design only)

### Before the cutover

- BWH SQLite remains the only production writer.
- Cloudflare Worker/D1 must not accept production business writes.
- Complete exact production inventory, backup and restore proof, source/target reconciliation, workload/cost/latency sizing, identity/auth review, data custody review and G6 sign-off.
- Obtain a separate exact Risk A approval identifying source DB, D1 database, Worker version, migration IDs/checksums, backup artifact, operator, maintenance window and rollback/forward-recovery procedure.

### Cutover sequence (future, not authorized)

1. Announce maintenance and stop/fence every BWH control-plane writer and background job that can mutate the migrated domains.
2. Verify no in-flight write/lease/settlement remains unresolved; reconcile payment/provider events and pending BWH commands.
3. Create and verify an immutable consistent source backup; record artifact hash and source migration ledger.
4. Apply the exact approved D1 migration to the designated target; no opportunistic schema changes.
5. Transfer data using the approved mapping; run all count/digest/invariant checks.
6. Enable exactly one Worker/D1 production writer and route approved control-plane requests to it.
7. Keep BWH source database fenced read-only for audit/reconciliation; do not run both writers.
8. Monitor error, latency, consistency, payment, wallet, entitlement and Agent receipt signals with an explicit abort threshold.

### Rollback is phase-dependent

- **Before D1 accepts production writes:** stop the Worker writer, keep BWH frozen until verified, then restore/enable the original BWH writer against the unchanged source snapshot. This is the simple rollback window.
- **After D1 accepts production writes:** do **not** simply re-enable BWH writes or point traffic back. That would lose or fork accepted D1 writes. Recovery must either forward-fix D1 or replay every accepted D1 write through an independently verified reverse journal/outbox into BWH while BWH remains fenced, reconcile all domains, then explicitly transfer writer authority. If reverse replay is not proven, rollback means forward recovery, not source failback.
- Define a durable cutover write journal with monotonic sequence, idempotency, payload minimization and reconciliation semantics before production approval. Do not store raw secrets or PII in the journal.

No cutover approval should be requested until the post-write recovery choice is technically demonstrated.

## 7. G6 synthetic rehearsal test matrix

| Test group | Required cases | Exit evidence |
|---|---|---|
| Source identity | Correct commit, dirty tree rejection, wrong fixture hash, schema drift, unknown conditional table | Fail-closed manifest |
| Migration ledger | All 19 IDs, exact checksum, same-day ID collision, duplicate/missing/unknown migration | Exact ledger parity |
| Schema | 70-table source maximum vs fixture-present set, columns, PK/FK/CHECK, 88 indexes, 91 triggers | Object-by-object report; conditional items explicit |
| Sensitive fields | PII, raw subscription URL, TOTP blob, password/private key, raw lease/idempotency token, unsafe JSON | Zero raw sensitive values in D1/logs |
| Load/replay | Parent-child ordering, chunk boundary, restart, duplicate batch, partial failure | Idempotent resume with no double count |
| Wallet/Commerce | Lots, holds, allocations, ledger, quotes, order, fulfillment | Financial invariants and immutable ledger |
| Payment | Duplicate/reordered events, staged crash, mismatch, refund/reversal | Deterministic reconciliation |
| Referral/bonus | Attribution digest, risk gate, duplicate grant, refund reversal | No duplicate or unreconciled reward |
| Subscription control | Account/entitlement/issuance/link/quota/device/revocation | Referential and lifecycle parity |
| Deferred | Concurrent reserve, lease reclaim, stale generation, rebase | CAS/fencing and atomicity |
| Agent/BWH boundary | Duplicate command, lost response, stale generation, receipt replay | Exactly-once effect semantics via idempotency; redacted receipts |
| Read consistency | Write then read, bookmark, multi-request/session, pagination under concurrent mutation | Documented read consistency |
| Recovery | Interrupt, corrupt checkpoint, destroy/recreate, export/restore | Reproducible restore + full reconciliation |

G2's accepted limitations must remain explicit in the report: 58 FK and 27 CHECK checks were attribution-limited in the accepted evidence; 60 ordinary full indexes were definition-only; multi-replica `withSession()` and concurrent-write pagination snapshot semantics remain unverified. G6 must add targeted probes or record an explicit residual limitation; it must not relabel these as proven.

### G6 PASS criteria

- Pinned source commit and deterministic fixture hash.
- All 19 source migration checksums re-executed and verified.
- Target DDL and source→target map reviewed; every excluded/transformed field accounted for.
- No unexplained count, digest, FK, CHECK, uniqueness or financial-invariant discrepancy.
- No raw PII/secret/material in D1, Worker payload, test logs or evidence bundle.
- Crash/replay and restore/reconciliation tests pass.
- All known D1 compatibility limitations either closed by evidence or explicitly accepted by the owner as residual risk.
- Independent review of the exact rehearsal commit and evidence bundle.

A G6 PASS authorizes only consideration of the next separately gated step. It does not authorize G5 remote staging, G7 production cutover or G8 production recovery execution.

## 8. Work breakdown

1. **T1 — Target object manifest:** generate a machine-readable source→target inventory from the current 70/820 source map; resolve conditional tables only in synthetic fixtures.
2. **T2 — Transformation contract:** specify versioned digest domains, JSON allowlists, secret/PII exclusion, retention and external custody references.
3. **T3 — Target DDL proposal:** produce reviewed D1 SQL in a dedicated local-only migration namespace; do not reuse production IDs or apply remotely.
4. **T4 — Deterministic fixture:** generate synthetic relational, financial, payment, referral, deferred and Agent datasets with known expected aggregates.
5. **T5 — Rehearsal harness:** identity validation, bounded resumable load, reconciliation, sensitive-data scanner, fault injection and report generation.
6. **T6 — Recovery harness:** isolated D1 export/restore and full replay/reconciliation.
7. **T7 — Independent review:** exact commit, checksums, test receipts, limitations, and decision whether G6 is complete.

## 9. Explicit non-goals and authorization boundary

This plan does not:

- connect to BWH or read production SQLite files, rows, credentials, environment variables or runtime material;
- create or modify remote Cloudflare D1/Worker resources, bindings, secrets, routes, schedules or DNS;
- apply migrations to persistent or remote databases;
- change production write authority or enable dual writes;
- migrate `subscriptions.sqlite`, third-party subscription data or edge credential material;
- deploy, restart services, activate timers, change node state, or switch traffic.

Those activities remain separately gated. Production remains BWH-authoritative until a completed and explicitly approved Risk A cutover.

## T1 execution record — 2026-11-07

**Status: SOURCE-ONLY T1 COMPLETE.**

Added the machine-readable inventory and a human-readable reconciliation summary:

- `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.json`
- `docs/D1_CONTROL_SCHEMA_INVENTORY_V1.md`

Current source-head verification reconciles exactly:

- 48 core tables + 22 companion tables = 70 tables.
- 530 core columns + 290 companion columns = 820 terminal columns.
- 84 core FK constraints + 42 companion FK constraints = 126 declared FK edges.
- 71 core indexes + 17 companion indexes = 88 explicit indexes.
- 41 core triggers + 50 companion triggers = 91 steady-state trigger names.

All 70 table names and 820 terminal column names were cross-checked against the approved field inventory. Every declared FK target resolves within the 70-table source inventory. The terminal Welcome Bonus table is 21 columns; the 30-column Payment archive is conditional; Ads Consent is feature-gated; generated Referral triggers and the Plan C same-name trigger replacement are accounted for.

Evidence freshness is explicitly qualified: the 18 historical migration hashes retain their G1-28 recomputation provenance and current-head source-diff review; this is not a full 19/19 current-head runtime re-execution. Plan C's checksum is independently recomputed from current source.

No BWH or production database access occurred. No remote Cloudflare resource, D1 apply, Worker deployment, CI, PR, merge, or cutover occurred. Production presence of all source-defined objects remains NOT_OBSERVED.

Next: T2 field disposition contract (KEEP / TRANSFORM / EXTERNALIZE / DEFER / CONDITIONAL), repository-only.
 
## T2 execution record — 2026-11-07

**Status: FIELD DISPOSITION MAP COMPLETE; STRUCTURAL REVIEW PASS WITH OPEN CONTRACT BLOCKERS. Not yet domain-owner approved or target-DDL approved.**

Added:
- `docs/D1_CONTROL_FIELD_DISPOSITION_T2_V1.json` — 70 tables / 820 per-column disposition records.
- `docs/D1_CONTROL_FIELD_DISPOSITION_T2_REVIEW.md` — independent structural review and blocker list.

Disposition totals:
- KEEP 712
- TRANSFORM 19
- EXTERNALIZE 7
- DEFER 23
- CONDITIONAL 59

Structural review compared the full field map with T1 inventory: 820/820 source fields covered; zero missing, extra or duplicate field keys; zero source type/nullability/PK/default/CHECK metadata mismatches; zero unknown rule IDs; zero duplicate target names within a table; zero invalid disposition/inclusion combinations. There is one low-confidence field: `platform_edge_desired_state_notifications.generation`.

Open blockers remain explicit: named domain-owner approval; idempotency HMAC key custody/version/rotation; exact per-field JSON allowlists; opaque-reference grammar and conformance; provider event dedupe and payment action URL custody; retention schedules; the low-confidence generation field; and accepted G2 D1 compatibility limitations.

This T2 map does not authorize production DDL or data loading. The next bounded work is to close these contracts using source evidence and synthetic vectors, then prepare T3 target DDL proposal. No BWH/production read, remote D1 mutation, Worker deployment, CI, PR, merge or cutover occurred. BWH remains the only production writer.

 
## T2 source-level closure pass — 2026-11-07

Base draft: 6d148796b251362ac8504677b62504eb39c39a3e. Source anchor: master at be261abc60f28bb2733764fa5364ab44b3e76844.

### Completed in this Draft-only pass

- Mapped all 26 JSON columns in D1_CONTROL_SCHEMA_INVENTORY_V1.json to observed source writer entrypoints and current production callers.
- Corrected lease source contract: five issuers use 32-byte random hex; platform_deferred_resource_transition_reservations.lease_token uses deferred_reservation_lease_ plus randomUUID().
- Corrected lease digest to use domain-separated, length-prefixed UTF-8 token text. No decodeHex assumption remains.
- Specified six raw idempotency HMAC domains, a separate provider-event HMAC key/domain, key ID in the envelope, four-byte big-endian LP and synthetic known-answer vectors.
- Added a separate PII pseudonymization HMAC proposal for historical SHA-256 digests; no key created.
- Found account metadata raw email/displayName and unkeyed SHA-256 digest risks; migration is blocked until externalization or keyed transformation is approved.
- Distinguished aggregate coin allocation from per-lot allocation; identified generic JSON writer boundaries that still need exact allowlists.
- Recommended Durable Objects SQLite storage for payment action custody; design only, no DO or key created.
- Prepared retention decision register; only Leads 90-day rule remains accepted.
- Prepared an independent review packet; no separate reviewer has signed it.

### Artifacts

- docs/D1_T2_CORE_SECURITY_CONTRACTS_V1.md
- docs/D1_T2_SOURCE_WRITE_PATH_AUDIT_V1.md
- docs/D1_T2_PAYMENT_ACTION_CUSTODY_DESIGN_V1.md
- docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md
- docs/D1_T2_INDEPENDENT_REVIEW_PACKET_V1.md
- server/tests/d1-t2-security-vectors.test.mjs

### Synthetic test result

The isolated Node built-in test run passed 9/9 known-answer/contract tests. This is not the full repository test suite. No CI was run on the Draft branch.

### Remaining T2 blockers

1. Remove/externalize raw account identity values and decide which keyed PII pseudonyms remain.
2. Close generic JSON writer allowlists and notice content limits.
3. Resolve the existing wallet-first setup handoff unkeyed digest exception.
4. Approve HMAC key custody/rotation and historical replay compatibility.
5. Approve payment custody owner, TTL, secret binding and operational restore/outage policy.
6. Assign domain owners and approve unresolved retention periods.
7. Enforce generation grammar at source writer and retain conditional status until compatible.
8. Obtain a separate independent review.

T2 remains BLOCKED. No production customer data was read; no BWH connection, real secret, remote D1 mutation, Worker/DO deployment, CI, PR, merge, dual-write or cutover occurred. BWH remains production's only writer.


## T2 closeout execution matrix — 2026-11-07

The remaining T2 work is now split into six independently verifiable work packages. This is a planning/checklist addition only; it does not mark any blocker complete.

- `docs/D1_T2_CLOSEOUT_EXECUTION_MATRIX_V1.md` — scope, acceptance evidence, T2 exit gate, T3 entry criteria, G6 rehearsal requirements, and current status ledger.
- T2-C1: account identity custody and PII externalization.
- T2-C2: HMAC key custody, rotation, and wallet-first legacy digest compatibility.
- T2-C3: closed JSON writer schemas, opaque-reference grammar, and generation fencing.
- T2-C4: payment action URL / QR capability custody.
- T2-C5: retention approvals and G2 compatibility residuals.
- T2-C6: independent review and formal T2 gate decision.

T2 remains BLOCKED. All six packages are OPEN. T3 may begin only after the formal T2 decision; G6 may begin only after the T3 DDL proposal is reviewed. Both remain repository/local-only. No BWH, production data, real secret, remote D1, remote Worker/DO, CI, production migration, dual-write, or cutover is authorized.


## T2 pre-review validation update — 2026-11-07

A source-level adversarial pass found and corrected a PII pseudonym test-helper mismatch: the rotation helper used a literal backslash-plus-zero prefix while the initial known-answer vector and contract require one NUL byte. The helper and contract notation are now aligned.

- Test helper correction: `8ff614a3a74637b7ad7300e971df0d4858051486`.
- Contract notation correction: `944660925625349e8ad20e1da256a0c0405169ca`.
- Isolated test file: `server/tests/d1-t2-security-vectors.test.mjs`.
- Executed with Node `v22.16.0`: `node --test /tmp/d1-t2-security-vectors.test.mjs`.
- Result: **13/13 PASS**.
- Executed file Git blob SHA-1: `c61b5d6d54416524317f0c43bc4b4158583cf954`.
- Executed file raw SHA-256: `ddbf91af45ea721192563e8fa4b5b14261bee3badab8000f95c44392d6545243`.

The test was run from a byte-identical copy of the current GitHub blob. This is the isolated synthetic vector file only; the full repository test suite and CI have not been run. A separate reviewer has not yet been assigned. T2 remains BLOCKED and no production boundary was crossed.


## PII email-normalization test addition — 2026-11-07

The pinned Master source `server/services/platform/portal-registration.mjs` confirms `normalizeEmail()` applies `requiredText(...).trim()` followed by `.toLowerCase()`. The synthetic PII lookup helper now mirrors that exact normalization for `account-email-lookup/v1`, and a 14th test verifies mixed-case/whitespace input produces the same lookup pseudonym as the canonical email.

- Current test file blob: `a20a49c77255d3b10a1c8ebff742f9aca4804765`.
- The prior 13-case file blob `c61b5d6d54416524317f0c43bc4b4158583cf954` passed 13/13 under Node v22.16.0.
- The added normalization case passed separately 1/1 under Node v22.16.0.
- The complete current 14-case file has not yet been run as one suite.
- The full repository test suite and CI have not been run.

T2 remains BLOCKED; this test coverage addition does not close the identity-custody, key-custody, JSON-enforcement, payment-custody, retention, or independent-review gates.


## Identity/authentication custody source audit — 2026-11-07

Added `docs/D1_T2_IDENTITY_AUTH_CUSTODY_SOURCE_AUDIT_V1.md`, pinned to `master@be261abc60f28bb2733764fa5364ab44b3e76844`. The audit is source-only and does not establish production feature activation.

New T2-C1/C2 findings:
- `resolvePortalLoginAccount()` accepts exact account IDs first, otherwise scans active accounts for `loginRef` / `displayRef` and requires a unique match. User-facing browser sessions currently derive identity labels from `metadata.loginRef`.
- The source conditionally wires the password credential service when User Portal/Admin Auth routes are enabled; production activation is NOT OBSERVED. All 11 `platform_portal_password_credentials` columns remain DEFER in the current field map. DEFER does not authorize silent login disablement or copying password hashes into D1.
- `platform_portal_totp_credentials.encrypted_totp_secret` is EXTERNALIZE. Current AES-256-GCM envelope has no key ID; `USER_PORTAL_TOTP_SECRET_KEY` is shared by User Portal and Admin TOTP verifiers. Legacy `enc:` values are unwrapped as raw Base32, not decrypted ciphertext.
- Identity/auth custody must preserve any approved login/TOTP capability while keeping password hashes and TOTP secrets out of D1. The TOTP key contract must define key ID, key separation or explicit shared-key acceptance, rotation/re-encryption, and legacy-value quarantine.

The closeout matrix and independent review packet now include the source audit. T2-C1/C2 remain OPEN pending named owner decisions and synthetic compatibility evidence. No production login behavior, credentials, or keys were changed.


## C3 Draft persistence-boundary hardening — 2026-11-07

Two narrow T2-C3 writer gaps have now been hardened on the existing Draft branch:

- `recordEdgeDesiredStateNotification()` accepts only the two source-derived formats: `gen_[0-9a-f]{24}` and `gen_scoped_[0-9a-f]{32}`. Non-string, whitespace-padded, malformed, uppercase and unobserved values fail closed. Source implementation: `2a6865bdafcb27f6a741f84171220d27eca77576`.
- `createPortalSecondFactorChallenge()` now requires a non-empty, unique list containing only `totp` and/or `passkey`. Source implementation: `c39b3987b557274fce2b9c4aabbf11367454245f`.
- Integration assertions were added to `server/tests/platform-subscription-control-db.test.mjs`: `591629b0b0aaeab8679d2f79b793bef67137b19d`.
- A focused Node v22.16.0 harness covering both validators passed **4/4** (raw SHA-256 `bb230837b57cab38333465d7cc8fd1d66203dbac08ce8d7c93282adad7f9b17f`).

The complete `platform-subscription-control-db.test.mjs` file has not yet been run; no full repository test suite or CI has run. Production historical generation values remain NOT OBSERVED, so the generation field stays CONDITIONAL pending an approved compatibility inventory or quarantine rule. C3 remains OPEN because the other JSON writer allowlists, opaque-reference families, and direct Audit/Portal event paths are not yet closed.


## C3 opaque-reference writer hardening — 2026-11-07

`recordEdgeDesiredStateNotification()` now validates `id`, `nodeRef`, `channelRef`, and `desiredStateRef` with the existing `safeControlRef` grammar in addition to the strict generation format. Implementation: `11a4a8e6a7872a73cc1d5568a6255b2e0e983e4a`; regression assertions: `254c0ad408052373de3e2963c3339bee18e9a89d`. A focused Node v22.16.0 validator harness covering generation, opaque refs and second-factor allowlists passed **5/5** (SHA-256 `05d124b9461b10966f715b165f64ab5946249aa574c94dcf73b8a9cb5a1e9ab5`).

This is a Draft-only source hardening. The full store test file, full repository suite and CI remain unrun. Historical production generation/reference values are NOT OBSERVED; C3 remains OPEN until all 26 JSON writers and historical compatibility rules are closed.


## C3 issuance and edge-node JSON writer closure — 2026-11-07

Draft source hardening now closes two additional JSON writer families:

1. **Issuance metadata** — `createIssuanceRequest()` and wallet-first resource-chain insert/update accept only: empty object; exact CLI marker `{cli:"platform:issue-subscription"}`; or the exact five-key wallet-first chain v1 object with fixed model identifiers/version and safe opaque transition refs. Unknown keys, variants, versions and unsafe refs fail closed.
   - Source: `a1b55bcc33e745b7094c93141d4a05530812c216`
   - Regression tests added: `0943ffe6b2f98841edb1ec58b866c4034bc3bbc4`

2. **Edge-node metadata** — the shared registered-node persistence record now accepts only the exact first-boot metadata key set, requires the fixed source and receipt gate, validates booleans and WireGuard plan reference, and validates optional identity anchors as lowercase SHA-256 fingerprints.
   - Source: `559156cbf8c4f841a80b20b68289811fb89efbba`
   - Regression tests added: `4c0e3c7c32227dfbb581582f6e3123a495d366de`
   - Preflight fixture updated to the approved shape: `87e0147a8154b99339a8090f19e4793fc121196f`

Source-mirroring pure synthetic harnesses passed 10/10 per contract. The repository Node test files, complete repository test suite and CI have NOT RUN. No production values were read. C3 remains OPEN for account PII, audit metadata/direct SQL, portal event/direct writers, commerce notices, and full independent review.


## C3 commerce notice JSON writer hardening — 2026-11-07

The Coin Commerce offer notice path now enforces:
- 1–8 unique notices per locale;
- at most 512 UTF-8 bytes per notice;
- trimmed, single-line plain text;
- deterministic rejection of URL/markup, email, phone, IPv4 and common secret-like patterns;
- complete offer re-normalization immediately before final INSERT.

Commits:
- Domain normalizer: `e0f568b91e58e74189fe65ace4de5c5623f7ffbe`
- Final persistence-boundary revalidation: `06e5c0dc7a04d3bafb87925982d5d52eefcbc145`
- Regex escaping correction: `60a3a8c200b7caf3bd09c47c19738d1da7fc8228`
- Regression test addition: `d8a055ec8b723c5f50a7402f478c466a4b452d70`

A source-mirroring pure synthetic harness passed 14/14. The repository Node test file, full suite and CI have NOT RUN. The pattern filter is deterministic and not comprehensive PII detection; independent review must assess false positives/negatives. T2 remains BLOCKED; C3 remains OPEN for account PII, audit, portal events and complete 26-field independent review.


## C3 audit and Portal event JSON writer closure — 2026-11-07

The shared pure contract module `server/services/platform/control-json-contracts.mjs` now covers:

1. **Portal event JSON** — null/empty sentinel plus the seven current discriminated event variants, exact per-event fields, canonical timestamps, lifecycle revision refs and safe transition/effect refs. All current writers are covered: generic request upsert, two wallet-first direct writes, and subscription-link-reset direct write. Legacy `old_link_invalidated` remains read-only compatibility data.
2. **Coin Commerce subscription fulfillment audit JSON** — exact 17-key base schema plus the two registered switch variants, safe refs, plan/duration/traffic consistency and canonical validity timestamps. The direct initial-confirmation INSERT calls the shared serializer; its atomic audit+confirmation SQLite transaction and digest semantics remain unchanged.
3. **Generic audit event writer** — `recordAuditEvent()` now dispatches on 8 exact entity/action pairs: issuance issued/compensated, entitlement traffic-limit update, wallet-first prepared/runtime/receipt, Coin Commerce subscription fulfillment, and data-pack fulfillment. Unknown pairs and malformed metadata fail closed.

Regression test commits:
- `control-json-contracts.test.mjs`: `243d5084f939c62743f9cb7adc486267d39fbe3a`
- store integration assertions: `1c2e5b32292e836deb5b2173b2554407258aefb9`
- historical malformed audit fixtures were changed to raw SQL insertion in tests so they continue to model pre-existing corrupted rows without weakening the production writer contract.

A source-mirroring pure synthetic harness passed **30/30** portal event and subscription fulfillment metadata cases. Actual Node test files, the full repository suite and CI have NOT RUN. No production audit rows or portal events were read. Account metadata/identity custody and complete 26-field independent review remain open; T2 remains BLOCKED.


## Final T2-C3 writer-boundary hardening follow-up — 2026-11-08

Audit inputs are now snapshotted as plain enumerable data before recursive unsafe-field inspection. Wallet-first audit parser null results are explicitly converted to fail-closed `validation_error` responses. The issuance and edge-node metadata validators now reuse the same hardened object-snapshot helper.

- Audit snapshot ordering: `fddc836b806af21d116e4f2a8355b8dea94170a5`
- Wallet-first audit parser null guards: `28a6f381bba182876a49410a2bad74c8bbeeb371`
- Shared metadata snapshot refactor: `a724b762f56f4d3f0afb459eb0574c4d56bfb60f`

This is Draft-only hardening. No production data or secret was accessed. Repository Node tests, full suite and CI remain NOT RUN.

## G6 preflight evidence refresh — 2026-11-08

This update supersedes the historical checksum-evidence qualification in §2.1 for the current Draft source modules only.

### Current-head source checksum execution

- Exact Draft branch source head used for the imported migration modules: `79ccad29f39ab503d48c54d516fbb3c3b4bde846`.
- Rechecked the 16 source migration modules against the current PR branch head `4dcf9f0c29717393200ed98bba33884c3a879df7`; all 16 module Git blob identities are unchanged from the imported test set.
- 19/19 source migration IDs and DDL SHA-256 checksums match the pinned inventory.
- Node v22.23.1, 5/5 registry tests PASS twice; combined inventory + migration tests 28/28 PASS twice.
- No DB was opened; a throwing `better-sqlite3` stub ensured no database construction could occur during module import.

### T2 field-disposition structural validation

- Added a read-only contract/CLI that binds the field map to the exact source inventory Git blob and validates every source field row, table mapping, source column property, rule/retention/test reference, target-column inclusion and proposal-only authorization.
- Exact coverage: 70 tables / 820 fields; 64 KEEP, 4 CONDITIONAL, 2 DEFER tables; 712 KEEP, 59 CONDITIONAL, 7 EXTERNALIZE, 19 TRANSFORM, 23 DEFER fields; 790 target candidates; 1 low-confidence field.
- Node v22.23.1, CLI PASS; 12/12 tests PASS twice, 0 failed / 0 skipped.

### What this does and does not establish

This closes the source-checksum re-execution requirement and structural integrity checks for the current T2 field map. It does not approve the proposed field dispositions, conditional feature inclusion, key custody, identity/privacy/retention choices, or the remaining T2 owner decisions. The T2 formal decision is still required before T3 target DDL work under the current plan.

G6 itself has **not** started: there is no target DDL proposal, deterministic SQLite fixture, offline transform/load rehearsal, recovery drill, or end-to-end reconciliation. No BWH connection, production database read, remote D1 resource, DDL apply, row load, Worker deployment, CI, merge, dual-write, or cutover occurred. BWH remains the only production control-data writer.

## T2-C3 writer review evidence refresh — 2026-11-08

Added the complete 26-field JSON writer/transform review and account metadata source/target contract:

- `docs/D1_T2_C3_ACCOUNT_METADATA_SOURCE_TARGET_CONTRACT_V1.md`
- `docs/D1_T2_C3_JSON_26_FIELD_WRITER_REVIEW_V1.md`

All 26 JSON fields are accounted for: 24 active fields have identified source writer/reader/transform contracts and focused dynamic evidence; the two Passkey credential fields remain DEFERRED. The account metadata source writer preserves BWH compatibility through a bounded 26-field contract; the pure D1 projection gate rejects raw identity/display values and legacy unkeyed digests until Auth0 externalization and C2 keyed-digest custody are resolved. No values are silently dropped.

The test evidence was recorded against source/test Git blobs confirmed byte-identical on the current PR #846 branch:
- `subscription-control-db.mjs`: `2bbdc573ec13fd8774ee87bf0904ce8aa7c51454`.
- `platform-subscription-control-db.test.mjs`: `e5ef7c2f87236457b2b01dc9e607905a76d73cb5`.
- `control-json-contracts.mjs`: `9d76d64d897707e5689fe94c275f548ee858707c`.
- `control-json-contracts.test.mjs`: `a60b27f3bdd5d6608e3ba4f8b574eba55fb0e442`.

Recorded fixed-runtime evidence (Node v22.23.1, better-sqlite3 12.10.0, SQLite 3.53.1, isolated non-production sandbox):
- Full SQLite control-store suite: 45/45 PASS twice.
- Five focused suite groups: 290 distinct cases per pass, all five groups passed twice (580 successful test executions).
- The exact per-run TAP hashes and group breakdown are in `docs/D1_T2_C3_JSON_26_FIELD_WRITER_REVIEW_V1.md`.

This updates the historical C3 writer-review status. It does not mean D1 target data writing has been integrated or production rows have been inspected. C3 remains OPEN for Auth0 identity mapping and C2 keyed-digest replacement; T2 remains OPEN pending grouped owner decisions and independent review. T3 target DDL and G6 offline database rehearsal have not started under the current plan.
