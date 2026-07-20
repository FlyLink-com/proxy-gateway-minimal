# Payment Provider Adapter Template

Last updated: 2026-07-20, America/Los_Angeles.

This document defines the repository-local adapter template for future payment
provider integration.

The commercial authority is `docs/COMMERCIAL_MODEL_V1.md`. Provider events may
later activate or renew a time-bounded entitlement, or fund an explicitly
approved top-up extension. They must not issue runtime credentials directly or
silently switch the primary product to a prepaid wallet model.

It does **not** activate live payment, webhook registration, billing ledger
storage, production database migration, subscription issuance, or runtime
mutation. PayPal sandbox checkout/capture source exists separately and is
disabled by default.

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
- `server/services/platform/paypal-payment-adapter.mjs`
  - implements PayPal REST OAuth, Orders v2 create, Orders v2 capture, and
    verify-webhook-signature calls for sandbox testing;
  - uses `PayPal-Request-Id` for provider-side request idempotency;
  - returns only safe checkout/capture/event summaries and never exposes the
    client secret, webhook id, access token, or raw provider payload.
- `server/services/platform/portal-payment-checkout.mjs`
  - creates account-scoped PayPal checkout orders from env-backed plan amounts;
  - keeps source-only in-memory order state for sandbox proof;
  - capture moves an order to `paid_pending_admin_review` only.
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
| `paypal` | `PAYMENT_PROVIDER_API_KEY`, `PAYMENT_PROVIDER_API_SECRET`, `PAYMENT_PROVIDER_WEBHOOK_SECRET`, `PAYMENT_PROVIDER_CURRENCY`, `PAYMENT_PLAN_*_AMOUNT_MINOR`, `USER_PORTAL_PAYMENT_CHECKOUT_ENABLED` | Sandbox Orders/Capture adapter and disabled Portal checkout route exist; no live checkout, webhook HTTP endpoint, ledger, refund flow, or entitlement effect. |
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

A real provider adapter implements these operations behind the applicable
source and external-provider gates:

```text
createRechargeOrder()
capturePayment()
verifyWebhook()
normalizeVerifiedPaymentEvent()
```

The generic template remains fail-closed for providers without a specific
adapter. The PayPal adapter implements the operations above for sandbox source
testing, but runtime state refuses PayPal `live` mode until a separate Risk A
gate approves protected credentials, provider dashboard setup, validation, and
rollback.

## Risk Gates

Separate approval is required for:

- enabling the disabled Portal checkout route against a real sandbox provider;
- registering a provider webhook;
- storing provider order/payment rows;
- adding a billing ledger schema or migration;
- enabling any real provider API key, token, AK/SK, certificate, or private key;
- crediting production balance;
- issuing subscriptions automatically after payment.

## Recommended Next Steps

1. Run a PayPal sandbox gate with operator-provided REST app credentials and
   redacted evidence only.
2. Add a PayPal webhook HTTP endpoint only with replay/idempotency tests.
3. Add durable billing ledger storage in a schema-gated task.
4. Implement WorldFirst only after the exact account/API product is confirmed.
5. Keep subscription issuance behind the existing controlled operator gate until
   payment, abuse, quota, and revocation paths are proven.
