# Coins Wallet, Promotion, Recharge, and Commerce Design

Last updated: 2026-08-30, America/Los_Angeles.

> Status:
> - Risk: A for schema, authorization, payment-provider, production migration,
>   and production activation; B for isolated source-only domain code
> - Process: read-only inventory, approved design, clean worktree, TDD,
>   migration dry-run, independent production gate
> - Expected source PRs: 5
> - Production impact: None
> - Execution authority: This design authorizes local source, tests, and
>   migration tooling only. It does not authorize production database changes,
>   provider calls, credentials, webhook registration, deployment, static
>   publication, balance changes, fulfillment, or frontend feature enablement.
> - Frontend identity: This backend design does not confirm Portal or Admin
>   deployment/artifact identity. Frontend integration remains blocked on its
>   independent Production Surface Identity Record.
> - Design review: Two independent read-only consistency passes report no
>   remaining implementation blocker in the original 2026-07-23 design.
> - Referral reconciliation: The spend-based referral portions identified
>   below are historical and are not current implementation authority.

## 2026-08-30 Referral Decision Reconciliation

`docs/COINS_FIRST_COMMERCIAL_DECISION.md` is the current authority for the
Portal-account referral reward origin, basis, exclusions, and lifecycle. It
selects the referred account's first verified external recharge after durable
settlement and exactly-once `paid_coins` posting. Later product spending,
including captured `paid_coins`, creates no referral reward.

The following original passages are retained for design history but are
superseded for referral implementation:

- item 14 under `Confirmed Product Decisions`;
- the commerce-capture selection time under `Reward policy assignments`;
- the commerce-derived reward metrics under `Attribution and Performance`;
- the product-spend fields, flow, uniqueness, and refund calculations under
  `Reward Policies and Accruals`;
- reward recomputation coupled to historical commerce captures under
  `Future Additive Source Reversal and Recovery`; and
- the paid-Coin product-delivery and no-reward-for-recharge assertions under
  `Promotion tests`.

Do not implement those passages as the current referral rule. Their text is
not deleted or retroactively rewritten. Wallet lots, holds, immutable ledger,
Recharge/Payment versus product-order separation, fulfillment, and other
unrelated boundaries in this design remain subject to their own current source
and activation evidence. This reconciliation changes no source code, schema,
provider, balance, deployment, runtime, or production state.

## Goal

Build a durable closed-loop Coins foundation for GCC WebOS:

- every active Portal account can create one stable promotion link;
- paid, bonus, and promotion-reward Coins stay in separate lots;
- Coins can buy only platform-owned products;
- no Coin can be withdrawn, exchanged for fiat, transferred, traded, or paid
  to a third party;
- promotion performance, reward confirmation, administrator adjustments,
  product purchases, recharge, and fulfillment remain separate auditable
  domains;
- no editable balance field or mutable financial history exists.

## Confirmed Product Decisions

1. `platform_accounts` remains the only Portal account identity root.
2. All active Portal accounts can promote by default.
3. The first link creation lazily creates the account's promotion profile.
4. There is no professional-versus-ordinary promoter identity or tier.
5. Every account has at most one stable logical promotion link. There is no
   per-account link quota or multi-link mode.
6. Differences between promoters come only from assigned policy, account
   status, and risk state.
7. The account owns all three Coin types, including `reward_coins`.
8. Existing partner-attribution and settlement-candidate data is upstream
   evidence only. It is not a wallet, account identity, or balance.
9. A promoter's single distribution link can be embedded in an external
   distribution system, but attribution and reward decisions remain controlled
   by GCC WebOS.
10. Promotion performance has its own Portal page.
11. Administrator balance work uses a controlled Promotion Reward Adjustment
    order. There is no arbitrary balance input.
12. Existing direct checkout remains until the full Coins backend is accepted.
13. A normal multi-Coin purchase consumes eligible bonus Coins first, then
    paid Coins, and reward Coins last. Reward Coins are deliberately preserved
    because they represent earned promotion value.
14. Only the referred account's eligible product spend actually captured from
    `paid_coins` can create reward for its locked promoter. Recharge itself,
    `bonus_coins` spend, `reward_coins` spend, and recovery payment create no
    promotion reward.
15. A verified refund or chargeback that creates a consumed same-type
    shortfall is handled by a later additive recovery migration: it freezes new
    wallet spending and opens a recovery case without debiting another Coin
    type or creating a negative balance.
16. Checkout offers Coins payment explicitly. If the current eligible balance
    is insufficient, the user decides whether to navigate to recharge; the
    system never redirects, recharges, or resumes purchase automatically.
17. For a Coins-funded platform-product purchase, successful immutable wallet
    `capture` committed by the control plane is the only payment-success
    authority. A hold, funded-order projection, frontend state, or fulfillment
    state is not payment success.
18. Payment authority does not replace the account as identity authority, the
    order as commercial authority, or the entitlement/account resource as
    service-delivery authority.

## Current Repository Boundary

The current durable account and Portal-authentication schema can be reused:

- `platform_accounts`;
- Portal entries, password credentials, TOTP credentials, passkeys, second
  factor challenges, and sessions;
- entitlements, access requests, issuance, usage, and controlled delivery.

The current source does not provide:

- account-owned promotion profiles or one canonical account promotion link;
- durable Coin wallets, lots, holds, allocations, or an immutable Coin ledger;
- durable recharge orders or payment-event inbox;
- versioned product and Offer records;
- durable commerce orders or fulfillment commands for Coins;
- persistent Admin operator capabilities;
- Promotion Reward Adjustment orders;
- production-safe schema-version and migration tooling.

Draft PR #519 at
`19707207f3b4c23a656450718a47218629642ed2` remains source-only. Its PayPal
adapter may be re-imported in the fifth source PR after comparison with the
then-current base. Its in-memory Portal checkout service is not a wallet or
durable payment system.

Draft PR #526 remains open at
`771ffd9b91e8d5021b6c33e5c09b50c6d8e172db`. It is a source-only donor, not an
implementation branch for this design. It must not be made Ready or merged
unchanged because it overlaps the new commerce APIs and Portal UI, removes the
existing direct checkout, adds a top-level Payment Logs surface, and carries a
parallel commerce workspace. Reuse requires a file-by-file re-import comparison
against the then-current base and this design. Only bounded components, typed
contracts, and tests that preserve the production Portal shell and the domain
boundaries below may be transplanted. Closing or superseding the Draft PR is a
separate GitHub action and is not authorized by this document.

## Source-PR Boundaries

PR1 is Wallet Core only. Its migration owns the migration ledger plus:

```text
platform_coin_wallets
platform_coin_lots
platform_coin_holds
platform_coin_hold_allocations
platform_coin_operation_receipts
platform_coin_credit_origins
platform_coin_ledger_entries
```

PR1 implements credit, reward confirmation, product/reward-adjustment hold,
capture, release, hold expiry, bonus-lot expiry, and the default-off wallet
runtime gate. It creates no recovery cases, source-reversal allocations,
recovery resolutions, wallet restrictions, commerce orders, product/Offer
schema, fulfillment commands, delivery coordinator, provider integration, HTTP
route, Portal/Admin UI, or production migration.

Refund/chargeback source reversal, same-type recovery payment, spend freeze,
waiver, and Admin recovery resolution require a later additive-migration PR.
Describing those future rules below does not claim that PR1, PR2, or this
documentation amendment implements them.

## Runtime Activation Gates

Source presence and schema presence do not enable a Coins capability. Runtime
uses four independent, default-false gates:

```text
coins_wallet_enabled
promotion_rewards_enabled
coins_commerce_enabled
coins_recharge_enabled
```

Dependencies are fail-closed:

- promotion rewards require the wallet gate;
- commerce requires the wallet gate, a published Offer, and a registered
  durable fulfillment handler;
- recharge requires the wallet gate, an enabled provider adapter, an exact
  pricing policy, and verified webhook or reconciliation capability;
- Admin promotion and reward-adjustment routes additionally require durable
  operator principals and capabilities.

When a gate is false, its routes and background consumers are not registered,
its workers do not run, and ordinary runtime startup does not create or mutate
its schema. Enabling a gate changes startup from `disabled` to exact
schema-validation for that capability; schema mismatch prevents activation.
No gate can be inferred from a built frontend, a database table, provider
configuration, or another gate. Production values remain false until separate
activation approval.

## Domain Architecture

```text
Portal account and session
  -> promotion profile and stable link
  -> attribution and immutable commercial facts
  -> reward accrual decision
  -> Coin wallet lots and ledger

Payment provider
  -> recharge intent
  -> verified payment event
  -> settlement decision
  -> paid_coins lot and ledger

Product Offer
  -> commerce order
  -> Coin hold and capture
  -> durable delivery intent
  -> thin order/delivery coordinator
  -> product adapter
  -> entitlement or traffic grant
```

These domains communicate by stable safe references and immutable snapshots.
No provider callback may directly issue an entitlement, mutate runtime
credentials, or write a wallet balance.

## Account and Promotion Model

### Promotion profile

`platform_promotion_profiles` contains:

```text
profile_ref
account_id unique
status: active | paused
created_at
updated_at
```

Rules:

- a valid active Portal session and active account are required;
- activation configuration supplies the exact published default reward-policy
  version; promotion activation fails closed if it is absent;
- the first link-creation immediate transaction creates the profile, its
  default policy assignment, and its only logical link if the profile is
  missing;
- missing or ambiguous default configuration fails without creating any of
  those records;
- suspended or disabled accounts cannot create a link or receive new
  attributions;
- a paused profile cannot create or activate its link or receive new
  attributions;
- pausing does not delete historical performance or confiscate Coins;
- the profile contains no promoter tier.

### Stable promotion link

`platform_promotion_links` contains:

```text
link_ref
profile_ref unique
safe_label
landing_route
status: active | paused
created_at
updated_at
```

`platform_promotion_link_codes` preserves rotations:

```text
code_ref
link_ref
code_version
public_code unique
status: active | revoked
created_at
revoked_at
unique(link_ref, code_version)
```

Rules:

- `landing_route` must be selected from a server allowlist;
- arbitrary redirect URLs are forbidden;
- `unique(profile_ref)` is the database authority that prevents a second
  logical link, including under concurrent create requests;
- a repeated create request for an existing profile returns that same link;
- link codes are opaque and never reused after revocation or rotation;
- a partial unique index permits only one active code for a link;
- code rotation preserves `link_ref`, atomically revokes the current code and
  creates its next version, and never leaves two codes active;
- users can rename, pause, resume, or request rotation only for their own link;
- users cannot change profile status or reward policy.

### Reward policy assignments

`platform_reward_policy_assignments` contains:

```text
assignment_ref
account_id
policy_ref
policy_version
policy_digest
effective_from
supersedes_assignment_ref
assigned_by_ref
```

Assignments are the only policy authority and are append-only. The first
assignment begins at `effective_from`. Each later assignment must reference the
current tail assignment and use a strictly later UTC `effective_from`; its
insertion derives the prior assignment's end without updating the prior fact.
The effective window is the UTC half-open interval from this assignment's
`effective_from` to the next assignment's `effective_from`, or open-ended for
the tail. A unique `(account_id, effective_from)` constraint and immediate
tail-CAS transaction prevent forks and overlap. The policy selected for a
reward is the unique assignment effective at the eligible commerce capture
time. Missing or multiple matches fail closed and create no accrual. Every
reward calculation stores the exact policy version, digest, rate operands,
rounding rule, and result.

## Attribution and Performance

Registration uses the most recent eligible promotion link within the active
attribution window. Once registration succeeds, the referred account's
attribution is locked.

`platform_promotion_attributions` is the canonical durable binding:

```text
attribution_ref
referred_account_id unique
promoter_account_id
promotion_profile_ref
promotion_link_ref
selected_touch_ref
attribution_window_started_at
registered_at
created_at
```

`platform_promotion_attribution_events` is append-only and records capture,
rejection, and compensating correction decisions with safe references and
digests. `platform_promotion_attribution_state` is the event-derived
projection:

```text
attribution_ref unique
status: active | rejected | reversed
version
last_event_ref unique
updated_at
```

Only `active` attribution can create new reward accruals or eligible
performance. Rejection or reversal is an append-only event followed by a
version-CAS projection update; it never silently reassigns the referred
account. A compensating correction creates a separate reward adjustment or
audit fact and does not rewrite the binding.

The existing source-only `platform_attribution_account_bindings`,
`platform_attribution_order_bindings`, partner attribution events, and
settlement candidates are donor evidence, not a second authority. PR 3 must
add the canonical writer behind the default-off promotion gate and perform a
re-import comparison. Merging source does not disable a current writer. A
later activation-safe cutover requires the comparison to pass, selects exactly
one authority, stops the old writer before starting the canonical writer, and
read-backs the selection. Eligible historical facts may then pass through an
idempotent bridge; the old tables remain read-only. The runtime must never
dual-write two attribution authorities.

The system forbids:

- self-referral;
- attribution after registration;
- duplicate bindings;
- silent reassignment to a later link;
- direct administrator edits to attribution facts.

Corrections are new rejected, reversed, or compensating audit events.

Performance is derived from immutable registration, commerce capture, refund,
chargeback, delivery, and reward facts. Verified provider-payment facts appear
only in the temporary direct-checkout bridge and recharge-recovery evidence.
The system does not store editable registration-count or sales-total counters.

Because each account has one logical link, the Portal Promotion Center exposes
one account/link performance projection:

```text
registrations
valid paid orders
eligible spend
pending reward_coins
available reward_coins
held reward_coins
refund and reversal amount
conversion rate
```

It never exposes referred-customer identity or private payment data.

## Reward Policies and Accruals

`platform_reward_policies` contains:

```text
policy_ref
version
status: draft | in_review | published | retired
calculation_mode: fixed | paid_coin_share
rate_numerator
rate_denominator
minimum_reward_units
maximum_reward_units
confirmation_delay_days
eligible_offer_refs
policy_digest
```

Published policy versions are immutable. All Coin and fiat values use integers.
Floating-point arithmetic is forbidden. The system does not assume that one
currency minor unit equals one Coin.

The canonical reward basis is an eligible platform-product order funded with
`paid_coins`. Recharge by itself is not consumption and earns no reward.
`bonus_coins` and `reward_coins` portions of a purchase earn no reward, which
prevents free-credit and recursive reward loops. For a mixed-Coin order, only
the referred buyer's captured `paid_coins` allocations contribute to eligible
spend, and the resulting reward belongs to the promoter fixed by registration
attribution. Spending earned `reward_coins` can never generate another
promotion reward at any level.

The legacy direct-checkout path may temporarily feed rewards only through an
explicit bridge that freezes its exact Offer, fiat price, settlement, delivery,
and conversion-policy snapshots. It is not the canonical path and is removed
only after the Coins closure gate. Provider payment and product delivery are
therefore never assumed to be the same event in the Coins flow.

`platform_reward_accruals` contains:

```text
accrual_ref
credit_origin_ref unique
account_id
attribution_ref
promotion_link_ref
referred_account_id
commerce_order_ref
commerce_capture_ref
entitlement_ref
eligible_paid_coin_units
legacy_basis_currency
legacy_basis_amount_minor
calculation_mode
rate_numerator
rate_denominator
minimum_reward_units
maximum_reward_units
reward_units
policy_ref
policy_version
policy_digest
rounding_rule
status: pending | available | reversed | recovery_required
confirmation_available_at
created_at
updated_at
```

The normal flow is:

```text
locked registration attribution
  -> eligible Offer order
  -> paid_coins capture
  -> successful platform-product delivery fact
  -> pending reward accrual and pending reward lot
  -> refund, chargeback, and risk delay
  -> controlled confirmation
  -> pending reward units become available
```

Recharge settlement, bonus-funded spend, reward-funded spend, delivery not
completed, self-referral, duplicate capture, refund, chargeback, risk
rejection, a pre-existing pause, or policy mismatch prevents or reduces
confirmation.

The accrual origin is unique for the attribution, commerce capture, Offer
version, and policy version. The accrual decision, pending reward lot, wallet
operation receipt, and ledger credit are written in one immediate transaction.
Two different idempotency keys cannot credit the same origin twice.

Partial refund and reversal calculations are cumulative. The system recomputes
the target reward from the remaining eligible `paid_coins` spend using the
original policy operands and rounding rule:

```text
target_reward_units =
  apply_original_policy(original_eligible_paid_units - cumulative_reversed_paid_units)

new_reversal_units =
  previously_issued_reward_units - target_reward_units - already_reversed_units
```

The target is monotonic non-increasing, never below zero, and never above the
original reward. A full order reversal or a chargeback that invalidates all
eligible paid funding sets the target to zero. Repeated and out-of-order refund
events use a stable cumulative source identity and cannot over-reverse through
per-event rounding.

Existing attribution and settlement-candidate records may feed an accrual only
through an idempotent reward-accrual decision. They never write the wallet
directly.

## Wallet and Coin Lots

### Wallet

`platform_coin_wallets` contains:

```text
wallet_ref
account_id unique
status: active | frozen | closed
version
created_at
updated_at
```

The wallet has no editable aggregate balance. Balances are projections of its
lots and active hold allocations. The wallet version increments once for each
successful balance-affecting business operation, not once per ledger row.

Wallet status is fail-closed:

| Status | New user hold | Capture | Release | Expiry | Verified credit | Provider or reward reversal | Read/audit |
|---|---:|---:|---:|---:|---:|---:|---:|
| `active` | yes | yes | yes | yes | yes | yes | yes |
| `frozen` | no | no | mandatory cleanup allowed | mandatory cleanup allowed | yes, subject to the active risk policy | yes | yes |
| `closed` | no | no | mandatory cleanup only | mandatory cleanup only | no | later additive only | yes |

Every hold, capture, release, and expiry mutation re-reads wallet status after
obtaining the immediate write lock. In PR1, `closed` authorizes only mandatory
release/expiry cleanup. A future additive reversal contract may separately
authorize reversal on a closed wallet, but it cannot reopen spending.

For the PR1 confirmation/hold slice, `confirm_coin_credit` is allowed for
`active` and `frozen` wallets and rejected for `closed`; `create_coin_hold` is
allowed only for `active`, and both `frozen` and `closed` return
`wallet_not_active`. Replay lookup occurs inside `BEGIN IMMEDIATE` before
current wallet or lot state is re-evaluated, so a prior terminal result remains
stable after a later status or balance change. A first-time rejection for a
missing subject or disallowed current state creates no receipt.

In PR1, `frozen` does not create or expose a recovery restriction, and the
store has no source-reversal mutation. A wallet can close only with no pending
units or active holds. After the later additive recovery migration, it also
requires no open recovery case. Wallets and financial child records are never
deleted, and financial foreign keys never use `ON DELETE CASCADE`.

### Lots

`platform_coin_lots` contains:

```text
lot_ref
wallet_ref
coin_type: paid_coins | bonus_coins | reward_coins
credit_origin_ref unique
issued_units
pending_units
available_units
held_units
consumed_units
reversed_units
expired_units
source_type
source_ref
policy_ref
policy_version
expires_at
created_at
updated_at
```

Every amount is a non-negative safe integer and every lot must satisfy:

```text
pending + available + held + consumed + reversed + expired = issued
```

SQLite `CHECK` constraints enforce non-negative integer buckets and the lot
sum. Service validation additionally uses safe-integer arithmetic and rejects
inputs or sums outside the JavaScript safe-integer range.

Source rules:

- verified recharge settlement creates available `paid_coins`;
- approved activity or compensation creates available `bonus_coins`;
- promotion accrual creates pending `reward_coins`;
- promotion confirmation moves pending reward units to available;
- paid and reward lots have null `expires_at`;
- only bonus lots may have a non-null `expires_at`.

For each expiring bonus lot, a worker uses
`lot-expiry:<lot_ref>:<expires_at>`. At or after database UTC expiry, one
immediate transaction moves all unheld available units to expired and records
the operation receipt. Active held units remain protected until their hold is
captured, released, invalidated, or expires; a later release sends them to
expired rather than available. A due first execution with zero available units
stores the exact `expiry_processed/n -> n` outcome, and repeated execution
replays that receipt.

## Holds and Consumption

`platform_coin_holds` contains:

```text
hold_ref
wallet_ref
purpose: product_purchase | reward_adjustment
purpose_ref
amount_units
status: active | captured | released | expired | invalidated
expires_at
created_at
updated_at
```

`platform_coin_hold_allocations` contains immutable allocation facts:

```text
allocation_ref
hold_ref
lot_ref
allocation_sequence
allocated_units
created_at
unique(hold_ref, lot_ref)
```

Hold `amount_units` must be a positive safe integer and is validated before a
transaction opens; the generic zero-capable balance-unit validator is not a
sufficient hold-amount guard. Allocation sequences must be exactly `1..N`,
allocation units must be positive safe integers, and their safe-integer sum
must equal `amount_units` before persistence. Active allocations must equal
the affected lots' `held_units` contribution. Holds are all-or-nothing:
partial capture or partial release is not supported.

The default general-product allocation order is:

```text
eligible bonus_coins ordered by earliest expiry
  -> paid_coins
  -> reward_coins
```

The Offer's `accepted_coins` and the store's `acceptedCoinTypes` are the same
mathematical-set contract, not an ordered caller preference. Duplicates and an
empty set are invalid. The canonical normalized representation is the accepted
subset ordered by the fixed platform priority `bonus_coins`, `paid_coins`,
`reward_coins`. Reordering the same set produces the same request digest and
cannot change allocation priority. The allocator first filters by that set,
lot eligibility, and expiry, then applies the fixed order above. It therefore
preserves earned `reward_coins` whenever eligible bonus or paid Coins can cover
the purchase.
Within each Coin type, selection is deterministic by `expires_at` with null
last, then `created_at`, then `lot_ref`.

Promotion-fee adjustments and reward-only Offers can allocate only
`reward_coins`.

Credit, confirmation, hold, capture, release, and expiry operations use an
outer `BEGIN IMMEDIATE` transaction in PR1. Future reversal operations retain
the same atomicity rule after their additive migration.

Capture, release, and hold expiry re-read the immutable allocations inside the
same immediate transaction. Before changing a bucket they require sequence
`1..N`, a positive safe amount for every allocation, a safe sum exactly equal
to the hold amount, matching wallet and lot ownership, and sufficient per-lot
held coverage. Any mismatch is an infrastructure-integrity failure: the whole
transaction rolls back and no deterministic business-failure receipt is
stored.

An active hold protects its allocation from ordinary lot expiry until the hold
is resolved. Capture is allowed only before the hold deadline. Capture and
expiry compare a database-derived UTC time under the same immediate
transaction, so only one can win. Hold expiry atomically:

1. changes the hold to `expired`;
2. releases every allocation;
3. returns unexpired units to available;
4. moves already-expired bonus units to expired.

PR1 terminates only the wallet hold and its allocations. It does not update an
order or adjustment schema. A later owning-domain coordinator observes and
replays the durable hold-expiry result, then updates commerce or adjustment
state in that domain outside the wallet transaction.

Expiry workers use the stable identity `hold-expiry:<hold_ref>:<expires_at>`.
Repeated execution returns the recorded result and cannot move units twice.

Insufficient balance causes zero lot, hold, allocation, or ledger writes; only
the durable safe failure receipt is recorded. Negative balance is forbidden.
External network, provider, or fulfillment calls cannot occur inside a wallet
transaction.

## Durable Operations and Credit Origins

`platform_coin_operation_receipts` is the wallet mutation authority:

```text
operation_ref
wallet_ref
actor_scope
operation_type
idempotency_key
request_digest
status: started | succeeded | failed
result_ref
safe_result_code
previous_wallet_version
resulting_wallet_version
resulting_wallet_status
created_at
completed_at
unique(actor_scope, operation_type, idempotency_key)
```

Portal scope is the session-derived account plus operation. Admin scope is the
durable operator principal plus operation. The first caller claims the receipt
inside the immediate transaction. Every Wallet Core mutation returns only:

```js
{
  ok,
  replayed,
  operationRef,
  walletRef,
  safeResultCode,
  resultRef,
  previousWalletVersion,
  resultingWalletVersion,
  resultingWalletStatus
}
```

A replay with the same operation identity and request digest returns the stored
envelope with only `replayed` changing from `false` to `true`; a different
digest returns `idempotency_conflict`. `resultRef` may be null only for a
documented deterministic failure or no-result operation. Successful credit,
hold, capture, release, and expiry operations use their stable domain
reference.

Terminal receipts retain `wallet_ref`, previous and resulting wallet versions,
resulting wallet status, result ref, safe result code, and completion time.
Those fields are sufficient for the stable envelope and deterministic
zero-financial-write failures. Current wallet projection, lot detail, hold
detail, allocations, and ledger are obtained through read methods. Replay
never reconstructs a historic rich wallet or operation-specific result object,
including historical expiry, policy, source, bucket, Offer, order, or
current-wallet fields. Receipts must not contain serialized JSON result blobs
or duplicate mutable lot, Offer, or order snapshots. This is a source contract
and does not claim that the Store implementation is already aligned.

Deterministic zero-financial-write business failures such as insufficient
balance are recorded; transient `wallet_busy` and unexpected infrastructure
failures are not cached as final business results.

### Frozen PR1 confirmation and hold result contract

Task D2a admits exactly these terminal outcomes:

| Operation | Terminal status | `ok` | `safeResultCode` | `resultRef` | Version interval |
| --- | --- | ---: | --- | --- | --- |
| `confirm_coin_credit` success | `succeeded` | true | `confirmed` | confirmed `lotRef` | `n -> n+1` |
| `create_coin_hold` success | `succeeded` | true | `held` | created `holdRef` | `n -> n+1` |
| `create_coin_hold` insufficient balance | `failed` | false | `insufficient_balance` | null | `n -> n` |

D2a has no other durable failed or no-result outcome. Operation-specific
receipt validation accepts only these safe terminal codes and result shapes;
the existing `credit_coins` success remains `credited`. A same-digest replay
returns the stored nine-field envelope with only `replayed` changing, while a
different digest returns `idempotency_conflict`. D2a “no-op” means replay of an
existing terminal receipt only; it cannot create a new succeeded receipt with
a null `resultRef`.

`insufficient_balance` is evaluated only after locked wallet state and locked
database time validation. It commits exactly one failed receipt with equal
previous/resulting versions and status and makes zero lot, hold, allocation,
ledger, or wallet-version changes.

The safe non-terminal Store error codes for this D2a slice are exactly:

```text
invalid_wallet_request
non_normalized_wallet_request
invalid_coin_units
invalid_coin_type
invalid_accepted_coin_types
duplicate_coin_type
invalid_wallet_timestamp
invalid_coin_expiry
wallet_not_found
lot_not_found
wallet_not_active
coin_credit_not_confirmable
idempotency_conflict
idempotency_unavailable
wallet_busy
wallet_infrastructure_error
```

Empty accepted sets use `invalid_accepted_coin_types`; duplicate accepted
types use `duplicate_coin_type`. Unknown Coin types, or
`reward_adjustment` not accepting exactly `reward_coins`, use
`invalid_coin_type`. A syntactically valid hold deadline at or before locked
database UTC uses `invalid_coin_expiry`; malformed timestamps use
`invalid_wallet_timestamp`. Wrong lot Coin type or a confirmation amount that
exceeds current pending units uses `coin_credit_not_confirmable`. Exact request
shape or purpose violations use `invalid_wallet_request`.

Transient busy, infrastructure/integrity failures, invalid requests, missing
subjects, and disallowed current state roll back or write nothing and are not
terminal receipts. Error messages are generic and never expose SQL, rows,
paths, or request data. The future HTTP-layer `insufficient_coins` code is a
separate API projection and is not a D2a Store error or receipt result.

Hold creation reads database UTC inside the same `BEGIN IMMEDIATE`
transaction. One locked `dbNow` is the authority for all three decisions:

- require `hold.expiresAt > dbNow`;
- exclude bonus lots whose `expiresAt <= dbNow`;
- timestamp the hold, allocations, ledger entries, and receipt for that
  operation.

JavaScript wall-clock time obtained before the transaction is not authority
for the hold deadline or lot eligibility. Focused tests cover past,
exact/effectively-equal, and future deadlines without wall-clock sleeps.

The D2a atomic order is:

```text
normalize exact request and positive units
  -> compute exact canonical digest
  -> BEGIN IMMEDIATE
  -> find/replay prior receipt
  -> load and validate locked wallet/lot state
  -> query locked database UTC where required
  -> claim started receipt
  -> compute and fully validate allocations before financial writes
  -> write guarded lot changes
  -> write hold and immutable allocations where applicable
  -> increment wallet version exactly once
  -> append directional ledger rows
  -> complete terminal receipt with exactly-one-row check
  -> COMMIT
```

Refs may be pre-generated for a hold, but every allocation is validated before
the first financial write. Each lot update is guarded by wallet/lot identity
and a sufficient source bucket and must change exactly one row. Ref collisions,
guard misses, allocation corruption, SQL faults, and exact-one-row failures
roll back the started receipt and every write.

Each mutation accepts its own exact-field allowlist and computes its digest
from its own canonical business projection. The union of digest fields used by
all operations is documentation of possible projections, not an API request
allowlist. Extra fields fail closed before transaction entry.

The exact operation-domain business projections are:

| Operation type | Exact canonical business projection |
| --- | --- |
| `credit_coins` | `accountId, coinType, amountUnits, availability, sourceType, sourceRef, sourceDigest, expiresAt`; only when `coinType = reward_coins`, additionally `policyRef, policyVersion` |
| `confirm_coin_credit` | `lotRef, amountUnits` |
| `create_coin_hold` | `walletRef, purpose, purposeRef, amountUnits, acceptedCoinTypes, expiresAt` |
| `capture_coin_hold` | `holdRef` |
| `release_coin_hold` | `holdRef` |
| `expire_coin_hold` | `holdRef, expiresAt`; the deadline is read from the immutable durable hold row |
| `expire_coin_lot` | `lotRef, expiresAt`; the deadline is read from the durable lot row |

For `credit_coins`, paid and bonus projections contain no policy fields;
`expiresAt` is always present using its canonical value, including `null`.
The canonical digest is the domain-separated operation type plus the
key-sorted canonical projection. Strings must already be non-empty normalized
values and are never silently trimmed. Unit fields are safe integers, and a
hold amount is additionally positive. Timestamps are exact UTC ISO values.
`acceptedCoinTypes` uses the fixed `bonus_coins`, `paid_coins`, `reward_coins`
set order.

The operation wrapper fields `actorScope`, `idempotencyKey`, `actorType`, and
`actorRef` are not part of the business projection. Receipt identity is
exactly `(actorScope, operationType, idempotencyKey)` under the existing unique
contract; `actorType` and `actorRef` are audit metadata bound by the first
claim. No projection contains current wallet state, a result, or a read model.

Provider events, source reversals, worker commands, and expiry jobs do not use
a browser header. They use their stable provider or domain event identity as
the operation key. Provider create requests use a key derived from the durable
recharge and attempt reference.

### Frozen PR1 lifecycle result contract

| Operation/outcome | Receipt status | `ok` | `safeResultCode` | `resultRef` | Version interval | Allowed resulting wallet status |
| --- | --- | ---: | --- | --- | --- | --- |
| `capture_coin_hold` success | `succeeded` | true | `captured` | exact `holdRef` | `n -> n+1` | `active` |
| `capture_coin_hold` at/after immutable deadline | `failed` | false | `hold_expired` | null | `n -> n` | `active` |
| `release_coin_hold` success | `succeeded` | true | `released` | exact `holdRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_hold` active due success | `succeeded` | true | `expired` | exact `holdRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_hold` due after another terminal transition | `succeeded` | true | `expiry_processed` | exact `holdRef` | `n -> n` | `active/frozen/closed` |
| `expire_coin_lot` due with positive available units | `succeeded` | true | `expired` | exact `lotRef` | `n -> n+1` | `active/frozen/closed` |
| `expire_coin_lot` due with zero available units | `succeeded` | true | `expiry_processed` | exact `lotRef` | `n -> n` | `active/frozen/closed` |

All seven outcomes use the existing stable nine-field envelope. Lifecycle
receipt validation rejects every other code/result/version/status combination
as `idempotency_unavailable`. `expiry_processed` means that the exact due
worker identity was durably processed without changing a wallet bucket. It
does not claim that a captured, released, expired, or invalidated hold changed
to expired, or that protected held lot units moved.

Same identity and digest replays the terminal envelope with only `replayed`
changing; a different digest returns `idempotency_conflict`. A distinct
capture/release key re-evaluates current state. A non-active hold returns
`coin_hold_not_active` with no receipt and never reports another operation's
transition as its own success. Capture requires locked
`dbNow < hold.expiresAt`; equality or later stores only the exact
`failed/hold_expired/null/n -> n` receipt. Expiry before its durable deadline
returns `not_due` without a receipt. At or after the deadline, a terminal hold
or a finite bonus lot with zero available units stores the corresponding
`expiry_processed/n -> n` receipt with zero financial writes. Held units
remain protected and a later release or hold expiry still routes already-due
bonus units directly to expired.

The lifecycle slice has exactly these first-time non-terminal safe errors:

```text
invalid_wallet_request
non_normalized_wallet_request
hold_not_found
lot_not_found
wallet_not_active
coin_hold_not_active
coin_lot_not_expirable
not_due
idempotency_conflict
idempotency_unavailable
wallet_busy
wallet_infrastructure_error
```

They create no receipt. Except for the exact durable `hold_expired` capture
outcome above, no lifecycle deterministic failed receipt is permitted.
Malformed or extra/Symbol/non-enumerable fields, caller-supplied expiry
deadline or operation data, missing subjects, wrong/nonfinite lot type,
disallowed state, contention, corruption, unsafe arithmetic, reference/CAS
failure, and SQL faults map only to this safe boundary.
Malformed or noncanonical durable hold/lot `expires_at`, malformed locked
database UTC, and impossible durable lot type/bucket/deadline combinations are
integrity corruption: they create no receipt and map only to
`wallet_infrastructure_error`. `coin_lot_not_expirable` is reserved for a
structurally valid subject that is legitimately not a finite-expiry
`bonus_coins` lot.

Capture/release accept exactly `{ holdRef, operation }`; the operation wrapper
requires exact own data fields `actorScope`, `idempotencyKey`, `actorType`, and
`actorRef`. Expiry accepts exactly `{ holdRef }` or `{ lotRef }` and rejects
caller deadline, operation, actor, key, or digest fields. Expiry derives:

```text
actorScope = system:coin-wallet-expiry
actorType  = system
actorRef   = coin_wallet_expiry_worker

expire_coin_hold:
  idempotencyKey = hold-expiry:<holdRef>:<durable canonical expiresAt>
  digest fields  = holdRef, expiresAt

expire_coin_lot:
  idempotencyKey = lot-expiry:<lotRef>:<durable canonical expiresAt>
  digest fields  = lotRef, expiresAt
```

The canonical deadline is read without reformatting from the durable subject
inside `BEGIN IMMEDIATE`. Capture/release validate the request, enter the
immediate transaction, replay/conflict before current state, then load and
validate hold, wallet, allocations, one database UTC, outcome, refs and
arithmetic before the started receipt and guarded writes. Expiry validates the
request, enters the immediate transaction, loads the durable subject and
deadline, rejects missing/wrong/nonfinite subjects, derives identity/digest,
replays before wallet/state/time checks, reads one database UTC, rejects early
`not_due`, classifies the financial or no-op result, validates allocations or
buckets and refs, then claims the started receipt and performs guarded writes.

Lifecycle ledger rows bind the actual lot and moved units, copied lot
`source_type/source_ref`, exact actor evidence, one shared operation ref,
wallet version interval/status, and locked database UTC. Capture uses
`held_to_consumed`; release and hold expiry use `held_to_available` or
`held_to_expired` per lot; lot expiry uses `available_to_expired`.
Capture/release/hold-expiry rows use the exact hold reference and use
`order_ref=purposeRef` only for `product_purchase`, otherwise null. Lot expiry
uses null hold/order refs. Failed and no-op outcomes write no ledger.

Lifecycle Store work is blocked until the still-unpublished PR1 schema adds
and independently re-reviews two narrow null-safe triggers that reject changes
to `platform_coin_holds.expires_at` and `platform_coin_lots.expires_at`.
Store CAS must also bind the original deadline, but Store discipline is not
deadline authority. Task A5 does not implement the triggers and does not
establish schema readiness.

**Lifecycle Step 0/prerequisite:** before writing or running any lifecycle
Store test, a separate A-gate schema task must add both null-safe deadline
triggers, update the DDL checksum and exact migration tests, and receive
independent review PASS. Until then, lifecycle Store tests and implementation
are prohibited.

`platform_coin_credit_origins` contains one row per business fact allowed to
create Coins:

```text
credit_origin_ref
wallet_ref
coin_type
source_type
source_ref
source_digest
operation_ref
lot_ref
created_at
unique(wallet_ref, coin_type, source_type, source_ref)
```

The origin decision, lot, operation receipt, and ledger entries are written in
one transaction. This prevents a second caller with another idempotency key
from crediting the same reward accrual, recharge settlement, adjustment,
reversal, or compensation fact.

## Immutable Coin Ledger

`platform_coin_ledger_entries` contains:

```text
entry_ref
operation_ref
wallet_ref
lot_ref
operation
amount_units
hold_ref
order_ref
source_type
source_ref
actor_type
actor_ref
previous_wallet_version
resulting_wallet_version
resulting_wallet_status
occurred_at
```

Database triggers reject ledger updates and deletes. History is corrected only
with new reversal or compensation entries. A multi-lot operation produces
multiple ledger rows sharing one `operation_ref`, previous wallet version, and
resulting wallet version and resulting wallet status.

PR1 freezes the exact directional `operation` values:

```text
credit
pending_to_available
available_to_held
held_to_consumed
held_to_available
held_to_expired
available_to_expired
```

Credit uses `credit`; reward confirmation uses `pending_to_available`; hold
creation uses `available_to_held`; capture uses `held_to_consumed`; ordinary
bonus-lot expiry uses `available_to_expired`. Release and hold expiry select
`held_to_available` or `held_to_expired` independently for each lot according
to the exact database UTC deadline. Generic `release`, `expiry`, and
`balance_update` operation values are forbidden. A no-op or deterministic
failure receipt writes no ledger row.

For D2a, confirmation writes exactly one `pending_to_available` row with
`lot_ref=lotRef`, `hold_ref=null`, `order_ref=null`, and
`source_type/source_ref` copied from the confirmed lot. Hold creation writes
one `available_to_held` row per allocation: `lot_ref` identifies the allocated
lot, `hold_ref=holdRef`, and `source_type/source_ref` are copied from that lot.
For `product_purchase`, `order_ref=purposeRef`; for `reward_adjustment`,
`order_ref=null`. All rows for either operation share the operation ref, actor
metadata, previous/resulting wallet versions, resulting wallet status, and the
same locked database timestamp.

## Future Additive Source Reversal and Recovery

This entire section is a later additive-migration boundary. None of its tables,
indexes, restrictions, read methods, or mutation APIs belongs to PR1, and this
design does not claim that recovery is implemented.

`platform_coin_recovery_cases` records a source reversal that cannot be
fully satisfied:

```text
recovery_ref
wallet_ref
coin_type: paid_coins | reward_coins
cause_type
cause_ref
last_source_event_ref
original_issued_units
target_reversal_units
reversed_units
resolved_units
waived_units
shortfall_units
status: open | under_review | resolved | waived
created_at
updated_at
resolved_at
unique(wallet_ref, coin_type, cause_type, cause_ref)
```

A reward or paid-Coin source reversal first recomputes a cumulative target from
the immutable original snapshot. `cause_ref` identifies that original credit
or accrual origin; many verified partial-refund events update the same case.
If a distinct verified event reports the already-applied cumulative target, it
is claimed as a durable succeeded no-op without changing wallet version,
ledger, allocations, recovery totals, or restrictions. A lower cumulative
target fails closed.
Under one immediate transaction it:

1. claims the stable reversal event;
2. invalidates any active hold using an affected lot and atomically moves the
   related order or adjustment to `funding_reversed`;
3. sends affected held units to reversed only up to the remaining cumulative
   target; surplus affected units and unrelated allocations from the
   invalidated hold return to available or expired;
4. reverses pending and available affected units up to the cumulative target;
5. preserves consumed history;
6. creates or updates one recovery case for the remaining shortfall;
7. freezes new wallet spending when the shortfall is positive.

The full invariant is:

```text
reversed_units + resolved_units + waived_units + shortfall_units
  = target_reversal_units
```

`platform_coin_source_reversal_allocations` durably maps the invalidated
portion of a source lot to historical capture ledger rows:

```text
reversal_allocation_ref
recovery_ref
source_reversal_event_ref
source_lot_ref
capture_operation_ref
commerce_order_ref
reward_accrual_ref
invalidated_units
created_at
unique(source_reversal_event_ref, capture_operation_ref)
```

After available and held units, invalidated consumed units are allocated to
that lot's captures by `captured_at DESC, operation_ref`. The mapping is
cumulative and stable. Each affected commerce capture updates its cumulative
invalidated paid funding and recomputes the linked reward target in the same
domain-event transaction. Thus a recharge chargeback cannot leave reward Coins
available for paid funding that is no longer valid.

If capture obtains the immediate lock first, the captured units become part of
the recovery shortfall. If reversal obtains it first, the invalidated hold can
no longer capture. A release after source invalidation never makes affected
units available again.

Reward recovery never debits paid or bonus Coins. Paid-Coin recovery never
debits bonus or reward Coins.

`platform_coin_recovery_resolutions` makes recovery closure durable:

```text
resolution_ref
recovery_ref
resolution_origin_ref unique
method: same_type_credit_offset | verified_replacement_payment |
        authorized_waiver
amount_units
status: pending_review | applied | rejected
operation_ref
actor_type
actor_ref
created_by_ref
approved_by_ref
created_at
```

An immediate resolution transaction rejects amounts above the remaining
shortfall, claims the unique origin, applies only the same Coin type when units
move, appends the ledger and resolution facts, and updates the case invariant.
A future reward accrual can offset only reward recovery; a verified replacement
payment can offset only paid recovery. A waiver changes `waived_units` and
requires a controlled proposal and a different approving operator, but does
not mint or debit Coins. System credit offsets are created directly as
`applied`; waiver proposals begin `pending_review` and only a separate approval
can apply them.

`platform_coin_wallet_restrictions` tracks why spending is frozen:

```text
restriction_ref
wallet_ref
reason_type
reason_ref
status: active | released
created_at
released_at
unique(wallet_ref, reason_type, reason_ref)
```

The recovery transaction creates the restriction. The final resolution
releases it. The wallet returns to active only when no active restriction,
other open recovery, or independent risk freeze remains. System releases,
reversals, verified credits, and recovery decisions remain allowed while the
wallet is frozen.

## Promotion Reward Adjustments

The neutral workflow name is `Promotion Reward Adjustment`.

Admin capabilities are separate:

```text
promotion.manage
reward_adjustment.create
reward_adjustment.approve
reward_adjustment.reverse
coin_recovery.review
coin_recovery.waive
```

`platform_reward_adjustment_orders` contains:

```text
adjustment_ref
target_account_id
operation: debit | credit
amount_units
reason_code
business_ref
evidence_ref
explanation
status: pending_review | rejected | cancelled | expired | funding_reversed |
        captured | reversed
hold_ref
created_by_ref
approved_by_ref
original_adjustment_ref
previous_balance_snapshot
resulting_balance_snapshot
idempotency_key
created_at
approved_at
captured_at
reversed_at
```

Reason codes are:

```text
promotion_fee
settlement_adjustment
refund_reversal
manual_correction
```

Rules:

- promotion fees and refund reversals are reward-only debits;
- settlement adjustments and manual corrections may be controlled debits or
  new compensating credit lots;
- debit submission creates a reward-only hold and enters review;
- credit submission creates no lot and enters review;
- `pending_review` can move only to `rejected`, `cancelled`, `expired`,
  `funding_reversed`, or `captured`;
- rejection, creator cancellation, or system expiry atomically releases a
  debit hold and records the terminal adjustment event;
- a source reversal atomically invalidates the debit hold, moves the order to
  `funding_reversed`, and records the stable reversal event; replay returns the
  same terminal result;
- approval atomically captures a debit hold, or creates a credit origin and
  compensating reward lot, and appends wallet and adjustment events;
- insufficient reward balance fails without another Coin type or negative
  balance;
- a captured adjustment cannot be edited or deleted;
- reversal is a new `pending_review` order that uniquely references the
  captured original and itself requires approval; its capture moves the
  original projection to `reversed`;
- evidence stores only a safe reference or digest;
- `created_by_ref != approved_by_ref` is a database and service invariant in
  every environment, not only production.

The current single Admin-auth boundary must not be treated as an adequate
operator-principal model. Source work adds auditable operator refs and
capability checks before the adjustment API can be enabled.

## Recharge and Provider Settlement

`platform_coin_recharge_intents` contains:

```text
recharge_ref
account_id
provider
fiat_currency
fiat_amount_minor
currency_exponent
paid_coin_units
price_policy_ref
price_policy_version
price_policy_digest
lifecycle_status: open | inactive_unsettled | settled
provider_status: not_started | order_pending | approval_pending |
                 capture_pending | reconciliation_required |
                 terminal_unsettled | captured
reversal_status: none | partial | full
recovery_status: none | open | resolved | waived
inactive_reason
expires_at
version
idempotency_key
created_at
settled_at
```

`platform_coin_recharge_attempts` makes provider calls recoverable:

```text
attempt_ref
recharge_ref
attempt_number
operation: create_order | capture | status_query | refund_query
provider_request_key unique
status: prepared | in_flight | succeeded | retryable_failed |
        terminal_failed | reconciliation_required
version
provider_order_ref
provider_capture_ref
request_digest
safe_response_digest
created_at
updated_at
```

The attempt is durably prepared before an external call. A crash in
`in_flight` is reconciled with the stable provider request key and provider
order facts; it is never retried as a new business intent.

`platform_payment_events` is an append-only verified-event inbox:

```text
payment_event_ref
provider
provider_event_ref
provider_order_ref
provider_capture_ref
provider_refund_ref
event_type
verification_status
safe_event_digest
occurred_at
received_at
unique(provider, provider_event_ref)
unique(provider, provider_refund_ref)
```

The nullable refund reference is unique only when present; multiple distinct
partial refunds may reference the same capture and share an event type.
Capture-credit uniqueness belongs to the settlement decision, not to a
one-event-per-capture inbox constraint.

The inbox row is immutable. `platform_payment_event_processing_receipts`
records processing separately:

```text
payment_event_ref unique
status: pending | processing | processed | retryable_failed |
        terminal_rejected
attempt_count
lease_expires_at
result_ref
last_safe_error_code
updated_at
```

Processing claims `pending | retryable_failed -> processing` with a bounded
lease and incremented attempt count. A stale lease returns to
`retryable_failed`; a successful application becomes `processed`; a verified
but permanently unusable fact becomes `terminal_rejected` with a safe code.
The stable payment event identity makes lease recovery and replay idempotent.

`platform_coin_recharge_settlements` contains the monotonic decision:

```text
settlement_ref
recharge_ref unique
provider_capture_ref unique
settled_fiat_amount_minor
credited_coin_units
credit_origin_ref unique
credit_status: pending | credited
reversal_status: none | partial | full
recovery_status: none | open | resolved | waived
cumulative_refunded_minor
cumulative_reversed_coin_units
version
created_at
updated_at
```

Recharge projections are explicit and version-CAS protected:

```text
intent lifecycle:
  open -> inactive_unsettled
  open | inactive_unsettled -> settled on verified captured settlement

intent provider:
  not_started -> order_pending
  order_pending -> approval_pending | capture_pending |
                   reconciliation_required | terminal_unsettled | captured
  approval_pending -> capture_pending | reconciliation_required |
                      terminal_unsettled | captured
  capture_pending -> reconciliation_required | terminal_unsettled | captured
  reconciliation_required -> terminal_unsettled | captured
  terminal_unsettled -> captured only on a later verified provider fact

attempt:
  prepared -> in_flight
  in_flight -> succeeded | retryable_failed | terminal_failed |
               reconciliation_required
  reconciliation_required -> succeeded | terminal_failed
```

Cancellation before a provider call, user abandonment after provider-order
creation, intent expiry, or a reconciled terminal failure moves lifecycle to
`inactive_unsettled` with a safe reason. It stops new user-driven attempts but
does not stop bounded reconciliation. A terminal attempt first moves provider
status to `reconciliation_required`; only provider readback proving no capture
moves it to `terminal_unsettled`. A retryable-failed attempt creates a new
numbered attempt while lifecycle remains open. A late verified webhook moves
provider status to `captured` and lifecycle to `settled`, even from
`inactive_unsettled` or `terminal_unsettled`, because immutable provider facts
outrank transport and abandonment projections. No row remains permanently
pending after bounded reconciliation. Intent expiry uses
`recharge-expiry:<recharge_ref>:<expires_at>` and performs a final provider
readback before recording `inactive_unsettled`.

Settlement uses independent monotonic axes: credit moves only
`pending -> credited`; reversal moves only `none -> partial -> full`; recovery
moves only `none -> open -> resolved | waived`. Event processing claims the
processing receipt and uses expected versions. One immediate transaction
updates the processing receipt, settlement, intent projection, wallet
operation, and recovery projection. A CAS loser reloads and returns the
already-applied result. Intent reversal and recovery projections mirror the
settlement axes. Late or duplicate events can advance an axis but can never
erase a stronger verified fact.

The flow is:

```text
Portal recharge intent
  -> immutable fiat and Coin pricing snapshot
  -> provider order
  -> capture response or verified webhook
  -> amount, currency, internal reference, merchant, and capture validation
  -> durable settlement decision
  -> one transaction creates paid_coins lot and ledger credit
```

Provider create, capture, and webhook facts converge on one settlement decision
and credit exactly once.

Verified partial refunds use the original settlement and pricing snapshot:

```text
target_reversed_coin_units =
  floor(cumulative_refunded_minor * credited_coin_units
        / settled_fiat_amount_minor)
```

A verified full refund or chargeback sets the target to all credited units.
Only the positive delta from the previously recorded target is processed.
This cumulative calculation prevents event-order and per-refund rounding drift.
Available and held units are reversed through the source-reversal algorithm;
consumed shortfall creates a paid-Coin recovery case and never debits bonus or
reward Coins. Product delivery remediation is a separate durable command or
review decision and never runs inside the payment request or wallet
transaction.

The PayPal adapter can produce payment facts only. It cannot credit a wallet,
create bonus or reward Coins, purchase a product, issue an entitlement, or
mutate runtime state.

## Products, Offers, Orders, and Fulfillment

Future PR2 adds versioned products, Offers, orders, order items, durable
delivery intents, and a control-plane, SQLite-backed thin order/delivery
coordinator. The coordinator is not Redis, a message queue, a generic workflow
engine, or a microservice.

Payment and fulfillment are independent monotonic axes:

```text
payment: pending | held | captured | failed | refunded | reversed
fulfillment: not_requested | pending | processing | delivered |
             retryable | uncertain | terminal_failed
```

Successful immutable wallet `capture`, committed by the control plane and
bound to the order, is the only payment-success authority for a Coins-funded
platform-product purchase. A hold, `funded` order state, frontend state,
delivery intent, or fulfillment result cannot assert payment success. This
wallet authority does not displace the account as identity authority, the
order as commercial authority, or the entitlement/account resource as
service-delivery authority.

The coordinator may create or claim a durable delivery intent only from a
verified captured-payment reference. It owns transition guards, idempotent
dispatch, bounded retry, uncertain-state readback, and compensation initiation.
Product adapters own product validation, entitlement/traffic/subscription
commands, and delivery readback.

Products have stable identities. Offer versions use:

```text
draft -> in_review -> published -> retired
```

Only a reviewed version can be published. A published version is immutable;
retirement prevents new orders but does not alter existing orders. A rollback
is an audited catalog-release decision that selects a previously published
version for new orders, never an edit of a historical version. Every order
binds the exact product, Offer version, catalog release, and digest.

`platform_commerce_orders` uses a separate monotonic commercial lifecycle:

```text
created
  -> confirmed
  -> closed

created -> cancelled | expired
confirmed | closed -> remediation_pending
```

Order items contain the immutable Offer snapshot. An order has at most one
active funding hold. A future capture transaction may atomically persist the
safe order/capture binding and unique durable delivery intent in the
commerce-owned schema. The actual delivery call always runs after the wallet
transaction. A later reversal of already-captured funding opens additive
recovery and delivery-remediation facts instead of silently changing a
fulfilled order. Terminal states cannot move backward.

Every Offer snapshot freezes:

```text
product_ref
offer_ref
offer_version
catalog_release_ref
price_coin_units
accepted_coins
valid_from
valid_until
fulfillment_type
product_snapshot
policy_digest
```

Example policies:

```text
monthly card:
  paid_coins, bonus_coins, reward_coins

traffic pack:
  paid_coins, bonus_coins, reward_coins

promotion-specific product:
  reward_coins only
```

Purchase flow:

```text
create order and immutable Offer snapshot
  -> create Coin hold using accepted types
  -> validate order and fulfillment preconditions
  -> one transaction captures Coins and persists the safe order/capture
     binding plus durable delivery intent
  -> the thin coordinator claims the intent after commit
  -> a product adapter performs delivery outside the wallet transaction
```

Temporary delivery failure leaves a retryable or uncertain intent for bounded
retry and readback. Terminal failure initiates exactly one new append-only
compensating wallet operation; it never edits capture history. Fulfillment
never occurs inside the wallet transaction.

Delivery intents are unique by order item and fulfillment type, carry the
exact account and Offer snapshot digest, and project the fulfillment axis
defined above. They also store `attempt_count`, `max_attempts`,
`next_attempt_at`, `lease_owner_ref`, `lease_expires_at`, and `version`.
`retryable -> pending` is allowed only after bounded backoff and while attempts
remain. An expired processing lease moves through `uncertain` and requires
product-adapter readback before retry. Every attempt has a unique
`(delivery_intent_ref, attempt_number)` fact. The adapter call is idempotent on
the delivery-intent reference. A terminal failure initiates exactly one
append-only compensation through a unique terminal-failure origin. The
coordinator and adapters do not create a second subscription model.

Monthly cards, traffic packs, and subscription products reuse
`docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`:

```text
Account
  -> Entitlement
  -> Access Request / Order
  -> Delivery Generation
  -> Rendered Subscription
```

The commerce order is the commercial authority; the entitlement and stable
account resource are the service authority. A worker creates or revises a
delivery generation, validates its material and runtime apply receipt, and
only then publishes it as current. Normal renewal or reissue preserves the
stable opaque artifact URL and accounting identity. No Coins transaction
contains subscription material, runtime credentials, rendered configuration,
or a direct production publish. Existing direct checkout remains available
until this fulfillment path and the full Coins closure are accepted.

Product duration is enforced by the backend, not by Portal refresh. The
entitlement and account resource store server-derived `starts_at` and
`expires_at`. At or after expiry:

1. authenticated access, new delivery, refresh, and usage admission fail
   closed immediately from server time;
2. an idempotent worker claims
   `entitlement-expiry:<entitlement_ref>:<expires_at>`;
3. it marks the resource supply expired and creates a durable runtime
   reconciliation or revoke command;
4. edge desired-state processing records a safe apply receipt;
5. retries and restart recovery cannot extend duration, reset usage, or delete
   history.

The stable artifact URL may continue to exist as an opaque identifier, but it
must render an expired or denied result after backend expiry. Runtime apply lag
is visible as a safe pending-reconciliation state and never makes the control
plane authorize expired use.

Recharge orders, product orders, payment events, Coin ledger entries,
entitlements, fulfillment commands, and usage facts remain separate domains.

## Coins Checkout and Recharge UX Contract

This is a future frontend contract only; it does not bypass the independent
Portal production-surface identity gate.

At checkout, the user explicitly selects `Coins payment`. The Portal then reads
the current Offer and wallet projection and requests a server allocation
preview. A missing wallet or zero balance is represented as a zero spendable
projection without creating Coins or a financial record.

For a normal Offer, the preview applies:

```text
Offer accepted Coin types
  -> eligible, unexpired lots
  -> bonus_coins
  -> paid_coins
  -> reward_coins
```

The preview returns only the authenticated account's safe totals, required
units, estimated allocation, and `can_fund`. It is advisory: order creation
rechecks the balance and creates the hold atomically, so a concurrent spend can
still return `insufficient_coins`.

When balance is absent or insufficient:

1. no product order, hold, provider order, or entitlement is created;
2. Portal explains the shortfall and offers `Go to recharge` only when the
   Offer accepts `paid_coins`;
3. the user explicitly chooses whether to navigate to the wallet recharge
   view, with only a safe Offer return reference;
4. recharge success credits `paid_coins` only;
5. returning to checkout refreshes the wallet, but the user must select Coins
   payment and confirm the purchase again.

There is no automatic redirect, automatic provider checkout, silent fallback
to fiat, or automatic purchase after recharge. A reward-only Offer with
insufficient reward Coins must explain that restriction and must not offer a
misleading paid-Coin recharge path. The existing direct-checkout path remains a
separate explicit choice until its later closure gate.

## HTTP and Authorization Boundary

Portal account identity is always derived from the active session. Portal
mutations never accept an authoritative `account_id` from the browser.

Portal promotion routes:

```text
GET   /api/portal/promotion/profile
GET   /api/portal/promotion/link
POST  /api/portal/promotion/link
PATCH /api/portal/promotion/link
POST  /api/portal/promotion/link/rotate
GET   /api/portal/promotion/performance
```

Portal wallet routes:

```text
GET /api/portal/coins/wallet
GET /api/portal/coins/ledger
GET /api/portal/coins/holds
```

Recharge and commerce routes:

```text
GET  /api/portal/catalog/offers
GET  /api/portal/catalog/offers/:offerRef
GET  /api/portal/commerce/checkout-preview?offerRef=:offerRef
POST /api/portal/coin-recharges
GET  /api/portal/coin-recharges
GET  /api/portal/coin-recharges/:rechargeRef
POST /api/portal/commerce/orders
POST /api/portal/commerce/orders/:orderRef/confirm
GET  /api/portal/commerce/orders
GET  /api/portal/commerce/orders/:orderRef
```

Admin Growth Operations routes:

```text
GET   /api/admin/platform/promotions
PATCH /api/admin/platform/promotions/:profileRef
POST  /api/admin/platform/reward-policies
POST  /api/admin/platform/reward-policy-assignments
POST  /api/admin/platform/reward-adjustments
POST  /api/admin/platform/reward-adjustments/:ref/approve
POST  /api/admin/platform/reward-adjustments/:ref/reject
POST  /api/admin/platform/reward-adjustments/:ref/reverse
POST  /api/admin/platform/coin-recoveries/:ref/waiver-proposals
POST  /api/admin/platform/coin-recoveries/:ref/waiver-proposals/:resolutionRef/approve
```

Provider webhook route:

```text
POST /api/payments/paypal/webhook
```

The webhook is signature verified, writes the durable event inbox first,
deduplicates provider facts, and never performs fulfillment in the request.

Every Portal or Admin mutation requires an intent-scoped `Idempotency-Key`.
Provider callbacks and workers instead use the stable provider event, attempt,
command, or expiry identity defined above. Safe error codes include:

```text
promotion_paused
invalid_promotion_link
self_referral
wallet_busy
insufficient_coins
coin_type_not_accepted
idempotency_conflict
invalid_state_transition
payment_fact_mismatch
fulfillment_pending
```

Errors never contain SQL, raw provider responses, private account information,
or secret material.

Payment evidence belongs to recharge or order details. No top-level Admin
Payment Logs page is added.

## Schema Migration

Coins schema changes use a versioned migration ledger:

```text
platform_schema_migrations
  migration_id
  ddl_checksum
  applied_at
```

Migration tooling supports:

```text
validate
dry-run
apply
```

Requirements:

- `validate` is read-only;
- `dry-run` operates on a temporary copy and does not modify the target;
- `apply` requires a separate exact Risk A production gate;
- before the first apply, exact introspection rejects an incompatible
  `platform_schema_migrations` table; the first migration then creates the
  ledger, its own domain tables, indexes, constraints, triggers, and ledger row
  in one immediate transaction;
- each later migration is checksum-bound and atomic in its own immediate
  transaction;
- an incompatible same-name table fails closed;
- ordinary production startup does not initialize Coins schema;
- disabled capabilities do not require their future schema;
- enabled production runtime validates the exact migration set and schema for
  its dependency chain before registering routes or workers;
- after Coins data exists, there is no down migration or table drop;
- forward-fix is preferred, and whole-database restore requires an explicit RPO
  decision.

## Required Tests

Migration tests:

- fresh database;
- legacy sentinel database;
- repeated migration;
- dry-run zero writes;
- incompatible table collision;
- exact schema validation;
- foreign-key and integrity checks;
- all four runtime capabilities default off and fail closed on missing schema.

PR1 Wallet Core tests:

- pending, available, held, consumed, and expired transitions;
- lot amount invariant;
- safe-integer and aggregate-overflow boundaries;
- accepted-set order-independent normalization and request digest, with
  duplicate and empty-set rejection;
- exact canonical vectors and extra-field rejection for every operation-domain
  projection, including conditional reward-policy fields and canonical null
  expiry;
- positive hold amount validation before transaction entry and exact
  per-mutation field allowlists;
- exact, symbol-key, and non-enumerable request rejection before transaction
  entry;
- finite-expiry bonus before non-expiring bonus, then paid, then reward;
- deterministic lot tie-breaking;
- reward-only Offer and promotion fee;
- allocation sequences exactly `1..N`, positive allocation amounts, and an
  exact safe-integer sum equal to the hold amount;
- corrupted allocation sequence, sum, ownership, or per-lot held coverage
  fails closed with a full rollback and no deterministic receipt;
- active/frozen/closed new-hold, capture, release, and expiry matrix;
- insufficient balance with zero financial side effects and one replayable
  failure receipt;
- exact D2a confirmation-success, hold-success, and insufficient-balance
  terminal envelopes, with operation-specific receipt validation and only
  `replayed` changing on same-digest replay;
- partial/full reward confirmation across active/frozen/closed status, wrong
  type, pending underflow, stable `lotRef`, and exact confirmation ledger audit
  fields;
- locked database UTC past, exact/effectively-equal, and future hold deadlines,
  plus bonus eligibility, without wall-clock sleeps;
- finite bonus, non-expiring bonus, paid, and reward allocation with accepted
  filtering, purpose-bound `order_ref`, exact per-lot ledger fields, guarded
  bucket changes, and one wallet-version interval;
- late ref collision and guarded-update fault rollback with no terminal
  receipt;
- D2b two-connection competing holds, separately from the D2a Store contract;
- all seven frozen lifecycle terminal outcomes, including durable capture
  `hold_expired` and due hold/lot `expiry_processed`;
- capture and release idempotency, distinct-key non-active hold rejection, and
  the exact no-receipt lifecycle error set;
- request-digest conflict;
- credit-origin uniqueness across different idempotency keys;
- ordinary bonus-lot expiry and protected held-unit release after expiry;
- hold and lot expiry race with repeated worker execution;
- every exact directional ledger operation code, generic-code absence,
  shared multi-lot operation/version/status fields, and zero ledger rows for
  no-op or deterministic failure;
- release and hold-expiry destination at the exact database UTC boundary;
- hold-expiry and lot-expiry digests use the exact deadline from their durable
  row and reject caller-substituted deadlines;
- malformed lifecycle code/result/version/status combinations return
  `idempotency_unavailable`;
- lifecycle Store tests remain blocked until both deadline-immutability
  triggers are added to the unpublished PR1 schema and independently reviewed;
- malformed/noncanonical durable deadlines, malformed locked database UTC, and
  impossible durable lot type/bucket/deadline combinations map to no-receipt
  `wallet_infrastructure_error`; `coin_lot_not_expirable` is tested only for a
  structurally valid non-finite-bonus subject;
- injected failure rollback at every multi-write step;
- ledger update and delete rejection;
- restart durability.

Later additive recovery tests:

- active-hold invalidation by a source reversal;
- partial/cumulative reversal idempotency and unchanged-target no-op receipt;
- frozen and closed wallet operation matrix;
- paid and reward recovery-case convergence without cross-type debit;
- same-type recovery payment, reward offset, waiver uniqueness, Admin
  resolution, and restriction release.

Promotion tests:

- lazy profile creation;
- concurrent creation returns one stable logical link;
- rotation revokes the prior code and leaves exactly one active code;
- paused account and profile behavior;
- allowlisted landing routes;
- self-referral and duplicate-binding rejection;
- registration-time attribution lock;
- policy-version snapshot;
- append-only policy tail supersession, concurrent fork rejection, and
  missing-policy failure;
- duplicate reward-origin rejection;
- paid-Coin-funded product delivery eligibility;
- no reward for recharge, bonus-funded spend, or reward-funded spend;
- partial refund, full refund, and chargeback cumulative recomputation;
- paid-source reversal allocation into historical captures and reward
  recomputation;
- attribution rejection/reversal projection and single-authority cutover;
- performance aggregation without customer-private fields.

Admin tests:

- capability enforcement;
- creator and approver separation in every environment;
- reward-only adjustment hold;
- credit approval, rejection, cancellation, and expiry;
- immutable captured order;
- unique reversal and compensation;
- recovery-waiver proposer and approver separation.

Recharge and commerce tests:

- durable recharge intent;
- durable provider attempt and crash reconciliation;
- transition CAS and late verified-event monotonicity;
- provider create idempotency;
- capture and webhook convergence;
- multiple distinct partial refunds for one capture;
- payment-event processing lease recovery;
- provider amount, currency, internal ref, merchant, and capture validation;
- cumulative partial refund and chargeback reversal;
- consumed paid-Coin recovery without cross-Coin debit;
- recharge does not create a product order or entitlement;
- accepted-Coin enforcement;
- checkout preview applies bonus, paid, then reward priority;
- missing wallet returns a zero projection without writes;
- insufficient preview or order creates no hold, provider order, or
  entitlement;
- recharge return never confirms or resumes a purchase automatically;
- immutable published Offer and catalog-release rollback;
- atomic capture and fulfillment-command creation;
- restart durability for order, accrual, settlement, and commands;
- retryable fulfillment lease recovery and exactly-once terminal compensation;
- stable Account Resource Delivery Lifecycle integration;
- server-side entitlement expiry, repeated scheduler execution, and runtime
  reconcile or revoke.

Each PR first runs its changed-surface focused test files and records the exact
command and count. Only then does final local validation use the commands
applicable to the broader changed surface:

```powershell
npm test
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:portal:verify
npm run docs:authority:check
git diff --check origin/master...HEAD
```

Source-only PRs that do not change Admin or Portal code may omit those
frontend commands but must state why. Production backup evidence additionally
requires a checksum followed by `quick_check` on the copied snapshot before
any copied-database migration rehearsal.

## Source PR Sequence

### PR 1: Coins Wallet Core

- migration ledger and Coins migration tooling;
- default-off wallet runtime gate;
- `platform_coin_wallets`, `platform_coin_lots`, `platform_coin_holds`,
  `platform_coin_hold_allocations`, `platform_coin_operation_receipts`,
  `platform_coin_credit_origins`, and `platform_coin_ledger_entries`;
- atomic credit, reward confirmation, product/reward-adjustment hold, capture,
  release, hold expiry, and bonus-lot expiry;
- no recovery/reversal/restriction object or API;
- no HTTP routes, frontend, provider, product/Offer, order, fulfillment,
  coordinator, or production migration.

### PR 2: Coins commerce and thin delivery coordinator

- versioned products and Offers;
- default-off commerce runtime gate;
- immutable publish and catalog-release lifecycle;
- accepted-Coin policy and checkout allocation preview;
- commerce orders and captured-payment binding;
- SQLite-backed durable delivery intents and thin coordinator;
- product adapters and Account Resource Delivery Lifecycle integration;
- no Redis, MQ, generic workflow engine, microservice, provider recharge, or
  recovery implementation.

### PR 3: Promotion reward system

- account promotion profiles and one stable link per account;
- default-off promotion runtime gate;
- canonical attribution lock, donor re-import boundary, and immutable events;
- reward policies, assignments, accruals, and performance queries;
- Portal promotion APIs.

### PR 4: Promotion reward Admin

- durable Admin operator principal and capabilities;
- profile management;
- policy assignment;
- Promotion Reward Adjustment workflow.

### PR 5: Coins recharge, PayPal, and additive recovery

- default-off recharge runtime gate;
- durable recharge intents, provider attempts, event inbox, and settlement
  decisions;
- reviewed PayPal adapter re-import;
- webhook and settlement reconciliation;
- paid-Coin credit;
- additive recovery cases, source-reversal allocations, recovery resolutions,
  wallet restrictions, and their indexes;
- cumulative refund/chargeback source reversal, same-type recovery payment,
  spend freeze, reward-offset integration, controlled waiver, and Admin
  resolution.

Frontend enablement, static publication, production schema migration, provider
activation, live balance changes, and production fulfillment remain separate
gates after the five source PRs.

## Production Gate

No production schema change is allowed until an exact gate records:

- active artifact identity;
- absolute control-database path without row contents;
- schema, owner, mode, size, WAL, and integrity inventory;
- verified online backup, checksum, and snapshot `quick_check`;
- copied-database migration, repeated migration, and restore rehearsal;
- exact stop-write or maintenance boundary;
- exact apply command;
- operator approval;
- foreign-key and integrity validation;
- rollback or forward-fix decision;
- stop conditions and redacted evidence.

Provider credentials, webhook ids, buyer accounts, customer data, payment
payloads, subscription URLs, runtime credentials, and raw database rows are
forbidden from source, chat, PRs, logs, and public evidence.
