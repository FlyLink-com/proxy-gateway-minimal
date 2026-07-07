# Niuniu Pay Adapter

Last updated: 2026-07-02, America/Los_Angeles.

This document records the local Niuniu Pay adapter boundary for
`proxy-gateway-minimal`.

It does not install production keys, enable public production checkout, change
Nginx, DNS, firewall, systemd, or run production database migrations.

## Scope

The local adapter lives at:

- `server/services/platform/niuniu-pay-adapter.mjs`
- `server/tests/platform-niuniu-pay-adapter.test.mjs`
- `server/services/platform/portal-payment-orders.mjs`
- `server/tests/platform-portal-payment-orders.test.mjs`
- `server/tests/portal-payment-routes.test.mjs`

It supports:

- MD5 signature construction;
- read-only merchant-status query through an injected `fetchFn`;
- signed create-order request construction through an injected `fetchFn`;
- notification signature verification into safe payment facts;
- env-gated user-portal checkout orchestration for paid plan models;
- env-gated notification handling that converts verified paid orders into a
  paid access request and requires automatic delivery when configured;
- Admin-approved refund calculation based on remaining subscription days, plus
  a provider refund adapter method for later approved runtime use.

All returned objects are safe summaries. They must not include merchant keys,
settlement account details, raw provider payloads, customer data, subscription
URLs, tokens, or passwords.

## Integration Boundary

Niuniu Pay is a provider-specific adapter below the existing billing contract:

```text
Niuniu Pay provider
  -> verified provider event
  -> paid order
  -> controlled subscription issuance gate
  -> delivered subscription artifact
```

The adapter must not directly:

- write provider order rows;
- credit user balance outside the controlled subscription issuance gate;
- mutate subscriptions before provider signature and amount verification;
- install provider keys;
- issue access artifacts.

The user-portal payment shell exposes these routes only when
`USER_PORTAL_ROUTES_ENABLED=true` and `USER_PORTAL_PAYMENTS_ENABLED=true`:

- `POST /api/portal/payments/checkout`
- `POST /api/portal/payments/notify`
- `GET /api/admin/platform/payments`

Checkout requires a portal session. Notification verifies provider signature
through the adapter and returns the gateway-safe provider acknowledgement text
only after the local payment handler accepts the event. The default runtime
policy is `USER_PORTAL_PAYMENTS_REQUIRE_AUTOMATIC_DELIVERY=true`: a successful
payment callback must create a delivered or issued access request through the
existing portal auto-issuance service. If auto delivery is not configured or
does not complete, the payment order is marked `paid_delivery_blocked` and the
callback does not return the provider success acknowledgement.

The Admin route is read-only and returns local safe order summaries only. When
the subscription control store is configured, payment orders are persisted in
the `platform_payment_orders` store. If the store is not configured, the service
falls back to in-memory order state suitable only for local/test staging.
Enabling durable production order accounting, including any production SQLite
schema initialization or migration effect, remains a separate Risk A task.

Refunds are not exposed to users as a self-service action. Admin approval is
required. The local refund quote and approval flow calculates:

```text
refundAmountMinor = floor(paidAmountMinor * remainingDays / durationDays)
```

The calculation uses the paid order's `paidAt` time, the admin approval time,
and the plan's configured duration. A successful provider refund may then
disable the delivered access request. Any production use of the provider refund
API, including merchant-panel refund switch verification and protected key
installation, remains a separate Risk A gate.

The supported paid plan models are:

- `monthly_basic`: CNY 20.00, 30 days;
- `monthly_plus`: CNY 30.00, 30 days;
- `yearly`: CNY 200.00, 365 days.

The 7-day trial is not purchasable through payment. For a live payment smoke,
use an operator-approved test account and a provider-supported small amount
such as CNY 0.01 on WeChat Pay only if the provider accepts that amount. This
must be enabled through the account-digest-scoped test override env below; do
not hard-code a test email in source or artifacts. Do not use a zero-value live
order unless the provider explicitly documents support for zero-amount
transactions.

## Runtime Configuration

Real values belong only in protected runtime env or secret files. They do not
belong in Git, docs, chat, test fixtures, or generated artifacts.

Suggested env names for a later Risk A gate:

```text
NIUNIU_PAY_API_BASE_URL
NIUNIU_PAY_MERCHANT_ID
NIUNIU_PAY_MERCHANT_KEY
NIUNIU_PAY_NOTIFY_URL
NIUNIU_PAY_RETURN_URL
USER_PORTAL_PAYMENTS_ENABLED
USER_PORTAL_PAYMENTS_REQUIRE_AUTOMATIC_DELIVERY
USER_PORTAL_PAYMENT_TEST_ACCOUNT_DIGEST
USER_PORTAL_PAYMENT_TEST_AMOUNT_MINOR
USER_PORTAL_PAYMENT_TEST_CHANNEL
USER_PORTAL_PAYMENT_TEST_PLAN
```

Do not add these to production until a separate approval packet covers install,
validation, rollback, and secret rotation.

`USER_PORTAL_PAYMENT_TEST_ACCOUNT_DIGEST` is the SHA-256 hex digest of the
normalized login email or display identity. When it is set together with a
positive `USER_PORTAL_PAYMENT_TEST_AMOUNT_MINOR`, only that matching portal
account can receive the test amount override. `USER_PORTAL_PAYMENT_TEST_CHANNEL`
and `USER_PORTAL_PAYMENT_TEST_PLAN` should be set for live smoke tests, for
example `wxpay` and `monthly_basic`, so normal accounts and normal plans keep
their configured prices.

## Validation

Local validation:

```powershell
node --test server/tests/platform-niuniu-pay-adapter.test.mjs
node --test server/tests/platform-portal-payment-orders.test.mjs server/tests/portal-payment-routes.test.mjs
node --test server/tests/platform-payment-routes.test.mjs
node --test server/tests/platform-subscription-control-db.test.mjs
node --test server/tests/state.test.mjs
npm test
git diff --check origin/master...HEAD
```

Production validation is intentionally not defined here. Any real provider
activation must use a separate Risk A runbook.
