# Multi-Channel Node Design

Last updated: 2026-06-05, Asia/Shanghai.

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

## Purpose

The current channel strategy can render multiple protocol records, but the
operator model must separate two ideas that were previously too easy to mix:

```text
physical node:
  the actual edge host or protected runtime target

logical channel:
  one protocol/listener/config path emitted into a subscription output
```

A single physical node may expose multiple logical channels. TUIC, H2/TCP,
VLESS, Hysteria2, and Shadowsocks should be represented as separate channel
records when they have separate runtime behavior, listener facts, credentials,
or rollout status.

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
  physicalNodeRef = edge-current-01
  pool = canary or explicitly assigned current channel

channel-current-h2-tcp:
  protocol = vless
  network = h2
  physicalNodeRef = edge-current-01
  pool = stable-candidate until promoted

channel-current-ss-tcp:
  protocol = ss
  physicalNodeRef = edge-current-01
  pool = stable after approval and validation
```

The subscription renderer still renders channels, not physical hosts. The
registry and policy layers understand that multiple channel records can belong
to the same physical node.

## Required Safe Metadata

Channel records should add these safe fields. They must not contain raw hosts,
raw ports, credentials, tokens, subscription URLs, customer data, or provider
account details.

| Field | Required | Meaning |
| --- | --- | --- |
| `physicalNodeRef` | Yes for production channels | Safe non-secret grouping key for channels on the same physical edge host |
| `channelId` or `name` | Yes | Unique logical channel identifier emitted or assigned by the control plane |
| `protocol` | Yes | Runtime family such as `tuic`, `hysteria2`, `vless`, or `ss` |
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
  TCP-based channels after validation and approval

current or canary:
  TUIC / QUIC-style channels, explicit assignment, or narrowly approved
  temporary current-channel issuance

comparison candidates:
  H2/TCP, VLESS/XUDP, Hysteria2, and future protocol variants
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
- make TUIC, Hysteria2, H3, or VLESS/XUDP default stable output by itself.
