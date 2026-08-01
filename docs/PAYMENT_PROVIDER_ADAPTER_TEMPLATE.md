# Payment Provider Adapter Template

Last updated: 2026-08-01, America/Los_Angeles.

This document defines the repository-local adapter template for future payment
provider integration.

The commercial authority is `docs/COMMERCIAL_MODEL_V1.md`. Provider Core V1,
the durable Recharge path, and the PayPal Sandbox Adapter are source-only and
runtime default-off. The legacy environment-summary helper remains independent
and unregistered. This source state is not evidence of a live Sandbox call,
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
existing Wallet Store's `paid_coins` credit operation. It has been validated
only with local synthetic provider facts and SQLite. It has not been proven
against PayPal Sandbox or production. The legacy billing helper remains
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
| `paypal_v1` | `paypal_commerce` | compiled V1; default-off | PayPal method and Recharge/callback capabilities only inside an enabled credential-scoped Sandbox binding |
| `xsd_v1` | `xsd` | `unverified` | empty / every flag `false` |
| `chaojipay_v1` | `chaojipay` | `unverified` | empty / every flag `false` |

The PayPal protocol codec and Adapter/runtime tests are synthetic local evidence
only; they do not select or enable a provider, validate a real credential, or
register a webhook. XSD remains a detached codec boundary, and ChaoJiPay remains
an identity-only disabled Adapter with no guessed protocol surface. Monetary
operation inputs and payment facts always carry an explicit `currencyExponent`;
no codec infers it from a currency string.

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
