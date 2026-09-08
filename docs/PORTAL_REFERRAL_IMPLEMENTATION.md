# Portal referral implementation and source validation

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_referral_source_implementation
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

Risk: A envelope / source-only implementation. Process: one Draft PR with
contract, additive schema, source implementation, isolated validation and review.
Expected PR count: 1. Production/AWS impact: none. Refs #439, #522, #523, #524.

## Intent and boundaries

Each active account has one opaque stable referral code. A random, server-stored
first-party attribution credential identifies the last valid landing before
registration. Registration locks attribution atomically with account creation;
invalid, expired and self referrals become permanently unattributed.

Only the first durable verified-payment paid-Coins credit may generate a reward.
Selection follows wallet credit ledger sequence, including a temporarily
unclosed first payment, so a later completed order cannot steal first eligibility.
The reward policy is immutable, versioned and selected at the original credit
time. Missing policy fails closed without renewing first-recharge eligibility.
Rewards are pending until observation time and an explicit risk approval pass.
Refund observations are provider-neutral trusted internal facts, never Portal
requests. Cumulative refund targets can only increase; retries cannot double
reverse. Spent/held rewards require reconciliation under an independently decided
recovery policy, and are not silently treated as recovered.

No production rate, observation time, attribution window or rounding default is
invented. A reviewed policy must explicitly publish all operands before use.
Features default off; runtime startup validates schema, never applies it.

## Frontend admission

COMMERCIAL_FEATURE_INTEGRATION_GATE and ACTIVE_FRONTEND_MAP classify Portal as
ACTIVE_SOURCE_UNBOUND. This change does not alter that rule or attach new UI
behavior to an unadmitted cohort. Frontend consumption, QR presentation and
rendered QA remain pending exact Portal identity admission or an explicit change
to that repository source gate. Backend API shape is prepared for that work.

## Validation environment and checklist

Use disposable local SQLite only. Test migration id/checksum/object validation,
reapply and rollback on failure; registration atomicity and expired cookies;
account isolation and CSRF; concurrent stable links; immutable first source;
duplicate/reordered callbacks; missing policies; confirmation; cumulative refunds;
crash rollback; and safe aggregate metrics. Run focused tests, npm test, and
Git diff checks. Frontend source is not modified by the gated backend slice.

## Production gate (not executed)

Before enabling: fresh exact host/database/schema/static identity inventory,
reviewed published policy and refund/risk fact ownership, backup with restore
rehearsal, isolated migration dry-run, exact artifact, operator approval, canary
and reconciliation, then feature readback. Rollback disables the feature and
retains additive referral/ledger history; never delete financial facts or restore
a database merely to roll back application code.


## API and configuration contract

- `GET /r/:code`: active-code capture; secure host-only HttpOnly cookie; fixed
  `/portal/register` redirect. Invalid/expired sources do not prevent registration.
- `GET /api/portal/referral/profile`: own eligibility, stable link path and policy.
- `POST /api/portal/referral/link`: lazy one-code creation; empty JSON body and
  same Host/Origin required. An existing code is reused.
- `GET /api/portal/referral/performance`: own aggregate registrations, first
  recharge conversions and credited paid-Coins, pending/available/reversed reward
  Coins, conversion rate and reconciliation flag. No customer identifiers.
- API query operands and body-supplied account/reward/policy values are rejected.
  Existing Portal browser sessions or the legacy session header authenticate;
  browser credential conflicts remain governed by the session transport.
- `PLATFORM_PORTAL_REFERRALS_ENABLED` defaults false. Enabling requires Portal,
  Wallet and recharge prerequisites, an exact HTTPS `PLATFORM_PORTAL_BROWSER_ORIGIN`,
  and the applied validated schema. No default rate or production policy is seeded.
- `publishPolicy` accepts exactly `policyRef`, `version`, `effectiveAt`, `rateBps`,
  `rounding` (`floor`/`half_up`), `attributionDays`, `confirmationDays`.
  Policy versions and effective timestamps are immutable; new publication cannot
  be retroactive. Integer rewards use BigInt multiplication before rounding.
- Cumulative refund reversal target = original reward minus reward computed on
  remaining original paid-Coins under the original policy. Chargeback targets
  the entire original reward. Unrecoverable held/spent units remain explicitly
  unreconciled and require a separately approved recovery policy.

## Internal fact ownership and remaining activation work

The recharge coordinator invokes accrual only after payment closure. Failures do
not convert successful customer recharge into failure. `start()` scans up to 100
accounts every 30 seconds, advances past blocked accounts, and retries on wrap or
restart. Both paths consume the same durable payment/wallet facts idempotently.

`portalReferralRiskReader(decisionRef)` must synchronously read a trusted durable
risk decision containing matching `accountId`, `decisionRef`, `approved: true`
and `refundObservationComplete: true`. `confirm` additionally checks the original
confirmation time and active promoter. No reader means no confirmation.

`portalReferralRefundReader(observationRef)` must synchronously read a trusted
verified observation containing matching `observationRef`, `paymentOrderRef`,
`cumulativeRefundedPaidUnits`, `chargeback` and `verified: true`. These are internal
service seams, not HTTP actions. A provider adapter must establish the exact
original-order binding and cumulative Coins basis, own durable ingestion/replay,
and apply outstanding observations before issuing a complete risk decision.
The current runtime has no default production reader or approval scheduler;
provider refund ingestion, risk scheduling, and recovery policy are outstanding
activation work. Do not enable available reward release without those owners.

The existing frontend Wallet ledger decoder also needs admission and support for
`pending_to_reversed` / `available_to_reversed` before users receive these entries.
The backend allowlist and wallet ledger preserve their actual reversal meaning.

## Isolated migration and policy commands

Run against an absolute disposable database copied from the validated schema
cohort. Existing account, Wallet and payment migrations must already be ready.

```bash
node scripts/platform-portal-referral-schema.mjs --mode validate --db-path /absolute/test.sqlite
node scripts/platform-portal-referral-schema.mjs --mode dry-run --db-path /absolute/test.sqlite
node scripts/platform-portal-referral-schema.mjs --mode apply --db-path /absolute/test.sqlite --confirm-migration-id 20260908_001_portal_referral --confirm-ddl-checksum <reviewed-ddl-checksum>
node scripts/platform-portal-referral-policy.mjs --mode validate --policy-path /absolute/reviewed-policy.json
node scripts/platform-portal-referral-policy.mjs --mode publish --policy-path /absolute/reviewed-policy.json --db-path /absolute/test.sqlite --confirm-policy-digest <validated-policy-digest>
```

Dry-run uses a SQLite serialized snapshot, including its committed WAL view,
executes all DDL in isolated memory, and checks for concurrent source changes.
It does not mutate the source database. Apply requires the exact exported
migration ID and checksum; policy publication requires its exact canonical digest.
CLI output is bounded to business configuration and safe status codes; database
paths, SQL errors and customer/provider records are not emitted.
