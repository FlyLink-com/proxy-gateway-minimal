# Coins Commerce Source-Only Vertical Slice Design

## Status

- Date: 2026-07-22
- Risk: B for this source-only slice
- Expected PR count: 1 cohesive intent/code/tests PR
- Production/AWS impact: none
- Explicitly excluded: production schema/migration, real provider credentials,
  live webhook, real balance mutation, deployment, payout, and runtime mutation

## Goal

Build the first complete, locally runnable Coins commerce path across backend
contracts and the existing User Portal. The slice must prove the product flow,
ownership boundaries, security states, and UI integration without processing
real funds or claiming production readiness.

The User Portal is the unified customer-facing entry. It is not the owner of
wallet accounting, payment attempts, referral accounting, product state, or
fulfillment decisions.

## Why This Approach

Three implementation orders were considered:

1. **Vertical source-only slice (selected):** implement domain services,
   in-memory repositories, HTTP contracts, Portal UI, protected read-only Admin
   Payment Logs, and tests together. This exposes integration mistakes early
   while keeping production risk out of scope.
2. **Frontend-first:** quickly produces screens but repeats the existing problem
   where the Portal references payment APIs that the server does not own.
3. **Durability-first:** starts with SQLite migration and real settlement
   semantics, but makes the first change Risk A and delays observable user
   value.

The selected approach produces a real contract and executable behavior while
keeping the repository's later storage and provider substitutions explicit.

## Existing Source Boundary

The implementation starts from current `master`, not from the dirty payment or
Commerce worktrees.

- The Portal entry remains `admin/src/portal-main.tsx`.
- `UserPortalPage` remains the shell, but new Commerce code is isolated rather
  than expanding the existing large page with provider-specific logic.
- Existing direct plan checkout, provider labels, and missing HTTP route
  references are legacy behavior to be displaced, not the new contract.
- Existing PayPal sandbox code may be reviewed later for adapter internals, but
  its plan-based checkout routes are not the Coins API.
- Figma node IDs and fixtures are visual evidence only; application IDs come
  from stable domain identifiers.

## Domain Boundaries

### Product and Offer

The catalog describes what GCC WebOS sells and the active offer used to price
it. Published versions are immutable in the domain model even though the first
slice uses an in-memory repository.

The initial catalog includes:

- 20 Coins monthly membership with 50 GB per monthly cycle;
- 30 Coins monthly membership with 100 GB per monthly cycle;
- 200 Coins annual membership with 200 GB refreshed each monthly cycle;
- permanent traffic packs: 30 Coins/100 GB, 60 Coins/300 GB, and
  100 Coins/1000 GB.

The initial recharge catalog exposes fixed paid-Coins denominations of 10, 20,
30, 50, 100, 200, and 300 Coins. The source-only default attaches no bonus to
those offers; a future versioned Admin promotion may add bonus Coins without
changing the paid amount.

Membership pricing rules are part of the catalog calculation rather than the
provider adapter. The 20-Coin monthly membership prices traffic packs at 95%,
the 30-Coin monthly membership prices traffic packs at 90%, and the 200-Coin
annual membership prices GCC WebOS self-operated traffic packs and future
add-ons at 80%. Recharge offers and membership products are excluded. Discounts
never stack; the lowest eligible integer price wins. Fractional results round
down so the charged price never exceeds the displayed discount.

Order items snapshot product version, offer version, Coins price, and grants.
This slice calculates and displays pricing but does not publish runtime grants.

### Wallet and Ledger

Coins use integer units only. The in-memory store models append-only
transactions and lots rather than a mutable balance field.

Lot origins are:

- `paid`
- `bonus`
- `referral`

The read model exposes available and frozen amounts by origin. Paid and
referral lots do not expire in this slice. Bonus lots carry an expiry timestamp
and default to 30 days. Consumption order is deterministic and recorded in the
transaction result: unexpired bonus lots by earliest expiry, paid lots FIFO,
then referral lots FIFO. This consumes expiring value first and preserves
Referral Coins as future settlement evidence when other balances are available.

Product purchase follows `hold -> capture` or `hold -> release`. Tests can seed
wallet lots through dependency injection; no public or Admin HTTP endpoint can
mint or overwrite Coins.

### Commerce Order

Recharge orders and product orders are separate aggregates.

- A recharge order creates a payment attempt but never purchases a product.
- A product order consumes Coins and snapshots the selected offer.
- Insufficient Coins returns a recharge recommendation without starting an
  external payment attempt.
- Returning from recharge never automatically confirms a product purchase.

### Payment Attempt and Provider Boundary

Every payment attempt is permanently bound to one provider. The service emits
only a safe `nextAction`:

- `hosted_redirect`
- `provider_sdk`
- `qr`
- `bank_instructions`
- `none`

The source-only slice uses an injected preview adapter in tests and local
fixtures. Default application wiring has no live provider capability.

Provider switching rules are enforced by domain code:

- before a charge-capable attempt exists, provider entry failure may select a
  different route;
- `confirmed_no_charge` may create a new target attempt;
- `pending`, `unknown`, and `possibly_charged` block switching and duplicate
  payment;
- source attempt, target attempt, switch reason, and idempotency key are
  retained.

The platform does not query a user's WeChat, Alipay, PayPal, or bank balance.
It consumes only normalized provider results.

### Referral

The first slice exposes an account-scoped referral summary, invitation link,
qualified-count progress, and Referral Coins read model. It implements ledger
states needed to prevent future double redemption:

- cumulative earned evidence;
- available Referral Coins;
- internally consumed amount;
- frozen-for-settlement amount;
- externally settled amount;
- reversed amount.

No cash settlement or settlement request endpoint is included. Referral lots
used internally cannot later be frozen for external settlement. Admin balance
overwrite is not supported. Domain and code identifiers use `referral` or
`promotion_partner`, never `agent`.

### Fulfillment

The slice emits an idempotent, inspectable fulfillment plan after a successful
Coins product order. It does not apply runtime credentials or mutate production
grants. The plan is the contract later consumed by the Risk A durable
fulfillment implementation.

## Backend Components

New cohesive modules live under `server/services/platform/`:

- `coins-commerce-model.mjs`: validation, IDs, product/order/payment states,
  safe errors, and immutable snapshots;
- `coins-commerce-store.mjs`: in-memory append-only repositories and read
  models behind a replaceable interface;
- `coins-commerce-service.mjs`: wallet, recharge, purchase, payment switching,
  referral summary, and fulfillment-plan orchestration;
- `coins-commerce-provider-preview.mjs`: injected non-live adapter for tests and
  explicit local preview only.

Portal and Admin routes remain thin adapters. They authenticate, derive account
ownership from the Portal session, validate input, call the service, and return
safe DTOs. Request bodies cannot choose another account by supplying a
`userRef` or account reference.

## HTTP Contract

The source-only contract is:

- `GET /api/portal/commerce/wallet`
- `GET /api/portal/commerce/catalog`
- `GET /api/portal/commerce/orders`
- `POST /api/portal/commerce/orders`
- `POST /api/portal/commerce/recharge-orders`
- `GET /api/portal/commerce/payment-attempts/:attemptRef`
- `POST /api/portal/commerce/payment-attempts/:attemptRef/switch`
- `GET /api/portal/commerce/referral`
- `GET /api/admin/platform/payment-logs`

All Portal routes require the existing Portal session and use its account ID.
The Admin route remains protected by existing Admin middleware and returns a
redacted, read-only projection. It has no capture, refund, retry, routing,
settlement, webhook replay, or balance mutation action.

## Frontend Components

Commerce UI is isolated under:

```text
admin/src/features/user-portal/commerce/
  commerce-model.ts
  commerce-client.ts
  commerce-components.tsx
  commerce-pages.tsx
```

The Portal adds these customer views:

- Wallet and ledger
- Recharge
- Catalog
- Purchase confirmation
- Payment status
- Orders
- Referral

Recharge, purchase confirmation, and payment status are nested flows rather
than seven permanent navigation items. Existing Portal shell, locale, theme,
responsive navigation, and session client patterns remain in use.

Reusable UI components are `StatusBadge`, `BalanceCard`,
`RechargeOfferCard`, `ProductOfferCard`, `OrderSummary`, `StateNotice`, and
`LedgerRow`. Components consume domain DTOs and never branch on a concrete
provider to decide the core flow.

Protected Admin receives one read-only Payment Logs page with redacted order,
attempt, provider, charge-certainty, source/target attempt, switch reason,
settlement-readiness, and reconciliation fields. Provider routing controls do
not appear on that page.

## Data Flow

```text
Portal session
  -> Commerce HTTP route
  -> CoinsCommerceService
  -> in-memory repository / preview provider
  -> safe DTO
  -> Portal Commerce UI

Admin session
  -> read-only Payment Logs route
  -> redacted attempt projection
  -> protected Admin page
```

Recharge flow:

```text
select denomination
  -> create recharge order
  -> create provider-bound attempt
  -> render safe nextAction
  -> inspect normalized status
  -> credit nothing in the source-only default wiring
```

Purchase flow:

```text
select offer
  -> snapshot order
  -> hold Coins
  -> capture Coins
  -> emit fulfillment plan
  -> show order result
```

## Error and Safety Behavior

- Validation errors return stable safe error codes without raw payloads.
- Cross-account refs are returned as not found.
- Duplicate idempotency keys return the original result or a conflict when the
  payload differs.
- Unknown or possibly charged attempts cannot be switched or retried.
- Provider errors never expose credentials, raw provider payloads, full payment
  references, full IPs, or customer-private data.
- Missing provider capability produces `nextAction: none` with a safe
  unavailable state.
- Frontend error states preserve the order/attempt reference needed for support
  without presenting an unsafe action.

## TDD and Validation

Every behavior begins with a failing focused test.

Backend tests cover:

- integer and lot accounting;
- hold/capture/release and insufficient balance;
- recharge/purchase separation;
- immutable snapshots and idempotency;
- safe provider switching state matrix;
- referral double-redemption prevention;
- session-derived account ownership and cross-account denial;
- read-only redacted Admin projections.

Frontend tests cover:

- Wallet, Recharge, Catalog, Purchase, Payment Status, Orders, Referral, and
  Payment Logs rendering;
- recharge never auto-purchases;
- insufficient Coins never starts a provider attempt;
- unknown/possibly charged states expose no retry or switch action;
- provider-neutral `nextAction` rendering;
- mobile layout, keyboard actions, and accessible labels.

Required closure commands are:

```powershell
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:verify
npm run admin:portal:verify
npm test
git diff --check origin/master...HEAD
```

## Delivery Boundary

This slice may be reported as `source_complete` only. It must explicitly state:

```text
coins_wallet_live: false
payment_provider_live: false
provider_credentials_installed: false
production_schema_changed: false
runtime_fulfillment_live: false
referral_payout_live: false
```

The later rule checklist audits the implemented behavior against the approved
Coins, payment switching, product, referral, and fulfillment rules. Checklist
review is a closure gate, not a reason to delay the executable vertical slice.
