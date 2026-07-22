# Coins Commerce Source-Only Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one executable, source-only Coins commerce path through the
existing User Portal and one protected read-only Admin Payment Logs page,
without activating durable balances, real providers, production fulfillment,
or referral payout.

**Architecture:** Keep the User Portal as the customer-facing entry while
placing catalog, wallet ledger, commerce orders, payment attempts, referral
ledger, and fulfillment planning in independent backend modules. A replaceable
in-memory store and injected provider adapters make the contract executable in
tests and local preview. Thin Portal/Admin routes enforce the existing auth
boundaries and return closed DTOs. The React UI consumes provider-neutral DTOs
and never owns ledger or routing decisions.

**Tech stack:** Node.js ES modules, Express, built-in `node:test`, React 19,
TypeScript, Vitest, Testing Library, Vite, CSS custom properties.

**Design source:**
`docs/superpowers/specs/2026-07-22-coins-commerce-vertical-slice-design.md`

## Delivery metadata

- Risk: B, source-only.
- Process: one Draft PR containing intent, code, tests, and aligned docs.
- Expected PR count: 1 (`#526`).
- Validation: focused RED/GREEN tests per task, then all Admin/Portal builds and
  the full server suite.
- Production/AWS impact: none.
- Base: `origin/master@f82eb4f66bb3d2f0a2bbc8018d3f95145658e8ac`.
- Branch: `codex/coins-commerce-vertical-slice`.
- Archived Figma node IDs and old GlobalCircle UI are not implementation
  sources. Current source contracts and this approved design are authoritative.

## Global constraints

- Do not add SQLite schema, migrations, provider credentials, live webhooks,
  provider network calls, production feature flags, deployments, runtime grant
  mutation, cash settlement, or payout endpoints.
- Do not copy the dirty `commerce-frontend-shell`, payment-provider, Japan, or
  GlobalCircle worktrees. Implement from this clean branch only.
- Coins and rates use safe integers. No floating-point balance, amount, or
  historical revaluation is allowed.
- Published product/offer snapshots, order items, ledger entries, attempts, and
  referral entries are append-only or immutable.
- No public/Admin endpoint may mint Coins, overwrite a balance, freeze referral
  lots for payout, mark payout settled, or mutate provider routing.
- Portal account ownership always comes from `X-Portal-Session`; ignore and
  reject caller-supplied `accountRef`, `userRef`, or `portalUserRef`.
- Cross-account object references return `404 not_found`, not an existence
  oracle.
- Admin Payment Logs is read-only and redacted. No capture, refund, retry,
  route-change, settlement, webhook-replay, or balance action appears in its
  route or UI.
- Provider switching depends on normalized status and charge certainty, never
  on a concrete provider name or an assumed user-side account balance.
- Each behavioral change begins with a focused failing test. Do not write the
  implementation until the intended RED is observed.
- Never expose raw provider payloads, full provider payment references, full
  IPs, customer data, URLs containing secrets, credentials, tokens, or
  subscription URLs in logs, fixtures, tests, or UI.

## Frozen product and contract standards

### Catalog and pricing

- Recharge denominations: `10 / 20 / 30 / 50 / 100 / 200 / 300` paid Coins.
  Default source-only bonus is zero; future versioned Admin promotions may add
  bonus Coins.
- Memberships: 20 Coins monthly/50 GB, 30 Coins monthly/100 GB, and 200 Coins
  annual/200 GB refreshed every monthly cycle.
- Permanent traffic packs: 30 Coins/100 GB, 60 Coins/300 GB, and
  100 Coins/1000 GB.
- Monthly membership traffic does not roll over and is consumed before
  permanent traffic-pack grants. This slice records that policy in fulfillment
  plans but does not mutate runtime grants.
- 20-Coin membership: traffic packs at 95%.
- 30-Coin membership: traffic packs at 90%.
- 200-Coin annual membership: GCC WebOS self-operated traffic packs and future
  add-ons at 80%, excluding recharge and all membership products.
- Discounts do not stack. Choose the lowest eligible price. Compute with
  integer basis points and round down, so the charged price never exceeds the
  displayed discounted price.
- Same-tier renewal, downgrade queuing, immediate upgrade by supplemental
  difference, annual downgrade refund attribution, and cycle transition are
  not activated in this slice. They require durable membership/grant state and
  are a later Risk A implementation phase.

### Wallet and referral invariants

- Lot origins: `bonus`, `paid`, `referral`.
- Bonus expires after 30 days by default. Paid and referral lots do not expire.
- Consumption: unexpired bonus earliest-expiry first, paid FIFO second,
  referral FIFO last; tie-break by `createdAt`, then stable lot ref.
- Purchase mutation is `hold -> capture` or `hold -> release`. Capture adds
  debit postings; release restores availability without fabricating a debit.
- Insufficient balance is atomic: no partial hold, order capture, fulfillment
  plan, or payment attempt.
- Referral gross evidence must reconcile as:
  `cumulativeEarned = available + consumed + frozen + settled + reversed`.
- A referral lot allocation that is consumed internally cannot be frozen for
  external settlement. A frozen allocation cannot be consumed. Release returns
  it to available; settlement moves only frozen value to settled.
- This slice reads seeded referral evidence only. It does not calculate invite
  tiers, earn Referral Coins, or expose payout controls.

### HTTP result contract

- GET success: `200`.
- First successful POST: `201`.
- Same idempotency key and same canonical payload: return the original object
  with `200` and no second mutation.
- Validation: `400 validation_error`.
- Invalid/missing Portal session: `401 invalid_session`.
- Unknown or cross-account ref: `404 not_found`.
- Idempotency mismatch: `409 idempotency_conflict`.
- Insufficient balance: `409 insufficient_coins` with closed
  `recovery: { type: "go_to_recharge", shortfallCoins }` and no attempt.
- Unsafe switch: `409 payment_switch_blocked`.
- Error bodies contain a stable `error` and the explicitly documented closed
  recovery object only; never raw exceptions.
- All write requests use the `Idempotency-Key` header. Account IDs are absent
  from write bodies.

### Payment state and switching matrix

| Normalized result | Charge certainty | Same-attempt retry | New provider attempt |
| --- | --- | --- | --- |
| provider entry unavailable before charge capability | not_charge_capable | no | automatic route allowed and logged |
| confirmed no charge | confirmed_no_charge | no | user or policy switch allowed |
| provider reports insufficient funds | confirmed_no_charge | no | user switch allowed |
| pending | pending | no | blocked |
| unknown | unknown | no | blocked |
| possibly charged | possibly_charged | no | blocked |
| risk rejected | confirmed_no_charge | no | blocked pending review/new order policy |
| succeeded | charged | no | blocked |
| reversed | reversed | no | create a new order only |

Every created attempt stays permanently bound to one provider. Any automatic or
user-requested switch records source attempt, target attempt, reason, and the
idempotency fingerprint. The platform never queries a user's WeChat, Alipay,
PayPal, bank, or wallet balance.

---

### Task 1: Freeze the product, pricing, and state model

**Files:**
- Create: `server/services/platform/coins-commerce-model.mjs`
- Create: `server/tests/platform-coins-commerce-model.test.mjs`

**Interfaces:**

```js
createDefaultCommerceCatalog()
createOrderItemSnapshot({ productVersion, offerVersion, priceContext })
calculateOfferPrice({ offerVersion, activeMemberships })
normalizeNextAction(value)
normalizePaymentResult(value)
commerceError(code, details)
```

- [ ] **Step 1: Write the failing model tests**

Assert the seven recharge denominations, three membership products, three
permanent traffic packs, monthly reset/no carry-over, membership-first traffic
priority, immutable snapshots, and stable product/offer version refs. Cover
integer-only validation for amounts, basis points, grants, and timestamps.

Include pricing vectors such as:

```js
assert.equal(calculateOfferPrice({
  offerVersion: trafficPack30,
  activeMemberships: [monthly20]
}).payableCoins, 28);
assert.equal(calculateOfferPrice({
  offerVersion: trafficPack60,
  activeMemberships: [monthly20, annual200]
}).payableCoins, 48);
assert.equal(calculateOfferPrice({
  offerVersion: annualMembership,
  activeMemberships: [annual200]
}).payableCoins, 200);
```

- [ ] **Step 2: Run the model test and verify RED**

```powershell
node --test server/tests/platform-coins-commerce-model.test.mjs
```

Expected: FAIL because `coins-commerce-model.mjs` does not exist.

- [ ] **Step 3: Implement the closed model**

Use frozen arrays/objects, exact enum allowlists, stable safe error codes, and
integer basis points. Implement floor division without converting a wallet
amount to a decimal. Reject unknown keys in `nextAction` and normalized payment
results.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
node --test server/tests/platform-coins-commerce-model.test.mjs
git add server/services/platform/coins-commerce-model.mjs server/tests/platform-coins-commerce-model.test.mjs
git commit -m "feat(commerce): define Coins catalog and pricing model"
```

### Task 2: Build the append-only in-memory wallet and referral store

**Files:**
- Create: `server/services/platform/coins-commerce-store.mjs`
- Create: `server/tests/platform-coins-commerce-store.test.mjs`

**Interfaces:**

```js
createInMemoryCoinsCommerceStore({
  nowFn,
  catalog,
  walletLots,
  referralEntries,
  accountMemberships
})
```

The store exposes catalog lookup; wallet summaries and transactions;
hold/capture/release; order, attempt, and fulfillment-plan insertion/read;
idempotency result storage; payment-log projection; and referral summary. Seed
methods exist only on the factory input/test harness, not on HTTP services.

- [ ] **Step 1: Write failing wallet and ledger tests**

Cover expired bonus exclusion; the exact bonus -> paid -> referral allocation
order; deterministic ties; frozen balances; all-or-nothing hold; one capture;
idempotent capture/release; and append-only transaction history. Prove returned
objects cannot mutate stored objects.

- [ ] **Step 2: Write failing referral partition tests**

Seed a referral lot, consume part internally, then prove the consumed allocation
cannot be frozen. Freeze another allocation and prove it cannot be consumed.
Cover freeze overflow, release, settlement-from-frozen only, reversal postings,
and the reconciliation equation.

- [ ] **Step 3: Run the store test and verify RED**

```powershell
node --test server/tests/platform-coins-commerce-store.test.mjs
```

Expected: FAIL because the store module does not exist.

- [ ] **Step 4: Implement the minimal store and verify GREEN**

Keep balances derived from lots, allocations, and postings. Use canonical
request digests for `{scope, accountRef, idempotencyKey}`. Same-key/same-payload
returns the recorded result; different payload throws `idempotency_conflict`.

```powershell
node --test server/tests/platform-coins-commerce-store.test.mjs
```

- [ ] **Step 5: Commit the store slice**

```powershell
git add server/services/platform/coins-commerce-store.mjs server/tests/platform-coins-commerce-store.test.mjs
git commit -m "feat(commerce): add append-only Coins store"
```

### Task 3: Define the replaceable provider preview adapter

**Files:**
- Create: `server/services/platform/coins-commerce-provider-preview.mjs`
- Create: `server/tests/platform-coins-commerce-provider-preview.test.mjs`

**Interface:**

```js
createCoinsCommerceProviderPreview({ providerId, createRechargeOrderFn })
// adapter.createRechargeOrder({
//   rechargeOrderRef, attemptRef, quoteSnapshot, idempotencyKey
// }) -> { providerOrderRef, status, chargeCertainty, nextAction }
```

- [ ] **Step 1: Write the adapter contract tests**

Require a stable provider ID and declared capability. Accept only
`hosted_redirect | provider_sdk | qr | bank_instructions | none`. Permit HTTPS
redirects; allow HTTP only for explicit loopback preview fixtures. Reject raw
payload, credential, token, customer, and unknown fields. Normalize thrown
adapter errors to closed reason codes.

- [ ] **Step 2: Verify RED**

```powershell
node --test server/tests/platform-coins-commerce-provider-preview.test.mjs
```

Expected: FAIL because the preview adapter does not exist.

- [ ] **Step 3: Implement a network-free injected adapter**

The module must not import an HTTP client, environment credentials, PayPal,
Niuniu, WeChat, or Alipay code. It delegates only to the injected test/local
function and returns a normalized result.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
node --test server/tests/platform-coins-commerce-provider-preview.test.mjs
git add server/services/platform/coins-commerce-provider-preview.mjs server/tests/platform-coins-commerce-provider-preview.test.mjs
git commit -m "feat(commerce): define preview payment adapter"
```

### Task 4: Orchestrate purchases, recharge, switching, and fulfillment plans

**Files:**
- Create: `server/services/platform/coins-commerce-service.mjs`
- Create: `server/tests/platform-coins-commerce-service.test.mjs`
- Modify: `server/services/platform/coins-commerce-store.mjs`
- Modify: `server/tests/platform-coins-commerce-store.test.mjs`

**Interface:**

```js
createCoinsCommerceService({
  store,
  providers = [],
  rechargeQuoteIssuer = null,
  nowFn,
  refFactory
})
```

`rechargeQuoteIssuer` is a trusted server-side dependency. Portal input never
supplies fiat amount, rate, bonus, promotion, or quote fields. A provider-enabled
service requires the issuer; the default empty-provider service does not. One
immutable quote is locked per recharge order and reused by all automatic or
explicit provider attempts for that order, so a route change cannot silently
reprice the order.

Public methods are `getWallet`, `getCatalog`, `listOrders`,
`createProductOrder`, `createRechargeOrder`, `getPaymentAttempt`,
`switchPaymentAttempt`, `getReferralSummary`, and `listPaymentLogs`. All take an
already authenticated `accountRef` where applicable.

- [ ] **Step 1: Write failing product-order tests**

Cover immutable price/grant snapshots, membership discount selection,
hold/capture, one idempotent fulfillment plan, failure release, and replay.
Insufficient Coins must return `shortfallCoins` with no partial hold, attempt, or
fulfillment plan.

The current store's separate mutation methods are not an atomic purchase
boundary. Add a synchronous, non-nestable `runAtomicMutation(operation)` store
primitive and prove that a throw after every intermediate product-purchase write
restores all arrays, maps, sets, attempt revisions, and the event-time watermark.
Promise-returning operations are rejected and rolled back. The service uses this
boundary for hold, capture, order, fulfillment, and idempotency-result writes.

- [ ] **Step 2: Write failing recharge-separation tests**

Creating a recharge order must never create a product order, credit a wallet,
or emit a fulfillment plan. With no provider, return a safe unavailable result,
`attempt: null`, and `nextAction: { type: "none" }`. Returning to an earlier
product intent must still require a new explicit purchase confirmation.

Before any provider call, atomically persist the immutable recharge order, the
initial provider-bound attempt, and an idempotency pointer. Replays resolve that
pointer to the latest attempt and never call the quote issuer or provider again.
Only a normalized `entry_unavailable/not_charge_capable` result can route to the
next configured provider. An adapter throw is conservatively recorded as
`unknown/unknown` and cannot fail over automatically.

- [ ] **Step 3: Write the complete payment-switch matrix tests**

Test automatic entry-failure routing and every row in the frozen matrix above.
`provider_insufficient` is switchable only with
`chargeCertainty=confirmed_no_charge`. Assert provider binding is immutable and
source/target/reason/idempotency evidence remains inspectable. Assert no branch
uses a provider name.

- [ ] **Step 4: Write payment-log and referral read-model tests**

Payment logs contain only safe refs, provider ID, attempt status, charge
certainty, source/target refs, switch reason, reconciliation state, and
timestamps. Referral summary exposes all six partitions but no freeze,
settlement, or balance overwrite service method.

- [ ] **Step 5: Verify RED**

```powershell
node --test server/tests/platform-coins-commerce-service.test.mjs
```

Expected: FAIL because the service module does not exist.

- [ ] **Step 6: Implement the smallest orchestration and verify GREEN**

Use an internal provider registry keyed by stable `providerId`. Default to an
empty provider list. For a successful Coins purchase, capture once and create an
inspectable fulfillment plan carrying traffic priority/reset policy, but call
no runtime/grant service.

This in-memory source slice does not claim durable cross-process exactly-once
payment execution. It does preserve a pre-call attempt/idempotency record inside
the running process and must never infer that an adapter throw means no charge.

```powershell
node --test server/tests/platform-coins-commerce-model.test.mjs server/tests/platform-coins-commerce-store.test.mjs server/tests/platform-coins-commerce-provider-preview.test.mjs server/tests/platform-coins-commerce-service.test.mjs
```

- [ ] **Step 7: Commit the service slice**

```powershell
git add server/services/platform/coins-commerce-service.mjs server/tests/platform-coins-commerce-service.test.mjs server/services/platform/coins-commerce-store.mjs server/tests/platform-coins-commerce-store.test.mjs
git commit -m "feat(commerce): orchestrate Coins orders and payments"
```

### Task 5: Add authenticated Portal and read-only Admin HTTP contracts

**Files:**
- Create: `server/routes/portal-commerce.mjs`
- Create: `server/routes/admin-payment-logs.mjs`
- Create: `server/tests/platform-portal-commerce-routes.test.mjs`
- Create: `server/tests/platform-admin-payment-logs-routes.test.mjs`
- Modify: `server/app.mjs`
- Modify: `server/state.mjs`
- Modify: `server/tests/state.test.mjs`

- [ ] **Step 1: Write failing Portal route tests**

Cover every documented Portal endpoint, response status, and error code. Prove
missing session is 401, a valid Portal session passes without Console Bearer,
body/query account identifiers cannot change ownership, and cross-account
order/attempt refs are 404. Prove all POSTs require `Idempotency-Key` and that
insufficient Coins creates no payment attempt.

- [ ] **Step 2: Write failing Admin route tests**

Require the existing Admin allowlist/session-or-Bearer boundary. Assert the GET
projection is redacted and `safety` states `readOnly: true` and
`mutationAllowed: false`. Explicitly assert POST capture/refund/retry/routing,
settlement, webhook replay, and balance mutation paths are absent.

- [ ] **Step 3: Verify route RED**

```powershell
node --test server/tests/platform-portal-commerce-routes.test.mjs server/tests/platform-admin-payment-logs-routes.test.mjs
```

Expected: FAIL because neither router exists.

- [ ] **Step 4: Implement thin routers and auth bypass boundaries**

In `server/app.mjs`, add exact Portal Commerce public paths for wallet, catalog,
orders, recharge-orders, and referral plus the single dynamic prefix
`/api/portal/commerce/payment-attempts/`. Enable them only when Portal routes are
enabled. This bypasses Console Bearer only; `portal-commerce.mjs` must still
require `X-Portal-Session` and derive `session.accountId` before every service
call.

Mount `admin-payment-logs.mjs` after the existing Admin protection. Do not add
it to a public path list.

- [ ] **Step 5: Wire source-only defaults**

`createRuntimeState()` accepts injected `platformCoinsCommerceStore`,
`platformCoinsCommerceService`, `coinsCommerceProviders`,
`coinsCommerceNowFn`, and `coinsCommerceRefFactory`. When Portal routes are
enabled and no service is injected, construct the in-memory store/service with
the default catalog and an empty provider array. Return it as
`state.platform.coinsCommerceService`.

- [ ] **Step 6: Verify state and route GREEN**

```powershell
node --test server/tests/platform-portal-commerce-routes.test.mjs server/tests/platform-admin-payment-logs-routes.test.mjs
node --test --test-name-pattern="Coins commerce" server/tests/state.test.mjs
```

- [ ] **Step 7: Commit the HTTP slice**

```powershell
git add server/routes/portal-commerce.mjs server/routes/admin-payment-logs.mjs server/app.mjs server/state.mjs server/tests/platform-portal-commerce-routes.test.mjs server/tests/platform-admin-payment-logs-routes.test.mjs server/tests/state.test.mjs
git commit -m "feat(commerce): expose safe Portal commerce APIs"
```

### Task 6: Create the typed Commerce DTO and client boundary

**Files:**
- Create: `admin/src/features/user-portal/commerce/commerce-model.ts`
- Create: `admin/src/features/user-portal/commerce/commerce-client.ts`
- Create: `admin/src/test/coins-commerce-model.test.ts`
- Create: `admin/src/test/coins-commerce-client.test.ts`

**Interface:**

```ts
export type CommerceClient = {
  getWallet(sessionRef: string, signal?: AbortSignal): Promise<WalletDto>;
  getCatalog(sessionRef: string, signal?: AbortSignal): Promise<CatalogDto>;
  listOrders(sessionRef: string, signal?: AbortSignal): Promise<CommerceOrderDto[]>;
  createProductOrder(sessionRef: string, input: ProductOrderInput): Promise<ProductOrderResultDto>;
  createRechargeOrder(sessionRef: string, input: RechargeOrderInput): Promise<RechargeOrderResultDto>;
  getPaymentAttempt(sessionRef: string, attemptRef: string, signal?: AbortSignal): Promise<PaymentAttemptDto>;
  switchPaymentAttempt(sessionRef: string, attemptRef: string, input: PaymentSwitchInput): Promise<PaymentAttemptDto>;
  getReferral(sessionRef: string, signal?: AbortSignal): Promise<ReferralSummaryDto>;
};
```

- [ ] **Step 1: Write failing DTO and state tests**

Freeze discriminated unions for Coin origin, product/grant type, order status,
attempt status, charge certainty, safe next action, and recovery action. Test
the UI-state derivation for all eight payment result cards.

- [ ] **Step 2: Write failing HTTP-client tests**

Assert `X-Portal-Session` and `Idempotency-Key` headers, encoded attempt refs,
abort propagation, stable error parsing, and no body/query `userRef` or account
ID. Prove the client rejects unsafe redirect protocols and does not interpret
provider-specific payloads.

- [ ] **Step 3: Verify RED**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-model.test.ts src/test/coins-commerce-client.test.ts
```

Expected: FAIL because the model/client modules do not exist.

- [ ] **Step 4: Implement HTTP and explicit local-preview clients**

The HTTP client uses same-origin by default. The local client is synthetic and
explicit; it cannot be selected by production hostname or data. Both satisfy
the same interface. Core decisions branch only on `nextAction.type` and charge
certainty.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-model.test.ts src/test/coins-commerce-client.test.ts
git add admin/src/features/user-portal/commerce/commerce-model.ts admin/src/features/user-portal/commerce/commerce-client.ts admin/src/test/coins-commerce-model.test.ts admin/src/test/coins-commerce-client.test.ts
git commit -m "feat(portal): add typed Coins commerce client"
```

### Task 7: Build reusable accessible Commerce components

**Files:**
- Create: `admin/src/features/user-portal/commerce/commerce-components.tsx`
- Create: `admin/src/features/user-portal/commerce/commerce.css`
- Create: `admin/src/test/coins-commerce-components.test.tsx`

**Components:** `StatusBadge`, `BalanceCard`, `RechargeOfferCard`,
`ProductOfferCard`, `OrderSummary`, `StateNotice`, and `LedgerRow`.

- [ ] **Step 1: Write failing component tests**

Test semantic heading/list/table structure, keyboard activation, visible focus,
disabled state, long localized text, loading/empty/error states, and exact
accessible names. Mobile actions must have at least a 44x44 CSS hit target and
cards must not force horizontal overflow.

- [ ] **Step 2: Verify RED**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-components.test.tsx
```

Expected: FAIL because the component module does not exist.

- [ ] **Step 3: Implement components from current tokens**

Import `commerce.css` from the component/page module so both Admin preview and
Portal builds receive the same scoped styles. Use current source tokens, not
archived node IDs or copied GlobalCircle styles. Status must never be expressed
by color alone.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-components.test.tsx
git add admin/src/features/user-portal/commerce/commerce-components.tsx admin/src/features/user-portal/commerce/commerce.css admin/src/test/coins-commerce-components.test.tsx
git commit -m "feat(portal): build Coins commerce components"
```

### Task 8: Build the Wallet, Store, Recharge, Purchase, Orders, and Referral flows

**Files:**
- Create: `admin/src/features/user-portal/commerce/commerce-pages.tsx`
- Create: `admin/src/test/coins-commerce-pages.test.tsx`

**State machine:** top-level destinations are `wallet`, `catalog`, `orders`,
and `referral`; `recharge`, `purchase_confirm`, and `payment_status` are nested
flows with an explicit back destination.

- [ ] **Step 1: Write failing initial-load and read-page tests**

Assert wallet, catalog, orders, and referral load concurrently via
`Promise.all`, render all balance partitions and ledger states, show the seven
recharge offers and six product offers, and render the six referral partitions
without cash-out/settlement controls.

- [ ] **Step 2: Write failing purchase/recharge tests**

Assert “使用 Coins 支付” requires confirmation; insufficient Coins shows only
“去充值” and calls no provider endpoint; creating a recharge never purchases a
product; and returning from recharge restores the pending order context but
requires a second explicit purchase confirmation.

- [ ] **Step 3: Write failing payment-state matrix tests**

Render success, confirmed-no-charge, pending, provider-insufficient,
risk-rejected, unknown, possibly-charged, and reversed. Only safe states show a
switch/new-order action. Pending/unknown/possibly-charged show no retry or
switch. Exercise every `nextAction.type` without checking provider ID.

- [ ] **Step 4: Verify RED**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-pages.test.tsx
```

Expected: FAIL because `CommerceWorkspace` does not exist.

- [ ] **Step 5: Implement the coordinator and verify GREEN**

Keep network state and flow transitions inside `CommerceWorkspace`. Components
receive DTOs and callbacks only. Generate one idempotency key per explicit user
intent and reuse it only for replay of that intent.

```powershell
npm --prefix admin run test -- src/test/coins-commerce-model.test.ts src/test/coins-commerce-client.test.ts src/test/coins-commerce-components.test.tsx src/test/coins-commerce-pages.test.tsx
```

- [ ] **Step 6: Commit the Portal flow**

```powershell
git add admin/src/features/user-portal/commerce/commerce-pages.tsx admin/src/test/coins-commerce-pages.test.tsx
git commit -m "feat(portal): add Coins wallet and store flows"
```

### Task 9: Integrate Commerce into the current User Portal and retire active direct checkout

**Files:**
- Modify: `admin/src/portal-main.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/features/user-portal/user-portal-route.tsx`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/features/user-portal/user-portal-client.ts`
- Modify: `admin/src/test/user-portal.test.tsx`
- Modify: `admin/src/test/app-portal-boundary.test.tsx`

- [ ] **Step 1: Write the failing Portal integration tests**

Require Wallet, Store, Orders, and Referral navigation in the authenticated
Portal; nested recharge/purchase/payment flows; locale/theme/session retention;
and explicit local-preview client injection. Prove the active UI does not call
`/api/portal/payments/current` or `/api/portal/payments/checkout`, display direct
Alipay/WeChat plan checkout, or expose provider-name routing branches.

- [ ] **Step 2: Verify RED**

```powershell
npm --prefix admin run test -- src/test/user-portal.test.tsx src/test/app-portal-boundary.test.tsx
```

Expected: FAIL because the shell has no Commerce destinations and still owns
the legacy direct checkout flow.

- [ ] **Step 3: Add shallow shell integration**

Construct the HTTP Commerce client at real Portal entry points and the local
client only in explicit loopback preview. Pass authenticated `sessionRef` to
`CommerceWorkspace`. Keep existing subscription delivery, usage, security, and
support flows intact. Replace “购买套餐” actions with Catalog navigation.

- [ ] **Step 4: Remove the active legacy payment surface**

Delete unused checkout state/callbacks/rendering from `UserPortalPage`. Remove
legacy client types/methods only after `rg` proves no active source caller. Do
not delete PayPal/Niuniu historical or adapter files in this PR; they are not
the new Coins API and remain outside the active UI.

- [ ] **Step 5: Verify Portal GREEN and commit**

```powershell
npm --prefix admin run test -- src/test/coins-commerce-model.test.ts src/test/coins-commerce-client.test.ts src/test/coins-commerce-components.test.tsx src/test/coins-commerce-pages.test.tsx src/test/user-portal.test.tsx src/test/app-portal-boundary.test.tsx
rg -n "/api/portal/payments/(current|checkout)|createPaymentCheckout|fetchPaymentOrders" admin/src/features/user-portal admin/src/portal-main.tsx
```

Expected: tests PASS; `rg` returns no active source match. Test descriptions or
an explicit compatibility comment are not acceptable substitutes for caller
removal.

```powershell
git add admin/src/portal-main.tsx admin/src/App.tsx admin/src/features/user-portal/user-portal-route.tsx admin/src/features/user-portal/user-portal-page.tsx admin/src/features/user-portal/user-portal-client.ts admin/src/test/user-portal.test.tsx admin/src/test/app-portal-boundary.test.tsx
git commit -m "feat(portal): switch purchases to Coins commerce"
```

### Task 10: Add protected read-only Admin Payment Logs

**Files:**
- Create: `admin/src/features/payment-logs/payment-logs-model.ts`
- Create: `admin/src/pages/payment-logs-page.tsx`
- Create: `admin/src/pages/payment-logs-page.css`
- Create: `admin/src/test/payment-logs-page.test.tsx`
- Modify: `admin/src/features/subscriptions/api-client.ts`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/app/navigation.ts`
- Modify: `admin/src/app/admin-app-manifest.ts`
- Modify: `admin/src/app/admin-ui-contract.ts`
- Modify: `admin/src/app/admin-fixture-preview.ts`
- Modify: `admin/src/app/admin-search-index.ts`
- Modify: `admin/src/app/admin-safe-read-page-model.ts`
- Modify: `admin/src/i18n/admin/en-US.ts`
- Modify: `admin/src/i18n/admin/zh-CN.ts`
- Modify: `admin/src/test/navigation.test.ts`
- Modify: `admin/src/test/admin-app-manifest.test.ts`
- Modify: `admin/src/test/admin-ui-contract.test.ts`
- Modify: `admin/src/test/admin-fixture-preview.test.ts`
- Modify: `admin/src/test/admin-safe-read-page-model.test.ts`
- Modify: `admin/src/test/admin-search-index.test.ts`
- Modify: `admin/src/test/admin-locale-shell.test.tsx`
- Modify: `admin/src/test/admin-visual-qa-contract.test.tsx`
- Modify: `admin/src/test/subscriptions.test.ts`

- [ ] **Step 1: Write the failing API-client and page tests**

Add `listPaymentLogs()` to the existing trusted-origin/Bearer client. Test
loading, empty, error, filter, safe-ref search, charge certainty, source/target
attempt evidence, settlement readiness, and reconciliation state. Require a
visible READ-ONLY boundary and redacted fixtures. Assert no mutation controls.

- [ ] **Step 2: Write the failing Admin registry tests**

Add `AdminPage="paymentLogs"`, slug `payments`, and a `User Operations` nav item.
Its manifest capabilities are exactly `view` and `inspect`, Risk B,
`productionImpact: read-only`, `safe-summary-only`. Update every exhaustive
`Record<AdminPage, ...>` and test canonical `#/admin/payments` navigation,
localized labels, safe search aliases, fixture preview, and page composition.

- [ ] **Step 3: Verify RED**

```powershell
npm --prefix admin run test -- src/test/payment-logs-page.test.tsx src/test/subscriptions.test.ts src/test/navigation.test.ts src/test/admin-app-manifest.test.ts src/test/admin-ui-contract.test.ts src/test/admin-fixture-preview.test.ts src/test/admin-safe-read-page-model.test.ts src/test/admin-search-index.test.ts src/test/admin-locale-shell.test.tsx src/test/admin-visual-qa-contract.test.tsx
```

Expected: FAIL because the page and registry entry do not exist.

- [ ] **Step 4: Implement the page and exhaustive contracts**

Reuse the existing Admin API client's auth/origin guard and existing table,
status, loading, and error primitives. Import page CSS locally so it does not
enter the company-site build. Synthetic preview rows use masked refs and no
customer data. Routing-isolation text may explain future switching, but the page
contains no provider control.

- [ ] **Step 5: Verify Admin GREEN and commit**

```powershell
npm --prefix admin run test -- src/test/payment-logs-page.test.tsx src/test/subscriptions.test.ts src/test/navigation.test.ts src/test/admin-app-manifest.test.ts src/test/admin-ui-contract.test.ts src/test/admin-fixture-preview.test.ts src/test/admin-safe-read-page-model.test.ts src/test/admin-search-index.test.ts src/test/admin-locale-shell.test.tsx src/test/admin-visual-qa-contract.test.tsx
git add admin/src/features/payment-logs/payment-logs-model.ts admin/src/pages/payment-logs-page.tsx admin/src/pages/payment-logs-page.css admin/src/features/subscriptions/api-client.ts admin/src/App.tsx admin/src/app/navigation.ts admin/src/app/admin-app-manifest.ts admin/src/app/admin-ui-contract.ts admin/src/app/admin-fixture-preview.ts admin/src/app/admin-search-index.ts admin/src/app/admin-safe-read-page-model.ts admin/src/i18n/admin/en-US.ts admin/src/i18n/admin/zh-CN.ts admin/src/test/payment-logs-page.test.tsx admin/src/test/subscriptions.test.ts admin/src/test/navigation.test.ts admin/src/test/admin-app-manifest.test.ts admin/src/test/admin-ui-contract.test.ts admin/src/test/admin-fixture-preview.test.ts admin/src/test/admin-safe-read-page-model.test.ts admin/src/test/admin-search-index.test.ts admin/src/test/admin-locale-shell.test.tsx admin/src/test/admin-visual-qa-contract.test.tsx
git commit -m "feat(admin): add read-only payment logs"
```

### Task 11: Reconcile documentation, run full verification, and close the Draft evidence

**Files:**
- Modify: `docs/COMMERCIAL_MODEL_V1.md`
- Modify: `docs/BILLING_RECHARGE_CONTRACT.md`
- Modify: `docs/PAYMENT_PROVIDER_SYSTEM_PLAN.md`
- Modify: `docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md`
- Modify: `docs/CURRENT_RELEASE_STATE.md`
- Modify: `docs/PROJECT_CONTEXT.md`
- Modify: Draft PR `#526` body

- [ ] **Step 1: Update docs to source truth**

Mark direct plan-to-provider checkout and traffic-balance recharge contracts as
legacy/non-authoritative for new Commerce work. Document Coins-first separation,
provider attempts, charge certainty, wallet lot origins, referral double-use
prevention, catalog/pricing, fulfillment-plan-only behavior, and all false live
flags. Do not claim deployment, durability, live wallet credit, or runtime grant
application.

- [ ] **Step 2: Run source hygiene checks**

```powershell
rg -n "GlobalCircle|globalcirclecat|/api/portal/payments/(current|checkout)" admin/src server docs/COMMERCIAL_MODEL_V1.md docs/BILLING_RECHARGE_CONTRACT.md
rg -n "withdraw|cashout|fiat exchange|user transfer|third-party merchant" admin/src/features/user-portal/commerce admin/src/pages/payment-logs-page.tsx server/services/platform/coins-commerce-*.mjs
git diff --check origin/master...HEAD
```

Expected: no active GlobalCircle or legacy payment endpoint reference in the
new/active Commerce surface; no prohibited customer action; diff check PASS.
Historical docs outside the named authoritative files are not deleted by a
broad search-and-replace.

- [ ] **Step 3: Run all focused backend and frontend suites**

```powershell
node --test server/tests/platform-coins-commerce-model.test.mjs server/tests/platform-coins-commerce-store.test.mjs server/tests/platform-coins-commerce-provider-preview.test.mjs server/tests/platform-coins-commerce-service.test.mjs server/tests/platform-portal-commerce-routes.test.mjs server/tests/platform-admin-payment-logs-routes.test.mjs
npm --prefix admin run test -- src/test/coins-commerce-model.test.ts src/test/coins-commerce-client.test.ts src/test/coins-commerce-components.test.tsx src/test/coins-commerce-pages.test.tsx src/test/user-portal.test.tsx src/test/app-portal-boundary.test.tsx src/test/payment-logs-page.test.tsx
```

- [ ] **Step 4: Run the repository closure commands**

```powershell
npm run admin:test
npm run admin:build
npm run admin:portal:build
npm run admin:verify
npm run admin:portal:verify
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

All commands must pass from a clean dependency environment. Any snapshot or
build change must be explained in the PR; do not bless an unexplained bundle
drift.

- [ ] **Step 5: Run the final rules audit**

Audit the code and tests against every invariant in this plan: recharge versus
purchase separation, integer ledger, expiry, discounts, traffic priority,
idempotency, account isolation, switching matrix, referral double-redemption,
provider neutrality, redaction, and no runtime/payout mutation. Record each as
PASS with a file/test pointer in PR #526; unresolved items keep the PR Draft.

- [ ] **Step 6: Commit docs and publish Draft evidence**

```powershell
git add docs/COMMERCIAL_MODEL_V1.md docs/BILLING_RECHARGE_CONTRACT.md docs/PAYMENT_PROVIDER_SYSTEM_PLAN.md docs/ACCOUNT_RESOURCE_DELIVERY_LIFECYCLE.md docs/CURRENT_RELEASE_STATE.md docs/PROJECT_CONTEXT.md
git commit -m "docs: align Commerce source-only boundary"
git push origin codex/coins-commerce-vertical-slice
```

Update PR #526 with exact test results and these flags:

```text
source_complete: true
coins_wallet_live: false
payment_provider_live: false
provider_credentials_installed: false
production_schema_changed: false
runtime_fulfillment_live: false
referral_payout_live: false
```

Do not mark the PR Ready until implementation, full validation, rules audit,
and review are complete.

## Post-PR build sequence

This plan deliberately stops at an executable source contract. Subsequent work
must use separate approved changes in this order:

1. **Durable commerce storage (Risk A):** schema/migration, backup, restore,
   append-only constraints, concurrency, reconciliation, and rollout runbook.
2. **Real provider adapters (Risk A):** registry selection, credentials gate,
   signed notifications, amount/currency/order correlation, idempotent
   settlement, sandbox validation, and provider rotation.
3. **Durable fulfillment and runtime expiry (Risk A):** transactional outbox or
   equivalent minimal durable command, grants ledger, apply receipts, stable
   subscription revision, runtime revoke at `validUntil`, retry and rollback.
4. **Membership lifecycle (Risk A):** renewal queue, immediate upgrade by
   supplemental difference, downgrade/refund lot attribution, monthly reset,
   permanent traffic-pack carry-forward, and usage priority.
5. **Referral earning rules and Admin promotions (Risk A for schema/activation):**
   qualified-invite evidence, tier versioning, refund/chargeback reversal,
   anti-self-invite controls, versioned bonus/expiry/product-scope policies, and
   append-only Admin adjustments.
6. **External partner settlement (separate Risk A system):** freeze, approval,
   evidence export, payout execution, settlement reversal, and strict prevention
   of internal-spend plus cash-settlement double redemption.

Each phase requires its own live inventory and operator approval. Completing
PR #526 authorizes none of these production actions.
