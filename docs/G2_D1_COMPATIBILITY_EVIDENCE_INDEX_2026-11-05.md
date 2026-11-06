# G2 Local D1 Compatibility Evidence Index — 2026-11-05

Last updated: 2026-11-06, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: g2_d1_compatibility_evidence
  superseded_by: null
  last_verified_at: 2026-11-06
  production_authority: false
```

> **Formal status:** ACCEPTED WITH DOCUMENTED LIMITATIONS (2026-11-06; PR #836 merged as `c50dc1df0d6b8e28d15e0bc8c53a11cbe86ffb40`; Issue #830 closed).
> Acceptance covers the Rev2 report, stages 1–7 receipts, and local Wrangler/Miniflare D1 synthetic validation only. It does not claim full D1 equivalence, authorize remote resources, or approve production migration.

## Formal acceptance record (2026-11-06)

- PR [#836](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/836) merged to master as `c50dc1df0d6b8e28d15e0bc8c53a11cbe86ffb40`; G2 closeout Issue [#830](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/830) is closed.
- Decision: **ACCEPTED WITH DOCUMENTED LIMITATIONS**. The accepted scope is this Rev2 report, stages 1–7 archived receipts, and the local Wrangler/Miniflare D1 synthetic validation surface.
- Limitations remain explicit: FK 68 PASS / 58 attribution-limited; CHECK 246 PASS / 27 attribution-limited; 60 ordinary full indexes have definition-only verification; multi-replica `withSession()` bookmark semantics are unverified; concurrent-write pagination snapshot semantics are unverified; G1-29 cross-database subscription fulfillment is outside G2; production migration set remains `not_observed`.
- The historical test baseline remains `master@63082bae5d980c3905d6e7405329b19e6c4e38ac`. The current master pointer does not rewrite that baseline.
- This acceptance does not authorize remote D1/Worker creation, BWH access, production data access, persistent migration, dual writes, deployment, DNS, or traffic cutover.

## Scope and evidence boundary

- Test baseline: GitHub master at 63082bae5d980c3905d6e7405329b19e6c4e38ac (historical G2 source cutoff).
- Test environment: Node v22.23.1; better-sqlite3 12.10.0 / SQLite 3.53.1 versus local Miniflare D1 using Wrangler 4.99.0.
- Test data: synthetic only; local databases only.
- No remote Cloudflare API, remote D1/Worker, BWH, production database, DNS, production runtime, or customer data was accessed.
- Current repository master at the 2026-11-06 closeout is `c8336ae6b0112ed3fb823d6bec29e1b34ad2a9fb`. This later source head does not change the historical G2 test baseline.

The full Rev2 report is archived at [Google Drive — G2 Rev2 compatibility report](https://drive.google.com/file/d/1mC3-o9F4rsvBCuOJlAk7FPLwF5qz7rmV/view). Report SHA-256: **4dcd60413f719f51d51066a6aceb1278ac940bb31f44fca3cacde0d5917ee4f8** (17,602 bytes). The Rev2 report supersedes the truncated Rev1 artifact; Rev1 remains frozen and must not be cited as the complete report.

## Result summary

| Validation surface | Result | Qualification |
| --- | --- | --- |
| Schema landing | 249/249 DDL objects landed; 70 tables, 88 indexes, 91 triggers; 18/18 migration checksums agreed across the recorded sources | Object creation is not a substitute for behavioral validation |
| Original trigger set | 88/91 PASS; 3 unsupported due to one D1 expression-depth root cause | The three are the initial-confirmations INSERT guard and its immutable UPDATE/DELETE pair, which could not be proved while a legal row could not be constructed |
| Scheme C trigger variant | 91/91 PASS; exactly 3 expected changes; remaining 88 trigger decisions, signatures, and terminal dumps unchanged; unexpected changes 0 | All 44 database predicates remain in the trigger; no application-layer weakening |
| Foreign keys | 126 constraints across 53 child tables; 68 PASS under the formal strict reading; 58 attribution-limited | Auxiliary reading is 75/51 only. Seven disputed constraints have parent-delete direction evidence, but INSERT/UPDATE directions remain masked; do not promote them to full PASS |
| CHECK constraints | 246/273 PASS; 27 attribution-limited | The 27 comprise 18 covered by stronger verified invariants and 9 legacy-archive rows whose seed path was unreachable |
| Indexes | 88/88 definition consistency; unique indexes 7/11 behavior PASS; ordinary partial indexes 10/10 PASS | Of 67 ordinary full indexes, 7 were behavior-sampled and 60 were definition-only; do not claim all index behavior passed |
| Pagination | Two cursor contracts × five probe categories; 39 checks total, all consistent | 26 data-layer checks are dual-engine evidence; 13 application-layer cursor checks are source-level evidence, not engine parity evidence |
| Transactions | 15 scenarios / 57 actions; 56 terminal states equal; 1 expected divergence | DEF-NAIVE / CLAIM-B-NAIVE is the expected phantom-claim result (expectDivergence=true), not a test failure. RP5-replay-close is included in 57 and in the 56 equal outcomes |
| D1 batch() | Atomic rollback, statement ordering, and constraint behavior mapped as equivalent for tested cases | D1 error reporting does not identify the failing statement index; application-level mapping is required |
| D1 withSession() | Local single-replica session behavior passed | Production multi-replica bookmark semantics remain unverified |

## Material compatibility findings

### Expression-depth root cause and Scheme C

The original initial-confirmations trigger exceeded D1's expression-depth limit of 100. DDL creation stored the trigger text successfully, but DML compilation failed. This caused three trigger results, seven foreign-key attribution gaps, and nine CHECK attribution gaps in the original set.

Scheme C split the original guard into S1–S4 EXISTS segments while preserving all 44 database predicates, the single trigger, and the original rejection signature. The variant changed only one trigger definition in the 249-object DDL set. The local dual-engine retest produced 91/91 PASS, with three expected improvements and no unexpected regression.

The source migration was later merged through [PR #832](https://github.com/FlyLink-com/proxy-gateway-minimal/pull/832), migration ID 20261105_001_coin_commerce_initial_confirmation_guard_plan_c, merge commit 5c1bccb526d49d45056d2b8780464e0d091b30c4. This is a repository source migration only. It does not mean that the migration was applied to a persistent SQLite database, remote D1, or production.

### Transaction and consistency limits

- The naive single-batch conditional claim is not equivalent to SQLite's conditional transaction semantics: losing writes can still create phantom artifacts. Claim flows must use a CAS-first pattern, verify meta.changes === 1, then submit the remaining write set in one batch.
- The Deferred compensation pattern can leave a processing lease without a receipt/event if the post-CAS batch fails; this is a temporary availability delay until lease expiry, not evidence of atomic rollback across separate steps.
- Account-level blocking is a preflight check in the tested D1 mapping, not a transaction-wide mutual-exclusion guarantee; the CAS and unique partial index remain the mutual-exclusion anchors.
- D1 batch failures do not expose the failed statement ordinal. The application must preserve a statement-to-operation map when diagnostics require it.
- withSession() was tested only in a local single-replica environment. Production multi-replica consistency remains open.

### Drift and representation findings

- Semantic drift observed: 0.
- One representation-only difference was observed for CAST(julianday(...) AS TEXT); numeric values and numeric comparisons matched.
- Three error/observability shape differences were recorded: no failing statement index in D1 batch errors, D1's deferred-FK error form, and D1 per-statement success metadata.

## Remaining evidence gaps

1. 58 foreign-key checks remain attribution-limited under the strict formal reading.
2. 27 CHECK checks remain attribution-limited as described above.
3. Four ARA unique-index behavior cases remain attribution-limited because the stronger single-active guard makes the index path unreachable.
4. Sixty ordinary full-index behavior cases were not tested; only definitions were reconciled.
5. Production multi-replica withSession() behavior remains unverified.
6. G1-29 contract two (cross-database subscription fulfillment) is outside this G2 scope.
7. Pagination snapshot behavior under concurrent writes was not tested.
8. The production migration set remains not_observed; no production inventory was performed.
9. Any remote staging, remote migration rehearsal, or production cutover requires its own approval and validation gate.

## Evidence hashes

### Rev2 report and machine facts

| Artifact | SHA-256 |
| --- | --- |
| G2 Rev2 overall report | 4dcd60413f719f51d51066a6aceb1278ac940bb31f44fca3cacde0d5917ee4f8 |
| tx-results.json (transaction count source of truth) | 9d5b7c9e0d6ba0dd81b2861913a2d6f6943a142a687461c2ac004c4cca325b93 |
| Stage 7 pagination receipt | c0c40dbd0a1a4cc52d8ad1065c13b64151c5048f0fb71625e84dac465992b411 |
| pagination-results.json | c26541f857f5b85352893c67c74a10fd7255dc3d4aac62fb753d3f2dea33f435 |

### Stage receipts and design review

| Artifact | SHA-256 |
| --- | --- |
| Stage 1 schema receipt | 3218e8f49df6726ef3e6d5600b44f564cbc824aeac10598d33bf8146f983186e |
| Stage 2 original trigger receipt | 8905e18ed10d815de927cd0be102bb992c7999a2a8cb633b2d18c9c9378cba61 |
| Stage 2b Scheme C D1 retest receipt | ce7f516ccec5a305efc7dd62a8063e49112b5e275a0163744230686b4d909b32 |
| Stage 3 foreign-key receipt | 6a41ad5cb2991d89756b96e625a47b89758bd446cbc079df842039f230f8d5c5 |
| Stage 3b variant follow-up receipt | 7766f5dfb6365f9ab65757692231d2d96cd182a17525c0af5f8d96a2dc5a39f1 |
| Stage 4 CHECK receipt | 5d13f35d05b9c63a4930ee52d98a39b55d8b47f6b110b90128f684ba13fde287 |
| Stage 5 index receipt | c2f6635e7e96cabc84fbdce6c9ac9cbaa5960227cf1544542da9b333fbaaf7d9 |
| Stage 6 transaction receipt | 30594b57ad807fd95de9785630e86ba5f889efb3a143f508dca57295f5286fac |
| Initial-confirmations guard design review | e7a0187aa5e249ea511c71083a16db2d774e30cbf1b465a92b3c9e1acac6b5b7 |
| Stage 7 pagination receipt | c0c40dbd0a1a4cc52d8ad1065c13b64151c5048f0fb71625e84dac465992b411 |

The raw receipts and result JSON files are archived in the Google Drive folder [G2 Local Simulation — 2026-11-05](https://drive.google.com/drive/folders/1bfpH7zZEkBXzf731dvWEPf0mqncvmS9q). The source PR and Issue comments are linked in [Issue #830](https://github.com/FlyLink-com/proxy-gateway-minimal/issues/830).

## Temporary data cleanup record

The cleanup values below are pre-deletion checklist records. The directories were deleted; the values are not post-deletion remeasurements.

| Path | Recorded value |
| --- | --- |
| Miniflare .wrangler/ state directory (19 state subdirectories) | 874,477,048 bytes |
| Other temporary build/stage directories | Individual byte counts were not retained |
| Total | 944,495,136 bytes / 1,115 files |

The post-cleanup harness retained 33 runner scripts, 22 result JSON files, the three Scheme C prototype artifacts, package files, and the Node toolchain. No SQLite files remained in the harness. The stage 7 temporary D1 directory was separately removed after that run and is not included in the total above.

## Decision boundary

- G2 is accepted with documented limitations; this is not a claim of full D1 behavior equivalence. The acceptance is limited to the evidence and local synthetic environment stated above.
- Local compatibility evidence does not authorize remote D1 creation, Worker deployment, secrets, routes, DNS, BWH connection, production data access, migration apply, traffic switching, or G7 cutover.
- The current source-of-truth control plane remains Node/Express + SQLite until an exact Risk A migration and cutover gate is completed.
- The G2 Issue #830 evidence comments are the source records for the Rev2 report, the corrected 57/56/1 transaction count, and the stage 7 pagination probes.

