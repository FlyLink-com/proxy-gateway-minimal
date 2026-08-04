# CNY Payment Provider Single-Active Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Assemble PayPal Sandbox, XSD, or ChaoJiPay as exactly one default-off Coins recharge provider, expose only that provider's static callback route, prevent repeat dispatch of non-idempotent provider creates, and prove exactly-once CNY settlement through the existing Payment Store and Coins Wallet.

**Architecture:** `server/state.mjs` remains the only composition root and derives one internal provider enum from three explicit enable flags. It creates one provider Runtime, one Registry, one resolved Adapter, and one Coordinator; `app.mjs` passes only the safe enum and Coordinator to the existing recharge router. The existing durable order row is also the provider-create dispatch claim: only a newly inserted claim may call an Adapter that declares `repeatCreateIdempotent: false`. Provider callbacks preserve raw bytes and reuse the existing provider-neutral Payment Store and Wallet settlement transaction boundaries; no selector, fallback dispatcher, schema, ledger, order-contract, or Portal change is introduced.

**Tech Stack:** Node.js ESM, Express, `better-sqlite3`, Node test runner, existing Payment Provider Adapter Registry, Payment Recharge Coordinator, Payment Store, Coin Wallet Store, and the existing immutable CNY recharge price book.

**Implementation status:** Tasks 1–4 are implemented and task-reviewed. Final review at `acb41449a483e47d02b71dc357d265c056076aa0` identified one blocking create-dispatch issue and two Runtime hardening issues; the approved controlled revision is committed at `e53e50814f63acd17c9174e62cdb3e2a1552f63a`. Task 5 is implemented source-only at `be40519ad720a290fe40ee20591f41b7e5f0ef75` (`fix(payment): close provider assembly review gaps`). Its scoped re-review passed with all in-scope findings addressed and no new regression; exact-head validation passed with focused server 356/356, Admin 594/594, Portal/Admin builds and Portal verification successful, and the full repository suite at 2663 passed with 5 skipped. Actual RED: Coordinator 20/22 passed with concurrent duplicate dispatch and receipt-loss replay failures; Runtime 20/24 passed with two credential-inspection, missing-`redirected`, and hostile-accessor failures. Actual GREEN: Coordinator 22/22, Runtime 24/24, and the six-file focused regression 97/97 passed. `production_state: not_deployed`; no activation or production authority is granted.

## Risk Declaration

- Risk: B source change inside future provider-specific Risk A activation boundaries.
- Process: one compact TDD PR after PR #577 merges; task-level implementation review, task-level spec review, and final whole-branch review.
- Expected PR count: 1 follow-up PR containing the approved design, this plan, source changes, and tests.
- Validation: focused provider/state/route/store/wallet tests, `npm run admin:test`, `npm run admin:portal:build`, `npm run admin:portal:verify`, `npm run admin:build`, `npm test`, and `git diff --check origin/master...HEAD`.
- Production/AWS impact: none; no provider call, credential read from merchant files, public callback registration, schema migration, deployment, activation, real order, or real-money test.

## Global Constraints

- Design evidence baseline is `d2636c5e0b8cd2798fa0c92dce4679f640576c32`, the exact head of Draft PR #577 when the design was approved.
- Implementation must not begin until PR #577 is merged. Recreate or rebase the implementation branch from the exact resulting `origin/master`, then record `git rev-parse HEAD`, `git merge-base HEAD origin/master`, and `git status --short --branch` before the first RED test.
- If PR #577 is not merged, its exact commit is not an ancestor of `origin/master`, or the implementation worktree contains unrelated changes, stop before editing runtime code.
- Release unit is `control-plane-app`; `production_state: not_deployed`; `identity_impact: false`.
- The top-level enable flag is exactly `PLATFORM_COIN_RECHARGE_ENABLED`.
- Provider enable flags are exactly `PLATFORM_PAYPAL_SANDBOX_ENABLED`, `PLATFORM_XSD_PAYMENT_ENABLED`, and `PLATFORM_CHAOJIPAY_PAYMENT_ENABLED`.
- Top-level disabled requires all provider flags disabled. Top-level enabled requires exactly one provider flag enabled. Every mismatch fails startup.
- Disabled provider configuration is never read, normalized, logged, or passed to a factory. Merely supplying provider values never enables a provider.
- Internal provider values are exactly `paypal_sandbox`, `xsd`, and `chaojipay`; HTTP requests, callback bodies, orders, and generic environment selectors cannot supply them.
- PayPal keeps the existing USD Sandbox offer configuration and behavior.
- PayPal selected configuration remains exactly `PLATFORM_COIN_RECHARGE_USD_OFFERS_JSON`, `PLATFORM_PAYPAL_SANDBOX_CLIENT_ID`, `PLATFORM_PAYPAL_SANDBOX_CLIENT_SECRET`, `PLATFORM_PAYPAL_SANDBOX_WEBHOOK_ID`, `PLATFORM_PAYPAL_SANDBOX_MERCHANT_SCOPE_DIGEST`, `PLATFORM_PAYPAL_CALLBACK_URL`, and `PLATFORM_PAYPAL_RETURN_URL`.
- XSD and ChaoJiPay use `createProductionCnyPaymentRechargeOffers()` and bind every projected offer to the one active payment method.
- XSD binds exactly one of `alipay` or `wechat_pay` per process. ChaoJiPay binds exactly `wechat_pay`.
- XSD selected configuration is exactly `PLATFORM_XSD_PAYMENT_METHOD`, `PLATFORM_XSD_MERCHANT_ID`, `PLATFORM_XSD_MERCHANT_SECRET`, `PLATFORM_XSD_MERCHANT_SCOPE_DIGEST`, `PLATFORM_XSD_CALLBACK_URL`, `PLATFORM_XSD_RETURN_URL`, and `PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON`.
- ChaoJiPay selected configuration is exactly `PLATFORM_CHAOJIPAY_MERCHANT_ID`, `PLATFORM_CHAOJIPAY_MERCHANT_SECRET`, `PLATFORM_CHAOJIPAY_MERCHANT_SCOPE_DIGEST`, `PLATFORM_CHAOJIPAY_CALLBACK_URL`, `PLATFORM_CHAOJIPAY_ALLOWED_ACTION_ORIGINS_JSON`, and `PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP`.
- XSD outbound API origin is exactly `https://www.xsd8866.com`. ChaoJiPay outbound API origin is exactly `https://payment.chaojipay.me`.
- Callback paths are exactly `/api/platform/payments/paypal/callback`, `/api/platform/payments/xsd/callback`, and `/api/platform/payments/chaojipay/callback`; only the selected path is mounted.
- No dynamic `/:provider` callback, simultaneous provider, automatic fallback, provider selection request field, payment-method selection request field, or query-driven settlement route is added.
- Portal create-order input remains exactly `{ offerRef, idempotencyKey }`.
- Provider callback input to the Coordinator remains exactly `{ callbackRequestRef, receivedAt, bodyBase64, headerEntries }`.
- XSD and ChaoJiPay callback routes retain raw bytes, never use `express.urlencoded()`, and enforce an exact 16,384-byte HTTP body limit.
- Success acknowledgement is sent only for authenticated documented non-settlement status or after the verified receipt, one `paid_coins` Wallet lot, and final `credited` order are durable.
- Unknown, malformed, mismatched, partially settled, or unknown-charge states receive no success acknowledgement and never select another provider.
- `createOrder().replayed: false` is the only dispatch right for an Adapter whose compiled `repeatCreateIdempotent` capability is false.
- A non-idempotent replay that remains `created` returns the same durable order with no action and makes zero provider calls. It is unresolved, not proof of no charge.
- A replay with a durable create receipt returns the existing provider reference/action without another provider call.
- PayPal may repeat create only because its compiled Adapter capability is exactly `repeatCreateIdempotent: true`.
- The unresolved create window never triggers automatic query, retry, callback rebinding, Wallet credit, or provider fallback. Automated recovery remains outside this Risk B PR.
- XSD and ChaoJiPay reject a non-exact API origin before nested credential inspection or normalization.
- ChaoJiPay requires `redirected === false`; response metadata, body, and reader access failures collapse to `chaojipay_transport_failed` without the provider marker.
- Do not change Payment Store, Wallet, schema/migrations, Coins ledger semantics, recharge order contract, marketplace order logic, fulfillment, refunds, chargebacks, Portal/Admin UI, dependencies, or production configuration.
- Do not store, log, or emit credentials, merchant values, callback bodies, signatures, provider responses, customer identity, account balances, or SQLite rows as evidence.
- Every production-code task follows RED, observed expected failure, minimal GREEN, focused pass, and a dedicated commit.

---

## Execution Preconditions

Before Task 1, use `superpowers:using-git-worktrees` to prepare a clean implementation worktree from the post-#577 `origin/master`. Run:

```powershell
git fetch origin
git rev-parse origin/master
git merge-base --is-ancestor d2636c5e0b8cd2798fa0c92dce4679f640576c32 origin/master
git status --short --branch
```

Expected:

- `git merge-base --is-ancestor` exits `0`.
- the worktree branch is based on the observed `origin/master` identity;
- the only pre-existing follow-up commits are the approved design and plan, rebased onto that identity; and
- `git status --short` has no source or test changes.

If any expectation fails, do not adapt the plan to a stale or dirty base. Reconcile the branch identity first.

## File Map

The two provider protocol codec files are a controlled refinement of the design's expected source surface. They change only the callback envelope ceiling needed to honor the approved 16,384 raw-byte contract; callback fields, signatures, statuses, acknowledgements, and settlement semantics remain unchanged.

**Create:**

- `server/tests/platform-cny-payment-recharge-http-settlement.test.mjs` — real XSD and ChaoJiPay HTTP callback-to-Store-to-Wallet settlement, replay, failure, and acknowledgement proof using synthetic data only.

**Modify:**

- `server/services/platform/xsd-payment-runtime.mjs` — enforce the exact source-owned XSD API origin before credential scope or fetch.
- `server/services/platform/chaojipay-payment-runtime.mjs` — enforce the exact source-owned ChaoJiPay API origin before credential scope or fetch.
- `server/services/platform/xsd-payment-protocol-codec.mjs` — align the Base64 callback envelope ceiling with 16,384 raw bytes.
- `server/services/platform/chaojipay-payment-protocol-codec.mjs` — align the Base64 callback envelope ceiling with 16,384 raw bytes.
- `server/services/platform/payment-recharge-coordinator.mjs` — honor the resolved Adapter's repeat-create capability and use `createOrder().replayed` as the non-idempotent dispatch gate.
- `server/state.mjs` — derive the single-active provider, validate only its configuration, build one provider stack, and expose the safe provider enum.
- `server/app.mjs` — require a recognized provider enum for recharge routing and include all three static callback paths in the disabled boundary.
- `server/routes/portal-coin-recharge.mjs` — accept the safe provider enum, mount one static callback, preserve provider-specific raw bytes and headers, and keep the Portal order API unchanged.
- `server/tests/platform-xsd-payment-runtime.test.mjs` — exact-origin failure before credential/fetch.
- `server/tests/platform-chaojipay-payment-runtime.test.mjs` — exact-origin failure before credential/fetch.
- `server/tests/platform-xsd-payment-protocol-codec.test.mjs` — 16,384/16,385 decoded-byte envelope limits.
- `server/tests/platform-chaojipay-payment-protocol-codec.test.mjs` — 16,384/16,385 decoded-byte envelope limits.
- `server/tests/platform-payment-recharge-coordinator.test.mjs` — concurrent replay, create-receipt-loss, durable-action replay, and PayPal repeat-create compatibility.
- `server/tests/state.test.mjs` — enablement truth table, disabled getter tripwires, selected-only config reads, strict configuration validation, and one-stack startup assertions.
- `server/tests/portal-coin-recharge-routes.test.mjs` — callback path isolation, content-type/header rules, raw-byte preservation, exact body limit, URL shape, and generic errors.
- `server/tests/app-security-boundary.test.mjs` — keep Runtime, credentials, and provider configuration out of App routing.
- `server/tests/platform-payment-provider-source-boundary.test.mjs` — authorize static runtime imports only from `server/state.mjs` and retain the prohibition in routes, App, public roots, Store, Wallet, and Admin.

**Explicitly unchanged:**

- `server/services/platform/payment-provider-adapter-registry.mjs`
- `server/services/platform/payment-store.mjs`
- `server/services/platform/payment-store-migrations.mjs`
- `server/services/platform/coin-wallet-store.mjs`
- every Portal/Admin source file, dependency manifest, and production configuration file

If an implementation task requires any explicitly unchanged file, stop and return to design review rather than expanding the PR.

---

### Task 1: Assemble Exactly One Provider In Runtime State

**Files:**
- Modify: `server/state.mjs:16-25,121-197,520-535,1281-1286,1950-1952,2143-2252,2340-2348`
- Test: `server/tests/state.test.mjs:116-170,570-710`
- Modify: `server/tests/platform-payment-provider-source-boundary.test.mjs:220-245`

**Interfaces:**
- Consumes: the existing `createRuntimeState(options)` and existing provider Runtime/Registry/Coordinator APIs.
- Produces: `state.platform.paymentRechargeProvider`, whose type is exactly `"paypal_sandbox" | "xsd" | "chaojipay" | null`.
- Produces test-only dependency injection options `xsdFetchFn` and `chaojipayFetchFn`; existing `paypalFetchFn`, `paymentNowFn`, and `paymentRefFactory` remain unchanged.
- Each selected branch creates one Runtime, one `createStaticPaymentProviderAdapterRegistry(...)`, one resolved Adapter, and one `createPaymentRechargeCoordinator(...)`.
- No Registry, Adapter, Coordinator, Payment Store, Wallet, or schema signature changes.

- [x] **Step 1: Add RED enablement and disabled-read tests**

Replace the PayPal two-flag test with a table covering the top-level flag and all three provider flags:

```js
const flagCases = [
  [{}, false, null],
  [{ PLATFORM_COIN_RECHARGE_ENABLED: "true" }, "error", null],
  [{ PLATFORM_PAYPAL_SANDBOX_ENABLED: "true" }, "error", null],
  [{ PLATFORM_XSD_PAYMENT_ENABLED: "true" }, "error", null],
  [{ PLATFORM_CHAOJIPAY_PAYMENT_ENABLED: "true" }, "error", null],
  [{
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_PAYPAL_SANDBOX_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_ENABLED: "true",
  }, "error", null],
  [{
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_ENABLED: "true",
    PLATFORM_CHAOJIPAY_PAYMENT_ENABLED: "true",
  }, "error", null],
];
```

For the default-off case, extend the existing accessor tripwire list with every XSD and ChaoJiPay configuration variable from the approved design. Also define throwing accessors for `options.xsdFetchFn`, `options.chaojipayFetchFn`, `options.paymentNowFn`, and `options.paymentRefFactory`. Assert:

```js
assert.equal(state.platform.coinRechargeEnabled, false);
assert.equal(state.platform.paymentRechargeProvider, null);
assert.equal(state.platform.paymentStore, null);
assert.equal(state.platform.paymentRechargeCoordinator, null);
assert.equal(getterCalls, 0);
```

Add selected-only getter tests:

- complete PayPal config plus throwing getters for all XSD/ChaoJiPay config;
- complete XSD config plus throwing getters for PayPal and ChaoJiPay config; and
- complete ChaoJiPay config plus throwing getters for PayPal and XSD config.

Each must construct without invoking the disabled getters or provider fetch.

Create each `env` with `runtimeEnv(selectedProviderValues)` first, then attach disabled-provider accessors with `Object.defineProperty`. Do not pass accessor-bearing objects through the `runtimeEnv()` spread because spreading would itself invoke the getter before `createRuntimeState()` is under test.

- [x] **Step 2: Add RED strict-configuration and successful-assembly tests**

Add exact synthetic configuration helpers in `state.test.mjs`:

```js
function xsdRechargeEnv(overrides = {}) {
  return {
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_ENABLED: "true",
    PLATFORM_XSD_PAYMENT_METHOD: "alipay",
    PLATFORM_XSD_MERCHANT_ID: "merchant_xsd_demo",
    PLATFORM_XSD_MERCHANT_SECRET: "synthetic-xsd-secret",
    PLATFORM_XSD_MERCHANT_SCOPE_DIGEST: "b".repeat(64),
    PLATFORM_XSD_CALLBACK_URL:
      "https://portal.example.test/api/platform/payments/xsd/callback",
    PLATFORM_XSD_RETURN_URL: "https://portal.example.test/portal/wallet",
    PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON:
      JSON.stringify(["https://www.xsd8866.com"]),
    ...overrides,
  };
}

function chaoJiPayRechargeEnv(overrides = {}) {
  return {
    PLATFORM_COIN_RECHARGE_ENABLED: "true",
    PLATFORM_CHAOJIPAY_PAYMENT_ENABLED: "true",
    PLATFORM_CHAOJIPAY_MERCHANT_ID: "merchant_chao_demo",
    PLATFORM_CHAOJIPAY_MERCHANT_SECRET: "synthetic-chao-secret",
    PLATFORM_CHAOJIPAY_MERCHANT_SCOPE_DIGEST: "c".repeat(64),
    PLATFORM_CHAOJIPAY_CALLBACK_URL:
      "https://portal.example.test/api/platform/payments/chaojipay/callback",
    PLATFORM_CHAOJIPAY_ALLOWED_ACTION_ORIGINS_JSON:
      JSON.stringify(["https://cashier.example.test"]),
    PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP: "8.8.8.8",
    ...overrides,
  };
}
```

Use `prepareMigratedPaymentControlDatabase(dir)` and throwing provider fetches. For XSD, run successful cases for both `alipay` and `wechat_pay`. Assert exact state projections:

```js
assert.equal(state.platform.coinRechargeEnabled, true);
assert.equal(state.platform.paymentRechargeProvider, "xsd");
assert.deepEqual(
  state.platform.paymentRechargeCoordinator.listOffers().map((offer) => ({
    currency: offer.currency,
    paymentMethods: offer.paymentMethods,
  })),
  Array(6).fill({ currency: "CNY", paymentMethods: ["alipay"] }),
);
```

Use `"chaojipay"` and `paymentMethods: ["wechat_pay"]` for ChaoJiPay. Preserve the existing PayPal assertions and add `paymentRechargeProvider === "paypal_sandbox"`.

Add invalid tables which independently remove each required selected-provider variable and supply these malformed values:

- XSD method outside `alipay|wechat_pay`;
- callback URL with HTTP, credentials, wrong path, query, or fragment;
- missing/HTTP/credential-bearing return URL;
- action-origin JSON that is empty, has more than eight entries, duplicates an origin, or contains a path/query/fragment/credentials;
- malformed merchant scope digest;
- ChaoJiPay callback/action-origin variants with the same faults; and
- ChaoJiPay private, loopback, documentation, multicast, malformed, or missing request IP.

Every case must throw an error with `code === "coin_recharge_prerequisite_missing"`, make zero fetch calls, and leave the temporary database removable after cleanup.

- [x] **Step 3: Run state and source-boundary tests and observe RED**

Run:

```powershell
node --test server/tests/state.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected: state rejects XSD/ChaoJiPay as flag mismatches or lacks `paymentRechargeProvider`; the current source-boundary test also forbids the required Runtime imports from `server/state.mjs`.

- [x] **Step 4: Implement the fail-closed provider selector**

At the existing flag block, replace the PayPal equality rule with:

```js
const coinRechargeRequested = envFlag(env.PLATFORM_COIN_RECHARGE_ENABLED);
const requestedPaymentProviders = [
  ["paypal_sandbox", envFlag(env.PLATFORM_PAYPAL_SANDBOX_ENABLED)],
  ["xsd", envFlag(env.PLATFORM_XSD_PAYMENT_ENABLED)],
  ["chaojipay", envFlag(env.PLATFORM_CHAOJIPAY_PAYMENT_ENABLED)],
].filter(([, enabled]) => enabled).map(([provider]) => provider);

if (
  (!coinRechargeRequested && requestedPaymentProviders.length !== 0)
  || (coinRechargeRequested && requestedPaymentProviders.length !== 1)
) {
  throw coinRechargePrerequisiteError();
}

const paymentRechargeProvider = coinRechargeRequested
  ? requestedPaymentProviders[0]
  : null;
const coinRechargeEnabled = paymentRechargeProvider !== null;
```

Do not access any provider-specific configuration before this selector completes.

- [x] **Step 5: Add strict URL/origin helpers inside `state.mjs`**

Add internal helpers next to the existing env parsers. They throw `coinRechargePrerequisiteError()` and never include the rejected value in the error:

```js
function providerHttpsUrl(value, { callbackPath = null, originOnly = false } = {}) {
  const text = optionalEnvText(value);
  let parsed;
  try { parsed = new URL(text); } catch { throw coinRechargePrerequisiteError(); }
  if (
    parsed.protocol !== "https:"
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.hash !== ""
    || (callbackPath !== null && (
      parsed.pathname !== callbackPath || parsed.search !== ""
    ))
    || (originOnly && (
      text !== parsed.origin
      || parsed.pathname !== "/"
      || parsed.search !== ""
    ))
  ) throw coinRechargePrerequisiteError();
  return originOnly ? parsed.origin : parsed.toString();
}

function providerActionOrigins(value, field) {
  const items = parseJsonArrayEnv(value, field);
  if (items.length < 1 || items.length > 8) throw coinRechargePrerequisiteError();
  const origins = items.map((item) => providerHttpsUrl(item, { originOnly: true }));
  if (new Set(origins).size !== origins.length) throw coinRechargePrerequisiteError();
  return Object.freeze(origins);
}
```

For XSD return URL, call `providerHttpsUrl()` without `callbackPath` or `originOnly`; this allows an application path and query but rejects HTTP, credentials, and fragments. For callback URLs, supply the exact provider callback path, which also rejects query and fragment.

- [x] **Step 6: Build one provider-specific stack and one shared durable layer**

Add imports for both CNY Runtimes and `createProductionCnyPaymentRechargeOffers()`. Inside the existing `if (coinRechargeEnabled)` block, keep prerequisite validation first, then branch exactly once on `paymentRechargeProvider`.

The XSD branch uses these fixed bindings:

```js
const paymentMethod = optionalEnvText(env.PLATFORM_XSD_PAYMENT_METHOD);
if (paymentMethod !== "alipay" && paymentMethod !== "wechat_pay") {
  throw coinRechargePrerequisiteError();
}
const callbackUrl = providerHttpsUrl(env.PLATFORM_XSD_CALLBACK_URL, {
  callbackPath: "/api/platform/payments/xsd/callback",
});
const returnUrl = providerHttpsUrl(env.PLATFORM_XSD_RETURN_URL);
const nowFn = options.paymentNowFn || (() => new Date().toISOString());
const fetchFn = options.xsdFetchFn || globalThis.fetch?.bind(globalThis);
const runtime = createXsdPaymentRuntime({
  credential: {
    merchantId: optionalEnvText(env.PLATFORM_XSD_MERCHANT_ID),
    merchantSecret: optionalEnvText(env.PLATFORM_XSD_MERCHANT_SECRET),
    merchantScopeDigest: optionalEnvText(env.PLATFORM_XSD_MERCHANT_SCOPE_DIGEST),
  },
  fetchFn,
  apiOrigin: "https://www.xsd8866.com",
  allowedActionOrigins: providerActionOrigins(
    env.PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON,
    "PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON",
  ),
  routeMap: {
    portal_payment_callback_v1: callbackUrl,
    portal_wallet_return_v1: returnUrl,
  },
  profileRef: "xsd_production_primary",
  credentialProfileRef: "xsd_production_primary",
  nowFn,
});
```

Resolve only `xsd_v1` with this exact declaration:

```js
{
  adapterKey: "xsd_v1",
  profileRef: "xsd_production_primary",
  contractVersion: "v1",
  credentialProfileRef: "xsd_production_primary",
  declaredCapabilities: {
    createRechargeOrder: true,
    queryPayment: true,
    capturePayment: false,
    verifyCallback: true,
    refund: false,
    reconcile: false,
    repeatCreateIdempotent: false,
    repeatCaptureIdempotent: false,
  },
}
```

Decorate it with `paymentMethod` and `merchantBindingRef: "xsd_production_primary"`. These three logical refs are code-owned durable order bindings and never contain the real merchant ID.

The ChaoJiPay branch mirrors that construction with:

```js
{
  runtimeFactory: createChaoJiPayPaymentRuntime,
  fetchFn: options.chaojipayFetchFn || globalThis.fetch?.bind(globalThis),
  apiOrigin: "https://payment.chaojipay.me",
  callbackPath: "/api/platform/payments/chaojipay/callback",
  profileRef: "chaojipay_production_primary",
  credentialProfileRef: "chaojipay_production_primary",
  adapterKey: "chaojipay_v1",
  paymentMethod: "wechat_pay",
  merchantBindingRef: "chaojipay_production_primary",
  declaredCapabilities: {
    createRechargeOrder: true,
    queryPayment: false,
    capturePayment: false,
    verifyCallback: true,
    refund: false,
    reconcile: false,
    repeatCreateIdempotent: false,
    repeatCaptureIdempotent: false,
  },
}
```

Pass `createRequestIp: optionalEnvText(env.PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP)` and a route map containing only `portal_payment_callback_v1`. Let the Runtime's public-IPv4 validator fail closed.

For each CNY branch, build the catalog without mutating the source price book:

```js
const offerCatalog = createPaymentRechargeOfferCatalog({
  environment: "production",
  offers: createProductionCnyPaymentRechargeOffers().map((offer) => ({
    ...offer,
    paymentMethods: [paymentMethod],
  })),
});
```

Keep the existing PayPal branch behavior and USD offer parser unchanged. In every branch, construct a dedicated Registry from only the selected Runtime's `credentialLoader` and one transport entry. After the branch returns `{ offerCatalog, adapter, nowFn }`, create the existing Payment Store and Coordinator once using the existing `controlDbPath`, Wallet, `paymentRefFactory`, and cleanup logic.

Expose `paymentRechargeProvider` beside `coinRechargeEnabled` in `state.platform`. Runtime construction must not call provider fetch, Payment Store write methods, or Wallet write methods.

- [x] **Step 7: Narrowly update the source boundary**

Rename the current boundary test to:

```js
test("state is the only production composition root allowed to import CNY payment runtimes", async () => {
```

Read `server/state.mjs` and require these two static imports:

```js
const stateSource = await readSource("server/state.mjs");
assert.match(stateSource, /\.\/services\/platform\/xsd-payment-runtime\.mjs/u);
assert.match(stateSource, /\.\/services\/platform\/chaojipay-payment-runtime\.mjs/u);
```

Then remove only `server/state.mjs` from the production corpus and retain:

```js
await assertCorpusDoesNotMatch(
  paths.filter((path) => path !== "server/state.mjs"),
  /(?:xsd|chaojipay)-payment-runtime\.mjs/u,
  "cny_provider_runtime_outside_state_detected",
);
```

Keep `server/app.mjs`, `server/routes/portal-coin-recharge.mjs`, Payment Store, Wallet Store, root entries, and Admin/Portal sources inside that corpus. Do not add the Runtimes to `PHASE_ONE_ROOTS`; the phase-one graph intentionally forbids credential and network seams.

- [x] **Step 8: Run focused GREEN tests**

Run:

```powershell
node --test server/tests/state.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs
```

Expected: PASS; default-off reads are zero, invalid combinations fail before provider config, exactly one complete provider stack assembles without fetch, CNY offers expose one method, PayPal remains USD-compatible, and only `state.mjs` imports the CNY Runtimes.

- [x] **Step 9: Commit the state assembly**

```powershell
git add server/state.mjs server/tests/state.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
git commit -m "feat(payment): assemble single-active provider"
```

---

### Task 2: Pin Provider Runtime API Origins

**Files:**
- Modify: `server/services/platform/xsd-payment-runtime.mjs:19-55,232-273`
- Modify: `server/services/platform/chaojipay-payment-runtime.mjs:32-78,253-292`
- Modify: `server/services/platform/xsd-payment-protocol-codec.mjs:9-11,89-99`
- Modify: `server/services/platform/chaojipay-payment-protocol-codec.mjs:8-10,60-70`
- Test: `server/tests/platform-xsd-payment-runtime.test.mjs`
- Test: `server/tests/platform-chaojipay-payment-runtime.test.mjs`
- Test: `server/tests/platform-xsd-payment-protocol-codec.test.mjs`
- Test: `server/tests/platform-chaojipay-payment-protocol-codec.test.mjs`

**Interfaces:**
- Consumes: existing `createXsdPaymentRuntime({ credential, fetchFn, apiOrigin, allowedActionOrigins, routeMap, profileRef, credentialProfileRef, nowFn })` and `createChaoJiPayPaymentRuntime({ credential, fetchFn, apiOrigin, allowedActionOrigins, routeMap, profileRef, credentialProfileRef, createRequestIp, nowFn })` signatures.
- Produces: the same signatures, but `apiOrigin` accepts only the exact source constant for its provider. Rejection occurs during construction, before `credentialLoader.withCredential()` or `fetchFn()` can run. Callback envelope validation accepts at most 16,384 decoded bytes, represented by at most 21,848 canonical Base64 characters.
- No Adapter, Registry, Coordinator, or route interface changes in this task.

- [x] **Step 1: Add RED exact-origin tests**

Extend each runtime test with a credential and fetch tripwire. The XSD test uses this structure:

```js
const API_ORIGIN = "https://www.xsd8866.com";

function runtime(fetchFn, overrides = {}) {
  return createXsdPaymentRuntime({
    credential: {
      merchantId: "merchant_demo",
      merchantSecret: SECRET,
      merchantScopeDigest: MERCHANT_DIGEST,
    },
    fetchFn,
    apiOrigin: API_ORIGIN,
    allowedActionOrigins: [API_ORIGIN],
    routeMap: {
      portal_payment_callback_v1:
        "https://portal.example.test/api/payment/xsd/callback",
      portal_wallet_return_v1: "https://portal.example.test/wallet",
    },
    nowFn: () => "2026-08-02T00:00:00.000Z",
    profileRef: "xsd_profile",
    credentialProfileRef: "xsd_credential",
    ...overrides,
  });
}

test("XSD runtime accepts only the source-owned API origin before credential or fetch", async () => {
  let fetchCalls = 0;
  const fetchFn = async () => {
    fetchCalls += 1;
    throw new Error("unexpected fetch");
  };

  assert.throws(
    () => runtime(fetchFn, { apiOrigin: "https://redirect.example.test" }),
    /xsd_transport_failed/u,
  );
  assert.equal(fetchCalls, 0);

  const value = runtime(fetchFn);
  assert.equal(typeof value.credentialLoader.withCredential, "function");
  assert.equal(fetchCalls, 0);
});
```

For ChaoJiPay, change the existing test constant and use its existing `runtime(fetchFn, options = {})` helper:

```js
const API_ORIGIN = "https://payment.chaojipay.me";

test("ChaoJiPay runtime accepts only the source-owned API origin before credential or fetch", () => {
  let fetchCalls = 0;
  const fetchFn = async () => { fetchCalls += 1; throw new Error("unexpected fetch"); };
  assert.throws(
    () => runtime(fetchFn, { apiOrigin: "https://redirect.example.test" }),
    /chaojipay_transport_failed/u,
  );
  assert.equal(fetchCalls, 0);
  assert.equal(typeof runtime(fetchFn).credentialLoader.withCredential, "function");
  assert.equal(fetchCalls, 0);
});
```

Also reject exact-origin lookalikes before fetch: a subdomain, explicit port, path, query, fragment, credentials, uppercase-host textual mismatch if URL normalization changes the configured string, and the other provider's origin. Keep existing malformed-URL assertions.

In the XSD codec test, replace the existing 12,289-byte assertion with exact decoded-byte boundaries:

```js
const atLimit = Buffer.alloc(16_384, 0x61).toString("base64");
const overLimit = Buffer.alloc(16_385, 0x61).toString("base64");

assert.equal(atLimit.length, 21_848);
assert.doesNotThrow(() => encodeXsdCallbackVerificationRequest({
  ...CALLBACK_INPUT,
  bodyBase64: atLimit,
}));
assertInvalid(() => encodeXsdCallbackVerificationRequest({
  ...CALLBACK_INPUT,
  bodyBase64: overLimit,
}));
```

In the ChaoJiPay codec test, replace its 12,289-byte assertion with:

```js
const atLimit = Buffer.alloc(16_384, 0x61).toString("base64");
const overLimit = Buffer.alloc(16_385, 0x61).toString("base64");

assert.doesNotThrow(() => encodeChaoJiPayCallbackVerificationRequest({
  ...CALLBACK_INPUT,
  bodyBase64: atLimit,
}));
invalid(() => encodeChaoJiPayCallbackVerificationRequest({
  ...CALLBACK_INPUT,
  bodyBase64: overLimit,
}));
```

Use each test file's existing provider-specific callback helper and header value. This step changes only the envelope size check; the callback field/signature parser remains unchanged.

- [x] **Step 2: Run the runtime tests and observe RED**

Run:

```powershell
node --test server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-chaojipay-payment-runtime.test.mjs server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-protocol-codec.test.mjs
```

Expected: the new alternate valid HTTPS origins construct successfully on the baseline, so the exact-origin assertions fail; `fetchCalls` remains `0`.

- [x] **Step 3: Add source-owned constants and exact checks**

At module scope add:

```js
const XSD_API_ORIGIN = "https://www.xsd8866.com";
```

and:

```js
const CHAOJIPAY_API_ORIGIN = "https://payment.chaojipay.me";
```

Keep the current credential-free HTTPS origin parser, then require exact equality during construction:

```js
const apiOrigin = origin(input.apiOrigin);
if (apiOrigin !== XSD_API_ORIGIN || input.apiOrigin !== XSD_API_ORIGIN) fail();
```

Use the corresponding ChaoJiPay constant in its Runtime. Retain `redirect: "error"` and exact final-response URL checks. Do not read an environment variable inside either Runtime and do not remove `apiOrigin` from the constructor because the Registry/runtime tests already treat it as an explicit fail-closed input.

In both Runtime and protocol codec modules, replace the current Base64-character constant with decoded-byte-derived constants:

```js
const MAX_CALLBACK_BYTES = 16_384;
const MAX_CALLBACK_BASE64_CHARS = Math.ceil(MAX_CALLBACK_BYTES / 3) * 4;
```

Require both canonical Base64 round-trip and `body.length <= MAX_CALLBACK_BYTES`. In XSD, stop comparing callback bytes to `MAX_JSON_BYTES`; that constant remains only for provider JSON responses.

- [x] **Step 4: Run focused GREEN tests**

Run:

```powershell
node --test server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-chaojipay-payment-runtime.test.mjs server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-protocol-codec.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs
```

Expected: PASS; exact origins construct, every lookalike fails before credential use/fetch, and compiled capabilities remain unchanged.

- [x] **Step 5: Commit the runtime hardening**

```powershell
git add server/services/platform/xsd-payment-runtime.mjs server/services/platform/chaojipay-payment-runtime.mjs server/services/platform/xsd-payment-protocol-codec.mjs server/services/platform/chaojipay-payment-protocol-codec.mjs server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-chaojipay-payment-runtime.test.mjs server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-protocol-codec.test.mjs
git commit -m "fix(payment): pin cny provider api origins"
```

---

### Task 3: Mount One Static Provider Callback And Fail Closed Around Raw Bodies

**Files:**
- Modify: `server/app.mjs:241-280`
- Modify: `server/routes/portal-coin-recharge.mjs:1-2,40-176,178-276`
- Test: `server/tests/portal-coin-recharge-routes.test.mjs`
- Test: `server/tests/app-security-boundary.test.mjs`

**Interfaces:**
- Consumes: `state.platform.paymentRechargeProvider` and the existing Coordinator/Auth surfaces.
- Produces: `createPortalCoinRechargeRouter({ coordinator, auth, paymentRechargeProvider, nowFn })`.
- `paymentRechargeProvider` accepts only `paypal_sandbox`, `xsd`, or `chaojipay`; any other value makes the router unavailable.
- Portal offer/order/capture routes and their request/response shapes remain unchanged.
- PayPal callback keeps the current raw JSON parser, five verification headers, and `sha256(transmissionId + NUL + rawBody)` reference algorithm.
- XSD/ChaoJiPay pass one normalized content-type header and use `<provider>_callback_<sha256(rawBody)>`.

- [x] **Step 1: Add RED routing-isolation tests**

Update the route test's state helper to set the selected provider:

```js
function createState({
  enabled = true,
  paymentRechargeProvider = "paypal_sandbox",
  coordinator = createCoordinator(),
} = {}) {
  return {
    rootDir: ROOT_DIR,
    consoleToken: "console-secret",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) },
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 },
    },
    platform: {
      coinRechargeEnabled: enabled,
      paymentRechargeProvider: enabled ? paymentRechargeProvider : null,
      paymentRechargeCoordinator: enabled ? coordinator : null,
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          return { sessionRef, accountId: ACCOUNT_ID };
        },
      },
    },
  };
}
```

Add table-driven tests for all three callback paths. Prove:

- when recharge is disabled, all three paths return 404 and Coordinator calls remain empty;
- PayPal exposes only PayPal;
- XSD exposes only XSD;
- ChaoJiPay exposes only ChaoJiPay; and
- an unsupported provider enum never mounts recharge routes.

For each active callback path, send wrong method, exact path plus query, case-changed path, and trailing slash. Assert respectively 404, 400, 404, and 404 before Coordinator use. Also assert the two inactive exact callback paths return 404 rather than falling through to console authentication as 401.

Request `/api/platform/payments/xsd/query`, `/api/platform/payments/chaojipay/query`, and `/api/portal/coins/recharge/orders/payment_order_1/query`; all must return 404 with zero Coordinator calls. This locks XSD query as internal Adapter capability only and keeps ChaoJiPay query unavailable.

- [x] **Step 2: Add a raw HTTP helper and RED form-boundary tests**

Import the Node HTTP client:

```js
import { request as httpRequest } from "node:http";
```

Add this local helper so duplicate header lines are not merged by `fetch`:

```js
function rawHttpRequest(baseUrl, {
  path,
  method = "POST",
  rawHeaders = [],
  body = Buffer.alloc(0),
}) {
  const url = new URL(path, baseUrl);
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method,
      headers: [
        ...rawHeaders,
        "Content-Length", String(body.byteLength),
      ],
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
}
```

For XSD, accept exactly:

```text
application/x-www-form-urlencoded; charset=utf-8
```

For ChaoJiPay, accept exactly:

```text
application/form
application/form; charset=utf-8
application/x-www-form-urlencoded
application/x-www-form-urlencoded; charset=utf-8
```

For each CNY provider assert:

- one accepted content type forwards byte-identical `bodyBase64` and exactly one `{ name: "content-type", value: exactValue }` entry;
- missing, duplicate, or unsupported content type returns 415 with zero Coordinator calls;
- any `Content-Encoding` header, including `identity` and `gzip`, returns 415 with zero Coordinator calls;
- invalid UTF-8 bytes return 400 with zero Coordinator calls;
- a 16,384-byte Buffer reaches the mock Coordinator exactly once and is byte-identical after Base64 decode; and
- a 16,385-byte Buffer returns a stable generic 413 and never reaches the Coordinator.

Assert the CNY callback reference exactly:

```js
const digest = createHash("sha256").update(body).digest("hex");
assert.equal(callback.callbackRequestRef, `${provider}_callback_${digest}`);
```

Keep the existing PayPal raw-byte test unchanged and explicitly reassert its reference includes the transmission ID rather than using the CNY algorithm.

- [x] **Step 3: Run route/security tests and observe RED**

Run:

```powershell
node --test server/tests/portal-coin-recharge-routes.test.mjs server/tests/app-security-boundary.test.mjs
```

Expected: CNY paths are absent, inactive callbacks can fall into authentication instead of 404, the router does not accept `paymentRechargeProvider`, and no stable 16,384/16,385 parser boundary exists.

- [x] **Step 4: Add the safe enum to App routing and an early 404 boundary**

In `portalCoinRechargeRoutesEnabled(state)`, require:

```js
const provider = ownEnumerableDataValue(platform, "paymentRechargeProvider");
if (!["paypal_sandbox", "xsd", "chaojipay"].includes(provider)) return false;
```

Pass it to the router as `paymentRechargeProvider`. After the selected router and before any console/auth middleware, install one callback fallback. The selected router gets first chance to handle its exact path; every other recognized or case/trailing-slash variant is then 404:

```js
const PAYMENT_CALLBACK_PATHS = Object.freeze([
  "/api/platform/payments/paypal/callback",
  "/api/platform/payments/xsd/callback",
  "/api/platform/payments/chaojipay/callback",
]);

function resemblesKnownPaymentCallback(pathname) {
  const withoutTrailingSlash = pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  const normalized = withoutTrailingSlash.toLowerCase();
  return PAYMENT_CALLBACK_PATHS.includes(normalized);
}
```

Use the query-free pathname already derived from `req.originalUrl`. Return an empty 404 for `resemblesKnownPaymentCallback(pathname)`. When recharge is disabled, retain the existing 404 boundary for `/api/portal/coins/recharge` and its children. Do not read Runtime, credential, merchant, or provider-specific environment fields in `app.mjs`.

- [x] **Step 5: Add fixed callback descriptors and safe raw middleware**

In `portal-coin-recharge.mjs`, add a frozen source table:

```js
const CALLBACKS = Object.freeze({
  paypal_sandbox: Object.freeze({
    path: "/api/platform/payments/paypal/callback",
    prefix: "paypal_callback",
  }),
  xsd: Object.freeze({
    path: "/api/platform/payments/xsd/callback",
    prefix: "xsd_callback",
    contentTypes: Object.freeze([
      "application/x-www-form-urlencoded; charset=utf-8",
    ]),
  }),
  chaojipay: Object.freeze({
    path: "/api/platform/payments/chaojipay/callback",
    prefix: "chaojipay_callback",
    contentTypes: Object.freeze([
      "application/form",
      "application/form; charset=utf-8",
      "application/x-www-form-urlencoded",
      "application/x-www-form-urlencoded; charset=utf-8",
    ]),
  }),
});
```

Snapshot and validate `paymentRechargeProvider` at router construction. Extend `isSelectedRoute(method, pathname, callbackPath)` so only `POST` plus the selected exact path enters the callback router; leave every Portal route expression unchanged.

Add CNY middleware with stable errors:

```js
const formRawBody = raw({
  limit: 16_384,
  inflate: false,
  type: () => true,
});

function parseFormRawBody(req, res, next) {
  formRawBody(req, res, (error) => {
    if (!error) { next(); return; }
    if (error?.type === "entity.too.large") {
      sendError(res, 413, "payment_recharge_body_too_large");
      return;
    }
    sendError(res, 400, "payment_recharge_request_invalid");
  });
}
```

Before this parser:

- use `readRawHeader(req, "content-type")` and the selected exact allowlist;
- reject any raw `content-encoding` header by scanning `req.rawHeaders`; and
- treat missing and duplicate content type identically as 415.

After parsing, require `Buffer.isBuffer(req.body)` and validate UTF-8 without changing the Buffer:

```js
new TextDecoder("utf-8", { fatal: true }).decode(req.body);
```

Catch decoding failure as `payment_recharge_request_invalid` with status 400.

- [x] **Step 6: Register one provider-specific callback handler**

Keep the PayPal handler and helper names provider-specific:

```js
function paypalCallbackReference(transmissionId, body) {
  const digest = createHash("sha256")
    .update(transmissionId, "utf8")
    .update("\0", "utf8")
    .update(body)
    .digest("hex");
  return `paypal_callback_${digest}`;
}
```

For XSD and ChaoJiPay use:

```js
function cnyCallbackReference(prefix, body) {
  return `${prefix}_${createHash("sha256").update(body).digest("hex")}`;
}
```

Register `router.post(callback.path, ...)` only for the selected descriptor. The CNY handler sends this exact input:

```js
const result = await coordinator.acceptProviderCallback({
  callbackRequestRef: cnyCallbackReference(callback.prefix, req.body),
  receivedAt,
  bodyBase64: req.body.toString("base64"),
  headerEntries: [Object.freeze({
    name: "content-type",
    value: exactContentType,
  })],
});
```

Use the existing ISO timestamp check and acknowledgement projection. A Coordinator error remains generic retryable 503 and never emits `SUCCESS` or `success`.

- [x] **Step 7: Strengthen the App source boundary**

Extend `app-security-boundary.test.mjs`:

```js
assert.match(source, /paymentRechargeProvider/u);
assert.doesNotMatch(
  source,
  /create(?:Xsd|ChaoJiPay)PaymentRuntime|merchantSecret|credentialLoader|PLATFORM_XSD_|PLATFORM_CHAOJIPAY_/u,
);
```

Assert the three callback paths are present only as static literals in the selected recharge route and App's pre-auth fallback. Do not permit dynamic import, provider Runtime import, or credential module import in App or the route.

- [x] **Step 8: Run focused GREEN tests**

Run:

```powershell
node --test server/tests/portal-coin-recharge-routes.test.mjs server/tests/app-security-boundary.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected: PASS; only one exact callback is reachable, inactive/case/trailing/method variants are 404, selected query is 400, content and encoding faults stop before Coordinator, 16,384 bytes are preserved, 16,385 bytes receive generic 413, and no Runtime/credential surface reaches App or route.

- [x] **Step 9: Commit the HTTP boundary**

```powershell
git add server/app.mjs server/routes/portal-coin-recharge.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/app-security-boundary.test.mjs
git commit -m "feat(payment): route single-active callbacks"
```

---

### Task 4: Prove Real CNY Callback Settlement And Crash Recovery

**Files:**
- Create: `server/tests/platform-cny-payment-recharge-http-settlement.test.mjs`
- Read-only regression: `server/services/platform/payment-recharge-coordinator.mjs`
- Read-only regression: `server/services/platform/payment-store.mjs`
- Read-only regression: `server/services/platform/coin-wallet-store.mjs`

**Interfaces:**
- Consumes: real XSD/ChaoJiPay Runtime, dedicated Registry, resolved/decorated Adapter, production CNY Offer Catalog, Payment Store, Coin Wallet Store, Coordinator, `createApp()`, and loopback HTTP.
- Produces: synthetic integration evidence only; no exported production API.
- Uses one in-memory SQLite connection shared by Payment Store and Wallet after applying the existing migrations.
- Uses `coins_30`, amount `3000` minor CNY units, and exactly `30 paid_coins`.
- Uses no merchant file, external network, public callback, production endpoint, or real account.

- [x] **Step 1: Build the real synthetic harness in a new test file**

Import exactly these production components:

```js
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Database from "better-sqlite3";

import { createApp } from "../app.mjs";
import { applyCoinWalletMigrations, COIN_WALLET_MIGRATIONS,
  REQUIRED_COIN_WALLET_MIGRATION_ID } from
  "../services/platform/coin-wallet-migrations.mjs";
import { createSqliteCoinWalletStore } from
  "../services/platform/coin-wallet-store.mjs";
import { createChaoJiPayPaymentRuntime } from
  "../services/platform/chaojipay-payment-runtime.mjs";
import { createPaymentRechargeCoordinator } from
  "../services/platform/payment-recharge-coordinator.mjs";
import { createPaymentRechargeOfferCatalog } from
  "../services/platform/payment-recharge-offer-catalog.mjs";
import { createStaticPaymentProviderAdapterRegistry } from
  "../services/platform/payment-provider-adapter-registry.mjs";
import { applyPaymentStoreMigrations } from
  "../services/platform/payment-store-migrations.mjs";
import { createSqlitePaymentStore } from
  "../services/platform/payment-store.mjs";
import { createProductionCnyPaymentRechargeOffers } from
  "../services/platform/production-cny-payment-recharge-price-book.mjs";
import { createXsdPaymentRuntime } from
  "../services/platform/xsd-payment-runtime.mjs";
import { listen } from "./helpers/listen.mjs";
```

Define deterministic time/reference helpers:

```js
const NOW = "2026-08-03T00:00:00.000Z";
const ACCOUNT_ID = "account_cny_recharge_1";
const SESSION_REF = "session_cny_recharge_1";

function refFactory(prefix) {
  const counts = new Map();
  return (kind) => {
    const next = (counts.get(kind) ?? 0) + 1;
    counts.set(kind, next);
    return `${prefix}_${kind}_${next}`;
  };
}
```

Create the shared database exactly as the existing Coordinator tests do: enable foreign keys; create and seed one active `platform_accounts` row; apply the current Coin Wallet migration with its required ID/checksum; then apply `applyPaymentStoreMigrations({ database, nowFn: () => NOW })`.

Use this complete setup rather than a copied database fixture:

```js
function createDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = on");
  database.exec(`
    create table platform_accounts (
      id text primary key,
      owner_ref text not null,
      status text not null check (status in ('active', 'suspended', 'disabled')),
      created_at text not null,
      updated_at text not null,
      metadata_json text not null default '{}'
    );
    insert into platform_accounts (
      id, owner_ref, status, created_at, updated_at, metadata_json
    ) values (
      '${ACCOUNT_ID}', 'owner_cny_recharge_1', 'active',
      '${NOW}', '${NOW}', '{}'
    );
  `);
  applyCoinWalletMigrations({
    database,
    expectedMigrationId: REQUIRED_COIN_WALLET_MIGRATION_ID,
    expectedDdlChecksum: COIN_WALLET_MIGRATIONS[0].ddlChecksum,
    nowFn: () => new Date(NOW),
  });
  applyPaymentStoreMigrations({ database, nowFn: () => NOW });
  return database;
}
```

Build `createSystem(providerCase, { failWalletOnce = false, failCloseOnce = false } = {})` with:

- one `createSqliteCoinWalletStore({ database, nowFn: () => new Date(NOW), refFactory })`;
- one `createSqlitePaymentStore({ database, nowFn: () => NOW, refFactory })`;
- a fail-once `creditCoins` wrapper only when `failWalletOnce` is true;
- a fail-once `markOrderCredited` wrapper only when `failCloseOnce` is true;
- one catalog created from `createProductionCnyPaymentRechargeOffers()`, cloning every offer to `paymentMethods: [providerCase.paymentMethod]`;
- one Runtime and dedicated Registry from the provider case;
- one resolved Adapter decorated with the provider case's fixed method and merchant binding;
- one Coordinator with the exact six constructor fields; and
- one `createApp()` state with the selected provider enum, Coordinator, and a synthetic session auth returning `ACCOUNT_ID`.

The App state is exact and contains no Wallet/Store shortcut:

```js
function appState(provider, coordinator) {
  return {
    rootDir: new URL("../../", import.meta.url).pathname,
    consoleToken: "console-synthetic",
    proxyConfig: { servers: [], pingHosts: [], nginx: {} },
    services: {
      ssLocal: { status: () => ({ running: false }) },
      httpProxy: { status: () => ({ running: false }) },
    },
    subscriptions: {},
    security: {
      adminAllowedCidrs: ["127.0.0.1/32"],
      subRateLimit: { windowMs: 60_000, max: 30 },
    },
    platform: {
      coinRechargeEnabled: true,
      paymentRechargeProvider: provider,
      paymentRechargeCoordinator: coordinator,
      userPortalRoutesEnabled: true,
      userPortalAuth: {
        requireSession({ sessionRef }) {
          assert.equal(sessionRef, SESSION_REF);
          return { sessionRef, accountId: ACCOUNT_ID };
        },
      },
    },
  };
}
```

The fail-once wrappers preserve every other own method:

```js
const coordinatorWallet = Object.freeze({
  ...walletStore,
  creditCoins(input) {
    if (shouldFailWallet) {
      shouldFailWallet = false;
      throw new Error("injected_wallet_failure");
    }
    return walletStore.creditCoins(input);
  },
});
```

Use the same shape for `markOrderCredited`. Close the HTTP server, both stores, and the database in `finally` blocks.

- [x] **Step 2: Define exact XSD and ChaoJiPay provider cases**

Use these durable logical bindings and synthetic secrets:

```js
const PROVIDERS = Object.freeze([
  Object.freeze({
    provider: "xsd",
    adapterKey: "xsd_v1",
    profileRef: "xsd_production_primary",
    credentialProfileRef: "xsd_production_primary",
    merchantBindingRef: "xsd_production_primary",
    paymentMethod: "alipay",
    callbackPath: "/api/platform/payments/xsd/callback",
    contentType: "application/x-www-form-urlencoded; charset=utf-8",
    acknowledgementBody: "SUCCESS",
  }),
  Object.freeze({
    provider: "chaojipay",
    adapterKey: "chaojipay_v1",
    profileRef: "chaojipay_production_primary",
    credentialProfileRef: "chaojipay_production_primary",
    merchantBindingRef: "chaojipay_production_primary",
    paymentMethod: "wechat_pay",
    callbackPath: "/api/platform/payments/chaojipay/callback",
    contentType: "application/x-www-form-urlencoded; charset=utf-8",
    acknowledgementBody: "success",
  }),
]);
```

For XSD, construct the Runtime with exact source origin, callback/return route refs, action origin `https://www.xsd8866.com`, and an injected fetch which accepts only `/api/gaia/unifiedorder` and returns:

```js
{ code: "200", error: "请求成功", datas: { code_url: "https://www.xsd8866.com/pay/synthetic" } }
```

For ChaoJiPay, accept only `/api/order/create`, use public synthetic request IP `8.8.8.8`, and return:

```js
{ data: { payUrl: "https://cashier.example.test/pay/synthetic" } }
```

Wrap each JSON body in the same bounded `Response` projection used by the existing Runtime tests, including `redirected: false` and an exact final `url` equal to the request URL.

Use this response helper:

```js
function providerJsonResponse(url, body) {
  const standard = new Response(JSON.stringify(body), { status: 200 });
  return Object.freeze({
    status: standard.status,
    headers: standard.headers,
    body: standard.body,
    redirected: false,
    url,
  });
}
```

Resolve XSD with create/query/verify enabled and every other capability false. Resolve ChaoJiPay with create/verify enabled and every other capability false. Assert the resolved Adapter's `adapterKey` and `supportedPaymentMethods` before decorating it.

Define exact callback signing helpers. XSD:

```js
function signXsd(fields, secret) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== "sign" && key !== "format" && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("&");
  return createHash("md5").update(`${canonical}${secret}`, "utf8").digest("hex");
}
```

ChaoJiPay:

```js
function signChaoJiPay(fields, secret) {
  const canonical = Object.keys(fields)
    .filter((key) => key !== "sign" && fields[key] !== "")
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("&");
  return createHash("md5")
    .update(`${canonical}&key=${secret}`, "utf8")
    .digest("hex")
    .toUpperCase();
}
```

Generate XSD success fields from the real created order:

```js
{
  mch_order_no: orderRef,
  partnerorderid: "xsd_capture_synthetic_1",
  status: "1",
  mchId: "merchant_xsd_demo",
  amount: "30.00",
}
```

Generate ChaoJiPay success fields:

```js
{
  orderId: "chao_capture_synthetic_1",
  orderStatus: "1",
  outTradeId: orderRef,
  amount: "30.00",
}
```

Append the matching signature, then encode with `new URLSearchParams(fields).toString()` without re-encoding it after the HTTP body is built.

- [x] **Step 3: Add real signed success and duplicate-replay tests**

For each provider:

1. start the loopback App;
2. POST `/api/portal/coins/recharge/orders` with session header and exactly `{ "offerRef": "coins_30", "idempotencyKey": "create_cny_1" }`;
3. read the real `orderRef` from the 201 response;
4. POST the signed raw form to the provider's selected callback;
5. send the byte-identical callback a second time; and
6. assert both callback responses are HTTP 200 with the provider's exact acknowledgement body.

Query exact durable facts:

```js
assert.equal(database.prepare(`
  select count(*) as count
    from platform_payment_receipts
   where receipt_type = 'callback'
     and verification_result = 'verified'
`).get().count, 1);
assert.equal(database.prepare(`
  select count(*) as count from platform_coin_operation_receipts
`).get().count, 1);
assert.equal(database.prepare(`
  select count(*) as count
    from platform_coin_lots
   where coin_type = 'paid_coins'
`).get().count, 1);
assert.equal(database.prepare(`
  select count(*) as count from platform_coin_credit_origins
`).get().count, 1);
```

Read the payment order and assert `status === "credited"`, `wallet_operation_ref` and `wallet_lot_ref` are non-null, and:

```js
assert.equal(
  walletStore.getWalletProjection({ accountId: ACCOUNT_ID }).totals.paid_coins,
  30,
);
```

Capture receipt/operation/lot/credit-origin refs after the first callback and prove the second callback leaves all four arrays byte-for-byte equal.

- [x] **Step 4: Add non-settlement, rejection, and Wallet-failure tests**

For signed non-settlement, use XSD status `-1` and ChaoJiPay status `0`, recompute the signature, and assert HTTP 200 with the documented acknowledgement, zero verified callback receipts, zero Wallet operation receipts, zero paid lots, and zero paid balance.

For each provider, independently test:

- corrupt one signature character;
- replace the real payment order reference with another safe reference and recompute a valid signature; and
- change amount to `31.00` and recompute a valid signature.

For XSD also replace `mchId` with `merchant_other` and recompute a valid signature. Every case returns generic retryable 503, contains no signature/merchant/order/internal error text, leaves zero verified callback receipts, and leaves zero paid Coins.

Run the existing Coordinator regression in the same focused command to retain zero-Coin coverage for adapter/provider, payment method, merchant binding, currency, exponent, terminal state, and unknown-charge mismatches which are not all represented in both provider callback bodies.

With `failWalletOnce: true`, the first signed success must return generic 503 with one verified callback receipt and zero Wallet lots; the byte-identical retry must return the exact success acknowledgement, close the same order as credited, and leave exactly one operation, one lot, and one credit origin.

- [x] **Step 5: Add post-credit close-failure recovery proof**

With `failCloseOnce: true`:

- first signed callback returns generic 503 and no provider success body;
- one verified callback receipt, Wallet operation, paid lot, and credit origin already exist;
- the order is not yet `credited`;
- byte-identical retry returns provider success;
- the order becomes `credited`; and
- the saved receipt, operation, lot, and credit-origin refs and counts remain unchanged.

This is the exact proof that acknowledgement follows durable order close and that replay reuses the original settlement identity rather than minting another lot.

- [x] **Step 6: Run the real integration and durable regressions**

Run:

```powershell
node --test server/tests/platform-cny-payment-recharge-http-settlement.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-coin-wallet-store.test.mjs
```

Expected: PASS for both providers, with exact acknowledgements only after durable completion and exactly one verified callback receipt, Wallet operation, paid lot, and credit origin after any replay.

If this test requires a Payment Store, Wallet, schema/migration, or Adapter protocol change, stop. The final review did require one narrow Coordinator semantic change; that exception returned to design and was approved in `docs/superpowers/specs/2026-08-03-cny-payment-provider-single-active-assembly-design.md`. No other Coordinator expansion is authorized.

- [x] **Step 7: Commit the full-stack evidence**

```powershell
git add server/tests/platform-cny-payment-recharge-http-settlement.test.mjs
git commit -m "test(payment): prove cny callback settlement"
```

---

### Task 5: Close Final-Review Create-Dispatch And Runtime Gaps

This task is the single final-review fix wave required by
`superpowers:subagent-driven-development`. It carries the complete blocking
finding list. After it, run exactly one scoped re-review; do not start a second
fix wave.

**Files:**

- Modify: `server/services/platform/payment-recharge-coordinator.mjs:98-130,253-293`
- Test: `server/tests/platform-payment-recharge-coordinator.test.mjs:119-321`
- Modify: `server/services/platform/xsd-payment-runtime.mjs:234-243`
- Test: `server/tests/platform-xsd-payment-runtime.test.mjs:25-65`
- Modify: `server/services/platform/chaojipay-payment-runtime.mjs:177-213,254-265`
- Test: `server/tests/platform-chaojipay-payment-runtime.test.mjs:47-150,178-236`
- Modify: `docs/superpowers/specs/2026-08-03-cny-payment-provider-single-active-assembly-design.md`
- Modify: `docs/superpowers/plans/2026-08-03-cny-payment-provider-single-active-assembly.md`

**Interfaces:**

- Consumes: `store.createOrder(input) -> { order, replayed }`, where
  `replayed: false` is granted to exactly one account/idempotency-key claim.
- Consumes: `adapter.capabilities.repeatCreateIdempotent: boolean`, already
  normalized by the compiled Adapter contract and Registry.
- Produces: the existing `createRechargeOrder(value) -> { order, wallet,
  replayed? }` result without changing the Portal HTTP order projection.
- Produces: exact-origin rejection before credential inspection and a generic
  ChaoJiPay response failure boundary.
- Does not produce: Store/schema fields, retry leases, provider fallback,
  automatic query/reconciliation, callback rebinding, or Portal behavior.

- [x] **Step 1: Add RED Coordinator tests for the durable dispatch claim**

Extend the existing `createAdapter()` test helper with a real capability and an
injectable create function:

```js
function createAdapter({
  repeatCreateIdempotent = true,
  createRechargeOrderFn = null,
  callbackFactOverrides = {},
  callbackFactOverridesSequence = [],
  callbackDisposition = "settle",
  capturePaymentFact = "default",
  adapterKey = "paypal_v1",
  paymentMethod = "paypal",
  merchantBindingRef = "paypal_sandbox_primary",
  captureInputs = [],
  acknowledgementCalls = [],
} = {}) {
  return Object.freeze({
    adapterKey,
    paymentMethod,
    merchantBindingRef,
    capabilities: Object.freeze({ repeatCreateIdempotent }),
    async createRechargeOrder(input) {
      if (createRechargeOrderFn) return createRechargeOrderFn(input);
      return {
        providerOrderRef: "paypal_order_1",
        status: "entry_ready",
        chargeCertainty: "possibly_charged",
        nextAction: {
          type: "redirect",
          url: "https://www.sandbox.paypal.com/checkoutnow?token=safe",
          expiresAt: EXPIRES_AT,
        },
        occurredAt: NOW,
      };
    },
  });
}
```

Add the `capabilities` property and injectable branch to the existing helper;
do not delete or otherwise change its existing capture, callback, error, and
acknowledgement methods.

Allow `createSystem()` to pass `adapterOptions` and to wrap only
`recordOperationReceipt()` with `failCreateReceiptOnce`. Keep the real SQLite
Payment Store and Wallet; the wrapper must delegate every non-injected call.

Add a concurrency test whose first provider call waits on a controlled Promise
and whose second provider call throws `duplicate_provider_dispatch`. Start the
first Coordinator call, wait until it enters the provider, then invoke the same
account/offer/idempotency key again. The desired assertions are literal:

```js
assert.equal(replay.order.orderRef, firstOrderRef);
assert.equal(replay.order.status, "created");
assert.equal(replay.order.nextAction, null);
assert.equal(replay.replayed, true);
assert.equal(providerCalls, 1);
```

Release the first provider call in `finally`, await it, then call the
Coordinator a third time and assert the durable `entry_ready` order and exact
redirect action are returned while `providerCalls` remains `1`.

Add a create-receipt-loss test with `repeatCreateIdempotent: false` and
`failCreateReceiptOnce: true`:

```js
await assert.rejects(() => firstCreate, /injected_create_receipt_failure/u);
const replay = await createRechargeOrder(system.coordinator);
assert.equal(replay.order.status, "created");
assert.equal(replay.order.providerOrderRef, null);
assert.equal(replay.order.nextAction, null);
assert.equal(replay.replayed, true);
assert.equal(providerCalls, 1);
assert.equal(database.prepare(
  "select count(*) as count from platform_payment_receipts where receipt_type = 'create'",
).get().count, 0);
```

Add a PayPal compatibility test with `repeatCreateIdempotent: true` and the same
one-time receipt failure. The second call must dispatch the same deterministic
`providerRequestRef`, persist the receipt, and return `entry_ready`; a third
call returns the saved action without dispatch. Assert provider call counts
`1`, `2`, and `2` at the three boundaries.

- [x] **Step 2: Run the Coordinator tests and observe RED**

Run:

```powershell
node --test server/tests/platform-payment-recharge-coordinator.test.mjs
```

Expected RED evidence:

- the non-idempotent concurrent replay reaches
  `duplicate_provider_dispatch`, or provider call count becomes `2`;
- the receipt-loss replay calls the provider a second time instead of returning
  the unresolved durable order.

Do not edit production code until these failures have been observed and copied
to the task report.

- [x] **Step 3: Implement the minimal capability-aware Coordinator gate**

At construction, extend the existing validation condition with this exact
clause, then snapshot the capability immediately after the validation block:

```js
|| typeof adapter.capabilities?.repeatCreateIdempotent !== "boolean"
```

```js
const repeatCreateIdempotent = adapter.capabilities.repeatCreateIdempotent;
```

Immediately after the existing terminal/status replay return, add only this
dispatch gate:

```js
if (created.order.status !== "created") return publicResult(created.order);
if (created.replayed && !repeatCreateIdempotent) {
  return publicResult(created.order, null, { replayed: true });
}
```

Do not mark the order failed, expired, verified, or reconciliation-required.
Do not query a provider, synthesize a receipt/action, change the Store, or add a
fallback.

- [x] **Step 4: Run the Coordinator tests and observe GREEN**

Run:

```powershell
node --test server/tests/platform-payment-recharge-coordinator.test.mjs
```

Expected: all Coordinator tests pass; the new non-idempotent cases observe one
provider call, and the PayPal compatibility case observes two calls only until
the durable receipt exists.

- [x] **Step 5: Add RED Runtime tests for credential order and hostile responses**

In each Runtime test file, add a test with `{ concurrency: false }` using this
exact inspection pattern around its existing `runtime()` helper. Use
`https://wrong.example.test` as the origin and the provider's existing generic
transport error in `assert.throws`:

```js
const credential = {
  merchantId: "merchant_demo",
  merchantSecret: SECRET,
  merchantScopeDigest: MERCHANT_DIGEST,
};
const original = Object.getOwnPropertyDescriptor(Object, "getOwnPropertyDescriptors");
let credentialDescriptorReads = 0;
let fetchCalls = 0;
Object.defineProperty(Object, "getOwnPropertyDescriptors", {
  ...original,
  value(value) {
    if (value === credential) credentialDescriptorReads += 1;
    return original.value(value);
  },
});
try {
  assert.throws(() => runtime(async () => {
    fetchCalls += 1;
    throw new Error("must_not_fetch");
  }, {
    apiOrigin: "https://wrong.example.test",
    credential,
  }), /_transport_failed/u);
} finally {
  Object.defineProperty(Object, "getOwnPropertyDescriptors", original);
}
```

Assert both literals:

```js
assert.equal(credentialDescriptorReads, 0);
assert.equal(fetchCalls, 0);
```

The current implementation must fail this test with
`credentialDescriptorReads === 1`.

In the ChaoJiPay Runtime tests, create a valid 200 response with no
`redirected` own property and assert exact rejection
`chaojipay_transport_failed`. Add hostile objects whose `status` getter, `body`
getter, and `body.getReader()` respectively throw
`synthetic-sensitive-response-marker`. For every case, assert:

```js
await assert.rejects(operation, (error) => {
  assert.equal(error.message, "chaojipay_transport_failed");
  assert.equal(String(error).includes("synthetic-sensitive-response-marker"), false);
  return true;
});
```

- [x] **Step 6: Run the Runtime tests and observe RED**

Run:

```powershell
node --test `
  server/tests/platform-xsd-payment-runtime.test.mjs `
  server/tests/platform-chaojipay-payment-runtime.test.mjs
```

Expected RED evidence:

- each wrong-origin constructor inspects its credential once;
- the ChaoJiPay response without `redirected` is accepted; and
- at least the hostile `status` or `getReader()` marker escapes instead of the
  generic transport error.

- [x] **Step 7: Implement exact-origin-first and generic ChaoJiPay response reads**

In the XSD Runtime constructor, keep the outer `snapshot()` first, then use
this exact order before profile, function, allowlist, or route-map
normalization:

```js
const input = snapshot(value, [
  "credential", "fetchFn", "apiOrigin", "allowedActionOrigins", "routeMap",
  "profileRef", "credentialProfileRef", "nowFn",
]);
const apiOrigin = origin(input.apiOrigin);
if (apiOrigin !== XSD_API_ORIGIN || input.apiOrigin !== XSD_API_ORIGIN) fail();
const currentCredential = credential(input.credential);
```

Apply the corresponding exact order in ChaoJiPay:

```js
const input = snapshot(value, [
  "credential", "fetchFn", "apiOrigin", "allowedActionOrigins", "routeMap",
  "profileRef", "credentialProfileRef", "createRequestIp", "nowFn",
]);
const apiOrigin = origin(input.apiOrigin);
if (apiOrigin !== CHAOJIPAY_API_ORIGIN || input.apiOrigin !== CHAOJIPAY_API_ORIGIN) fail();
const currentCredential = credential(input.credential);
```

For ChaoJiPay `responseText()`, read response metadata, body, and reader once
inside one genericizing `try` and require explicit non-redirection:

```js
let status;
let reader;
try {
  if (response === null || typeof response !== "object") fail();
  status = response.status;
  if (!Number.isSafeInteger(status) || response.redirected !== false) fail();
  if (typeof response.url !== "string" || response.url !== requestUrl) fail();
  const declaredLength = response.headers?.get?.("content-length");
  if (
    declaredLength !== null
    && declaredLength !== undefined
    && (!/^(?:0|[1-9]\\d*)$/u.test(declaredLength)
      || Number(declaredLength) > MAX_JSON_BYTES)
  ) fail();
  if (status < 200 || status > 299) fail();
  const body = response.body;
  if (body === null || typeof body?.getReader !== "function") fail();
  reader = body.getReader();
} catch {
  fail();
}
```

Retain the existing bounded stream loop, cancellation, release, fatal UTF-8,
and JSON parsing behavior unchanged.

- [x] **Step 8: Run focused GREEN and regression tests**

Run:

```powershell
node --test `
  server/tests/platform-payment-recharge-coordinator.test.mjs `
  server/tests/platform-xsd-payment-runtime.test.mjs `
  server/tests/platform-chaojipay-payment-runtime.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-cny-payment-recharge-http-settlement.test.mjs `
  server/tests/portal-coin-recharge-routes.test.mjs
```

Expected: all tests pass with synthetic inputs, zero external provider calls,
and no Store/schema/Wallet/Portal source changes.

- [x] **Step 9: Update source-only status and commit the complete fix wave**

Set the design status to `Implemented source-only; scoped re-review and
exact-head validation pending`. In this plan, check every completed Task 5 step
and append the actual RED/GREEN command results and commit identity to the
implementation-status paragraph. Keep `production_state: not_deployed` and do
not claim activation or deployment.

Run:

```powershell
git diff --check
git diff --name-only acb41449a483e47d02b71dc357d265c056076aa0...HEAD
git status --short --branch
git add `
  server/services/platform/payment-recharge-coordinator.mjs `
  server/tests/platform-payment-recharge-coordinator.test.mjs `
  server/services/platform/xsd-payment-runtime.mjs `
  server/tests/platform-xsd-payment-runtime.test.mjs `
  server/services/platform/chaojipay-payment-runtime.mjs `
  server/tests/platform-chaojipay-payment-runtime.test.mjs `
  docs/superpowers/specs/2026-08-03-cny-payment-provider-single-active-assembly-design.md `
  docs/superpowers/plans/2026-08-03-cny-payment-provider-single-active-assembly.md
git commit -m "fix(payment): close provider assembly review gaps"
```

Expected: the fix range contains only the eight listed files; no Store,
migration, Wallet, Portal/Admin, dependency, or production configuration file
is modified.

---

## Final Validation And Review

After every task's implementation review and spec-compliance review is clean, first verify the changed-file boundary:

```powershell
git diff --name-only origin/master...HEAD
```

The output may contain only the approved design/plan and files listed in this plan's **Create** or **Modify** sections. It must not contain Payment Store, Wallet, migration/schema, Portal/Admin, dependency, production configuration, deployment, or credential files.

Run the complete focused server matrix:

```powershell
node --test `
  server/tests/state.test.mjs `
  server/tests/portal-coin-recharge-routes.test.mjs `
  server/tests/app-security-boundary.test.mjs `
  server/tests/platform-payment-provider-source-boundary.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-xsd-payment-runtime.test.mjs `
  server/tests/platform-chaojipay-payment-runtime.test.mjs `
  server/tests/platform-xsd-payment-protocol-codec.test.mjs `
  server/tests/platform-chaojipay-payment-protocol-codec.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs `
  server/tests/platform-chaojipay-payment-adapter.test.mjs `
  server/tests/platform-production-cny-payment-recharge-price-book.test.mjs `
  server/tests/platform-cny-payment-recharge-http-settlement.test.mjs `
  server/tests/platform-payment-recharge-coordinator.test.mjs `
  server/tests/platform-payment-store.test.mjs `
  server/tests/platform-coin-wallet-store.test.mjs
```

Then run the repository-required validation without skipping frontend regressions:

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
git diff --check origin/master...HEAD
git status --short --branch
```

All commands must pass on the same exact head. A prior baseline, task-local pass, CI result from PR #577, or pass from another commit is not final evidence.

Required final assertions:

- recharge is inert by default and all provider-specific configuration/factory/network getter counts are zero;
- top-level/provider mismatch and multiple selection fail startup;
- one complete configuration assembles exactly one provider stack and makes zero startup provider calls;
- PayPal retains USD Sandbox behavior and only its callback path;
- XSD binds one configured method and only its callback path;
- ChaoJiPay binds WeChat and only its callback path;
- inactive callback paths and case/method/trailing variants are 404 before authentication;
- selected callback query is 400; content/encoding faults are 400/415; 16,385 bytes is generic 413;
- provider API origins cannot be redirected by environment or URL lookalikes and reject before nested credential inspection;
- missing or hostile ChaoJiPay response metadata/accessors produce only `chaojipay_transport_failed`;
- concurrent and receipt-loss replay dispatch a non-idempotent provider create at most once and return the same unresolved durable order;
- a saved create receipt/action replays without another provider call, while PayPal retains capability-authorized deterministic create retry;
- real signed XSD and ChaoJiPay callbacks settle exactly one `paid_coins` lot;
- duplicate, Wallet-failure retry, and post-credit close-failure retry reuse the same verified receipt, Wallet operation, lot, and credit origin;
- signed non-settlement status acknowledges with zero Wallet writes;
- malformed, bad-signature, order/money/binding mismatch, terminal, or unknown-charge states mint zero Coins and receive no success acknowledgement;
- App and route import no Runtime or credential module; `state.mjs` is the sole application composition root; and
- no provider network, credential file, public ingress, production host, or real-money action was used.

The PR body must record:

```yaml
risk: B
release_unit: control-plane-app
production_state: not_deployed
identity_impact: false
source_dependency: "PR #577 merged at exact master ancestor"
provider_model: single_active_default_off
provider_create_replay_model: durable_order_claim_at_most_once
schema_change: false
wallet_semantics_change: false
portal_contract_change: false
unknown_create_recovery: deferred_risk_a
production_authority: none
```

Keep the PR Draft until the exact-head validation and both final reviews are clean. Ready/merge is a separate user decision. Merge does not authorize production deployment, credential binding, callback ingress, provider activation, or a paid canary; each provider still requires its own later Risk A gate. The ChaoJiPay gate must additionally resolve whether `PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP` means payer IP or merchant egress IP before any activation.

Known pre-activation frontend gaps: the current Portal return hook invokes the capture endpoint when a returned order is still `entry_ready`, while XSD and ChaoJiPay intentionally have no capture capability and settle by callback. The Portal also does not poll a `created` order with no action, which is the conservative result of replaying an unresolved non-idempotent dispatch claim. This default-off backend PR does not change Portal code under the approved scope. Before either CNY provider can be activated for users, a separate reviewed frontend design/source change must poll callback-driven and unresolved durable order states without attempting unsupported capture, repeat create, or provider fallback. A fast webhook that happens to credit before return is not sufficient proof, and the Risk A activation gate must stop if either gap remains.
