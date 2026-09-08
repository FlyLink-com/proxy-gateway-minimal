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

## Frontend admission and bounded completion

On 2026-09-08 the operator explicitly approved a PR #722 source-only exception
for connecting the existing referral page and local validation. This exception
does not reclassify ACTIVE_SOURCE_UNBOUND as ACTIVE_PRODUCTION, change the global
COMMERCIAL_FEATURE_INTEGRATION_GATE, or authorize production activation.

The existing `referrals` navigation and `ReferralRewardsPanel` are retained. The
panel now consumes profile, stable-link creation and performance APIs through
the existing browser-session transport. It renders account-owned aggregates,
copies the same-origin referral link, and generates QR images with the existing
local QR library. No external QR service, second Portal shell, cash-out action,
customer list or client-supplied attribution field is added. Missing APIs/policy
remain unavailable, not fabricated zero performance. Consumer wording does not
expose backend status codes.

Source boundary: `admin/portal/index.html` -> `admin/src/portal-main.tsx` ->
`admin/src/features/user-portal/user-portal-page.tsx` -> the existing referral
panel boundary and `referrals/` implementation ->
`admin/src/portal-static-preserve.css` /
`admin/src/styles/portal-static-preserve/user-portal-commerce.css` ->
`admin/dist-portal`. Release units: `portal-static` and `control-plane-app`
(Wallet read-projection compatibility only); `frontend_surface: portal`;
`identity_impact: false`; `deployment_performed: false`.

Account changes invalidate pending reads, link creation, clipboard feedback and
QR results. Requests are bounded and cancelled on unmount; link creation is
user-triggered and never automatically retried. Background reads cannot replace
a newly created link with an older snapshot. The visible online page refreshes
at bounded intervals and on return; denied/disabled responses do not poll forever.

## Validation environment and checklist

Use disposable local SQLite only. Test migration id/checksum/object validation,
reapply and rollback on failure; registration atomicity and expired cookies;
account isolation and CSRF; concurrent stable links; immutable first source;
duplicate/reordered callbacks; missing policies; confirmation; cumulative refunds;
crash rollback; and safe aggregate metrics. Run focused tests, npm test, and
Git diff checks. The original backend slice did not modify frontend source; the
explicitly approved follow-up validates the client, panel and Portal mounting too.

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

The Wallet ledger decoder and consumer labels now support `pending_to_reversed`
and `available_to_reversed`. Their missing backend read-projection cases are
also supplied: pending reversal has deltas `(0, -A, 0, -A)` and available reversal
has `(-A, 0, 0, -A)` in available/pending/held/total order. The read route does not
mutate balances; recent activity shows a single `-A`, not a double debit.

## Frontend follow-up validation boundary

The follow-up has TDD coverage for client contract parsing, the server's actual
empty 404 disabled response, same-origin cookie and legacy-session transport,
link generation/double-clicks, clipboard failure, local QR rendering, account
switches and late read/write responses. The existing Portal navigation is tested
with the mounted client, not only an isolated new component. Real temporary
SQLite Wallet reversal reads reproduce 503 before the projection fix and return
the exact safe DTO after it without writes.

Windows verification also found four original referral tests attempted directory
removal before closing SQLite. Cleanup now closes connections and workers first;
the business assertions and retry policy are unchanged. The targeted referral
and Wallet router tests pass after this correction. Other Windows full-suite
platform/path-sensitive failures are not treated as a passing Linux run; the
exact-head CI evidence is recorded in PR #722.

Portal and Admin builds/verifiers remain required. A default-empty local payment
configuration is validation-only, not a production release artifact. Interactive
signed-in browser QA and production activation are not implied by component
tests or build success. No preview server or production service is left running
by source validation.

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
