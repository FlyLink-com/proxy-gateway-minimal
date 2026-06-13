# Multi-Channel Node Design

Last updated: 2026-06-08, Asia/Shanghai.

> Status:
> - Type: Active design contract
> - Risk: C for this document, B for repository policy and renderer tests,
>   A for runtime node config, protected endpoint inventory, systemd, Nginx,
>   DNS, firewall, subscription output, tenant assignment, or production
>   issuance changes
> - Execution authority: This document does not authorize production mutation,
>   node deployment, DNS, Nginx, firewall, service restart, credential change,
>   subscription issuance, live order creation, or all-user rollout
> - Source of truth for: Designing one physical edge node with multiple logical
>   subscription channels, and preventing retired node labels from re-entering
>   automatic user-portal issuance

For the broader production shape where multiple physical edge nodes share one
authoritative account/order/subscription/usage control plane, read
`docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`. This document focuses on
logical channel modeling on an edge host; it does not make a node-local portal,
node-local order database, or node-local customer authority valid.

## Purpose

The current channel strategy can render multiple protocol records, but the
operator model must separate two ideas that were previously too easy to mix:

```text
physical node:
  the actual edge host or protected runtime target

logical channel:
  one protocol/listener/config path emitted into a subscription output
```

A single physical node may expose multiple logical channels. TUIC, VLESS
Reality/TCP, Hysteria2, and other approved runtime families should be
represented as separate channel records when they have separate runtime
behavior, listener facts, credentials, or rollout status. Shadowsocks is now a
legacy compatibility family only; it must not be treated as the current default
production channel.

Repository runtime support now includes explicit-restart credential lifecycle
adapters for Mihomo TUIC, sing-box Shadowsocks, Xray VLESS Reality/TCP, and
Hysteria2. This is code support only: a production node still needs a separate
A-tier gate to prove the matching binary, protected config path, systemd unit,
listener, config-test behavior, credential material source, firewall posture,
validation, and rollback readiness before that logical channel can be marked
eligible for automatic issuance.

For a remote data-plane channel whose runtime lives on a different host from
the control plane, use `runtimeAdapter: "remote-data-plane-handoff"` instead of
an explicit-restart host adapter. The handoff adapter writes only a protected,
redacted desired-state handoff and records a `pending` receipt. Applying that
handoff to the remote node remains a separate A-tier runtime gate with its own
backup, config-test, restart, listener validation, and rollback plan.

As of the 2026-06-08 repo-only Vultr production-node completion gate,
Hysteria2 explicit-restart rendering also persists the weak-network runtime
policy that previously had to be hand-applied on hosts: loopback-only
`trafficStats`, `sniff.enable`, `sniff.rewriteDomain`, scoped TCP/UDP sniff
ports, and IPv4-only direct outbound mode. This repository support does not
mutate any host by itself; production still needs an approved deploy gate that
sets the matching protected `EDGE_HYSTERIA2_*` environment and runs config-test,
restart, listener, subscription-render, and usage-monitor validation.

This design avoids replacing a current TUIC channel with stale historical node
labels. It also avoids treating an old `online` status as proof that a retired
or deprecated node is valid for production issuance.

## Design Summary

Represent each subscription channel as one configured server record, and link
related records with a safe non-secret physical reference:

```text
physicalNodeRef = edge-current-01

channel-current-tuic:
  protocol = tuic
  transport = udp
  listen = 443
  physicalNodeRef = edge-current-01
  pool = canary or explicitly assigned current channel

channel-current-vless-reality-tcp:
  protocol = vless
  network = tcp
  transport = tcp
  listen = 8443
  physicalNodeRef = edge-current-01
  pool = stable-candidate until promoted

channel-current-hy2:
  protocol = hysteria2
  transport = udp
  listen = 10443
  physicalNodeRef = edge-current-01
  pool = weak-network or canary until promoted
  runtimePolicy = sniff + IPv4 outbound + loopback trafficStats
```

The subscription renderer still renders channels, not physical hosts. The
registry and policy layers understand that multiple channel records can belong
to the same physical node.

When one edge host carries multiple logical channels, runtime listeners must be
planned as transport-specific tuples. The Vultr template keeps web traffic on
TCP 80/443 for Nginx, VLESS Reality on TCP 8443, TUIC canary on UDP 443, and
Hysteria2 weak-network canary on UDP 10443. Do not place VLESS on TCP 443 while
Nginx owns that port, and do not place Hysteria2 on UDP 443 while TUIC owns the
canary listener.

## Required Safe Metadata

Channel records should add these safe fields. They must not contain raw hosts,
raw ports, credentials, tokens, subscription URLs, customer data, or provider
account details.

| Field | Required | Meaning |
| --- | --- | --- |
| `physicalNodeRef` | Yes for production channels | Safe non-secret grouping key for channels on the same physical edge host |
| `channelId` or `name` | Yes | Unique logical channel identifier emitted or assigned by the control plane |
| `protocol` | Yes | Runtime family such as `tuic`, `hysteria2`, or `vless`; `ss` is legacy-only |
| `transport` or `network` | Protocol-specific | Transport such as `tcp`, `h2`, `xudp`, or `quic` when relevant |
| `pool` or `channelPool` | Yes | `stable`, `private`, `canary`, or `recovery` |
| `lifecycle` | Yes | `planned`, `private-validation`, `canary`, `active`, `maintenance`, `deprecated`, or `retired` |
| `channelRole` | No | `base`, `fallback`, `canary`, or `lab` |
| `generation` | No | Safe generation label used to prevent stale label reuse |
| `retiredAt` / `deprecatedAt` | When applicable | Timestamp-only audit marker |
| `reason` | When applicable | Safe machine-readable reason code |

## Lifecycle And Eligibility Rules

The policy layer must treat lifecycle as a hard eligibility gate:

```text
planned:
  not eligible

private-validation:
  not eligible for default output

canary:
  explicit assignment only

active:
  eligible only when pool and protocol policy also allow it

maintenance:
  not eligible

deprecated:
  not eligible for automatic issuance or default output

retired:
  never eligible; retained only for audit/history
```

This rule is stronger than simple `status=online`. A channel can be reachable
and still be ineligible because its business lifecycle is no longer current.

## Stable, Canary, And Current-Channel Posture

The default posture remains conservative:

```text
default stable:
  approved TCP-based channels after validation and approval, currently
  VLESS Reality/TCP or another explicitly approved TCP runtime

current or canary:
  TUIC / QUIC-style channels, explicit assignment, or narrowly approved
  temporary current-channel issuance

comparison candidates:
  VLESS/XUDP, Hysteria2, TUIC, and future protocol variants
```

TUIC should not be deleted just because it is aggressive. It can remain useful
as the current working channel or weak-network channel. The correction is to
add stable TCP capacity on the same current physical node, not to switch back
to old node labels that no longer represent valid production capacity.

## Deprecated Node Label Guard

The automatic issuance path must not resolve a configured node by name alone.
It must reject a selected node or channel when any of these are true:

- `lifecycle` is `deprecated`, `retired`, `maintenance`, `planned`, or
  `private-validation`;
- `status` is not eligible for subscription output;
- `physicalNodeRef` is missing for a production channel;
- the selected node is outside the approved generation for the current rollout;
- the channel is `canary` or `recovery` without explicit operator assignment;
- the stable protocol policy reports blockers.

This guard prevents older labels such as previous production-edge slots from
returning to automatic portal issuance only because they still exist in a
protected runtime config.

## User Portal Auto-Issuance Behavior

For user-portal automatic issuance, the configured issuance target should be a
logical channel id, not a historical physical-node slot name.

Fail-closed behavior:

```text
if target channel cannot be resolved:
  reject order issuance with a safe node_unavailable style response

if target channel is resolved but lifecycle is blocked:
  reject order issuance

if target channel is canary without explicit approval:
  reject default issuance

if target channel is approved current-channel or stable:
  issue only through that channel
```

The system must not silently fall back from a blocked current channel to a
retired channel.

## Rollout Sequence

### Phase 0: Read-Only Inventory

- Confirm current protected runtime channel list.
- Confirm which channel currently works for operator/customer import.
- Confirm which historical labels are deprecated or retired.
- Record only safe labels and redacted policy facts.

### Phase 1: Repository Policy Fix

- Extend node normalization with safe lifecycle and physical-node metadata.
- Update policy checks to block deprecated and retired records.
- Add tests for one physical node with multiple channels.
- Add tests that automatic issuance fails closed when the configured target is
  retired, deprecated, missing, or canary without explicit assignment.

### Phase 2: Runtime Stopgap Gate

Requires separate Risk A approval.

- Mark historical stale labels as non-eligible or retired in protected runtime
  config.
- Point auto issuance only at the approved current logical channel, or disable
  auto issuance until a stable channel is approved.
- Restart only the approved service if runtime env or config requires it.
- Validate no-session portal APIs reject, health is OK, Admin remains blocked,
  and policy output reports no deprecated eligible nodes.

### Phase 3: Same-Node Stable TCP Channel

Requires separate Risk A approval.

- Add a TCP-based channel on the same current physical node.
- Keep TUIC as current/canary until the TCP channel passes validation.
- Promote the TCP channel to stable only after renderer proof, import test,
  operator-device validation, policy check, and rollback readiness.

## Validation

Repository validation for Phase 1 should include:

```powershell
git diff --check
npm test
```

If Admin/User Portal UI wiring is touched, also run:

```powershell
npm run admin:test
npm run admin:build
```

Production validation for Phases 2 and 3 must be named in the exact Risk A
approval and should include at minimum:

- service health check;
- safe node inspect summary;
- policy check summary;
- portal static entry check;
- public Admin blocked check;
- no-session portal API rejection check;
- no live order creation during deployment validation;
- rollback target and restore path.

## Non-Goals

This design does not:

- authorize production mutation;
- expose public Admin;
- create or rotate protocol credentials;
- generate accounts, passwords, tokens, or subscription URLs;
- change DNS, Nginx, firewall, provider security groups, or payment behavior;
- implement live health-based automatic traffic steering;
- make TUIC, Hysteria2, H3, or VLESS/XUDP default stable output by itself;
- restore Shadowsocks as default stable output.
