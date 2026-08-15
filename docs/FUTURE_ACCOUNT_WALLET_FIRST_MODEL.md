# Future Account Wallet-First Model

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: future_account_wallet_first_model
  superseded_by: null
  last_verified_at: 2026-08-15
  production_authority: false
```

## Status and Boundary

This is a Risk A source-only contract for future Portal accounts. It does not
authorize a schema apply, feature-flag change, deployment, payment, Coins
write, Commerce order, fulfillment, runtime mutation, or production account
change.

Existing accounts remain on their current compatibility path. This model does
not migrate, select, merge, retire, repair, or otherwise modify existing
entitlements, issued links, wallets, orders, payment records, or runtime
resources. It is a per-`account` resource model; it does not claim that a
natural person, email address, or external identity can own only one account.

The default state is disabled. A source artifact that contains these modules is
not evidence that the model is enabled or deployed.

## Registration Canary Boundary

The initial production scope is exactly one pre-approved new registration, not
an all-account rollout. The feature remains disabled unless
`USER_PORTAL_WALLET_FIRST_MODEL_ENABLED=true`. When that main flag is enabled,
`USER_PORTAL_WALLET_FIRST_REGISTRATION_CANARY_EMAIL_HASHES` must contain exactly
one canonical lowercase SHA-256 digest of the Portal registration email after
trim and lowercase normalization. An empty value, raw email, duplicate list,
non-canonical digest, or `all_active` value fails closed during runtime
composition before database access.

There is intentionally no wallet-first `all_active` configuration mode. The
existing `COINS_COMMERCE_AUDIENCE` setting governs ordinary Commerce storefront
eligibility for existing account IDs; it does not select a new registration and
must not be used as a wallet-first rollout control. The configured digest is
pseudonymous rather than anonymous: it must stay in protected host
configuration, must not be committed, returned by the Portal, or printed in
logs or deployment evidence.

The allowlist is evaluated only after the registration email is normalized and
verified, and before an account, entitlement, access request, or welcome grant
is created. A matching new registration receives the wallet-first model. A
non-matching verified registration retains the existing legacy trial flow.
Existing accounts are selected only from their stored commercial-model marker;
changing this new-registration canary never migrates a legacy account or routes
an existing wallet-first account back to legacy Commerce.

## New-account Contract

When the future feature is explicitly enabled after its separate production
gate, a successful self-service registration whose normalized email digest
matches the one approved canary digest must:

1. create one Portal account with `commercialModel` set to
   `wallet_first_unique_v1`;
2. create no trial entitlement and no trial Portal access request;
3. write one durable welcome-grant intent in the same control-store
   transaction as the account and its credentials/session; and
4. asynchronously credit exactly 10 available `bonus_coins`, with an
   expiration at the registration timestamp plus seven days, using the stored
   source and idempotency identity.

The welcome-grant worker is recoverable, not cross-connection atomic: it may
replay its stored Wallet operation after a crash, but it must never credit the
same registration twice. At or after the expiration timestamp it must not
credit a pending grant. The Wallet projection and allocation path must exclude
expired bonus Coins immediately; the bounded expiry worker only clears the
registration-welcome source class and must not expire other bonus policies.

The 10 welcome Coins are ordinary bonus Coins for product allocation priority:
bonus Coins are allocated before paid Coins, which are allocated before reward
Coins. They are not a free service entitlement. Current catalog products cost
more than 10 Coins, so a first purchase normally also needs paid Coins.

## Deferred Resource Transitions

For `wallet_first_unique_v1` accounts, a purchase made while a service resource
is active is a durable deferred resource transition rather than an immediate
cross-product replacement.

The selector is explicit and deterministic:

| Offer | Rank |
| --- | ---: |
| 200 GB / 365 days / monthly 200 GB | 3 |
| 100 GB / 30 days / monthly 100 GB | 2 |
| 50 GB / 30 days / monthly 50 GB | 1 |

At an entitlement boundary, the highest rank is selected first; equal ranks
are FIFO by reservation time and opaque transition reference. Remaining
reservations are retained and rebased to the newly effective resource's
expiration. This is not an automatic migration of an existing account.

Coins are reserved at confirmation and captured only after the new resource
effect has been durably recorded. A scheduled transition must use a dedicated
deferred-reservation domain and its own allocation/audit records. It must not
reuse the short-lived `platform_coin_holds` state machine, ordinary Commerce
`cancel_until`, or the normal Commerce coordinator: those mechanisms capture
on a short timer and cannot safely represent a long-lived reservation.

Each reservation snapshots `activation_at` from the current scheduled boundary
and an `expires_at` at that boundary plus a fixed 24-hour recovery window. A
rebase may move both times forward only in the same transaction that records
the transition rebase. Before an effect or capture, the deferred worker
revalidates the exact expected resource chain, reservation lease, immutable
offer/allocation snapshot, and each bonus lot's expiration against that entire
reservation window. If a bonus allocation would be expired during the window,
the reservation is released and the transition becomes `requote_required`; it
must not silently consume expired bonus Coins. An effect that is recorded but
cannot safely capture Coins is
`reconciliation_required`, never an automatic second fulfillment.

Natural predecessor expiry has one narrow recovery exception: only an already
leased `scheduled_switch` may revalidate its unchanged, exact predecessor
after `valid_until`, and only while its reservation remains within the
24-hour recovery window. The account and predecessor state must still be
active and every immutable ID/binding must still match; reserve, rebase,
successor, and drifted/disabled-resource paths retain the normal current-time
predicate. At `expires_at` or later, the reservation is released and the
transition is `requote_required` before any runtime effect or Coins capture.

When capture and settlement succeed, the same control-store transaction writes
a durable rebase outbox keyed by the settled transition and carrying the exact
successor snapshot. The worker claims that outbox with a lease/CAS state
machine; it must not use an in-memory queue as the only record of a remaining
scheduled-switch rebase.

## Runtime Effect Recovery

The control-plane preparation and the external runtime effect are separate
durable steps. A dedicated runtime-effect claim records the immutable
transition, successor, node, lease generation, lease token, and lease expiry
before a tenant/artifact is created or renewed. Recording the runtime receipt
requires the same current lease generation and token.

If a process crashes after the external runtime action but before its receipt,
a later claimant may complete only after an exact readback of the prepared
tenant/artifact and target expiry. A stale takeover must never create another
tenant when the exact initial marker is missing: the Core has no create-or-get
fence for that marker. Missing, partial, duplicate, disabled, or drifted
runtime state becomes `reconciliation_required` and cannot capture Coins.
Likewise, an active inner runtime lease is retryable, not an outer transition
failure; it is neither probed nor mutated until it can be safely claimed.
These rules deliberately prefer a visible manual reconciliation over a second
resource or an unearned capture.

The current legacy Commerce flow remains unchanged for accounts that do not
carry the future commercial-model marker. The global Account Resource
Authority feature remains disabled for this model: its current global mode
does not support a zero-resource first purchase.

## Source-only Activation Preconditions

The runtime flags are default-off and may not be enabled merely because their
schemas exist. At minimum, a later exact Risk A Gate must prove all of the
following in the same approved release:

- Portal, Wallet, and Commerce prerequisites are enabled and healthy;
- the main flag is enabled with exactly one approved normalized-email digest;
  wallet-first all-active selection remains unsupported;
- global Account Resource Authority remains disabled unless a separately
  approved per-account replacement is implemented;
- welcome-grant, deferred-transition, deferred-reservation, deferred-checkout,
  and runtime-effect-claim schemas are exact and ready through their closed
  schema gates;
- the deferred transition store, reservation participant, resource-effect
  handler, runtime-effect claim recovery, and coordinator all satisfy their
  strict runtime contracts;
- the current runtime desired-state, notification, lease, and receipt drift is
  resolved for every affected remote handoff scope;
- a bounded synthetic/new-account validation proves registration, durable
  welcome intent, one-time credit, expired-bonus exclusion, paid-Coin top-up,
  reservation, capture-after-effect, fulfillment, and queue rebase; and
- a separate `portal-static` artifact is verified against the matching Portal
  API contract before the user interface is exposed.

The gate must include backup/restore proof, a write barrier, a fresh
aggregate-only inventory, and a rollback/forward-reconciliation procedure.
It must not read or print credentials, sessions, customer identifiers,
subscription URLs, raw database rows, or payment-provider secrets.

## Explicit Non-goals

- no historical entitlement normalization or package conversion;
- no old-account Wallet, Order, payment, or runtime mutation;
- no automated selection of legacy resources;
- no global Authority enablement as a shortcut;
- no direct SQLite balance adjustment, fake payment callback, or manual
  `paid_coins` grant;
- no generic long-lived hold, delayed normal Commerce capture, or implicit
  capture after bonus expiry; and
- no claim that one natural person, email address, or external identity has a
  database-enforced single account.

## Source Validation

Run the focused migration, Wallet, registration-canary, deferred-policy,
deferred-store, runtime-effect crash/recovery, coordinator, state, Portal, and
documentation checks on a clean candidate. Full validation and a later
production gate must report their results separately. A passing source test
suite is not production activation evidence.
