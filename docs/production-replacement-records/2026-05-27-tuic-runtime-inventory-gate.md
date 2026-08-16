# TUIC Runtime Inventory Gate


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: tuic_runtime_inventory_gate
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

> Status:
> - Type: A-tier read-only inventory gate handoff
> - Risk: A for live inventory; C for this repository record
> - Execution authority: Does not authorize TUIC runtime deployment, server
>   creation, firewall/security-group changes, DNS changes, Nginx changes,
>   systemd changes, production config changes, subscription output changes,
>   operator-device traffic, broader rollout, or cleanup mutation
> - Production impact: None
> - Source of truth for: the next approval gate before any TUIC comparison
>   runtime work

## Purpose

The Hysteria2 extended measurement on `channel-lab-a` produced enough sample
volume but remains `hold_for_investigation` because tail latency exceeded the
project thresholds. `docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md` defines TUIC
as the next measured comparison candidate, with VLESS/XUDP as the secondary
candidate.

This record moves the TUIC path from comparison planning into the next A-tier
gate: read-only runtime inventory. It does not perform the inventory and does
not approve runtime mutation.

## Current Evidence

Read before requesting inventory:

```text
docs/LOCAL_EDGE_CHANNEL_TECHNICAL_MVP.md
docs/CHANNEL_TUIC_COMPARISON_CANARY_PLAN.md
docs/CHANNEL_CANARY_SERVER_SELECTION.md
docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md
docs/production-replacement-records/2026-05-26-channel-canary-server-selection-inventory.md
docs/production-replacement-records/2026-05-26-channel-lab-a-creation.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-runtime.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-operator-device-canary.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-mihomo-import-validation.md
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md
```

Current documented state:

```text
Hysteria2 extended measurement: completed
Hysteria2 decision: hold_for_investigation
TUIC: next measured comparison candidate
VLESS/XUDP: secondary comparison candidate
Aliyun subscription boundary: current subscription-distribution authority
edge data-plane traffic: not activated
AWS prod-edge-a/prod-edge-b: stopped under accepted outage
```

## Inventory Goal

The read-only inventory must answer one decision:

```text
Should TUIC reuse channel-lab-a, use a fresh channel-lab-b target, or stop before
runtime deployment?
```

It must not assume that Hysteria2 and TUIC can safely coexist on the same host.
The inventory has to verify host lifecycle, port plan, firewall/security-group
posture, rollback path, and cleanup ownership before any TUIC mutation is
requested.

## Approval Phrase

The next exact approval phrase is:

```text
Approve Channel Runtime Canary Stage 0 read-only inventory for TUIC. No runtime mutation.
```

Short confirmations such as `同意`, `继续`, `开始`, or `可以` are insufficient
for this gate.

## Allowed After Exact Approval

The approved read-only inventory may:

```text
read existing channel-lab-a records
verify live channel-lab-a identity and lifecycle state
inspect current OS/runtime/service posture
inspect current listening ports and firewall/security-group exposure
inspect whether Hysteria2 and TUIC port/service plans can coexist
inspect host CPU, memory, disk, and network counters
review TUIC runtime package source options without installing them
define candidate port options without opening them
define rollback and cleanup steps
decide channel-lab-a reuse vs channel-lab-b selection vs stop
```

## Not Allowed

The inventory must not:

```text
install TUIC
download or stage TUIC binaries on a remote host
write TUIC config
open or change UDP ports
change provider firewall or security groups
restart, stop, or reconfigure Hysteria2
change DNS
change Nginx
change systemd units
change production config
change subscription output
generate operator-device TUIC client material
run operator-device traffic through TUIC
touch Aliyun subscription-distribution runtime
start stopped AWS prod-edge nodes
copy secrets, credentials, raw logs, subscription URLs, artifact URLs, or
  customer data into docs, PRs, chat, or logs
```

## Required Inventory Evidence

The future inventory record must summarize only safe facts:

```text
target identity:
  provider-neutral label
  cloud provider and region, if cloud-backed
  instance id, if cloud-backed
  security group / firewall identity, if cloud-backed
  OS and architecture

current runtime:
  Hysteria2 service state
  listening-port summary
  current approved exposed ports
  host resource summary

TUIC feasibility:
  candidate runtime package source
  candidate service name
  candidate config path
  candidate UDP port options
  coexistence risk with Hysteria2
  cleanup owner and cleanup deadline

decision:
  reuse channel-lab-a
  or require channel-lab-b server-selection gate
  or stop before runtime deployment
```

Do not record raw secrets, raw config, raw journal lines, raw access logs, raw
subscription URLs, artifact URLs, customer data, or cloud credentials.

## Stop Conditions

Stop before any runtime deployment request if:

```text
target identity is unclear
Hysteria2 cleanup or coexistence risk is unclear
candidate port conflicts with existing services or policy
firewall/security-group rollback path is unclear
TUIC runtime package source cannot be verified
credential storage boundary is unclear
operator-device measurement plan would require system proxy, TUN, driver, or
  all-user rollout
```

## Next Gates

Only after a successful inventory may the operator request one of:

```text
Approve Channel Runtime Canary deployment on channel-lab-a for TUIC only. No production cutover.
Approve Channel Runtime Canary deployment on channel-lab-b for TUIC only. No production cutover.
```

Operator-device measurement remains a later separate gate:

```text
Approve controlled operator-device channel canary for TUIC. No all-user rollout.
```

## Not Performed

This repository record did not perform:

```text
TUIC inventory execution
TUIC runtime deployment
server creation
firewall/security-group mutation
DNS mutation
Nginx mutation
systemd mutation
production config mutation
subscription output change
operator-device traffic
all-user rollout
Hysteria2 cleanup
channel-lab-a cleanup
AWS stopped-node rollback-start
Aliyun subscription-boundary mutation
secret, token, subscription URL, artifact URL, SQLite, cloud credential, or
  customer-data recording
```

## Validation For This Record

Repository validation:

```powershell
git diff --check origin/master...HEAD
npm run project-state:check
```
