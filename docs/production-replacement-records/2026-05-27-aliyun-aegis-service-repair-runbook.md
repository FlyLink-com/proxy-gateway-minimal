# Aliyun Aegis Service Repair Runbook


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_aegis_service_repair_runbook
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution gate runbook
Current PR scope: C / repo-only documentation
Production impact in this PR: none
Aliyun impact in this PR: none
AWS impact in this PR: none
DNS impact in this PR: none
Traffic impact in this PR: none
```

This runbook defines the optional Aegis repair gate after the Aliyun
subscription-distribution promotion. It does not execute process cleanup,
service restart, package reinstall, disablement, or vendor-agent repair by
itself.

Source diagnosis:

```text
docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Operator Lab
  Validation / CI
  Subscription Control Platform
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for a dedicated A-tier ops agent after
operator approval
```

## Purpose

Repair only the Aliyun host security-agent service state while preserving the
working proxy-gateway subscription boundary.

The read-only diagnosis found:

```text
aegis.service: failed
Aegis updater/client/monitor processes: present
proxy-gateway-candidate: active
nginx: active
ufw: active
certbot.timer: active
public subscription health: stable
public Admin: blocked
```

The suspected class is an Aliyun security-agent unit/startup state
inconsistency after package/service handling during certbot installation. This
gate must not treat Aegis repair as permission to mutate subscription, DNS,
Nginx, firewall, edge, AWS, tenant, artifact, or customer state.

## Required Approval Phrase

```text
Approve Aliyun Aegis service repair. Allow Aegis-only process cleanup and service restart on the Aliyun host. No DNS change, no Nginx change, no proxy-gateway restart, no firewall change, no AWS mutation, no edge traffic, and stop if proxy-gateway health changes.
```

Do not infer approval from shorter confirmations such as:

```text
同意
继续
开始
ok
go
```

## Fresh Read-Only Preflight

Before any mutation, capture only safe metadata:

```text
operator repo commit and working-tree status
latest promotion record baseline
public health/Admin/no-token status
AliDNS sub and ss-sg summary
proxy-gateway-candidate/nginx/ufw/certbot.timer status
nginx config test result
candidate SQLite integrity and aggregate counts
aegis.service safe systemd properties
Aegis process list summary
Aegis unit file safe summary
recent Aegis journal safe tail
rollback/stop decision if proxy-gateway health changes
```

Do not print or record:

```text
.env values
tokens
subscription URLs
YAML output
private keys
cloud credentials
SQLite row dumps
customer data
exact management source IPs
unredacted secret-bearing logs
```

## Allowed After Approval

Only these actions are allowed after the exact approval phrase:

```text
stop or kill only Aegis/AliYunDun processes if needed to clear the failed unit
run systemctl reset-failed aegis.service
start or restart only aegis.service
inspect Aegis status and process state after restart
run proxy-gateway health guard checks before and after each mutation group
stop immediately if proxy-gateway, Nginx, UFW, DNS, or public boundary health changes
record execution evidence and rollback/stop outcome
```

Prefer the smallest repair sequence:

```text
1. Baseline health checks.
2. systemctl reset-failed aegis.service.
3. systemctl start aegis.service.
4. If the same leftover-process failure repeats, stop and request operator
   confirmation before killing Aegis processes.
5. If explicitly still in scope, terminate only the stuck Aegis/AliYunDun
   process group, then start aegis.service once.
6. Validate proxy-gateway and Aegis state.
```

## Hard Stops

Stop immediately and do not continue repair if any of these occur:

```text
public health is not HTTP 200
public Admin is not blocked
no-token subscription refresh is not HTTP 401
nginx config test fails
proxy-gateway-candidate is inactive
nginx is inactive
ufw is inactive
AliDNS changes unexpectedly
3456 or 18080 becomes publicly reachable
the repair would require package reinstall or vendor download
the repair would require disabling Aegis
the repair would require reboot
the repair would require Nginx/firewall/DNS/proxy-gateway mutation
```

Package reinstall, Aegis disablement, vendor scripts, or reboot are not covered
by this gate and require a separate approval.

## Forbidden In This Gate

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
raw sensitive output in logs or docs
```

## Post-Repair Validation Required

The execution record must include:

```text
exact approval phrase
pre-repair public boundary checks
pre-repair service status summary
pre-repair Aegis safe diagnosis
mutation steps attempted
post-repair Aegis service state
post-repair Aegis process summary
post-repair proxy-gateway-candidate status
post-repair nginx status and nginx -t
post-repair ufw status
post-repair public health/Admin/no-token status
post-repair public 3456/18080 checks
AliDNS unchanged summary
SQLite integrity and safe aggregate counts
explicit not-performed list
sensitive-output audit
```

## Rollback / Stop Posture

There is no broad rollback for a vendor security-agent repair beyond stopping
the attempted repair and preserving the working subscription boundary.

If Aegis repair fails:

```text
leave proxy-gateway-candidate, nginx, ufw, certbot.timer, DNS, and public
subscription boundary unchanged
record Aegis final failed state
record public boundary validation
do not retry with reinstall, disablement, or reboot without separate approval
```

If proxy-gateway health changes during repair:

```text
stop Aegis repair immediately
do not mutate DNS, Nginx, firewall, or proxy-gateway unless a separate incident
approval is received
record the observed health change and current service states
```

## Completion Criteria

The gate is complete only when a dated execution record states one of:

```text
Aegis service repair passed
Aegis service repair failed and stopped safely
Aegis service repair blocked before mutation
Aegis service repair rolled back to no-further-action posture
```

It must also state:

```text
proxy-gateway boundary remains healthy or the exact observed failure
public Admin remains blocked
edge traffic remains inactive
DNS unchanged
Nginx unchanged
firewall unchanged
AWS unchanged
no secrets/tokens/subscription URLs/customer data recorded
```

## Current PR Not Performed

This repo-only PR does not perform:

```text
Aliyun SSH command execution
Aegis process cleanup
Aegis restart
Aegis reinstall or disablement
host reboot
Nginx mutation
proxy-gateway restart
UFW or provider firewall mutation
DNS change
AWS mutation
tenant/artifact mutation
edge traffic activation
secret, token, subscription URL, key, .env, or customer-data handling
```
