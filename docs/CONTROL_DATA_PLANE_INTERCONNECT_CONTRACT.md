# Control Plane / Data Plane Interconnect Contract

Last updated: 2026-06-14, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: control_data_plane_interconnect_contract
  superseded_by: null
  last_verified_at: 2026-06-14
  production_authority: false
```


> Status:
> - Type: Active architecture contract
> - Risk: C
> - Execution authority: Does not authorize DNS changes, Nginx changes,
>   systemd changes, node deployment, firewall changes, runtime config changes,
>   subscription-output mutation, tenant/artifact mutation, traffic rollout, or
>   production authority transfer
> - Source of truth for: How the subscription control plane and replaceable
>   data-plane node projects exchange safe facts and point traffic

## Purpose

The project has two connected but separate architecture concerns:

```text
subscription control plane
  user/account/package/entitlement/artifact/subscription rendering

edge data plane
  nodes/protocol runtimes/regions/health/quality/traffic capacity
```

They should communicate through explicit contracts. They should not share
customer databases, raw secrets, operational authority, or hidden direct
coupling.

## Boundary Rule

```text
control plane manages who can access what
data plane carries the actual proxy traffic
```

The control plane must not become a general-purpose proxy runtime. The data
plane must not become the user, payment, entitlement, or artifact authority.

The concrete production plan for one authoritative control plane with multiple
runtime-only edge nodes is
`docs/SINGLE_CONTROL_PLANE_MULTI_DATA_PLANE_PLAN.md`. Use that plan before
adding a new production node, moving user/order state, wiring per-order
credential fan-out, or exposing usage by account and order.

## Traffic Shape

```text
user client
  -> refreshes subscription from control-plane DNS
  -> receives rendered subscription output
  -> sends proxy traffic to data-plane node endpoints
```

The control plane issues and renders access material. It does not carry the
customer's proxy traffic after the client imports the subscription.

## DNS Ownership

| DNS / endpoint class | Owned by | Meaning | Change gate |
| --- | --- | --- | --- |
| Subscription entry domain, e.g. `sub.globalcirclecat.com` | Control plane | Stable user subscription refresh and public company/user entry boundary | Risk A DNS/Nginx/public-boundary gate |
| Node endpoint domains or public IPs | Data plane | Actual proxy runtime targets emitted into subscription output | Risk A node/protocol/firewall/subscription-output gate |
| Operator/private validation hostnames | Operator lab | Testing, health, manual validation, or private portal checks | Risk A if host/runtime changes; C/B if docs/local-only |

DNS records are pointers, not authorization. A DNS change does not by itself
authorize subscription-output changes, traffic rollout, or data-plane promotion.

## Control Plane Inputs From Data Plane

The control plane may consume redacted node facts:

```json
{
  "nodeId": "sg-tuic-01",
  "displayName": "Singapore TUIC 01",
  "provider": "aliyun-or-other",
  "region": "sg",
  "protocol": "tuic",
  "endpointRef": "node-endpoint-ref",
  "portRef": "public-port-ref",
  "pool": "stable",
  "lifecycle": "active",
  "strategyPriority": 100,
  "tags": ["premium", "low-latency"],
  "health": {
    "status": "healthy",
    "checkedAt": "2026-06-01T00:00:00.000Z",
    "source": "operator-measurement"
  }
}
```

Production records and public docs should prefer `endpointRef` and `portRef`
over raw endpoint values unless an exact Risk A record explicitly allows a
safe, redacted summary.

## Forbidden In Node Facts

Node registration, inventory, and decision packets must not contain:

```text
protocol passwords
private keys
raw subscription URLs
artifact secrets
tenant tokens
customer data
provider AK/SK
raw firewall rule IDs when not needed
raw logs
unredacted Nginx/systemd output
```

If a runtime-specific field is required to operate a node, store it only in the
approved protected runtime environment for that node. Do not turn it into a
control-plane business fact.

## Node Lifecycle

Use these lifecycle states for data-plane candidates:

| State | Meaning | May appear in default user output? |
| --- | --- | --- |
| `planned` | Design or inventory exists, no runtime authority | No |
| `private-validation` | Runtime exists for operator-only testing | No |
| `canary` | Explicit controlled-access output only | No, unless operator-assigned |
| `active` | Eligible for stable pool output | Yes, if pool and entitlement allow |
| `maintenance` | Temporarily withheld from output | No |
| `retired` | No longer eligible; kept only for audit | No |

State transitions that affect runtime, public reachability, or subscription
output are Risk A.

## Node Pools

The control plane should render nodes by pool:

```text
stable
private
canary
recovery
```

Default automatic selection should only prefer eligible `stable` nodes.
Entitled regional production nodes, such as Singapore capacity purchased or
reserved by a customer, may still appear as selectable subscription channels
after their receipt gate passes. Quality measurements may affect warnings,
ranking, and operator decisions; they are not, by themselves, permission to
remove an entitled production region from selectable output or to replace it
with a relay path. Private/canary/recovery nodes require an explicit operator
assignment or a separate approved rollout gate.

## Interconnect Contracts

### Node Registration Contract

Source:

```text
data-plane operator inventory
```

Destination:

```text
control-plane node registry / config review
```

Safe contents:

```text
nodeId
protocol
provider/region
pool
lifecycle
strategy priority
health status
redacted endpoint references
```

Not allowed:

```text
raw credentials
customer data
subscription URLs
provider secrets
runtime config dumps
```

### Health / Measurement Contract

Source:

```text
operator measurement or approved runtime health check
```

Destination:

```text
channel decision pack / node registry / operator review
```

Safe contents:

```text
success counts
timeout counts
p50/p95/p99 latency
packet-loss or retry summary
quality tier
recommended pool
reason codes
sample window metadata
```

Not allowed:

```text
raw logs
raw target URLs
client private details
credentials
customer traffic payloads
```

### Subscription Output Contract

Source:

```text
control-plane renderer
```

Destination:

```text
user client subscription import
```

Rules:

- output must be generated from authorized entitlement and node-policy state;
- raw output must not be printed into docs, PRs, chat, or logs;
- canary/private nodes must not enter all-user output without a separate gate;
- refreshing an artifact may change the user's current output but must remain
  scoped to that user's authorization.

### Desired-State Pull / Receipt Contract

Source:

```text
control-plane order and credential ledger
```

Destination:

```text
private data-plane agent route
```

Safe contents:

```text
nodeRef
channelRef
desiredStateRef
generation
edgeCredentialRef
material fingerprint
status / receipt summary
timestamps
```

Not allowed:

```text
raw passwords
UUID private material
private keys
subscription URLs
runtime config dumps
environment values
logs
SQLite rows
customer data
```

For future orders, the control plane records a safe pending desired-state
notification for remote data-plane channels. The data-plane agent may pull the
current desired-state over a private authenticated path, apply it locally, and
post a redacted receipt. User subscription output must not include that remote
channel until the current desired-state has a matching applied receipt.

Remote data-plane channel config must make this render gate explicit with
`runtimeAdapter: "remote-data-plane-handoff"` and `requiresAppliedReceipt:
true`. The renderer remains fail-closed for the remote adapter even if an older
config omits the explicit flag, but current Vultr/Singapore templates must carry
the flag so review scripts and operators can detect the intended gate without
inferring it from adapter internals.

Desired-state and receipts remain redacted coordination payloads. They carry
safe refs, generations, channel refs, and material fingerprints only. Runtime
material is available through a separate private authenticated material pull
path scoped to the authenticated node, the current `desiredStateRef`, requested
`edgeCredentialRef` values, and exact material digest matches. Summary material
checks may expose only digest presence; material-mode responses are for the
data-plane agent's protected local material store and must not be logged,
documented, copied into Git, or returned to operators.

For production smoke validation, the data-plane agent may request an explicit
subset of `edgeCredentialRef` values. The control plane must derive a distinct
scoped `desiredStateRef` and generation for that subset. Receipts for scoped
states prove only that subset was applied; they must not satisfy the full
aggregate desired-state receipt gate for a channel.

## Minimal Interface Between Projects

The two projects should connect through this narrow interface:

```text
data plane -> control plane:
  safe node facts
  safe health facts
  lifecycle/pool recommendation
  redacted desired-state apply receipts

control plane -> user client:
  authorized subscription output

control plane -> data plane:
  safe desired-state refs over private authenticated routes
  private node-scoped material pull by current desired-state digest
  no customer database authority
  no direct customer proxy traffic
  only approved runtime config or node-retirement decisions through Risk A gates
```

## Refactor Direction

Repository code should converge toward:

```text
server/services/platform/node-registry
server/services/platform/channel-policy
server/services/platform/subscription-rendering
server/services/platform/channel-measurement
```

Adapters should remain thin:

```text
CLI imports safe node facts
Admin/Operator previews node decisions
User Portal displays user-scoped subscription state
Public site does not expose node internals
```

## Stop Conditions

Stop and request a separate gate if a planned change would:

- alter DNS;
- expose a new node publicly;
- change Nginx or systemd;
- change firewall/provider security rules;
- write production node config;
- include a canary/private node in default subscription output;
- copy protocol credentials;
- query or dump customer data;
- move traffic.
