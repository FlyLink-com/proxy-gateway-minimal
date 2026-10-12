# Commerce-backed plan-switch metering continuity

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: full_metering_plan_switch_continuation
  superseded_by: null
  last_verified_at: 2026-10-12
  production_authority: false
```

Risk: A production envelope / B source core. One implementation PR.
Release unit: `control-plane-app` (collector component); `identity_impact: true`.
Source implementation does not authorize installing a collector, starting a
timer, modifying a checkpoint, changing services or accounting on a real host.

## Intent and observed gap

A bounded read-only observation on 2026-10-12 found three old checkpoint
identities for one account differing from current bindings only in
`billingBinding.plan`. Ownership, credential material and validity dates were
unchanged; there was no pending intent. This is dated aggregate evidence, not a
permanent assertion about production or proof of a specific purchase.

The existing collection guard correctly rejects an unexplained binding change.
The material continuation cannot authorize plan changes. The explicit billing
window continuation admits only a later `validUntil`. Neither handles a normal
paid plan switch. Do not remove `plan` from the identity digest or replace these
checks with a catch-and-retry loop.

## Source contract

Ordinary collection can admit a billing-only transition through an owned,
read-only database proof reader. The production CLI supplies that reader; there
is no public proof endpoint, caller-supplied database, new CLI approval flag,
schema change or commerce worker inside the collector.

For every changed active identity, all source/channel/credential/account/
entitlement/request/material fields must stay identical. The reader requires:

- The live account, entitlement, issuance request and issued link remain valid.
- A frozen plan-switch quote supplies the old plan and validity snapshot.
- Its commercial quote was consumed; its order and same-owner wallet hold were
  captured for the exact amount and purpose.
- The deterministic command, unique delivered receipt and atomic fulfillment
  audit bind the same account, entitlement, request and target offer.
- In-place upgrade, yearly restart, quote-backed renewal, or an actually
  **applied** due downgrade has the expected dates and plan policy. A delivered
  scheduled-order receipt alone does not establish an applied downgrade.
- The unique chain from checkpoint billing tuple to current tuple has at most
  32 steps, with no fork, cycle, orphan or future event. Applied effects precede
  the current read and are not older than the previous source observation.

Missing historical quote evidence is not inferred from the current plan.
Malformed records fail closed; SQLite errors are not converted into permission
to continue. Reads run in the caller's transaction and never execute migrations.

Before source reads and again before durable commit, the same evidence must
prove the transition. Inventory stability, source ownership, runtime material,
generation, complete counters, journal lock and sample-writer guards still apply.
Explicit material/window continuations do not implicitly activate this path.

## Accounting boundary and recovery

Only changed identities baseline at the verified current readings. Their
already accepted usage and ledger rows are retained. Their crossing interval is
`unassignedBytes: null`, not measured zero and not a historical debit. Unchanged
identities keep ordinary increments. A genuine source-generation change uses
the existing generation-boundary mechanism. A same-generation counter decrease
cannot be explained by changing a plan and remains an error.

An expiry collection may have moved an identity into retention before the
commerce coordinator applies a paid downgrade or a previously confirmed
quote-backed renewal. Ordinary scope reconciliation still rejects every
retained-to-eligible change. Only identities admitted by the same commercial
proof above may use the separate atomic reactivation transition. Its exact
reactivation set must match the desired retained-to-eligible set, and each
identity must have an archived counter entry; an arbitrary retained ref is not
enough. Unproven peers stop the batch rather than joining that transition.

The transition restores accepted usage without charging the absent interval,
while unchanged active identities keep ordinary deltas. Exact retired entries
and connection snapshots are retained in `planSwitchReactivations`. Same-process
counter decreases, changed connection ownership and reappearance of a closed
connection still fail. A real, independently verified generation boundary may
precede reactivation; no generation is synthesized to explain missing history.
The intermediate scope is never returned or written without its actual source
observation and final state validation. Both reactivation and ordinary plan
boundary histories have a 128-record hard limit and fail closed when full.

The private journal archives the exact old checkpoint as
`plan-switch-before-<digest>.json`, then records proof digests in
`planSwitchContinuations` and a dedicated counter boundary. Public summaries
contain only aggregate counts. No account, order, credential or proof payload is
printed. The existing pending-intent/sample/checkpoint protocol retains
idempotency across all three durable crash boundaries.

This is not a generic pending-journal repair: an old pending sample with a now
invalid binding still requires a separate accounting decision. Do not delete it
or relabel its plan. A reader also refuses an ambiguous exact-millisecond
boundary where an already consumed effect is selected again at `notBefore`;
it must not silently discard unused evidence. Histories have explicit capacity
limits (128 continuation records); no automatic evidence truncation is added.

## Validation environment and checklist

Use isolated local Windows/WSL source fixtures, synthetic accounts, SQLite files
and source observations only. No real protocol or production authorization is
implied. Relevant tests:

- `full-metering-plan-switch-proof.test.mjs`: positive commerce chains, wrong
  owner/material/payment/receipt/link, missing or ambiguous evidence and time.
- `full-metering-plan-switch-counter.test.mjs`: cumulative and connection
  boundaries, carry usage, missing/decreasing observations, ordinary follow-up,
  retention and generation compatibility.
- `full-metering-plan-switch-reactivation-counter.test.mjs`: exact archived
  restoration, same-generation monotonicity, closed connection and ownership
  guards, partial restoration, repeated expiry, genuine generation advances,
  simultaneous scope changes, malformed evidence and history capacity.
- `full-metering-plan-switch-continuation.test.mjs`: three affected identities
  alongside an unchanged account, no historical debit for the changed bindings,
  inventory/proof drift, journal concurrency and each durable failure boundary,
  including expiry-retained reactivation and its pending-journal recovery.
- `coin-commerce-plan-switch-integration.test.mjs`: actual migrations and
  commerce coordinator through the real binding inspector and proof reader to
  three-source collection and SQLite accounting for all four supported paths;
  both orderings of expiry collection versus applied downgrade, a delayed
  confirmed renewal, and refusal when its durable fulfillment audit is absent.

Run affected metering and plan-switch regressions, the server baseline from
`VALIDATION_BASELINE.md`, diff checks and an independent review. Store exact
commands, source identity and results in the PR/execution evidence, not in this
long-lived runbook. Windows success does not replace Linux runtime validation.

## Production decision remains separate

1. Bind the exact deployed collector and its complete dependency closure. The
   independently installed collector is not necessarily the app's source tree.
2. Refresh only the affected checkpoint/current bindings and authoritative
   commerce evidence; all changed identities must be proven. Confirm pending
   state, journal format, capacity and installed source compatibility.
3. Dry-run admission and counter transitions without durable writes. Bind a new
   protected DB/journal backup and the exact rollback target before approval.
4. An already paused production lane needs a separately approved **zero-charge
   recovery boundary for the pause**, including unchanged identities where
   necessary. This source path alone does not suppress their ordinary deltas;
   do not resume a long-stopped timer and call its catch-up historical-free.
   Do not fake a process generation, delete checkpoints or use `--initialize`
   to erase the old journal. The approved candidate is a new activation and a
   new absent journal at current counters. The stepwise operator document is
   `docs/FULL_METERING_NEW_ACTIVATION_RECOVERY.md`. That document does not
   authorize production execution.
5. After exact approval, install the verified collector separately from the
   business app, then follow the approved recovery order. No protocol restart,
   identity issuance, rights mutation or SGP scope expansion is implied.
6. Verify natural successive collections, aggregate identity evidence,
   preserved old usage, new-boundary increments, and service state before
   declaring recovery. Record a Deploy Note with exact artifact and backup.

Rollback before any new journal write may restore the old collector pointer.
After a plan boundary or reactivation is committed, an old counter validator
rejects the new evidence (including `planSwitchReactivations`). Pause the
collector and retain the ledger/journal; do not overwrite
them with the backup or claim an old binary can safely continue. Resolve via a
compatible forward fix or separately approved recovery, never a historical
usage rollback.
