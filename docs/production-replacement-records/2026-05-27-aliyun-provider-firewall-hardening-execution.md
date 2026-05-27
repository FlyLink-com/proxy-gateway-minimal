# Aliyun Provider Firewall Hardening Execution Record

Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun provider firewall hardening
Execution state: passed
Production impact: none
Aliyun impact: provider firewall inbound rules hardened for the private candidate
AWS impact: none
DNS impact: none
Traffic impact: none
```

This execution record follows:

```text
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-runbook.md
docs/production-replacement-records/2026-05-27-aliyun-next-a-tier-execution-packet.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Validation / CI
  Operator Lab
  Edge / Node Capacity
Reviewer: Sidecar Reviewer recommended before public-boundary dry run
Follow-up owner: Production Operations Agent
```

## Approval

Approval basis:

```text
The operator clarified that the current Aliyun candidate is not online and
candidate-environment operations are approved as test operations, while DNS,
public service exposure, user traffic, production authority, AWS mutation, and
irreversible cloud-resource deletion still require separate approval.
```

This record did not treat the following as approved:

```text
DNS change
Nginx public promotion
public Admin exposure
production authority transfer
state copy
SQLite restore/import
subscription output mutation
edge traffic activation
AWS mutation
service deployment
opening 3456 or 18080 publicly
opening 80 or 443
user traffic
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
operator repo commit: 2b77cb9f current PR branch before this record update
operator working-tree status: clean before provider-firewall execution
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
candidate SQLite integrity_check: ok
proxy-gateway-candidate service: active
nginx service: active
ufw service: active
host listener summary: public SSH only; candidate app 127.0.0.1:3456; candidate Nginx 127.0.0.1:18080; existing wg-home UDP 51820 preserved
AliDNS subscription records summary: sub.globalcirclecat.com and ss-sg.globalcirclecat.com unchanged, still pointing to the old AWS address with TTL 600 and ENABLE status
management source decision: restrict provider SSH to the current operator management /32 observed from the active SSH connection
wg-home decision: keep existing wg-home lab UDP 51820, scoped to the same current operator management /32
HP public check before this gate: 80/443/3456/18080 closed_or_timeout; HP was not selected as a provider-firewall management source
```

Do not paste raw command output if it contains sensitive values. Summarize.

## Pre-Change Provider Firewall Rollback Copy

Exact pre-change provider firewall summary:

```text
80/tcp: accept from 0.0.0.0/0
443/tcp: accept from 0.0.0.0/0
22/tcp: accept from 0.0.0.0/0
3128/tcp: accept from 0.0.0.0/0
1-65535/udp: accept from 0.0.0.0/0
1194/tcp: accept from 0.0.0.0/0
1-65535/tcp+udp: accept from 0.0.0.0/0
```

Rollback copy includes the source CIDR, protocol, port, policy, and safe rule
labels needed to restore the previous posture. It does not include cloud
credentials.

## Executed Provider Firewall Changes

```text
22/tcp: changed from 0.0.0.0/0 to the current operator management /32
51820/udp: added for existing wg-home lab path, scoped to the current operator management /32
80/tcp: removed
443/tcp: removed
3128/tcp: removed
1194/tcp: removed
1-65535/udp: removed
1-65535/tcp+udp: removed
```

Notable behavior:

```text
SSH remained reachable from the approved current operator management source
after scoping 22/tcp.
HP-side SSH to Aliyun is now closed because HP was not selected as an approved
provider-firewall management source for this gate.
```

## Post-Change Provider Firewall Summary

```text
22/tcp: accept from current operator management /32
51820/udp: accept from current operator management /32
```

Effective inbound posture:

```text
3456/tcp: provider closed
18080/tcp: provider closed
80/tcp: provider closed
443/tcp: provider closed
3128/tcp: provider closed
1194/tcp: provider closed
broad TCP/UDP ranges: removed
```

## Post-Change Validation

```text
SSH management reachability from approved source: passed
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
candidate SQLite integrity_check: ok
proxy-gateway-candidate service: active
nginx service: active
ufw service: active
HP-side public check 80: closed_or_timeout
HP-side public check 443: closed_or_timeout
HP-side public check 3456: closed_or_timeout
HP-side public check 18080: closed_or_timeout
HP-side public check 22: closed_or_timeout because HP is not an approved management source
AliDNS unchanged: yes
```

## Rollback

Rollback is:

```text
restore 80/tcp from 0.0.0.0/0
restore 443/tcp from 0.0.0.0/0
restore 22/tcp from 0.0.0.0/0
restore 3128/tcp from 0.0.0.0/0
restore 1-65535/udp from 0.0.0.0/0
restore 1194/tcp from 0.0.0.0/0
restore 1-65535/tcp+udp from 0.0.0.0/0
remove the scoped 51820/udp rule if restoring the exact old provider posture
verify SSH management reachability
verify candidate app and Nginx loopback health
verify DNS unchanged
record post-rollback public checks
```

Rollback must not require DNS changes, AWS node restart, source-state copy, or
production traffic movement.

## Not Performed

```text
DNS change: not performed
Nginx public promotion: not performed
public Admin exposure: not performed
production authority transfer: not performed
state copy: not performed
SQLite restore/import: not performed
subscription output mutation: not performed
edge traffic activation: not performed
AWS mutation: not performed
service deployment: not performed
opening 3456 or 18080 publicly: not performed
opening 80 or 443: not performed
user traffic: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed
effective inbound public posture: only current operator management /32 for 22/tcp and 51820/udp; public 80/443/3456/18080 closed
wg-home decision and resulting exposure: keep wg-home UDP 51820 but scope it to the current operator management /32
next gate recommendation: public-boundary dry run only after explicit approval to open 80/443 and validate Nginx public subscription boundary
operator follow-up required: yes, choose whether HP should be added as a separate approved management source before HP needs SSH/WireGuard access to Aliyun again
```

## Sensitive Output Audit

The execution record contains none of:

```text
.env values
tokens
subscription URLs
private keys
WireGuard keys
SQLite rows
customer data
cloud credentials
unredacted logs
```
