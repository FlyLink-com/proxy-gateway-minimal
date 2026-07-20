# Payment Provider System Plan

Last updated: 2026-07-20, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: commercial_payment_provider_system
  superseded_by: null
  last_verified_at: 2026-07-20
  production_authority: false
```

> Status:
> - Type: Source-only payment-provider inventory and future integration plan
> - Risk: A envelope / B source core
> - Execution authority: None
> - Production impact: None
> - Provider impact: None
> - Source of truth for: current repository payment-module inventory, active
>   provider vocabulary, PayPal / WorldFirst integration order, and future
>   payment gates
> - Not a source of truth for: prices, tax, invoices, refunds, payout policy,
>   live provider credentials, webhook registration, production configuration,
>   payment-ledger schema migration, or entitlement activation

This document prepares the payment system direction without activating any
real provider. The operator may prepare PayPal sandbox/live accounts separately,
but real credentials and webhook secrets must stay outside Git, chat, PR
descriptions, logs, and public evidence.

## Current Repository Inventory

The repository currently has a provider-neutral payment foundation, not a live
payment product.

| Surface | Current state | Boundary |
| --- | --- | --- |
| `docs/COMMERCIAL_MODEL_V1.md` | Active commercial policy for time-bounded packages with included traffic. | Payment provider events may later feed commercial events, but do not issue runtime credentials directly. |
| `docs/BILLING_RECHARGE_CONTRACT.md` | Provider-neutral recharge order, verified payment event, credit decision, and usage-debit contract. | No provider API call, checkout URL, webhook, storage migration, or subscription issuance. |
| `docs/PAYMENT_PROVIDER_ADAPTER_TEMPLATE.md` | Fail-closed adapter template and placeholder configuration shape. | Checkout, capture, and webhook verification are stubs until a provider-specific adapter is approved. |
| `server/services/platform/billing-provider-contract.mjs` | Normalizes safe payment facts and credit/debit decisions. | Drops customer-private fields and raw payment material from returned facts. |
| `server/services/platform/payment-provider-adapter-template.mjs` | Summarizes provider env readiness and normalizes already-verified payment events. | Reports booleans only; does not expose configured values. |
| `.env.payment.example` and `bin/gccgw.mjs` env skeleton | Placeholder-only provider env names. | Real values belong only in operator-managed protected runtime env files. |
| Tests | `platform-billing-provider-contract` and `platform-payment-provider-adapter-template`. | Synthetic local coverage only; no live provider calls. |

Current source vocabulary:

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

Niuniu Pay is retired. It is intentionally not part of the active provider
vocabulary for new work. Historical Niuniu material may be used only for
deprecated migration analysis and must not become a new checkout, webhook, or
credential path.

## Target Payment Spine

Future payment work should keep a single provider-neutral spine:

```text
provider-specific checkout or collection
  -> provider signature / authenticity verification
  -> normalized payment event
  -> idempotent order decision
  -> commercial entitlement decision
  -> controlled access lifecycle
  -> separately gated runtime apply
```

Payment is evidence for a commercial decision. It is not an authority to create
subscription URLs, runtime credentials, proxy-node config, or direct traffic
access.

## Provider Roles

| Provider | Intended role | Next local source step | Live boundary |
| --- | --- | --- | --- |
| `paypal` | First online checkout candidate for sandbox proof, then live production candidate. | Add a PayPal sandbox adapter with injected HTTP client tests for order create/capture and webhook verification. | Live client secret, live webhook registration, and production payment capture require a separate Risk A gate. |
| `worldfirst` | Candidate for cross-border collection or provider-specific business payment flows after account/API capability is confirmed. | Keep vocabulary and env shape ready; implement adapter only after the exact WorldFirst product/API surface is selected. | RSA private keys, platform public keys, API origin, IP allowlists, and notification registration require a separate Risk A gate. |
| `manual` | Operator-verified commercial event fallback during Controlled Beta. | Preserve as a safe non-provider path for manual paid-pilot evidence. | Manual evidence still must be idempotent and auditable before entitlement effects. |
| `mock` | Local and CI test provider. | Use only for tests and demos. | Never use as production payment evidence. |

Do not add Niuniu as a compatibility alias. Keeping the old provider absent is
the fail-closed migration behavior.

## Operator Inputs To Prepare

Do not paste these values into Codex chat or commit them to the repository.
Use protected runtime files or provider consoles only.

### PayPal

Prepare separate sandbox and live materials:

```text
PAYMENT_PROVIDER=paypal
PAYMENT_MODE=sandbox | live
PAYMENT_PROVIDER_API_KEY=<PayPal REST client id>
PAYMENT_PROVIDER_API_SECRET=<PayPal REST client secret>
PAYMENT_PROVIDER_WEBHOOK_SECRET=<PayPal webhook id or verification secret shape chosen by adapter>
PAYMENT_PUBLIC_BASE_URL=<public payment base URL>
PAYMENT_RETURN_URL=<approved return URL>
PAYMENT_CANCEL_URL=<approved cancel URL>
```

Before a live gate, record only redacted facts:

```text
account mode present
REST app present
webhook endpoint registered
required currencies/payment methods enabled
settlement account ready
provider dashboard shows no blocking limitation
```

### WorldFirst

WorldFirst must first be classified by exact product capability. Do not assume
it is a PayPal-equivalent hosted checkout until the account/API product proves
that flow.

Expected private configuration shape:

```text
PAYMENT_PROVIDER=worldfirst
PAYMENT_MODE=sandbox | live
PAYMENT_PROVIDER_CLIENT_ID=<provider client id>
PAYMENT_PROVIDER_PRIVATE_KEY_PATH=<operator-only RSA private key path>
PAYMENT_PROVIDER_PLATFORM_PUBLIC_KEY_PATH=<operator-only platform public key path>
PAYMENT_PUBLIC_BASE_URL=<public payment base URL if the selected product uses callbacks>
PAYMENT_RETURN_URL=<approved return URL if applicable>
PAYMENT_CANCEL_URL=<approved cancel URL if applicable>
```

Before implementation, confirm:

```text
selected WorldFirst product and API family
sandbox availability
request signing algorithm and key lifecycle
notification or webhook shape
order / collection / payment object lifecycle
currency and settlement behavior
callback URL and IP allowlist requirements
refund, reversal, and dispute behavior
```

## Future PR Sequence

1. Current PR: provider vocabulary, payment-system inventory, and multi-provider
   plan. No live provider calls.
2. PayPal sandbox adapter PR: implement provider-specific code with injected
   HTTP client tests and synthetic webhook signature fixtures. No production
   credentials, public routes, or live capture.
3. PayPal sandbox integration gate: use operator-provided sandbox credentials
   in a controlled environment, verify order and webhook behavior, and record
   redacted evidence only.
4. Payment ledger/schema PR: add durable payment orders, provider events,
   idempotency keys, and billing ledger rows behind migration gates.
5. Entitlement decision PR: connect verified payment events to commercial
   entitlement decisions without direct subscription or runtime mutation.
6. Live PayPal activation gate: exact Risk A production approval, protected
   credentials, webhook registration, backup/rollback plan, and redacted
   payment evidence.
7. WorldFirst adapter PR: begin only after the exact WorldFirst account/API
   capability is confirmed and mapped to the provider-neutral spine.

## Data And Privacy Rules

Future durable storage should keep only normalized evidence:

```text
payment_order:
  safe order ref, provider id, account ref, package ref, amount minor,
  currency, status, timestamps

payment_event:
  safe event ref, provider id, idempotency key, order ref, event type,
  verification status, received timestamp, raw payload digest only

billing_ledger:
  direction, amount, account ref, entitlement/order refs, source event refs,
  previous and resulting safe balance facts
```

Do not store or display raw provider payloads, provider credentials, customer
email, card tokens, payment instruments, private keys, settlement account
details, subscription URLs, runtime credentials, raw SQLite rows, or customer
private data in public evidence.

## Required Gates

| Work | Risk | Required validation |
| --- | --- | --- |
| Docs-only payment architecture | C | `git diff --check origin/master...HEAD` |
| Provider vocabulary / disabled adapter code | B | focused payment tests, `npm test`, diff check |
| Sandbox provider HTTP adapter | B source / A external sandbox envelope | injected-client unit tests, sandbox-only gate if real provider is called |
| Public checkout route or webhook route | A | exact endpoint scope, auth/rate-limit review, signature verification, replay/idempotency tests, rollback plan |
| Production credentials or live capture | A | protected env install, provider dashboard readback, redacted payment proof, rollback/disable plan |
| Payment ledger schema migration | A | migration backup, dry-run, rollback, idempotency and replay tests |
| Payment-driven entitlement effect | A | entitlement state machine tests, no direct subscription/runtime mutation, audit proof |

## External Provider References

Provider docs can change. Re-check official docs during each provider-specific
implementation PR:

- PayPal REST API overview: <https://developer.paypal.com/api/rest/>
- PayPal Orders API v2: <https://developer.paypal.com/docs/api/orders/v2/>
- PayPal Webhooks API: <https://developer.paypal.com/api/rest/webhooks/>
- WorldFirst developer portal: <https://developers.worldfirst.com/>
