# Aliyun Aegis Service Repair Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_aegis_service_repair_execution_template
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Date: YYYY-MM-DD, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun Aegis service repair
Execution state: not-started | passed | failed | blocked | stopped-safely
Production impact: none expected for this gate
Aliyun impact: Aegis-only process/service mutation after exact approval
AWS impact: none
DNS impact: none
Traffic impact: none
```

This template is for the execution record required by:

```text
docs/production-replacement-records/2026-05-27-aliyun-aegis-service-repair-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-promotion-observation-aegis-readonly.md
```

Do not create a completed execution record from this template until the exact
approval phrase has been provided and recorded.

## Agent / Task Routing

```text
Lead agent:
Primary unit: Production Operations
Supporting units:
  Operator Lab
  Validation / CI
  Subscription Control Platform
Reviewer:
Follow-up owner:
```

## Approval

Exact approval phrase received:

```text
Approve Aliyun Aegis service repair. Allow Aegis-only process cleanup and service restart on the Aliyun host. No DNS change, no Nginx change, no proxy-gateway restart, no firewall change, no AWS mutation, no edge traffic, and stop if proxy-gateway health changes.
```

Approval source:

```text
operator message / PR comment / other durable approval source
```

Rejected as insufficient approval:

```text
short confirmations such as 同意 / 继续 / 开始 / ok / go
```

## Scope

Allowed after approval:

```text
Aegis-only process cleanup if required
systemctl reset-failed aegis.service
start or restart only aegis.service
Aegis status and process inspection
proxy-gateway health guard checks before and after each mutation group
stop if proxy-gateway health changes
record execution evidence
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
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
operator repo commit:
operator working-tree status:
promotion baseline record:
public health:
public Admin path:
public no-token subscription path:
AliDNS sub summary:
AliDNS ss-sg summary:
proxy-gateway-candidate status:
nginx status:
ufw status:
certbot.timer status:
nginx -t:
candidate SQLite integrity:
candidate SQLite safe aggregate counts:
aegis.service safe properties:
Aegis process summary:
Aegis unit safe summary:
Aegis recent journal safe pattern:
hard-stop checks passed before mutation: yes | no
```

## Pre-Repair Stop Plan

```text
health guard command summary:
stop condition if proxy-gateway health changes:
stop condition if public Admin becomes exposed:
stop condition if DNS/firewall/Nginx drift is observed:
actions explicitly out of scope:
```

## Repair Mutation

Safe summary only:

```text
mutation attempted: yes | no
reset-failed attempted:
start/restart attempted:
Aegis-only process cleanup attempted:
package reinstall attempted: no
Aegis disablement attempted: no
host reboot attempted: no
mutation result:
reason if stopped early:
```

Do not paste raw secret-bearing logs or customer data into this public record.

## Post-Repair Validation Evidence

```text
aegis.service state:
Aegis process summary:
proxy-gateway-candidate status:
nginx status:
ufw status:
certbot.timer status:
nginx -t:
public health:
public Admin path:
public no-token subscription path:
public 3456:
public 18080:
AliDNS unchanged:
candidate SQLite integrity:
candidate SQLite safe aggregate counts:
```

## Stop / Failure Evidence

Complete if repair failed, was blocked, or stopped safely.

```text
repair stopped:
stop reason:
aegis.service final state:
Aegis process final summary:
proxy-gateway boundary final health:
public Admin final posture:
DNS unchanged:
Nginx/firewall/proxy-gateway unchanged:
operator follow-up required:
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
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed | failed | blocked | stopped-safely
Aegis final posture:
proxy-gateway boundary final posture:
next gate recommendation:
operator follow-up required:
```

## Sensitive Output Audit

Confirm the execution record contains none of:

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
