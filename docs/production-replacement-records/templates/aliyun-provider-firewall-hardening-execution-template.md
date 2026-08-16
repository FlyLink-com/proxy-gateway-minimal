# Aliyun Provider Firewall Hardening Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_provider_firewall_hardening_execution_template
  superseded_by: null
  last_verified_at: 2026-08-16
  production_authority: false
```


Date: YYYY-MM-DD, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun provider-firewall hardening
Execution state: not-started | passed | failed | blocked | rolled-back
Production impact: none expected for this gate
Aliyun impact: provider firewall mutation after exact approval
AWS impact: none
DNS impact: none
Traffic impact: none
```

This template is for the execution record required by:

```text
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md
```

Do not create a completed execution record from this template until the exact
approval phrase has been provided and recorded.

## Agent / Task Routing

```text
Lead agent:
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Validation / CI
  Operator Lab
  Edge / Node Capacity
Reviewer:
Follow-up owner:
```

## Approval

Exact approval phrase received:

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
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
apply provider firewall rule changes needed to reach target posture
retain or scope SSH management access according to recorded source decision
retain, scope, or remove wg-home UDP according to recorded decision
run post-change reachability checks
record rollback instructions and rollback evidence
```

Not authorized:

```text
DNS change
Nginx public promotion
public Admin exposure
production authority transfer
state copy
SQLite restore/import
subscription output mutation
edge traffic
AWS mutation
service deployment
opening 3456 or 18080 publicly
opening 80 or 443 unless a separate public-boundary approval is explicitly in scope
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
operator repo commit:
operator working-tree status:
current provider firewall inbound summary:
exact rollback copy captured privately:
rollback copy storage label:
Aliyun host listener summary:
host UFW summary:
candidate app loopback health:
candidate Nginx loopback health:
SSH management source decision:
wg-home keep / scope / remove decision:
HP public check 80:
HP public check 443:
HP public check 3456:
HP public check 18080:
HP selected lab-port checks:
AliDNS subscription records summary:
```

Do not paste raw provider rule data into this public record if it contains
management source labels, account details, keys, or other sensitive values.
Keep the exact rollback copy private and record only its storage label here.

## Pre-Change Rollback Plan

```text
rollback method:
rollback copy verified privately: yes | no
expected rollback effect:
SSH management reachability preservation plan:
post-rollback checks planned:
```

## Firewall Mutation

Safe summary only:

```text
mutation attempted: yes | no
mutation result:
SSH rule outcome:
80/tcp outcome:
443/tcp outcome:
3456/tcp outcome:
18080/tcp outcome:
51820/udp wg-home outcome:
broad TCP/UDP range outcome:
legacy or unrelated lab port outcome:
raw rule content printed: no
```

## Post-Change Validation Evidence

```text
post-change provider firewall inbound summary:
SSH management reachability from approved source:
candidate app loopback health:
candidate Nginx loopback health:
HP public check 80:
HP public check 443:
HP public check 3456:
HP public check 18080:
wg-home public behavior according to decision:
AliDNS unchanged:
```

## Rollback Evidence

Complete only if rollback was needed.

```text
rollback attempted:
rollback result:
provider firewall restored to recorded copy:
SSH management reachability:
candidate app loopback health:
candidate Nginx loopback health:
AliDNS unchanged:
post-rollback HP public checks:
```

## Not Performed

```text
DNS change: not performed
Nginx public promotion: not performed
public Admin exposure: not performed
production authority transfer: not performed
state copy: not performed
SQLite restore/import: not performed
subscription output mutation: not performed
edge traffic: not performed
AWS mutation: not performed
service deployment: not performed
opening 3456 or 18080 publicly: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed | failed | blocked | rolled-back
effective inbound public posture:
wg-home decision and resulting exposure:
next gate recommendation:
operator follow-up required:
```

## Sensitive Output Audit

Confirm the execution record contains none of:

```text
.env values
tokens
subscription URLs
private keys
WireGuard keys
SQLite rows
customer data
cloud credentials
raw provider firewall rollback copy
unredacted logs
```
