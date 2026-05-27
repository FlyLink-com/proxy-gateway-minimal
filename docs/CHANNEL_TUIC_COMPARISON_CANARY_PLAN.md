# TUIC Comparison Canary Plan

Last updated: 2026-05-27, Asia/Shanghai.

> Status:
> - Type: Active channel comparison planning record
> - Risk: C for this document; A for any TUIC server, runtime, firewall,
>   security-group, DNS, Nginx, systemd, production config, tenant/artifact,
>   subscription output, traffic, or cleanup mutation
> - Execution authority: Does not authorize TUIC runtime deployment, server
>   creation, port exposure, subscription output changes, or production traffic
> - Production impact: None
> - Source of truth for: the next measured channel candidate after the held
>   Hysteria2 extended measurement

## Purpose

The Hysteria2 extended measurement on `channel-lab-a` collected enough samples
for the repository measurement gate, but the result is still held:

```text
direct Hysteria2 path:
  180/180 successes
  0 timeouts
  hold_for_investigation because p95/p99 thresholds were exceeded

standalone Mihomo -> Hysteria2 path:
  180/180 successes
  0 timeouts
  hold_for_investigation because one p99 spike exceeded the threshold
```

This plan defines TUIC as the next measured comparison candidate. It is not a
runtime approval. It exists to make the next channel experiment explicit before
any A-tier action is requested.

## Current Evidence

Primary evidence:

```text
docs/production-replacement-records/2026-05-26-channel-lab-a-hysteria2-extended-measurement.md
docs/channel-measurement-bundles/2026-05-26-channel-lab-a-hysteria2-extended-measurement/bundle-report.json
docs/CHANNEL_STRATEGY_ENGINE.md
docs/CHANNEL_RUNTIME_CANARY_RUNBOOK.md
```

Repository support already exists for:

```text
TUIC candidate config parsing
TUIC Clash/Mihomo YAML rendering
TUIC dry-run diagnostic redaction
candidate comparison advisory reports
measurement scoring and decision packs
```

Repository support does not prove:

```text
TUIC runtime availability
TUIC long-haul quality
TUIC operator-device import behavior
TUIC production readiness
```

## Candidate Decision

Recommended next measured candidate:

```text
primary comparison candidate: TUIC
secondary comparison candidate: VLESS/XUDP
held candidate: Hysteria2
baseline reference: SS
```

Why TUIC next:

```text
it is already renderer-supported in the repository
it is a UDP-based candidate suitable for long-haul behavior comparison
it can be measured through the same operator-device and Mihomo validation style
it provides a clean contrast after Hysteria2 showed healthy success rate but
  unacceptable tail-latency behavior
```

TUIC must not inherit the Hysteria2 runtime by assumption. A TUIC canary needs
its own runtime inventory, runtime deployment approval, measurement windows,
and cleanup decision.

## Proposed Measurement Shape

The first TUIC comparison should mirror the Hysteria2 measurement structure so
the results are comparable:

```text
target label:
  channel-lab-a if the operator explicitly approves reuse
  otherwise a new provider-neutral channel-lab-b selection gate

test paths:
  direct TUIC local client path, if a safe local client is approved
  standalone Mihomo -> TUIC path

windows:
  at least 3 windows per path
  60 samples per window

sample target class:
  public lightweight HTTPS endpoint

recorded output:
  aggregate counts and latency summaries only
  no raw endpoint URL
  no raw logs
  no credentials
  no subscription URLs
```

Minimum comparable metrics:

```text
success samples
failed samples
timeout samples
p50 duration
p95 duration
p99 duration
max duration
client/runtime error count summary
cleanup status
```

## Gates

### Gate 0: Repo-Only Readiness

Already satisfied by repository support, subject to fresh verification before a
runtime PR:

```text
TUIC renderer tests exist
TUIC config dry-run redacts credential-like fields
candidate comparison plan can identify TUIC after a held Hysteria2 result
```

Recommended repo verification before any A-tier runtime request:

```powershell
node --test server/tests/clash-subscription.test.mjs server/tests/channel-config-dry-run.test.mjs server/tests/channel-candidate-comparison.test.mjs
npm test
```

### Gate 1: TUIC Runtime Inventory

Risk:

```text
A / read-only inventory
```

Goal:

```text
decide whether the TUIC candidate should reuse channel-lab-a or require a fresh
channel-lab-b target
```

Allowed:

```text
read existing channel-lab-a lifecycle records
read current provider/firewall/runtime posture
inspect whether Hysteria2 and TUIC can coexist safely
define rollback and cleanup path
```

Not allowed:

```text
install TUIC
open a new UDP port
change security groups or firewalls
restart Hysteria2
change subscription output
run operator-device traffic through TUIC
```

### Gate 2: TUIC Runtime Deployment

Risk:

```text
A / mutation
```

Requires a separate explicit approval phrase such as:

```text
Approve Channel Runtime Canary deployment on <target> for TUIC only. No production cutover.
```

This gate must name:

```text
target label
provider and instance identity, if cloud-backed
candidate UDP port
runtime package / binary source
credential storage path
systemd service name
rollback command
cleanup owner
```

### Gate 3: Controlled Operator-Device TUIC Canary

Risk:

```text
A / controlled operator-device measurement
```

Requires a separate explicit approval phrase such as:

```text
Approve controlled operator-device channel canary for TUIC. No all-user rollout.
```

Allowed after approval:

```text
generate local operator-only TUIC client material
run temporary loopback-only local client or standalone Mihomo path
collect aggregate sample summaries
stop local test clients after measurement
```

Not allowed:

```text
all-user rollout
subscription output change
DNS mutation
Nginx mutation
production config mutation
tenant/artifact mutation
system proxy change
TUN / virtual NIC / driver setup
production traffic
```

## Decision Outcomes

After comparable TUIC measurement, the only valid decision outcomes are:

```text
ready_for_decision:
  TUIC can proceed to a controlled decision pack and possible next canary gate

needs_extended_measurement:
  TUIC has promising short evidence but insufficient sample windows

hold_for_investigation:
  TUIC shows tail-latency, reliability, timeout, import, or runtime issues

reject_for_now:
  TUIC fails import, runtime stability, security boundary, or rollback criteria
```

None of these outcomes automatically changes subscription output or production
traffic. Any runtime effect remains A-tier.

## Non-Goals

This plan does not authorize:

```text
server creation
TUIC runtime deployment
Hysteria2 runtime changes
DNS changes
Nginx changes
systemd changes
firewall or security-group changes
production config changes
tenant or artifact mutation
subscription output changes
all-user rollout
production traffic
Local Edge Agent production activation
system proxy, PAC, route-table, TUN, virtual NIC, or driver changes
WireGuard or server edge mesh setup
traffic accounting or quota enforcement
cleanup of channel-lab-a
```

## Conclusion

```text
Hysteria2 extended measurement: sufficient samples, held for latency investigation
next measured candidate: TUIC
secondary candidate: VLESS/XUDP
runtime action: not approved
production impact: none
next gate: TUIC runtime inventory, then separate TUIC deployment approval if chosen
```
