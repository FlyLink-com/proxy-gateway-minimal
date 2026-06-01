# Node Registration And Pool Contract

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active architecture contract
> - Risk: C
> - Execution authority: Does not authorize DNS changes, Nginx changes,
>   systemd changes, firewall changes, node deployment, runtime config changes,
>   subscription-output mutation, tenant/artifact mutation, all-user rollout,
>   traffic movement, or production authority transfer
> - Source of truth for: Safe node registration shape, lifecycle labels, pool
>   labels, and redacted measurement summaries used by the subscription control
>   plane and data-plane edge inventory

## Purpose

This document refines the safe contract between:

```text
subscription control plane:
  owns users, entitlement, artifacts, subscription rendering, and explicit node
  policy

edge data plane:
  owns proxy runtimes, listener reachability, local node health, and replaceable
  capacity
```

The contract is intentionally narrow. It lets the control plane reason about
node eligibility without copying raw endpoints, protocol credentials, customer
data, provider secrets, logs, or subscription URLs into repository docs,
review packets, or operator-facing summaries.

## Boundary Rules

Node registration is a control-plane input, not a deployment mechanism.

```text
safe node facts -> operator review / registry / renderer policy
raw runtime config -> protected runtime environment only
```

The registry may identify a node by stable references such as `endpointRef` and
`portRef`. It must not store raw public hosts, raw public IPs, raw ports,
protocol passwords, private keys, subscription URLs, bearer tokens, provider
credentials, customer data, or unredacted runtime output.

## Node Registration Schema

Each registered node should use this safe schema:

| Field | Required | Meaning | Safe value rule |
| --- | --- | --- | --- |
| `nodeId` | Yes | Stable registry identifier | Non-secret slug; no raw host/IP/port |
| `displayName` | Yes | Operator-readable name | Human label; no endpoint or credential |
| `protocol` | Yes | Runtime family | Known protocol label such as `tuic`, `hysteria2`, `vless`, or `shadowsocks` |
| `provider` | Yes | Provider or ownership label | Coarse label only; no account IDs or secrets |
| `region` | Yes | Region label | Coarse geography such as `sg`, `jp`, or `us-west` |
| `endpointRef` | Yes | Reference to protected endpoint material | Reference key only; no raw host, IP, URL, or DNS record value |
| `portRef` | Yes | Reference to protected listener material | Reference key only; no raw port number |
| `pool` | Yes | Subscription strategy pool | One of `stable`, `private`, `canary`, `recovery` |
| `lifecycle` | Yes | Operational lifecycle state | One of `planned`, `private-validation`, `canary`, `active`, `maintenance`, `retired` |
| `strategyPriority` | No | Stable-pool ordering hint | Integer; lower values sort first |
| `tags` | No | Safe operator grouping labels | Non-secret labels only |
| `health` | No | Latest redacted health summary | Use the health summary schema below |
| `notesRef` | No | Pointer to a safe review note | Reference only; no raw logs or secrets |

`endpointRef` and `portRef` are mandatory for any node that could later become
eligible for subscription output. They are references to protected operator
inventory, not the inventory itself.

## Lifecycle Contract

Use these lifecycle states exactly:

| Lifecycle | Meaning | Default output eligibility |
| --- | --- | --- |
| `planned` | Design or inventory placeholder exists; no runtime authority is implied | No |
| `private-validation` | Runtime is being checked by operators or lab-only clients | No |
| `canary` | Candidate may be exposed only through explicit controlled-access assignment | No |
| `active` | Node may be eligible for normal subscription output if its pool and entitlement allow it | Yes, only when `pool` is `stable` |
| `maintenance` | Node is temporarily withheld from output or under investigation | No |
| `retired` | Node is no longer eligible; retained only for audit or historical context | No |

Lifecycle labels are descriptive control-plane facts. Changing a runtime,
public reachability, DNS record, firewall rule, service unit, node deployment,
or subscription output still requires the appropriate Risk A gate.

## Pool Contract

Use these pool labels exactly:

| Pool | Meaning | Default subscription output |
| --- | --- | --- |
| `stable` | Normal eligible capacity after approval and validation | Included only when lifecycle, entitlement, and renderer rules allow |
| `private` | Operator-only, lab-only, or explicitly assigned private validation capacity | Excluded |
| `canary` | Controlled-access candidate for limited validation | Excluded unless explicitly assigned |
| `recovery` | Standby, fallback, or restore-path capacity | Excluded unless explicitly assigned |

Default user subscription output must include only eligible `stable` nodes.
`private`, `canary`, and `recovery` nodes require explicit operator assignment
or a separately approved rollout gate. A canary or recovery label must never be
interpreted as permission for all-user output.

## Health And Measurement Summary

Health evidence may be attached to a node only as a redacted summary:

| Field | Required | Meaning | Safe value rule |
| --- | --- | --- | --- |
| `success` | Yes | Successful checks in the sample window | Count or ratio; no raw target data |
| `timeout` | Yes | Timed-out checks in the sample window | Count or ratio; no raw errors |
| `p50` | Yes | Median latency summary | Numeric duration in milliseconds |
| `p95` | Yes | 95th percentile latency summary | Numeric duration in milliseconds |
| `p99` | Yes | 99th percentile latency summary | Numeric duration in milliseconds |
| `qualityTier` | Yes | Operator-facing quality label | Safe enum such as `excellent`, `good`, `degraded`, or `hold` |
| `reasonCodes` | Yes | Machine-readable explanation | Non-secret codes such as `low_success`, `tail_latency`, `timeout_spike` |
| `windowStartedAt` | No | Sample window start | Timestamp only |
| `windowEndedAt` | No | Sample window end | Timestamp only |
| `source` | No | Evidence source label | Safe label such as `operator-measurement` |

Measurement summaries must not include raw probe URLs, raw target hosts, raw
ports, raw logs, client identifiers, credentials, tokens, subscription URLs, or
customer traffic payloads.

## Risk A Actions

This C-tier contract does not authorize runtime mutation. Stop and use a
separate Risk A gate before any action that would:

- change DNS records or public endpoint ownership;
- change Nginx configuration, HTTPS public-boundary behavior, or reverse proxy
  routing;
- change systemd units, service users, restart policy, runtime environment, or
  process supervision;
- change firewall rules, security groups, provider network ACLs, or exposed
  listener reachability;
- deploy, rebuild, replace, retire, or publicly expose a node;
- copy, rotate, create, or move protocol credentials, private keys, provider
  credentials, tokens, or subscription material;
- mutate runtime node config or protected endpoint inventory;
- mutate subscription output, generated artifacts, tenant assignments, or
  renderer behavior in production;
- include non-`stable` nodes in default user subscription output;
- perform an all-user rollout, traffic movement, production authority transfer,
  or rollback.

## Safe JSON Example

This example is intentionally synthetic. It contains no real host, raw port,
credential, token, subscription URL, customer data, or provider account data.

```json
{
  "nodeId": "edge-sg-tuic-01",
  "displayName": "Singapore TUIC Candidate 01",
  "protocol": "tuic",
  "provider": "provider-ref-a",
  "region": "sg",
  "endpointRef": "endpoint-ref-edge-sg-tuic-01",
  "portRef": "port-ref-edge-sg-tuic-01-public",
  "pool": "canary",
  "lifecycle": "private-validation",
  "strategyPriority": 100,
  "tags": ["premium", "low-latency"],
  "health": {
    "success": 48,
    "timeout": 2,
    "p50": 82,
    "p95": 176,
    "p99": 241,
    "qualityTier": "good",
    "reasonCodes": ["sample_window_small"],
    "windowStartedAt": "2026-06-01T08:00:00.000Z",
    "windowEndedAt": "2026-06-01T08:10:00.000Z",
    "source": "operator-measurement"
  },
  "notesRef": "safe-review-note-2026-06-01-a"
}
```

Because this example uses `pool: "canary"` and
`lifecycle: "private-validation"`, it is not eligible for default user
subscription output.

## Relationship To Existing Contracts

This document refines the node and pool details from:

```text
docs/CONTROL_DATA_PLANE_INTERCONNECT_CONTRACT.md
docs/CHANNEL_STRATEGY_ENGINE.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
```

If this document conflicts with a later explicitly approved Risk A execution
record for a specific production action, the execution record wins only for
that approved action. The safe-schema and no-secret documentation boundaries
remain the default for repository artifacts.
