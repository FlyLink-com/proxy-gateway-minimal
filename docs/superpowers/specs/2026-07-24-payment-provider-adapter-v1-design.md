# Payment Provider Adapter V1 Design

> Status:
> - Type: approved design specification
> - Approved through: architecture, contract, data flow, error handling,
>   security, and test boundary
> - Source baseline:
>   `master@a5c80f44a47389d65907ba1cdd58649a1e41ac83`
> - Phase 1 risk: B, source-only Provider Core and default-off compiled Adapters
> - Deferred risk: A for schema/migration, provider access, sandbox or
>   production activation, callback routes, wallet credit, and deployment
> - Expected Phase 1 PR count: 1
> - Release unit: `control-plane-app`
> - Production state: `not_deployed`
> - Production authority: none

## Purpose

Replace the unfinished legacy PayPal path and provisional provider placeholders
with one canonical payment-provider Adapter model for closed-loop Coins
recharge.

Provider Core is the sole payment integration authority. The legacy PayPal
branch is a donor for reviewed protocol mappings and synthetic test vectors
only. It is not a compatibility runtime, merge target, Portal checkout path, or
deployment artifact.

Coins remain closed-loop:

- providers collect fiat only for `paid_coins` recharge;
- Coins buy only platform-owned products;
- Coins cannot be withdrawn, converted to fiat, transferred, traded, or used
  to pay third parties;
- recharge, product purchase, fulfillment, rewards, recovery, and usage remain
  separate domains.

## Evidence Classification

| Surface | Classification | Evidence boundary |
| --- | --- | --- |
| Provider Core at the source baseline | Confirmed local source | Canonical Adapter contract, static registry, default-off compiled Adapters, credential-scoped execution, and safe automatic routing exist in source. This is not deployed evidence. |
| Legacy PayPal branch | Draft donor, source-only | OAuth, Orders create/capture, approval-link parsing, webhook verification mapping, and injected-transport tests may be re-imported after review. Direct environment access, in-memory order state, old routes, and old Portal checkout are forbidden. |
| XSD adapter/runtime source | Synthetic local tests | CNY create/query/callback codec, injected signing/transport boundary, and compiled `v1` metadata are covered without a provider call. Action origin, retry, replay, terminal no-charge, real credentials, and production compatibility remain unverified. |
| ChaoJiPay adapter/runtime source | Synthetic local tests | CNY WeChat product `726` create/callback codec, injected signing/transport boundary, and compiled `v1` metadata are covered without a provider call. Query is disabled; `ip` payer-versus-egress semantics and a trusted source binding remain unverified. |
| Runtime and production | Default-off and unassembled | No provider runtime is assembled in state, routes, Store, Wallet, public indexes, or Portal/Admin bootstrap. No provider call, callback route, schema, wallet mutation, deployment, or production activation is authorized by this design. |

No credential, merchant identifier, token, account data, order URL, raw provider
payload, or customer data may be copied into source, tests, documentation, or
logs.

## Selected Approach

Use a contract-first, staged cutover:

1. finalize Provider Core V1 and introduce named, disabled Adapters;
2. validate protocol mappings using injected transports and synthetic fixtures;
3. add the durable Payment Store and wallet settlement bridge under a separate
   Risk A schema gate;
4. validate and enable each provider under its own sandbox and activation gate;
5. expose Portal payment actions only after the backend settlement path and the
   independent Portal production-surface identity gate pass.

Rejected alternatives:

- retaining a legacy PayPal compatibility facade, because it creates two
  payment authorities;
- merging the old PayPal branch wholesale, because it carries direct
  environment access, in-memory state, old routes, and a direct checkout model;
- building a full provider-to-wallet vertical slice in one PR, because it mixes
  Risk B contract work with Risk A schema, credentials, callbacks, and balance
  mutation.

## Architecture

The eventual runtime boundary is:

```text
Portal
  -> Payment Orchestrator
  -> durable recharge and attempt state
  -> safe automatic routing policy
  -> static Provider Adapter Registry
  -> named Adapter
  -> credential-scoped transport
  -> provider

verified callback or authenticated capture response
  -> append-only payment event
  -> processing receipt
  -> settlement validation
  -> paid_coins credit origin
  -> existing Coin Wallet Store
```

Provider Core and Adapters do not own:

- HTTP routes or Portal UI;
- recharge-intent persistence;
- Coins balances, lots, holds, or ledger entries;
- product orders or fulfillment;
- reward accrual or promotion deductions;
- recovery-case decisions;
- runtime credentials or production activation.

The first implementation PR stops at the static registry and disabled Adapter
boundary. The Payment Orchestrator, Payment Store, callback routes, settlement
worker, and wallet bridge are future work.

## Canonical Contract

### Identity

The static registry contains exactly:

| `adapterKey` | `providerId` | Initial version |
| --- | --- | --- |
| `paypal_v1` | `paypal_commerce` | `v1`, default-off |
| `xsd_v1` | `xsd` | `v1`, default-off |
| `chaojipay_v1` | `chaojipay` | `v1`, default-off |

Provider identity and payment method remain distinct. Canonical payment methods
are ordered and frozen as:

```text
alipay
wechat_pay
paypal
```

Provider Core and all three compiled descriptors are contract `v1`. A compiled
descriptor is not a runtime activation decision: resolution must intersect its
capabilities with an explicit declared-capability record and use injected
credential/transport bindings. An all-false declaration remains disabled; a
declaration cannot expand a compiled capability.

### Operations and Capabilities

The canonical Adapter surface is:

```text
createRechargeOrder
queryPayment
capturePayment
verifyAndNormalizeCallback
normalizeError
webhookSuccessAck
refund
reconcile
```

Capabilities are:

```text
createRechargeOrder
queryPayment
capturePayment
verifyCallback
refund
reconcile
repeatCreateIdempotent
repeatCaptureIdempotent
```

Canonical execution-operation identifiers are:

```text
create_recharge_order
query_payment
capture_payment
verify_callback
refund
reconcile
```

`capture_payment` is the error, execution-scope, and normalization identifier
for `capturePayment`.

Rules:

- every Adapter exposes the exact method shape;
- a disabled capability rejects before credential loading, time access, or
  transport invocation;
- `repeatCreateIdempotent` requires `createRechargeOrder`;
- `repeatCaptureIdempotent` requires `capturePayment`;
- an `unverified` Adapter has every capability set to `false` and supports no
  payment method;
- database or configuration declarations may only reduce compiled capability;
  they cannot enable an unsupported or unverified operation;
- `queryPayment` is read-only and can never capture, refund, credit Coins, or
  cause provider fallback.

### Monetary Operation Inputs

The exact create input is:

```text
paymentOrderRef
attemptRef
providerRequestRef
paymentMethod
amountMinor
currency
currencyExponent
expectedPaidCoins
quoteDigest
expiresAt
callbackRouteRef
returnRouteRef
```

The exact refund input is:

```text
paymentOrderRef
attemptRef
providerOrderRef
refundRequestRef
amountMinor
currency
currencyExponent
reasonCode
```

`currencyExponent` is a safe integer from 0 through 9. A provider-neutral
canonical decimal formatter converts only a positive safe integer
`amountMinor`:

- exponent 0 uses `0|[1-9][0-9]*`;
- exponent greater than 0 uses `(0|[1-9][0-9]*)\.[0-9]{exponent}`;
- the formatter left-pads the minor-unit digits so the fractional part has
  exactly `exponent` digits;
- parsers reject signs, whitespace, grouping separators, exponent notation,
  non-canonical leading zeroes, missing or excess fractional digits, zero, and
  values outside the positive safe-integer range.

Provider codecs additionally enforce a compiled allowlist of exact
currency/exponent pairs. They may not infer a scale from the currency code.

### Capture

`capturePayment` is explicit. It is never hidden inside query or browser return
handling.

Its exact business input is:

```text
paymentOrderRef
attemptRef
providerOrderRef
captureRequestRef
amountMinor
currency
currencyExponent
```

`captureRequestRef` is the stable provider idempotency identity. A repeated
capture is permitted only when the compiled and declared Adapter capabilities
both allow it. `amountMinor`, `currency`, and `currencyExponent` are copied from
the immutable recharge quote so the Adapter can validate and format the
authenticated provider amount without reading a Store or guessing a currency
scale.

Capture returns a canonical outcome:

```text
operationResult
paymentFact
```

`operationResult` uses the ordinary operation-result state model. When it is
`succeeded`, `paymentFact` is required and must be a verified
`payment_succeeded` fact whose order and provider references match the capture
input and whose amount, currency, and currency exponent equal the capture
input. For every non-success result, `paymentFact` is `null`.

A shape-valid, explicitly mapped non-success provider status may produce that
non-success outcome. A malformed response, missing or duplicate capture,
reference mismatch, or money mismatch rejects instead; malformed evidence is
never collapsed into a reconciliation result.

The authenticated capture fact enters the same durable event pipeline as a
verified webhook. It never invokes the wallet directly.

### Operation Result States

| State | Meaning |
| --- | --- |
| `entry_ready` | A safe allowlisted redirect or QR action is ready for the user. |
| `pending` | The provider is processing the payment. |
| `succeeded` | The provider confirmed payment; this does not mean Coins were credited. |
| `failed_no_charge` | The provider proved that no charge occurred. |
| `reversed` | The provider proved a refund, reversal, or chargeback fact. |
| `reconciliation_required` | Charge state is unknown or contradictory; automated retry and fallback stop. |

`entry_ready`, `pending`, and every ambiguous transport failure use
`possibly_charged` or `unknown` according to the exact evidence. No result may
infer success from a browser return, missing error, HTTP status alone, or
unrecognized provider status.

### Verified Payment Facts

A verified payment fact contains only canonical, detached data:

```text
sourceType: callback | authenticated_capture_response
providerEventRef
eventDedupeKey
eventType
paymentOrderRef
providerOrderRef
providerCaptureRef
providerRefundRef
amountMinor
currency
currencyExponent
merchantScopeDigest
payloadDigest
occurredAt
verificationResult: verified
```

Rules:

- `providerEventRef` and `providerRefundRef` may be nullable only when the
  provider does not issue them;
- a successful payment fact requires a non-null `providerCaptureRef`;
- where a provider has no separate capture identifier, the reviewed Adapter
  uses the provider order identifier as the canonical capture identifier;
- refund facts require a refund identifier when the provider supplies one;
- the event dedupe key is mandatory and stable;
- all money uses positive safe integer minor units, an uppercase three-letter
  currency, and an explicit safe integer `currencyExponent` from 0 through 9;
- create, capture, and refund operation inputs carry the same explicit
  `currencyExponent` immediately after `currency`;
- provider codecs further restrict currency/exponent pairs with compiled
  allowlists; they never infer an exponent from a currency string;
- decimal formatting and parsing use integer/string algorithms only: no
  floating-point division, exponent notation, or `toFixed`;
- Provider Core brands callback and authenticated-capture facts with distinct
  private provenance; a pure decoder cannot create that brand, and a capture
  fact cannot be passed to `webhookSuccessAck`;
- the merchant and payload are represented only by SHA-256 digests;
- raw provider bodies, headers, tokens, credential handles, customer fields,
  and arbitrary metadata are forbidden.

Callback facts are minted only after provider verification. Capture-response
facts are minted only inside the credential-scoped execution after an
authenticated provider response has passed exact amount, currency, currency
exponent, order, and capture validation.

## Adapter Mapping

The Registry publishes three compiled `v1` descriptors. Descriptor construction
uses an inert failing execution scope and a deterministic clock exclusively to
read metadata; it does not read a credential, call a transport, or make a
network request. Runtime resolution is still default-off: it requires explicit
declared capabilities plus injected credential and transport bindings, and it
intersects rather than expands the compiled capability set. The local synthetic
harness is not a runtime configuration seam or provider-compatibility proof.

### `paypal_v1`

Target payment method:

```text
paypal
```

Target operations after sandbox verification:

```text
create
query
capture
callback verification
repeat-create idempotency
repeat-capture idempotency
```

The reviewed donor material may contribute:

- OAuth and Orders API request/response mappings;
- stable request-id behavior;
- `NO_SHIPPING`, return, cancel, and brand mappings;
- approval or payer-action link parsing;
- capture reference and time normalization;
- webhook verification request fields and event mappings;
- injected-transport synthetic tests.

Required rewrite:

- direct environment and `fetch` access becomes credential-scoped transport;
- old method names and response models become the canonical V1 contract;
- in-memory orders are removed;
- all callback and capture facts include canonical amount, currency, currency
  exponent, internal reference, merchant digest, payload digest, and dedupe
  identity;
- old Portal create/capture routes and direct product checkout are not carried
  forward.

Refund and reconciliation capabilities remain false until separately designed
and validated.

### `xsd_v1`

The compiled descriptor supports `alipay` and `wechat_pay`, with only
create/query/callback-verification enabled. Its injected runtime accepts only
CNY at exponent 2, maps Alipay to channel `1917` and WeChat Pay to `1923`, and
uses lower-case MD5 form signing inside a credential scope. The source tests
cover the exact closed create/query/callback field shapes, signature checking,
status handling, response bounds, and `SUCCESS` acknowledgement codec. An
unexpected callback `attach` field fails closed.

The synthetic implementation is deliberately not a merchant or provider
compatibility claim. The action origin is only an injected HTTPS allowlist;
there is no observed provider action origin. Sandbox identity, replay/timestamp
semantics, callback retries, terminal no-charge evidence, refunds,
chargebacks, reconciliation, real credentials, public route registration, and
production assembly remain separate Risk A work. An XSD query `succeeded`
projection is not a verified payment fact and cannot settle Coins.

### `chaojipay_v1`

The compiled descriptor supports only `wechat_pay`, with create and callback
verification enabled and query/capture/refund/reconcile/idempotency disabled.
Its injected runtime accepts only CNY at exponent 2 and product code `726`,
uses upper-case MD5 JSON signing inside a credential scope, and has a pure
`success` acknowledgement codec. The local tests cover the closed request and
callback shapes, bounded response handling, and failure paths; they do not call
a provider.

The runtime's `createRequestIp` is an exact public IPv4 constructor input
emitted as the create request `ip` field. It is not inferred from a browser,
request header, proxy, server, or environment. The source does not establish
whether the provider interprets `ip` as payer IP or merchant egress IP, so a
trusted real-world binding is a Risk A blocker. The documented query response
has no authoritative signed field contract, so query remains disabled. Action
origin evidence, callback ACK/retry behavior, terminal no-charge semantics,
credential binding, public callbacks, unpaid probes, and paid canaries remain
separate Risk A gates.

Both CNY runtime modules remain absent from `server/state.mjs`, routes, Store,
Wallet, public indexes, and Portal/Admin bootstrap roots. Neither is a
fallback target, callback route, credential reader, or environment reader.

Merchant withdrawal, payout, and settlement APIs are permanently outside the
closed-loop Coins Adapter.

## Credential and Transport Boundary

Adapters never read `process.env`, files, databases, or raw secrets.

The static registry closes over:

- a non-secret `profileRef` and `credentialProfileRef` for every resolution;
- a credential loader identified only by `credentialProfileRef`;
- a provider-specific request transport;
- a fixed allowlist of canonical HTTPS action origins.

Within one operation:

1. the loader opens an opaque credential handle;
2. the transport performs OAuth, local signing, verification, or provider
   request construction using that handle;
3. the transport returns an exact safe envelope containing the ephemeral
   response plus either `null` evidence for non-fact operations or validated
   lowercase SHA-256 `merchantScopeDigest` and `payloadDigest` evidence for a
   fact-bearing operation;
4. after the provider request resolves successfully, Provider Core rechecks
   that the exact execution scope is still active, then returns the Adapter
   only the safe response, detached evidence, and an opaque, privately branded
   transport receipt bound to that exact scope, operation, and evidence
   digests; synchronous results and Promise fulfillment use the same active
   scope check, and a result that arrives after closure cannot mint a receipt;
5. a fact-bearing callback returns one exact internal evidence envelope:
   `{ transportReceipt, paymentFact }` for `verify_callback`, or
   `{ transportReceipt, captureOutcome }` for `capture_payment`;
6. Provider Core accepts only a receipt minted by a successful request in the
   same scope and operation whose private evidence digests match the returned
   fact, strips the receipt, validates the raw fact or outcome, and only then
   attaches private payment-fact provenance;
7. a missing, fabricated, failed-request, reused, cross-scope,
   cross-operation, or digest-mismatched receipt cannot mint a verified fact;
8. the execution scope closes after success or failure;
9. reuse of the request function or receipt after scope closure fails.

The receipt is not a provider fact, callback acknowledgement, Store receipt,
or public Adapter output. It carries no credential, response body, merchant
value, customer field, or execution identifier and is never serialized,
logged, stored, or returned by a canonical Adapter method. Non-fact operations
may consume the safe response without returning the receipt.

`verify_callback` has no nullable-fact success envelope. Only a verified,
supported, structurally valid callback may return
`{ transportReceipt, paymentFact }`. Failed verification, an unsupported event,
malformed payload, ambiguous reference, or money mismatch rejects, closes the
scope, invalidates any receipt, and returns no payment fact. This is distinct
from a shape-valid non-success capture outcome, which contains
`paymentFact: null`.

PayPal OAuth tokens cannot cross credential profiles. XSD and ChaoJiPay source
runtimes require constructor-bound `profileRef` and `credentialProfileRef`, and
their loader and request bindings must match both refs, Adapter identity, and
`v1`. ChaoJiPay additionally requires a caller-supplied public IPv4
`createRequestIp`; no source path derives it from a payer or egress network
identity. Neither Adapter can return a credential handle, raw token, signing
secret, or request object containing secret material.

Provider action URLs must be HTTPS, contain no credentials, reject loopback and
trailing-dot hosts, and match an exact compiled origin allowlist. User input,
database rows, and provider payloads cannot add an origin at runtime.

## Future Payment Store Boundary

The existing Coins design remains authoritative for wallet lots, immutable
credit origins, ledger entries, refunds, recovery, and restrictions. A future
Risk A migration adds the provider-settlement layer without creating another
wallet:

| Table | Responsibility |
| --- | --- |
| `platform_payment_provider_profiles` | Non-secret Adapter identity, credential reference, environment, status, declared capabilities, digest, and version. |
| `platform_coin_recharge_intents` | Account, immutable fiat-to-Coin quote, lifecycle, provider status, reversal/recovery axes, and expiry. |
| `platform_coin_recharge_route_candidates` | Immutable ordered profile candidates for one recharge intent. |
| `platform_coin_recharge_attempts` | Durable provider operation preparation, dispatch, result, and reconciliation state. |
| `platform_payment_events` | Append-only verified callback and authenticated-response facts. |
| `platform_payment_event_processing_receipts` | Processing lease, retry count, result, and safe failure state. |
| `platform_coin_recharge_settlements` | Unique credit, cumulative reversal, and recovery decision. |

Provider profiles store no credentials. They record only a safe credential
reference. No Admin CRUD is part of the initial implementation.

Each recharge intent freezes:

```text
routingPolicyKey
routeSnapshotDigest
ordered profile candidates
fiat currency, minor units, and currency exponent
paid Coin units
price policy ref, version, and digest
```

Each attempt freezes:

```text
profileRef
adapterKey
contractVersion
paymentMethod
providerRequestRef
providerOrderRef
providerCaptureRef
providerFingerprint
requestDigest
safeResponseDigest
```

Future uniqueness requirements include:

- `(profile_ref, event_dedupe_key)` for payment facts;
- `(profile_ref, provider_order_ref)` for provider orders;
- `(profile_ref, provider_capture_ref)` for captures;
- one settlement per recharge intent;
- one wallet credit origin per settlement.

Provider configuration changes affect only new recharge intents. Existing
attempts and late events remain bound to their frozen Adapter, profile,
contract, route, quote, and merchant-scope identities.

## Routing and Provider Switching

The existing `safe_automatic_v1` routing policy remains the only policy.

Fallback is allowed only when:

- no provider dispatch occurred; or
- matching final provider evidence proves no order or charge exists.

Fallback is forbidden after:

- a redirect or QR entry was issued;
- a provider order may exist;
- charge certainty is `unknown`, `possibly_charged`, or `confirmed_charged`;
- provider evidence is missing, contradictory, or bound to another
  fingerprint.

Those cases enter reconciliation. A route chain cannot skip, reorder, repeat,
or add candidates after the intent snapshot.

## Settlement and Wallet Boundary

The future settlement flow is:

```text
verified payment fact
  -> append immutable event
  -> claim processing receipt
  -> load frozen recharge, route, attempt, and profile identity
  -> verify account-independent internal reference
  -> verify provider, merchant digest, order, capture, amount, currency, and
     currency exponent
  -> create or replay one settlement
  -> create one paid_coins credit origin and lot
  -> append existing Coin ledger credit
  -> mark settlement credited
```

Browser return, provider redirect, query result, or operation status never
directly mutates the wallet. An authenticated capture response may produce a
verified payment fact, but that fact must pass the same durable settlement
pipeline as a callback.

The callback acknowledgement boundary is:

- verification failure: no event and no success acknowledgement;
- verified new event: acknowledge only after durable insertion;
- verified duplicate already stored: return the same success acknowledgement;
- event-store failure: no success acknowledgement so the provider can retry;
- event stored but processing delayed or retryable: success acknowledgement,
  then recover through the processing receipt.

`webhookSuccessAck` is a pure detached response codec, not a network-send
authority. In Phase 1 it remains disabled and there is no callback route or ACK
transport. The future callback orchestrator may encode and send the ACK only
after Event Store returns an exact `accepted_new` or `accepted_duplicate`
receipt. A verified payment fact alone is insufficient authorization to send
an ACK.

Wallet credit is always `paid_coins`. Recharge cannot create a product order,
entitlement, `bonus_coins`, or `reward_coins`.

## Error and Recovery Model

Canonical provider errors expose only:

```text
code
operation
retryable
chargeCertainty
providerOrderRef
occurredAt
```

No raw cause, HTTP body, credential, endpoint, SQL, path, or customer data is
returned.

| Certainty | Automated action |
| --- | --- |
| `confirmed_no_charge` | Retry with the same stable key when the Adapter explicitly supports it; otherwise use matching final-no-charge evidence before fallback. |
| `possibly_charged` | Stop retry and fallback; query or reconcile. |
| `unknown` | Stop retry and fallback; query or reconcile. |
| `confirmed_charged` | Persist the fact and converge on settlement; never create another payment. |

Unknown provider status, malformed success data, amount mismatch, currency or
currency-exponent mismatch, internal-reference mismatch, merchant mismatch,
capture collision, or contradictory terminal facts become
`reconciliation_required` or a terminal safe rejection. They never become
success by default.

Crash recovery rules:

- an attempt is durably prepared before an external call;
- an interrupted `in_flight` attempt is read back or reconciled using the same
  stable provider identity;
- create and capture never become a new business intent after a crash;
- duplicate and late facts may advance a monotonic state but cannot weaken an
  existing verified fact;
- processing uses bounded leases so a crashed worker can be reclaimed safely.

Future verified refunds and chargebacks update cumulative settlement reversal:

```text
verified refund or chargeback
  -> reverse only the original paid_coins source
  -> consumed shortfall opens paid_coins recovery
  -> freeze new spending
  -> user explicitly chooses a same-type replacement recharge
```

Paid-Coin recovery cannot debit `bonus_coins` or `reward_coins`. There is no
automatic recharge redirect, negative balance, mutable history, or silent
cross-Coin compensation.

## Security Invariants

- Static registry only; no dynamic import, module path, or database-supplied
  executable.
- Exact object shapes reject accessors, Proxies, Symbols, sparse arrays, and
  extra fields without invoking hostile traps.
- Callback bodies and headers remain bounded; authorization, cookies, and
  response cookies are forbidden callback inputs.
- Payment amounts use integer minor units plus an explicit bounded currency
  exponent; floating-point money and inferred currency scales are forbidden.
- Provider and wallet idempotency identities are domain-separated and stable.
- Safe action URLs use exact compiled HTTPS origins and reject loopback.
- Callback signature failure writes no verified event.
- A callback or capture result cannot receive private verified-fact provenance
  without a same-scope, same-operation receipt from a successfully resolved
  credential-scoped transport request.
- Phase 1 has no ACK sender; the future callback orchestrator requires a
  durable Event Store acceptance receipt before encoding and sending a provider
  success acknowledgement.
- Raw payloads are represented by digests and are not logged or stored.
- Adapter errors never preserve an untrusted `cause`.
- No test, fixture, documentation, or error output contains real credentials,
  merchant identifiers, account data, or customer data.

XSD lacks documented timestamp, nonce, and callback retry semantics. ChaoJiPay
has unresolved ACK/retry, query, terminal-no-charge, and `ip` source-semantics
evidence. Event deduplication prevents duplicate Coins credit but does not
prove cryptographic freshness. Both compiled Adapters remain unassembled and
default-off until an independent activation decision resolves these risks.

## Phase 1 Implementation Scope

Risk: B.

One source PR contains:

- the `paypal` payment-method addition;
- explicit `capturePayment` and capture-idempotency capabilities;
- explicit currency exponent snapshots on monetary inputs and verified facts;
- verified payment-fact fields required by capture and settlement;
- registry replacement of provisional A/B identities with the three named
  Adapters;
- PayPal protocol codecs using injected transport and synthetic data;
- XSD create/query/callback codec and injected runtime with synthetic signing,
  verification, and bounded-response tests;
- ChaoJiPay create/callback codec and injected runtime with synthetic signing,
  verification, and bounded-response tests; query remains disabled;
- contract, registry, routing, Adapter, security, and source-boundary tests;
- aligned Adapter documentation.

Phase 1 explicitly excludes:

- SQLite tables, migration code, schema initialization, or database access;
- HTTP, callback, Portal, or Admin routes;
- wallet, order, product, fulfillment, reward, or recovery mutation;
- environment-variable or file-based credential loading;
- real provider calls, sandbox calls, or production calls;
- runtime assembly or activation of any Adapter capability;
- deployment, provider configuration, callback registration, or static
  publication;
- old PayPal compatibility exports, routes, in-memory order state, or Portal
  checkout.

## Phase 1 Test Contract

Focused tests must prove:

- exact canonical Adapter, capability, payment-method, capture-input, capture
  outcome, verified-fact, error, and acknowledgement shapes;
- each default-off resolution with all declared capabilities false exposes no
  method and rejects before loader, transport, or clock use;
- configuration can only reduce compiled capabilities;
- disabled methods perform zero loader, request, or clock calls;
- a zero-request, failed-request, fabricated, reused, cross-scope,
  cross-operation, digest-mismatched, custom-thenable, late-fulfillment, or
  post-closure receipt cannot mint private provenance;
- secret markers never enter projections, Adapters, errors, or serialized
  output;
- query is side-effect-free and never calls capture;
- capture succeeds only with a matching verified payment fact;
- create, capture, refund, and verified facts reject missing, extra, or
  out-of-range currency exponents;
- capture rejects a fact whose amount, currency, or currency exponent differs
  from its immutable expected input;
- the provider-neutral decimal codec covers exponents 0, 2, and 3 without
  floating-point arithmetic and rejects non-canonical or over-precise decimal
  text; each provider codec accepts only its separately evidence-backed
  compiled currency/exponent pairs;
- capture retry is impossible without both capability gates;
- PayPal create, query, capture, action-link, idempotency, and callback mappings
  use injected transport only;
- XSD documented field/status mappings, synthetic credential-scoped signing and
  callback verification, exact acknowledgement bytes, and fail-closed
  unexpected `attach` or unknown status handling;
- a verified fact alone cannot obtain a sendable ACK from the disabled Adapter,
  and Phase 1 contains no callback or ACK transport;
- ChaoJiPay exposes only WeChat product `726` create/callback behavior through
  synthetic injected bindings; query remains disabled;
- Registry descriptors compile through an inert failing scope without
  credential, transport, or clock access, while enabled operations fail closed
  without injected credential or transport bindings;
- CNY runtime modules are absent from the tracked production/public roots:
  package entrypoints, server state/routes, Store/Wallet, public indexes, and
  Portal/Admin HTML/bootstrap/Vite roots. This is a lightweight static/literal
  audit, with the direct fact that tracked state/routes do not import either
  CNY runtime; it does not prove the absence of deliberately computed or
  obfuscated loading, which requires ordinary code review and any applicable
  security scan;
- routing never falls back after entry issuance or uncertain charge evidence;
- the Phase 1 modified Adapter runtime modules and their transitive imports
  contain no `process.env`, dynamic import, direct HTTP client, Store, SQLite,
  wallet, Portal, Admin, router, listener, or server import/API.

Required Phase 1 validation:

```text
focused Provider Core and Adapter tests
npm test
npm run docs:authority:check
git diff --check a5c80f44a47389d65907ba1cdd58649a1e41ac83...HEAD
```

There are no live-provider acceptance tests in Phase 1.

## Deferred Gates

The following require separate design confirmation and Risk A execution:

1. Payment Store additive migration and exact schema inspection;
2. recharge orchestrator, event inbox, settlement, wallet credit, reversal, and
   recovery implementation behind a default-off runtime gate;
3. PayPal sandbox credential injection, API and webhook validation;
4. XSD environment identity, observed action-origin, replay, callback-retry,
   terminal-no-charge, and reconciliation validation;
5. ChaoJiPay `ip` payer-versus-egress semantics, trusted real binding,
   authoritative signed query, ACK/retry, and terminal-no-charge validation;
6. protected credential injection, callback ingress/route registration, unpaid
   create/query probes, and one-provider-at-a-time paid canaries;
7. production provider runtime assembly, capability activation, and callback
   registration;
8. Portal payment UI after backend closure and Portal production-surface
   identity confirmation;
9. production schema migration, deployment, validation, and rollback.

No later phase inherits execution authority from this design or from a merged
Phase 1 PR.

## Acceptance Criteria

Phase 1 is complete only when:

1. Provider Core is the sole payment Adapter contract;
2. the old PayPal runtime is absent from the new branch;
3. all three named Adapters list as detached, frozen, compiled `v1` metadata;
   all-false declarations resolve as disabled, and no declaration expands a
   compiled capability;
4. PayPal, XSD, and ChaoJiPay protocol behavior is covered by synthetic tests
   without a provider call; XSD exposes only Alipay/WeChat behavior and
   ChaoJiPay exposes only WeChat product `726` with query disabled;
5. both CNY runtimes remain unassembled and absent from state, routes, Store,
   Wallet, public indexes, and Portal/Admin bootstrap roots;
6. capture is explicit, idempotency-gated, and cannot mutate a wallet;
7. verified facts contain sufficient safe identity for future settlement;
8. every focused and repository validation command passes;
9. the PR states `production_state: not_deployed` and contains no Deploy Note;
10. no secret, credential, merchant data, provider order URL, or customer data
    is added or emitted.
