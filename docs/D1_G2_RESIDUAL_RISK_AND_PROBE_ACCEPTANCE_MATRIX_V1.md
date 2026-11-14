# D1 G2 Residual Risk and Probe Acceptance Matrix v1

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: d1_g2_residual_risk_probe_acceptance
  superseded_by: null
  last_verified_at: 2026-11-14
  production_authority: false
```

Status: DISPOSITION DECIDED / EVIDENCE OPEN. Adjudicated by Yi, 2026-11-14. T2: BLOCKED.
This document records adjudications only. It does not authorize probe construction,
source changes, remote D1/DO access, production access, deployment, migration, or
production switching. It does not constitute a T2 PASS.

## 0. Baselines and scope

- **Current source baseline**: master `e64b1112` (verified 2026-11-14).
- **Historical G2 test baseline**: master `63082bae5d980c3905d6e7405329b19e6c4e38ac`.
- **Scope**: G2 local synthetic-data compatibility (better-sqlite3 / SQLite 3.53.1
  versus local Miniflare D1) and T2-C5 evidence routing. No remote Cloudflare,
  BWH, or production connection was used; the production real migration set is
  `not_observed`.
- **Source evidence**: G2 final compatibility report Rev2
  (`g2-final-compatibility-report-2026-11-05-rev2.md`, §1 ledger, §2 Plan C,
  §3 drift, §4 compensation, §5 open/unverified list) and the stage receipts
  (§1–§7); Issue #830 (CLOSED 2026-11-06T10:34:37Z); PR #832 (MERGED
  2026-11-06T01:20:10Z by gccltd, merge commit `5c1bccb5`, ancestor of
  `e64b1112`).
- **Adjudication principles (Yi, 2026-11-14)**: PROBE REQUIRED = behavior that may
  affect data consistency, transaction atomicity, idempotent replay, concurrent
  writes, permission isolation, or recovery correctness; ACCEPT RESIDUAL / ACCEPT
  T2 RESIDUAL / ACCEPT CONDITIONAL RESIDUAL / ACCEPT DESIGN CONSTRAINT = explicit
  applicable boundary, controllable risk, no effect on T2 core correctness;
  SCOPE EXCLUSION = outside this G2/T2 acceptance; SOURCE CONDITION MET =
  precondition satisfied at source level; CONDITIONAL PROBE = probe only if a
  stated condition is met.

## 1. Adjudication table (Yi, 2026-11-14)

| ID | Decision | Acceptance / retention boundary |
|---|---|---|
| C5-03-01 | PROBE REQUIRED | Prove all 58 FKs with FK-body evidence, one by one; keep the strict 68/58 historical reading |
| C5-03-02 | PROBE REQUIRED | Verify all 18 guard-shielded CHECKs one by one in an isolated fixture |
| C5-03-03 | CONDITIONAL PROBE | If Archive is in scope, verify the 9 items; if excluded, register source fingerprint and target scope |
| C5-03-04 | PROBE REQUIRED | Verify the 4 ARA unique indexes with unique-index-body evidence, sharing the fixture with 01 |
| C5-03-05 | ACCEPT RESIDUAL | Ordinary index definitions verified; unverified behavior must not be claimed PASS; query ordering must be explicitly defined |
| C5-03-06 | ACCEPT RESIDUAL | Production multi-copy bookmark semantics unproven; future read paths depending on that capability must be verified separately |
| C5-03-07 | SCOPE EXCLUSION | G1-29 contract 2 is not in this G2/T2 compatibility acceptance; cross-store fulfillment is verified independently later |
| C5-03-08 | PROBE REQUIRED | Ledger pagination must prove no missed and no duplicated records before the cutoff watermark; account directory declares its consistency semantics separately |
| C5-03-09 | SOURCE CONDITION MET | Plan C merged; production apply is outside this adjudication |
| C5-03-10 | ACCEPT T2 RESIDUAL | Real production migration set unobserved; production migration still needs an independent Risk A gate |
| C5-03-11 | ACCEPT RESIDUAL | Must not rely on julianday textified results for cross-engine comparison or persisted canonical values |
| C5-03-12 | ACCEPT CONDITIONAL RESIDUAL | Bounded compensation intermediate state accepted; B6/B7 must verify the actual recovery path and no duplicate side effects |
| C5-03-13 | ACCEPT DESIGN CONSTRAINT | Locate errors with a safe operation mapping; do not rely on the statement index inside D1 error text |
| C5-03-14 | ACCEPT DESIGN CONSTRAINT | Must not naively batch a write set with conditional dependencies; every candidate write path must prove zero loser side effects |

## 2. Per-item record

### C5-03-01 · FK attribution-limited, 58 items (formal reading 68/58)

- **Behavior**: Of 126 FKs (53 child tables), the formal reading has FK-body DML
  evidence for 68 only; 58 items' DML probes were intercepted by preceding
  guards / UNIQUE / IN-CHECK and cannot establish FK-body evidence.
- **Existing evidence**: The intercepting guard enforces the same invariant with
  the same dual-engine signature; 7 delete-parent directions already have FK-body
  evidence (FK body hit 7/7 alone, but INSERT/UPDATE directions remain guard-
  shielded and are not expanded to full PASS; auxiliary reading 75/51 is
  statistical reference only); D1-side `PRAGMA foreign_key_list` independently
  enumerates the same 126 items; `batch()` and SQLite transactions are isomorphic
  on FK semantics (deferred pairs resolve in any order inside a unit, mid-state
  escape is rejected, cross-unit whole-batch rollback).
- **Evidence gap**: No direct FK-body DML proof for 58 items. Guard coverage of the
  same invariant is inference, not FK execution evidence. If a future write path
  bypasses the guard (migration, backend direct write), the FK as backstop defense
  is unverified.
- **Owner (role)**: Security/Compliance + data-integrity domain; technical
  verification Muse; interim business decision Yi; probe-project owner to be
  designated by Yi (OPEN).
- **Follow-up**: G2-P1 guard-aware fixture (new project, separate立项): construct
  DML probes that bypass the guard but hit the FK, proving refusal/cascade
  semantics per item.
- **Acceptance standard**: Each of the 58 items has FK-body DML evidence
  (dual-engine terminal states consistent), or Yi rules the 68/58 reading accepted
  as residual risk.
- **Blocks T2**: Yes, until the probe completes or the item is re-ruled residual.

### C5-03-02 · CHECK guard-shielded, 18 items

- **Behavior**: Of 273 CHECKs (64 tables), 246 PASS and 27 are attribution-limited;
  18 are covered by a stronger invariant (guard enforces the same invariant,
  verified per item); the other 9 are legacy archive seeds unreachable (see 03).
- **Existing evidence**: The 15 guard-shielded items' guards each PASS; the
  variant-set 3 items (`attempt_count` / `lease_generation` / `confirmed_at`) had
  all violation candidates intercepted by the binding guard, and their columns are
  themselves guard-invariant members; expression-level probes 109/109 equal in
  value and type; no semantic drift in the function topic.
- **Evidence gap**: No direct CHECK-body proof for 18 items; stronger-invariant
  coverage is inference, not CHECK execution evidence.
- **Owner (role)**: Security/Compliance + data-integrity domain; technical
  verification Muse; interim business decision Yi; probe-project owner to be
  designated by Yi (OPEN).
- **Follow-up**: G2-P2 de-guarded experiment set (built outside the full object set
  under separate authorization): prove all 18 CHECKs' refusal semantics one by one
  in a guard-removed/bypassed experiment environment.
- **Acceptance standard**: Each of the 18 items has CHECK-body DML evidence, or Yi
  rules stronger-invariant coverage accepted as closure basis.
- **Blocks T2**: Yes, until the probe completes or the item is re-ruled residual.

### C5-03-03 · legacy archive CHECK, 9 items, seeds unreachable

- **Behavior**: The 9 legacy archive CHECKs have no constructible compliant or
  violating seeds — rows can only be produced via the module RENAME path, and
  synthetic seeds are intercepted by guards/FKs.
- **Existing evidence**: No CHECK-body evidence; the interception mechanism itself
  (guard/FK) is verified; the reason seeds are unreachable is evidenced (RENAME
  path is the sole source).
- **Evidence gap**: 9 CHECKs entirely unverified.
- **Owner (role)**: Archive data-domain owner to be designated (OPEN); technical
  verification Muse; interim business decision Yi.
- **Follow-up**: CONDITIONAL PROBE (G2-P4): only if Archive is confirmed in target
  scope — build a dedicated fixture that constructs seeds via the module's own
  RENAME path and proves the 9 CHECKs one by one. If Archive is excluded from
  target scope, register the source fingerprint and target scope instead.
- **Acceptance standard**: Each of the 9 items has CHECK-body evidence, or Archive
  exclusion is registered with source fingerprint and target scope.
- **Blocks T2**: Yes, until the probe completes, exclusion is registered, or the
  item is re-ruled residual.

### C5-03-04 · ARA unique indexes, 4 items, attribution-limited

- **Behavior**: Of 88 explicit indexes, unique indexes are 7 PASS / 4
  attribution-limited (same ARA table; guard enforces the stronger single-active
  invariant, so the index is unreachable behind the guard).
- **Existing evidence**: The guard-enforced single-active invariant is verified
  per item; definition consistency 88/88 (including partial flags).
- **Evidence gap**: No direct unique-index proof for 4 items; a unique index is a
  correctness structure (prevents duplicate active rows), not a pure performance
  structure.
- **Owner (role)**: Security/Compliance + data-integrity domain; technical
  verification Muse; interim business decision Yi; shares the G2-P1 fixture with
  01 (no separate project).
- **Follow-up**: G2-P1: add本体 probes for the 4 unique indexes (construct duplicate
  active rows bypassing the guard, verify index refusal).
- **Acceptance standard**: Each of the 4 items has unique-index本体 DML evidence,
  or Yi rules guard coverage accepted.
- **Blocks T2**: Yes, until the probe completes or the item is re-ruled residual.

### C5-03-05 · Ordinary indexes, 60 items, behavior unverified

- **Behavior**: Of 67 ordinary indexes, 10/10 of the sampled subset PASS; 60 items
  verified for definition only, behavior unverified.
- **Existing evidence**: Definition consistency 88/88 (five fields including
  partial flag); behavior spot-check 7 items PASS; no semantic drift instance.
- **Evidence gap**: Behavior evidence missing for 60 ordinary indexes (not a
  compatibility error, an evidence gap only).
- **Owner (role)**: Data domain / Security.
- **Follow-up**: Register the boundary — ordinary (non-unique) indexes affect only
  query performance and execution plans, not data correctness; definitions are
  88/88 consistent; per-item behavior evidence, if needed, is a separate
  spot-check/full-verification project (not on the T2 acceptance required path).
- **Acceptance standard**: Boundary recorded; unverified behavior must never be
  claimed PASS; query ordering must be explicitly defined.
- **Blocks T2**: No.

### C5-03-06 · withSession production multi-copy bookmark semantics

- **Behavior**: `withSession()` works locally (writable, bookmark, read-own-write,
  `session.batch()` all measured); production multi-copy bookmark semantics are
  locally unverifiable.
- **Existing evidence**: Read-own-write holds trivially on a local single copy;
  the three contracts depend only on batch atomicity and statement serialization,
  not on session (Rev2 §1).
- **Evidence gap**: No production evidence; the Y-14 remote development database is
  not established (Y-14 itself awaits Yi's decision).
- **Owner (role)**: Platform engineering; Y-14 owner to be decided by Yi (OPEN).
- **Follow-up**: Register the boundary — the three contracts do not depend on
  session; multi-copy bookmark semantics are outside T2 acceptance; verify after
  the Y-14 remote development database exists.
- **Acceptance standard**: After Y-14 exists, production multi-copy bookmark
  semantics have measured evidence; before that, production bookmark semantics must
  not be claimed proven by extrapolation.
- **Blocks T2**: No.

### C5-03-07 · G1-29 contract 2 (cross-store subscription fulfillment)

- **Behavior**: Cross-store subscription fulfillment contract is outside G2 scope,
  unverified.
- **Existing evidence**: None. Rev2 states it is outside G2 scope, a separate
  later-stage project, and must not be extrapolated from batch conclusions.
- **Evidence gap**: The entire contract 2 has no evidence.
- **Owner (role)**: Cross-store fulfillment domain owner to be designated at
  separate立项 (OPEN).
- **Follow-up**: SCOPE EXCLUSION — contract 2 is not in this G2/T2 compatibility
  acceptance; it is verified independently in a later stage; it must never be
  claimed established from batch conclusions.
- **Acceptance standard**: T2 adjudication text states contract 2 is outside
  acceptance scope; the later project is accepted on its own evidence.
- **Blocks T2**: No, provided the scope boundary is recorded.

### C5-03-08 · Pagination concurrency stability

- **Behavior**: Cursor pagination on a static dataset is verified (stage 7: 26
  data-layer checks dual-engine fully consistent, including same-timestamp total
  order, exact-division last page, well-defined boundary tuples, page-size
  boundaries, empty table; 13 application-layer cursor checks verified
  separately); snapshot semantics under concurrent writes during pagination are
  unverified.
- **Existing evidence**: Stage 7 receipt (`pagination-results.json` SHA-256
  `c26541f857f5b85352893c67c74a10fd7255dc3d4aac62fb753d3f2dea33f435`); stage 7 §5
  states cursor stability under concurrent writes is out of scope and the local
  D1 single-copy environment is not production concurrency evidence.
- **Evidence gap**: Snapshot semantics under concurrent writes (whether rows added
  or modified during pagination cause misses or duplicates) are entirely
  unverified; local single-copy evidence strength is limited.
- **Owner (role)**: Reconciliation/ledger data domain + Security/Compliance;
  technical verification Muse; interim business decision Yi; probe-project owner
  to be designated by Yi (OPEN).
- **Follow-up**: G2-P3 concurrent probe: concurrent writes during pagination, proving
  no missed and no duplicated records before the cutoff watermark for the ledger;
  the account directory declares its consistency semantics separately.
- **Acceptance standard**: The concurrent probe proves no misses and no duplicates
  before the cutoff watermark (ledger), plus a written account-directory
  consistency-semantics declaration; or Yi rules a snapshot-semantics boundary
  accepted as residual risk (which first needs a product-side semantics decision).
- **Blocks T2**: Yes, until the probe completes or the item is re-ruled residual.
  Account-directory and ledger pagination are Admin/reconciliation read paths;
  misses or duplicates under concurrency directly affect reconciliation correctness.

### C5-03-09 · Plan C landing

- **Behavior**: Plan C (insert_guard multi-segment EXISTS rewrite, depth about
  50–52) is the precondition for all G2 variant-set conclusions.
- **Existing evidence**: Plan C was accepted by Yi as the G2 local-validation target
  variant; PR #832 (migration
  `20261105_001_coin_commerce_initial_confirmation_guard_plan_c`, DDL checksum
  `e001f8d5e45320cd6a87cb53a1ab882acf445f96d3023d5b1891082d76f18ba7`) merged
  2026-11-06T01:20:10Z by Yi (gccltd), merge commit `5c1bccb5`, ancestor of
  current master `e64b1112` (verified); formal Hosted CI run `42141587550`
  success and independent review gccltdco-cmd APPROVED (`5794459522`) preceded the
  merge; all 44 guard items inside a single INSERT guard; transaction rollback /
  idempotency / fail-closed all measured.
- **Evidence gap**: None at source level. Remaining boundary: production apply
  still needs separate Risk A approval, outside this item and outside T2 scope.
- **Owner (role)**: Migration review done (PR #832); production apply owner is the
  Risk A approval.
- **Follow-up**: Register the boundary — the variant-set precondition is satisfied
  at source level; production apply takes separate Risk A approval; if Plan C is
  ever overturned, variant-set conclusions fail with it (the original set falls
  back to depth-blocked state).
- **Acceptance standard**: The #832 merge is recorded (satisfied); production apply
  is governed by independent Risk A approval.
- **Blocks T2**: No.

### C5-03-10 · Production real migration set not_observed

- **Behavior**: The production real migration set has never been observed.
- **Existing evidence**: None. Rev2 states the production real migration set is
  still `not_observed` and production inventory needs independent Risk A approval.
- **Evidence gap**: Differences between production data and synthetic data (volume,
  dirty data, historical leftovers) are entirely unknown.
- **Owner (role)**: Production migration Risk A gate.
- **Follow-up**: Register the boundary — the T2 adjudication does not constitute
  production release; production inventory takes independent Risk A approval; G6
  offline rehearsal and Staging Apply verify later.
- **Acceptance standard**: T2 adjudication text states the production set is
  unobserved; production inventory is governed by independent Risk A approval.
- **Blocks T2**: No as an explicit residual; blocks any production migration step.

### C5-03-11 · julianday CAST-to-TEXT representation difference

- **Behavior**: `CAST(julianday(...) AS TEXT)` differs in significant digits —
  SQLite `2461041.1666666665`, D1 `2461041.16666667` (3 probe points); the
  underlying double and numeric comparison are fully identical.
- **Existing evidence**: 3 probe points evidenced; numeric-domain comparison and
  arithmetic are consistent; semantic drift is 0 across the whole run (the only
  terminal-state divergence is the stage 6 deliberately constructed expected
  divergence).
- **Evidence gap**: None at semantic level. The risk is in future code: any place
  that converts julianday to text for comparison or storage carries cross-engine
  inconsistency risk.
- **Owner (role)**: Engineering code review.
- **Follow-up**: Register the code-review rule (Rev2 §6.4): keep time values in the
  numeric domain; julianday is used only for numeric comparison and arithmetic,
  never converted to TEXT for storage or comparison; later code reviews check this.
- **Acceptance standard**: Rule recorded; implementation-stage code reviews enforce
  it.
- **Blocks T2**: No.

### C5-03-12 · Deferred claim compensation residual intermediate state

- **Behavior**: Under the compensation mapping (CAS separate `run()` first +
  `meta.changes === 1` check + remainder in a single batch), a CAS-committed but
  remainder-failed outcome leaves an intermediate state unreachable from the source
  transaction: processing holds the lease with no receipt/event, and the resource is
  unavailable during the lease window.
- **Existing evidence**: Stage 6 empirically proved it; the residual cost is
  characterized: delay, not corruption; re-claim succeeds after expiry.
- **Evidence gap**: None on behavior. What remains is whether to accept the
  lease-window unavailability cost.
- **Owner (role)**: B6/B7 implementation (C3 write closure).
- **Follow-up**: CONDITIONAL acceptance — register the boundary (intermediate state
  is delay-only; re-claim after lease expiry; lease duration is the maximum
  unavailability window); B6/B7 must verify the actual recovery path and no
  duplicate side effects with synthetic tests.
- **Acceptance standard**: Boundary recorded; compensation-mapping synthetic tests
  cover "CAS committed + remainder failed + successful re-claim after lease expiry".
- **Blocks T2**: No.

### C5-03-13 · batch failure location granularity

- **Behavior**: On batch failure D1 throws `D1_ERROR` (contains the constraint
  target, no failing statement index); a SQLite transaction error can locate the
  statement.
- **Existing evidence**: Stages 3/6 evidenced it; judgments use success/failure and
  terminal state, not error text; the compensation is defined (Rev2 §4.4):
  the application layer attaches an identifiable marker per statement or splits
  commits.
- **Evidence gap**: None on behavior. What remains is implementation-stage design
  execution (B6/B7 scope).
- **Owner (role)**: B6/B7 implementation (C3 write closure).
- **Follow-up**: Register the design constraint — write paths needing per-statement
  location attach an identifiable marker per statement or split commits in the
  application layer; error handling must not depend on D1 error text to locate a
  statement; B6/B7 implementation acceptance checks it.
- **Acceptance standard**: B6/B7 implementation tests prove failure location works
  (application-layer log location).
- **Blocks T2**: No (implementation-stage acceptance item).

### C5-03-14 · Naive batch prohibition boundary

- **Behavior**: `batch()` guarantees atomicity only, not conditionality. Any write
  set whose later statements depend on an earlier conditional statement (CAS /
  conditional update) must not be packed into a single batch — the loser write set
  lands as a phantom artifact (stage 6 empirically proved it,
  `DEF-NAIVE / CLAIM-B-NAIVE`, `expectDivergence=true`, expected divergence, not a
  test failure).
- **Existing evidence**: Stage 6 phantom-claim artifact evidence; the compensation
  mapping is defined (Rev2 §4.1); this boundary applies to all claim/collection
  contracts, not only Deferred.
- **Evidence gap**: None on behavior. What remains is implementation-stage design
  execution (B6/B7 scope).
- **Owner (role)**: B6/B7 implementation (C3 write closure).
- **Follow-up**: Register the design constraint — claim/collection contracts use the
  compensation mapping uniformly (CAS first + `meta.changes` check + remainder in a
  single batch), encapsulated as a fixed pattern in the data layer, no per-contract
  improvisation; B6/B7 implementation acceptance checks it.
- **Acceptance standard**: B6/B7 implementation tests prove zero phantom artifacts
  (loser write set, zero rows landed).
- **Blocks T2**: No (implementation-stage acceptance item).

## 3. Probe project grouping

| Project | Coverage | Status |
|---|---|---|
| G2-P1 | Constraint-body isolation fixture: 01 (58 FKs) + 04 (4 ARA unique indexes) | AUTHORIZED 2026-11-14 by Yi; construction starts after this filing (execution order: filing → P1 → P2 → P3) |
| G2-P2 | CHECK de-shielding experiment set: 02 (18 CHECKs) | NOT STARTED — construction authorized 2026-11-14 by Yi |
| G2-P3 | Concurrent pagination semantics probe: 08 | NOT STARTED — construction authorized 2026-11-14 by Yi |
| G2-P4 | legacy archive dedicated fixture: 03 (9 CHECKs) | NOT STARTED — only after Archive is confirmed in target scope |

Each probe must produce: exact source SHA, DDL/fixture hashes, version
information, per-item results, dual-engine terminal states, reproducible commands,
and a desensitized receipt. An unexecuted probe must not be filled PASS.

## 4. Acceptance relations

- G2 history status remains ACCEPTED WITH DOCUMENTED LIMITATIONS.
- C5-03 residual classification and technical direction are decided, but the
  necessary probes are not complete; therefore this phase cannot give an
  unreserved T2 PASS on this basis.
- If any item cannot gain evidence in the future, its specific risk, impact,
  mitigation, applicable scope, and named acceptance record must be re-recorded
  before it can be considered a PASS WITH EXPLICIT RESIDUALS candidate. An
  unverified item must never be silently turned into PASS.
- This matrix does not close C5-01 (RET-02～RET-11 remain POLICY PROPOSED / OPEN
  as interim dispositions) and does not lift T2 BLOCKED.

## 5. What this document does not do

- Does not authorize probe construction beyond the G2-P1/P2/P3 authorization
  given by Yi on 2026-11-14 (G2-P4 awaits Archive scope confirmation).
- Does not authorize source changes other than this documentation file, remote
  D1/DO access, BWH or production access, real key creation, deployment,
  migration, or production switching.
- Does not declare any probe item PASS. Probe results arrive only through their own
  Draft PRs with dual-engine evidence.
- Does not change the retention periods in
  `docs/D1_T2_RETENTION_DECISION_RECORDS_V1.md` or the M1 contract.
