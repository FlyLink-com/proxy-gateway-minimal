# Billing Recharge Contract

Last updated: 2026-07-23, America/Los_Angeles.

This document defines the boundary of the existing repository-local billing
helper. That helper is legacy optional traffic-topup compatibility. It is not
the new payment Adapter Registry, Coins authority, wallet ledger, or evidence
of a verified provider integration.

The current helper retains this compatibility flow:

```text
legacy billing helper
  -> optional traffic-topup compatibility only
```

The target commercial architecture keeps recharge payment, Coins consumption,
and fulfillment separate:

```text
verified recharge payment
  -> durable payment order/event
  -> paid_coins

paid_coins hold/capture
  -> separate product order
  -> fulfillment decision
```

Those latter two flows are target architecture. They remain unimplemented and
unproven in production. This document does **not** activate a real payment
provider, public checkout, webhook endpoint, Payment Store or schema, wallet
credit, subscription issuance, fulfillment, or runtime mutation.

## Model

Commercial Model v1 continues to sell time-bounded packages with included
traffic allowances. The existing helper describes how a legacy optional
top-up could add traffic credit without selling raw subscription links or
replacing entitlement validity.

```text
Payment provider success
  -> verified payment event
  -> recharge credit decision
  -> traffic balance increases
  -> user/operator requests subscription access
  -> controlled issuance creates tenant/artifact
  -> traffic accounting debits balance
  -> insufficient balance triggers controlled disable/revoke gate
```

Within this legacy compatibility flow, the subscription artifact is only the
delivery mechanism. Neither the helper nor its normalized decisions establish
a durable Coins wallet or payment order.

## Current Repository Contract

The repo-only contract lives in
`server/services/platform/billing-provider-contract.mjs` and exposes:

- `normalizeRechargeOrder`
- `normalizeBillingPaymentEvent`
- `buildRechargeCreditDecision`
- `buildUsageDebitDecision`

These helpers are provider-agnostic and safe by default. They normalize
operator/payment facts into safe summaries and legacy traffic-credit decisions
without storing or returning raw payment payloads, customer emails, payment
credentials, subscription URLs, artifact secrets, or handoff material. They do
not implement the static Adapter Registry, provider verification provenance,
durable payment events, or any Coins balance.

## Provider Boundary

The legacy helper accepts this provider-label vocabulary:

```text
paypal
stripe
paddle
lemonsqueezy
alipay
wechatpay
manual
mock
```

These labels are not Adapter Registry identities and do not mean any provider
is live or verified. Real provider protocols, checkout URL creation, callback
registration and verification, refund, reconciliation, or sandbox/live
execution remain separately gated work.

## Subscription Boundary

Billing decisions must not create subscriptions directly.

Allowed from billing contract:

- create a safe recharge credit decision;
- create a safe usage debit decision;
- report insufficient balance;
- produce safe refs for later storage.

Not allowed from billing contract:

- create runtime tenants;
- create opaque artifacts;
- return subscription URLs;
- write handoff files;
- call Admin/public HTTP routes;
- mutate Aliyun, Nginx, DNS, AWS, firewall, or production SQLite.

## Relationship To Commercial Model v1

The legacy traffic recharge/debit helper remains useful as optional
compatibility because network resources are consumable:

- traffic can be metered;
- abuse can be contained by balance;
- device and artifact limits can be enforced alongside usage;
- refunds/reversals can subtract credit through ledger entries;
- future provider integrations can remain decoupled from subscription delivery.

It must not become a second activation authority or be reused as a Coins
ledger. A traffic top-up cannot activate an expired, canceled, or suspended
entitlement, reset measured usage, or issue a runtime credential directly from
a payment event.

## Next Gates

Recommended next implementation layers:

1. Keep legacy traffic-topup compatibility separate from the target Coins
   recharge path.
2. Define durable payment-order/event and wallet storage in a separate
   schema/migration-gated task.
3. Prove idempotent `paid_coins` credit before enabling any recharge action.
4. Define product-order hold/capture and fulfillment decisions separately from
   recharge payment.
5. Verify one real provider contract before enabling its Adapter capabilities.

Any real provider, public payment API, callback endpoint, production DB
migration, wallet mutation, fulfillment, or automatic issuance remains outside
this source-only compatibility contract.
