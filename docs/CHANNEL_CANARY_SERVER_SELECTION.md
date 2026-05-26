# Channel Canary Server Selection Gate

Last updated: 2026-05-26, Asia/Shanghai.

> Status:
> - Type: Active Risk A selection gate
> - Risk: A for any server creation, cloud mutation, DNS mutation, firewall
>   change, runtime deployment, production config change, credential handling,
>   or traffic canary; C for this repository documentation change
> - Execution authority: Does not authorize server creation, provider
>   purchase, DNS change, protocol runtime deployment, firewall/security-group
>   mutation, production node config activation, artifact mutation, tenant
>   mutation, or cutover by itself
> - Production impact: None unless a later execution record is separately
>   approved
> - Source of truth for: technical requirements and decision gates before
>   selecting a clean channel-runtime canary server

## Purpose

The channel technical MVP now has repository support for multi-protocol
Subscription V2 rendering, dry-run validation, benchmark fixtures, injected
benchmark runners, and local CLI tooling. Those repository capabilities do not
prove that any real remote channel works.

This document defines the gate for choosing a clean server for the next runtime
canary. It answers:

```text
What kind of server is acceptable for VLESS/XUDP, Hysteria2, TUIC, or future
channel experiments?
```

It does not choose a provider, create a server, deploy a runtime, or change
production.

## Relationship To Other Docs

- `docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md`: technical MVP definition and
  repository-only channel work.
- `docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md`: execution gates after a target
  server and protocol candidate are selected.
- `docs/NODE_NAMING.md`: provider-neutral naming rules.
- `docs/PRODUCTION_EDGE_FLEET.md`: production edge slot semantics and
  provider-neutral edge fleet boundaries.
- `docs/PROJECT_TOPOLOGY.md`: control, delivery, data-plane, operator lab, and
  edge-role topology.

If this document conflicts with a later approved execution record, the latest
approved execution record wins for the action it performed.

## Current Boundary

Current facts from project state:

```text
prod-edge-a / prod-edge-b:
  stopped under accepted-outage cleanup
  not current runtime canary targets unless a rollback/rebuild gate approves it

Aliyun subscription-control candidate:
  private control-plane candidate only
  not an edge data-plane experiment host

HP local Linux:
  manual CI and operator lab
  not production, staging, or public edge capacity

Local Edge Agent:
  parked future node/agent adaptation asset
  not the current channel-upgrade mainline
```

The next runtime canary should use a clean, disposable channel canary server or
a separately approved edge slot. Do not reuse stopped, historical, or
control-plane hosts just because they are available.

## Naming

Use provider-neutral names only.

Acceptable canary labels:

```text
channel-lab-a
channel-lab-b
canary-edge-a
canary-edge-b
```

Production-facing edge labels must continue to follow `docs/NODE_NAMING.md`:

```text
prod-edge-a
prod-edge-b
prod-edge-c
```

Do not use durable labels that reveal:

```text
cloud provider
hosting vendor
region or city
instance id
public IP
blue / green / standby role
customer or package name
```

Execution records may record factual provider, instance, and IP details in
restricted operational context, but those details must not become customer or
durable node identity.

## Candidate Server Requirements

### Network Path Requirements

The selected server must support long-haul measurement. The canary goal is not
only "port opens"; it must measure quality over a long path.

Required before selection:

```text
multiple vantage checks:
  operator local device
  HP local Linux manual CI / operator lab
  at least one external or neutral vantage if available

DNS and routing:
  stable public IPv4 or approved domain plan
  no dependency on an old stopped node IP
  no assumption that a non-EIP / non-reserved IP is movable

latency and jitter:
  TCP connect latency baseline
  HTTPS or TCP first-byte baseline if a test service exists
  repeated samples, not a single ping

loss indicators:
  TCP timeout count
  UDP reachability if candidate protocol requires UDP
  note that ICMP loss alone is not authoritative
```

Disqualifiers:

```text
only one vantage can reach it
TCP or UDP results are unstable before any protocol runtime is installed
provider blocks required UDP behavior
public IP retention is unknown but the plan assumes a stable IP
```

### UDP Requirements

Hysteria2, TUIC, XUDP-related validation, and future QUIC-style candidates make
UDP behavior a first-class requirement.

Required before selection:

```text
provider allows UDP ingress and egress on the chosen candidate port
host firewall can express a minimal UDP allow rule
security-group / firewall delta can be rolled back
UDP probes can be run without opening broad public surfaces
candidate port is not shared with unrelated production services
```

Do not select a server for UDP-heavy protocol proof if UDP behavior is blocked,
ambiguous, or cannot be measured from the operator environment.

### Protocol Fit

Every server-selection record must name the first protocol family to test.

Preferred first canary candidates:

```text
Hysteria2:
  suitable for weak-network and long-haul UDP-based behavior experiments

TUIC:
  suitable for UDP-based behavior experiments with client-supported fields

VLESS / XUDP:
  suitable for UUID identity and Xray/Mihomo compatibility experiments
```

Baseline:

```text
SS:
  control case and rollback comparison only
```

Research:

```text
QUIC / MPTCP:
  research queue until a separate design and runtime boundary exists
```

Do not run multiple new protocol families in the first runtime canary. Select
one protocol family, one target server, and one controlled operator device.

### System Requirements

Required host capabilities:

```text
64-bit Linux
systemd or an approved equivalent service manager
kernel and userspace suitable for UDP-heavy workloads
basic firewall tooling
log rotation
time sync
non-root deployment path where possible
clear package installation and removal path
```

Operational checks:

```text
CPU and memory headroom for sustained test sessions
disk headroom for logs and temporary packages
network counters available for RX/TX drops and retransmit observations
service restart count can be inspected without leaking credentials
```

### Cost And Lifecycle Requirements

The server must be disposable unless separately promoted.

Required before creation:

```text
expected monthly cost
expected traffic allowance
bandwidth cap and throttling policy
cleanup owner
cleanup trigger date or review window
destroy / stop / keep decision point
```

Do not allow a canary host to become an unmanaged long-running resource. Every
execution record must end with one of:

```text
keep for observation
promote to next gate
stop
destroy
```

### Security Boundary

Required:

```text
no production .env copy
no SQLite copy
no tenant or artifact mutation
no broad Admin exposure
no shared production credentials
no raw protocol credentials in docs, PRs, chat, or logs
minimal open ports only
rollback commands before runtime deployment
```

Allowed only after explicit approval:

```text
create a canary server
install one named protocol runtime
write one redacted candidate config
open one approved candidate port
validate from one controlled operator device
```

Not allowed by this document:

```text
DNS change
production subscription output activation
all-user rollout
traffic cutover
subscription-control promotion
opaque artifact issuance or rotation
legacy query-token retirement
server mesh setup
Local Edge Agent production activation
```

## Selection Scorecard

Use this scorecard in future read-only inventory records. A server must pass
all required rows before creation is recommended.

| Area | Required evidence | Pass condition |
| --- | --- | --- |
| Identity | Provider-neutral label, provider/region/IP in restricted record only | Durable name does not reveal provider, region, IP, or role |
| Lifecycle | Cost, traffic allowance, cleanup owner, review window | Cleanup or promotion decision is explicit |
| TCP path | Repeated connect samples from at least two vantages | No repeated timeout pattern before runtime install |
| UDP path | UDP allowed and measurable for candidate port | Required candidate UDP path is not blocked |
| Protocol fit | One named protocol family | No mixed first-canary deployment |
| System | Linux, service manager, firewall, logs, counters | Host can run and observe candidate runtime |
| Security | Minimal ports, no production secrets, rollback prepared | No broad ingress or secret copying |
| Baseline | SS or known baseline comparison path | Candidate can be compared to an existing baseline |
| Validation | Metrics plan and operator device named | Success bar is measurable |
| Rollback | Stop/disable/remove-port steps known | Rollback does not depend on DNS/cutover |

## Minimum Metrics For First Runtime Canary

The selected server must support collection of:

```text
connect success rate
timeout count
P50 / P95 / P99 latency
time to first byte
10-minute sustained-session result
UDP probe result if protocol supports UDP
client-side error class
server-side error class
host CPU / memory / disk summary
network counter summary
rollback elapsed time
```

Do not promote a candidate based on a single successful connection.

## Read-Only Inventory Template

Use this template before requesting server creation:

```text
Title:
Date / timezone:
Risk: A / read-only server selection

Scope:
  approved:
  explicitly not approved:

Candidate identity:
  proposed provider-neutral label:
  provider:
  region / location:
  product / instance class:
  operating system:
  monthly cost estimate:
  traffic / bandwidth policy:

Protocol intent:
  first protocol family:
  candidate port:
  UDP required:
  baseline comparison:
  controlled operator device:

Network evidence:
  operator-local TCP:
  operator-local UDP:
  HP/local Linux TCP:
  HP/local Linux UDP:
  additional vantage:
  known path concerns:

Security and lifecycle:
  expected open ports:
  secret boundary:
  cleanup owner:
  cleanup trigger:
  rollback summary:

Conclusion:
  recommended / rejected / more inventory needed:
  blockers:
  next approval phrase:
```

Do not paste credentials, raw subscription URLs, opaque artifact URLs, private
keys, raw runtime config, raw access logs, or customer data into the record.

## Approval Phrases

Read-only selection inventory:

```text
Approve Channel Canary Server Selection read-only inventory.
```

Server creation:

```text
Approve creation of <provider-neutral-label> for <protocol-family> channel canary only. No production traffic.
```

Runtime deployment:

```text
Approve Channel Runtime Canary deployment on <provider-neutral-label> for <protocol-family> only. No production cutover.
```

Operator-device canary:

```text
Approve controlled operator-device channel canary for <protocol-family>. No all-user rollout.
```

Any production DNS change, subscription output activation, broader artifact
action, tenant/user migration, traffic cutover, or node promotion requires a
separate Risk A approval phrase and execution record.

## Repository Validation For This Document

This document is docs-only. Repository validation for the docs PR is:

```bash
git diff --check origin/master...HEAD
npm run project-state:check
```

These commands validate repository formatting and structured-state references.
They do not validate server quality, protocol runtime behavior, production
availability, or canary success.
