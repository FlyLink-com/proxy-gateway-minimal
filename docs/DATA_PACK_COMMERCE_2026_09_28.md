# Independent data-pack commerce — implementation boundary

```yaml
document_metadata:
  doc_type: operational
  lifecycle: active
  authority_scope: data_pack_commerce_implementation_boundary
  superseded_by: null
  last_verified_at: 2026-09-30
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
entry ignores caller-supplied pack factories and escrow objects. A new
default-off source path composes the protected pack handler only when
`COINS_COMMERCE_DATA_PACK_RUNTIME_ENABLED` is explicitly set and a distinct
absolute escrow path, valid protected key, configured pack node, edge
lifecycle and Agent route are present. Missing or colliding prerequisites
fail before the listener opens. The catalog still publishes timed plans only;
this source composition is not a live pack purchase path or release approval.

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

A separate synthetic two-database recovery test captures a 100 GB pack order
with paid Coins in Commerce SQLite, creates its pack effect in a distinct
control SQLite, and simulates loss of the Commerce completion write. After
closing and reopening both databases at lease expiry, the same command and
effect complete with one resource creation, unchanged debit-ledger count, and
one delivery receipt. This is source-level crash-boundary evidence, not a
physical edge-process or production recovery rehearsal. The matching mobile
Orders handoff is proposed separately in `gccltd/gccwebos-mobile#13`; that
Draft PR is not a deployed customer entry.

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
physical traffic-supply-stop evidence. The default-off source startup
composition does not publish pack offers or prove that a real edge and
collector can deliver purchase-to-delivery E2E. Installing a protocol binary
alone cannot establish that outcome.

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

### Local WSL physical-acceptance candidate (not executed)

On 2026-09-29 the operator selected the local WSL alternative instead of
continuing to use the Aliyun host. This selects an environment; it is not an
execution approval. Read-only admission found Ubuntu 24.04 on x86_64, an
unprivileged account, and available `unshare`, `ip`, `curl`, `sha256sum`, and
`openssl` commands. A disposable user/mount/network namespace dry-run
successfully brought up its private `lo` interface and showed only
`127.0.0.1/8` and `::1/128`. No Hysteria or collector was started, and no
public binary was downloaded. The old Aliyun state is neither mounted nor
reused as validation data.

The proposed single-use execution package must bind the then-current exact
source commit, a new `/tmp/gccgw-data-pack-wsl.*` workspace, and verified
public Linux x64 artifacts before physical execution. Candidate artifacts are
Node 22.23.1 (`node-v22.23.1-linux-x64.tar.xz`, SHA-256
`9749e988f437343b7fa832c69ded82a312e41a03116d766797ac14f6f9eee578`)
and Hysteria2 2.9.3 (`hysteria-linux-amd64`, SHA-256
`66dbdb0608f25f3057b433afe975a9fc1af2ca8e512479e294988b3ef363d6c1`).
Reverify these values against the vendors' official release manifests in the
execution package. Fetch and verify outside the private network namespace;
inside it, bind the test UDP server, Traffic Stats HTTP listener, three local
client inbounds, and synthetic echo target to private loopback only. The
package must reject any occupied test port before spawning a process. No apt,
systemd, host service, provider API, firewall, DNS, production configuration,
real credential, customer record, or existing SQLite file is in scope.

`scripts/data-pack-wsl-artifact-prep.sh` is a preparation-only first slice of
this package. It requires the exact #753 worktree and commit, exports that
commit (not uncommitted work) to a private `/tmp` directory, verifies both
public binaries against their vendor release digests, and records aggregate
hashes. `--self-check` performs no download. Neither mode starts a protocol
process or constitutes the physical acceptance run. A separate bounded driver,
cleanup readback, and exact one-time execution approval remain required.
An `ed231be6` preparation attempt stopped before binary download when the
unauthenticated GitHub release API returned HTTP 403; it started no protocol
process. A subsequent source change uses the official release `hashes.txt`
instead: the manifest's own pinned digest is independently published on the
[GitHub release asset list](https://github.com/HyNetworks/hysteria/releases/expanded_assets/app%2Fv2.9.3),
and its single `build/hysteria-linux-amd64` entry must equal the separately
pinned artifact digest. The failed attempt is consumed, not a retry or a
physical acceptance receipt.

Physical acceptance is a sequence of observable boundaries, not one green
process exit: (1) independently authenticate two synthetic pack credentials
and one timed-plan credential through the real Hysteria process; (2) generate
bounded loopback traffic for each and use the repository's Hysteria collector
with `clear=1` to record per-credential deltas into a new synthetic control
database, with no cross-resource attribution; (3) exhaust one pack and apply
the new desired state through the actual edge adapter; (4) after server
restart, require a new connection using the exhausted pack's old credential
to fail while the other pack and timed plan still pass; (5) rotate a separate
pack credential, require the old credential to fail and the replacement to
pass, while its used bytes remain unchanged; (6) interrupt a run-owned process
and verify bounded recovery and no duplicate usage or entitlement. Merely
removing a credential from a generated config or kicking an online session
does not prove traffic-supply stop.

There is a source/acceptance mismatch at step (5): the currently implemented
`coin-commerce-data-pack-artifact-rotation.mjs` rotates the subscription
artifact and delivery URL but intentionally preserves the edge principal and
usage. Therefore it cannot make an already imported Hysteria edge credential
fail. The physical driver must not claim this property as passing until the
edge-credential invalidation path is implemented and validated.

The operator subsequently confirmed that reset must also invalidate the old
imported edge connection and issue new edge material. Source implementation at
`1e2c1dea5463acebef7b636a309452e5336908cc` has a durable, lease-fenced
reset intent: it stages new password/UUID material in the protected file,
switches the control digest on the same metering principal, commits that same
material, requires an exact desired-state apply receipt, and only then runs
the existing subscription artifact/link rotation. Its recovery path replays
the same candidate without resetting the pack's measured usage. A synthetic
adapter test excludes the old password from the replacement Hysteria config;
an isolated source integration test covers the real artifact rotation service
and order re-fetch. These tests do not prove that a physical protocol process
applied the config, that an already imported old connection is rejected, or
that the collector converged. Those remain open Risk A gates; the existing
preparation receipt is bound to an earlier source commit and must not be used
as a physical execution authorization for this new slice.

The reset coordinator's notification result alone is not an apply receipt:
the control-store transition to `edge_applied` independently requires an
applied notification and receipt for the current desired state, generation,
and new material digest. A focused pending-notification regression test keeps
the artifact link unchanged until that gate passes. This is source evidence,
not a physical edge-process acceptance result.

The package must emit aggregate-only receipts: pinned source/artifact hashes,
namespace and port checks, credential count, per-resource pass/fail and byte
counts, restart and listener readback, recovery result, and cleanup readback.
It must never print client passwords, subscription URLs, raw config, full
Traffic Stats payloads, or synthetic SQLite rows. A failed prerequisite stops
the run; no automatic retry. Finalization terminates only PIDs spawned by
this package and verifies every test listener is gone. The disposable run
directory may be removed only after its redacted receipt is retained and its
absolute path is confirmed to be under the named `/tmp` prefix. Source and
mobile browser fixture checks remain separate evidence: neither substitutes
for this physical acceptance or production migration/rollback gates.

The physical acceptance record must distinguish actual edge apply and
collector observations from injected samples. It must show independent pack
usage, exhaustion blocking only that pack, another pack and timed plan still
working, rotation without quota reset, and recovery after process failure.
Separately, the source must wire authenticated purchase/receipt/fulfillment,
no-store order handoff, and bounded recovery before the complete
purchase-to-delivery scenario can be claimed. Until then, #753 stays Draft
and the three offers stay unpublished.

The next source slice provides the complete driver/scenario/transport package
in [DATA_PACK_WSL_ACCEPTANCE.md](DATA_PACK_WSL_ACCEPTANCE.md). It verifies real
adapter/collector/control/reset composition using injected transport fixtures
in source tests; a native transport can run only under the exact one-use WSL
gate and same-source Linux dependency artifact. No physical execution receipt
exists yet. Its scope remains Hysteria enforcement and metering of synthetic
resources, not authenticated purchase-to-delivery E2E or production readiness.

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

### 2026-09-30 authenticated HTTP and upgrade acceptance; collector blocker

This continuation keeps production and all three offers unchanged. New tests
use only disposable synthetic SQLite files and a loopback HTTP listener; no
production credentials, database, SSH connection, or protocol process is used.

- The HTTP acceptance fixture composes the real application, persisted Portal
  session checker, Commerce coordinator/stores, production pack fulfillment
  binding, subscription Core, protected escrow/material stores and owner-only
  handoff resolver. All three price/size offers are exercised. Repeated purchase
  requests and application/database restart do not add a second debit, tenant,
  artifact or delivery. A deliberate second purchase creates a distinct pack.
  Missing edge application keeps handoff unavailable; recovery after restart
  completes it once. Owner isolation, missing authentication, no-store and
  no-referrer responses, and pending/null usage are asserted. The edge apply
  receipt is explicitly simulated. Sessions are created through the real auth
  service, not a password/MFA login UI; this is not physical/mobile acceptance.
- The upgrade fixture preserves existing timed entitlement/access/link, usage
  samples/rollups, Coins ledger and all non-pack schema/data through additive
  initialization and reopening. It exercises captured pack fulfillment and
  post-write replay. Restoring a pre-write snapshot into a separate throwaway
  file demonstrably loses the later Coins/order/usage facts: such a snapshot
  must not overwrite a database after new business writes. This is a test of
  the rollback boundary, not an implemented production restore guard or proof
  that an old application binary supports the new schema.
- The initial acceptance **reproduced a release-blocking collector incompatibility**:
  `readFullMeteringBindings` accepts one valid timed binding, then rejects the
  same synthetic inventory with `baseline_binding_invalid` after a valid
  independently issued pack is added. The pack's normal control resolver can
  resolve its credential. The full-metering reader instead treats its issued
  request as a legacy Portal fallback; `v3Evidence` requires a Portal access
  row that independent packs intentionally do not have. That first test was
  explicitly a known-failure characterization; its passing status did not
  establish successful pack metering or permission to publish products.

The follow-up below corrects the real full-metering identity path. The separately
prepared Hysteria physical scenario does not exercise this full-metering
entrypoint and cannot substitute for its tests. Final publication also requires
preserving the separately restored production reader fixes and new accounting
state; no recovery release is replaced in this continuation.

Validation for that initial slice: the new HTTP and upgrade acceptance
files together with the existing control DB, cross-DB recovery and full-metering
binding-inspector tests passed **62 / 62, 0 failed, 0 skipped**. One of these is
the explicitly named known-failure characterization above. The same-head Linux
CI for `bdb5e4d811ac8a85e256ac7743ccc7150bc7d1b5` is reused for unchanged business
source; this is not a new full-suite or physical acceptance run. Independent
Security Review found no confirmed security issue in the three new test/fixture
files. That review did not cover this status paragraph, the entire historical
PR, concurrency/physical protocol behavior, or production upgrade/rollback.
Those were pre-fix observations, not final validation of the correction below.

### 2026-09-30 full-metering pack-binding correction

Risk: A release envelope / B source core. `identity_impact: true`;
`production_state: not_deployed`. The operator authorized this correction within
#753 and the separate source merge of #754. It does not authorize #753 merge,
product publication, checkpoint continuation, or production changes.

The upgrade regression now requires the actual five-source binding reader to
return both the existing timed resource and the independent issued pack with
their exact owner/request/entitlement, without writes. Before this correction,
the three upgrade tests produced 2 pass / 1 fail (`baseline_binding_invalid`).

The correction uses a dedicated read-only control-side pack proof. It checks
order-derived issuance lineage, immutable fulfillment evidence, exact quota and
technical period, the current issued link and credential, and cross-domain
credential uniqueness. It neither opens a Commerce database nor fabricates a
Portal access row. Runtime material is still independently checked by the
existing source driver. Legacy baseline and timed-resource checks remain strict.

Exhausted packs must remain attributable as retained bindings rather than active
runtime requirements. A source with no active bindings is accepted only when a
fully verified retained pack proves the source membership; genuinely unbound
sources retain the existing refusal. A never-issued reservation may be omitted
only with exact control lineage and proof that no runtime/delivery/usage facts
exist. Partially issued or inconsistent objects must not be silently skipped.

New pack membership follows the existing pending-start transition: first
observations establish a no-debit baseline, and only subsequent measured deltas
are charged. Material rotation is different: ordinary collection still refuses
changed material, and the separately approved continuation mechanism remains
required. This correction does not implement automatic post-reset continuation
or establish physical traffic stop.

Validation of this source slice:

- The combined binding/pipeline/upgrade/HTTP/inspector/writer/driver/lifecycle/
  continuation/convergence suite passed 133 tests, 0 failed, 0 skipped. The
  implementer's overlapping legacy-baseline regression set passed 186 / 186;
  these counts are not additive. The pipeline's three cases also fail against
  the exact old reader through read-only in-memory loading; this is a historical
  RED comparison, not a claim that those tests first ran before implementation.
- Source environment preflight was ready. Document authority and strict-file
  checks passed (412 metadata blocks), as did whitespace checks.
- Full Windows `npm test` ran: 5,439 tests, 5,371 pass, 9 fail, 59 skip. Failures
  are outside this slice in workflow/source-fixture, project-contract CRLF and
  POSIX-path assertions. This is not a green full-suite result; the final pushed
  head needs its own Linux CI readback, not reuse of the older head's CI.
- One independent read-only Security Review fallback found no confirmed issue
  in the nine frozen changed files and necessary caller relationships. It ran
  50 new acceptance tests and 140 overlapping legacy/continuation tests, all
  passing. Dedicated Security Review tooling was unavailable; this was not a
  vendor-product invocation. File hashes were unchanged throughout review.

#754 was separately merged as `2a166a7d7f5bcf8ba0b7e1dc7ef2a9a804533adf`.
The pack correction is `5312cad2`; the normal integration merge is
`30a14576c270bf874ba7a5e3bc112a02e51d4845`. No source paths conflicted.
The combined Xray CLI/local-reader/source-driver/pack/HTTP/upgrade/runtime-state
regressions passed 337 tests, 0 failed, 0 skipped. Source preflight, both document
authority checks (now 413 metadata blocks) and `git diff --check origin/master...HEAD`
passed on this integrated source. The full Windows result above is from before
this integration; it is not relabeled as a final-head full-suite pass. New Linux
CI must bind the eventual pushed head. #754's independent production recovery
state was not replaced or rerun, and this integration authorizes no deployment.
No physical protocol process or production operation is run by these synthetic
tests. The older source-bound WSL fixture is not current acceptance evidence.

No production product, schema, service, wallet, or customer data is changed by
this source-only record.

### 2026-09-30 product reset-to-collector bridge (source only)

Risk: A release envelope / B source core. Existing #753 is reused;
`identity_impact: true`, `production_state: not_deployed`. This supersedes the
earlier source gap for automatic product-reset continuation, not the missing
physical, mobile or production acceptance receipts.

The synchronous backend reset and asynchronous five-source collector are
separate processes. The existing `edge_applied` reset status is the durable
request; no new schema or in-process async callback is introduced. Reset waits
there, without rotating its final subscription artifact, until an exact private
metering receipt is present. Both the service and direct DB completion gate
enforce this condition. The existing pending worker subsequently completes the
same operation; HTTP continues to report reconciliation while it is pending.

The external collector has an explicit opt-in mode:

```text
--collect-pack-resets --config <existing-private-config-path> --config-sha256 <sha256>
```

The CLI instantiates its owned control store and trusted source driver. It does
not accept a reset proof or approval payload from the caller. The config shape,
activation and journal context are unchanged. Ordinary `--collect` and the
operator-bound `--continue-material` remain strict and unchanged in authority.
Enabling this mode in a production timer is a later approved deployment action;
source implementation alone does not change any installed timer.

Each admission rechecks a completed edge apply, exact account/order/request/
entitlement/channel/credential lineage, current protected material and runtime
provenance, pack quota and billing period. At most 32 exact pending resets are
handled together; an overflow is refused, not truncated. An authorized pack
reset never authorizes another timed or pack identity change. First observations
after an active reset establish a zero-debit material boundary, preserving
previous accounting; unrelated identities continue to record measured deltas.
A previously unobserved pack receives its normal zero-debit first baseline.
An exhausted pack remains retained, with no fabricated eligible identity or
new allowance, while its private archived identity evidence follows the reset.

Before committing, the journal lock protects a fresh inventory/proof check and
an immutable private checkpoint preimage. The existing write-ahead intent
persists exact reset proofs and continuation records with the next checkpoint.
Only after journal commit does the collector write the deterministic control
audit receipt. Matching replay is idempotent; mismatched metadata is rejected.
If journal commit succeeds but audit writing fails, a retry validates the
protected preimage, context, sequence, persisted current identity and proof,
then repairs only the receipt without a second observation or baseline.
Pending-intent recovery reuses exact sample IDs and preserves the existing
collision-checked writer. Missing or altered evidence stops recovery.

The private journal retains at most 128 reset continuation records, matching
the bounded material-boundary discipline. Exceeding the limit stops new reset
admission rather than deleting evidence. A separately verified archival or
activation-maintenance policy is needed before reaching that bound; none is
implicitly authorized here. Raw proofs remain private and are excluded from
account-summary audit output, including reference-name collision cases.

After a durable acknowledgment, later natural quota exhaustion may only change
the proof's `exhausted` state from false to true. Completion retains the original
boundary proof and rechecks stable lineage/material/quota; it does not demand a
second reset apply against the subsequently empty quota-stop desired state.
The reverse transition is rejected. New receipts always require the current
exact applied proof.

The older single-channel, clear-mode Hysteria scenario now requires an explicit
continuation provider and a real control receipt before finishing reset. It
cannot generate a receipt itself, and physical-process mode refuses a synthetic
provider. The source-bound physical driver currently supplies no real provider
and stops at `metering_resume_required`; it has not been executed. Its aggregate
receipt explicitly states `fullMeteringMaterialContinuation: false`. Synthetic
provider tests are compatibility tests, not physical or five-source acceptance.

Validation for this slice is recorded with the final pushed source below and in
#753. The reset pipeline currently passes 18 cases using
real control, protected material, desired state, binding reader, source driver,
journal and writer, with daemon snapshots/apply and artifact issuance explicitly
synthetic. It covers simultaneous resets, exhausted retained reset, three WAL
interruption stages, audit loss, damaged archives/identity evidence, ordinary
collection refusal, unrelated material changes, precommit drift and incremental
collection while the artifact worker is still pending. No physical protocol,
production database or customer account was used.

Validation performed for the reset bridge:

- Final focused pack/full-metering/physical-contract/WSL-guard regression:
  558 tests, 558 passed, 0 failed, 0 skipped. This includes 18 pipeline cases;
  test subsets overlap and must not be added to that total.
- The independently written pipeline initially had 5 failures before this
  bridge existed. The control receipt, physical-provider and aggregate receipt
  guard changes also have recorded failing-before-fix tests. Additional cases
  that passed on their first run are not labeled RED evidence.
- One independent read-only Security Review fallback confirmed one P2: using
  the earlier collection timestamp to validate a later journal continuation
  could fail after checkpoint commit. An advancing-clock regression failed
  against the old implementation and now passes; receipt validation takes its
  timestamp after durable commit. The original finding is retained, not
  reported as a no-findings review. Dedicated review tooling was unavailable;
  this is not a vendor Security Review invocation or a whole-PR audit.
- Windows full-suite observation: 5,555 tests, 5,487 passed, 9 failed, 59 skipped.
  It started before the last clock/guard cases were added. The final focused
  regression above covers those changes, but this full run is not a final-head
  green result. A separate read-only targeted run reproduced all nine failures:
  seven disappeared with in-memory LF normalization of unchanged source inputs;
  the other two compare POSIX path assumptions against Windows paths. No files
  were rewritten for this diagnostic, and the runtime-closure failures concern
  CRLF-sensitive source markers rather than missing new reset modules. Exact
  new-head Linux CI remains required before source promotion.
- Document authority and strict-file checks passed (413 metadata blocks);
  whitespace checks passed. Local source-environment preflight still reports
  `required_tool_missing` for npm executable detection; this is recorded, not
  relabeled a ready environment or used to justify a production action.

Current state: source bridge implemented and synthetically verified;
production not executed, offers unpublished, #753 still Draft. A final pushed
source identity and exact-head CI status are recorded in #753. The previous
physical execution records are not reusable for these changed source files.
