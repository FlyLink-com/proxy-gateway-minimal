# Aliyun Aegis Service Repair Execution Record

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun Aegis service repair
Execution state: failed and stopped safely
Production impact: none observed
Aliyun impact: Aegis-only reset/start and process-cleanup attempts after exact approval
AWS impact: none
DNS impact: none
Traffic impact: none
```

This execution followed:

```text
docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-preflight.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Operator Lab
  Validation / CI
  Subscription Control Platform
Reviewer: operator follow-up if a vendor-agent repair escalation is desired
Follow-up owner: Production Operations Agent
```

## Approval

Exact approval phrase received:

```text
Approve Aliyun Aegis service repair. Allow Aegis-only process cleanup and service restart on the Aliyun host. No DNS change, no Nginx change, no proxy-gateway restart, no firewall change, no AWS mutation, no edge traffic, and stop if proxy-gateway health changes.
```

Short confirmations were not treated as sufficient approval before this
message.

## Scope

Allowed and attempted:

```text
systemctl reset-failed aegis.service
start only aegis.service
Aegis-only process cleanup attempt
Aegis status and process inspection
proxy-gateway health guard checks before and after mutation groups
```

Not authorized:

```text
DNS change
provider firewall mutation
UFW mutation
Nginx config mutation
proxy-gateway restart
certbot mutation
public Admin exposure
edge traffic activation
AWS mutation
state copy
SQLite restore/import
tenant/artifact mutation
subscription output mutation
package reinstall
Aegis disablement
host reboot
vendor-agent download or reinstall script
```

## Fresh Read-Only Preflight Evidence

Repository:

```text
operator repo baseline: master...origin/master at Merge PR #218
open PRs before execution: none
```

Public subscription-boundary checks with SNI pinned to the Aliyun boundary:

```text
https /api/health: 200
https /api/admin/subscriptions: 404
https /: 404
https /sub/clash.yaml without token: 401
http /api/health: 200
```

AliDNS:

```text
sub.globalcirclecat.com: A 47.251.178.125 TTL 600 ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159 TTL 600 ENABLE
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

Aliyun host service summary before repair:

```text
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
aegis.service: failed
nginx -t: ok
```

SQLite safe aggregate summary:

```text
subscriptions.sqlite integrity_check: ok
tenant_total: 1
tenant_status_disabled: 1
artifact_total: 0
```

Aegis safe diagnosis:

```text
ActiveState: failed
SubState: failed
Result: signal
NRestarts: 0
Aegis process count: 3 known Aegis/AliYunDun processes before cleanup
recent journal pattern: leftover AliYunDunUpdate process remained after unit stop
```

Hard-stop checks passed before mutation:

```text
public health: 200
public Admin: 404
no-token subscription refresh: 401
nginx -t: ok
proxy-gateway-candidate/nginx/ufw active: yes
private 3456/18080 externally closed from HP: yes
```

## Pre-Repair Stop Plan

```text
health guard:
  public health must stay 200
  public Admin must stay 404
  no-token subscription refresh must stay 401
stop if:
  proxy-gateway health changes
  public Admin becomes exposed
  DNS/firewall/Nginx/proxy-gateway drift is observed
out of scope:
  package reinstall, Aegis disablement, host reboot, Nginx/firewall/DNS/proxy-gateway mutation
```

## Repair Mutation

First mutation group:

```text
pre-mutation health guard: health=200 admin=404 no-token=401
systemctl reset-failed aegis.service: rc=0
systemctl start aegis.service: rc=1
post-start aegis.service: failed / signal
post-start services: proxy-gateway-candidate, nginx, ufw, certbot.timer active; aegis failed
post-start health guard: health=200 admin=404 no-token=401
```

Process cleanup attempt:

```text
candidate Aegis/AliYunDun processes identified: 3
TERM attempted against Aegis/AliYunDun processes: yes
remaining after TERM: 3
KILL attempted against remaining Aegis/AliYunDun processes: yes
remaining after KILL: 3
targeted kill -9 test against one Aegis updater process: failed with Operation not permitted
```

Second start attempt after cleanup:

```text
post-cleanup health guard: health=200 admin=404 no-token=401
systemctl reset-failed aegis.service: rc=0
systemctl start aegis.service: rc=1
post-repair services: proxy-gateway-candidate, nginx, ufw, certbot.timer active; aegis failed
post-repair aegis.service: failed / signal
post-repair health guard: health=200 admin=404 no-token=401
```

Mutation result:

```text
result: failed and stopped safely
reason: Aegis/AliYunDun processes could not be terminated within this gate;
  targeted kill returned Operation not permitted, and package reinstall,
  disablement, vendor repair scripts, or host reboot are out of scope.
```

## Post-Repair Validation Evidence

Public subscription-boundary checks:

```text
https /api/health: 200
https /api/admin/subscriptions: 404
https /: 404
https /sub/clash.yaml without token: 401
http /api/health: 200
```

HP external network checks:

```text
47.251.178.125:80: open
47.251.178.125:443: open
47.251.178.125:3456: closed_or_timeout
47.251.178.125:18080: closed_or_timeout
13.215.156.159:18388: closed_or_timeout
```

AliDNS unchanged:

```text
sub.globalcirclecat.com: A 47.251.178.125 TTL 600 ENABLE
ss-sg.globalcirclecat.com: A 13.215.156.159 TTL 600 ENABLE
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

SQLite safe aggregate summary:

```text
subscriptions.sqlite integrity_check: ok
tenant_total: 1
tenant_status_disabled: 1
artifact_total: 0
```

Aegis final posture:

```text
ActiveState: failed
SubState: failed
Result: signal
NRestarts: 0
known Aegis/AliYunDun processes: still present
```

## Stop / Failure Evidence

```text
repair stopped: yes
stop reason: Aegis-only cleanup/start failed; further repair would require
  actions outside this gate
aegis.service final state: failed
proxy-gateway boundary final health: 200
public Admin final posture: 404 blocked
DNS unchanged: yes
Nginx/firewall/proxy-gateway unchanged: yes
operator follow-up required: only if package reinstall, vendor-agent repair,
  Aegis disablement, or host reboot is desired under a separate approval
```

## Not Performed

```text
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
package reinstall: not performed
Aegis disablement: not performed
host reboot: not performed
vendor-agent download or reinstall script: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: failed and stopped safely
Aegis final posture: service remains failed; Aegis/AliYunDun processes remain present
proxy-gateway boundary final posture: healthy and unchanged
next gate recommendation: leave as tracked security-agent failure unless the
  operator separately approves a broader vendor-agent repair path
operator follow-up required: no for subscription distribution; yes only for
  deeper Aegis vendor-agent remediation
```

## Sensitive Output Audit

This record contains none of:

```text
.env values
tokens
subscription URLs
YAML output
passwords
private keys
cloud credentials
SQLite row dumps
customer data
exact management source IPs
unredacted secret-bearing logs
```
