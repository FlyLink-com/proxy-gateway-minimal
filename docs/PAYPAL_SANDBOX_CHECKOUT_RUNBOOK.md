# PayPal Sandbox Checkout Runbook

Last updated: 2026-07-20, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: paypal_sandbox_checkout
  superseded_by: null
  last_verified_at: 2026-07-20
  production_authority: false
```

> Status:
> - Risk: A envelope / B source core
> - Execution authority: None
> - Provider impact: Sandbox only when an operator intentionally supplies
>   sandbox credentials outside Git
> - Production impact: None
> - Secrets policy: Never commit or paste PayPal client secrets, webhook ids,
>   sandbox passwords, buyer emails, access tokens, raw webhook payloads, or
>   customer data

This runbook explains how to configure and test the disabled-by-default PayPal
sandbox checkout path added for the User Portal. It does not authorize PayPal
live mode, production credentials, webhook registration, durable payment
storage, entitlement activation, subscription issuance, or runtime mutation.

## Current Source Boundary

Implemented source surfaces:

- `server/services/platform/paypal-payment-adapter.mjs`
  - PayPal REST OAuth token request;
  - Orders v2 checkout order creation;
  - Orders v2 capture;
  - verify-webhook-signature helper for future webhook work;
  - safe summaries only, with no raw provider payloads or secrets returned.
- `server/services/platform/portal-payment-checkout.mjs`
  - account-scoped PayPal checkout orders;
  - env-backed plan prices;
  - in-memory sandbox order state only;
  - capture returns `paid_pending_admin_review` and does not issue a
    subscription.
- `server/routes/user-portal.mjs`
  - `GET /api/portal/payments/current`;
  - `POST /api/portal/payments/checkout`;
  - `POST /api/portal/payments/capture`;
  - all require a valid Portal session.
- User Portal UI
  - defaults to PayPal;
  - opens the provider-hosted PayPal checkout URL;
  - does not generate a fake PayPal QR code.

Not implemented in this source unit:

- PayPal live mode;
- webhook HTTP endpoint;
- webhook replay/idempotency storage;
- payment order database tables;
- billing ledger writes;
- refund/dispute state machine;
- payment-driven entitlement activation;
- automatic subscription issuance.

## Sandbox Environment Mapping

Use an operator-managed private env file outside Git. The sandbox account file
may contain console login or buyer-login values, but only the REST app
credentials are runtime values.

```text
PAYMENT_PROVIDER=paypal
PAYMENT_MODE=sandbox
USER_PORTAL_PAYMENT_CHECKOUT_ENABLED=true

PAYMENT_PROVIDER_API_KEY=<PayPal REST app client id>
PAYMENT_PROVIDER_API_SECRET=<PayPal REST app client secret>
PAYMENT_PROVIDER_WEBHOOK_SECRET=<PayPal webhook id, only after a sandbox webhook is registered>

PAYMENT_PUBLIC_BASE_URL=<public portal/payment base URL>
PAYMENT_RETURN_URL=<approved PayPal return URL>
PAYMENT_CANCEL_URL=<approved PayPal cancel URL>
PAYMENT_PROVIDER_CURRENCY=USD
PAYMENT_PROVIDER_BRAND_NAME=GCC WebOS

PAYMENT_PLAN_MONTHLY_BASIC_AMOUNT_MINOR=<integer minor units>
PAYMENT_PLAN_MONTHLY_PLUS_AMOUNT_MINOR=<integer minor units>
PAYMENT_PLAN_YEARLY_AMOUNT_MINOR=<integer minor units>
```

Do not map PayPal sandbox email or password into runtime env. Those values are
used only for PayPal dashboard access or sandbox buyer login during manual
approval testing.

Runtime refuses `PAYMENT_MODE=live` while
`USER_PORTAL_PAYMENT_CHECKOUT_ENABLED=true`. Live activation requires a separate
Risk A gate.

## Manual Sandbox Test

1. Start the app in a controlled non-production environment with Portal routes,
   Portal auth, PayPal sandbox env, and plan amount env configured.
2. Log in to the User Portal with a test Portal session.
3. Choose a paid plan. The cashier should show only `PayPal`.
4. Continue to payment. The Portal should receive a PayPal-hosted checkout URL
   from `/api/portal/payments/checkout`.
5. Open the PayPal hosted checkout URL and approve with a PayPal sandbox buyer.
6. Return to the Portal and click the status-check action. The Portal calls
   `/api/portal/payments/capture`.
7. Expected safe result: the order becomes `paid_pending_admin_review`.
8. Verify no subscription URL, runtime credential, billing ledger row, or
   entitlement activation is created by the payment action.

Record only redacted evidence:

```text
provider=paypal
mode=sandbox
checkout_order_created=true
provider_hosted_url_present=true
capture_checked=true
result_status=paid_pending_admin_review
no_subscription_issued=true
no_raw_provider_payload=true
no_secret_logged=true
```

## Live Account Gate

Before any live PayPal account is enabled, create a separate exact Risk A gate
that names:

- target runtime and release unit;
- protected env placement;
- return/cancel URLs;
- webhook endpoint scope if applicable;
- backup and rollback/disable plan;
- redacted validation evidence;
- stop conditions for provider, route, ledger, and entitlement failures.

Merging source code, passing tests, or creating a PayPal sandbox order does not
authorize live capture or production rollout.

## Provider References

- PayPal REST API overview: <https://developer.paypal.com/api/rest/>
- PayPal JavaScript SDK: <https://developer.paypal.com/sdk/js/>
- PayPal Orders API v2: <https://developer.paypal.com/docs/api/orders/v2/>
- PayPal Webhooks API: <https://developer.paypal.com/api/rest/webhooks/>
