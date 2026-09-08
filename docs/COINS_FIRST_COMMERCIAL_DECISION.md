# Coins-First Catalog and Referral Decision

Last updated: 2026-09-08, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: coins_first_catalog_referral
  superseded_by: null
  last_verified_at: 2026-09-08
  production_authority: false
```

> Status:
> - Type: Active target catalog and Portal referral decision
> - Risk: C for this document
> - Production impact: None
> - Source of truth for: the approved target Coins-first catalog inputs and the
>   Portal-account referral reward origin, basis, exclusions, and lifecycle
> - Not a source of truth for: current source availability,
>   unresolved discount or price-difference policy, provider state,
>   schema state, feature flags, deployment, or production runtime
> - Execution authority: None

## Authority and Precedence

This record reconciles the product inputs approved in native Issue
[#522](https://github.com/gccwebos-com/proxy-gateway-minimal/issues/522).
For the target Coins-first catalog and Portal-account referral reward, it is
the current decision authority for downstream work under Issues #439, #523,
and #524.

This record complements `docs/COMMERCIAL_MODEL_V1.md`. That document continues
to own the base v1 entitlement and commercial-domain boundaries; this record
supplies the later approved target catalog values and referral rule that the v1
baseline intentionally did not choose.

For referral origin and calculation basis, this record supersedes the
spend-based passages identified by the reconciliation notices in:

- `docs/superpowers/specs/2026-07-23-coins-wallet-promotion-design.md`; and
- `docs/superpowers/specs/2026-07-26-portal-commerce-layout-v1.md`.

Those passages remain historical design evidence. They are not implementation
authority for the current referral rule. This decision does not rewrite an
existing product, Offer, Quote, order, wallet entry, entitlement, or runtime
fact. It does not supersede partner/campaign settlement policy in
`docs/PARTNER_ATTRIBUTION_SETTLEMENT_ARCHITECTURE.md`.

## Approved Target Catalog

Recharge and product purchase are separate decisions. The approved recharge
tiers are exactly `10`, `30`, `50`, `100`, `200`, and `300` Coins. A tier is a
target `paid_coins` credit quantity after verified durable external settlement;
it is not a product order and does not silently fulfill a product.

The target product catalog is:

| Product | Coin price | Validity and traffic | Marketplace benefit |
| --- | ---: | --- | ---: |
| Monthly card A | 20 | One month; 50 GB resets each month | 5% catalog discount |
| Monthly card B | 30 | One month; 100 GB resets each month | 10% catalog discount |
| Annual card | 200 | One year; 200 GB resets each month | 20% catalog discount |
| Permanent traffic pack | 30 | 100 GB; does not expire | None |
| Permanent traffic pack | 50 | 200 GB; does not expire | None |

Catalog rules:

1. Product, Offer, Quote, catalog release, Coin price, discount, fulfillment,
   and policy inputs are immutable snapshots for an order. Publishing a later
   version never edits an earlier order.
2. Monthly-card traffic is consumed before permanent traffic-pack traffic.
   This decision does not invent an ordering rule between multiple permanent
   packs.
3. Normal eligible product spending allocates Coins in this order:
   eligible expiring `bonus_coins`, then `paid_coins`, then `reward_coins`.
4. Paid Coins do not expire. Ordinary bonus Coins initially expire after
   30 days. Referral-settlement reward Coins do not expire.
5. The separately versioned Welcome Coins promotion remains a narrow policy
   exception with its own documented amount and validity. This decision does
   not silently rewrite that existing promotion.
6. Coins remain closed-loop. They cannot be withdrawn, exchanged for fiat,
   transferred between users, traded, or used to pay a third-party merchant.
7. Insufficient Coins may offer an explicit navigation to recharge. It never
   triggers an external checkout, automatic recharge, automatic return, or
   automatic resumed purchase.

## Referral Reward Decision

Every normal active Portal account can promote by default. First link creation
lazily creates its promotion profile, and each account owns one stable logical
promotion link. Registration success locks the referred account's attribution;
registration alone creates no reward.

The only referral-reward origin is the referred account's first verified
external recharge:

```text
locked referral attribution
  -> first verified external recharge settlement
  -> exactly-once paid_coins posting
  -> exactly-one pending reward accrual
  -> confirmation or cumulative refund/chargeback reversal
```

The recharge qualifies only after the external payment fact is verified, the
internal durable settlement succeeds, and the resulting integer `paid_coins`
credit is committed idempotently. A failed, unverified, or abandoned attempt
does not qualify. The reward basis is the actual integer `paid_coins` quantity
credited by that first settlement, not the external provider display amount
and not those Coins' later product consumption.

The settlement binds an immutable published reward-policy version. The policy
owns the calculation operands, rounding rule, confirmation delay, refund and
chargeback observation rule, and risk rule. If one applicable published policy
cannot be selected unambiguously, the accrual fails closed. The Portal never
provides or recomputes the reward rate.

The following events create no referral reward:

- registration by itself;
- a later recharge;
- product purchase or consumption, including a captured `paid_coins` portion;
- traffic usage;
- `bonus_coins` or `reward_coins` spending;
- recovery payment or operator credit; and
- fulfillment retry or replay.

Duplicate callback, reconciliation, retry, restart recovery, or alternate
idempotency key cannot create a second origin or accrual for the same referred
account. Reward-funded spending never creates another reward.

A reward starts as `pending`. It becomes `available` only after the immutable
policy's observation period and risk gate pass. Partial refunds recompute the
cumulative target against the original first-recharge settlement and reverse
only the additional difference. A full refund or chargeback reverses the
remaining reward. Reversal of the first recharge never restores first-recharge
eligibility for a later recharge.

### Approved initial referral policy (2026-09-08)

The operator subsequently approved these initial reward operands in the project
conversation, including the waiting-period and rounding clarifications:

| Operand | Approved value |
| --- | --- |
| Origin and basis | One reward per referred account, on the first verified external recharge's actual committed `paid_coins` credit only |
| Rate | 20%, represented as `rateBps: 2000` |
| Rounding | `floor`; discard the fractional Coin |
| Registration attribution | 60 days from the last valid referral landing; registration fixes the relationship |
| Confirmation delay | 7 days from the original paid-Coins credit |
| Delivery | Automatic internal Coins confirmation after the delay and authoritative internal payment, attribution, account and recorded-refund checks |
| Asset | Non-expiring, closed-loop `reward_coins`; no cash payment or withdrawal |

For example, a qualifying first credit of 103 paid Coins accrues 20 pending
reward Coins. A later recharge creates no additional referral reward. Seven
elapsed days alone do not authorize release: the original credited payment and
wallet origin must still match, the attribution and accounts must be valid,
and all internally recorded refund reversals must be consistent. Incomplete or
ambiguous internal facts leave the reward pending or explicitly unreconciled.

The operator clarified that delivery is entirely internal Coins bookkeeping.
It does not require external payment to a promoter, a new settlement provider,
or a provider-wide refund-coverage feed. An internal confirmation records the
checks it actually performed; it does not assert that an external provider has
no unreported refund. Trusted refund facts, when recorded, continue through the
existing cumulative reversal path. Automatic confirmation is the approved
target, not a claim that it has been deployed.

The exact future `effectiveAt`, immutable policy reference/version and canonical
policy digest must be bound before activation. Do not backdate a new policy or
replace an original first recharge that had no applicable policy with a later
recharge. Changed rates apply through a new policy version; earlier rewards and
refund calculations retain their original policy.

This decision approves the business operands and automatic-settlement target.
Actual source readiness, internal ledger validation, schema, backup,
artifact and production cutover remain separately verified execution facts. See
`PORTAL_REFERRAL_REWARD_RELEASE.md` for the concrete activation boundary.

The safe Portal performance projection is limited to:

```text
registrations
first-recharge conversions
credited first-recharge paid_coins
pending reward_coins
available reward_coins
reversed reward_coins
conversion rate
```

It does not expose a referred account's identity, private attribution evidence,
provider amount, raw payment fact, or customer data. The Portal cannot derive a
reward from product orders, wallet spending, or local constants.

## Explicitly Unresolved Product Inputs

Native Issue #522 fixes the catalog values and referral origin above, but it
does not choose all price-transition semantics. This record therefore does not
invent:

- whether multiple active catalog discounts stack or which one wins;
- the integer rounding rule for a discounted product Quote;
- the eligible-product boundary when multiple entitlement benefits overlap;
- renewal price-version selection; or
- upgrade/downgrade proration, price-difference, credit, or refund behavior.

Until an immutable reviewed policy resolves each applicable input, the backend
must leave that operation unavailable or fail closed before a hold, capture,
wallet mutation, fulfillment command, or runtime effect. A frontend cannot
choose a fallback. This explicit gap must be resolved before Issue #522 is
reported complete.

## Source and Production Boundary

At the 2026-08-30 source cutoff,
`master@836f23f667879b79e2ab2e825fb98e487cfa2165` still contains three plan
Offers with zero discounts, no published data-pack Offers, the historical
spend-based referral design, and an `Attributed spend` Portal placeholder.
Those are source drift from this target decision, not proof that this decision
has been implemented.

Downstream ownership remains separate:

- #439 owns provider-neutral commercial-event and capability contracts;
- #523 owns protected referral APIs and Portal source presentation; and
- #524 owns durable schema, first-recharge settlement, reward
  accrual/reversal, provider validation, fulfillment, migration, deployment,
  and any production activation.

This Risk C record changes no API, UI source, database, wallet balance,
provider, credential, callback, feature flag, artifact, release, deployment,
runtime, or customer data. Any such action retains its independent B- or
A-tier gate.

## Documentation Acceptance

- This document is linked from `docs/README.md` as the current target catalog
  and referral decision.
- The two historical specifications retain their original wording and carry
  explicit scope-specific supersession notices.
- Product spend is never described as the current referral-reward origin.
- Recharge is not described as sufficient before verified durable settlement
  and idempotent `paid_coins` credit.
- Unresolved price-transition semantics remain explicit and fail closed.
- `npm run docs:authority:check`, `npm run docs:authority:strict`, and
  `git diff --check origin/master...HEAD` pass for the exact documentation
  change.
