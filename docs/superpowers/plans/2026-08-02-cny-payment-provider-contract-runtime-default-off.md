# CNY Payment Provider Contract Runtime Default-Off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the read-only XSD and ChaoJiPay merchant-documentation facts into strict, locally testable payment protocol adapters while keeping both providers absent from runtime assembly and production.

**Architecture:** Each provider gets a small protocol codec and an injected transport runtime modeled after the existing PayPal boundary. The Adapter exposes only contract-backed operations, while the runtime owns credentials, signing, HTTP projection, callback signature verification, and payload evidence. The static registry may compile the adapters, but `server/state.mjs`, Portal routes, callback routes, and production configuration remain PayPal-only/default-off.

**Tech Stack:** Node.js ESM, `node:crypto`, injected `fetchFn`, existing Payment Provider Core/registry, Node test runner, no new dependencies.

## Risk Declaration

- Risk: B source implementation inside a future Risk A provider-activation boundary.
- Process: one TDD PR with a fresh implementer and independent review per task.
- Expected PR count: 1.
- Validation: focused provider tests, `npm run admin:test`, `npm run admin:portal:build`, `npm run admin:portal:verify`, `npm run admin:build`, `npm test`, and `git diff --check origin/master...HEAD`.
- Production/AWS impact: none; no provider request, credential installation, callback registration, order creation, payment, schema change, deployment, or runtime flag change.

## Global Constraints

- Source baseline is `origin/master@10167cee2351f20210745f90e23d236bda614325` (merged PR #575).
- Release unit is `control-plane-app`; `production_state: not_deployed`; `identity_impact: false`.
- The merchant-documentation inventory gates are read-only evidence, not production compatibility proof.
- Never read local merchant credential files in tests or implementation. Use only synthetic merchant ids, keys, callback bodies, URLs, and IP addresses.
- Never return, log, persist, or include raw credentials, raw provider responses, raw callback bodies, customer identity, merchant values, or settlement data in errors or public results.
- No source file may call a live provider during tests. All HTTP is injected through `fetchFn` and synthetic responses.
- `server/state.mjs`, public callback routes, recharge routes, Portal UI, CNY price book, Payment Store, Wallet, schema/migrations, marketplace orders, fulfillment, and production configuration are out of scope.
- No provider is imported or assembled by `server/state.mjs`. PayPal Sandbox remains the only assembled payment runtime.
- No automatic provider fallback is added. A created order never changes Adapter, payment method, or merchant binding.
- Unknown, undocumented, malformed, unsigned, or ambiguous states fail closed. They never become `failed_no_charge`, never credit Coins, and never authorize another provider.
- Returned payment actions must pass the existing HTTPS `allowedActionOrigins` contract. The provider response cannot expand that allowlist.
- CNY amount encoding requires currency `CNY`, exponent `2`, a positive safe integer minor amount, and an exact two-decimal yuan string.
- Both providers use the merchant payment order reference as the Adapter `providerOrderRef`; the provider-generated platform order id is used as `providerCaptureRef` only after a verified success callback.
- Successful callbacks alone produce verified payment facts. Pending, timeout, and provider-exception callbacks may be acknowledged only after signature verification and leave the order unchanged.
- XSD supports `alipay` channel `1917` and `wechat_pay` channel `1923` as exact documented channel metadata.
- ChaoJiPay supports only `wechat_pay` product code `726`.
- `capturePayment`, `refund`, `reconcile`, `repeatCreateIdempotent`, and `repeatCaptureIdempotent` remain disabled for both providers.
- No new dependency, queue, worker, service, mobile behavior, or alternate Portal shell.
- Every production-code change follows observed RED, minimal GREEN, and a focused refactor with tests still green.

---

### Task 1: Implement The XSD Strict Default-Off Protocol

**Files:**
- Create: `server/services/platform/xsd-payment-protocol-codec.mjs`
- Create: `server/services/platform/xsd-payment-runtime.mjs`
- Create: `server/tests/platform-xsd-payment-protocol-codec.test.mjs`
- Create: `server/tests/platform-xsd-payment-runtime.test.mjs`
- Modify: `server/services/platform/xsd-payment-adapter.mjs`
- Modify: `server/services/platform/xsd-documented-payment-candidate.mjs`
- Modify: `server/tests/platform-xsd-payment-adapter.test.mjs`
- Modify: `server/tests/platform-xsd-documented-payment-candidate.test.mjs`
- Modify: `server/tests/platform-xsd-payment-protocol-boundary.test.mjs`

**Interfaces:**
- `encodeXsdCreateRequest(input)` produces an opaque transport request with action `xsd_payment_create`, the frozen payment inputs, and callback/return route refs; it contains no credential.
- `encodeXsdQueryRequest(input)` produces action `xsd_payment_query` using the merchant payment order reference.
- `encodeXsdCallbackVerificationRequest(input)` produces action `xsd_callback_verify` with the exact callback envelope.
- `decodeXsdCreateResponse({ createInput, providerResponse, receivedAt })` returns `entry_ready`, uses `createInput.paymentOrderRef` as `providerOrderRef`, and projects only a redirect action.
- `decodeXsdQueryResponse({ queryInput, providerResponse, receivedAt })` maps only signed `3` to `succeeded`, signed `00` to `pending`, and everything else to `reconciliation_required`.
- `decodeVerifiedXsdCallback({ callbackInput, providerResponse, merchantScopeDigest, payloadDigest })` returns a verified `payment_succeeded` fact only for signed status `1`; signed `-1` returns `null`; all other values reject.
- `createXsdPaymentRuntime({ credential, fetchFn, apiOrigin, allowedActionOrigins, routeMap, profileRef, credentialProfileRef, nowFn })` returns `{ credentialLoader, transport }`; both refs bind credential issuance and use, and it is not imported by `server/state.mjs`.
- `createXsdPaymentAdapter({ executionScope, nowFn })` returns `contractVersion: "v1"`, supports `alipay` and `wechat_pay`, and enables create/query/callback verification only.

- [ ] **Step 1: Write RED codec and Adapter tests**

Use literal synthetic fixtures to require:

```js
{
  adapterKey: "xsd_v1",
  providerId: "xsd",
  contractVersion: "v1",
  supportedPaymentMethods: ["alipay", "wechat_pay"],
  capabilities: {
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

Assert the codec rejects wrong currency/exponent, unsafe refs, accessors, proxies, extra fields, unknown status values, unsigned callback projections, untrusted action URLs, and any callback containing the optional `attach` field. The project never sends `attach`, so its unexpected presence remains an unresolved contract shape and fails closed.

- [ ] **Step 2: Run codec and Adapter tests and observe RED**

Run:

```powershell
node --test server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs
```

Expected: FAIL because the codec does not exist and the Adapter is still unverified.

- [ ] **Step 3: Implement the minimal codec and Adapter**

Use exact documented field names:

```text
create: mch_order_no, amount, notifyurl, callbackurl, mchId, channel, format=json, sign
query:  mch_order_no, mchId, sign
callback accepted shape: mch_order_no, partnerorderid, status, mchId, amount, sign
```

For signing, omit `sign`, omit empty values, sort keys with JavaScript ordinal string order, join `key=value` with `&`, append the secret directly, and output lowercase MD5. `format` is excluded from create signing. Parse and format form-urlencoded bodies as UTF-8. Return ACK `{ statusCode: 200, contentType: "text/plain", body: "SUCCESS" }` only for a credential-scoped verified callback result.

- [ ] **Step 4: Write RED runtime tests**

Using a synthetic credential and injected `fetchFn`, assert:

- create sends `POST /api/gaia/unifiedorder` with `application/x-www-form-urlencoded; charset=utf-8` and a hand-derived lowercase signature;
- query sends `POST /api/gaia/query` and verifies the signed projected response before mapping status;
- callback accepts only form-urlencoded content, verifies the signature in constant time, computes SHA-256 payload evidence, and returns no raw body;
- create/query HTTP failures, oversized responses, non-JSON bodies, unexpected fields, wrong merchant id, bad signatures, and mismatched order or amount fail closed;
- returned `datas.url` is only projected; the existing Adapter contract enforces the configured action-origin allowlist.

- [ ] **Step 5: Run runtime tests and observe RED**

Run:

```powershell
node --test server/tests/platform-xsd-payment-runtime.test.mjs
```

Expected: FAIL because `createXsdPaymentRuntime` does not exist.

- [ ] **Step 6: Implement the injected runtime and update documented evidence**

The credential contains only runtime-scoped `merchantId`, `merchantSecret`, and `merchantScopeDigest`. The route map resolves the existing logical callback and return refs; it does not register a public route. Update the detached candidate from the superseded field vocabulary to the exact field names above, while retaining an explicit read-only-evidence warning and no runtime imports from the candidate.

- [ ] **Step 7: Run focused GREEN tests and commit**

Run:

```powershell
node --check server/services/platform/xsd-payment-protocol-codec.mjs
node --check server/services/platform/xsd-payment-runtime.mjs
node --test server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-xsd-documented-payment-candidate.test.mjs server/tests/platform-xsd-payment-protocol-boundary.test.mjs
```

Commit: `feat(payment): add default-off xsd protocol`

---

### Task 2: Implement The ChaoJiPay Strict Default-Off Protocol

**Files:**
- Create: `server/services/platform/chaojipay-payment-protocol-codec.mjs`
- Create: `server/services/platform/chaojipay-payment-runtime.mjs`
- Create: `server/tests/platform-chaojipay-payment-protocol-codec.test.mjs`
- Create: `server/tests/platform-chaojipay-payment-runtime.test.mjs`
- Modify: `server/services/platform/chaojipay-payment-adapter.mjs`
- Modify: `server/services/platform/chaojipay-documented-payment-candidate.mjs`
- Modify: `server/tests/platform-chaojipay-payment-adapter.test.mjs`
- Modify: `server/tests/platform-chaojipay-documented-payment-candidate.test.mjs`

**Interfaces:**
- `encodeChaoJiPayCreateRequest(input)` produces action `chaojipay_payment_create` with no credential.
- `encodeChaoJiPayCallbackVerificationRequest(input)` produces action `chaojipay_callback_verify` with the callback envelope.
- `decodeChaoJiPayCreateResponse({ createInput, providerResponse, receivedAt })` returns an allowlist-gated redirect using `data.payUrl` and `createInput.paymentOrderRef` as `providerOrderRef`.
- `decodeVerifiedChaoJiPayCallback({ callbackInput, providerResponse, merchantScopeDigest, payloadDigest })` returns a verified success fact only for signed status `1`; signed `0`, `2`, or `3` returns `null`; unknown statuses reject.
- `createChaoJiPayPaymentRuntime({ credential, fetchFn, apiOrigin, allowedActionOrigins, routeMap, profileRef, credentialProfileRef, createRequestIp, nowFn })` returns `{ credentialLoader, transport }`; both refs bind credential issuance and use, and `createRequestIp` is a caller-supplied public IPv4 value for the emitted `ip` field. It is not imported by `server/state.mjs`.
- `createChaoJiPayPaymentAdapter({ executionScope, nowFn })` returns `contractVersion: "v1"`, supports only `wechat_pay`, enables create/callback verification, and leaves query disabled because the documented query response does not provide an authoritative verifiable field contract.

- [ ] **Step 1: Write RED codec and Adapter tests**

Require the exact capabilities:

```js
{
  createRechargeOrder: true,
  queryPayment: false,
  capturePayment: false,
  verifyCallback: true,
  refund: false,
  reconcile: false,
  repeatCreateIdempotent: false,
  repeatCaptureIdempotent: false,
}
```

The Adapter supports only `wechat_pay`; any Alipay input, wrong product, wrong currency/exponent, unsafe ref, malformed callback, or unknown callback status fails closed.

- [ ] **Step 2: Run codec and Adapter tests and observe RED**

Run:

```powershell
node --test server/tests/platform-chaojipay-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs
```

Expected: FAIL because the codec does not exist and the Adapter is still unverified.

- [ ] **Step 3: Implement the minimal codec and Adapter**

Use exact documented field names:

```text
create: outTradeId, amount, productCode=726, merchantId, ip, notifyUrl, sign
callback accepted shape: orderId, orderStatus, outTradeId, amount, sign
```

Omit optional `realName` and `param`; reject them if unexpectedly returned in a callback. For signing, omit `sign`, omit empty values, sort keys with JavaScript ordinal string order, join `key=value` with `&`, append `&key=<secret>`, and output uppercase MD5. Return ACK `{ statusCode: 200, contentType: "text/plain", body: "success" }` only after credential-scoped signature verification.

- [ ] **Step 4: Write RED runtime tests**

Using synthetic credentials and injected `fetchFn`, assert:

- create sends JSON to `/api/order/create`, uses product `726`, emits an exact two-decimal yuan amount, and includes a hand-derived uppercase signature;
- callback accepts the documented `application/form` media type and conventional `application/x-www-form-urlencoded`, each optionally with UTF-8 charset;
- signed status `1` projects a verified payment fact; signed `0`, `2`, and `3` project acknowledgement-only results and never confirmed-no-charge;
- bad signatures, wrong merchant/product/order/amount, malformed JSON, oversized responses, unexpected response fields, and non-HTTPS or unallowlisted actions fail closed;
- no query network request exists in this task.

- [ ] **Step 5: Run runtime tests and observe RED**

Run:

```powershell
node --test server/tests/platform-chaojipay-payment-runtime.test.mjs
```

Expected: FAIL because `createChaoJiPayPaymentRuntime` does not exist.

- [ ] **Step 6: Implement the injected runtime and update documented evidence**

The credential contains runtime-scoped `merchantId`, `merchantSecret`, and `merchantScopeDigest`. Route refs are resolved from an injected map. Update the detached candidate to `outTradeId`/`ip`/`notifyUrl` and remove the incorrect `orderNo`/`body`/`returnUrl` vocabulary. Keep the candidate detached from Adapter and runtime imports.

- [ ] **Step 7: Run focused GREEN tests and commit**

Run:

```powershell
node --check server/services/platform/chaojipay-payment-protocol-codec.mjs
node --check server/services/platform/chaojipay-payment-runtime.mjs
node --test server/tests/platform-chaojipay-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-runtime.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs server/tests/platform-chaojipay-documented-payment-candidate.test.mjs
```

Commit: `feat(payment): add default-off chaojipay protocol`

---

### Task 3: Harden XSD Runtime Binding And Response Limits

**Files:**
- Modify: `server/services/platform/xsd-payment-runtime.mjs`
- Modify: `server/tests/platform-xsd-payment-runtime.test.mjs`

**Interfaces:**
- `createXsdPaymentRuntime(...)` additionally requires exact `profileRef` and `credentialProfileRef` bindings.
- Credential handles are issued and used only when the execution binding matches both refs, `xsd_v1`, and contract `v1`.
- Provider responses are read incrementally from a standard `Response` stream, reject an oversized declared length before reading, cancel on chunked overflow, reject malformed UTF-8/JSON, and require a non-empty final URL exactly equal to the fixed request URL.

- [x] **Step 1: Write RED runtime hardening tests**

Assert wrong loader-time and request-time profile/credential-profile bindings reject before fetch. Assert declared and chunked responses over 1 MiB fail closed without returning body material. Assert an empty, redirected, or mismatched final URL fails closed.

- [x] **Step 2: Run the focused test and observe RED**

Run:

```powershell
node --test server/tests/platform-xsd-payment-runtime.test.mjs
```

Expected: FAIL because XSD still accepts an unbound execution profile and buffers responses through `response.text()`.

- [x] **Step 3: Implement the minimal parity hardening**

Keep XSD signing, request fields, callback verification, Adapter capabilities, and default-off assembly unchanged. Do not introduce a shared abstraction merely to deduplicate the two provider runtimes.

- [x] **Step 4: Run focused GREEN tests and commit**

Run:

```powershell
node --check server/services/platform/xsd-payment-runtime.mjs
node --test server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-payment-provider-adapter-contract.test.mjs
git diff --check
```

Commit: `fix(payment): bind and bound xsd runtime`

Task 3 continuation fact: `createXsdPaymentRuntime(...)` now has the exact
constructor binding `profileRef` and `credentialProfileRef`; the issued handle
and every transport request must match those refs, `xsd_v1`, and `v1`. This is
synthetic source evidence only and did not supply any real binding.

---

### Task 4: Compile The Adapters Without Runtime Activation

**Files:**
- Modify: `server/services/platform/payment-provider-adapter-registry.mjs`
- Modify: `server/tests/platform-payment-provider-adapter-registry.test.mjs`
- Modify: `server/tests/platform-payment-provider-source-boundary.test.mjs`
- Modify: `server/tests/helpers/payment-provider-source-boundary.mjs`
- Modify: `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- Modify: `docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md`
- Modify: `docs/superpowers/plans/2026-08-02-cny-payment-provider-contract-runtime-default-off.md`

**Interfaces:**
- Registry listing reports the exact compiled v1 descriptors and capabilities from Tasks 1 and 2.
- Registry resolution still intersects compiled capabilities with explicit declared capabilities and requires injected credential/transport bindings.
- The inert descriptor factory uses a failing execution scope for all three adapters; it performs no credential or network access.
- Source-boundary tests prove both provider runtimes are absent from `server/state.mjs`, routes, Portal/Admin bootstrap roots, Store, Wallet, and public indexes.

- [x] **Step 1: Write RED registry and source-boundary tests**

Assert XSD and ChaoJiPay list as `v1` with the exact capabilities from Tasks 1 and 2. Resolving either Adapter with all declared capabilities false remains disabled. Enabling a capability without an injected credential/transport must fail closed on first invocation. Scan all runtime assembly and public route roots and require zero imports of either provider runtime module.

- [x] **Step 2: Run integration tests and observe RED**

Run:

```powershell
node --test server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected: FAIL because the registry still assumes only PayPal needs an execution scope and still expects both providers to be unverified.

- [x] **Step 3: Implement minimal registry support and update documentation**

Generalize inert descriptor construction without adding state assembly. Document the confirmed request/signing/callback facts, the unresolved action-origin/retry/terminal-no-charge evidence, ChaoJiPay `ip` field semantics and trusted binding, and the separate future Risk A gates for credentials, routes, production runtime assembly, unpaid create/query probes, and one-provider-at-a-time paid canaries.

- [x] **Step 4: Run focused GREEN tests and commit**

Run:

```powershell
node --test server/tests/platform-xsd-payment-protocol-codec.test.mjs server/tests/platform-xsd-payment-runtime.test.mjs server/tests/platform-xsd-payment-adapter.test.mjs server/tests/platform-chaojipay-payment-protocol-codec.test.mjs server/tests/platform-chaojipay-payment-runtime.test.mjs server/tests/platform-chaojipay-payment-adapter.test.mjs server/tests/platform-payment-provider-adapter-registry.test.mjs server/tests/platform-payment-provider-source-boundary.test.mjs server/tests/platform-production-cny-payment-recharge-price-book.test.mjs server/tests/platform-payment-store.test.mjs server/tests/platform-payment-recharge-coordinator.test.mjs server/tests/portal-coin-recharge-routes.test.mjs server/tests/state.test.mjs
```

Commit: `test(payment): prove cny providers remain default off`

Task 4 continuation fact: the Registry lists the compiled XSD/ChaoJiPay `v1`
metadata through one inert failing execution scope and a deterministic clock;
descriptor construction does not read a credential or issue a request.
Resolution still creates a scope only from `profileRef`, `credentialProfileRef`,
the injected credential loader, and the matching injected transport. A declared
capability can reduce, never expand, the compiled capability. `createRequestIp`
is not a Registry option or production setting: for ChaoJiPay it remains an
explicit runtime constructor input whose payer-versus-egress semantics and
trusted origin binding require a separate Risk A decision.

---

## Final Validation And Review

After all task reviews are clean, run:

```powershell
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

Required final evidence:

- XSD and ChaoJiPay protocol behavior is synthetic-test validated and no live provider was called.
- Both provider runtimes remain absent from `server/state.mjs`, public callbacks, and production configuration.
- XSD exposes only documented Alipay/WeChat behavior; unexpected `attach` fails closed.
- ChaoJiPay exposes only WeChat product `726`; query remains disabled.
- Only verified signed success callbacks can create a verified payment fact.
- Pending, timeout, exception, malformed, unsigned, or unknown states never become confirmed-no-charge and never trigger fallback.
- Payment action URLs remain restricted by an injected HTTPS allowlist.
- PayPal Sandbox, Payment Store, Wallet, CNY price book, Portal UI, and default-off route behavior remain green and unchanged.

Known follow-up requiring separate Risk A evidence and approval:

- exact production credential names and protected bindings;
- callback route registration and public ingress;
- observed provider action origins and allowlist mutation;
- XSD callback retry behavior and ChaoJiPay ACK/retry behavior;
- ChaoJiPay authoritative signed query response contract;
- unpaid create/query probes followed by one-provider-at-a-time small-value paid canaries;
- production CNY runtime assembly and activation.
