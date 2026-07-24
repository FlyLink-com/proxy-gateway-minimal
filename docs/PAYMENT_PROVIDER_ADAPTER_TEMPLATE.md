# Payment Provider Adapter Template

Last updated: 2026-07-24, America/Los_Angeles.

This document defines the repository-local adapter template for future payment
provider integration.

The commercial authority is `docs/COMMERCIAL_MODEL_V1.md`. The template and
Provider Core V1 are source-only. The legacy environment-summary helper remains
independent and unregistered; every named Adapter is `unverified` and fully
disabled. This is not evidence for any real API, signature, callback, refund,
reconciliation, status mapping, sandbox, or live capability.

It does **not** activate a provider call or credential, payment, checkout,
callback registration or route, callback verification against a real provider,
Payment Store or schema, billing or wallet settlement, UI, runtime activation,
production database migration, product fulfillment, subscription issuance, or
production deployment.

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

Neither target flow is implemented or proven in production by this template.
The legacy billing helper remains optional traffic-topup compatibility and is
not the Provider Core Adapter contract or a Coins wallet.

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

The static Registry contains exactly these named, disabled identities:

| `adapterKey` | `providerId` | Contract state | Methods / capabilities |
| --- | --- | --- | --- |
| `paypal_v1` | `paypal_commerce` | `unverified` | empty / every flag `false` |
| `xsd_v1` | `xsd` | `unverified` | empty / every flag `false` |
| `chaojipay_v1` | `chaojipay` | `unverified` | empty / every flag `false` |

The PayPal and XSD protocol codecs are synthetic, detached local evidence only;
they do not select or enable a provider, send a request, or establish a
credential, callback, settlement, runtime, or deployment path. ChaoJiPay is an
identity-only disabled Adapter with no guessed protocol surface. Monetary
operation inputs and payment facts always carry an explicit
`currencyExponent`; no codec infers it from a currency string.

## Risk Gates

Separate approval is required for:

- adding a public checkout endpoint;
- registering a provider callback;
- storing provider order/payment rows;
- adding a Payment Store, wallet ledger, schema, or migration;
- enabling any real provider API key, token, AK/SK, certificate, or private key;
- crediting `paid_coins` or another production balance;
- enabling product fulfillment or subscription issuance after payment.

## Recommended Next Steps

1. Keep the template unregistered and disabled.
2. Verify a provider's real protocol and trust boundary before changing its
   Adapter contract version or capability flags.
3. Add durable payment and wallet storage only through a separate
   schema/migration-gated task.
4. Keep recharge, Coins hold/capture, product order, and fulfillment as
   separate decisions.
