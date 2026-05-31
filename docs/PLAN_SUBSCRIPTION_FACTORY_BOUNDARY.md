# Plan Subscription Factory Boundary

Last updated: 2026-05-31, Asia/Shanghai.

> Status:
> - Type: Active product/business boundary
> - Risk: C
> - Execution authority: Does not authorize code, payment integration, provider
>   account setup, Aliyun deployment, DNS, Nginx, SQLite migration, tenant,
>   artifact, subscription issuance, edge traffic, or production changes
> - Production impact: None

## Decision

This project is a **plan-based subscription production and distribution
factory**.

It is not a recharge wallet, traffic-balance ledger, usage-debit engine, or
payment-provider integration platform.

The product boundary is:

```text
user chooses a monthly or yearly package
  -> operator or approved commercial process confirms the plan entitlement
  -> system records safe entitlement and issuance request facts
  -> operator-controlled issuance creates a controlled subscription artifact
  -> user receives one controlled subscription package for the validity window
  -> renewal or replacement is handled as a new controlled issuance decision
```

## Active Model

Keep the active product model centered on:

- monthly and yearly package selection;
- entitlement validity;
- one-time controlled subscription issuance;
- opaque artifact distribution;
- user-initiated subscription refresh during the validity window;
- invalidation or replacement of the previous artifact after a refresh;
- expiration, renewal request, and revoke decisions;
- lightweight personal account facts such as registration date and historical
  package/order/invoice summaries;
- audit records and safe references;
- device and abuse-control facts where needed.

## Non-Goals

The active product path does **not** include:

- recharge balance;
- wallet top-up;
- traffic-balance credit/debit;
- automatic usage-based deduction;
- payment webhook authority;
- payment-provider checkout or refund flows;
- payment API / AK / SK integration as a core dependency;
- payment state as subscription authority.

If money collection is needed, it stays outside the subscription factory until
an operator or separate commercial process confirms the entitlement. The
subscription system consumes the confirmed entitlement, not raw payment events.

## What This Means For User Portal Work

The user portal should model:

```text
register / sign in
  -> choose monthly or yearly package
  -> submit request
  -> wait for authorization
  -> active plan / valid until
  -> generate or refresh subscription
  -> renewal request or expired state
  -> personal center with registration date and historical package/bill records
```

The portal should not model:

```text
analytics dashboard
  -> traffic charts / operator metrics
  -> node fleet operations

recharge
  -> balance
  -> usage debit
  -> insufficient balance blocks issuance
```

Payment text in user-facing surfaces should stay generic unless a separate
payment product is explicitly approved. The current user flow can say
`月卡`, `年卡`, `套餐`, `授权`, `开通`, `生成订阅`, `刷新订阅`, `续期`,
and `到期`, but should avoid `充值`, `余额`, `扣费`, or `支付方回调`
as primary product concepts.

`刷新订阅` means replacement, not an extra entitlement. When a user refreshes
their subscription, the old artifact should become expired, revoked, or
otherwise unusable according to the active artifact policy.

The customer-facing surface should stay closer to a simple account center than
an operations dashboard:

- subscription management: generate current subscription, refresh current
  subscription, show validity, show current package;
- personal center: registration date, historical package purchases/orders,
  invoice/bill summaries, support entry;
- support: reserve a future Telegram bot assistant handoff and human-support
  escalation, but do not embed Telegram as the default registration or portal
  dependency.

## What This Means For Existing Billing Artifacts

Existing billing/recharge/payment-provider code and docs are historical
exploration unless a future explicit task re-promotes them. They must not be
used as the default next-step implementation path.

Recommended follow-up:

```text
B-tier cleanup:
  archive or isolate recharge/payment-provider service modules and tests
  from the active platform path

B-tier product implementation:
  strengthen plan entitlement, renewal, expiry, revoke, and audit flows
  without introducing wallet/debit/payment-provider dependencies
```

## Safety Boundary

This document changes only project direction. It does not:

- mutate runtime tenants or artifacts;
- migrate any database;
- change public routes;
- expose Admin;
- activate payment;
- change DNS or Nginx;
- change Aliyun or AWS resources;
- issue, revoke, or publish subscriptions.
