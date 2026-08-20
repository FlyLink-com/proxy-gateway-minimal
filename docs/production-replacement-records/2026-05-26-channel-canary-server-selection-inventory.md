# Channel Canary Server Selection Read-Only Inventory


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: channel_canary_server_selection_inventory
  superseded_by: null
  last_verified_at: 2026-05-26
  production_authority: false
```


Date: 2026-05-26, Asia/Shanghai.

Risk:

```text
A / read-only channel canary server selection inventory
```

Approval phrase:

```text
Approve Channel Canary Server Selection read-only inventory.
```

## Scope

Approved:

```text
review repository channel-runtime gates
review current documented production and lab boundaries
define clean canary-server selection requirements
choose the next approval gate shape
record a provider-neutral recommendation
```

Explicitly not approved:

```text
server creation
cloud-provider purchase or mutation
DNS mutation
Nginx mutation
systemd mutation
firewall or security-group mutation
runtime package installation
candidate protocol service start
production config change
tenant or artifact mutation
SQLite copy
secret copy
traffic cutover
all-user subscription output change
Local Edge Agent production activation
```

No secrets, tokens, subscription URLs, opaque artifact URLs, runtime configs,
private keys, raw logs, credentials, SQLite contents, or customer data were
recorded.

## Inputs Reviewed

Repository / project-state inputs:

```text
docs/PROJECT_CONTEXT.md
docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md
docs/CHANNEL_CANARY_SERVER_SELECTION.md
docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md
docs/NODE_NAMING.md
docs/PRODUCTION_EDGE_FLEET.md
project-state/current.json
project-state/tasks.json
project-state/lanes.json
```

This inventory did not inspect or mutate any cloud provider account. It is a
selection-gate record, not live infrastructure evidence.

## Current Boundary Facts

Current documented state:

```text
prod-edge-a / prod-edge-b:
  stopped under accepted-outage cleanup
  not suitable as first channel-runtime canary targets without a separate
  rollback or clean rebuild gate

Aliyun subscription-control candidate:
  private loopback-only subscription-control candidate
  not an edge data-plane experiment host

HP local Linux:
  manual CI and operator lab
  not production, staging, or public edge capacity

Local Edge Agent:
  parked future node/agent adaptation asset
  not the current channel-upgrade mainline

Subscription renderer:
  repository support exists for SS baseline, VLESS/XUDP, Hysteria2, TUIC,
  quality groups, dry-run summaries, benchmark fixtures, injected runner
  scaffolding, and local runner CLI

Runtime canary:
  not executed
  no matching remote protocol service is currently proven by repository support
```

Conclusion:

```text
Do not use existing stopped production nodes, Aliyun control-plane candidate,
or HP lab as the first remote channel-runtime canary by default.
Use a clean disposable channel canary server unless a later approval explicitly
chooses a different target.
```

## Candidate Identity

Recommended provider-neutral label:

```text
channel-lab-a
```

Reason:

```text
The next server should prove channel-runtime behavior without becoming a
production edge slot. The label avoids provider, region, IP, blue/green, and
standby semantics.
```

Not recommended for first canary identity:

```text
prod-edge-a
prod-edge-b
prod-edge-c
sub-control-a
HP relay
legacy blue
```

Those names either carry production, control-plane, recovery, lab, or historical
semantics that would blur the canary boundary.

## Protocol Recommendation

Recommended first protocol family:

```text
Hysteria2
```

Reason:

```text
The current product question is long-haul and weak-network channel quality.
Hysteria2 is the cleanest first UDP-heavy candidate for measuring timeout,
jitter, sustained-session behavior, and fallback quality without also making
identity-model or multi-protocol complexity the first variable.
```

Baseline:

```text
SS remains the comparison and rollback baseline.
```

Second candidates:

```text
TUIC:
  useful as the second UDP-heavy channel comparison after Hysteria2

VLESS / XUDP:
  useful when UUID identity and Xray/Mihomo compatibility become the primary
  question
```

Research queue:

```text
QUIC / MPTCP:
  not first-runtime candidates in this record; require separate design and
  runtime boundary
```

Do not deploy multiple new protocol families in the first canary. The first
canary should test exactly one protocol family against the SS baseline.

## Minimum Server Requirements

The future server creation request must name a concrete provider, region, and
instance class, and must show that it satisfies:

```text
public IPv4 or approved domain plan
clean Linux image
systemd or approved service manager
minimal firewall controls
UDP ingress and egress on the candidate port
traffic allowance suitable for repeated benchmark loops
stable enough long-haul TCP/UDP path from operator and HP vantages
ability to inspect service state without exposing command-line secrets
clear cost and cleanup owner
```

Suggested minimum server class for first canary:

```text
1-2 vCPU
1-2 GB RAM
20+ GB disk
Ubuntu or Debian stable image
public IPv4
UDP-capable networking
explicit monthly cost and traffic cap
```

The exact provider and region are intentionally not selected in this record
because no live provider inventory or candidate IP was approved or inspected.

## Readiness Scorecard

| Area | Inventory result |
| --- | --- |
| Provider-neutral identity | Recommended `channel-lab-a` |
| Existing production node reuse | Rejected for first canary by default |
| Aliyun control-plane reuse | Rejected for edge canary by default |
| HP lab reuse | Rejected as public edge capacity by default |
| First protocol family | Recommended Hysteria2 |
| Baseline | SS baseline |
| UDP requirement | Required |
| Multi-vantage measurement | Required before runtime canary |
| Production impact | None in this record |
| Server creation readiness | Not yet approved |

## Next Approval Gate

This inventory is sufficient to ask for a concrete server-creation approval,
but it does not create or choose a provider by itself.

Next approval phrase template:

```text
Approve creation of channel-lab-a for Hysteria2 channel canary only. No production traffic.
```

The execution request that uses that phrase must still include:

```text
provider
region / location
instance class
operating system image
estimated cost
traffic allowance
candidate port
firewall/security-group delta
cleanup owner
cleanup trigger
rollback / destroy path
```

If those details are not available, the next step should be a provider-specific
read-only shortlist rather than server creation.

## Conclusion

```text
Recommended next target label:
  channel-lab-a

Recommended first protocol family:
  Hysteria2

Ready to create server now:
  no, not without concrete provider/region/instance/cost/firewall details
  and separate creation approval

Ready to request creation approval:
  yes, if the request includes the concrete server details listed above
```

No production, cloud, DNS, Nginx, systemd, firewall, security-group, runtime,
tenant, artifact, SQLite, or traffic mutation was performed.
