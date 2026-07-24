# Payment Provider Adapter V1 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Every code
> task also requires `superpowers:test-driven-development`. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Finalize the source-only Payment Provider Adapter V1 contract,
replace provisional provider identities with named disabled Adapters, and add
pure synthetic PayPal and bounded XSD protocol codecs without enabling a
provider, calling a network, persisting payment state, or mutating Coins.

**Architecture:** Provider Core remains the sole Adapter authority. The static
Registry publishes three exact `unverified` identities whose capabilities and
supported methods remain empty. A provider-neutral integer money codec owns
canonical decimal conversion. PayPal and XSD protocol modules are detached,
deterministic codecs exercised with synthetic data; credential-scoped
execution is the only component allowed to attach private callback or
authenticated-capture provenance. Routing, Payment Store, callbacks, wallet
settlement, Portal/Admin, and provider activation remain separate gates.

**Tech Stack:** Node.js ES modules, built-in `node:test`,
`node:assert/strict`, `node:crypto`, existing `node:util` and `node:net`
contract guards, PowerShell validation commands, Markdown authority
documentation.

## Global Constraints

- **Risk:** B for this Phase 1 source PR. Any schema/migration, credential use,
  provider or sandbox call, callback/runtime wiring, wallet mutation,
  deployment, or production action is Risk A and excluded.
- **Process:** one clean-worktree PR containing intent, TDD code, synthetic
  tests, security/source-boundary tests, and aligned documentation.
- **Expected PR count:** one source-only Phase 1 PR. Payment Store, settlement,
  provider validation/activation, and Portal UI are later independent PRs and
  gates.
- **Validation:** per-task RED/GREEN tests and syntax checks, the complete
  focused Provider Core suite, `npm test`, `npm run docs:authority:check`, and
  working-tree plus baseline diff checks.
- **Production/AWS impact:** none. Do not SSH, read production state, call a
  provider, alter Vercel/AWS/Vultr/Cloudflare, register a callback, deploy, or
  publish an artifact.
- Work only in
  `D:\Projects\proxy-gateway-minimal\.worktrees\payment-provider-adapter-v1-design`.
  Do not edit the dirty
  `D:\Projects\proxy-gateway-minimal` checkout or copy implementation from an
  archive, generated directory, old checkout, or Draft PR wholesale.
- Treat
  `docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md`
  at commit `44dc85c0406022bb5399ef370858b241ce363c1e` as the exact design
  authority. The source baseline is
  `a5c80f44a47389d65907ba1cdd58649a1e41ac83`.
- The legacy PayPal branch
  `codex/payment-provider-system@19707207f3b4c23a656450718a47218629642ed2`
  is a donor for reviewed protocol mappings only. Do not cherry-pick or merge
  that branch.
- Do not import legacy environment access, global `fetch`, OAuth token
  acquisition/cache, in-memory checkout orders, old Portal routes, direct
  product checkout, old output statuses, or compatibility exports.
- Do not add a Payment Store, SQLite access, schema or migration, HTTP route,
  router, callback listener, runtime wiring, Portal/Admin code, product order,
  entitlement, fulfillment, reward, recovery, or wallet call.
- Do not read, emit, copy, persist, or test with real credentials, merchant
  identifiers, order URLs, customer fields, raw provider payloads, account
  data, or subscription URLs. Bounded provider-shaped fixtures are synthetic
  only and must never be logged or persisted.
- `paid_coins`, `bonus_coins`, and `reward_coins` remain separate. This PR
  creates no Coin balance, hold, capture, lot, ledger entry, reward, reversal,
  or recovery case.
- Canonical payment methods are exactly ordered as `alipay`, `wechat_pay`,
  `paypal`. Provider identity must never equal a canonical payment method.
- Named Adapter identities are exactly:

| `adapterKey` | `providerId` | `contractVersion` |
| --- | --- | --- |
| `paypal_v1` | `paypal_commerce` | `unverified` |
| `xsd_v1` | `xsd` | `unverified` |
| `chaojipay_v1` | `chaojipay` | `unverified` |

- Every named Adapter has all eight capabilities `false` and
  `supportedPaymentMethods: []`. Protocol test coverage is not a capability
  claim.
- Capture is an explicit operation. Query is read-only and cannot capture,
  refund, credit Coins, trigger fulfillment, or justify fallback.
- All monetary inputs and verified facts carry `amountMinor`, `currency`, and
  `currencyExponent`. The exponent is an explicit safe integer from 0 through
  9 and is never inferred from a currency string.
- Decimal formatting and parsing use integer/string algorithms. Floating-point
  division, exponent notation, and `toFixed` are forbidden.
- Callback and authenticated-capture facts have distinct private Provider Core
  provenance. Pure decoders return unbranded raw facts. Only a successful,
  same-scope, same-operation credential-scoped transport receipt whose private
  evidence digests match the raw fact may attach that provenance. A capture
  fact cannot be used as a webhook acknowledgement input.
- `webhookSuccessAck` remains a pure response codec. All named Adapters keep it
  disabled, and this PR adds no ACK sender. A future sender additionally needs
  an Event Store `accepted_new` or `accepted_duplicate` receipt.
- The existing `safe_automatic_v1` routing policy is unchanged. Fallback
  remains limited to pre-dispatch entry unavailability or matching final
  no-charge evidence.
- Use `apply_patch` for source/document edits. Do not use shell redirection,
  `Set-Content`, Python file writers, or destructive Git reset/checkout.
- Commit checkpoints below are part of the selected implementation workflow.
  Do not push, open/ready/merge a PR, or deploy without the user's separate
  explicit authorization.

---

### Task 0: Reconfirm the clean implementation boundary

**Files:**

- Verify only; no source changes

**Interfaces:**

- Consumes: design commit `44dc85c0406022bb5399ef370858b241ce363c1e`
- Produces: a clean, source-baselined implementation branch with recorded
  baseline test evidence

- [ ] **Step 1: Verify the worktree and source ancestry**

```powershell
git status --short --branch
git rev-parse HEAD
git merge-base --is-ancestor a5c80f44a47389d65907ba1cdd58649a1e41ac83 HEAD
git merge-base --is-ancestor 44dc85c0406022bb5399ef370858b241ce363c1e HEAD
git diff --name-only a5c80f44a47389d65907ba1cdd58649a1e41ac83...HEAD
```

Expected:

```text
clean worktree
both merge-base checks exit 0
only the approved design and this plan differ from the source baseline
```

Stop if a source file is already dirty or either ancestry check fails. Do not
repair the state by resetting or copying from the active dirty checkout.

- [ ] **Step 2: Rename the local branch for the B-tier implementation**

```powershell
git branch -m codex/payment-provider-adapter-v1-phase1
git status --short --branch
```

Expected:

```text
## codex/payment-provider-adapter-v1-phase1
```

- [ ] **Step 3: Run the unchanged focused baseline**

```powershell
node --test `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-payment-provider-adapter-template.test.mjs `
  server/tests/platform-provider-a-payment-adapter.test.mjs `
  server/tests/platform-provider-b-payment-adapter.test.mjs `
  server/tests/platform-payment-routing-policy.test.mjs
```

Expected: exit 0 and `# fail 0`. The design-stage read-only run recorded
86 focused tests, 86 passed, 0 skipped, 0 failed. The previously recorded
repository baseline was 1611 tests, 1610 passed, 1 skipped, 0 failed; if the
unchanged focused baseline now fails, stop and reconcile drift before
implementation.

### Task 1: Add canonical integer money conversion

**Files:**

- Create:
  `server/services/platform/payment-money-codec.mjs`
- Create:
  `server/tests/platform-payment-money-codec.test.mjs`

**Interfaces:**

```js
export function normalizeCurrencyExponent(value);
export function formatPaymentAmountMinor(amountMinor, currencyExponent);
export function parsePaymentAmountMinor(value, currencyExponent);
```

- `normalizeCurrencyExponent` accepts only safe integers 0 through 9.
- `formatPaymentAmountMinor` accepts only positive safe integers.
- The exponent-0 parser grammar is `0|[1-9][0-9]*`.
- The exponent-greater-than-0 parser grammar is
  `(0|[1-9][0-9]*)\.[0-9]{currencyExponent}` with an exact fractional width.
- The formatter emits that grammar only for positive values. Text representing
  zero matches the lexical grammar but is then rejected by the positive-money
  invariant.
- `parsePaymentAmountMinor` accepts only that canonical grammar, returns a
  positive safe integer, and round-trips through the formatter.
- Every invalid input throws `TypeError("invalid_payment_money")`.

- [ ] **Step 1: Write the RED money tests**

Add tests with these exact names:

```text
currency exponent accepts only safe integers from zero through nine
minor-unit formatting is canonical for exponents zero two three and nine
minor-unit parsing round-trips the canonical formatter
money parsing rejects signs whitespace grouping exponent notation and wrong precision
money conversion rejects zero negative fractional and unsafe amounts
money conversion never uses floating-point division or toFixed
```

Required vectors:

| Input | Expected text |
| --- | --- |
| `1, 0` | `1` |
| `1, 2` | `0.01` |
| `100, 2` | `1.00` |
| `12345, 3` | `12.345` |
| `1, 9` | `0.000000001` |
| `Number.MAX_SAFE_INTEGER, 2` | `90071992547409.91` |

Reject `-1`, `0`, `1.5`, unsafe integers, exponent `-1`, exponent `10`,
`+1.00`, ` 1.00`, `1,000.00`, `1e2`, `.50`, `00.50`, `1.0`, and
`1.000`.

Run:

```powershell
node --test server/tests/platform-payment-money-codec.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND` because the codec does not exist.

- [ ] **Step 2: Implement the minimum integer/string codec**

Use this algorithm; do not replace it with numeric division:

```js
const INVALID_PAYMENT_MONEY = "invalid_payment_money";
const MAX_CURRENCY_EXPONENT = 9;

function fail() {
  throw new TypeError(INVALID_PAYMENT_MONEY);
}

function positiveSafeInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0 || Object.is(value, -0)) {
    fail();
  }
  return value;
}

export function normalizeCurrencyExponent(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 0
    || value > MAX_CURRENCY_EXPONENT
    || Object.is(value, -0)
  ) {
    fail();
  }
  return value;
}

export function formatPaymentAmountMinor(amountMinor, currencyExponent) {
  const digits = String(positiveSafeInteger(amountMinor));
  const exponent = normalizeCurrencyExponent(currencyExponent);
  if (exponent === 0) return digits;
  const padded = digits.padStart(exponent + 1, "0");
  return `${padded.slice(0, -exponent)}.${padded.slice(-exponent)}`;
}

export function parsePaymentAmountMinor(value, currencyExponent) {
  const exponent = normalizeCurrencyExponent(currencyExponent);
  if (typeof value !== "string") fail();
  const pattern = exponent === 0
    ? /^(?:0|[1-9][0-9]*)$/u
    : new RegExp(`^(?:0|[1-9][0-9]*)\\.[0-9]{${exponent}}$`, "u");
  if (!pattern.test(value)) fail();
  const digits = exponent === 0 ? value : value.replace(".", "");
  const amountMinor = Number(digits);
  positiveSafeInteger(amountMinor);
  if (formatPaymentAmountMinor(amountMinor, exponent) !== value) fail();
  return amountMinor;
}
```

- [ ] **Step 3: Run GREEN and syntax validation**

```powershell
node --check server/services/platform/payment-money-codec.mjs
node --test server/tests/platform-payment-money-codec.test.mjs
```

Expected: both commands exit 0; the test output ends with `# fail 0`.

- [ ] **Step 4: Commit the isolated money codec**

```powershell
git add -- `
  server/services/platform/payment-money-codec.mjs `
  server/tests/platform-payment-money-codec.test.mjs
git commit -m "feat: add canonical payment money codec"
```

### Task 2: Evolve Provider Core to the final V1 capture/fact contract

**Files:**

- Modify:
  `server/services/platform/payment-provider-adapter-contract.mjs`
- Modify:
  `server/tests/platform-payment-provider-adapter-contract.test.mjs`
- Modify:
  `server/services/platform/payment-provider-adapter-template.mjs`
- Modify:
  `server/tests/platform-payment-provider-adapter-template.test.mjs`
- Modify:
  `server/services/platform/provider-a-payment-adapter.mjs`
- Modify:
  `server/tests/platform-provider-a-payment-adapter.test.mjs`
- Modify:
  `server/services/platform/provider-b-payment-adapter.mjs`
- Modify:
  `server/tests/platform-provider-b-payment-adapter.test.mjs`
- Modify:
  `server/services/platform/payment-provider-adapter-registry.mjs`
- Modify:
  `server/tests/platform-payment-provider-adapter-registry.test.mjs`

The provisional A/B files are updated only to keep every exact-shape consumer
green during the atomic contract migration. Task 3 removes them completely.

**Interfaces:**

The Adapter surface is exactly:

```js
const ADAPTER_KEYS = [
  "adapterKey",
  "providerId",
  "contractVersion",
  "capabilities",
  "supportedPaymentMethods",
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyAndNormalizeCallback",
  "normalizeError",
  "webhookSuccessAck",
  "refund",
  "reconcile",
];
```

Capabilities are exactly:

```js
const CAPABILITY_KEYS = [
  "createRechargeOrder",
  "queryPayment",
  "capturePayment",
  "verifyCallback",
  "refund",
  "reconcile",
  "repeatCreateIdempotent",
  "repeatCaptureIdempotent",
];
```

Canonical operations and methods are:

```js
const EXECUTION_OPERATIONS = new Set([
  "create_recharge_order",
  "query_payment",
  "capture_payment",
  "verify_callback",
  "refund",
  "reconcile",
]);

export const PAYMENT_METHODS_V1 = Object.freeze([
  "alipay",
  "wechat_pay",
  "paypal",
]);
```

Exact capture input:

```js
{
  paymentOrderRef,
  attemptRef,
  providerOrderRef,
  captureRequestRef,
  amountMinor,
  currency,
  currencyExponent
}
```

Exact verified fact:

```js
{
  sourceType,
  providerEventRef,
  eventDedupeKey,
  eventType,
  paymentOrderRef,
  providerOrderRef,
  providerCaptureRef,
  providerRefundRef,
  amountMinor,
  currency,
  currencyExponent,
  merchantScopeDigest,
  payloadDigest,
  occurredAt,
  verificationResult
}
```

Exact capture outcome:

```js
{
  operationResult,
  paymentFact
}
```

A succeeded capture requires a private
`authenticated_capture_response`-branded `payment_succeeded` fact whose
payment order, provider order, amount, currency, and exponent match the
capture input. Every non-success capture outcome requires
`paymentFact: null`.

- [ ] **Step 1: Write the RED contract migration tests**

Update all local fixture builders first, then add tests with these exact names:

```text
payment methods include paypal while provider identity remains distinct
create refund capture and verified facts require an explicit bounded currency exponent
capture is an exact separately gated canonical operation
repeat-capture idempotency requires capture capability
credential execution brands callback and capture facts with distinct provenance
fact provenance requires a successful same-scope same-operation transport receipt
failed zero-request reused and cross-scope receipts cannot mint facts
transport receipt attack matrix rejects fabricated cross-operation digest mismatch custom thenable late fulfillment and post-closure use
successful capture requires a matching branded payment fact
capture rejects order amount currency exponent and provenance mismatches
non-success capture outcomes require a null payment fact
query cannot return a payment fact or invoke capture
webhook acknowledgement rejects authenticated-capture provenance
```

The currency exponent tests cover `-1`, `0`, `2`, `3`, `9`, and `10`.
The capture mismatch table mutates exactly one of:

```text
paymentOrderRef
providerOrderRef
amountMinor
currency
currencyExponent
sourceType
eventType
providerCaptureRef
```

Use a credential loader and request spy to prove:

```text
disabled capture: loader=0, request=0, clock=0
enabled synthetic fact-bearing capture: loader=1, request=1
well-shaped zero-request capture or callback fact: rejected
failed request: no receipt and no fact brand
callback settles before retained request Promise: later fulfillment mints no receipt
query: capture callback=0
```

Run the first RED:

```powershell
node --test server/tests/platform-payment-provider-adapter-contract.test.mjs
```

Expected RED: exact Adapter/capability shapes and `capturePayment` assertions
fail because the old contract has 12 keys and no capture operation.

- [ ] **Step 2: Add exponent validation to all monetary inputs**

Import `normalizeCurrencyExponent` from
`./payment-money-codec.mjs`. Convert its error into the caller's canonical
contract error:

```js
function assertCurrencyExponent(value, code) {
  try {
    return normalizeCurrencyExponent(value);
  } catch {
    throw contractError(code);
  }
}
```

Insert `currencyExponent` immediately after `currency` in:

```text
createInput
captureInput
refundInput
normalizeRawVerifiedPaymentFact
```

Do not add money fields to query, reconcile, provider errors, next actions, or
acknowledgements.

- [ ] **Step 3: Replace the single event WeakSet with source-aware private provenance**

Use a module-private `WeakMap`:

```js
const verifiedPaymentFacts = new WeakMap();

function assertBrandedPaymentFact(value, expectedSourceType, code) {
  if (
    value === null
    || typeof value !== "object"
    || utilTypes.isProxy(value)
    || !Object.isFrozen(value)
    || verifiedPaymentFacts.get(value) !== expectedSourceType
  ) {
    throw contractError(code);
  }
  return value;
}
```

Do not define a receipt-free fact-branding helper. Step 4 introduces the only
branding path, which normalizes the raw fact, consumes a matching transport
receipt, then writes this private `WeakMap`.

`normalizeRawVerifiedPaymentFact` must:

- reject any `sourceType` other than `callback` or
  `authenticated_capture_response`;
- require `verificationResult === "verified"`;
- validate all 15 exact fields;
- require `providerCaptureRef` for `payment_succeeded`;
- require `authenticated_capture_response` facts to be
  `payment_succeeded`, with `providerEventRef: null` and
  `providerRefundRef: null`;
- return a frozen detached object.

Keep the public export name `normalizeVerifiedPaymentEvent` for compatibility
inside Provider Core, but make it accept only either privately branded source.
Do not export a raw-fact branding helper.

- [ ] **Step 4: Bind fact provenance to a successful transport receipt**

Change the injected `requestFn` result to one exact internal transport shape:

```js
{
  response,
  evidence: null
}
```

or, for `capture_payment` and `verify_callback`:

```js
{
  response,
  evidence: {
    merchantScopeDigest,
    payloadDigest
  }
}
```

Both digests are lowercase SHA-256. They are generated by the injected
credential-scoped transport from its reviewed merchant binding and ephemeral
provider payload; caller input cannot supply them.

For both a native synchronous result and native Promise fulfillment, Provider
Core first rechecks `scopeActive`, then validates the transport envelope, and
only then mints a receipt. If the callback has already settled, the loader has
aborted, or the scope has otherwise closed, fulfillment rejects as
`payment_execution_scope_closed`; it cannot write either receipt `WeakMap`.
After those checks, the scoped request returns a frozen internal result:

```js
{
  response,
  evidence,
  transportReceipt
}
```

`transportReceipt` is a fresh frozen empty object branded in a module-private
`WeakMap`. Its private metadata contains only:

```text
scope token
canonical operation
merchantScopeDigest
payloadDigest
consumed flag
```

The scope tracks every minted receipt and deletes its brand on scope close.
Receipt consumption requires the same active scope and operation, matching
fact digests, and `consumed === false`; successful consumption marks and
deletes it. A request rejection, custom thenable, malformed transport result,
missing evidence on a fact operation, fabricated receipt, receipt from another
scope/operation, reused receipt, or digest mismatch cannot mint provenance.
The table-driven receipt test mutates `merchantScopeDigest` and `payloadDigest`
independently and covers synchronous and Promise request results.

Fact-bearing compiled callbacks return only these exact internal envelopes:

```js
{
  transportReceipt,
  paymentFact
}
```

for `verify_callback`, and:

```js
{
  transportReceipt,
  captureOutcome
}
```

for `capture_payment`.

`verify_callback` has no nullable-fact success envelope. Only successful
verification of a supported, structurally valid event may return
`{ transportReceipt, paymentFact }`. Verification `FAILURE`, an unsupported
event, malformed event, ambiguous reference, amount/currency mismatch, or
currency/exponent mismatch rejects, closes the scope, invalidates every
receipt, and returns no fact. In particular,
`{ transportReceipt, paymentFact: null }` is invalid.

Execution normalization must:

1. snapshot the exact internal envelope;
2. normalize the raw fact or raw capture outcome without branding;
3. consume the matching transport receipt and compare private evidence
   digests;
4. attach the correct private fact source brand;
5. strip the receipt and return only the canonical fact or capture outcome.

For a non-success capture, `captureOutcome.paymentFact` is `null`, but a
successful same-scope capture request receipt is still required and consumed.
All other operations continue to normalize their canonical operation result
and cannot return a payment fact.

The Adapter-side capture normalizer must preserve the branded fact object and
enforce:

```text
operationResult.providerOrderRef === captureInput.providerOrderRef
paymentFact.paymentOrderRef === captureInput.paymentOrderRef
paymentFact.providerOrderRef === captureInput.providerOrderRef
paymentFact.amountMinor === captureInput.amountMinor
paymentFact.currency === captureInput.currency
paymentFact.currencyExponent === captureInput.currencyExponent
```

It rejects any mismatch as `invalid_payment_operation_result`.

- [ ] **Step 5: Add the canonical capture wrapper and capability rules**

Add `capturePayment` beside `queryPayment`. The enabled wrapper:

1. snapshots the exact capture input;
2. calls only the compiled `capturePayment`;
3. normalizes with operation `capture_payment`;
4. verifies the source-aware fact and immutable money/order match.

Update all capability decisions:

```text
repeatCreateIdempotent requires createRechargeOrder
repeatCaptureIdempotent requires capturePayment
any operation enabled includes capturePayment
unverified requires all eight capability values false
providerId must not appear in PAYMENT_METHODS_V1
```

Update `webhookSuccessAck` to accept only facts whose private source brand is
`callback`. It still does not receive or send an Event Store receipt.

- [ ] **Step 6: Update every exact-shape consumer atomically**

In the template, Provider A, Provider B, Registry, and corresponding tests:

- add `capturePayment`;
- add `capturePayment: false` and `repeatCaptureIdempotent: false`;
- add `capture_payment` to recognized operations;
- include `currencyExponent` in create/refund test fixtures;
- make `OPERATION_CAPABILITY_KEYS` an explicit six-key list rather than
  `CAPABILITY_KEYS.slice`;
- require both repeat-capability dependencies;
- keep all provisional capabilities false and all methods empty.

Run:

```powershell
node --test `
  server/tests/platform-payment-money-codec.test.mjs `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-payment-provider-adapter-template.test.mjs `
  server/tests/platform-provider-a-payment-adapter.test.mjs `
  server/tests/platform-provider-b-payment-adapter.test.mjs `
  server/tests/platform-payment-routing-policy.test.mjs
```

Expected GREEN: exit 0 and `# fail 0`.

- [ ] **Step 7: Run syntax checks and commit the atomic migration**

```powershell
node --check server/services/platform/payment-provider-adapter-contract.mjs
node --check server/services/platform/payment-provider-adapter-registry.mjs
node --check server/services/platform/payment-provider-adapter-template.mjs
node --check server/services/platform/provider-a-payment-adapter.mjs
node --check server/services/platform/provider-b-payment-adapter.mjs
git add -- `
  server/services/platform/payment-provider-adapter-contract.mjs `
  server/services/platform/payment-provider-adapter-registry.mjs `
  server/services/platform/payment-provider-adapter-template.mjs `
  server/services/platform/provider-a-payment-adapter.mjs `
  server/services/platform/provider-b-payment-adapter.mjs `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-payment-provider-adapter-template.test.mjs `
  server/tests/platform-provider-a-payment-adapter.test.mjs `
  server/tests/platform-provider-b-payment-adapter.test.mjs
git commit -m "feat: extend payment adapter v1 contract"
```

### Task 3: Replace provisional identities with three named disabled Adapters

**Files:**

- Create:
  `server/services/platform/unverified-payment-adapter.mjs`
- Create:
  `server/services/platform/paypal-payment-adapter.mjs`
- Create:
  `server/services/platform/xsd-payment-adapter.mjs`
- Create:
  `server/services/platform/chaojipay-payment-adapter.mjs`
- Create:
  `server/tests/platform-paypal-payment-adapter.test.mjs`
- Create:
  `server/tests/platform-xsd-payment-adapter.test.mjs`
- Create:
  `server/tests/platform-chaojipay-payment-adapter.test.mjs`
- Modify:
  `server/services/platform/payment-provider-adapter-registry.mjs`
- Modify:
  `server/tests/platform-payment-provider-adapter-registry.test.mjs`
- Delete:
  `server/services/platform/provider-a-payment-adapter.mjs`
- Delete:
  `server/services/platform/provider-b-payment-adapter.mjs`
- Delete:
  `server/tests/platform-provider-a-payment-adapter.test.mjs`
- Delete:
  `server/tests/platform-provider-b-payment-adapter.test.mjs`

**Interfaces:**

```js
export function createPayPalPaymentAdapter(options = {});
export function createXsdPaymentAdapter(options = {});
export function createChaoJiPayPaymentAdapter(options = {});
```

Each module exports only its factory. The shared helper exports only:

```js
export function createUnverifiedPaymentAdapter(identity, options = {});
```

The helper accepts an internal exact identity and caller options whose only
allowed keys are `executionScope` and `nowFn`. It snapshots descriptors
without invoking accessors or Proxy traps. It does not read `executionScope`.

- [ ] **Step 1: Write the named-Adapter RED tests**

Add tests with these exact names:

```text
PayPal is the exact paypal_v1 unverified disabled Adapter
PayPal rejects hostile options and operations without reading input or scope
PayPal normalizes capture_payment without leaking the raw error
XSD is the exact xsd_v1 unverified disabled Adapter
XSD runtime cannot expose a sendable acknowledgement while unverified
ChaoJiPay is the exact identity-only unverified disabled Adapter
ChaoJiPay exports no protocol codec status acknowledgement endpoint or payment method surface
Registry projections Adapters and errors never contain synthetic secret markers
```

For each Adapter, assert:

```js
{
  createRechargeOrder: false,
  queryPayment: false,
  capturePayment: false,
  verifyCallback: false,
  refund: false,
  reconcile: false,
  repeatCreateIdempotent: false,
  repeatCaptureIdempotent: false
}
```

Call every raw business/ACK method with a hostile Proxy and assert no trap,
execution-scope, transport, loader, or clock call occurs before the exact
`provider_contract_unverified` rejection.

Run:

```powershell
node --test `
  server/tests/platform-paypal-payment-adapter.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs `
  server/tests/platform-chaojipay-payment-adapter.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND` for the first named Adapter module.

- [ ] **Step 2: Implement one shared fail-closed factory**

The shared helper returns the full exact 13-key raw shape. Its capabilities and
methods are:

```js
const FALSE_CAPABILITIES = Object.freeze({
  createRechargeOrder: false,
  queryPayment: false,
  capturePayment: false,
  verifyCallback: false,
  refund: false,
  reconcile: false,
  repeatCreateIdempotent: false,
  repeatCaptureIdempotent: false,
});

const OPERATION_BY_METHOD = Object.freeze({
  createRechargeOrder: "create_recharge_order",
  queryPayment: "query_payment",
  capturePayment: "capture_payment",
  verifyAndNormalizeCallback: "verify_callback",
  webhookSuccessAck: "verify_callback",
  refund: "refund",
  reconcile: "reconcile",
});
```

`normalizeError` recognizes all six canonical operations. A recognized
operation returns the safe raw record:

```js
{
  code: "provider_contract_unverified",
  operation,
  retryable: false,
  chargeCertainty: "confirmed_no_charge",
  providerOrderRef: null,
  occurredAt: "1970-01-01T00:00:00.000Z"
}
```

An invalid operation returns `provider_operation_failed`, operation
`reconcile`, certainty `unknown`, and no raw cause. The fixed timestamp is
intentional for a disabled contract sentinel; `executionScope` and `nowFn`
are shape-validated but never invoked, so raw and normalized disabled paths
remain loader=0, request=0, clock=0.

- [ ] **Step 3: Add the three constant-identity wrappers**

The wrappers call the helper with only:

```js
createUnverifiedPaymentAdapter(
  { adapterKey: "paypal_v1", providerId: "paypal_commerce" },
  options,
);

createUnverifiedPaymentAdapter(
  { adapterKey: "xsd_v1", providerId: "xsd" },
  options,
);

createUnverifiedPaymentAdapter(
  { adapterKey: "chaojipay_v1", providerId: "chaojipay" },
  options,
);
```

Do not import a protocol codec into any named Adapter in this task.

- [ ] **Step 4: Replace the Registry factory map**

Use static top-level imports and this frozen deterministic order:

```js
const ADAPTER_FACTORIES = Object.freeze({
  paypal_v1: createPayPalPaymentAdapter,
  xsd_v1: createXsdPaymentAdapter,
  chaojipay_v1: createChaoJiPayPaymentAdapter,
});
```

Registry options remain exactly:

```text
credentialLoader
transports
nowFn
```

`transports` accepts only sparse exact entries for those three compiled
adapter keys, and each entry remains exactly:

```text
requestFn
allowedActionOrigins
```

Assert Registry construction, list, resolve, and every disabled method produce
loader=0, request=0, clock=0. A declared `true` value cannot raise a compiled
`false` capability.

- [ ] **Step 5: Delete provisional files and prove named Registry GREEN**

Delete the four provisional source/test files with `apply_patch`, then run:

```powershell
node --test `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-payment-provider-adapter-template.test.mjs `
  server/tests/platform-paypal-payment-adapter.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs `
  server/tests/platform-chaojipay-payment-adapter.test.mjs `
  server/tests/platform-payment-routing-policy.test.mjs
```

Expected: exit 0, `# fail 0`, Registry list order
`paypal_v1, xsd_v1, chaojipay_v1`, exact 13-key resolved Adapters, and all
effective capabilities false.

- [ ] **Step 6: Commit named disabled Adapters**

```powershell
git add -A -- `
  server/services/platform/provider-a-payment-adapter.mjs `
  server/services/platform/provider-b-payment-adapter.mjs `
  server/services/platform/unverified-payment-adapter.mjs `
  server/services/platform/paypal-payment-adapter.mjs `
  server/services/platform/xsd-payment-adapter.mjs `
  server/services/platform/chaojipay-payment-adapter.mjs `
  server/services/platform/payment-provider-adapter-registry.mjs `
  server/tests/platform-provider-a-payment-adapter.test.mjs `
  server/tests/platform-provider-b-payment-adapter.test.mjs `
  server/tests/platform-paypal-payment-adapter.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs `
  server/tests/platform-chaojipay-payment-adapter.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs
git commit -m "feat: register named disabled payment adapters"
```

### Task 4: Add the pure synthetic PayPal protocol codec

**Files:**

- Create:
  `server/services/platform/paypal-payment-protocol-codec.mjs`
- Create:
  `server/tests/platform-paypal-payment-protocol-codec.test.mjs`

**Primary protocol references:**

- [PayPal Orders v2](https://developer.paypal.com/docs/api/orders/v2/)
- [PayPal webhook verification](https://developer.paypal.com/api/webhooks/v1/verify-webhook-signature-post/)
- [PayPal webhook event names](https://developer.paypal.com/api/rest/webhooks/event-names/)

These references define protocol vocabulary only. They do not authorize a
provider call or capability activation.

**Interfaces:**

```js
export function derivePayPalProviderRequestId(input);
export function encodePayPalCreateOrderRequest(input);
export function decodePayPalCreateOrderResponse(input);
export function encodePayPalQueryOrderRequest(input);
export function decodePayPalQueryOrderResponse(input);
export function encodePayPalCaptureOrderRequest(input);
export function decodePayPalCaptureOrderResponse(input);
export function encodePayPalWebhookVerificationRequest(input);
export function decodeVerifiedPayPalWebhook(input);
```

Every exported function rejects accessors, Proxies, Symbols, exotic
prototypes, missing keys, and extra keys without invoking hostile traps. Exact
inputs and outputs are:

| Function | Exact input | Output |
| --- | --- | --- |
| `derivePayPalProviderRequestId` | `{ operation, requestRef }` | stable safe string |
| `encodePayPalCreateOrderRequest` | canonical 12-key create input | exact `{ action, requestId, body }` |
| `decodePayPalCreateOrderResponse` | `{ createInput, providerResponse, receivedAt }` | raw five-key operation result |
| `encodePayPalQueryOrderRequest` | `{ paymentOrderRef, attemptRef, providerOrderRef }` | exact `{ action, providerOrderRef }` |
| `decodePayPalQueryOrderResponse` | `{ queryInput, providerResponse, receivedAt }` | raw five-key operation result |
| `encodePayPalCaptureOrderRequest` | canonical seven-key capture input | exact `{ action, providerOrderRef, requestId, body }` |
| `decodePayPalCaptureOrderResponse` | `{ captureInput, providerResponse, merchantScopeDigest, payloadDigest, receivedAt }` | raw `{ operationResult, paymentFact }` |
| `encodePayPalWebhookVerificationRequest` | canonical four-key callback input | exact `{ action, transmission, webhookEvent }` |
| `decodeVerifiedPayPalWebhook` | `{ callbackInput, verificationResponse, merchantScopeDigest, payloadDigest }` | raw 15-key callback fact |

All malformed, unsupported, ambiguous, or verification-failed PayPal codec
inputs throw only `TypeError("invalid_paypal_protocol")`; unsupported compiled
currency/exponent pairs throw only
`TypeError("provider_contract_unverified")`. No error contains caller or
provider values.

In Phase 1, `receivedAt` for create/query/capture is a canonical timestamp
explicitly supplied by the synthetic harness and validated by the pure codec;
it is never read from provider payload or a global clock. A future enabled
Adapter may supply it from its snapshotted `nowFn`, but Task 4 does not change
the disabled named Adapter. Callback `occurredAt` is
`callbackInput.receivedAt`. The two digest arguments come only from the
evidence object returned beside the successful transport receipt. Create
action expiry is always `createInput.expiresAt`.

Capture dedupe material is exactly:

```text
GCCWEBOS:PAYPAL_CAPTURE_EVENT:v1
providerOrderRef
providerCaptureRef
```

Webhook dedupe material is exactly:

```text
GCCWEBOS:PAYPAL_WEBHOOK_EVENT:v1
paypal-transmission-id
providerEventRef
```

Each component is joined with NUL and hashed with SHA-256; the safe dedupe ref
is `pp_` plus the full lowercase hexadecimal digest.

The protocol module imports only `node:crypto` and
`./payment-money-codec.mjs`. It contains no API origin, credential, OAuth,
global `fetch`, HTTP client, route, Store, wallet, environment lookup, clock,
or application import.

The Phase 1 compiled synthetic currency/exponent allowlist is exactly
`USD -> 2`. This is a fixture boundary, not a live support claim. Any other
pair rejects `provider_contract_unverified`.

The compiled action-origin allowlist used only by synthetic Core tests is
exactly `https://payer-action.synthetic.invalid`. Fixtures use paths beneath
that reserved, non-routable origin. It is not a PayPal API origin, provider
configuration, runtime default, or capability claim.

Detached request descriptors use semantic actions and never contain an API
origin or credential:

```js
{
  action: "paypal_orders_create",
  requestId,
  body
}

{
  action: "paypal_orders_query",
  providerOrderRef
}

{
  action: "paypal_orders_capture",
  providerOrderRef,
  requestId,
  body: {}
}

{
  action: "paypal_webhook_verify",
  transmission,
  webhookEvent
}
```

- [ ] **Step 1: Write the PayPal RED tests**

Add tests with these exact names:

```text
PayPal create codec emits a detached descriptor and maps an allowlisted payer action
PayPal request ids are stable and domain-separated for create and capture
PayPal create recognizes approve and payer-action relations
PayPal create treats duplicate or simultaneous reviewed action links as ambiguous
PayPal Core rejects a decoded action outside the compiled redirect origin
PayPal query codec is read-only and never emits or invokes capture
PayPal capture codec returns a matching raw authenticated-capture fact
PayPal capture rejects mismatched order amount currency exponent and missing capture reference
PayPal non-success capture outcomes carry a null payment fact
PayPal callback codec mints a raw fact only after injected verification succeeds
PayPal callback rejects FAILURE unsupported malformed ambiguous and mismatched events with one safe error
PayPal callback requires each verification header exactly once and rejects duplicates
PayPal raw decoded facts have no Provider Core provenance
PayPal decoders reject missing extra accessor Proxy and digest envelope fields
PayPal protocol module has no credential network environment Store route or wallet seam
```

Run:

```powershell
node --test server/tests/platform-paypal-payment-protocol-codec.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Implement stable domain-separated request IDs**

Accept exact input:

```js
{
  operation: "create_recharge_order" | "capture_payment",
  requestRef
}
```

Return lowercase hexadecimal SHA-256 with a fixed safe prefix:

```js
const material = [
  "GCCWEBOS:PAYPAL_REQUEST:v1",
  operation,
  requestRef,
].join("\0");
return `gcc_${createHash("sha256").update(material, "utf8").digest("hex")}`;
```

The same operation/ref pair is stable. Create and capture with the same ref
must differ.

- [ ] **Step 3: Implement create and query codecs**

Create consumes the exact canonical create input and emits:

```js
{
  action: "paypal_orders_create",
  requestId: derivePayPalProviderRequestId({
    operation: "create_recharge_order",
    requestRef: input.providerRequestRef,
  }),
  body: {
    intent: "CAPTURE",
    purchase_units: [{
      custom_id: input.paymentOrderRef,
      amount: {
        currency_code: input.currency,
        value: formatPaymentAmountMinor(
          input.amountMinor,
          input.currencyExponent,
        ),
      },
    }],
  },
}
```

Reject unless `input.paymentMethod === "paypal"` and the exact
currency/exponent pair is compiled in the Phase 1 synthetic allowlist.

The create decoder accepts only:

```js
{
  id,
  status,
  links: [{ rel, href }]
}
```

`links` is a dense array of at most 16 exact two-key data objects. The decoder
accepts an action only when exactly one link across the complete array has rel
`approve` or `payer-action`; zero or multiple reviewed links are ambiguous.
Unreviewed exact links are ignored. The accepted action uses the canonical
input expiry:

| Provider status and link state | Canonical result |
| --- | --- |
| `CREATED` or `PAYER_ACTION_REQUIRED` with exactly one reviewed action link | `entry_ready / possibly_charged` |
| `APPROVED` with no action link | `pending / possibly_charged` |
| every other, missing, or ambiguous combination | `reconciliation_required / unknown` |

Core applies the compiled redirect-origin allowlist through
`normalizePaymentOperationResult`. No create response becomes
`failed_no_charge`.

Query emits only `paypal_orders_query` plus `providerOrderRef`. Its decoder
accepts only `{ id, status }`, requires the response order ID to match, and
maps:

| Provider status | Canonical result |
| --- | --- |
| `CREATED`, `APPROVED` | `pending / possibly_charged` |
| `COMPLETED` | `succeeded / confirmed_charged` |
| every other value | `reconciliation_required / unknown` |

Query returns no fact and no capture descriptor.

- [ ] **Step 4: Implement capture codec and raw fact**

Capture consumes the exact seven-field capture input. A completed synthetic
provider response is exactly:

```js
{
  id,
  status: "COMPLETED",
  purchase_units: [{
    custom_id,
    payments: {
      captures: [{
        id,
        status: "COMPLETED",
        amount: {
          currency_code,
          value
        }
      }]
    }
  }]
}
```

An `APPROVED`, `PAYER_ACTION_REQUIRED`, or other non-completed fixture is
exactly `{ id, status, purchase_units: [] }`. The success response must have
one matching order, one purchase unit, one completed capture, the internal
`custom_id`, and an exact amount:

```js
{
  sourceType: "authenticated_capture_response",
  providerEventRef: null,
  eventDedupeKey,
  eventType: "payment_succeeded",
  paymentOrderRef: input.paymentOrderRef,
  providerOrderRef: input.providerOrderRef,
  providerCaptureRef,
  providerRefundRef: null,
  amountMinor: input.amountMinor,
  currency: input.currency,
  currencyExponent: input.currencyExponent,
  merchantScopeDigest,
  payloadDigest,
  occurredAt: receivedAt,
  verificationResult: "verified"
}
```

The decoder parses provider decimal text with
`parsePaymentAmountMinor`; it never converts through a floating-point value.
It rejects mismatched internal/order refs, amount, currency, exponent,
missing/duplicate captures, or missing capture ID. Capture status mapping is
exactly:

| Provider status | Canonical result |
| --- | --- |
| `COMPLETED` with the complete matching capture | `succeeded / confirmed_charged` plus the raw fact |
| `APPROVED` or `PAYER_ACTION_REQUIRED` | `pending / possibly_charged` and `paymentFact: null` |
| every other shape-valid provider status | `reconciliation_required / unknown` and `paymentFact: null` |

The raw fact must fail `normalizeVerifiedPaymentEvent` because only
credential-scoped execution can brand it. A synthetic credential-scoped
execution configured with the test profile, `paypal_v1`, an injected loader,
an injected request function, and the compiled action origins must:

1. await the capture descriptor through `context.request`;
2. decode `transportResult.response` using both digest values from
   `transportResult.evidence`;
3. return `{ transportReceipt, captureOutcome }`;
4. receive the canonical outcome with the private
   authenticated-capture brand.

A malformed response, missing or duplicate purchase unit/capture, order or
custom-ID mismatch, money mismatch, exponent mismatch, or missing capture ID
throws `TypeError("invalid_paypal_protocol")`; it never returns a
reconciliation outcome.

- [ ] **Step 5: Implement detached webhook verification mapping**

`encodePayPalWebhookVerificationRequest` consumes the canonical bounded
callback input, extracts only these lowercase headers, and decodes the
synthetic JSON event:

```text
paypal-auth-algo
paypal-cert-url
paypal-transmission-id
paypal-transmission-sig
paypal-transmission-time
```

It returns the semantic `paypal_webhook_verify` descriptor. It does not add a
webhook ID, OAuth token, endpoint, or network call; a future credential-scoped
transport owns those values.

Each of the five required lowercase headers must occur exactly once. A missing,
empty, or duplicate required header rejects; unrelated already-validated
headers are ignored. `transmission` is the exact deeply frozen object:

```js
{
  authAlgo,
  certUrl,
  transmissionId,
  transmissionSig,
  transmissionTime
}
```

`webhookEvent` is the deeply frozen, detached exact ordinary-data snapshot
parsed from `callbackInput.bodyBase64`; every nested object uses only the keys
shown below and extra keys reject. Synthetic header fixtures use only
`https://cert.synthetic.invalid/paypal.pem` and synthetic identifiers.

`decodeVerifiedPayPalWebhook` accepts an exact synthetic verification response
`{ verification_status }`, where the only recognized values are `"SUCCESS"`
and `"FAILURE"`. `"FAILURE"` throws
`TypeError("invalid_paypal_protocol")` and returns no fact. `"SUCCESS"` may
decode only this exact
`PAYMENT.CAPTURE.COMPLETED` event:

```js
{
  id,
  event_type: "PAYMENT.CAPTURE.COMPLETED",
  resource: {
    id,
    status: "COMPLETED",
    custom_id,
    supplementary_data: {
      related_ids: {
        order_id
      }
    },
    amount: {
      currency_code,
      value
    }
  }
}
```

The mapping is:

```text
resource.custom_id -> paymentOrderRef
resource.supplementary_data.related_ids.order_id -> providerOrderRef
resource.id -> providerCaptureRef
resource.amount -> amountMinor, currency, compiled currencyExponent
```

It builds a stable SHA-256-derived event dedupe key from transmission ID and
provider event ID and returns a raw `sourceType: "callback"` fact. Unknown
events, failed verification, ambiguous references, malformed amounts, and
money/reference mismatches throw `TypeError("invalid_paypal_protocol")` and
return no fact. Unsupported currency/exponent pairs throw
`TypeError("provider_contract_unverified")`.

Exercise the complete synthetic path:

```text
encoder
  -> injected request spy
  -> synthetic SUCCESS verification result plus digest evidence and receipt
  -> decoder
  -> { transportReceipt, paymentFact }
  -> credential-scoped receipt consumption and callback branding
```

The request spy count is 1 and global `fetch` count is 0.

- [ ] **Step 6: Run PayPal GREEN and commit**

```powershell
node --check server/services/platform/paypal-payment-protocol-codec.mjs
node --test `
  server/tests/platform-payment-money-codec.test.mjs `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-paypal-payment-protocol-codec.test.mjs `
  server/tests/platform-paypal-payment-adapter.test.mjs
```

Expected: exit 0 and `# fail 0`.

```powershell
git add -- `
  server/services/platform/paypal-payment-protocol-codec.mjs `
  server/tests/platform-paypal-payment-protocol-codec.test.mjs
git commit -m "feat: add paypal protocol codec"
```

### Task 5: Add the bounded XSD protocol evidence boundary

**Files:**

- Create:
  `server/services/platform/xsd-payment-protocol-boundary.mjs`
- Create:
  `server/tests/platform-xsd-payment-protocol-boundary.test.mjs`

**Interfaces:**

```js
export const XSD_DOCUMENTED_FIELD_ROLES;
export function classifyXsdQueryStatus(value);
export function classifyXsdCallbackStatus(value);
export function encodeXsdSuccessAck();
export function encodeXsdSignedCreateRequest(input);
export function verifyXsdCallbackSignature(input);
```

This module records observed semantics only. It does not claim an authoritative
wire key, signer, verifier, sandbox, retry policy, or action origin.

- [ ] **Step 1: Write the XSD RED tests**

Add tests with these exact names:

```text
XSD boundary exposes only frozen documented field roles
XSD query status classifier maps only documented values
XSD callback classifier remains unverified and never creates a payment fact
XSD acknowledgement codec emits the exact UTF-8 success body
XSD signer and verifier reject before inspecting hostile input
XSD boundary contains no guessed signing encoding or transport implementation
```

Run:

```powershell
node --test server/tests/platform-xsd-payment-protocol-boundary.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 2: Freeze the documented semantic field roles**

Export a deeply frozen object containing exactly:

```js
{
  create: [
    "merchant_order_ref",
    "amount",
    "notify_target",
    "return_target",
    "merchant_scope",
    "channel",
    "signature",
    "response_format",
    "attachment",
  ],
  query: [
    "merchant_order_ref",
    "merchant_scope",
    "signature",
  ],
  callback: [
    "merchant_order_ref",
    "provider_order_ref",
    "merchant_scope",
    "amount",
    "status",
    "signature",
    "attachment",
  ],
}
```

These are semantic roles, not copied merchant values or a sendable request.

- [ ] **Step 3: Implement fail-closed status and ACK codecs**

Return frozen exact classifier objects:

| Source | Value | Output |
| --- | --- | --- |
| query | `"3"` | `succeeded / confirmed_charged` |
| query | `"00"` | `pending / possibly_charged` |
| query | other | `reconciliation_required / unknown` |
| callback | `"1"` | `payment_succeeded / unverified` |
| callback | `"-1"` | `payment_pending / unverified` |
| callback | other | `reconciliation_required / unverified` |

Neither classifier returns a payment fact. XSD query success remains an
observation and cannot authorize settlement. The callback classifier must not
include the 15-field payment-fact shape and must fail
`normalizeVerifiedPaymentEvent`.

The pure ACK codec returns exactly:

```js
Object.freeze({
  statusCode: 200,
  contentType: "text/plain",
  body: "SUCCESS",
});
```

The disabled `xsd_v1.webhookSuccessAck()` still rejects, and no sender exists.

- [ ] **Step 4: Make signing and verification explicitly unavailable**

Both functions throw a safe error before reading their argument:

```js
function unverified() {
  throw new Error("provider_contract_unverified");
}

export function encodeXsdSignedCreateRequest() {
  return unverified();
}

export function verifyXsdCallbackSignature() {
  return unverified();
}
```

Use accessor and Proxy counters to prove zero reads. The source must not contain
an MD5 call, field sorting/concatenation, charset selection, form encoder,
digest-case transform, credential read, or transport.

- [ ] **Step 5: Run XSD GREEN and commit**

```powershell
node --check server/services/platform/xsd-payment-protocol-boundary.mjs
node --test `
  server/tests/platform-xsd-payment-protocol-boundary.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs
```

Expected: exit 0 and `# fail 0`.

```powershell
git add -- `
  server/services/platform/xsd-payment-protocol-boundary.mjs `
  server/tests/platform-xsd-payment-protocol-boundary.test.mjs
git commit -m "feat: add bounded xsd protocol evidence"
```

### Task 6: Enforce the Phase 1 runtime source boundary

**Files:**

- Create:
  `server/tests/helpers/payment-provider-source-boundary.mjs`
- Create:
  `server/tests/platform-payment-provider-source-boundary.test.mjs`
- Verify unchanged:
  `server/services/platform/payment-routing-policy.mjs`
- Verify unchanged:
  `server/tests/platform-payment-routing-policy.test.mjs`

**Interfaces:**

- Consumes: the Phase 1 runtime module graph
- Produces: a recursive static-import and forbidden-seam test

```js
export function extractStaticModuleSpecifiers(source, modulePath);
export function assertProviderModuleSourceBoundary(input);
export async function collectProviderModuleGraph(input);
```

Exact inputs/outputs:

```text
extractStaticModuleSpecifiers(source, modulePath)
  source: string
  modulePath: normalized repository-relative string
  returns: frozen sorted string array

assertProviderModuleSourceBoundary({
  modulePath,
  source
})
  returns: the frozen sorted allowed specifier array

collectProviderModuleGraph({
  rootModulePaths,
  readSource
})
  rootModulePaths: dense array of normalized repository-relative strings
  readSource: injected async function(modulePath) -> UTF-8 string
  returns: frozen sorted repository-relative module-path array
```

The only valid module-path grammar is:

```text
^server/services/platform/[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$
```

The only valid relative static specifier grammar is:

```text
^\./[a-z0-9]+(?:-[a-z0-9]+)*\.mjs$
```

This rejects empty input, uppercase, NUL, backslash, duplicate slash, `.`,
`..`, nested directories, query, fragment, scheme, and percent-encoded path
forms without normalization. Validate every root before `readSource`; validate
every derived sibling path before enqueueing it. Duplicate valid roots are
deduplicated before the first read, and graph order never changes the sorted
result. A non-string `readSource` result is `graph_read_failed`.

Each object and array is an exact ordinary data shape. Errors contain only a
fixed rule key and normalized repository-relative module path; they never
contain a specifier, source excerpt, matched value, URL, or filesystem
absolute path.

The only error rule keys are:

```text
invalid_module_path
invalid_module_declaration
forbidden_module_specifier
forbidden_source_seam
graph_escape
graph_read_failed
```

The exact safe message is
`payment_provider_source_boundary:<rule>:<modulePath>`. Validate `modulePath`
before interpolating it; invalid path input uses the fixed safe sentinel
`<invalid>` instead of the supplied value.

- [ ] **Step 1: Write rule-level RED tests against the missing scanner**

Create the test file first. Import:

```js
import {
  assertProviderModuleSourceBoundary,
  collectProviderModuleGraph,
  extractStaticModuleSpecifiers,
} from "./helpers/payment-provider-source-boundary.mjs";
```

Add in-memory tests with these exact names:

```text
source scanner extracts multiline imports side-effect imports and export-from declarations
source scanner rejects dynamic imports require bare packages parent traversal and network built-ins
source scanner rejects environment HTTP Store wallet UI router listener and server seams
source scanner fails closed on an unparsed module declaration
source scanner reports only normalized module paths and rule names
source scanner validates roots before reads deduplicates roots and redacts read failures
```

Run:

```powershell
node --test server/tests/platform-payment-provider-source-boundary.test.mjs
```

Expected RED: `ERR_MODULE_NOT_FOUND` for the scanner helper. This is a
rule-level RED because the tests and hostile fixtures exist but no scanner can
enforce them.

- [ ] **Step 2: Implement the deterministic scanner**

The helper exports exactly the three functions imported above. The static
declaration extractor uses this fail-closed grammar:

```js
const STATIC_MODULE_DECLARATION_RE =
  /^(?:[ \t]*import[ \t]+(?:[^;]*?[ \t]+from[ \t]+)?|[ \t]*export[ \t]+(?:\*|\{[^;]*\})[ \t]+from[ \t]+)["']([^"'\r\n]+)["'][ \t]*;[ \t]*$/gmu;
```

It records every match range and masks those ranges while preserving newlines.
Because this boundary intentionally rejects dormant tokens in comments and
strings, it then rejects any remaining whole-word `import`, `require`, or
`createRequire`, plus any remaining `export`-through-`from` form before the next
semicolon:

```js
/\bimport\b/u
/\brequire\b/u
/\bcreateRequire\b/u
/\bexport\b(?:(?!;)[\s\S])*?\bfrom\b/u
```

Allowed specifiers are only:

```text
node:util
node:net
node:crypto
./ followed by a normalized sibling .mjs path
```

Reject a relative specifier containing `..`, a backslash, URL scheme, query,
fragment, empty segment, or a segment matching
`store|sqlite|wallet|portal|admin|route|router|listener|server`
case-insensitively. Resolve the path and assert it remains under
`server/services/platform`.

The source-seam assertion is deliberately lexical and conservative. After
static module declarations are masked, reject the presence of:

```text
whole-word process
whole-word fetch
XMLHttpRequest
axios
undici
readFile
readFileSync
createReadStream
dotenv
whole-word Store or SQLite
whole-word wallet, Portal, Admin, route, router, listener, or server
```

Word checks are case-insensitive. A forbidden token in dormant code, a string,
or a comment still fails: Phase 1 provider production modules must not carry a
latent runtime seam. The approved abstract identifiers `credentialLoader`,
`withCredential`, `credentialHandle`, and `context.request` are not forbidden.

The adversarial fixture table must include multiline static import,
side-effect import, `export * from`, `export { name } from`, dynamic import,
`require`, `createRequire`, `axios`, `undici`, `node:http`, `node:https`,
`node:fs`, parent traversal, backslash traversal, `process.env`, `fetch`,
`XMLHttpRequest`, Store, SQLite, wallet, Portal, Admin, route, router,
listener, and server imports. It also includes these exact lexical bypass
attempts, all of which must reject:

```js
/*x*/ import "./evil.mjs";
; import "./evil.mjs";
import /*x*/ ("./evil.mjs");
require /*x*/ ("evil");
fetch /*x*/ ("https://network.invalid");
process /*x*/ . env;
```

The path table covers empty, uppercase, NUL, `//`, `/./`, `/../`, backslash,
nested directory, query, fragment, scheme, percent encoding, duplicate valid
roots, a throwing `readSource`, and a non-string `readSource` result. Invalid
roots must fail before the read spy increments; duplicate valid roots are read
once.

- [ ] **Step 3: Apply the scanner to the complete Phase 1 graph**

Root the graph at:

```text
server/services/platform/payment-money-codec.mjs
server/services/platform/payment-provider-adapter-contract.mjs
server/services/platform/payment-provider-adapter-registry.mjs
server/services/platform/payment-provider-adapter-template.mjs
server/services/platform/unverified-payment-adapter.mjs
server/services/platform/paypal-payment-adapter.mjs
server/services/platform/xsd-payment-adapter.mjs
server/services/platform/chaojipay-payment-adapter.mjs
server/services/platform/paypal-payment-protocol-codec.mjs
server/services/platform/xsd-payment-protocol-boundary.mjs
```

Recursively follow only static relative `.mjs` imports. Allow Node built-ins:

```text
node:util
node:net
node:crypto
```

Reject:

```text
dynamic import()
require or createRequire
process.env
global fetch or another HTTP client
node:http, node:https, node:fs
Store or SQLite imports
wallet, Portal, Admin, router, route, listener, or server imports
environment/file credential loaders
```

The last rule forbids filesystem-backed or `process.env`-backed credential
loader imports/APIs. It must not reject the abstract `credentialLoader`,
`withCredential`, or opaque credential-handle contract already owned by
Provider Core.

Add a residue scan over:

```text
server/services/platform
server/tests
docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md
docs/COMMERCIAL_MODEL_V1.md
```

It must reject:

```text
provisional_provider_a_v1
provisional_provider_b_v1
createProviderAPaymentAdapter
createProviderBPaymentAdapter
provider-a-payment-adapter.mjs
provider-b-payment-adapter.mjs
```

Do not scan the approved design specification for residue because it records
the historical replacement decision. Exclude the source-boundary test itself
from the residue corpus because it contains the forbidden token table.

Separately assert that the tracked file
`server/services/platform/portal-payment-checkout.mjs` is absent and scan
production source under `server`, excluding `server/tests`, for the old runtime
symbols `createCheckoutOrder`, `captureCheckout`, `verifyWebhook`, and
`/api/portal/payments`. Existing negative test assertions may retain those
strings.

Graph collection must:

- accept and return only paths matching the exact repository-relative grammar
  above;
- resolve each `./name.mjs` import against the importing module with POSIX
  string-path rules, never a process working directory;
- catch every injected `readSource` failure and replace it with the safe
  `graph_read_failed` rule rather than leaking the underlying exception;
- reject non-file relative specifiers and unapproved Node built-ins;
- parse static import declarations without evaluating source modules;
- visit each resolved path once;
- sort paths before assertions and failure messages;
- report only repository-relative module paths and rule names;
- never print source content or matched values.

The scanner helper imports no filesystem API. The test file owns the only read
adapter:

```js
const REPO_ROOT_URL = new URL("../../", import.meta.url);

async function readSource(modulePath) {
  // The helper has already validated the normalized repository-relative path.
  return readFile(new URL(modulePath, REPO_ROOT_URL), "utf8");
}
```

The test imports `readFile` from `node:fs/promises`; neither that test-only
import nor the helper belongs to the scanned production graph.

Run:

```powershell
node --test `
  server/tests/platform-payment-provider-source-boundary.test.mjs `
  server/tests/platform-payment-routing-policy.test.mjs
```

Expected: exit 0 and `# fail 0`. The routing test must still prove fallback is
limited to the three safe table cases and all uncertain post-dispatch states
reconcile.

- [ ] **Step 4: Commit the boundary test**

```powershell
git add -- `
  server/tests/helpers/payment-provider-source-boundary.mjs `
  server/tests/platform-payment-provider-source-boundary.test.mjs
git commit -m "test: enforce payment adapter source boundary"
```

### Task 7: Align current documentation and close the source-only PR

**Files:**

- Modify:
  `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md`
- Modify:
  `docs/COMMERCIAL_MODEL_V1.md`
- Modify:
  `docs/README.md`
- Verify:
  `docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md`
- Verify:
  `docs/superpowers/plans/2026-07-24-payment-provider-adapter-v1-phase1.md`

**Interfaces:**

- Consumes: final source/test facts
- Produces: an indexed source-only status that does not claim provider,
  runtime, deployment, or production completion

- [ ] **Step 1: Update the Adapter template document**

State exactly:

- canonical surface is 13 keys and includes `capturePayment`;
- capabilities are the eight frozen V1 flags;
- canonical methods include `paypal`;
- the static Registry contains the three named identities;
- every named Adapter is `unverified`, all capabilities are false, and
  supported methods are empty;
- PayPal/XSD protocol codecs are synthetic/detached evidence only;
- ChaoJiPay is identity-only;
- money inputs/facts include an explicit currency exponent;
- no provider call, credential, Store/schema, callback route, wallet
  settlement, UI, runtime activation, or production deployment exists.

Keep the legacy environment-summary helper explicitly independent and
unregistered.

- [ ] **Step 2: Update commercial policy and docs index**

In `docs/COMMERCIAL_MODEL_V1.md`, replace “disabled provisional Adapters” with
the exact three named, disabled, unverified identities. Do not state that any
provider is selected, verified, available, or live.

In `docs/README.md`, add adjacent entries for:

```text
docs/superpowers/specs/2026-07-24-payment-provider-adapter-v1-design.md
docs/superpowers/plans/2026-07-24-payment-provider-adapter-v1-phase1.md
```

Both entries must say source-only, no execution/production authority, and list
the deferred Risk A boundaries.

- [ ] **Step 3: Run the complete focused suite**

```powershell
node --test `
  server/tests/platform-payment-money-codec.test.mjs `
  server/tests/platform-payment-provider-adapter-contract.test.mjs `
  server/tests/platform-payment-provider-adapter-registry.test.mjs `
  server/tests/platform-payment-provider-adapter-template.test.mjs `
  server/tests/platform-paypal-payment-adapter.test.mjs `
  server/tests/platform-xsd-payment-adapter.test.mjs `
  server/tests/platform-chaojipay-payment-adapter.test.mjs `
  server/tests/platform-paypal-payment-protocol-codec.test.mjs `
  server/tests/platform-xsd-payment-protocol-boundary.test.mjs `
  server/tests/platform-payment-provider-source-boundary.test.mjs `
  server/tests/platform-payment-routing-policy.test.mjs
```

Expected: exit 0, `# fail 0`, and no skipped test in this focused list.

- [ ] **Step 4: Run repository and documentation gates**

```powershell
npm test
npm run docs:authority:check
git diff --check
git diff --check a5c80f44a47389d65907ba1cdd58649a1e41ac83...HEAD
git status --short --branch
```

Expected:

```text
npm test: exit 0 and 0 failed
docs authority: validated with exit 0
working-tree and committed diff checks: no output and exit 0
status: only the intended documentation changes remain before their commit
```

Record the exact final pass/skip counts. A test failure, unexpected skip,
warning that changes semantics, or unrelated dirty path blocks completion.

- [ ] **Step 5: Commit documentation alignment**

```powershell
git add -- `
  docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md `
  docs/COMMERCIAL_MODEL_V1.md `
  docs/README.md
git commit -m "docs: align payment provider adapter v1"
```

- [ ] **Step 6: Re-run final identity and diff checks**

```powershell
git status --short --branch
git log --oneline --decorate -10
git diff --name-status a5c80f44a47389d65907ba1cdd58649a1e41ac83...HEAD
git diff --check a5c80f44a47389d65907ba1cdd58649a1e41ac83...HEAD
```

Expected:

```text
clean worktree
one coherent Phase 1 commit series after the design, correction, and plan commits
only the exact files named by this plan
no diff-check output
```

The completion report must classify status as:

```text
confirmed local source: Provider Core V1 and disabled named Adapters
synthetic protocol evidence only: PayPal and XSD codecs
unverified: every real provider capability and environment
not implemented: Payment Store, callback runtime, wallet settlement, Portal/Admin
not deployed: all Phase 1 work
```

Do not push, open/ready/merge a PR, call a provider, migrate a database, or
deploy as part of this task. Those actions require a new explicit user
instruction and, where applicable, a separate Risk A gate.
