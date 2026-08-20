# Aliyun HP Management Source Firewall Execution Record


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_hp_management_source_firewall_execution
  superseded_by: null
  last_verified_at: 2026-05-27
  production_authority: false
```


Date: 2026-05-27, Asia/Shanghai.

## Status

```text
Type: Risk A execution record
Gate: Aliyun candidate provider-firewall management-source addition
Execution state: passed with follow-up for wg-home handshake
Production impact: none
Aliyun impact: provider firewall now also allows HP public /32 for management paths
AWS impact: none
DNS impact: none
Traffic impact: no user traffic
```

This record follows the already-hardened candidate posture from:

```text
docs/production-replacement-records/2026-05-27-aliyun-provider-firewall-hardening-execution.md
```

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Operator Lab
  Validation / CI
  Subscription Control Platform
Follow-up owner: Production Operations Agent
Follow-up suitability: high for HP-to-Aliyun management validation and wg-home
```

## Approval

Approval basis:

```text
The operator clarified that the current Aliyun candidate is not online and
candidate-environment operations are approved as test operations. The previous
handoff identified adding HP as an Aliyun provider-firewall management source
as the next candidate-environment step.
```

This execution did not treat the following as approved:

```text
DNS change
public 80/443 boundary opening
public Admin exposure
production authority transfer
state copy
SQLite restore/import
subscription output mutation
edge traffic activation
AWS mutation
service deployment
opening 3456 or 18080 publicly
user traffic
copying SSH keys or cloud credentials to HP
```

## Fresh Read-Only Preflight Evidence

Record only safe metadata.

```text
repo branch: codex/aliyun-clean-start-private-validation
PR: #196
PR state before execution: ready / mergeable
Aliyun instance state: Running
Aliyun provider firewall before this execution:
  22/tcp: current operator management /32 only
  51820/udp: current operator management /32 only
HP host: hp-server reachable through the approved HP SSH key
HP public source: resolved to a single IPv4 and used only as /32
candidate app loopback health before follow-up: HTTP 200
candidate Nginx loopback health before follow-up: HTTP 200
candidate services: proxy-gateway-candidate, nginx, ufw active
```

## Executed Provider Firewall Changes

```text
22/tcp: added HP public /32 as a separate management source
51820/udp: added HP public /32 as a separate wg-home lab source
existing current operator management /32 rules: preserved
```

Implementation note:

```text
The create-firewall-rule call accepted the source parameter but initially
created broad 0.0.0.0/0 rules for the two new entries. This was detected in
the immediate post-create provider-firewall listing and corrected in the same
execution by modifying both new rules to HP public /32 before final validation.
The final provider-firewall state has no broad 0.0.0.0/0 entries.
```

## Post-Change Provider Firewall Summary

```text
22/tcp:
  current operator management /32
  HP public /32
51820/udp:
  current operator management /32
  HP public /32
public 80/443/3456/18080:
  still closed at provider boundary
broad TCP/UDP ranges:
  absent
```

## Post-Change Validation

```text
provider firewall final state: scoped rules only; no broad 0.0.0.0/0 entries
HP to Aliyun TCP/22 reachability: open
HP to Aliyun UDP/51820 reachability: packet observed at Aliyun host with tcpdump
Aliyun wg-home service: active
HP wg-home service: active
HP wg-home logical handshake: not refreshed during this record
candidate app loopback health: HTTP 200
candidate Nginx loopback health: HTTP 200
proxy-gateway-candidate service: active
nginx service: active
ufw service: active
```

The HP WireGuard logical tunnel did not refresh its handshake in this record.
The provider firewall no longer appears to be the blocker because Aliyun
tcpdump observed UDP/51820 packets arriving from HP. Treat wg-home handshake
repair as a separate operator-lab follow-up if that path is required.

## Rollback

Rollback for this specific follow-up:

```text
delete the HP public /32 22/tcp provider-firewall rule
delete the HP public /32 51820/udp provider-firewall rule
preserve the existing current operator management /32 rules
verify current operator SSH reachability
verify candidate app and Nginx loopback health
verify provider firewall has no broad 0.0.0.0/0 entries
```

Rollback must not require DNS changes, AWS node restart, source-state copy, or
production traffic movement.

## Not Performed

```text
DNS change: not performed
public 80/443 boundary opening: not performed
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
user traffic: not performed
SSH key or cloud credential copy to HP: not performed
secret/token/subscription URL/customer data handling: not performed
```

## Final Decision

```text
gate result: passed for adding HP as a scoped provider-firewall management source
effective inbound public posture: current operator /32 and HP /32 for 22/tcp and 51820/udp only
HP management status: TCP/22 reachable from HP
wg-home status: UDP reaches Aliyun from HP, but WireGuard logical handshake remains stale
next gate recommendation: keep public-boundary dry run separate; investigate wg-home only if HP needs the tunnel path rather than SSH/TCP management reachability
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
exact management source IPs
unredacted logs
```
