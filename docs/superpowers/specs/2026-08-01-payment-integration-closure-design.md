# Payment Integration Closure Design

## Status

- Risk: A
- Process: one default-off source PR, local SQLite/TDD validation, then a
  separately approved PayPal Sandbox runtime Gate
- Expected source PR count: 1
- Release unit: `control-plane-app` and `portal-static`
- Frontend surface: `portal`
- Source baseline: `master@fea0daf5bee5c57297ae1de727bde6ce88d65cec`
- Production impact: none
- Production authority: none
- Design state: draft for written review
- Implementation state: not started

## Purpose

Close the already-designed Coins recharge path without creating a second
payment system, a second Coins ledger, or a replacement Portal checkout.

The first runtime validation target is PayPal Sandbox with USD. Production
commercial pricing remains CNY-based and requires a later independent Gate.
Sandbox and production may share stable recharge offer identities and Coin
denominations, but they use separate server-authoritative price books and
merchant bindings. Sandbox facts and credentials must never enter production.

## Existing Authority Reused

The implementation reuses these current-master capabilities:

- the canonical Payment Provider Adapter contract, registry, routing policy,
  credential-scoped execution boundary, money codec, and PayPal protocol codec;
- the existing Portal shell, recharge entry, denomination presentation,
  wallet view, and order center;
- the Coin Wallet Store's `paid_coins` lots, immutable ledger, credit origins,
  operation receipts, idempotency checks, and balance projection;
- the existing Commerce path that consumes Coins after a separate product
  order is created.

The current `paypal_v1` Adapter is disabled and unverified. The existing
legacy `/api/portal/payments/*` plan-checkout client and old direct checkout are
not the recharge integration target and must not regain authority.

## Selected Approach

Use one minimal in-process payment connection:

```text
Portal recharge selection
  -> authenticated server quote and payment order
  -> durable provider request receipt
  -> PayPal Sandbox approval and capture
  -> verified capture fact or verified callback
  -> durable accepted payment receipt
  -> existing Wallet Store creditCoins(paid_coins)
  -> wallet and recharge-order projection
```

Only payment facts that do not belong in the Wallet ledger are added. The
payment connection uses the existing control-plane process and SQLite database;
there is no queue, worker service, Redis dependency, microservice, or second
financial ledger.

Rejected alternatives:

- using only Wallet operation receipts, because they cannot represent an
  external payment before Coins are credited or preserve provider amount,
  currency, merchant, capture, and callback verification state;
- recreating the old in-memory PayPal checkout, because a restart between
  capture and Wallet credit would lose the settlement decision;
- storing raw callbacks, because provider/customer data is unnecessary once a
  verified normalized fact and payload digest exist;
- implementing every provider now, because the stable Adapter boundary lets
  later providers reuse the same order, receipt, settlement, and Portal path.

## Minimal Durable Model

The additive migration creates exactly two payment tables.

### `platform_payment_orders`

One row is the server-authoritative recharge intent. It contains only safe
business state:

- internal `payment_order_ref` and authenticated `account_id`;
- stable `offer_ref`, `quote_version`, and expected `paid_coin_units`;
- immutable `amount_minor`, uppercase `currency`, and explicit
  `currency_exponent`;
- selected `adapter_key` and safe payment method;
- safe merchant-binding reference, `status`, latest accepted receipt reference,
  Wallet operation/lot result references, `expires_at`, `created_at`, and
  `updated_at`;
- a safe quote digest and no client-supplied price authority.

An order never stores credentials, customer email, payer details, raw provider
responses, or a product entitlement. The account comes from the authenticated
Portal session, not request input.

### `platform_payment_receipts`

One append-only table represents safe create, query, capture, and callback
facts. It contains:

- internal receipt, order, attempt, and provider-request references;
- receipt type and canonical event/result state;
- provider order, capture, and event references when issued;
- event dedupe key, merchant-scope digest, payload digest, and verification
  result;
- the exact amount, currency, exponent, and expected Coin units copied from or
  checked against the immutable order;
- acceptance timestamp and no raw request/response body or headers.

Unique constraints cover local provider requests and verified external events.
The event identity is scoped by Adapter and merchant digest so two merchant
accounts cannot alias one event. Reusing a key with different money, order, or
payload facts is an idempotency conflict and fails closed.

Payment attempts and callback acceptance use this common receipt table rather
than separate attempt, callback-inbox, and settlement-ledger tables. Each
receipt row is inserted once; triggers reject changes to its identity, money,
merchant, verification, and digest fields. Recoverable settlement progress and
safe Wallet result references belong to the mutable payment-order state, not
the immutable provider fact.

## State And Settlement

The payment-order state machine is monotonic for the initial integration:

```text
created -> entry_ready -> pending -> payment_verified -> credited
   |            |           |
   +------------+-----------+-> failed_no_charge
                            +-> reconciliation_required
created | entry_ready | pending -> expired
```

Rules:

- a browser return, HTTP success alone, or an unverified callback never marks
  an order paid;
- amount, currency, exponent, order reference, merchant digest, and capture
  reference must match before `payment_verified`;
- a successful callback or authenticated capture response enters the same
  receipt acceptance path;
- the verified receipt is committed before provider acknowledgement or Wallet
  mutation;
- settlement calls the existing Wallet Store with `coinType: paid_coins`, the
  verified payment identity as `sourceRef`, and a domain-separated operation
  idempotency key;
- Wallet credit-origin uniqueness and operation receipts provide exactly-once
  Coins credit;
- if the process stops after Wallet credit but before the payment order becomes
  `credited`, replay receives the existing Wallet result and closes the order;
- if Wallet credit is temporarily unavailable, the accepted receipt remains
  retryable and the provider may be acknowledged only after durable acceptance;
- incompatible duplicate facts, unknown charge state, unsupported reversal,
  or contradictory provider observations enter `reconciliation_required` and
  never automatically credit Coins.

Refund, chargeback, and reversal settlement are excluded from the first
Sandbox closure. Such events are preserved as safe facts and fail closed for
manual reconciliation until an independently reviewed reversal policy exists.

## Server-Authoritative Offers And Currency

The Portal sends only a stable recharge offer identity and a client
idempotency key. It never sends authoritative Coins, fiat amount, currency, or
exchange rate.

The server resolves the active environment price book and snapshots all quote
facts into the payment order. Sandbox uses an independently configured USD
price book. A later production Gate may enable a CNY price book without
changing the payment-order, receipt, Wallet, or Portal contracts.

The first Sandbox Gate may expose only the explicitly approved test offer even
if the Portal can render the established `10 / 30 / 50 / 100 / 200 / 300`
Coins denominations. Missing or disabled offers remain unavailable rather than
receiving invented prices.

## Runtime And HTTP Boundary

New protected Portal endpoints own recharge operations rather than reviving
legacy direct checkout:

- list the current server-authoritative recharge offers;
- create one recharge payment order;
- read the authenticated account's recharge order;
- capture or refresh that order using its persisted provider references.

The provider callback endpoint is unauthenticated by Portal session but accepts
only bounded PayPal inputs and invokes credential-scoped provider verification.
It persists a verified safe receipt before returning the exact provider ACK.

The Portal client adds recharge-specific types and calls. It reuses the current
recharge dialog, wallet, and order-center surfaces; it does not use the legacy
plan identifiers, plan checkout endpoint, local synthetic payment order, or
direct subscription issuance path.

The entire runtime is default-off. Disabled state performs no credential load,
provider request, callback acceptance, payment row creation, or Wallet credit.

## PayPal Sandbox Boundary

The existing PayPal protocol codec is adapted to the canonical runtime contract
using the existing credential-scoped transport. The source PR contains no
credential values and performs no live call by default.

The separately approved Sandbox Gate supplies protected test credentials and
merchant/Webhook binding, enables only the sandbox Adapter and approved USD
offer, and validates exactly one test payment path. Switching PayPal from
Sandbox USD to production CNY is configuration and validation work, not a new
payment flow, but still requires an independent Risk A Gate.

## Security And Privacy

- No secret, payer identity, customer email, raw callback, authorization
  header, cookie, or provider response body is stored or logged.
- Callback verification uses the Provider Core provenance boundary; a decoded
  but unverified object cannot settle Coins.
- All URLs and action origins are compiled allowlisted HTTPS origins.
- Prices and account identity are server-authoritative.
- Money uses integer minor units with explicit exponents and no floating-point
  conversion.
- Callback bodies, headers, and field counts are bounded before verification.
- Every public result is a safe projection and never returns internal digests,
  provider credentials, or raw failure causes.

## TDD And Validation

Implementation follows red-green TDD. Focused tests must prove:

- exact additive migration, schema readback, rollback, and reopen behavior;
- order immutability and legal state transitions;
- server-owned price, account, currency, and Coin quantity;
- create/capture request and external-event idempotency;
- duplicate and out-of-order callbacks credit Coins exactly once;
- amount, currency, merchant, order, capture, signature, and payload mismatch
  fail closed without Wallet mutation;
- restart recovery before credit and after credit;
- disabled runtime performs zero payment or Wallet mutation;
- Portal uses only recharge APIs and displays pending, credited, failed, and
  retryable states without granting a product or entitlement;
- legacy direct checkout remains unreachable from the recharge flow;
- no raw provider or sensitive fields enter database rows, logs, API responses,
  or test snapshots.

Required source validation:

```text
focused payment, Wallet, route, state, and Portal tests
npm run admin:test
npm run admin:portal:build
npm run admin:portal:verify
npm run admin:build
npm test
npm run docs:authority:check
git diff --check origin/master...HEAD
```

The later Sandbox Gate additionally verifies that the selected PayPal merchant
account supports the configured USD currency. Any later PayPal CNY Gate must
independently verify CNY support for the exact production merchant binding;
otherwise CNY remains available only through a provider whose reviewed Adapter
supports it.

The later Sandbox Gate additionally validates create, approval, capture,
verified callback, duplicate delivery, order readback, and Wallet balance
readback using a synthetic test account. It creates no product order,
fulfillment, subscription, or production payment.

## Acceptance Criteria

1. Existing Provider Core, Portal, and Wallet remain the only authorities in
   their domains.
2. Exactly two additive payment tables preserve safe payment facts; no second
   Coins ledger exists.
3. A verified PayPal Sandbox payment can be durably accepted and credited to
   `paid_coins` exactly once.
4. Retry after any process boundary converges to the same order, receipt, and
   Wallet result.
5. Sandbox USD and future production CNY price books remain isolated behind
   the same stable recharge offer and order contracts.
6. Other providers require Adapter and price-book validation only; they do not
   replace the recharge, Wallet settlement, or Portal flow.
7. All source validation passes with the runtime default-off.
8. No provider access, credential injection, callback registration, production
   schema mutation, runtime activation, deployment, or real customer order is
   authorized by the source PR.
