# Portal referral reward activation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_referral_reward_release
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

Risk: A. Process: extend existing Draft PR #722 with approved operands, actual
internal ledger verification and scheduler implementation, isolated validation and review,
then bind the exact production activation package. Expected PR count: 1.
Release units: `control-plane-app`, `portal-static`; frontend surface: `portal`;
identity impact: false. This record performs no production operation.

## Approved behavior

The operator selected a one-time reward of 20% of the referred account's first
verified external recharge paid-Coins credit, rounded down to whole Coins,
with a seven-day confirmation delay and a 60-day registration attribution window.
The operator explicitly selected automatic verification and settlement and
clarified that this means internal Coins delivery with no external promoter
payment or new external settlement dependency. The product decision is recorded in
`COINS_FIRST_COMMERCIAL_DECISION.md`.

The immutable policy operands are `rateBps=2000`, `rounding=floor`,
`attributionDays=60`, `confirmationDays=7`. The exact future `effectiveAt` and
policy reference/version/digest must be bound to the final activation package;
a synthetic validation timestamp must never be promoted as the production time.
The existing `platform-portal-referral-policy.mjs --mode validate` checks a full
seven-field policy without opening a database. Publication requires the exact
canonical policy digest and the separately approved target database.

The rate applies to committed `paid_coins` from verified payment capture, not
bonus Coins, reward Coins, product spending or subsequent recharges. Rewards
remain non-expiring and closed-loop. A 103-Coin qualifying credit produces 20
pending reward Coins. Partial refunds use the original policy and cumulative
remaining paid-Coins basis; retries never double reverse. Spent or held rewards
remain explicitly unreconciled when they cannot be recovered.

## Baseline and implementation scope

At source `2f03025897f09aee67e3af5e2f3291c8d3294fe1`, the service implements
immutable first-recharge selection, accrual, confirmation and cumulative refund
reversal. Its timer only scans for accrual; it does not execute confirmation.
Runtime has injectable trusted risk/refund reader seams, but no automatic
internal confirmation worker at that baseline.

At that baseline, opening the reward flag with a valid policy could create
pending rewards without making them available. Opening it without an applicable policy
can permanently classify an original first recharge as `policy_missing`.
Neither case is successful automatic settlement.

The approved implementation uses the existing durable internal payment, wallet,
attribution and recorded-refund facts. It adds no provider query, refund-coverage
watermark, external settlement service or schema. Internal confirmation must
not synthesize the legacy reader's `refundObservationComplete=true` assertion.
Provider refund ingestion remains a separate integration; it is not an added
prerequisite for this internal reward worker.

## Internal automatic settlement contract

1. Recheck the original account, first verified payment order, settlement
   identity, paid-Coin lot and credited quantity against the existing internal
   ledger. A later recharge cannot replace the immutable first origin.
2. Under an immediate SQLite transaction, validate the locked attribution,
   current account/profile eligibility, original policy and reward lot. Require
   the original credit's full seven-day delay. Reject mismatched or incomplete
   facts and explicit reconciliation blockers.
3. Confirm only the eligible pending remainder after every internally recorded
   refund's cumulative reversal target has actually been applied. A full
   reversal releases nothing; a partial reversal releases only the remainder.
   Preserve the existing trusted refund correction entry for later observations,
   including refunds recorded after release. Unrecoverable rewards remain
   explicitly unreconciled.
4. Run a bounded internal `settle({ limit })` pass after accrual in the existing
   30-second worker. Advance independent cursors past blocked accounts, retry on
   wrap/restart, and keep wallet release plus its `internal_ledger_confirmed`
   event atomic and idempotent. Disabled or closed services do not schedule new
   work. No external call is needed by a settlement tick.
5. Validate exact day-seven boundaries, wrong-order and cross-account facts,
   uncredited payments, incomplete recorded reversals, partial/full refunds,
   duplicate and reordered observations, transaction rollback, restart,
   disabled mode, spent rewards and bounded progress. Failure output must use
   aggregate counts/reason codes, not customer identifiers or raw payment facts.

## Production sequence and rollback

Retain the existing distribution release gate, including real Portal `/r/`
backend routing, current artifact identity, all database writers, explicit
schema validation/migration, protected backup and recovery rehearsal. A local
browser pass with rewards off does not validate reward settlement.

Only after the internal verification and worker are implemented and
validated may the execution package publish the future immutable policy and
enable rewards at the bound activation point. Recheck that the effective policy
is available before admitting reward-mode link capture and first recharges.
Keep application rollback and database restore separate. Disable new accrual
and release when rolling back; preserve additive schema, registration history,
immutable policy versions and financial facts. Record actual deployment and
activation readback in PR #722's Deploy Note.

The source worker is implemented in `portal-referral-service.mjs`; the existing
runtime reward flag starts it without a new provider factory or runtime option.
Exact-source test and review evidence belongs in PR #722. Source validation does
not claim that production migration, policy publication or reward activation has
been completed.
