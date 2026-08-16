# Billing Recharge Contract

Last updated: 2026-08-09, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: billing_recharge_contract
  superseded_by: null
  last_verified_at: 2026-08-09
  production_authority: false
```


Source evidence cutoff: `master@02fc63a3f949b748dcccf26ba7d310be82f4b6df`.

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

Those latter two flows now have separate repository source, focused tests, and
additive migration definitions:

- Recharge/Payment: Recharge Offer -> Recharge/Payment Order -> immutable
  normalized Payment Receipt -> exactly-once `paid_coins` Coin Ledger posting;
- Coin Commerce: Offer -> Checkout Quote -> Commerce Order -> Coin hold/capture
  -> Fulfillment Command/result.

They remain default-off and unproven in production. A Commerce Order spends
Coins for a product and is not a Recharge/Payment Order. Coin Ledger is the
immutable financial fact; Coin Wallet is its projection. This document does
**not** activate a provider, expose a deployed checkout/callback, apply a
Payment or Wallet migration, credit a production Wallet, issue a subscription,
fulfill a product, or mutate runtime state.

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
is live or verified. The separate static Registry and runtime assembly contain
default-off PayPal Sandbox, XSD, and ChaoJiPay source paths; Recharge activation
requires exactly one provider flag. Credentials, callback registration,
provider compatibility, live settlement, refund, reconciliation, and
production activation remain separately gated work.

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

Recommended next Gates:

1. Keep legacy traffic-topup compatibility separate from the target Coins
   recharge path.
2. Review and apply the existing Payment, Coin Wallet, and Coin Commerce
   migrations only through their separate schema Gates.
3. Preserve focused exactly-once `paid_coins` settlement and Coin
   hold/capture/fulfillment tests before any runtime activation.
4. Keep Recharge/Payment Orders, Commerce Orders, and Account Resource
   Authority selections as separate domain facts.
5. Verify one provider contract, credential binding, callback/return ingress,
   and rollback plan before enabling exactly one Adapter runtime.

Any real provider, public payment API, callback endpoint, production DB
migration, wallet mutation, fulfillment, or automatic issuance remains outside
this source-only compatibility contract.
