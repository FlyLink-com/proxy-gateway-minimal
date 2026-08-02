# Production CNY Payment Providers Default-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the provider-neutral recharge settlement boundary, preserve XSD and ChaoJiPay as non-executable documented candidates, and add the frozen six-tier CNY Coins price book plus its production-quality Portal card presentation without activating either provider.

**Architecture:** Payment Store and Wallet remain the only durable order and Coins settlement systems. Provider-specific material is isolated in detached pure modules which are not reachable from the Adapter registry, runtime, routes, or credentials; both provider Adapters remain `unverified` with every capability false. A source-owned CNY price book is projected through the existing recharge offer contract, while the current PayPal Sandbox runtime remains the only executable payment runtime and production CNY remains default-off.

**Tech Stack:** Node.js ESM, `better-sqlite3`, Express, React/TypeScript, Vitest/Testing Library, Node test runner, existing Payment Provider Core, Payment Store, and Coin Wallet Store.

## Risk Declaration

- Risk: B source implementation inside a future Risk A payment activation boundary.
- Process: one compact TDD PR with task-level review and final whole-branch review.
- Expected PR count: 1.
- Validation: focused Node tests, `npm run admin:test`, `npm run admin:portal:build`, `npm run admin:portal:verify`, `npm run admin:build`, `npm test`, and `git diff --check origin/master...HEAD`.
- Production/AWS impact: none; no deployment, provider request, callback registration, credential mutation, schema migration, or real order.

## Global Constraints

- Source baseline is `origin/master@9ac85d18bbda7e2238e0cc589932dc7941523ecc`.
- Release units are `control-plane-app` and `portal-static`; `frontend_surface: portal`; `production_state: not_deployed`; `identity_impact: false`.
- XSD and ChaoJiPay remain `contractVersion: "unverified"`, all eight capabilities remain `false`, and `supportedPaymentMethods` remains `[]`.
- Do not add provider transport, credential loading, callback route, callback acknowledgement, verified payment fact, provider capture identity, query-driven settlement, or automatic provider fallback.
- ChaoJiPay documented channel scope is WeChat only. XSD documented channel scope is Alipay plus WeChat. These are evidence metadata, not executable Adapter capabilities.
- Only a pre-dispatch local selection or an authoritative confirmed-no-charge fact may ever choose another provider. This PR produces neither fact and therefore performs no provider fallback.
- A persisted payment order is never rebound to another Adapter, payment method, or merchant binding. A later retry remains an independent order.
- Formal production CNY price book v1 contains exactly `coins_10`, `coins_30`, `coins_50`, `coins_100`, `coins_200`, and `coins_300`; each grants the same number of `paid_coins` as its whole-CNY price, has no discount, no bonus, and no expiry.
- PayPal Sandbox remains a separate USD test price book and must keep working unchanged.
- Portal displays payment methods, never provider identities. It must not render `xsd_v1`, `chaojipay_v1`, merchant identifiers, provider order references, PayPal Sandbox, or credentials in the CNY offer cards.
- Reuse the real Portal production chain only: `admin/portal/index.html` -> `admin/src/portal-main.tsx` -> `admin/src/portal-static-preserve.css` -> `admin/dist-portal`. Do not create a second Portal shell or navigation.
- Do not change the Coins ledger, schema/migrations, marketplace order logic, entitlement fulfillment, subscription model, payment callback public paths, production configuration, or legacy direct checkout.
- Do not store or log secrets, merchant values, callback payloads, customer identity, payer details, account balances, or raw provider responses.
- No new dependency, Redis, queue, worker, microservice, or mobile redesign.
- Every production-code change follows RED, observed expected failure, minimal GREEN, observed pass, then refactor.

---

## File Map

**Create:**

- `server/services/platform/xsd-documented-payment-candidate.mjs` — detached XSD field/signing candidate derived from the read-only merchant documentation; not a runtime codec.
- `server/services/platform/chaojipay-documented-payment-candidate.mjs` — detached ChaoJiPay field/signing candidate derived from the read-only merchant documentation; not a runtime codec.
- `server/services/platform/production-cny-payment-recharge-price-book.mjs` — immutable six-tier CNY v1 source price book.
- `server/tests/platform-xsd-documented-payment-candidate.test.mjs`
- `server/tests/platform-chaojipay-documented-payment-candidate.test.mjs`
- `server/tests/platform-production-cny-payment-recharge-price-book.test.mjs`

**Modify:**

- `server/services/platform/payment-store.mjs` — immutable provider-order binding, complete payment identity checks, and Wallet-reference settlement hard gate.
- `server/services/platform/payment-recharge-coordinator.mjs` — pass complete Adapter/payment/merchant binding and fail closed on late success or existing Wallet references.
- `server/services/platform/payment-recharge-offer-catalog.mjs` — canonical payment-method metadata in the signed offer snapshot.
- `server/routes/portal-coin-recharge.mjs` — project offer payment methods only; no new route.
- `server/state.mjs` — add `paymentMethods: ["paypal"]` only while assembling the existing PayPal Sandbox catalog; do not assemble production CNY runtime.
- `server/tests/platform-payment-store.test.mjs`
- `server/tests/platform-payment-recharge-coordinator.test.mjs`
- `server/tests/platform-payment-provider-source-boundary.test.mjs`
- `server/tests/platform-xsd-payment-adapter.test.mjs`
- `server/tests/platform-chaojipay-payment-adapter.test.mjs`
- `server/tests/portal-coin-recharge-routes.test.mjs`
- `server/tests/state.test.mjs`
- `admin/src/features/user-portal/recharge/portal-recharge-client.ts`
- `admin/src/features/user-portal/recharge/portal-recharge-dialog.tsx`
- `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- `admin/src/test/portal-recharge.test.tsx`
- `admin/src/test/user-portal.test.tsx`
- `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- `docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md`

---

### Task 1: Harden Payment Identity And Exactly-Once Settlement

**Files:**
- Modify: `server/services/platform/payment-store.mjs`
- Modify: `server/services/platform/payment-recharge-coordinator.mjs`
- Test: `server/tests/platform-payment-store.test.mjs`
- Test: `server/tests/platform-payment-recharge-coordinator.test.mjs`

**Interfaces:**
- `acceptVerifiedPayment(...)` additionally consumes `adapterKey`, `paymentMethod`, and `merchantBindingRef` and verifies them against the immutable order row before inserting a verified receipt.
- `getOrderForVerifiedCallback(...)` additionally consumes `paymentMethod` and `merchantBindingRef` and validates the complete stored binding.
- `getSettlementContext(...)` additionally returns `paymentMethod`, `merchantBindingRef`, `walletOperationRef`, and `walletLotRef`.
- `settlementIdentity(...)` includes `paymentMethod` and `merchantBindingRef` in `settlementDigest`.
- No schema or migration changes.

- [ ] **Step 1: Add RED tests for immutable payment identity**

Add store tests which create one order bound to `paypal_v1`, `paypal`, and `paypal_sandbox_primary`, then independently substitute each field on the same create idempotency key and on verified callback acceptance. Assert exact `payment_order_idempotency_conflict` or `payment_fact_mismatch`, one unchanged order row, no additional verified receipt, and unchanged Wallet references.

Use this accepted call shape in the positive case:

```js
store.acceptVerifiedPayment({
  orderRef: "payment_order_1",
  attemptRef: "attempt_callback_1",
  providerRequestRef: "callback_request_1",
  receiptType: "callback",
  adapterKey: "paypal_v1",
  paymentMethod: "paypal",
  merchantBindingRef: "paypal_sandbox_primary",
  paymentFact: verifiedFact(),
});
```

- [ ] **Step 2: Run the identity tests and observe RED**

Run:

```powershell
node --test server/tests/platform-payment-store.test.mjs
```

Expected: the new exact-input calls fail because the Store does not yet accept or verify the three binding fields.

- [ ] **Step 3: Implement complete binding checks and write-once provider order refs**

Before inserting any operation receipt, enforce:

```js
if (
  order.provider_order_ref !== null
  && result.providerOrderRef !== null
  && order.provider_order_ref !== result.providerOrderRef
) fail("payment_provider_order_conflict");
```

Only bind `provider_order_ref` when the stored value is null; a null result never clears it and the same non-null value is allowed. In verified acceptance and callback lookup, compare all of:

```text
adapter_key
payment_method
merchant_binding_ref
provider_order_ref
amount_minor
currency
currency_exponent
```

Pass the coordinator's frozen `adapterKey`, `paymentMethod`, and `merchantBindingRef` at both capture and callback acceptance sites. Add `paymentMethod` and `merchantBindingRef` to the settlement digest; do not add them to provider facts.

- [ ] **Step 4: Add RED tests for Wallet hard gate and late success**

Add coordinator tests proving:

- once either persisted Wallet reference exists, another callback never calls `creditCoins()` again;
- an already credited order receiving a conflicting capture enters reconciliation and repeated delivery still never calls Wallet;
- a `failed_no_charge` order receiving a late verified success rejects with `payment_reconciliation_required`, sends no success acknowledgement, keeps `failed_no_charge`, and creates no Wallet lot;
- a Wallet response missing either `operationRef` or `resultRef` cannot close the order as credited.

- [ ] **Step 5: Run the coordinator tests and observe RED**

Run:

```powershell
node --test server/tests/platform-payment-recharge-coordinator.test.mjs
```

Expected: at least the conflicting callback replay reaches `creditCoins()` or the late success exposes `payment_order_state_conflict` instead of the provider-neutral reconciliation error.

- [ ] **Step 6: Implement the settlement hard gate**

In `settle(accepted)`, inspect the persisted Wallet references before calling Wallet:

```js
const hasWalletOperation = context.walletOperationRef !== null;
const hasWalletLot = context.walletLotRef !== null;
if (hasWalletOperation !== hasWalletLot) fail("payment_reconciliation_required");
if (hasWalletOperation) {
  if (context.creditedReceipt !== null
      && sameSettlement(identity, settlementIdentity(context, context.creditedReceipt))) {
    return publicResult(accepted.order, null, { replayed: true });
  }
  fail("payment_reconciliation_required");
}
```

Before accepting a late success, read the order through the complete callback binding. If it is `failed_no_charge` or `reconciliation_required`, reject with `payment_reconciliation_required` before minting a receipt, calling Wallet, or acknowledging success. The existing schema forbids `failed_no_charge -> reconciliation_required`; keep the row unchanged and record this persistence gap as a later Risk A migration question rather than weakening the trigger.

- [ ] **Step 7: Run focused GREEN tests and commit**

Run:

```powershell
node --test server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs
```

Expected: PASS, including replay, conflict, crash-recovery, and no-second-credit assertions.

Commit:

```powershell
git add server/services/platform/payment-store.mjs server/services/platform/payment-recharge-coordinator.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs
git commit -m "fix(payment): harden settlement identity"
```

---

### Task 2: Add Detached Provider Documentation Candidates

**Files:**
- Create: `server/services/platform/xsd-documented-payment-candidate.mjs`
- Create: `server/services/platform/chaojipay-documented-payment-candidate.mjs`
- Test: `server/tests/platform-xsd-documented-payment-candidate.test.mjs`
- Test: `server/tests/platform-chaojipay-documented-payment-candidate.test.mjs`
- Modify: `server/tests/platform-payment-provider-source-boundary.test.mjs`
- Modify: `server/tests/platform-xsd-payment-adapter.test.mjs`
- Modify: `server/tests/platform-chaojipay-payment-adapter.test.mjs`
- Modify: `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- Modify: `docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md`

**Interfaces:**
- XSD candidate exports frozen metadata, `canonicalizeXsdCreateSigningCandidate(fields)`, `canonicalizeXsdQuerySigningCandidate(fields)`, and `digestXsdSigningCandidate({ canonicalText, syntheticSecret })`.
- ChaoJiPay candidate exports frozen metadata, `canonicalizeChaoJiPayCreateSigningCandidate(fields)`, `canonicalizeChaoJiPayQuerySigningCandidate(fields)`, and `digestChaoJiPaySigningCandidate({ canonicalText, syntheticSecret })`.
- Neither module is imported by an Adapter, registry, runtime, route, Store, Wallet, credential loader, or public index.

- [ ] **Step 1: Write RED tests for exact detached metadata**

Lock these documented facts without claiming live compatibility:

```js
// XSD
{
  adapterKey: "xsd_v1",
  contractVersion: "unverified",
  documentedChannels: Object.freeze({ alipay: "1917", wechat_pay: "1923" }),
  requestEncoding: "application/x-www-form-urlencoded; charset=utf-8",
  createOrigin: "https://www.xsd8866.com",
  createPath: "/api/gaia/unifiedorder",
  queryPath: "/api/gaia/query",
  callbackVerification: "unverified",
  acknowledgement: "unverified",
}

// ChaoJiPay
{
  adapterKey: "chaojipay_v1",
  contractVersion: "unverified",
  documentedPaymentMethods: Object.freeze(["wechat_pay"]),
  documentedProductCode: "726",
  requestEncoding: "application/json; charset=utf-8",
  createOrigin: "https://payment.chaojipay.me",
  createPath: "/api/order/create",
  queryPath: "/api/order/search",
  callbackVerification: "unverified",
  acknowledgement: "unverified",
}
```

The test must also assert all eight Adapter capabilities are false and the executable Adapter's `supportedPaymentMethods` is still empty.

- [ ] **Step 2: Write RED synthetic canonicalization tests**

Use only synthetic values such as `merchant_demo`, `order_demo_1`, `203.0.113.10`, and `synthetic_secret`. Assert:

- XSD excludes `sign`, `format`, and `attach`; excludes empty values; sorts keys by ASCII/dictionary order; joins `key=value` with `&`; appends the synthetic secret directly before lowercase MD5.
- ChaoJiPay excludes `sign` and `realName`; excludes empty values; sorts keys by ASCII/dictionary order; joins `key=value` with `&`; appends `&key=synthetic_secret` before uppercase MD5.
- duplicate keys, accessors, proxies, non-plain objects, unsafe order references, non-string values, extra fields, and empty synthetic secrets fail closed with `provider_contract_unverified` or `invalid_documented_payment_candidate`.
- no callback verifier, status-to-settlement mapper, ACK encoder, provider response parser, fetch, credential reader, or environment reader is exported.

- [ ] **Step 3: Run the candidate tests and observe RED**

Run:

```powershell
node --test server/tests/platform-xsd-documented-payment-candidate.test.mjs server/tests/platform-chaojipay-documented-payment-candidate.test.mjs
```

Expected: FAIL because both detached modules do not exist.

- [ ] **Step 4: Implement the minimal pure candidates**

Use `node:crypto` only for deterministic MD5 over UTF-8 synthetic canonical strings. Snapshot exact own enumerable data properties before sorting. Never accept callback data and never return a verified fact. Add a module header stating that passing these synthetic tests is not provider compatibility evidence and that the module must remain unreachable from runtime until a later Risk A contract-validation Gate.

- [ ] **Step 5: Strengthen source isolation and documentation**

Add both modules as source-boundary roots and assert their dependency graphs contain only themselves plus `node:crypto`. Scan Adapter, registry, runtime, route, Store, and Wallet source for both module specifiers and require zero matches. Preserve exact Adapter assertions:

```js
assert.equal(adapter.contractVersion, "unverified");
assert.deepEqual(adapter.supportedPaymentMethods, []);
assert.deepEqual(Object.values(adapter.capabilities), Array(8).fill(false));
```

Document the remaining blockers: official fixed signing vectors, exact callback field inclusion, stable provider transaction identity, authoritative no-charge semantics, exact ACK/retry contract, and allowed action URL behavior.

- [ ] **Step 6: Run focused GREEN tests and commit**

Run:

```powershell
node --check server/services/platform/xsd-documented-payment-candidate.mjs
node --check server/services/platform/chaojipay-documented-payment-candidate.mjs
node --test server/tests/platform-xsd-documented-payment-candidate.test.mjs server/tests/platform-chaojipay-documented-payment-candidate.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected: PASS with no runtime import path from either candidate.

Commit:

```powershell
git add server/services/platform/xsd-documented-payment-candidate.mjs server/services/platform/chaojipay-documented-payment-candidate.mjs server/tests/platform-xsd-documented-payment-candidate.test.mjs server/tests/platform-chaojipay-documented-payment-candidate.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md
git commit -m "feat(payment): record provider protocol candidates"
```

---

### Task 3: Add The Frozen CNY Price Book And Portal Cards

**Files:**
- Create: `server/services/platform/production-cny-payment-recharge-price-book.mjs`
- Create: `server/tests/platform-production-cny-payment-recharge-price-book.test.mjs`
- Modify: `server/services/platform/payment-recharge-offer-catalog.mjs`
- Modify: `server/routes/portal-coin-recharge.mjs`
- Modify: `server/state.mjs`
- Modify: `server/tests/platform-payment-store.test.mjs`
- Modify: `server/tests/platform-payment-recharge-coordinator.test.mjs`
- Modify: `server/tests/portal-coin-recharge-routes.test.mjs`
- Modify: `server/tests/state.test.mjs`
- Modify: `admin/src/features/user-portal/recharge/portal-recharge-client.ts`
- Modify: `admin/src/features/user-portal/recharge/portal-recharge-dialog.tsx`
- Modify: `admin/src/styles/portal-static-preserve/user-portal-commerce.css`
- Modify: `admin/src/test/portal-recharge.test.tsx`
- Modify: `admin/src/test/user-portal.test.tsx`

**Interfaces:**
- `createProductionCnyPaymentRechargeOffers()` returns a new deeply frozen six-offer array each call.
- Canonical offer projection adds `paymentMethods`, an exact non-empty array in canonical order from `alipay`, `wechat_pay`, `paypal`.
- Existing PayPal Sandbox state assembly maps its USD offers to `paymentMethods: ["paypal"]` before creating the catalog.
- Production CNY runtime remains unassembled; the CNY book does not read env and does not make recharge available by itself.

- [ ] **Step 1: Write RED price-book and catalog tests**

Assert this exact v1 table:

| offerRef | quoteVersion | paidCoinUnits | amountMinor | currency | exponent | paymentMethods |
|---|---:|---:|---:|---|---:|---|
| `coins_10` | 1 | 10 | 1000 | `CNY` | 2 | `alipay`, `wechat_pay` |
| `coins_30` | 1 | 30 | 3000 | `CNY` | 2 | `alipay`, `wechat_pay` |
| `coins_50` | 1 | 50 | 5000 | `CNY` | 2 | `alipay`, `wechat_pay` |
| `coins_100` | 1 | 100 | 10000 | `CNY` | 2 | `alipay`, `wechat_pay` |
| `coins_200` | 1 | 200 | 20000 | `CNY` | 2 | `alipay`, `wechat_pay` |
| `coins_300` | 1 | 300 | 30000 | `CNY` | 2 | `alipay`, `wechat_pay` |

All offers are enabled in the source book, but source existence alone must not assemble a runtime or expose a route. Reject missing, duplicate, unknown, non-canonical, or empty methods and any extra field. Prove `quoteDigest` changes when methods change.

- [ ] **Step 2: Run price-book tests and observe RED**

Run:

```powershell
node --test server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-store.test.mjs
```

Expected: FAIL because the production price-book module and offer `paymentMethods` field do not exist.

- [ ] **Step 3: Implement the immutable price book and offer projection**

Keep the raw source records exact:

```js
{
  offerRef: "coins_10",
  quoteVersion: 1,
  paidCoinUnits: 10,
  amountMinor: 1000,
  currency: "CNY",
  currencyExponent: 2,
  paymentMethods: ["alipay", "wechat_pay"],
  enabled: true,
}
```

Generate the other five records mechanically from frozen numeric tiers. Include `paymentMethods` in the catalog's canonical quote and `quoteDigest`. Update the recharge route to project it. At existing PayPal Sandbox state assembly only, add `["paypal"]` to each parsed USD offer; do not add a production enable flag or credentials.

- [ ] **Step 4: Write RED Portal card tests**

In the client tests, accept only exact `paymentMethods`, reject `xsd_v1`, `chaojipay_v1`, duplicates, unknown methods, and non-canonical ordering. In the dialog test, render all six CNY offers and assert:

- six cards with `10`, `30`, `50`, `100`, `200`, and `300 Coins`;
- amounts `CNY 10.00` through `CNY 300.00`;
- neutral labels `Alipay` and `WeChat Pay` on every card;
- no provider, merchant, Sandbox, bonus, discount, expiry, or fake recommendation text;
- the card action still invokes only `createOrder(offerRef)`; payment-method selection remains a later verified-runtime task;
- with no recharge client or with a 404 default-off namespace, no recharge entry or CNY card is visible.

- [ ] **Step 5: Run Portal tests and observe RED**

Run:

```powershell
npm --prefix admin test -- src/test/portal-recharge.test.tsx src/test/user-portal.test.tsx
```

Expected: the client rejects the new field or the current list presentation does not satisfy the six-card assertions.

- [ ] **Step 6: Implement the desktop card grid**

Extend `PortalRechargeOffer` with:

```ts
paymentMethods: readonly ("alipay" | "wechat_pay" | "paypal")[];
```

Strictly project the canonical array. Render methods as non-interactive chips with localized labels; do not render Adapter names. Convert `.portal-recharge-offers` to a desktop grid using existing Portal tokens, visible keyboard focus on the existing action button, and a clear selected hover/focus surface without adding mobile-specific layout work.

- [ ] **Step 7: Run focused GREEN tests and commit**

Run:

```powershell
node --test server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs
npm --prefix admin test -- src/test/portal-recharge.test.tsx src/test/user-portal.test.tsx
```

Expected: PASS while the default-off route tests still return 404 with zero coordinator calls.

Commit:

```powershell
git add server/services/platform/production-cny-payment-recharge-price-book.mjs server/services/platform/payment-recharge-offer-catalog.mjs server/routes/portal-coin-recharge.mjs server/state.mjs server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs admin/src/features/user-portal/recharge/portal-recharge-client.ts admin/src/features/user-portal/recharge/portal-recharge-dialog.tsx admin/src/styles/portal-static-preserve/user-portal-commerce.css admin/src/test/portal-recharge.test.tsx admin/src/test/user-portal.test.tsx
git commit -m "feat(payment): add default-off CNY recharge cards"
```

---

## Final Validation And Review

After all task reviews are clean, run:

```powershell
node --test server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/platform-xsd-documented-payment-candidate.test.mjs server/tests/platform-chaojipay-documented-payment-candidate.test.mjs server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

Required final evidence:

- XSD and ChaoJiPay remain unverified, disabled, and unreachable from runtime.
- No provider network request, credential read, callback route, ACK, real order, Wallet write, or production mutation occurred.
- Payment Store rejects cross-Adapter/payment-method/merchant-binding facts and provider order rebinding.
- Existing Wallet references prevent any second credit attempt.
- CNY price book is exact, immutable, versioned, server-authoritative, and not wired to runtime.
- Portal shows the six formal cards only when server offers exist and never displays provider identity.
- PayPal Sandbox focused tests remain green.

Known follow-up requiring separate Risk A evidence and approval:

- official fixed create/query/callback signing vectors for each provider;
- exact callback media type, field inclusion, stable provider transaction identity, success finality, ACK/retry contract, and allowed action URL behavior;
- promotion of either Adapter to `v1`, production credential binding, static callback route, payment-method selection, production CNY runtime assembly, and one-provider-at-a-time small-value canary;
- optional schema decision if late success after `failed_no_charge` must persist a reconciliation transition instead of remaining fail-closed in its prior state.
