# Production Replacement: Green Cutover Preflight


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: green_cutover_preflight
  superseded_by: null
  last_verified_at: 2026-05-24
  production_authority: false
```


Date: 2026-05-24 05:40-05:45 +08:00

Branch: `ops/green-cutover-preflight`

Runbooks:

- `docs/PRODUCTION_REPLACEMENT.md`
- `docs/PRODUCTION_CUTOVER_STRATEGY.md`
- `docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md`

Approval:

```text
Approved read-only green cutover preflight.
```

## Scope

This record covers a read-only cutover preflight after green was refreshed to
the current code baseline.

Allowed scope:

- Read-only AWS instance checks.
- Read-only DNS checks.
- Read-only public endpoint checks.
- Read-only SSH health checks on blue and green.
- Read-only SQLite integrity checks.
- Read-only Nginx log-redaction checks.
- Cutover/canary readiness assessment.

This record does not authorize or perform:

- DNS changes
- Blue mutation
- Green mutation
- Nginx mutation
- HTTPS issuance
- Service restart
- Production `.env` change
- Production node-config change
- Production tenant migration
- Green promotion
- Cutover
- Green cleanup or termination
- Secret, token, subscription URL, SQLite content, AWS credential, or customer
  data disclosure in PRs, docs, chat, or logs

## Baseline

Repository `master` at preflight time:

```text
e305c4fe88410323d364c94d34fb5b8d868be68a
```

Green deployed code commit:

```text
c53f7087fc30b340667d94e0523d094063972e0d
```

`e305c4f` is the docs-only PR #67 merge that records the green refresh.
Green is running the latest code-bearing commit from PR #66.

## AWS Read-Only Inventory

Blue:

```text
Instance ID: i-004ab1c6c71d06bca
Name: proxy-gateway-node-sg-blue-20260521
Public IP: 47.129.247.102
Private IP: 172.31.26.232
State: running
Instance type: t4g.small
Security group: sg-04a165ec77f430ee8
```

Green:

```text
Instance ID: i-0ad8676ee113d14cb
Name: proxy-gateway-node-sg-green-20260524
Public IP: 18.136.102.226
Private IP: 172.31.18.176
State: running
Instance type: t4g.small
Role: green-candidate
NoCutover: true
Security group: sg-06682c36aa03834f7
```

## DNS Read-Only Check

Using AliDNS public resolver `223.5.5.5`:

```text
sub.globalcirclecat.com -> 47.129.247.102 TTL 600
ss-sg.globalcirclecat.com -> 47.129.247.102 TTL 600
```

Conclusion:

```text
DNS still points to blue.
No DNS cutover has occurred.
```

## Public Boundary Checks

Blue:

```text
http://47.129.247.102/api/health -> 200
http://47.129.247.102/api/admin/subscriptions -> 404
http://47.129.247.102/sub/clash.yaml without token -> 401
http://47.129.247.102/ -> 404
47.129.247.102:18388 TCP -> reachable
```

Green:

```text
http://18.136.102.226/api/health -> 200
http://18.136.102.226/api/admin/subscriptions -> 404
http://18.136.102.226/sub/clash.yaml without token -> 401
http://18.136.102.226/ -> 404
18.136.102.226:18388 TCP -> reachable
```

## Local Runtime Checks

Blue:

```text
proxy-gateway-console.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
nginx: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
nginx -t -> ok
SQLite integrity_check -> ok
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
127.0.0.1:3456/sub/clash.yaml without token -> 401
deployed commit marker -> absent
```

Green:

```text
proxy-gateway-console.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
proxy-gateway-ss.service: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=23
nginx: ActiveState=active, SubState=running, Result=success, ExecMainStatus=0, NRestarts=0
nginx -t -> ok
SQLite integrity_check -> ok
127.0.0.1:3456/api/health -> 200
127.0.0.1:3456/api/admin/subscriptions without token -> 401
127.0.0.1:3456/sub/clash.yaml without token -> 401
deployed commit marker -> c53f7087fc30b340667d94e0523d094063972e0d
```

`proxy-gateway-ss.service` on green still shows the historical `NRestarts=23`
from initial green creation. It is currently active with successful status and
the count did not increase during the green refresh or this preflight.

## Nginx Log-Redaction Checks

Blue:

```text
nginx -T literal $request_uri occurrences -> 0
active access_log path -> /var/log/nginx/access.log
access log token query count -> 0
```

Green:

```text
nginx -T literal $request_uri occurrences -> 0
active access_log path -> /var/log/nginx/access.log
access log token query count -> 0
```

No raw access-log lines were copied into this record.

## Readiness Assessment

Health readiness:

```text
Blue health: ok
Green health: ok
DNS still-blue check: ok
Green current code-bearing commit: ok
Public boundary parity: ok
Nginx token-query log check: ok
```

Immediate cutover readiness:

```text
Ready to request immediate cutover: no
```

Blocking reasons:

- Green SQLite data was restored during green creation and was not refreshed in
  this read-only preflight. A cutover request still needs a fresh blue SQLite
  backup and either a green restore or an explicit data-freshness decision.
- Blue has no `.deployed-commit` marker. Do not assume blue is running PR #66
  tenant node assignment API until a separate blue deployment check or blue
  runtime upgrade is performed.
- DNS cutover, HTTPS behavior, production runtime base URL, and node-host
  migration still require separate explicit Risk A approvals.

Canary readiness:

```text
Ready to request tenant-level production canary: no
```

Blocking reasons:

- Production `config/proxy-servers.json` still has not been changed to register
  green as a production node.
- Production tenant migration has not been approved.
- Blue runtime support for the PR #66 reassignment API is not confirmed by a
  deployed commit marker.

Ready next actions:

```text
Ready to request a cutover execution plan: yes
Ready to request a fresh green data refresh plan: yes
Ready to request green cleanup instead: yes
```

## Recommended Next Decision

Choose one path explicitly:

```text
1. Continue toward cutover:
   create a Risk A execution plan for fresh blue SQLite backup, green restore,
   final endpoint checks, DNS cutover, rollback, and post-cutover monitoring.

2. Continue toward tenant canary:
   first plan blue runtime upgrade/current-code verification and production
   node-config registration for green, then assign a controlled tenant.

3. Stop availability work for now:
   explicitly approve green cleanup to avoid long-running unused AWS cost and
   operational drift.
```

## Conclusion

The preflight confirms that blue and green are both healthy, green is a viable
current-code replacement candidate, and DNS still points to blue.

This preflight does not approve cutover. It narrows the next decision to:

```text
cutover execution plan vs tenant canary plan vs green cleanup
```
