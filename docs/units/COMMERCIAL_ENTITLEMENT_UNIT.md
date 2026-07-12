# Commercial / Entitlement Unit

Last updated: 2026-07-11, America/Los_Angeles.

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize code, billing provider integration,
>   CRM changes, CI, AWS, DNS, Nginx, HTTPS, systemd, production config, node,
>   tenant, artifact, credential, SQLite, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: commercial rights, package state, validity, quota,
>   renewal state, and future entitlement decisions

## Purpose

The Commercial / Entitlement Unit defines whether a customer is commercially
allowed to use the service and under which limits.

It owns plan, validity, quota, renewal, and customer commercial state. It
produces entitlement decisions for product and access-control units. It does
not render subscription YAML, choose network nodes, own opaque artifacts, or
measure edge health.

Current repository note: a repo-only in-memory account / entitlement shell now
exists for Aliyun Subscription Control Platform MVP validation. It proves
operator-safe account summaries, entitlement summaries, plan/status validation,
and fail-closed usable-entitlement decisions. It is not a complete billing,
CRM, order, invoice, renewal, payment, production storage, or commercial
entitlement system.

`docs/COMMERCIAL_MODEL_V1.md` is the active policy baseline for the initial
time-bounded package and included-traffic model. This unit owns the commercial
decision boundary used to implement that policy; it does not duplicate or
replace the policy document.

## Responsibilities

```text
plan or package definition
validity windows
quota or traffic entitlement rules
renewal and expiration policy
commercial active / expired / disabled / suspended states when implemented
customer commercial status needed by product and access control
entitlement decisions consumable by downstream units
commercial state separation from technical tokens and node identity
```

## Explicit Non-Responsibilities

```text
Subscription V2 YAML rendering
Clash/Mihomo config generation
direct node selection
opaque artifact storage or issuance
tenant token hashing or visible-once token behavior
edge health, listener ports, node readiness, or capacity replacement
CI execution
AWS, DNS, Nginx, HTTPS, systemd, security group, or runtime mutation
secret, token, subscription URL, credential, or customer-data storage in docs
```

## Inputs

```text
product package and commercial policy decisions
future order, payment, renewal, refund, suspension, or cancellation events
operator-approved commercial state changes
product requirements for user-facing commercial states
validation evidence once entitlement behavior is implemented
```

## Outputs

```text
entitlement decision
commercial status summary
validity start and end where applicable
quota or traffic limit where applicable
renewal or grace-period flags where applicable
non-secret audit expectations for commercial state transitions
```

The entitlement decision should answer:

```text
subject may use the service
entitlement is active / expired / disabled / suspended / grace-period
commercial flags needed by Product Business and Subscription Access Control
```

## Interfaces With Other Units

```text
Product Business:
  provides commercial summaries that can be expressed as user-facing states

Subscription Access Control:
  provides entitlement decisions, not raw payment data or network routes

Edge / Node Capacity:
  may provide aggregate demand context later, but this unit does not assign
  nodes

Local Client:
  no direct interface except through product and access-control behavior

Validation / CI:
  receives testable entitlement rules once implementation exists

Operator Lab:
  may provide research context, but never becomes commercial source of truth

Production Operations:
  has no direct mutation authority from this unit
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/PROJECT_CONTEXT.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
server/services/subscriptions/*
server/services/platform/control-plane-contract.mjs
server/routes/subscription.mjs
server/routes/admin-subscriptions.mjs
server/tests/platform-control-plane-contract.test.mjs
server/services/platform/account-entitlement-shell.mjs
server/routes/admin-platform.mjs
server/tests/platform-account-entitlement-shell.test.mjs
server/tests/platform-account-routes.test.mjs
```

The server anchors currently represent technical subscription access behavior.
The platform control-plane contract adds repository-only account and entitlement
decision shapes. The account / entitlement shell adds repository-only in-memory
operator workflows for converting a lead to an account and creating entitlement
summaries, but it is not evidence of a complete commercial entitlement,
billing, CRM, order, invoice, renewal system, production storage, or payment
provider integration.

## Risk And Validation

```text
Default risk:
  C for docs-only commercial architecture
  B for repository-only entitlement logic with tests
  A for auth model, schema/migration, tenant mutation, production access
    semantics, or deployment changes

Docs-only validation:
  git diff --check origin/master...HEAD
```

## Next Tasks

```text
map Commercial Model v1 semantics to repository-safe account, order, and
  entitlement summaries
separate technical subscription delivery state from commercial entitlement
  state in the Portal and Admin projections
define idempotent operator-verified activation and renewal events for Controlled
  Beta before selecting a payment provider
keep top-up/recharge as an optional extension instead of a competing primary
  commercial model
extend commercial behavior through repository-only tests until later durable
  storage, payment-provider, and production gates are approved
```

## Paused / Blocked Items

```text
full billing or CRM integration
real payment/order status source of truth
customer commercial record storage
automatic renewal, refund, chargeback, invoice, tax, or top-up behavior
production deployment, tenant mutation, artifact issuance, and node selection
```
