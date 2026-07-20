# Payment Provider Adapter Template

Last updated: 2026-07-20, America/Los_Angeles.

This document defines the repository-local adapter template for future payment
provider integration.

The commercial authority is `docs/COMMERCIAL_MODEL_V1.md`. Provider events may
later activate or renew a time-bounded entitlement, or fund an explicitly
approved top-up extension. They must not issue runtime credentials directly or
silently switch the primary product to a prepaid wallet model.

It does **not** activate payment, checkout, capture, webhook registration,
webhook verification against a live provider, billing ledger storage,
production database migration, subscription issuance, or runtime mutation.

## Boundary

The current billing spine is:

```text
payment provider
  -> verified provider event
  -> billing recharge order/event contract
  -> traffic balance ledger
  -> controlled subscription issuance gate
```

This template only defines the seam between `payment provider` and the existing
`billing recharge order/event contract`.

## Repository Pieces

- `server/services/platform/payment-provider-adapter-template.mjs`
  - normalizes provider configuration into a safe summary;
  - rejects non-HTTPS public URLs except explicit loopback test mode;
  - exposes fail-closed operation stubs for checkout, capture, and webhook
    verification;
  - normalizes already-verified provider events into billing events.
- `.env.payment.example`
  - placeholder-only environment template;
  - no real API token, AK, SK, private key, webhook secret, merchant account,
    or payment credential belongs in Git.

## Supported Provider Vocabulary

```text
paypal
worldfirst
stripe
paddle
lemonsqueezy
alipay
wechatpay
manual
mock
```

This vocabulary is not live-provider support. It is only the durable naming
contract for future adapters.

PayPal is already represented as a provider vocabulary entry and maps to the
generic REST API key/secret and webhook-secret placeholders. WorldFirst is
represented as `worldfirst` for future cross-border collection or payment
solution integration and maps to client-id plus operator-managed RSA key path
placeholders. Niuniu Pay is retired and intentionally absent from the active
provider vocabulary.

## Provider Configuration Shape

| Provider | Placeholder env names | Current status |
| --- | --- | --- |
| `paypal` | `PAYMENT_PROVIDER_API_KEY`, `PAYMENT_PROVIDER_API_SECRET`, `PAYMENT_PROVIDER_WEBHOOK_SECRET` | Vocabulary only; no live checkout, capture, or webhook. |
| `worldfirst` | `PAYMENT_PROVIDER_CLIENT_ID`, `PAYMENT_PROVIDER_PRIVATE_KEY_PATH`, `PAYMENT_PROVIDER_PLATFORM_PUBLIC_KEY_PATH` | Vocabulary only; no API calls, signing, or notification verification. |
| `manual` / `mock` | none | Safe local/manual testing surfaces only. |

The placeholder names record the shape of future private runtime configuration.
They do not authorize storing secrets in Git, registering webhooks, or calling a
provider API.

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

## Future Adapter Contract

A real provider adapter must implement these operations behind a separate Risk A
gate:

```text
createRechargeOrder()
capturePayment()
verifyWebhook()
normalizeVerifiedPaymentEvent()
```

Only `normalizeVerifiedPaymentEvent()` exists today as a safe repo-local
contract helper. The first three operations remain explicit fail-closed stubs
until a provider is selected and approved.

## Risk Gates

Separate approval is required for:

- adding a public checkout endpoint;
- registering a provider webhook;
- storing provider order/payment rows;
- adding a billing ledger schema or migration;
- enabling any real provider API key, token, AK/SK, certificate, or private key;
- crediting production balance;
- issuing subscriptions automatically after payment.

## Recommended Next Steps

1. Keep PRs provider-neutral until the collection/MoR provider is selected.
2. Add durable billing ledger storage in a schema-gated task.
3. Add one sandbox provider adapter only after the provider's allowed-use policy
   is reviewed.
4. Keep subscription issuance behind the existing controlled operator gate until
   payment, abuse, quota, and revocation paths are proven.
