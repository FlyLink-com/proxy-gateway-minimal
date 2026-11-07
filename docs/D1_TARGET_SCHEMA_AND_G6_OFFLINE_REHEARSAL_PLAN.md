# D1 Target Schema & G6 Offline Migration Rehearsal Plan

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