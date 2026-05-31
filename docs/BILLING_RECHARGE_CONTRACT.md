# Billing Recharge Contract

Last updated: 2026-05-31, Asia/Shanghai.

This document defines the repository-local billing contract for the current
subscription platform direction:

```text
payment -> recharge credit -> traffic balance -> usage debit -> controlled subscription issuance
```

It intentionally does **not** activate a real payment provider, public checkout,
webhook endpoint, production SQLite migration, subscription issuance, or runtime
mutation.

## Model

The billing layer sells prepaid traffic credit, not raw subscription links.

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

The subscription artifact is only the delivery mechanism. The durable commercial
state is the traffic balance and ledger.

## Current Repository Contract

The repo-only contract lives in
`server/services/platform/billing-provider-contract.mjs` and exposes:

- `normalizeRechargeOrder`
- `normalizeBillingPaymentEvent`
- `buildRechargeCreditDecision`
- `buildUsageDebitDecision`

These helpers are provider-agnostic and safe by default. They normalize
operator/payment facts into safe summaries and ledger decisions without storing
or returning raw payment payloads, customer emails, payment credentials,
subscription URLs, artifact secrets, or handoff material.

## Provider Boundary

The current provider vocabulary is deliberately broad enough for future payment
adapters:

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

This does not mean any provider is currently live. Real provider integration,
checkout URL creation, webhook registration, signature verification against a
provider API, or sandbox/live capture is separate Risk A work.

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

## Why Recharge First

Recharge/debit fits this product better than fixed subscription periods because
network resources are consumable:

- traffic can be metered;
- abuse can be contained by balance;
- device and artifact limits can be enforced alongside usage;
- refunds/reversals can subtract credit through ledger entries;
- future provider integrations can remain decoupled from subscription delivery.

## Next Gates

Recommended next implementation layers:

1. Add durable billing ledger storage in a separate schema/migration-gated task.
2. Connect traffic accounting to usage debit decisions.
3. Connect insufficient-balance decisions to controlled disable/revoke gates.
4. Add one payment provider adapter in sandbox mode.

Any real payment provider, public payment API, webhook endpoint, production DB
migration, or automatic issuance remains separate Risk A work.
