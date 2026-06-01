# Channel Runtime Canary Runbook

Last updated: 2026-06-01, Asia/Shanghai.

> Status:
> - Type: Active Risk A runbook and implementation gate
> - Risk: A for runtime execution; C for this repository documentation change
> - Execution authority: Does not authorize protocol runtime deployment, node
>   mutation, DNS changes, Nginx changes, systemd changes, security-group
>   changes, production config changes, tenant/artifact changes, traffic
>   migration, or cutover by itself
> - Production impact: None unless a later execution record is separately
>   approved
> - Source of truth for: controlled runtime canary gates for channel candidates
>   after repository renderer/config support

## Purpose

This runbook turns the repository-only channel work into a gated runtime path.
It exists because the project now has these repository capabilities:

```text
Subscription renderer:
  SS baseline
  VLESS / XUDP candidate fields
  Hysteria2 candidate fields
  TUIC candidate fields
  AUTO / FALLBACK / GLOBAL proxy groups
  fail-closed unsupported protocols

Config contract:
  protocol credential placeholder loading
  public diagnostic redaction for protocol credential fields
```

Those capabilities do not prove that any matching remote runtime exists. They
only make a controlled canary possible after separate A-tier approval.

## Current Baseline

Current baseline facts to verify before any execution:

```text
Aliyun subscription boundary:
  current subscription-distribution control boundary
  does not execute channel runtimes
  do not mutate for protocol experiments

AWS Singapore prod-edge-a/prod-edge-b:
  stopped under accepted outage
  not current serving edge capacity
  not runtime-canary targets unless a rollback-start or clean-rebuild gate
  separately approves their use

channel-lab / clean edge:
  acceptable for isolated protocol runtime proof after the matching A-tier gate

Local Edge Agent:
  parked future node/agent adaptation asset
  not the current channel-upgrade mainline
```

The current mainline is Clash/Mihomo-native subscription rendering. Clash or
Mihomo remains the protocol executor for this phase. This runbook does not
activate the Local Edge Agent, install drivers, mutate system proxy settings, or
create a virtual network adapter.

## Design

The runtime canary has one goal:

```text
Prove whether one explicit protocol candidate improves real proxy-session
quality versus the current SS baseline, while keeping rollback simple.
```

Design principles:

```text
one protocol family per canary
one target node or lab edge per canary
one controlled operator device first
no Aliyun subscription-boundary mutation for first experiments
no stopped AWS rollback-start as a side effect
no all-user output
no DNS cutover
no subscription-control authority move
metrics before promotion
rollback before expansion
```

Candidate families:

```text
SS:
  baseline and rollback target

VLESS / XUDP:
  candidate for UUID-based identity and UDP handling experiments

Hysteria2:
  candidate for measured UDP-based transport behavior

TUIC:
  candidate for measured UDP-based transport behavior

QUIC / MPTCP:
  research only until a separate design and runtime boundary exists
```

## Non-Goals

This runbook does not authorize or include:

```text
production DNS changes
production Nginx changes
production HTTPS or redirect changes
Aliyun subscription-boundary mutation
production SQLite mutation
opaque artifact issuance or rotation
legacy query-token retirement
all-user subscription output changes
public Admin UI exposure
Local Edge Agent production activation
Windows service install
TUN, virtual NIC, driver, PAC, system proxy, or route-table mutation
WireGuard / server edge mesh execution
traffic accounting or quota enforcement
prod-edge-c creation
subscription control-plane promotion
cutover
```

## Not Performed Boundary

Unless a later execution record has exact A-tier approval and records matching
validation evidence, this runbook has not performed:

```text
runtime deployment
node, DNS, Nginx, systemd, security-group, or production-config mutation
tenant, artifact, subscription-output, or SQLite mutation
operator-device or all-user traffic migration
promotion or cutover
```

## Required Inputs

Every execution record must name these inputs before any mutation:

```text
canary id:
target slot:
target host:
target instance id, if cloud-backed:
target security group, if cloud-backed:
protocol family:
runtime package / binary:
candidate port:
candidate config path:
secret source:
test operator device:
baseline comparison node:
rollback owner:
expected cleanup action:
```

Do not paste protocol credentials, tokens, artifact URLs, subscription URLs,
private keys, `.env` content, SQLite content, raw access logs, or customer data
into the execution record.

## Preflight Check

Every execution must complete `Stage 0: Read-Only Inventory` before any runtime,
host, firewall, config, tenant, artifact, subscription-output, or traffic
mutation. The preflight record is required to state:

```text
Risk: A / read-only
Mutation: none
Target identity: verified
Current services/listeners: verified
Current public behavior: verified
Secrets/customer data: not printed or copied into Git
Rollback owner and cleanup action: named
```

If any Stage 0 fact is stale, missing, or inconsistent with the target approval
phrase, stop before mutation and refresh the read-only inventory.

## Stage 0: Read-Only Inventory

```text
Risk: A / read-only
Goal: prove the target is suitable before mutation
Mutation: none
```

Required checks:

```text
repo baseline:
  current master commit
  renderer/config tests previously passed or rerun locally

target identity:
  node role
  instance id, if applicable
  public/private IP, if applicable
  security group, if applicable
  operating system
  architecture

current services:
  existing production service state, if any
  current listening ports
  current firewall/security-group exposure

current public behavior:
  subscription gateway DNS still points where expected
  current public boundary still unchanged
  current SS baseline still measurable

secret boundary:
  approved storage location exists
  no raw secret values copied to docs, PRs, chat, or logs
```

Example read-only commands. Adjust host and service names in the execution
record before running:

```bash
uname -a
systemctl is-active nginx proxy-gateway-console.service proxy-gateway-ss.service
ss -lntu
df -h
free -h
```

If any target identity or baseline check is unclear, stop. Do not install,
open ports, write config, or start services.

## Stage 1: Runtime Deployment Gate

```text
Risk: A / mutation
Goal: install and start one candidate runtime on the approved canary target
Requires: separate explicit approval
```

Approval phrase template:

```text
Approve Channel Runtime Canary deployment on <target> for <protocol> only. No production cutover.
```

Allowed only after approval:

```text
install the named runtime package or binary on the approved canary target
write one approved candidate config
start or restart only the candidate service named in the execution record
open only the approved candidate port if the canary requires it
record redacted service state and listening-port evidence
```

Not allowed:

```text
Aliyun subscription-boundary mutation
DNS change
Nginx public gateway change
production subscription base URL change
production SQLite mutation
all-user subscription output change
legacy route removal
unbounded security-group ingress
unredacted secret or log capture
```

## Stage 2: Candidate Runtime Validation

```text
Risk: A / validation
Goal: prove the candidate runtime is healthy before subscription exposure
```

Required checks:

```text
candidate service active
candidate port listening
candidate health or handshake check succeeds
candidate logs contain no raw credentials
host CPU, memory, disk, and network counters are normal
rollback command is known and tested as dry-run or reversible step
```

Record only summaries. Do not paste raw config, raw journals, credential-bearing
process command lines, access logs containing query strings, or customer data.

## Stage 3: Subscription Canary Config Gate

```text
Risk: A / production-adjacent config
Goal: expose the candidate only to a controlled operator canary path
```

Required preconditions:

```text
fresh repository master
candidate runtime validation passed
renderer supports the candidate protocol
config placeholder and redaction tests passed
rollback config prepared
controlled operator device identified
```

Allowed only after separate approval:

```text
add one candidate node definition to approved canary config
keep candidate out of all-user default output unless explicitly approved
use operator-only canary assignment or isolated test subscription path
validate generated YAML without recording secrets
```

Not allowed:

```text
all-tenant or all-user migration
tenant/artifact state mutation without explicit approval
legacy query-token retirement
opaque artifact broad issuance
Aliyun subscription-boundary replacement
```

## Stage 4: Operator Device Canary

```text
Risk: A / controlled user-path validation
Goal: compare baseline and candidate behavior on one approved operator device
```

Test set:

```text
Clash/Mihomo import succeeds
generated YAML contains only expected candidate fields
known connectivity target loop
common HTTPS target loop
long-lived TCP session
UDP probe if the candidate supports UDP
10-minute sustained session
baseline comparison against SS
```

Metrics:

```text
success rate
timeout count
P50 / P95 / P99 latency
jitter proxy metric
connect time
time to first byte
reconnection count
client-side error class
remote-side error class
CPU / memory / network counters
rollback elapsed time
```

Minimum success bar:

```text
candidate reduces observed proxy-session timeout symptoms versus baseline
candidate does not materially regress P95/P99 latency
candidate does not leak credentials through YAML, logs, diagnostics, or docs
candidate can be disabled and baseline restored quickly
candidate failure does not affect the Aliyun subscription boundary or all-user
subscription output
```

## Stage 5: Promotion Decision

The canary record must end with one of these decisions:

```text
continue observation:
  keep the candidate only for the controlled operator path

expand canary:
  requires a new approval and a larger validation plan

rollback:
  disable the candidate and verify SS baseline restoration

discard:
  remove candidate runtime/config and close exposed ports
```

Do not interpret a successful operator canary as approval for all-user rollout.

## Rollback

Rollback must be prepared before Stage 1 mutation.

Rollback actions may include:

```text
remove candidate from canary node config
restore previous approved node config
stop and disable candidate service
close candidate port / revert security-group delta
remove operator canary assignment
verify generated subscription returns to SS baseline or previous approved set
verify public gateway boundary remains unchanged
```

Rollback evidence:

```text
service state after rollback
listening ports after rollback
subscription YAML summary after rollback
operator-device connectivity after rollback
no unexpected DNS/Nginx/systemd/SQLite mutation
```

## Evidence Template

Use this template for future execution records:

```text
Title:
Date / timezone:
Risk:
Approval phrase:

Scope:
  approved:
  explicitly not approved:

Design:
  protocol family:
  target node:
  baseline:
  controlled operator device:

Implementation:
  runtime package / binary:
  config path:
  service name:
  candidate port:
  security-group / firewall delta:

Validation:
  preflight:
  service:
  listener:
  Clash/Mihomo import:
  baseline metrics:
  candidate metrics:
  log redaction:

Rollback:
  prepared:
  tested:
  elapsed time:

Conclusion:
  continue observation / expand / rollback / discard:
  blockers:
  next action:
```

## Approval Phrases

Read-only inventory:

```text
Approve Channel Runtime Canary Stage 0 read-only inventory.
```

Runtime deployment:

```text
Approve Channel Runtime Canary deployment on <target> for <protocol> only. No production cutover.
```

Operator-device canary:

```text
Approve controlled operator-device channel canary for <protocol>. No all-user rollout.
```

Any broader rollout, production DNS change, production config change,
Aliyun subscription-boundary mutation, stopped-node rollback-start,
tenant/artifact mutation, or cutover requires a separate Risk A approval phrase
and execution record.

## Repository Validation For This Runbook

This runbook change is docs-only. Repository validation for the docs PR is:

```bash
git diff --check origin/master...HEAD
npm run project-state:check
```

Those commands validate repository formatting and structured-state references.
They do not validate any runtime canary or production behavior.
