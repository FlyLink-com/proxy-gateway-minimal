# Independent data-pack commerce — implementation boundary

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_commerce_implementation_boundary
  superseded_by: null
  last_verified_at: 2026-09-29
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
An add-only pack edge-credential table now records an explicit, replay-safe
request/entitlement/channel/material-digest binding after control issuance.
The old inferred `edgecred_<request>` alias is excluded for packs: without
an explicit active credential, traffic accounting returns an unresolved
binding rather than attributing traffic to a synthetic identity. An isolated
test connects that exact binding to accounting and obtains a lifetime quota
decision across a month boundary without affecting a timed plan. A separate
source-only issuer checks the captured Commerce claim and issued control
lineage before and after creating protected edge material, then registers the
matching digest. An isolated file-backed restart test reuses the same material
and credential without returning either secret. The table and issuer do
not themselves prove collector convergence or suspend traffic supply. The
Commerce coordinator now passes the exact live claim lease only to a
data-pack handler; existing timed-plan handler inputs stay unchanged. A
shared control/read-only projection includes a registered pack credential in
edge desired state only after its immutable resource and fulfillment effect
exist and its lifetime measured usage is below quota. Before that effect it
projects no pack credential, and at quota it projects removal of only that
credential. The two projections match in an isolated test. The fulfillment
handler still needs to request and confirm edge application; a changed
desired-state projection alone is **not** actual traffic-supply suspension
or a customer-delivery signal.
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
The next source slice provides a pack-only runtime issuer and a separate
encrypted material escrow. An isolated real-Core test now confirms that the
technical year-9999 date and a non-secret order marker are accepted by the
runtime; two orders on one account create separate tenants and artifacts.
Replay after protected-material store restart reuses the exact original
identity, and interruption after material capture but before control
finalization can resume without minting another artifact. If the artifact
exists but its protected URL was not durably captured, issuance stops for
reconciliation rather than generating another credential. The escrow remains
available for order-detail retrieval, but its release method is internal and
must only be called after an authenticated order-owner check. This runtime
stage now requires a live, exact Commerce fulfillment lease and verifies the
captured order and wallet hold before reservation and again before control
finalization. An isolated test runs a real captured pack order through the
Commerce claim and pack issuer, rejecting a wrong or expired claim without
minting another tenant. The issuer is **not yet wired into the production
fulfillment coordinator** and does not create
edge credentials, prove live collector identity, mark a Commerce receipt
delivered, or publish the candidate offers. Its single-writer file lock must
be included in the eventual service composition and restart rehearsal.
An internal order-detail resolver now requires the delivered Commerce receipt,
the exact owner-scoped pack effect and active binding, the matching runtime
tenant/artifact, and the encrypted material record before returning a link.
The first isolated test proves that an unpaid/undelivered or wrong-owner
request and runtime drift cannot release it. This resolver is not exposed as
an HTTP route yet; the eventual route must pass the authenticated session
account and use `no-store` response headers. The technical date is omitted
from its customer response.
This source-only path verifies a captured Commerce order across the database
boundary and can issue one protected runtime artifact under its exact live
claim. A source-only edge issuer can mint protected credential material under
that claim. A separate source-only fulfillment handler now composes those
issuers with the immutable pack effect and requires the exact desired-state
application receipt before reporting delivery to Commerce. Tests cover a
replayed immutable effect in the real control SQLite store and notifier, but
use synthetic Commerce claims, issuers and edge receipts; they do not prove
a real edge apply or cross-database crash recovery. It is **not wired into
the production fulfillment factory**. The
handler slice did **not** prove runtime identity-map convergence, suspend an
exhausted pack, or provide credential rotation or a customer-facing handoff;
later source-only slices below address parts of those gaps.
An audit fact alone is not a delivered Commerce receipt. The offer stays
unpublished.

A further isolated test now takes a synthetic collector observation through
the real traffic-accounting service, exact pack credential binding, SQLite
usage store, Agent desired-state read and authenticated Agent receipt writer.
With two independent packs on one channel, exhausting one changes only that
pack's credential in the desired state; a stale-generation receipt is refused,
and the other pack remains present. The test uses synthetic observations and
receipts: it does not show that a physical edge process applied the change or
that a running collector produced the observation. Production convergence and
traffic-supply stop remain separate gates.

Extending the isolated check through the production Agent runner exposed a
missing lookup: scoped tombstones recognized only legacy Portal credentials,
so an exhausted pack's retired credential did not appear in the Agent revoke
action. A unified, exact control-store lookup now covers both legacy and pack
credential records while leaving the legacy-only lookup unchanged. The runner
test confirms one pack-only revoke, the other pack's material fetch and an
accepted scoped receipt. It also exercises the real Hysteria2 config renderer
with isolated command callbacks: the candidate configuration contains only the
remaining pack. The command callbacks do not run a real service, so no physical
node, protocol listener, or live collector has yet proved traffic is blocked.

An opt-in Portal Commerce GET handoff now binds the request to the validated
session account and exact order reference. It returns the internal resolver's
order-owned URL and scoped usage only when that resolver is explicitly supplied
to the route state. All handoff responses, including errors, carry no-store;
cross-account and incomplete delivery both return the same not-found shape.
Pending usage stays unknown rather than becoming zero. Route tests cover these
boundaries. This is a source-level HTTP adapter, not a production activation:
the mobile order-detail UI has not yet consumed it.

Runtime-state composition now has an explicit, default-absent protected-escrow
input for that order resolver. When Coins Commerce is enabled and the caller
supplies the escrow, the state binds the existing Commerce Store, control
store and subscription core to the owner-scoped resolver; disabled Commerce
does not inspect that input. This is not a production configuration switch:
the production startup has not supplied an escrow, the published catalog still
excludes data packs, and pack fulfillment is not selected by its factory.

The existing generic subscription-core rotation is not used for packs: it
would invalidate the original artifact before the order-owned protected
handoff could follow it. A source-only pack rotation service now uses a
durable control intent keyed by one caller operation reference, captures a
replacement URL in the existing encrypted escrow, switches the exact active
issued-link reference, and revokes the old artifact before reporting complete.
It leaves the edge protocol principal, entitlement and measured lifetime
usage unchanged. Each attempt uses an order/operation/attempt-derived artifact
ID, so an absent escrow record after a crash before capture causes only that
provably owned unbound candidate to be revoked; an unrelated active artifact
blocks rotation instead. A crash after capture, after the
link switch, or before the final completion can resume from the same intent.
Real subscription-Core tests prove old-link rejection and new-link access;
fault-injection tests prove same-operation replay and no second quota.
At that initial slice there was no concurrent-worker exclusion or bounded
recovery entrypoint. Between link switch and old-artifact revocation, an
interrupted attempt can temporarily leave both artifact URLs active until
reconciliation. An isolated host with a real edge process and collector is
still needed for physical traffic-supply stop proof.

A later source-only slice adds a five-minute SQLite rotation lease with an
operation-specific owner. An active lease rejects another worker; an expired
lease may be taken over against the same durable intent, and stale owners
cannot advance a control stage or release the replacement lease. A bounded
`reconcilePending({ limit })` call selects at most 20 eligible intents and
returns aggregate completion counts. A default-absent coordinator now runs a
bounded pass at service startup and every 60 seconds only when the protected
escrow has been explicitly supplied to runtime state. Startup query failure
stops startup; later query failure leaves durable intents for the next pass.
The coordinator stops before the Commerce store closes. Source tests cover
startup/stop ordering, failed-start cleanup, retry after a periodic failure,
and real control-store composition with no pending intents. This does not
prove cross-database purchase recovery, a physical edge apply, or production
activation. An opt-in, session-owned POST order route
now invokes pack rotation only after the protected order-delivery resolver
accepts the same account and order; the response contains no subscription URL
and carries no-store/no-referrer headers. The URL remains available through
the authenticated order handoff. Neither the recovery call nor the route is
wired into the production startup, because the protected escrow is absent
there. A blocking runtime side effect that outlives the lease, production-like
schema/rollback rehearsal, and real edge/collector
convergence remain open gates; this source slice is **not publication or
production-rotation approval**.

The desktop Portal order detail now has an on-demand client for the
authenticated order handoff, scoped usage refresh, copy, and explicit
same-operation subscription-artifact rotation. The URL is not present in
order lists or retained after closing the detail. Browser tests and a
desktop build validate this source path; the separate mobile UI still needs
its own integration. A default-absent runtime-state factory now composes
the pack handler only after the Commerce store and protected escrow are
available, dispatching packs separately from timed plans. The production
entry explicitly does not accept this factory, does not supply an escrow,
and continues to publish timed plans only. Thus the source composition is
not a live purchase path or release approval.

The offer schema also requires a CNY `referencePrice`. Candidate records use
the existing one-Coin-to-one-CNY display convention solely to satisfy that
compatibility field; the requested purchase price is in Coins, and this does
not authorize an external payment amount or a new recharge rate. Reconfirm
that display metadata before publication.
An isolated persistence test additionally confirmed that
`platform_portal_access_requests.plan` currently admits only `trial`,
`monthly`, and `yearly`; inserting a data-pack request fails its SQLite
constraint. Packs use separate order-owned control tables rather than a
legacy access-request plan. A disposable SQLite upgrade/restore rehearsal now
checks a pre-pack snapshot with an existing account and monthly access row,
reopens it with the additive pack tables, preserves foreign keys and the old
plan constraint, and restores the pre-upgrade snapshot. This proves only the
local source schema/backup path; it is not a production migration, live backup,
or rollback authorization.

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

### Isolated-host candidate and execution boundary (2026-09-28)

The operator prefers the existing Aliyun **nonproduction validation host**
for Linux acceptance. A 2026-09-23 receipt records synthetic Linux tests on
that host, but does not prove its current role, availability, free capacity,
privilege boundary, or suitability for a live protocol process. The local WSL
Ubuntu 24.04 instance remains a fallback candidate, not an accepted staging
or production lane. The existing convergence test stubs service restart,
config test, and listener checks; its green result is source evidence, not
physical traffic-supply-stop evidence. The data-pack fulfillment constructor
and rotation route are also not wired into production startup, so installing
a protocol binary alone cannot establish purchase-to-delivery E2E.

Before Aliyun access, complete the no-credential local/network precheck and
bind a fresh, exact Risk A **read-only inventory** to the intended instance
and an allowlist of metadata-only commands. Confirm that it is still the
nonproduction validation host, has no production material or conflicting
runtime, and can accommodate a private, bounded protocol test without
changing existing services. A historical host name or receipt is not access
authority. If its identity or isolation cannot be verified, stop rather than
falling back to a historical production/candidate node.
The 2026-09-23 preflight reported production-shaped paths present and
`ready: false`; a later test-only script treated them as retained synthetic
state. That historical exception is not accepted for a live protocol test.
Fresh inventory must classify those paths and prove the new test cannot
attach to or modify them before an execution gate is proposed.

Only after that inventory, a separate execution gate may bind the exact PR
head, verified Node and Hysteria2 binary digests, workspace, port/namespace
scope, commands, output boundary, stop conditions, and rollback. No apt,
systemd unit, provider, firewall, DNS, public listener, production environment
file, customer record, existing control database, or real subscription may be
used. Tests use synthetic accounts, credentials, orders, certificates, and
SQLite files. Protocol traffic and stats endpoints remain private to the
isolated namespace or loopback; port ownership is checked immediately before
use. The prior manual-CI setup and its retained workspace are not reused as
this run's writable workspace.

Dry-run order: verify the source commit and clean checkout; validate public
binary digests and exact paths; inspect host role, capacity, process/service
state and port ownership without reading configuration or customer data;
prepare a new named run workspace; validate synthetic configuration; then
start only the isolated runtime and collector. Stop if identity mapping,
protected reference, process ownership, listener scope, or rollback target is
ambiguous. Rollback stops only processes started by this run and confirms
their listeners are gone; the long-lived host's run workspace and redacted
receipt are retained for a separately approved cleanup decision. A failed or
partial run is not retried under a consumed gate.

The operator-approved single-use Aliyun read-only admission check ran on
2026-09-29 05:51 UTC against the pinned nonproduction validation-host identity.
The local script SHA-256 was
`268be6364f93e138bf93fb7894574bf987120165a203d2a110365f2e9a387f19`;
it was delivered over stdin through strict pinned-host-key SSH, with no
remote file upload. The x86_64 host identity matched, the existing candidate
service was active and unchanged, free space and inodes were sufficient, and
the two proposed loopback test ports were unoccupied at the observation time.
The historical candidate pointer still matched. The read also found a
root-owned legacy state directory whose purpose cannot be established from
metadata alone. The check returned `readyForLiveProtocol: false` with
`production_shaped_paths_need_classification` and stopped. No configuration,
database, or log content was opened; no file was explicitly written, service
changed, or protocol/collector process started. The prior test-only exception
for retained synthetic paths is not silently carried into physical testing.
Any provenance/reference inspection or physical execution needs a new,
separately bounded decision.

The approved follow-up used two new single-use scripts on 2026-09-29 UTC.
The directory/process-reference script SHA-256 was
`c7a379ef52a84a415ebd6b942abe658365b396e7fe5225bacbf66ebcda0ec31d`.
It saw two direct directories and one direct file, all root-owned and last
modified around 2026-09-02. The three named units did not declare a reference
to the state root, but the process-FD scan lacked permission for 113 of 115
processes. Thus zero observed references is **not** a complete negative proof,
and neither entry metadata nor historical comments establish the directory's
origin. No file body, config, database, or log was read.

The separate empty-namespace dry-run script SHA-256 was
`03eb4a6c44db5cab6f5152f00291f84c1e727a5b53f18e7a16b3c7278696984c`.
It attempted an unprivileged user/mount/network namespace with a private
mount-propagation check and temporary state-root mask, but the child exited
with code 1 before returning structured proof. Error output was present but
not retained, so its exact cause is unknown; do not label it a permission
failure. The existing candidate service, host mount table, and state-root
metadata were unchanged on readback. No protocol or collector was started.
Both attempts are consumed, not retryable. Aliyun physical validation remains
`NO-GO` until a new, separately bounded isolation approach is established.

The physical acceptance record must distinguish actual edge apply and
collector observations from injected samples. It must show independent pack
usage, exhaustion blocking only that pack, another pack and timed plan still
working, rotation without quota reset, and recovery after process failure.
Separately, the source must wire authenticated purchase/receipt/fulfillment,
no-store order handoff, and bounded recovery before the complete
purchase-to-delivery scenario can be claimed. Until then, #753 stays Draft
and the three offers stay unpublished.

- Isolated tests: three price/size snapshots, idempotent payment and partial
  fulfillment recovery, two simultaneous packs plus a timed plan, no monthly
  quota reset, exhausted-pack-only suspension, credential refresh/rotation
  without quota reset, account isolation, and order-detail recovery after
  remount or browser refresh.
- Schema gate: repeat the additive upgrade/restore with the exact release
  artifact and a production-like snapshot; inventory existing access requests,
  indexes, foreign keys, and constraints before any live migration. The current
  timed-plan rows must not be rewritten as packs.
- Runtime-like validation: issue and render each pack on an isolated host,
  import the rendered subscription, meter traffic to exhaustion, verify the
  other resources remain available, and rehearse recovery and rollback.
- Production: fresh read-only catalog/schema/runtime inventory; exact
  artifact, migration/back-up and rollback plan; operator approval; staged
  verification; then publication and receipt. Source tests and a Vercel
  preview are not production authorization.

No production product, schema, service, wallet, or customer data is changed by
this source-only record.
