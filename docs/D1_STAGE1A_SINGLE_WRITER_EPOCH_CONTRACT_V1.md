# D1 Stage 1A — Writer Authority & Epoch Fence (source-only)

```yaml
document_metadata:
  doc_type: evidence
  lifecycle: active
  authority_scope: source_only_d1_stage1a_writer_epoch_contract
  superseded_by: null
  last_verified_at: 2026-11-19
  production_authority: false
```

Date: 2026-11-20. Scope: Worker G3 bounded challenge write + synthetic local D1.
Source branch: `feat/d1-single-writer-epoch-guard-20261120`.
This is a code contract and **not** proof of BWH or production D1 write cutover.

## Invariants

1. BWH remains the **only production business writer**. The local-only
   `0005_writer_authority_guard_slice.sql` begins at
   `authority=BWH, phase=BWH_ACTIVE, epoch=1`; it does not create or modify
   E4 remote DDL. No Worker route exposes a phase transition.
2. Business writes to D1 require both a preflight authority check and an
   **in-transaction gate** as the first statement of the same D1 batch as
   the business mutation and idempotency record. Never preflight once,
   then execute an unrelated transaction without a guard.
3. The authority record is a singleton (id 1). Allowed transitions are
   `BWH_ACTIVE -> FROZEN -> D1_ACTIVE -> RECOVERY`, with
   `FROZEN -> BWH_ACTIVE` and `RECOVERY -> D1_ACTIVE` as explicit abort/
   resume paths. Each change increments `epoch` exactly by one.
   `RECOVERY -> BWH_ACTIVE` is **blocked** until reverse reconciliation is
   implemented and verified. No implicit fallback or dual writer.
4. A stale or missing `x-writer-epoch` is rejected. For the bounded
   Worker write route: missing/invalid -> HTTP 400 `writer_epoch_required`;
   mismatched epoch or atomic-gate conflict -> HTTP 409
   `writer_epoch_stale`; BWH/FROZEN/RECOVERY -> HTTP 503
   `writer_authority_not_d1`; absent/invalid authority schema ->
   HTTP 503 `writer_authority_unavailable`.
   Authorization tokens and per-operation idempotency checks remain required.
5. Staging test setup *explicitly* advances its synthetic state from
   BWH_ACTIVE (epoch 1) through FROZEN (epoch 2) to D1_ACTIVE (epoch 3).
   Production/runtime code never auto-grants D1 writer authority.

## Already implemented in Stage 1A

- D1 singleton authority row and transactional gate; triggers forbid phase
  skips, stale epoch reuse, deletion, and unsafe reverse handover. The
  additive local-only `0006_writer_authority_insert_guard_slice.sql`
  rejects reinsertion or replacement after seeding, even when recursive
  triggers are off.
- `WriterAuthorityRepository.current/assertWritable/gateStatement`.
- G3 `POST /v1/accounts/:accountId/second-factor-challenges` uses the
  `x-writer-epoch` contract and the atomic gate.
- Local synthetic tests for BWH/FROZEN/RECOVERY denial, epoch mismatch,
  idempotency, state-change races, missing schema and illegal transitions.

## Not covered yet (do not claim single-writer migration complete)

- G4 Agent protocol stores, claims and receipts; credential/session DO
  operations and all future Worker business repositories need their own
  audited writer ownership and transaction-bound guard. This PR does not
  transform those domains into production D1 business authority.
- Source BWH SQLite enforcement, including direct SQL writers, callbacks,
  scheduled jobs, process restarts and in-flight transactions. This is Muse's
  matching implementation and cannot be enforced from D1 alone.
- E4 target DDL, migration Runner, checkpoint/delta, merge/replay journal,
  actual data import, production cutover or reverse-reconciliation receipts.
  The old BWH database may never resume writes merely because D1 is unavailable.
- No shared DB transaction spans BWH and D1. The final transition therefore
  needs *BWH freeze evidence* and a short reconciled cutover, not a magical
  atomic distributed commit. No production activation path is exposed here.

## Provisional Muse BWH handoff contract

Muse should prepare the **matching source-side** guard, not operate BWH yet:

- Identify every business-control SQLite write entrypoint and background
  writer; mark exact owning table/domain and bypass risks.
- Add a durable local authority record with strictly monotonic epoch and
  explicit BWH_ACTIVE/FROZEN/D1_ACTIVE/RECOVERY handling. Its schema may
  differ, but the externally exchanged `epoch`, `authority`, `phase` and
  checkpoint receipt must agree with the canonical migration coordinator.
- In every BWH business write transaction, check the local freeze/epoch
  *atomically* with the writes. A request should fail closed if the
  epoch is stale, the source is frozen, or a worker resumed after freeze.
- Define freeze acknowledgment as: all prior write transactions drained,
  schedulers stopped or fenced, durable final source snapshot/checkpoint
  recorded, and no new business-control writes admitted.
- Keep BWH protected material custody, subscription rendering and runtime
  agent storage separate. No raw material is sent to D1.
- Produce test receipts for mid-transaction freeze, worker restart after
  freeze, duplicate callback, and stale scheduled job. Do not run on
  production until the separately scheduled cutover execution.

This draft is a **protocol handoff preview**, not the confirmed Muse task.
After completing coverage review for the Agent protocol and the full Worker
write inventory, the phase's confirmed handoff will reference an exact PR,
tests, live Staging version and the required BWH code paths.
