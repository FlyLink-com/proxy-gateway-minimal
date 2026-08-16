# Portal Registration Welcome Coins

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: portal_registration_welcome_coins
  superseded_by: null
  last_verified_at: 2026-08-15
  production_authority: false
```

## Status and Boundary

This is a source-only contract for a narrow new-registration promotion. It does
not authorize a production schema apply, feature-flag change, deployment,
payment, Wallet write, Commerce order, fulfillment, runtime mutation, or
customer-data action. A source artifact, migration, test result, or Portal
build is not evidence that the promotion is enabled in production.

The promotion is not wallet-first. It is deliberately separate from
`docs/FUTURE_ACCOUNT_WALLET_FIRST_MODEL.md` and must not be used to activate a
shared node, deferred runtime, Account Resource Authority, escrow/setup
delivery, payment path, or resource effect. This source release keeps deferred
runtime and node composition dormant.

## Configuration Contract

The following protected runtime settings control admission:

| Setting | Required value | Meaning |
| --- | --- | --- |
| `USER_PORTAL_REGISTRATION_WELCOME_COINS_ENABLED` | `true` | Permits the narrowly selected new-registration promotion. The default is `false`. |
| `USER_PORTAL_REGISTRATION_WELCOME_COINS_CANARY_EMAIL_HASHES` | Exactly one lowercase SHA-256 digest | Selects the one approved registration email after trim-and-lowercase normalization. |

The admission flag requires Portal registration, Coins Wallet, ordinary Coins
Commerce, and the welcome-grant schema to be ready. If the admission flag is
true and any one of those prerequisites is unavailable, composition fails
closed. When the flag is false, new registrations remain on the legacy trial
path; a missing welcome-grant schema does not itself start a worker or block
that legacy path. When Coins Wallet, ordinary Coins Commerce, and the schema
are ready, the internal coordinator may drain or expire durable grants that
already exist, even after admission is disabled; that drain behavior does not
admit a new registration or introduce another environment flag.

Only the admission flag parses the canary setting. The canary must be exactly
one 64-character lowercase hexadecimal SHA-256 digest. Empty values, raw email
addresses, duplicate or multiple values, non-canonical values, and
`all_active` fail closed. The digest is pseudonymous rather than anonymous: it
belongs only in protected runtime configuration and must not be committed,
returned by the Portal, or printed in logs or deployment evidence.

`USER_PORTAL_WALLET_FIRST_MODEL_ENABLED` is deprecated. It must remain false;
setting it true fails closed. It neither enables this promotion nor activates
wallet-first, a deferred runtime, or any other capability.

## New-registration Contract

For a matching **new** registration while the admission flag is enabled, the
source contract is:

1. create the normal Portal account and credentials/session records;
2. omit `commercialModel` from persistent account metadata, including
   `wallet_first_unique_v1`;
3. create no legacy trial entitlement and no Portal access request;
4. record one durable, idempotent welcome-grant intent; and
5. credit exactly 10 available `bonus_coins` once the normal Wallet grant path
   processes that intent.

The source contract gives the welcome Coins a seven-day expiry measured from
registration. A pending grant at or after its expiry must not be credited. The
grant/retry path is durable and idempotent, so a crash/retry cannot create a
second credit for the same registration.

A non-matching new registration or a registration while the flag is disabled
uses the legacy 7-day trial behavior. Changing the canary does not migrate,
rewrite, or re-route an existing account. The durable-grant worker may only
resolve an already-recorded grant under its existing credit-or-expire lifecycle;
it does not make an account newly eligible for this promotion.

## Commerce and Fulfillment Boundary

An account created by this promotion resolves through the ordinary legacy
commercial path because it has no persistent commercial-model marker. Its
Marketplace visibility, Coins settlement, normal Commerce order/fulfillment
flow, and existing payment boundaries are reused without alteration. The 10
welcome Coins are a balance grant, not a service entitlement, order, payment,
or immediate resource issuance.

This promotion must not create a parallel order system, replace ordinary
fulfillment, or reinterpret Coins settlement. It also must not introduce a
shared node, per-order-to-shared-node migration, deferred reservation,
Authority binding, protected setup material, escrow, or payment-provider
change.

## Schema and Runtime Boundary

The durable welcome-grant store has its own schema contract. An independent
Risk A gate is required before applying or migrating that schema in production.
The source composition may process existing durable welcome grants only when
Wallet, ordinary Commerce, and the exact welcome-grant schema are all ready.
The worker has no registration-canary or new-account-admission dependency; its
enclosing ordinary Commerce composition retains its existing prerequisites.
The source does not apply a schema automatically, and schema absence while
admission is disabled leaves the normal legacy registration path available.

The schema successor accepts only the exact, checksummed prior welcome-grant
contract. It removes the obsolete commercial-model column while preserving a
valid predecessor row's immutable grant identity, including `sourceDigest`,
solely for retry and idempotency continuity. It does not reinterpret that
historical digest as an account commercial model; a drifted predecessor fails
closed instead of being rewritten. Before a rebuild it also refuses unknown
explicit indexes or triggers attached to the grant table, and any SQLite view
whose SQL references that table; SQLite autoindexes remain allowed. This avoids
silently discarding or leaving behind dependent schema objects.

The view guard is intentionally conservative text matching, not a SQL parser.
An unrelated view that merely contains the table identifier in its SQL text can
therefore block a migration. That is a safe, explicit stop: the future Risk A
schema dry-run must inventory and resolve it before any production apply. This
source release never drops, rewrites, or bypasses such a view automatically.

No production enablement is authorized by this document. Any future production
change needs fresh inventory, an exact approval boundary, backup and rollback
evidence, and post-change validation appropriate to its Risk A scope.

## Admission-configuration Tool Boundary

The repository-owned Welcome Coins activation gate is intentionally narrower
than a generic runtime-configuration editor. It derives the current release's
protected `.env` from the approved `current` pointer and permits a one-time
atomic insertion of only the admission flag and a single normalized-email
digest. The digest is stdin-only and is not returned in a receipt.

The helper must run only after the independent snapshot guard has stopped the
service and after the approved welcome schema migration is validated. It does
not perform either operation, does not restart the service, and does not modify
ordinary Commerce or any wallet-first/deferred/Authority setting. If the target
keys conflict or any non-target safety prerequisite is unexpected, it fails
closed rather than reconciling or overwriting the configuration. The sole
retry exception is an exact identity-bound already-active state with the same
stdin digest; it is a no-op confirmation, never a rewrite.

## Explicit Non-goals

- wallet-first account selection or persistent commercial-model assignment;
- deferred runtime, shared-node, per-order migration, or resource effects;
- Account Resource Authority, setup delivery, protected material, or escrow;
- payment, recharge, checkout, normal Commerce, or fulfillment changes;
- existing-account migration or trial rewriting; and
- production schema application, activation, deployment, or runtime mutation.

## Source Validation

Validate the registration route, welcome-grant migration/store/coordinator,
runtime-state composition, Portal client contract, and focused compatibility
tests together with the normal full source suite. A passing source test suite
does not establish production schema readiness or activation.
