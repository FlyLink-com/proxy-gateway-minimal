# Production Replacement: prod-edge-a Cutover Preflight

Date: 2026-05-24 16:20-16:31 +08:00

Branch: `ops/prod-edge-a-cutover-preflight`

Runbooks:

- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_CUTOVER_STRATEGY.md`
- `docs/PRODUCTION_EDGE_FLEET.md`
- `docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md`

Approval:

```text
Approved prod-edge-a read-only cutover preflight.
```

## Scope

This record covers a read-only preflight for deciding whether clean
`prod-edge-a` can move toward production traffic.

Allowed scope:

- Read-only AWS instance and status checks.
- Read-only AliDNS and public resolver checks.
- Read-only public endpoint checks.
- Read-only TCP reachability checks.
- Read-only SSH health checks on current green and prod-edge-a.
- Read-only SQLite integrity and freshness-summary checks.
- Cutover readiness assessment.

This record does not authorize or perform:

- DNS changes
- AWS resource mutation
- Legacy blue mutation
- Green mutation
- prod-edge-a mutation
- Nginx mutation or reload
- HTTPS issuance
- Service restart
- Production `.env` change
- Production node-config change
- Production tenant migration
- Green promotion
- Legacy blue shutdown or termination
- Traffic cutover
- Secret, token, raw subscription URL, SQLite content, AWS credential, or
  customer data disclosure in PRs, docs, chat, or logs

## Baseline

Repository `master` at preflight time:

```text
e3da7208bbe56d08706e41152bb9b82b91a9d9e7
```

prod-edge-a deployed archive commit:

```text
cea90040a45458211570ae207214c4b2963ccc2a
```

Diff from the deployed archive commit to current `master` is docs-only:

```text
docs/CI_MANUAL_VALIDATION.md
docs/PROJECT_CONTEXT.md
docs/README.md
docs/production-replacement-records/2026-05-24-prod-edge-a-candidate-creation.md
```

Conclusion:

```text
prod-edge-a is current for runtime code.
Current master only adds docs after the deployed prod-edge-a archive.
```

## AWS Read-Only Inventory

Legacy blue:

```text
Instance ID: i-004ab1c6c71d06bca
Name: proxy-gateway-node-sg-blue-20260521
Public IP: 47.129.247.102
Private IP: 172.31.26.232
State: running
Instance type: t4g.small
AZ: ap-southeast-1b
Security group: sg-04a165ec77f430ee8
InstanceStatus: ok
SystemStatus: ok
```

Current green:

```text
Instance ID: i-0ad8676ee113d14cb
Name: proxy-gateway-node-sg-green-20260524
Public IP: 18.136.102.226
Private IP: 172.31.18.176
State: running
Instance type: t4g.small
AZ: ap-southeast-1b
Role: green-candidate
NoCutover: true
Security group: sg-06682c36aa03834f7
InstanceStatus: ok
SystemStatus: ok
```

prod-edge-a:

```text
Instance ID: i-0b7791340d3fedff5
Name: proxy-gateway-prod-edge-a-20260524
Public IP: 13.215.156.159
Private IP: 172.31.27.240
State: running
Instance type: t4g.small
AZ: ap-southeast-1b
Role: prod-edge-a-candidate
NoCutover: true
Security group: sg-0379ece0b3d305c43
InstanceStatus: ok
SystemStatus: ok
```

## DNS Read-Only Check

AliDNS records:

```text
sub.globalcirclecat.com A -> 47.129.247.102 TTL 600 ENABLE
ss-sg.globalcirclecat.com A -> 47.129.247.102 TTL 600 ENABLE
```

Local resolver checks:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

Conclusion:

```text
DNS still points to legacy blue.
No DNS cutover to green or prod-edge-a has occurred.
```

## Public Boundary Checks

prod-edge-a:

```text
http://13.215.156.159/api/health -> 200
http://13.215.156.159/api/admin/subscriptions -> 404
http://13.215.156.159/sub/clash.yaml without token -> 401
http://13.215.156.159/ -> 404
13.215.156.159:80 TCP -> reachable
13.215.156.159:18388 TCP -> reachable
13.215.156.159:22 TCP -> reachable
```

Current green:

```text
http://18.136.102.226/api/health -> 200
http://18.136.102.226/api/admin/subscriptions -> 404
http://18.136.102.226/sub/clash.yaml without token -> 401
http://18.136.102.226/ -> 404
18.136.102.226:80 TCP -> reachable
18.136.102.226:18388 TCP -> reachable
18.136.102.226:22 TCP -> reachable
```

Legacy blue from the local operator network:

```text
http://47.129.247.102/api/health -> 000 / timeout
http://47.129.247.102/api/admin/subscriptions -> 000 / timeout
http://47.129.247.102/sub/clash.yaml without token -> 000 / timeout
http://47.129.247.102/ -> 000 / timeout
47.129.247.102:80 TCP -> timeout
47.129.247.102:18388 TCP -> timeout
47.129.247.102:22 SSH -> timeout
```

Domain path from the local operator network:

```text
http://sub.globalcirclecat.com/api/health -> 000 / timeout
http://sub.globalcirclecat.com/api/admin/subscriptions -> 000 / timeout
http://sub.globalcirclecat.com/sub/clash.yaml without token -> 000 / timeout
http://sub.globalcirclecat.com/ -> 000 / timeout
```

Interpretation:

```text
The current DNS target is still legacy blue, and that path is not reachable
from the local operator network during this preflight. prod-edge-a and green
remain reachable from the same local vantage point.
```

Do not treat this as a global customer-impact measurement without additional
vantage points or customer evidence.

## Runtime Checks

prod-edge-a:

```text
hostname -> ip-172-31-27-240
proxy-gateway-console.service -> active, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service -> active, Result=success, ExecMainStatus=0, NRestarts=0
nginx -> active, Result=success, ExecMainStatus=0, NRestarts=0
Node -> v22.22.2
npm -> 10.9.7
runtime path -> /opt/proxy-gateway-minimal
git checkout -> no
SQLite path -> /opt/proxy-gateway-minimal/data/subscriptions.sqlite
SQLite integrity_check -> ok
subscription_tenants count -> 2
subscription_tenants max(updated_at) -> 2026-05-23T15:45:00.918Z
```

Current green:

```text
hostname -> ip-172-31-18-176
proxy-gateway-console.service -> active, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service -> active, Result=success, ExecMainStatus=0, NRestarts=23
nginx -> active, Result=success, ExecMainStatus=0, NRestarts=0
Node -> v22.22.2
npm -> 10.9.7
runtime path -> /opt/proxy-gateway-minimal
git checkout -> no
SQLite path -> /opt/proxy-gateway-minimal/data/subscriptions.sqlite
SQLite integrity_check -> ok
subscription_tenants count -> 2
subscription_tenants max(updated_at) -> 2026-05-23T15:45:00.918Z
```

The green `proxy-gateway-ss.service` restart count is historical from initial
green creation. It is currently active with successful status.

Legacy blue:

```text
SSH from local operator network -> timeout
Local runtime service and SQLite checks -> not available from this vantage point
```

## Data Freshness Assessment

prod-edge-a and green currently show the same SQLite freshness summary:

```text
subscription_tenants count -> 2
subscription_tenants max(updated_at) -> 2026-05-23T15:45:00.918Z
```

Legacy blue could not be reached over SSH from the local operator network, so a
fresh blue SQLite backup and fresh blue SQLite summary were not collected during
this preflight.

Data-source conclusion:

```text
Ready to cut over with current prod-edge-a data: no
```

Blocking reason:

```text
The authoritative production SQLite source is not freshly verified in this
preflight. Before cutover, the operator must either:

1. obtain a fresh legacy-blue SQLite backup from a reachable approved path and
   restore it to prod-edge-a; or
2. explicitly declare the current green/prod-edge-a SQLite copy authoritative
   for cutover despite legacy-blue SSH being unavailable.
```

Do not silently assume prod-edge-a data is current enough for production
traffic.

## Readiness Assessment

Health readiness:

```text
AWS status checks: ok for legacy blue, green, and prod-edge-a
prod-edge-a service health: ok
prod-edge-a public boundary: ok
prod-edge-a SS TCP reachability: ok
green service health: ok
green public boundary: ok
DNS still points to legacy blue: ok
Legacy blue local-network reachability: failed / timed out
```

Immediate cutover readiness:

```text
Ready to request immediate DNS cutover to prod-edge-a: no
```

Blocking reasons:

- The current DNS target, legacy blue, is unreachable from the local operator
  network, so final blue-side backup and runtime checks could not be completed.
- prod-edge-a data freshness is not authoritative until a fresh blue backup is
  restored or an explicit data-authority decision is made.
- No DNS cutover execution plan has been approved.
- No post-cutover monitoring window has been approved.
- Legacy blue retirement remains a separate controlled-exit decision.

Ready next actions:

```text
Ready to request a data-authority decision: yes
Ready to request a prod-edge-a cutover execution plan after data authority is resolved: yes
Ready to keep green as temporary fallback during prod-edge-a decision: yes
Ready to retire legacy blue: no
```

## Recommended Next Decision

Choose one path explicitly:

```text
1. Data-refresh path:
   Find an approved way to obtain a fresh legacy-blue SQLite backup, restore it
   to prod-edge-a, then run a final pre-cutover validation.

2. Data-authority path:
   Explicitly declare the current green/prod-edge-a SQLite copy authoritative,
   then request a separate prod-edge-a DNS/runtime cutover execution plan.

3. Pause cutover:
   Keep prod-edge-a and green running as candidates while investigating legacy
   blue reachability and data authority.
```

## Conclusion

prod-edge-a is healthy and reachable, and it is current for runtime code. Green
also remains healthy and reachable. DNS still points to legacy blue, which is
not reachable from the local operator network during this preflight.

prod-edge-a is not ready for immediate traffic cutover because the production
SQLite authority is unresolved. The next gate is a data-authority decision or a
fresh approved backup/restore path, not DNS mutation.
