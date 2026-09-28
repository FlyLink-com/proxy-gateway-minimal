# Independent data-pack commerce — implementation boundary

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_commerce_implementation_boundary
  superseded_by: null
  last_verified_at: 2026-09-28
  production_authority: false
```

Status: source implementation in progress; **not published or deployed**.

## Intent and current source gap

The requested offers are 100 GB for 30 Coins, 200 GB for 50 Coins, and
500 GB for 100 Coins. Each purchase owns a separate subscription and a single
lifetime quota. The quota is never replenished by a calendar boundary, page
refresh, subscription re-fetch, or credential rotation. The pack becomes
unusable when its measured usage reaches the purchased allowance. The
customer may have a timed plan and multiple packs at the same time; usage from
one resource must not be charged to another.

The current Commerce offer shape accepts `data_pack`, but the published catalog
contains only timed plans. The production fulfillment handler passes
`durationDays` and `monthlyTrafficGb` into the timed-plan issuer, and the
wallet-first deferred path models one current timed entitlement. Neither is a
valid data-pack delivery path. The current order projection contains only
fulfillment status, not an order-owned subscription handoff. Publishing the
candidate offers before those gaps are closed would create paid orders with no
valid resource, so the candidates remain outside the published catalog.
The timed-plan production fulfillment constructor also rejects a published
data-pack offer until a separate, verified pack fulfillment path exists.
The Commerce store now has an owner-scoped delivered-order binding lookup for
existing timed-plan deliveries. It returns only opaque request and entitlement
references after checking the delivery receipt and fulfillment audit. This is
the foundation for order-page recovery, not a data-pack issuance path or a
subscription-material API; neither is exposed by this change.
A second read-only control-store projection now sums measured samples only for
the exact pack issuance request and entitlement, even when the same account
also holds a timed plan or another pack. It preserves a `pending` result when
no sample exists, counts usage across month boundaries and link rotation, and
rejects ambiguous active bindings. This does **not** issue a pack, prove that
the live collector can resolve its credential, or enforce exhaustion yet.
The legacy account-current resolver now excludes only the three recognized
pack offer versions from its single timed-resource selection. It still checks
each binding's stored lineage; the separate pack projection checks its own
quota and owner. Thus adding a pack will not by itself make an existing timed
plan disappear from the homepage. Wallet-first authority remains a separate
binding and is not reassigned by this change.
The collector quota decision now filters measured samples by account,
entitlement **and** request, rather than request alone. A red-before-fix test
showed that an inconsistent sample sharing only a request ID could otherwise
trigger a false quota suspension. This tightens attribution for existing
plans as well as future pack resources; it is not evidence that a pack has
been issued or that runtime suspension has been validated.
The product decision for “never expires” is an explicit
`commercial_never_expires` resource marker plus a far-future technical
runtime deadline (`9999-12-31T23:59:59.999Z`) because the existing control
and runtime contracts require an expiry value. The technical deadline is not
the customer's commercial expiry and must not be displayed as one. It needs
an operator-maintained renewal path before that technical horizon; exhausting
the purchased bytes remains the only commercial stop condition. The add-only
control table records the marker, immutable order/request/entitlement lineage,
command, quota, and technical deadline. Its source tests cover idempotent registration,
conflicting replay rejection, absent-record rejection, separate pack usage,
and reopening a pre-existing control database without losing an account.
An internal fulfillment-effect writer now binds that resource to exactly one
initial issued link and emits a separate data-pack audit fact. A replay after
credential rotation retains the same effect and quota; changing the command
or issued link stops for reconciliation. The owner-scoped usage read additionally
requires the exact order reference, so a second pack on the same account cannot
be returned for that order. A resource row without its matching immutable
fulfillment effect is rejected rather than exposed as delivered usage.
The Commerce delivered-order reader now recognizes an independent pack only
when the captured order has a delivered command, immutable receipt, and an
exact matching pack effect; it returns safe order/request/entitlement references
and never subscription material. A missing or drifted effect is reconciliation,
not a delivered customer handoff.
The control store can now reserve one entitlement and issuance request per
order in a single transaction. Its replay keeps the original timestamp and
quota, rejects command or offer drift, and permits a timed plan and another
pack to coexist. A separate atomic finalizer binds the first runtime tenant
and artifact references to that reservation, with exact replay and no raw
material in its result. The control-only restart test reopens the database
between reservation and finalization, then replays after another reopen
without creating a second entitlement or issued link. These internal methods
do not themselves prove that the Commerce order was captured or that the
runtime identity and edge credentials were created; a verified issuer and
cross-store recovery remain
required before any pack can be sold.
This source-only table does **not** yet verify a captured Commerce order across
the database boundary, issue runtime credentials, suspend an exhausted pack,
or provide a customer handoff. An audit fact alone is not a delivered Commerce
receipt. The offer stays unpublished.
The offer schema also requires a CNY `referencePrice`. Candidate records use
the existing one-Coin-to-one-CNY display convention solely to satisfy that
compatibility field; the requested purchase price is in Coins, and this does
not authorize an external payment amount or a new recharge rate. Reconfirm
that display metadata before publication.
An isolated persistence test additionally confirmed that
`platform_portal_access_requests.plan` currently admits only `trial`,
`monthly`, and `yearly`; inserting a data-pack request fails its SQLite
constraint. This is a real schema/migration boundary, not a UI omission.

Issue #522 describes an older shared-allowance preference (monthly quota
first). The 2026-09-28 product instruction supersedes that preference for
these three new offers: **independent subscription per purchased pack**.
Historical purchases and their accounting must not be rewritten.

## Required end-to-end contract

1. A quote identifies the immutable offer version, Coins allocation, account,
   and single purchase operation. Insufficient Coins never silently starts a
   fiat payment. Replayed confirmation must return the same order.
2. A verified captured order creates exactly one new pack entitlement,
   issuance request, runtime principal, subscription artifact, and binding.
   An account's existing timed-plan authority is not replaced. Partial
   issuance remains recoverable without a second debit or second credential.
3. The resource records one purchased byte limit and lifetime usage against
   its own request and credential. Every accounting read, rendered usage
   header, and quota action uses that same scope. Exhaustion suspends only the
   purchased pack's traffic supply; it does not revoke the account or a
   different order's resource. UI never presents the technical deadline as an
   expiration date; a separate operational renewal maintains that deadline.
4. The subscription display is an authenticated, no-store, order-owned
   handoff. Order lists expose status and an availability indicator, never a
   raw URL. The order detail may re-fetch the same material after the delivery
   dialog closes. A link rotation, if provided, changes only credentials; it
   never resets usage or creates a new quota.
5. For both legacy and wallet-first accounts, a purchase is unavailable until
   its exact data-pack fulfillment path and runtime mapping are ready. The
   storefront must not publish this candidate on the strength of an offer
   definition or UI card alone.

## Validation and promotion gates

- Isolated tests: three price/size snapshots, idempotent payment and partial
  fulfillment recovery, two simultaneous packs plus a timed plan, no monthly
  quota reset, exhausted-pack-only suspension, credential refresh/rotation
  without quota reset, account isolation, and order-detail recovery after
  remount or browser refresh.
- Schema migration rehearsal: preserve all existing access requests, indexes,
  foreign keys, and constraint behavior while admitting the separate pack
  resource type. The current timed-plan rows must not be rewritten as packs.
- Runtime-like validation: issue and render each pack on an isolated host,
  import the rendered subscription, meter traffic to exhaustion, verify the
  other resources remain available, and rehearse recovery and rollback.
- Production: fresh read-only catalog/schema/runtime inventory; exact
  artifact, migration/back-up and rollback plan; operator approval; staged
  verification; then publication and receipt. Source tests and a Vercel
  preview are not production authorization.

No production product, schema, service, wallet, or customer data is changed by
this source-only record.
