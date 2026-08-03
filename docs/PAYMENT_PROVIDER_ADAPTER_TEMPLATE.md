# Payment Provider Adapter Template

Last updated: 2026-08-02, America/Los_Angeles.

This document defines the repository-local adapter template for future payment
provider integration.

The commercial authority is `docs/COMMERCIAL_MODEL_V1.md`. Provider Core V1,
the durable Recharge path, and the PayPal Sandbox Adapter are source-only and
runtime default-off. The legacy environment-summary helper remains independent
and unregistered. This source state by itself is not evidence of a live Sandbox call,
credential validation, callback registration, production payment, refund,
reconciliation, or provider activation.

It does **not** activate a provider call or credential, register a callback,
apply the Payment schema to production, enable Wallet credit, create a real
payment, fulfill a product, issue a subscription, or deploy any release. Those
remain separate Risk A runtime and production Gates.

## Boundary

The target separation is:

```text
verified recharge payment
  -> durable payment order/event
  -> paid_coins

paid_coins hold/capture
  -> separate product order
  -> fulfillment decision
```

The first flow now has a default-off source implementation: two durable payment
tables, one recharge coordinator, one protected Portal route family, and the
existing Wallet Store's `paid_coins` credit operation. Synthetic SQLite tests
validate callback/capture convergence and exactly-once Wallet settlement. A
separately approved local Gate has additionally proven real PayPal Sandbox
order creation, buyer approval, and callback transport; final local verified
receipt, Wallet credit, and Portal return evidence remain pending. Nothing in
this evidence proves or activates production. The legacy billing helper remains
optional traffic-topup compatibility and is not the Provider Core Adapter
contract or a Coins wallet.

## Repository Pieces

- `server/services/platform/payment-provider-adapter-template.mjs`
  - keeps an independent compatibility helper that summarizes provider
    environment shape without exposing values;
  - rejects non-HTTPS public URLs in that summary except explicit loopback test
    mode;
  - exposes a fixed template identity through the canonical Adapter contract;
  - returns a frozen, unverified Adapter with every capability disabled and no
    supported payment method;
  - is independent of and not registered in the static Adapter Registry.
- `.env.payment.example`
  - placeholder-only environment template;
  - no real API token, AK, SK, private key, webhook secret, merchant account,
    or payment credential belongs in Git.
- `server/services/platform/payment-store-migrations.mjs`
  - defines additive migration `20260801_001_payment_integration_closure`;
  - creates only `platform_payment_orders` and
    `platform_payment_receipts`, with readback and rollback support.
- `server/services/platform/payment-store.mjs`
  - persists server-owned recharge orders and immutable normalized provider
    receipts without raw callbacks, payer data, or credentials.
- `server/services/platform/payment-recharge-coordinator.mjs`
  - converges capture and callback facts into the existing Wallet Store;
  - uses invariant provider capture identity for exactly-once `paid_coins`.
- `server/services/platform/paypal-payment-adapter.mjs` and
  `paypal-payment-runtime.mjs`
  - implement the compiled PayPal V1 contract and credential-scoped Sandbox
    transport;
  - make no request during startup and remain unreachable unless both runtime
    flags and every prerequisite are present.
- `server/routes/portal-coin-recharge.mjs`
  - exposes authenticated offer/order/capture projections and one bounded
    provider callback route;
  - derives account authority from the Portal session and accepts no client
    price or Coin quantity.

## Supported Provider Vocabulary

```text
paypal
stripe
paddle
lemonsqueezy
alipay
wechatpay
manual
mock
```

This vocabulary belongs only to the independent environment-summary
compatibility helper. It is not the identity list of the static Adapter
Registry and is not live-provider support. `paypal` is also a canonical payment
method vocabulary item; it is not a selected, verified, available, or live
provider capability.

Provider identity and payment method are separate concepts. An Adapter
`providerId` identifies one compiled provider integration, while canonical
payment methods are independently declared through
`supportedPaymentMethods`. The template declares none.

## Secret Boundary

Never commit real values for:

- provider API key / client id;
- provider API secret / client secret;
- webhook secret;
- merchant id;
- app id;
- certificate serial;
- private-key material or private-key file contents;
- raw webhook payloads containing customer or payment information.

The adapter template may report whether a required value is configured, but it
must not return or log the value.

## Canonical Adapter Surface

The canonical Adapter surface has exactly 13 keys:

```text
adapterKey
providerId
contractVersion
capabilities
supportedPaymentMethods
createRechargeOrder()
queryPayment()
capturePayment()
verifyAndNormalizeCallback()
normalizeError()
webhookSuccessAck()
refund()
reconcile()
```

Its fixed identity is
`payment_provider_template_v1` / `payment_provider_template`, with contract
version `unverified`. The eight frozen V1 capability flags are
`createRechargeOrder`, `queryPayment`, `capturePayment`, `verifyCallback`,
`refund`, `reconcile`, `repeatCreateIdempotent`, and
`repeatCaptureIdempotent`. All are `false` for an `unverified` Adapter, whose
`supportedPaymentMethods` is empty. All business and acknowledgement paths are
disabled by the canonical capability guard. The template has no helper that
lets input self-declare a verified event; verified callback provenance belongs
to the credential-scoped Provider Core contract.

## Static Registry And Evidence Boundary

The static Registry contains exactly these compiled identities. Resolution is
still fail-closed: without an approved credential profile, transport, declared
capabilities, and runtime flags, each identity resolves as unavailable.

| `adapterKey` | `providerId` | Contract state | Methods / capabilities |
| --- | --- | --- | --- |
| `paypal_v1` | `paypal_commerce` | compiled V1; default-off | `paypal`; create/query/capture/callback plus both declared idempotency flags |
| `xsd_v1` | `xsd` | compiled V1; default-off | `alipay`, `wechat_pay`; create/query/callback only |
| `chaojipay_v1` | `chaojipay` | compiled V1; default-off | `wechat_pay`; create/callback only; query remains disabled |

The Registry builds those descriptors with one inert, deterministic execution
scope. Listing metadata neither opens a credential nor invokes a transport or
clock. Resolving a usable Adapter still requires explicit declared capabilities
and injected credential/transport bindings; the effective capability is the
intersection of the declaration and the compiled capability. A declaration
with every flag `false` has no payment method and every operation rejects before
credential, transport, or clock use. Missing credential or transport bindings
fail closed on the first valid enabled operation.

The XSD and ChaoJiPay codecs, injected runtimes, and Adapters have only
synthetic local-test evidence. They are not evidence of provider, merchant,
Sandbox, production, credential, callback-registration, or payment
compatibility. Neither runtime is imported by `server/state.mjs`, routes,
Payment Store, Wallet, public indexes, or Portal/Admin bootstrap roots.

Confirmed synthetic source facts are deliberately narrow:

- XSD accepts only CNY/2-decimal create inputs for Alipay channel `1917` and
  WeChat channel `1923`; it constructs form requests and lower-case MD5 signing
  inside an injected credential scope. Its callback verifier projects only a
  signed success, rejects unexpected `attach`, and uses `SUCCESS` only as a
  pure acknowledgement codec.
- ChaoJiPay accepts only CNY/2-decimal WeChat product `726`; it constructs JSON
  create requests and uppercase MD5 signing inside an injected credential scope.
  It verifies signed callback success and exposes `success` only as a pure
  acknowledgement codec. Its documented query response lacks an authoritative
  signed field contract, so query is compiled disabled.
- XSD's `succeeded` query projection is not a verified payment fact; no query,
  callback, redirect, or acknowledgement is wired to Store, Wallet, or Coins
  credit in this source change.

`createRequestIp` is a ChaoJiPay runtime constructor input that is only
synthetically validated as a public IPv4 value and emitted in the create
request's `ip` field. The source cannot establish whether that field means the
payer IP or a merchant egress IP. Selecting or deriving it from a real request,
proxy, or host is a separate Risk A trusted-binding blocker, not a default or
fallback in this implementation.

Before a Risk A gate can make either runtime reachable, evidence must resolve
the observed action origin and allowlist mutation, callback retry and ACK
behavior, terminal no-charge semantics, exact credential binding, and provider
transaction identity. Required gates include protected credential injection,
callback route/public-ingress registration, production runtime assembly,
unpaid create/query probes, and one-provider-at-a-time small-value paid
canaries with a rollback plan.

## Risk Gates

The source implementation does not remove any production Gate. Separate
approval is required for:

- applying the additive Payment migration to a runtime database;
- exposing the protected Recharge endpoints or provider callback in a deployed
  control plane;
- registering the PayPal callback or injecting Sandbox credentials;
- enabling any real provider API key, token, AK/SK, certificate, or private key;
- crediting `paid_coins` or another production balance;
- enabling product fulfillment or subscription issuance after payment.

## Recommended Next Steps

1. Keep both `PLATFORM_COIN_RECHARGE_ENABLED` and
   `PLATFORM_PAYPAL_SANDBOX_ENABLED` false outside an approved Gate.
2. Review and apply the Payment migration through its own schema Gate before
   any runtime activation.
3. Validate one synthetic account end to end against PayPal Sandbox with an
   isolated USD price book before considering production CNY.
4. Keep recharge, Coins hold/capture, product order, and fulfillment as
   separate decisions.
