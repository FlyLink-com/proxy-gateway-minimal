# Billing Recharge Contract

Last updated: 2026-07-20, America/Los_Angeles.

This document defines the repository-local billing contract for the current
subscription platform direction. It is a future optional top-up extension to
`docs/COMMERCIAL_MODEL_V1.md`, not the primary v1 commercial model:

```text
payment -> recharge credit -> traffic balance -> usage debit -> controlled subscription issuance
```

It intentionally does **not** activate a real payment provider, public checkout,
webhook endpoint, production SQLite migration, subscription issuance, or runtime
mutation.

## Model

Commercial Model v1 sells time-bounded packages with included traffic
allowances. This contract describes how a later approved top-up could add
traffic credit without selling raw subscription links or replacing entitlement
validity.

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
worldfirst
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

Niuniu Pay is intentionally not part of the active provider vocabulary for new
work. Historical Niuniu material may be used only as deprecated archaeology for
safe migration analysis; no new provider credentials, checkout flow, webhook,
or production payment path should be built around it.

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

Recharge/debit remains useful as an optional extension because network resources
are consumable:

- traffic can be metered;
- abuse can be contained by balance;
- device and artifact limits can be enforced alongside usage;
- refunds/reversals can subtract credit through ledger entries;
- future provider integrations can remain decoupled from subscription delivery.

It must not become a second activation authority. A top-up cannot activate an
expired, canceled, or suspended entitlement, reset measured usage, or issue a
runtime credential directly from a payment event.

## Next Gates

Recommended next implementation layers:

1. Keep this extension disabled while the fixed-package v1 path is validated.
2. Define durable top-up and reversal ledger storage in a separate
   schema/migration-gated task.
3. Prove that top-up cannot reset usage or bypass entitlement validity.
4. Add one payment provider adapter in sandbox mode only after the primary
   commercial lifecycle is stable.

Any real payment provider, public payment API, webhook endpoint, production DB
migration, or automatic issuance remains separate Risk A work.
