# CNY Payment Provider Single-Active Assembly Design

**Status:** Approved design, implementation pending
**Risk:** B source change inside a future Risk A provider-activation boundary
**Expected PR count:** 1 follow-up PR after PR #577
**Source evidence baseline:** `d2636c5e0b8cd2798fa0c92dce4679f640576c32`
**Production state:** `not_deployed`
**Identity impact:** `false`

## Goal

Connect the already implemented PayPal Sandbox, XSD, and ChaoJiPay payment
runtimes to the control-plane composition through a strict single-active
provider model. The source must remain default-off and must preserve the
existing Payment Store, Coins Wallet, recharge-order, and Portal contracts.

This design does not activate a provider. It prepares an exact, fail-closed
assembly path that can later be configured and validated through separate
provider-specific Risk A gates.

## Current Source Facts

At the evidence baseline:

- the static Adapter Registry compiles `paypal_v1`, `xsd_v1`, and
  `chaojipay_v1`;
- PayPal Sandbox is the only runtime imported and assembled by
  `server/state.mjs`;
- XSD and ChaoJiPay codecs, runtimes, credential scopes, signatures,
  callbacks, and acknowledgements are covered by synthetic tests but remain
  absent from application state and HTTP routes;
- the recharge coordinator binds exactly one Adapter, payment method, and
  merchant binding;
- the Payment Store already persists immutable provider, merchant, method,
  amount, currency, exponent, and provider-order bindings;
- the Wallet already provides idempotent `paid_coins` settlement and unique
  credit-origin enforcement; and
- the Portal create-order request contains only `offerRef` and
  `idempotencyKey` and does not select a provider or payment method.

PR #577 remains the source dependency for this design. Implementation must not
begin from a stale stacked base: after #577 is merged, the follow-up branch
must be rebased or recreated from the resulting exact `master` commit before
implementation validation and PR creation.

## Scope

### In scope

- Generalize control-plane recharge assembly from PayPal-only to exactly one
  active provider.
- Preserve the existing PayPal Sandbox configuration contract.
- Add default-off XSD and ChaoJiPay provider-specific configuration branches.
- Use one independent Runtime, Registry, resolved Adapter, and Coordinator for
  the selected provider.
- Register one provider-bound callback path when recharge is enabled.
- Keep the other callback paths explicitly unavailable.
- Use the immutable production CNY price book for XSD and ChaoJiPay.
- Bind one payment method to each active Coordinator instance.
- Harden XSD and ChaoJiPay outbound API origins to exact source-owned values.
- Add full synthetic HTTP callback-to-Store-to-Wallet tests.

### Out of scope

- More than one active provider at a time.
- Automatic provider fallback or provider switching.
- A dynamic `/:provider` callback route.
- Provider selection or payment-method selection in Portal requests.
- Simultaneous Alipay and WeChat selection for XSD.
- New Portal or Admin UI.
- Schema, migration, Payment Store semantics, Wallet ledger semantics, Coins
  price changes, marketplace orders, fulfillment, refund, or chargeback work.
- XSD query as settlement authority.
- ChaoJiPay query support.
- Production credentials, provider calls, callback registration, public
  ingress mutation, deployment, activation, or real-money testing.

## Selected Approach

Use the existing provider-specific enable flags rather than introducing a new
generic provider selector or a multi-provider dispatcher.

The configuration model is backward-compatible with PayPal Sandbox, keeps the
current single-Coordinator architecture, and permits one-provider-at-a-time
canaries without changing the Portal or order contract. Adding a provider
requires a new explicit provider branch and tests; unrecognized environment
values cannot dynamically select an Adapter.

## Enablement Contract

The top-level flag remains:

```text
PLATFORM_COIN_RECHARGE_ENABLED
```

Provider flags are:

```text
PLATFORM_PAYPAL_SANDBOX_ENABLED
PLATFORM_XSD_PAYMENT_ENABLED
PLATFORM_CHAOJIPAY_PAYMENT_ENABLED
```

The state constructor applies these rules before reading provider-specific
configuration:

1. When the top-level flag is false, all three provider flags must be false.
2. When the top-level flag is true, exactly one provider flag must be true.
3. A mismatch or multiple true provider flags is a startup error.
4. Disabled provider configuration must not be read, normalized, logged, or
   passed to a factory.
5. Merely supplying credential/configuration values never enables a provider.

When disabled, state exposes:

```js
{
  coinRechargeEnabled: false,
  paymentRechargeProvider: null,
  paymentRechargeCoordinator: null,
}
```

When enabled, `paymentRechargeProvider` is one fixed internal enum value:

```text
paypal_sandbox
xsd
chaojipay
```

It is derived only from the exact provider flags. It is never accepted from an
HTTP request, order, callback body, generic `PAYMENT_PROVIDER` variable, or
unvalidated JSON.

## Provider Configuration

### PayPal Sandbox

The existing variables and behavior remain unchanged:

```text
PLATFORM_COIN_RECHARGE_USD_OFFERS_JSON
PLATFORM_PAYPAL_SANDBOX_CLIENT_ID
PLATFORM_PAYPAL_SANDBOX_CLIENT_SECRET
PLATFORM_PAYPAL_SANDBOX_WEBHOOK_ID
PLATFORM_PAYPAL_SANDBOX_MERCHANT_SCOPE_DIGEST
PLATFORM_PAYPAL_CALLBACK_URL
PLATFORM_PAYPAL_RETURN_URL
```

The API and approved action origins remain fixed to the existing Sandbox
contract.

### XSD

XSD enablement requires:

```text
PLATFORM_XSD_PAYMENT_METHOD
PLATFORM_XSD_MERCHANT_ID
PLATFORM_XSD_MERCHANT_SECRET
PLATFORM_XSD_MERCHANT_SCOPE_DIGEST
PLATFORM_XSD_CALLBACK_URL
PLATFORM_XSD_RETURN_URL
PLATFORM_XSD_ALLOWED_ACTION_ORIGINS_JSON
```

`PLATFORM_XSD_PAYMENT_METHOD` accepts exactly `alipay` or `wechat_pay`.
The active instance binds one of them for all offers and orders. Supporting
both at the same time requires a later Portal/API design.

The outbound API origin is fixed in source to
`https://www.xsd8866.com`. The runtime must reject any other API origin before
credential use or `fetch`. The callback URL must be an absolute,
credential-free HTTPS URL with the exact callback path defined below and no
query or fragment. The return URL must be an absolute, credential-free HTTPS
URL. Every allowed action origin must be an exact origin string with no path,
query, fragment, or credentials, and the list must be non-empty, unique, and
bounded.

### ChaoJiPay

ChaoJiPay enablement requires:

```text
PLATFORM_CHAOJIPAY_MERCHANT_ID
PLATFORM_CHAOJIPAY_MERCHANT_SECRET
PLATFORM_CHAOJIPAY_MERCHANT_SCOPE_DIGEST
PLATFORM_CHAOJIPAY_CALLBACK_URL
PLATFORM_CHAOJIPAY_ALLOWED_ACTION_ORIGINS_JSON
PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP
```

The payment method is fixed to `wechat_pay`. The outbound API origin is fixed
in source to `https://payment.chaojipay.me`, and the runtime must reject any
other origin before credential use or `fetch`. The callback URL and action
origin list obey the same absolute HTTPS, credential-free, exact-path/origin,
unique, non-empty, and bounded rules as XSD.

`PLATFORM_CHAOJIPAY_CREATE_REQUEST_IP` must be a syntactically valid public
IPv4 address. Source validation does not establish whether the provider means
the payer IP or merchant egress IP. A production Risk A gate must resolve and
bind that meaning before activation.

### Credential handling

Credential values are read only inside the selected provider branch. Each
provider receives a dedicated credential loader and transport through its own
Registry instance. No composite credential loader is introduced, and no
credential can be selected by a callback or order field.

Configuration errors use generic startup errors. Credentials, signing
material, merchant values, raw callback bodies, and provider responses are
never included in exceptions, logs, status projections, or HTTP responses.

## Runtime Assembly

For the selected provider, state performs this sequence:

1. Validate Portal, Wallet, and recharge prerequisites.
2. Read and strictly validate only the selected provider configuration.
3. Build the provider-specific immutable offer catalog.
4. Create the provider Runtime with a fixed API origin, exact route map,
   explicit action-origin allowlist, injected `fetchFn`, and `nowFn`.
5. Create one static Adapter Registry using only that Runtime's credential
   loader and transport.
6. Resolve the provider's fixed Adapter key, profile, credential profile, and
   compiled capability declaration.
7. Decorate the resolved Adapter with one fixed `paymentMethod` and one fixed
   `merchantBindingRef`.
8. Open the existing Payment Store and create one recharge Coordinator using
   the existing Wallet.
9. Expose only the safe provider enum and Coordinator to `app.mjs`.

Runtime construction must not call `fetch`, contact a provider, create a
payment order, write the Payment Store, or write the Wallet.

Provider bindings are code-owned, not request-owned:

| Provider | Adapter | Payment method | Catalog | Runtime capabilities used |
| --- | --- | --- | --- | --- |
| PayPal Sandbox | `paypal_v1` | `paypal` | Existing USD Sandbox offers | create, query, capture, callback |
| XSD | `xsd_v1` | Configured `alipay` or `wechat_pay` | Immutable CNY price book | create, query, callback; no capture |
| ChaoJiPay | `chaojipay_v1` | `wechat_pay` | Immutable CNY price book | create, callback; no query/capture |

XSD query capability remains internal Adapter capability only. This change
does not expose a query route and does not treat a query projection as a
verified payment fact.

## HTTP Callback Routing

Callback routes are static and case-sensitive:

```text
POST /api/platform/payments/paypal/callback
POST /api/platform/payments/xsd/callback
POST /api/platform/payments/chaojipay/callback
```

Only the selected provider's route is mounted. The other two routes return 404
through the application's disabled-route boundary. A provider callback path
never selects a provider dynamically.

PayPal retains its existing raw JSON body and exact verification-header
handling.

XSD and ChaoJiPay routes:

- reject query strings;
- accept only the provider runtime's exact form content types;
- retain the raw request bytes rather than using `express.urlencoded()`;
- enforce a 16,384-byte body limit;
- reject missing or duplicate content-type headers before Coordinator use;
- pass exactly one normalized `content-type` header entry to the Adapter;
- derive `callbackRequestRef` from a provider-specific prefix and SHA-256 of
  the raw body; and
- return only the Adapter's normalized acknowledgement.

The callback body cannot select the Coordinator, Adapter, payment method,
merchant binding, offer, or Wallet account.

## Order And Settlement Data Flow

The Portal request remains:

```json
{
  "offerRef": "<safe reference>",
  "idempotencyKey": "<safe reference>"
}
```

The selected Coordinator fixes `adapterKey`, `paymentMethod`, and
`merchantBindingRef` when creating the order. The existing Payment Store
persists those bindings with the immutable quote, amount, currency, exponent,
expected Coins, provider-order reference, and expiry.

The callback flow is:

1. The static provider route preserves raw callback bytes.
2. The provider-bound Adapter verifies the signature inside its exact
   credential scope.
3. A signed non-settlement status produces an acknowledgement-only result.
4. A verified success fact is matched against the persisted order's provider,
   merchant, payment method, provider order, amount, currency, and exponent.
5. The Payment Store records the verified payment receipt with its stable
   provider event identity.
6. The Wallet credits one `paid_coins` lot using the existing idempotent
   settlement operation and credit-origin uniqueness boundary.
7. The Payment Store closes or replays the order to `credited` using the same
   Wallet receipt.
8. Only after the order is durably `credited` does the route send the provider
   success acknowledgement.

This design does not change Payment Store or Wallet schemas or semantics.

## Failure And Retry Semantics

### Disabled and invalid configuration

- Disabled routes return 404.
- Disabled providers cause zero credential/config getter, Runtime, Registry,
  Store, Wallet, clock, or network activity.
- A partial provider configuration, mismatched flags, multiple active
  providers, invalid method, invalid URL/origin, or invalid ChaoJiPay IP causes
  startup failure.
- No failure silently chooses another provider.

### Callback rejection

Invalid method, query, casing, trailing slash, content type, duplicate header,
body size, body encoding, field shape, signature, merchant, order, amount,
currency, exponent, or provider binding is rejected before settlement.

Expected protocol-level request errors may use a specific 4xx boundary such as
400, 404, 413, or 415. Verification, provider, Store, Wallet, or close failures
return a generic retryable failure without internal details. No rejected or
ambiguous callback writes Coins.

### Acknowledgements

Two callback outcomes may be acknowledged:

1. an authenticated, explicitly documented non-settlement provider status;
2. a verified success whose receipt, Wallet credit, and final order state are
   durably complete.

An unsigned, malformed, unknown, reconciliation-required, partially settled,
or unknown-charge callback is not acknowledged as success.

### Partial settlement recovery

If Wallet credit succeeds but the Payment Store close fails, the request does
not receive a success acknowledgement. A provider retry must reuse the same
verified receipt, Wallet operation, credit origin, and lot, then finish the
order close without duplicating Coins.

Unknown charge state always stops automatic processing. This design never
switches to another provider and never treats absence of an acknowledgement as
proof of no charge.

## Security Boundaries

- Provider API origins are exact source constants, not generic environment
  destinations.
- Action URLs remain constrained by an explicit HTTPS origin allowlist that a
  provider response cannot expand.
- Each provider has an independent Registry, credential loader, transport,
  profile, credential profile, merchant binding, and Coordinator.
- All callback verification remains credential-scoped.
- Adapter capability declarations are fixed in code and cannot be supplied by
  HTTP or unvalidated JSON.
- Routes do not import provider Runtime or credential modules directly; state
  remains the only authorized application composition root.
- Provider callbacks cannot infer XSD's payment method from the callback body;
  the configured Coordinator and persisted order remain authoritative.
- No automatic provider fallback exists.
- No raw credential, callback body, provider response, signature material,
  customer identity, or SQLite row is emitted as evidence.

## TDD And Validation

Implementation begins with failing tests and adds the minimum production code
to make each boundary pass.

### State tests

- Default-off getter tripwires prove zero reads of all provider-specific
  variables and zero Runtime/Store/Wallet/fetch activity.
- Top-level/provider mismatch and multiple-provider enablement fail startup.
- Each provider fails startup on incomplete or malformed configuration.
- Complete configuration builds exactly one provider stack without a provider
  call at startup.
- Existing PayPal Sandbox configuration and behavior remain compatible.

### Runtime and Registry tests

- XSD and ChaoJiPay reject a non-exact API origin before credential use and
  fetch.
- Each selected provider uses its own loader, transport, profile, credential
  profile, and merchant binding.
- A wrong Adapter/profile/merchant binding rejects before fetch.
- Effective capabilities never exceed compiled capabilities.

### Route tests

- All three callback paths are 404 when recharge is disabled.
- Enabling one provider exposes only its callback path.
- PayPal enablement does not expose either CNY route.
- XSD enablement does not expose ChaoJiPay, and the reverse.
- Method, query, case, trailing-slash, content-type, duplicate-header,
  16,384-byte, and 16,385-byte boundaries are covered.
- Raw bytes are forwarded without re-encoding.
- Error responses contain no sensitive or internal data.

### Full synthetic settlement tests

At least one test per CNY provider uses the real Adapter, Runtime, Coordinator,
temporary Payment Store, and temporary Wallet SQLite with only synthetic
credentials and provider responses.

Tests prove:

- a signed success creates one verified receipt, one Wallet operation, and one
  `paid_coins` lot;
- a duplicate callback does not duplicate any of them;
- a signed non-settlement status acknowledges with zero Wallet writes;
- bad signature, provider, merchant, payment method, order, amount, currency,
  exponent, or terminal state produces zero Coins;
- Wallet failure is not acknowledged;
- Wallet-success/order-close-failure replay completes without a second lot;
  and
- acknowledgement occurs only after durable `credited` state.

### Required validation

```text
focused provider/state/route/store/wallet tests
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

No test reads merchant credential files or calls a provider.

## Expected Source Surface

The implementation plan may refine exact test files, but the source boundary
is expected to remain limited to:

- `server/state.mjs`
- `server/app.mjs`
- `server/routes/portal-coin-recharge.mjs`
- `server/services/platform/xsd-payment-runtime.mjs`
- `server/services/platform/chaojipay-payment-runtime.mjs`
- the corresponding state, app/route, runtime, Registry/source-boundary, and
  full settlement tests
- this design and its implementation plan

No Payment Store, Wallet, schema, Portal UI, Admin UI, package dependency, or
production configuration file is expected to change. If implementation proves
that such a change is required, work stops and the design returns for review.

## Production And Activation Gates

Merging the source PR does not enable or deploy a provider. After an exact
`master` artifact exists, each provider requires its own Risk A sequence:

1. fresh production read-only inventory;
2. exact artifact, manifest, checksum, target, backup, and rollback identity;
3. protected credential-name and binding review without value disclosure;
4. callback/public-ingress registration and readback;
5. observed action-origin allowlist confirmation;
6. provider-specific ACK/retry and terminal-state confirmation;
7. ChaoJiPay request-IP semantic binding, where applicable;
8. unpaid create/query probes within documented provider capability;
9. one-provider-at-a-time small-value paid canary;
10. Payment Store, Wallet, order, and callback readback; and
11. rollback or promotion decision.

PayPal Sandbox, XSD, and ChaoJiPay activations remain separate. Approval for
one provider cannot be reused for another provider or for production
deployment.

## Acceptance Criteria

The source task is complete only when:

1. all four approved design sections are represented without contradiction;
2. the provider model is exactly single-active and default-off;
3. disabled state proves zero provider-related reads and side effects;
4. only the active provider callback is reachable;
5. XSD binds exactly one configured payment method per runtime instance;
6. provider API origins are exact and cannot be redirected by environment;
7. real source components complete synthetic callback-to-Wallet tests with
   exactly-once Coins credit;
8. partial settlement replay cannot duplicate Coins;
9. PayPal Sandbox remains compatible;
10. the required validation matrix passes for the exact head;
11. independent review reports no unresolved blocking finding; and
12. the PR continues to state `production_state: not_deployed` and grants no
    provider or production authority.
