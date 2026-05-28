# Telegram Delivery Adapter

Last updated: 2026-05-28, Asia/Shanghai.

> Status:
> - Type: Repository-only delivery adapter design
> - Risk: C for this document
> - Execution authority: None
> - Production impact: None
> - Scope: customer-owned Telegram Bot onboarding, QR registration, entitlement
>   delivery, and future payment boundary

This document defines how Telegram can become a lightweight delivery adapter
for customer-owned bots. It does not authorize Telegram token use, webhook
exposure, payment activation, Aliyun runtime changes, DNS, Nginx, systemd,
SQLite schema changes, artifact issuance, subscription URL delivery, edge
traffic, or production mutation.

## Product Decision

Use Telegram as the customer-facing distribution surface, but keep the
subscription control plane authoritative.

```text
customer group / channel promotion
  -> public landing page with QR code
  -> customer-owned Telegram bot
  -> bot private chat binding
  -> Aliyun subscription control plane
  -> entitlement / artifact / delivery record
```

The bot is not the platform brain. It is a low-permission adapter that accepts
user intent, binds Telegram identity, and requests controlled delivery actions.

## Customer-Owned Bot Model

The target commercial model is customer-owned bot hosting:

```text
Customer owns the Telegram bot in BotFather.
Customer controls whether the bot token remains valid.
This platform hosts the bot backend and subscription delivery workflow.
```

This lets each customer promote their own branded bot while the platform keeps
common subscription control, entitlement, artifact, and audit logic.

Required posture:

- bot tokens are credentials and must never be committed, logged, pasted into
  docs, or displayed in PRs
- token values must be read from environment variables or a future encrypted
  token vault
- each bot must map to exactly one tenant/customer
- one tenant's bot update must never affect another tenant
- revoking a customer bot token must fail closed for that tenant only

## Registration Flow

The minimal user path is:

```text
1. Customer promotes a group, channel, or public landing page.
2. Landing page shows a QR code.
3. QR code opens a Telegram deep link for the customer's bot.
4. User taps Start.
5. Bot receives /start <short_payload>.
6. Adapter verifies the payload against a QR session or invite code.
7. Adapter binds telegram_user_id to an account or lead.
8. Operator grants entitlement, or later payment creates entitlement.
9. Adapter renders or requests a subscription artifact.
10. Bot sends the private subscription entry and safe instructions.
11. Delivery evidence is recorded.
```

The QR payload must be a short, one-time value such as a nonce, invite code, or
campaign id. It must not contain a raw subscription URL, token, customer
identity, plan secret, artifact secret, or long-lived entitlement.

Recommended QR deep link shape:

```text
https://t.me/<customer_bot_username>?start=<one_time_payload>
```

Before implementation, verify the current Telegram deep-link payload
constraints against the official Telegram documentation.

## Bot Command Surface

Allowed customer-facing commands:

```text
/start
/redeem
/status
/subscription
/refresh
/help
```

Future payment support should also reserve:

```text
/paysupport
```

because Telegram payment flows require a customer-support path for payment
issues.

Forbidden bot capabilities:

```text
execute shell
change DNS
change Nginx
restart services
create or mutate edge nodes
export database rows
read all users across tenants
open public Admin
submit A-tier approval phrases
deploy or roll back production
print raw tokens, artifact refs, or subscription URLs to logs
```

## Operator CLI Contract

Telegram delivery should be driven through controlled CLI/service actions, not
raw shell commands. Future commands should look like:

```text
platform telegram-bot register --tenant <tenant_id> --token-env <env_name>
platform telegram-bot verify --tenant <tenant_id>
platform telegram-bot set-commands --tenant <tenant_id>
platform campaign create --tenant <tenant_id> --source telegram
platform qr issue --tenant <tenant_id> --campaign <campaign_id>
platform lead list --tenant <tenant_id>
platform entitlement grant --tenant <tenant_id> --telegram-user-id <id>
platform delivery send-telegram --tenant <tenant_id> --account <account_ref>
```

These are contract examples only. This document does not implement them and
does not authorize real Telegram token usage.

## Data Model Contract

Future implementation should keep the data model separated by tenant and by
authority:

```text
tenant_bots:
  tenant_id
  bot_username
  token_ref
  token_status
  webhook_secret_ref
  status
  last_verified_at

qr_sessions:
  session_id
  tenant_id
  campaign_id
  payload_hash
  purpose
  expires_at
  consumed_at
  consumed_by_telegram_user_id
  status

telegram_bindings:
  tenant_id
  telegram_user_id
  chat_id
  account_id
  created_at
  status

leads:
  tenant_id
  account_id
  source
  telegram_user_id
  status
  operator_note_ref

entitlements:
  tenant_id
  account_id
  plan
  valid_until
  quota_summary
  status

delivery_records:
  tenant_id
  account_id
  telegram_user_id
  artifact_ref_hash
  delivery_channel
  delivered_at
  status
```

Sensitive fields should be stored as references or hashes in operator-visible
summaries. Raw bot tokens, raw artifact references, raw subscription URLs, node
hosts, credentials, customer private notes, and approval phrases must not be
returned in safe summaries.

## Identity And Authorization

Telegram identity and platform authorization are separate:

```text
telegram_user_id = who is talking to the bot
entitlement = what the user is allowed to receive
artifact = the concrete subscription delivery object
```

A Telegram user id alone must never be enough to receive a subscription. The
adapter must require one of:

- a valid one-time QR session
- a valid redeem code
- an existing active binding and usable entitlement
- a verified payment-to-entitlement result in a future payment flow

## Payment Boundary

Payment is a later phase. It must not be bundled into the initial Telegram
delivery adapter.

If payments are made inside Telegram Bot or Mini App surfaces for digital
services, the implementation must follow Telegram's current digital-goods
payment rules, including Telegram Stars / `XTR` where required. If payments are
processed outside Telegram on a standalone web checkout, payment and
entitlement reconciliation must be designed as a separate commercial gate.

Initial MVP should use operator-granted entitlement:

```text
group promotion
  -> landing page QR
  -> Telegram binding
  -> operator review / grant
  -> bot private subscription delivery
```

## Risk Tiers

Repository-only documentation:

```text
Risk: C
Allowed: design docs, command contracts, data model contracts, non-goal lists
Forbidden: token use, webhook exposure, delivery of real subscriptions
```

Local adapter prototype:

```text
Risk: B
Allowed: long polling against a test bot token from local env, mock control plane,
  fake entitlement/artifact responses, tests
Forbidden: production token, public webhook, real user subscription delivery
```

Production bot hosting:

```text
Risk: A
Requires: exact approval, token storage decision, webhook endpoint, HTTPS public
  boundary, rollback, delivery validation, no-secret logs, tenant isolation
```

Payment activation:

```text
Risk: A
Requires: separate payment provider / Telegram Stars decision, refund/support
  policy, entitlement reconciliation, audit records, rollback posture
```

## Validation Expectations

Future B-tier implementation should include tests for:

- rejecting raw tokens and subscription URLs in safe summaries
- rejecting expired and reused QR sessions
- binding a Telegram user to only the matching tenant
- denying subscription delivery without usable entitlement
- producing delivery records without leaking raw artifact references
- preserving tenant isolation when two bots receive updates concurrently
- failing closed when a bot token is missing, revoked, or invalid

## Non-Goals

This design does not:

- create Telegram bots
- store or verify real bot tokens
- set webhooks
- open public routes
- deliver real subscription URLs
- issue production artifacts
- collect payment
- expose public Admin
- modify Aliyun, AWS, DNS, Nginx, systemd, firewall, nodes, or runtime config
- replace the subscription control plane
