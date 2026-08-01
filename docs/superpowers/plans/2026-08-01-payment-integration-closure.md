# Payment Integration Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing Portal, Provider Core, PayPal Sandbox protocol, and Coin Wallet so one verified USD sandbox recharge credits `paid_coins` exactly once.

**Architecture:** Add a two-table SQLite Payment Store for immutable recharge quotes and safe provider receipts. A default-off in-process coordinator resolves server-owned offers, invokes the existing Adapter contract, durably accepts verified payment facts, and settles through the existing Wallet Store. New recharge-specific Portal APIs and UI reuse the production Portal shell; the legacy direct plan checkout remains unreachable.

**Tech Stack:** Node.js ESM, `better-sqlite3`, Express, React/TypeScript, Vitest/Testing Library, Node test runner, existing Payment Provider Core and Coin Wallet Store.

## Global Constraints

- Risk A source work; one PR; runtime default-off; no production mutation or provider call during source validation.
- Source baseline is `master@fea0daf5bee5c57297ae1de727bde6ce88d65cec`.
- Create exactly two payment tables and no second Coins ledger.
- Reuse `creditCoins()` and Wallet operation receipts for `paid_coins` settlement.
- PayPal Sandbox supports only USD exponent 2 in this phase; CNY activation is a later independent Gate.
- Account identity, fiat price, currency, Coin units, and quote version are server-authoritative.
- Do not revive `/api/portal/payments/checkout`, the old direct plan checkout, in-memory payment orders, or subscription issuance from payment.
- Do not store or log credentials, payer identity, customer email, raw callback bodies, raw provider responses, authorization headers, or cookies.
- No Redis, queue, worker service, microservice, or new external dependency.
- Every production-code change follows RED, verified RED, GREEN, verified GREEN, then refactor.

---

## File Map

**Create:**

- `server/services/platform/payment-store-migrations.mjs` — exact additive two-table migration, schema inspection, validation, and disposable dry-run.
- `server/services/platform/payment-store.mjs` — payment order/receipt normalization, persistence, transitions, and account-scoped projections.
- `server/services/platform/payment-recharge-offer-catalog.mjs` — immutable environment-specific server price book.
- `server/services/platform/payment-recharge-coordinator.mjs` — Adapter invocation, durable receipt acceptance, Wallet settlement, and recovery.
- `server/services/platform/paypal-payment-runtime.mjs` — injected credential loader and PayPal HTTP transport; no direct Adapter env access.
- `server/routes/portal-coin-recharge.mjs` — authenticated recharge routes and signed provider callback dispatcher.
- `server/tests/platform-payment-store-migrations.test.mjs`
- `server/tests/platform-payment-store.test.mjs`
- `server/tests/platform-payment-recharge-coordinator.test.mjs`
- `server/tests/platform-paypal-payment-runtime.test.mjs`
- `server/tests/portal-coin-recharge-routes.test.mjs`
- `admin/src/features/user-portal/recharge/portal-recharge-client.ts`
- `admin/src/features/user-portal/recharge/portal-recharge-dialog.tsx`
- `admin/src/features/user-portal/recharge/use-portal-recharge.ts`
- `admin/src/features/user-portal/recharge/index.ts`
- `admin/src/test/portal-recharge.test.tsx`

**Modify:**

- `server/services/platform/paypal-payment-adapter.mjs` — promote only PayPal's reviewed Sandbox operations to canonical `v1`.
- `server/services/platform/paypal-payment-protocol-codec.mjs` — carry symbolic return/callback route refs to transport without accepting URLs from Portal.
- `server/services/platform/payment-provider-adapter-registry.mjs` — preserve default-off declared-capability reduction while resolving PayPal `v1`.
- `server/tests/platform-paypal-payment-adapter.test.mjs`
- `server/tests/platform-paypal-payment-protocol-codec.test.mjs`
- `server/tests/platform-payment-provider-adapter-registry.test.mjs`
- `server/tests/platform-payment-provider-source-boundary.test.mjs`
- `server/state.mjs` — strict default-off runtime assembly and lifecycle ownership.
- `server/app.mjs` — route mounting, protected recharge namespace, and signed callback public-path exception.
- `server/tests/state.test.mjs`
- `server/tests/app-security-boundary.test.mjs`
- `admin/src/features/user-portal/user-portal-client.ts` — expose the recharge client only for the real HTTP client.
- `admin/src/features/user-portal/user-portal-page.tsx` — add one recharge entry and wire Wallet refresh.
- `admin/src/features/user-portal/wallet/portal-wallet-panel.tsx` — render server-backed recharge order status without restoring fixture rows.
- `admin/src/features/user-portal/orders/portal-orders-panel.tsx` — include real Coins recharge orders in the unified order center.
- `admin/src/styles/portal-static-preserve/user-portal-commerce.css` — reuse current tokens for recharge states.
- `admin/src/test/user-portal.test.tsx`
- `admin/src/test/portal-orders-panel.test.tsx`
- `.env.example` — names and disabled placeholders only.
- `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md` — update source truth after implementation.

---

### Task 1: Add The Exact Two-Table Payment Migration

**Files:**
- Create: `server/services/platform/payment-store-migrations.mjs`
- Test: `server/tests/platform-payment-store-migrations.test.mjs`

**Interfaces:**
- Produces: `REQUIRED_PAYMENT_STORE_MIGRATION_ID`, `applyPaymentStoreMigrations({ database, nowFn })`, `inspectPaymentStoreSchema({ database })`, `validatePaymentStoreSchema({ database })`, and `dryRunPaymentStoreMigrations({ dbPath, tempRoot })`.
- Consumes: existing `platform_accounts` and `platform_schema_migrations`; creates no Wallet object.

- [x] **Step 1: Write the failing exact-schema test**

```js
test("payment migration creates exactly orders and receipts with immutable fact guards", () => {
  const database = openControlDatabase();
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  assert.deepEqual(paymentTables(database), [
    "platform_payment_orders",
    "platform_payment_receipts",
  ]);
  assert.equal(validatePaymentStoreSchema({ database }), true);
  assert.throws(() => database.prepare(`
    update platform_payment_receipts set payload_digest = ? where receipt_ref = ?
  `).run("b".repeat(64), "receipt_1"), /payment_receipt_fact_immutable/u);
});
```

- [x] **Step 2: Run RED**

Run: `node --test server/tests/platform-payment-store-migrations.test.mjs`

Expected: FAIL because `payment-store-migrations.mjs` does not exist.

- [x] **Step 3: Implement the minimal migration**

Define `20260801_001_payment_integration_closure` with:

```js
create table platform_payment_orders (
  payment_order_ref text primary key,
  account_id text not null references platform_accounts(id),
  offer_ref text not null,
  create_idempotency_key text not null,
  create_request_digest text not null check (length(create_request_digest) = 64),
  quote_version integer not null check (quote_version > 0),
  expected_paid_coin_units integer not null check (expected_paid_coin_units > 0),
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (length(currency) = 3 and currency = upper(currency)),
  currency_exponent integer not null check (currency_exponent between 0 and 9),
  quote_digest text not null check (length(quote_digest) = 64),
  adapter_key text not null,
  payment_method text not null,
  merchant_binding_ref text not null,
  status text not null check (status in (
    'created','entry_ready','pending','payment_verified','credited',
    'failed_no_charge','reconciliation_required','expired'
  )),
  latest_receipt_ref text,
  wallet_operation_ref text,
  wallet_lot_ref text,
  provider_order_ref text,
  expires_at text not null,
  created_at text not null,
  updated_at text not null,
  unique (account_id, create_idempotency_key)
)
```

and:

```js
create table platform_payment_receipts (
  receipt_ref text primary key,
  payment_order_ref text not null references platform_payment_orders(payment_order_ref),
  attempt_ref text not null,
  provider_request_ref text not null,
  receipt_type text not null check (receipt_type in ('create','query','capture','callback')),
  canonical_state text not null,
  provider_order_ref text,
  provider_capture_ref text,
  provider_event_ref text,
  event_dedupe_key text,
  merchant_scope_digest text,
  payload_digest text,
  verification_result text not null check (verification_result in ('not_applicable','verified')),
  amount_minor integer not null,
  currency text not null,
  currency_exponent integer not null,
  expected_paid_coin_units integer not null,
  accepted_at text not null,
  unique (provider_request_ref, receipt_type),
  unique (merchant_scope_digest, event_dedupe_key)
)
```

Add exact schema/checksum inspection, legal order-state trigger, immutable
receipt-fact update/delete triggers, and transaction rollback tests by forcing
the second DDL statement to fail in a disposable database.

- [x] **Step 4: Run GREEN and migration dry-run tests**

Run: `node --test server/tests/platform-payment-store-migrations.test.mjs`

Expected: PASS, including apply, reapply, checksum mismatch, reopen,
foreign-key check, quick check, and forced-failure rollback.

- [x] **Step 5: Commit**

```powershell
git add server/services/platform/payment-store-migrations.mjs server/tests/platform-payment-store-migrations.test.mjs
git commit -m "feat(payment): add durable recharge schema"
```

---

### Task 2: Implement Server-Owned Offers And The Payment Store

**Files:**
- Create: `server/services/platform/payment-recharge-offer-catalog.mjs`
- Create: `server/services/platform/payment-store.mjs`
- Test: `server/tests/platform-payment-store.test.mjs`

**Interfaces:**
- Produces: `createPaymentRechargeOfferCatalog({ environment, offers })` with `listOffers()` and `getOffer(offerRef)`.
- Produces: `createSqlitePaymentStore({ database, dbPath, nowFn, idFactory })` with `createOrder`, `getOrderForAccount`, `listOrdersForAccount`, `recordOperationReceipt`, `acceptVerifiedPayment`, `markOrderCredited`, and `close`.
- Store order creation consumes an already-resolved frozen offer; it never accepts account, money, or Coin authority from a Portal body.

- [x] **Step 1: Write failing catalog and store tests**

```js
test("createOrder snapshots the server offer and replays one idempotency key", () => {
  const offer = catalog.getOffer("coins_30");
  const first = store.createOrder({
    accountId: "acct_1",
    offer,
    idempotencyKey: "portal_create_1",
    adapterKey: "paypal_v1",
    paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
  });
  assert.equal(first.expectedPaidCoinUnits, 30);
  assert.equal(first.currency, "USD");
  assert.deepEqual(store.createOrder({
    accountId: "acct_1", offer, idempotencyKey: "portal_create_1",
    adapterKey: "paypal_v1", paymentMethod: "paypal",
    merchantBindingRef: "paypal_sandbox_primary",
  }), { ...first, replayed: true });
});

test("verified events dedupe but conflicting event facts fail closed", () => {
  const first = store.acceptVerifiedPayment({ orderRef, paymentFact });
  assert.equal(first.accepted, true);
  assert.equal(store.acceptVerifiedPayment({ orderRef, paymentFact }).replayed, true);
  assert.throws(
    () => store.acceptVerifiedPayment({ orderRef, paymentFact: { ...paymentFact, amountMinor: 2 } }),
    /payment_event_conflict/u,
  );
});
```

- [x] **Step 2: Run RED**

Run: `node --test server/tests/platform-payment-store.test.mjs`

Expected: FAIL because the catalog and store factories do not exist.

- [x] **Step 3: Implement exact normalization and state transitions**

Use integer money and canonical request digests. The catalog accepts only:

```js
{
  offerRef: "coins_30",
  quoteVersion: 1,
  paidCoinUnits: 30,
  amountMinor: 100,
  currency: "USD",
  currencyExponent: 2,
  enabled: true,
}
```

The implementation must reject duplicate offer refs, mixed environment
currencies, unsafe refs, accessors/Proxies, zero units, floating point values,
and client-shaped extra fields. Store write methods use `better-sqlite3`
transactions and map only safe projections.

- [x] **Step 4: Run GREEN**

Run: `node --test server/tests/platform-payment-store.test.mjs`

Expected: PASS for account isolation, quote immutability, legal transitions,
replay, conflicts, concurrent unique keys, close/reopen, and hostile inputs.

- [x] **Step 5: Commit**

```powershell
git add server/services/platform/payment-recharge-offer-catalog.mjs server/services/platform/payment-store.mjs server/tests/platform-payment-store.test.mjs
git commit -m "feat(payment): persist recharge orders and receipts"
```

---

### Task 3: Connect Verified Payment Facts To The Existing Wallet

**Files:**
- Create: `server/services/platform/payment-recharge-coordinator.mjs`
- Test: `server/tests/platform-payment-recharge-coordinator.test.mjs`

**Interfaces:**
- Produces: `createPaymentRechargeCoordinator({ store, walletStore, offerCatalog, adapter, nowFn, refFactory })`.
- Public methods: `listOffers()`, `createRechargeOrder({ accountId, offerRef, idempotencyKey })`, `getRechargeOrder({ accountId, orderRef })`, `listRechargeOrders({ accountId, limit, cursor })`, `captureRechargeOrder({ accountId, orderRef, idempotencyKey })`, and `acceptProviderCallback({ callbackRequestRef, receivedAt, bodyBase64, headerEntries })`.
- Calls existing `walletStore.creditCoins()` only after `store.acceptVerifiedPayment()` succeeds.

- [x] **Step 1: Write the failing exactly-once and crash-recovery tests**

```js
test("duplicate capture and callback converge to one paid_coins lot", async () => {
  const capture = await coordinator.captureRechargeOrder({
    accountId: "acct_1", orderRef, idempotencyKey: "capture_1",
  });
  const callback = await coordinator.acceptProviderCallback(callbackInput);
  assert.equal(capture.order.status, "credited");
  assert.equal(callback.order.status, "credited");
  const wallet = walletStore.getWalletByAccountId("acct_1");
  assert.equal(walletStore.listLots({ walletRef: wallet.walletRef }).length, 1);
  assert.equal(walletStore.getWalletProjection({ accountId: "acct_1" }).totals.paid_coins, 30);
  assert.equal(capture.wallet.resultRef, callback.wallet.resultRef);
});

test("replay after credit-before-order-close uses the Wallet receipt", async () => {
  store.injectFailureOnce("markOrderCredited");
  await assert.rejects(() => coordinator.acceptProviderCallback(callbackInput));
  assert.equal(walletBalance(), 30);
  const recovered = await coordinator.acceptProviderCallback(callbackInput);
  assert.equal(recovered.order.status, "credited");
  assert.equal(recovered.wallet.replayed, true);
  assert.equal(walletBalance(), 30);
});
```

- [x] **Step 2: Run RED**

Run: `node --test server/tests/platform-payment-recharge-coordinator.test.mjs`

Expected: FAIL because the coordinator does not exist.

- [x] **Step 3: Implement minimal orchestration**

Settlement derives `settlementRef` as a SHA-256 safe reference over
`adapterKey + merchantScopeDigest + providerCaptureRef`. It derives
`settlementDigest` over the invariant order, provider order/capture, merchant,
money, and Coin-unit facts. Capture-response and callback payload digests are
intentionally excluded because their bytes differ for the same charge.

Settlement uses that canonical capture identity as Wallet provenance:

```js
const walletResult = walletStore.creditCoins({
  accountId: order.accountId,
  coinType: "paid_coins",
  amountUnits: order.expectedPaidCoinUnits,
  availability: "available",
  sourceType: "verified_payment_capture",
  sourceRef: settlementRef,
  sourceDigest: settlementDigest,
  policyRef: null,
  policyVersion: null,
  expiresAt: null,
  operation: {
    actorScope: `payment:${order.adapterKey}`,
    actorType: "payment_provider",
    actorRef: order.adapterKey,
    idempotencyKey: settlementRef,
  },
});
```

The coordinator validates the branded fact against the immutable order,
persists it before Wallet mutation, treats Wallet replay as success, and marks
the order credited last. Unknown or contradictory facts become
`reconciliation_required` and never call the Wallet.

- [x] **Step 4: Run GREEN**

Run: `node --test server/tests/platform-payment-recharge-coordinator.test.mjs`

Expected: PASS for capture/callback races, duplicate delivery, mismatch,
wrong account, expiry, disabled offers, Wallet unavailable, and both crash
windows.

- [x] **Step 5: Commit**

```powershell
git add server/services/platform/payment-recharge-coordinator.mjs server/tests/platform-payment-recharge-coordinator.test.mjs
git commit -m "feat(payment): settle verified recharges to wallet"
```

---

### Task 4: Activate The Reviewed PayPal Sandbox Adapter Behind Injection

**Files:**
- Modify: `server/services/platform/paypal-payment-adapter.mjs`
- Modify: `server/services/platform/paypal-payment-protocol-codec.mjs`
- Modify: `server/services/platform/payment-provider-adapter-registry.mjs`
- Create: `server/services/platform/paypal-payment-runtime.mjs`
- Modify/Test: `server/tests/platform-paypal-payment-adapter.test.mjs`
- Modify/Test: `server/tests/platform-paypal-payment-protocol-codec.test.mjs`
- Modify/Test: `server/tests/platform-payment-provider-adapter-registry.test.mjs`
- Modify/Test: `server/tests/platform-payment-provider-source-boundary.test.mjs`
- Create/Test: `server/tests/platform-paypal-payment-runtime.test.mjs`

**Interfaces:**
- `createPayPalPaymentAdapter({ executionScope, nowFn })` becomes contract `v1` with create/query/capture/verifyCallback and repeat-create/repeat-capture enabled; refund/reconcile remain false.
- `createPayPalSandboxRuntime({ credential, fetchFn, apiOrigin, allowedActionOrigins, routeMap, nowFn })` produces `{ credentialLoader, transport }` for registry injection.
- Adapter operations consume and return only canonical Provider Core objects.

- [x] **Step 1: Replace the unverified expectations with failing v1 behavior tests**

```js
test("PayPal v1 creates and captures through the scoped transport", async () => {
  const adapter = createPayPalPaymentAdapter({ executionScope, nowFn });
  assert.equal(adapter.contractVersion, "v1");
  assert.deepEqual(adapter.supportedPaymentMethods, ["paypal"]);
  const created = await adapter.createRechargeOrder(createInput);
  assert.equal(created.status, "entry_ready");
  const captured = await adapter.capturePayment(captureInput);
  assert.equal(captured.paymentFact.eventType, "payment_succeeded");
  assert.equal(secretMarkerIn(captured), false);
});
```

Transport tests use an injected `fetchFn` to assert OAuth, Orders create/query/
capture, Webhook verification, bounded JSON parsing, `PayPal-Request-Id`, and
safe error mapping without making a network call.

- [x] **Step 2: Run RED**

Run:

```powershell
node --test server/tests/platform-paypal-payment-adapter.test.mjs server/tests/platform-paypal-payment-runtime.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs
```

Expected: FAIL because PayPal is still `unverified` and no runtime transport
exists.

- [x] **Step 3: Implement the Adapter with existing codecs**

Each method follows this form:

```js
capturePayment(input) {
  return executionScope.withCredential("capture_payment", async ({ request }) => {
    const wire = encodePayPalCaptureOrderRequest(input);
    const transport = await request(wire);
    return {
      transportReceipt: transport.transportReceipt,
      captureOutcome: decodePayPalCaptureOrderResponse({
        captureInput: input,
        providerResponse: transport.response,
        merchantScopeDigest: transport.evidence.merchantScopeDigest,
        payloadDigest: transport.evidence.payloadDigest,
        receivedAt: nowIso(nowFn),
      }),
    };
  });
}
```

The callback method uses `encodePayPalWebhookVerificationRequest()` and
`decodeVerifiedPayPalWebhook()` in the same scoped receipt. `webhookSuccessAck`
returns exact JSON/plain safe success bytes only for a branded callback fact.

- [x] **Step 4: Implement the injected PayPal HTTP transport**

The credential object is accepted only by the runtime factory:

```js
{
  clientId: "injected-at-runtime",
  clientSecret: "injected-at-runtime",
  webhookId: "injected-at-runtime",
  merchantScopeDigest: "<sha256>",
}
```

The transport performs OAuth and only four reviewed actions:
`paypal_orders_create`, `paypal_orders_query`, `paypal_orders_capture`, and
`paypal_webhook_verify`. It returns normalized safe JSON and SHA-256 evidence;
it never returns an access token, credential handle, raw body, or headers.
Symbolic route refs are resolved through the injected `routeMap`, never through
Portal input.

- [x] **Step 5: Run GREEN and source-boundary tests**

Run:

```powershell
node --test server/tests/platform-paypal-payment-adapter.test.mjs server/tests/platform-paypal-payment-protocol-codec.test.mjs server/tests/platform-paypal-payment-runtime.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected: PASS with zero live requests and no secret marker in serialized
outputs.

- [x] **Step 6: Commit**

```powershell
git add server/services/platform/paypal-payment-adapter.mjs server/services/platform/paypal-payment-protocol-codec.mjs server/services/platform/payment-provider-adapter-registry.mjs server/services/platform/paypal-payment-runtime.mjs server/tests/platform-paypal-payment-adapter.test.mjs server/tests/platform-paypal-payment-protocol-codec.test.mjs server/tests/platform-paypal-payment-runtime.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
git commit -m "feat(payment): wire paypal sandbox adapter"
```

---

### Task 5: Add Default-Off Runtime And Protected Recharge Routes

**Files:**
- Create: `server/routes/portal-coin-recharge.mjs`
- Modify: `server/state.mjs`
- Modify: `server/app.mjs`
- Create/Test: `server/tests/portal-coin-recharge-routes.test.mjs`
- Modify/Test: `server/tests/state.test.mjs`
- Modify/Test: `server/tests/app-security-boundary.test.mjs`
- Modify: `.env.example`

**Interfaces:**
- Portal routes: `GET /api/portal/coins/recharge/offers`, `POST /api/portal/coins/recharge/orders`, `GET /api/portal/coins/recharge/orders`, `GET /api/portal/coins/recharge/orders/:orderRef`, and `POST /api/portal/coins/recharge/orders/:orderRef/capture`.
- Provider route: `POST /api/platform/payments/paypal/callback`.
- State exposes `coinRechargeEnabled`, `paymentStore`, and `paymentRechargeCoordinator` only as safe runtime objects.

- [x] **Step 1: Write failing route and default-off tests**

```js
test("recharge namespace is unavailable and side-effect free by default", async () => {
  const response = await request(defaultApp).post("/api/portal/coins/recharge/orders")
    .set(portalSessionHeaders).send({ offerRef: "coins_30", idempotencyKey: "create_1" });
  assert.equal(response.status, 404);
  assert.equal(providerCalls, 0);
  assert.equal(walletCalls, 0);
});

test("authenticated account creates and captures only its server-priced order", async () => {
  const created = await portalRequest.post("/api/portal/coins/recharge/orders")
    .send({ offerRef: "coins_30", idempotencyKey: "create_1" });
  assert.equal(created.status, 201);
  assert.equal(created.body.recharge.order.expectedPaidCoinUnits, 30);
  assert.equal("accountId" in created.body.recharge.order, false);
  const captured = await portalRequest
    .post(`/api/portal/coins/recharge/orders/${created.body.recharge.order.orderRef}/capture`)
    .send({ idempotencyKey: "capture_1" });
  assert.equal(captured.body.recharge.order.status, "credited");
});
```

- [x] **Step 2: Run RED**

Run:

```powershell
node --test server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs server/tests/app-security-boundary.test.mjs
```

Expected: FAIL because routes and state capabilities do not exist.

- [x] **Step 3: Implement routes and strict state assembly**

Require both `PLATFORM_COIN_RECHARGE_ENABLED=true` and
`PLATFORM_PAYPAL_SANDBOX_ENABLED=true`. When either is absent/false, do not
construct the Payment Store, registry resolution, credential loader, transport,
or coordinator. When enabled, require Wallet enabled, one shared validated DB,
an exact USD price-book JSON, safe route bindings, and complete protected
PayPal sandbox credentials; otherwise startup fails closed.

Portal request bodies accept only:

```js
{ offerRef: "coins_30", idempotencyKey: "portal_create_1" }
{ idempotencyKey: "portal_capture_1" }
```

The callback dispatcher reads at most 1 MiB, preserves the exact bytes as
base64 for Provider Core, copies only its allowlisted PayPal headers, and emits
the Adapter ACK only after durable acceptance.

- [x] **Step 4: Run GREEN**

Run the three tests from Step 2. Expected: PASS for session isolation, console
auth boundary, callback signature boundary, size limits, content type, duplicate
delivery, and disabled runtime.

- [ ] **Step 5: Commit**

```powershell
git add server/routes/portal-coin-recharge.mjs server/state.mjs server/app.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs server/tests/app-security-boundary.test.mjs .env.example
git commit -m "feat(payment): expose protected recharge runtime"
```

---

### Task 6: Connect The Existing Portal Recharge And Order Surfaces

**Files:**
- Create: `admin/src/features/user-portal/recharge/portal-recharge-client.ts`
- Create: `admin/src/features/user-portal/recharge/portal-recharge-dialog.tsx`
- Create: `admin/src/features/user-portal/recharge/use-portal-recharge.ts`
- Create: `admin/src/features/user-portal/recharge/index.ts`
- Modify: `admin/src/features/user-portal/user-portal-client.ts`
- Modify: `admin/src/features/user-portal/user-portal-page.tsx`
- Modify: `admin/src/features/user-portal/wallet/portal-wallet-panel.tsx`
- Modify: `admin/src/features/user-portal/orders/portal-orders-panel.tsx`
- Modify: `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- Create/Test: `admin/src/test/portal-recharge.test.tsx`
- Modify/Test: `admin/src/test/user-portal.test.tsx`
- Modify/Test: `admin/src/test/portal-orders-panel.test.tsx`

**Interfaces:**
- Produces `PortalRechargeClient` with `listOffers`, `createOrder`, `listOrders`, `getOrder`, and `captureOrder`.
- `PortalRechargeOrder.status` is exactly `created | entry_ready | pending | payment_verified | credited | failed_no_charge | reconciliation_required | expired`.
- The real HTTP Portal client exposes `recharge`; local/mock clients expose no recharge capability unless a test injects one explicitly.

- [ ] **Step 1: Write failing client and interaction tests**

```tsx
test("server-backed recharge opens PayPal and refreshes Wallet after credit", async () => {
  render(<UserPortalPage portalClient={clientWithRecharge(recharge)} />);
  await enterPortal();
  fireEvent.click(screen.getByRole("button", { name: "充值 Coins" }));
  const dialog = await screen.findByRole("dialog", { name: "充值 Coins" });
  fireEvent.click(within(dialog).getByRole("button", { name: "30 Coins" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "使用 PayPal 测试支付" }));
  expect(recharge.createOrder).toHaveBeenCalledWith(expect.objectContaining({ offerRef: "coins_30" }));
  expect(paymentRedirect).toHaveBeenCalledWith("https://www.sandbox.paypal.com/checkoutnow?token=safe");
  fireEvent.click(within(dialog).getByRole("button", { name: "我已完成支付" }));
  expect(await within(dialog).findByText("30 Coins 已到账")).toBeInTheDocument();
  expect(wallet.getSummary).toHaveBeenCalledTimes(2);
});

test("Portal without recharge capability exposes no recharge action", async () => {
  render(<UserPortalPage portalClient={portalClient()} />);
  await enterPortal();
  expect(screen.queryByRole("button", { name: "充值 Coins" })).toBeNull();
});
```

- [ ] **Step 2: Run RED**

Run:

```powershell
Push-Location admin
try {
  npm test -- src/test/portal-recharge.test.tsx src/test/user-portal.test.tsx src/test/portal-orders-panel.test.tsx
} finally {
  Pop-Location
}
```

Expected: FAIL because the real recharge client and dialog do not exist.

- [ ] **Step 3: Implement the real client and hook**

Map only safe server fields. The hook owns one session generation, one active
order, redirect action, polling/manual refresh, and Wallet refresh after the
first transition to `credited`. It aborts stale results after logout or session
replacement and never stores an order in local storage.

- [ ] **Step 4: Implement the existing-shell UI connection**

Render `充值 Coins` only when `portalClient.recharge` exists. The dialog lists
only returned server offers, shows exact USD Sandbox amount, launches the
allowlisted PayPal action URL, and offers an explicit capture/refresh action.
Pending, verified, credited, expired, failed, and reconciliation states use
`aria-live`; focus returns to the opening button. Add recharge order rows to the
existing order center as a new source kind, without changing product-order or
legacy-order logic.

- [ ] **Step 5: Run GREEN and Portal build verification**

Run the focused command from Step 2, then:

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
```

Expected: PASS with the existing production entry/bootstrap/stylesheet/output
identity intact.

- [ ] **Step 6: Commit**

```powershell
git add admin/src/features/user-portal/recharge admin/src/features/user-portal/user-portal-client.ts admin/src/features/user-portal/user-portal-page.tsx admin/src/features/user-portal/wallet/portal-wallet-panel.tsx admin/src/features/user-portal/orders/portal-orders-panel.tsx admin/src/styles/portal-static-preserve/user-portal-commerce.css admin/src/test/portal-recharge.test.tsx admin/src/test/user-portal.test.tsx admin/src/test/portal-orders-panel.test.tsx
git commit -m "feat(portal): connect Coins recharge flow"
```

---

### Task 7: Align Documentation And Run The Full Source Gate

**Files:**
- Modify: `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- Modify: `docs/superpowers/specs/2026-08-01-payment-integration-closure-design.md`
- Test: all focused and repository validation suites

**Interfaces:**
- Produces one reviewable default-off Risk A source branch.
- Does not push, open/ready/merge a PR, inject credentials, call PayPal, mutate production schema, or activate runtime.

- [ ] **Step 1: Update source-truth documentation**

Record that PayPal's compiled Adapter and durable source path exist but remain
runtime default-off and have not been live Sandbox-validated. Change the design
state to `implemented_source_pending_validation` only after code exists; retain
`production authority: none`.

- [ ] **Step 2: Run focused backend suites**

```powershell
node --test server/tests/platform-payment-store-migrations.test.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/platform-paypal-payment-adapter.test.mjs server/tests/platform-paypal-payment-protocol-codec.test.mjs server/tests/platform-paypal-payment-runtime.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs server/tests/app-security-boundary.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run the complete validation contract**

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
npm run docs:authority:check
git diff --check origin/master...HEAD
```

Expected: every command exits 0 with no unexpected warning or secret output.

- [ ] **Step 4: Review the complete diff**

Run:

```powershell
git status --short --branch
git diff --stat origin/master...HEAD
git log --oneline origin/master..HEAD
```

Confirm exactly two payment tables, no second Wallet ledger, no legacy direct
checkout restoration, no committed artifact/config secret, and no production
mutation.

- [ ] **Step 5: Commit documentation closeout**

```powershell
git add docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md docs/superpowers/specs/2026-08-01-payment-integration-closure-design.md
git commit -m "docs(payment): record default-off integration closure"
```

- [ ] **Step 6: Stop at source review**

Report the exact branch/head, validation evidence, known gaps, and the separate
PayPal Sandbox Risk A Gate still required. Do not push, merge, deploy, inject
credentials, register a webhook, or create a provider order without explicit
approval.
