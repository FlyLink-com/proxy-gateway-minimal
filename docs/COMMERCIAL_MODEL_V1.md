# Commercial Model v1

Last updated: 2026-07-11, America/Los_Angeles.

> Status:
> - Type: Active commercial-model baseline
> - Stage: Controlled Beta and Paid Pilot preparation
> - Risk: C for this document
> - Execution authority: None
> - Source of truth for: the v1 offer, package model, commercial lifecycle
>   semantics, usage-cycle policy, and the boundary between commercial rights
>   and technical subscription delivery
> - Not a source of truth for: current deployment state, prices, currencies,
>   payment-provider credentials, invoices, tax policy, refunds, runtime
>   configuration, or production approval

## Decision

Commercial Model v1 sells a time-bounded managed network-access entitlement
with an included traffic allowance. It does not sell a raw subscription URL,
an individual proxy credential, or an unlimited traffic wallet.

```text
approved commercial event
  -> order / access request
  -> time-bounded entitlement
  -> stable account resource
  -> current delivery generation
  -> runtime credentials
  -> measured usage
  -> quota decision
  -> controlled runtime enforcement
```

The stable subscription resource is a delivery surface. Commercial authority
belongs to the account, order, and entitlement. Refreshing delivery material
does not create a new commercial right and does not reset usage.

## V1 Package Model

The initial package vocabulary follows the implemented Portal contract:

| Package | Validity | Usage cycle | Commercial purpose |
| --- | --- | --- | --- |
| `trial` | 7 days | One entitlement-clamped cycle | One controlled evaluation per account |
| `monthly` | 30 days | One monthly cycle | Primary Controlled Beta package |
| `yearly` | 365 days | Monthly cycles anchored to entitlement start | Longer validity with recurring monthly allowance |

Each entitlement carries an explicit traffic allowance. Current accounting
evaluates that allowance within a monthly usage cycle anchored to the
entitlement start and clamped by the entitlement end. A trial ends before a
full month; a yearly entitlement can contain multiple monthly usage cycles.

The 7-day trial has a fixed allowance of 5 GiB (`5 * 1024^3` bytes). It is a
time-limited and traffic-limited evaluation package, not an unlimited plan.

Prices, currencies, taxes, discounts, and paid-package byte amounts are
business configuration outside this baseline. The repository must not invent
or publish them until an operator-approved pricing decision exists.

## Primary Commercial Unit

The primary v1 unit is one entitlement-backed package, not one device, one
credential, or one rendered file.

```text
Account
  -> Order / Access Request
  -> Entitlement
  -> Subscription Resource
  -> One or more channel credentials
```

Multiple runtime credentials may serve one package. They share the same
commercial entitlement and accounting limit unless a later approved model
explicitly creates separate entitlements.

## Commercial State Semantics

These are business semantics, not a new database schema or status enum.

| Condition | Commercial meaning | Access-control consequence |
| --- | --- | --- |
| Pending review | No approved commercial event exists | No production credential activation |
| Approved pending activation | Commercial approval exists, but delivery is not applied | Keep access pending until technical validation succeeds |
| Active | Entitlement is valid and current-cycle usage is below its allowance | Desired runtime credentials may remain active |
| Quota exhausted | Entitlement time is valid, but current-cycle usage reached the allowance | Suspend traffic supply through the controlled credential lifecycle |
| Expired | Entitlement validity ended | Revoke or omit runtime credentials through a controlled gate |
| Suspended | Operator or approved commercial policy paused access | Preserve accounting history and revoke current access |
| Canceled | The order will not activate or renew | Do not create new access; existing access requires an explicit revoke decision |

The system must not report a suspension, rotation, or revocation as complete
until runtime enforcement is applied or explicitly remains pending/failed.

## Usage And Quota Rules

1. Usage is attributed to the account/order entitlement through stable,
   protected credential references.
2. Usage from all channels belonging to one entitlement contributes to the
   same current-cycle allowance.
3. Refreshing a subscription resource rotates technical material but does not
   reset usage, validity, or commercial status.
4. Reaching the allowance requests controlled traffic-supply suspension.
5. A quota decision is not runtime proof. Applied receipts and reconciliation
   remain required.
6. A new usage cycle may restore allowance only through the defined cycle
   boundary or an approved commercial event. Credential refresh alone cannot
   restore allowance.

## Activation And Renewal

Controlled Beta may use an operator-verified commercial event instead of a
live payment provider. That event authorizes entitlement creation or renewal;
it does not directly authorize runtime mutation.

```text
verified commercial event
  -> entitlement decision
  -> subscription-access decision
  -> desired credential state
  -> separately gated runtime apply
```

Renewal extends or replaces the approved entitlement validity and establishes
the applicable future usage cycle. It must preserve prior usage and audit
history. Renewal does not rewrite historical ledger entries.

## Cancellation And Refund Boundary

Commercial Model v1 does not automate refunds.

- Cancellation before activation prevents delivery.
- Cancellation or approved refund after activation requires a separate access
  suspension/revocation decision.
- Revocation removes current access but does not delete order, entitlement,
  usage, payment, or audit history.
- Refund amounts, provider fees, tax treatment, chargebacks, and dispute rules
  require a later commercial-policy decision and provider-specific gate.

## Recharge And Top-up Boundary

Entitlement packages remain the current primary product model. The existing
billing helper is legacy optional traffic-topup compatibility; it is not a
Coins wallet.

Coins are a separate target closed-loop layer. A verified recharge may create
only `paid_coins`. `bonus_coins` and `reward_coins` remain separate balance and
ledger domains, and promotion rewards must never generate further promotion
rewards.

```text
verified recharge payment
  -> durable payment order/event
  -> paid_coins

accepted Coins hold/capture
  -> separate product order
  -> fulfillment decision
```

Recharge, product order, wallet hold/capture, and fulfillment are separate
transactions and decisions. A payment callback must not directly fulfill a
package or mutate runtime access.

Coins may buy only platform-operated products. They cannot be withdrawn,
exchanged to fiat, transferred between users, traded, or used to pay third
parties. These rules describe target architecture, not current backend,
wallet, provider, Portal/Admin, deployment, or production availability.

## Payment Provider Boundary

No payment provider is selected, verified, available, active, or live in
Commercial Model v1. Provider Core contracts, the three disabled and
unverified named Adapter identities (`paypal_v1`, `xsd_v1`, and
`chaojipay_v1`), and the independent unregistered legacy environment-summary
template/helper are source-only boundaries, not proof of a real provider.

A future Coins recharge integration must keep this sequence:

```text
provider event
  -> signature and authenticity verification
  -> normalized payment event
  -> idempotent durable recharge order decision
  -> paid_coins credit decision
```

Product purchase must then begin from a separate wallet hold/capture and
product-order flow. Checkout, callback registration, payment storage, wallet
mutation, refunds, reconciliation, fulfillment, and provider credentials
remain separately gated and are not established by the current Provider Core
source.

## Current Capability Boundary

The repository contains parts of this model, including account/entitlement
records, Portal package vocabulary, subscription delivery, usage accounting,
quota decisions, credential lifecycle contracts, and provider-neutral billing
helpers. These pieces do not prove a complete commercial system.

Current source, artifact, deployment, runtime, and reconciliation status belongs
in `docs/CURRENT_RELEASE_STATE.md`, not in this policy document.

## Explicit Non-goals For v1

```text
unlimited traffic plans
pure prepaid wallet as the primary product
automatic top-up
live public checkout
automatic refunds or chargebacks
invoices, tax calculation, or multi-currency accounting
CRM or sales-pipeline replacement
affiliate settlement or AppsFlyer activation
automatic runtime mutation directly from payment events
enterprise SLA claims
```

## Acceptance Rules

Commercial Model v1 is implemented only when all applicable rules are proven:

- every active package has explicit validity and traffic allowance;
- usage is evaluated in the documented entitlement cycle;
- refresh preserves the stable subscription resource and current usage;
- quota exhaustion produces controlled runtime suspension;
- old runtime material is invalid after an applied refresh rotation;
- renewal does not rewrite historical usage;
- payment/commercial events are idempotent before they affect entitlement;
- recharge cannot directly fulfill a product, and product consumption cannot
  be mistaken for a recharge payment;
- `paid_coins`, `bonus_coins`, and `reward_coins` remain separate domains;
- no secret, raw payment payload, subscription URL, credential material, or
  customer-private data appears in public evidence;
- production state is demonstrated by runtime receipt and reconciliation, not
  inferred from source or CI.

## Related Documents

- `docs/units/COMMERCIAL_ENTITLEMENT_UNIT.md`
- `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`
- `docs/TRAFFIC_ACCOUNTING_QUOTA_GATEWAY_PLAN.md`
- `docs/BILLING_RECHARGE_CONTRACT.md`
- `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- `docs/CURRENT_RELEASE_STATE.md`
