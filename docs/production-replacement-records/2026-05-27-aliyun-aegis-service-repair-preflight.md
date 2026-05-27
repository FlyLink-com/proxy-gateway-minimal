# Aliyun Aegis Service Repair Preflight

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A read-only preflight record
Repository change: C / docs-only record
Execution state: repair blocked until exact approval phrase
Production impact: none
Aliyun impact: read-only status checks only
AWS impact: none
DNS impact: none
Traffic impact: no user or edge traffic mutation
```

This preflight refreshes the current evidence for the optional Aegis repair
gate defined in:

```text
docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md
```

No repair mutation was performed. Short confirmations such as `同意`, `继续`,
`开始`, `ok`, or `go` are still insufficient for this gate.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Operator Lab
  Subscription Control Platform
  Validation / CI
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for exact-phrase Aegis-only repair execution
```

## Approval State

Exact approval phrase required before any Aegis process cleanup or service
restart:

```text
Approve Aliyun Aegis service repair. Allow Aegis-only process cleanup and service restart on the Aliyun host. No DNS change, no Nginx change, no proxy-gateway restart, no firewall change, no AWS mutation, no edge traffic, and stop if proxy-gateway health changes.
```

This phrase has not been received for this preflight record.

## Fresh Read-Only Evidence

Repository state:

```text
branch before docs-only record: master...origin/master
open PRs before docs-only record: none
```

Authoritative AliDNS summary:

```text
sub.globalcirclecat.com: A 47.251.178.125 TTL 600 ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159 TTL 600 ENABLE
```

Public subscription-boundary checks with SNI pinned to the Aliyun boundary:

```text
https /api/health: 200
https /api/admin/subscriptions: 404
https /: 404
https /sub/clash.yaml without token: 401
http /api/health: 200
```

HP external network checks:

```text
https /api/health: 200
https /api/admin/subscriptions: 404
https /sub/clash.yaml without token: 401
47.251.178.125:80: open
47.251.178.125:443: open
47.251.178.125:3456: closed_or_timeout
47.251.178.125:18080: closed_or_timeout
13.215.156.159:18388: closed_or_timeout
```

Aliyun host service summary:

```text
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
aegis.service: failed
nginx -t: ok
```

Aliyun host listener summary:

```text
0.0.0.0:80: listening
0.0.0.0:443: listening
127.0.0.1:3456: listening
127.0.0.1:18080: listening
```

SQLite safe aggregate summary:

```text
subscriptions.sqlite integrity_check: ok
tenant_total: 1
tenant_status_disabled: 1
artifact_total: 0
```

Aegis systemd safe summary:

```text
ActiveState: failed
SubState: failed
Result: signal
NRestarts: 0
FragmentPath: /etc/systemd/system/aegis.service
Aegis process count matching safe patterns: 5
```

Safe journal summary:

```text
aegis.service start attempts exited by signal
systemd reports a leftover AliYunDunUpdate process after unit stop
systemd reports leftover process while starting the unit
```

## Preflight Decision

```text
public subscription boundary: healthy
public Admin: blocked
no-token subscription refresh: blocked with 401
private 3456 and 18080: not externally reachable from HP
edge data-plane: not activated
Aegis repair need: still present
repair execution: blocked until exact approval phrase
```

The evidence still supports the smallest repair sequence from the runbook:

```text
1. Baseline health checks.
2. systemctl reset-failed aegis.service.
3. systemctl start aegis.service.
4. If the leftover-process failure repeats, stop and request operator
   confirmation before killing Aegis processes.
5. If explicitly still in scope, terminate only the stuck Aegis/AliYunDun
   process group, then start aegis.service once.
6. Validate proxy-gateway and Aegis state.
```

## Not Performed

```text
Aegis process cleanup: not performed
Aegis service restart: not performed
package reinstall: not performed
Aegis disablement: not performed
host reboot: not performed
DNS change: not performed
provider firewall mutation: not performed
UFW mutation: not performed
Nginx config mutation: not performed
proxy-gateway restart: not performed
certbot mutation: not performed
public Admin exposure: not performed
edge traffic activation: not performed
AWS mutation: not performed
state copy: not performed
SQLite restore/import: not performed
tenant/artifact mutation: not performed
subscription output mutation: not performed
```

## Sensitive Output Audit

This record contains none of:

```text
raw subscription URLs
tokens
passwords
private keys
cloud credentials
customer data
production .env values
SQLite row dumps
unredacted logs
exact management source IPs
raw provider firewall rollback copies
```
