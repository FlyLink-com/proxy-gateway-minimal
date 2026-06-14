# Single Control Plane / Multi Data-Plane Plan

Last updated: 2026-06-14, Asia/Shanghai.

> Status:
> - Type: Active architecture and implementation plan
> - Risk: C for this document, B for repository tests and adapter wiring,
>   A for production deploy, DNS, Nginx, systemd, firewall, runtime config,
>   schema migration, credential lifecycle activation, or traffic rollout
> - Execution authority: This document does not authorize production mutation,
>   node deployment, DNS, Nginx, firewall, service restart, account/password
>   generation, live order creation, subscription URL/token/password output,
>   SQLite row dump, or payment behavior
> - Source of truth for: How one subscription control plane owns users, orders,
>   lifecycle, subscription rendering, and usage accounting while multiple edge
>   nodes provide data-plane capacity

## Decision

Use one authoritative subscription control plane and any number of edge
data-plane nodes.

```text
control plane:
  accounts
  portal sessions
  orders
  subscription artifacts
  credential lifecycle ledger
  usage ledger
  admin/operator API

data-plane node:
  protocol runtime
  protected local runtime config
  per-order credential material
  loopback-only runtime health/usage source
  explicit add/rotate/disable/reconcile actions
```

The user portal and admin panel should not be duplicated per node. A new edge
node does not get its own customer account database, order database, or public
admin surface. It receives only the runtime material needed to carry traffic
for credentials authorized by the control plane.

## Why

The current failures came from mixing three responsibilities:

- account/order state;
- subscription output strategy;
- node runtime configuration.

When those responsibilities are split across independent node-local stores, a
user can create an order in one place while the subscription renderer,
credential reconciler, or usage monitor reads another place. That produces
symptoms such as orders that exist in the portal but are missing from runtime
reconcile, rendered channels without matching runtime credentials, or usage
rows that cannot be traced back to the user and order.

The fix is not a shared hot cache or a separate microservice. The minimal
production model is:

```text
one durable control store
  -> issue per-order credentials for selected logical channels
  -> reconcile those credentials onto one or more data-plane nodes
  -> render the user's subscription from the same ledger
  -> collect usage back into the same ledger by edgeCredentialRef
```

## Authority Boundaries

| Area | Authority | Notes |
| --- | --- | --- |
| Accounts and passwords | Control plane | Data-plane nodes must not create or verify portal users. |
| User sessions and TOTP/passkey state | Control plane | Data-plane nodes only carry proxy traffic. |
| Orders and package limits | Control plane | Order IDs are the durable business object. |
| Subscription artifacts | Control plane | Renderer decides which channels appear in client YAML. |
| Per-order protocol credentials | Control plane ledger plus data-plane reconcile | Raw credential values stay in protected runtime material and are not logged. |
| Runtime listeners | Data-plane node | Open/listen/config-test/restart remain A-tier runtime gates. |
| Traffic usage samples | Data-plane source, control-plane ledger | Runtime stats are mapped to `edgeCredentialRef`, then to order and account. |
| Customer-visible node switching | Subscription template | Users switch through client proxy groups, not through a separate node UI. |

## Subscription Template Strategy

User-facing switching belongs in the rendered subscription output.

The renderer should emit logical channel records and groups such as:

```text
AUTO:
  stable and currently approved channels

WEAK-NETWORK:
  weak-network candidates such as approved Hy2/TUIC channels

FALLBACK:
  ordered recovery path

GLOBAL:
  selectable policy surface for the client
```

The portal should show orders, status, expiry, usage, and support actions. It
should not ask normal users to choose backend production nodes. Channel choice
is a policy decision rendered into the subscription file from control-plane
state.

Regional production channels must be separated from automatic preference.
Singapore channels are customer-facing production capacity when an order or
bundle is entitled to them; they should remain available as selectable client
channels after receipt-gated runtime apply succeeds. Network quality facts may
drive monitoring, warnings, and ordering, but they should not automatically
convert an entitled Singapore channel into canary, maintenance, or a Japan
relay path.

The default client policy may keep Japan channels first for general bundles
while leaving Singapore channels selectable. For Singapore-specific bundles,
the renderer may place Singapore channels in the region group or a higher
priority position, but the current baseline is not to add extra Japan-to-
Singapore relay behavior unless a separate product and Risk A runtime gate
approves it.

## Credential Fan-Out

For each approved order, the control plane should create one durable order and
one or more credential bindings:

```text
orderRef
  -> channel-vultr-a-vless-reality-tcp / edgeCredentialRef
  -> channel-vultr-a-hy2 / edgeCredentialRef
  -> channel-vultr-a-tuic / edgeCredentialRef
  -> channel-sgp-a-vless-reality-tcp / edgeCredentialRef
  -> channel-sgp-a-hy2 / edgeCredentialRef
  -> channel-sgp-a-tuic / edgeCredentialRef
```

Rules:

- `orderRef` is the business object shown in the portal/admin panel.
- `edgeCredentialRef` is the runtime accounting anchor.
- `channelRef` is the logical channel emitted in subscription output.
- `physicalNodeRef` groups channels on the same host.
- reconcile must fail closed when a channel is not eligible, lacks runtime
  readiness, or belongs to a canary/private pool without explicit assignment.
- refresh/rotate/disable must operate through the same bindings, not through a
  separate map or ad hoc node-local account list.

### Remote Data-Plane Handoff

When the control plane runs on a different host than the target data-plane
runtime, the channel must not use a host-local explicit-restart adapter. It
must use a remote data-plane handoff adapter that writes a protected, redacted
handoff artifact and returns a non-mutating `pending` receipt.

```text
control plane order lifecycle
  -> build desired credential state
  -> write redacted handoff for channel-sgp-a-vless-reality-tcp / channel-sgp-a-hy2 / channel-sgp-a-tuic
  -> record pending receipt
  -> later A-tier data-plane gate applies it on Singapore
```

The handoff artifact may include safe refs such as `channelRef`,
`physicalNodeRef`, `desiredStateRef`, `edgeCredentialRef`, action type, expiry,
and material fingerprint. It must not include raw passwords, UUIDs, private
keys, subscription URLs, runtime config, logs, environment values, customer
data, or SQLite rows.

A `pending` handoff receipt is a successful control-plane lifecycle step, not a
runtime listener proof. It keeps order creation from failing while preserving
the separate A-tier gate for applying the handoff on the remote node.

### Desired-State Notification And Receipt Gate

Repository source now includes the safe control-plane side of the future-order
flow:

```text
new portal order
  -> durable order and per-channel edge credentials
  -> latest desired-state calculated from the control store
  -> pending notification recorded for remote-data-plane channels
  -> data-plane agent pulls/apply through protected server-to-server path
  -> data-plane posts a redacted applied receipt
  -> renderer may include the remote channel only after the matching receipt
```

The notification record is an outbox-style coordination fact. It may store
`nodeRef`, `channelRef`, `desiredStateRef`, `generation`, `reason`, `status`,
and timestamps. It must not store raw passwords, UUIDs, private keys,
subscription URLs, runtime config, logs, environment values, customer data, or
SQLite rows.

The render guard remains fail-closed: `remote-data-plane-handoff` channels are
withheld from subscription output until the current desired-state has a matching
`applied` receipt with config-test, service-active, and listener evidence. A
repo-level passing test is not production activation; production deployment,
schema migration, edge-agent apply, service restart, and live-order smoke remain
separate Risk A gates.

## Usage Accounting

Usage monitoring must present two different scopes without mixing them:

```text
platform/channel usage:
  capacity, health, total channel usage, node operations

order/account usage:
  user-facing quota, abuse detection, per-order traffic ledger
```

The collection path should be:

```text
runtime stats source
  -> edgeCredentialRef
  -> channelRef
  -> orderRef
  -> accountRef
  -> usage samples and rollups
```

Dashboard requirements:

- platform dashboard can aggregate by node, channel, protocol, and pool;
- order table must show account/order/package/channel usage ownership;
- user portal must show only that user's order usage and status;
- unknown or aggregate-only samples must be marked as unmapped and must not be
  presented as per-order usage.

## Storage Model

Use the control plane's durable store as the business source of truth.

This plan intentionally does not require Redis, queues, cluster state, or
microservices. For the current scale, SQLite plus backups and explicit
reconcile gates is acceptable if writes remain serialized and schema migrations
are controlled.

Data-plane nodes may keep protected local runtime material and local runtime
state, but they must not own customer/order truth.

## Data-Plane Node Requirements

A production data-plane node is considered complete only when it has:

- a registered safe `physicalNodeRef`;
- one or more logical `channelRef` records;
- lifecycle and pool metadata;
- protocol runtime binaries installed through a reviewed gate;
- protected config paths and backup paths;
- config-test behavior;
- explicit restart/reconcile gate;
- loopback-only health/usage source when supported;
- provider firewall and host firewall posture validated;
- no public Admin exposure;
- no node-local customer database authority.

## Implementation Tasks

### Task 1: Repository Contract

- Add tests that order creation, credential fan-out, subscription rendering,
  and usage attribution use the same durable refs.
- Add tests that old Map/local-preview paths cannot be used by HTTP production
  client flows.
- Add tests that data-plane-only channels cannot create users or orders.
- Add tests that user subscription groups include only eligible channels.

### Task 2: Admin Usage Monitor

- Ensure the admin usage monitor returns JSON for all authorized rows.
- Include account/order/package/channel/node ownership in usage rows.
- Separate platform/channel aggregate cards from per-order usage rows.
- Mark unmapped runtime samples explicitly.

### Task 3: Data-Plane Reconcile Contract

- Treat add/rotate/disable/reconcile as lifecycle commands sourced from the
  control ledger.
- Keep raw runtime material out of docs, logs, chat, and public API output.
- Require adapter-specific config-test before service restart.
- Keep `3456` and runtime controllers loopback-only.

### Task 4: Production Gates

Each production node change needs a separate A-tier approval:

1. Read-only inventory.
2. Backup protected env, DBs, config, and service metadata.
3. Deploy exact artifact or exact config patch.
4. Run config-test.
5. Restart only approved services.
6. Validate public boundaries, health, no-session rejection, runtime listeners,
   and redacted reconcile/usage facts.
7. Roll back on failed validation.

## Validation

Repository validation:

```powershell
git diff --check
npm test
```

If Admin/User Portal UI changes:

```powershell
npm run admin:test
npm run admin:build
```

Production validation must be named in the exact approval packet and must not
create live orders during deployment validation unless that is separately
approved.

## Non-Goals

This plan does not:

- expose public Admin;
- create a per-node user panel;
- put customer/order authority on data-plane nodes;
- require Redis, a queue, or a microservice split;
- output secrets, tokens, passwords, raw subscription URLs, raw configs, raw
  logs, or SQLite rows;
- authorize DNS, firewall, Nginx, systemd, runtime, payment, or credential
  changes.
