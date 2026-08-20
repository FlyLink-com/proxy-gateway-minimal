# Aliyun Provider Firewall Hardening Runbook


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_provider_firewall_hardening_runbook
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

This record defines the provider-firewall hardening gate required before any
Aliyun public-boundary dry run. It does not execute firewall changes and does
not authorize public exposure by itself.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Validation / CI
  Operator Lab
  Edge / Node Capacity
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for a dedicated A-tier ops agent after
operator approval
```

## Purpose

Reduce Aliyun provider-level inbound rules to a least-privilege posture before
any public subscription boundary is prepared.

Gate A found that host UFW currently blocks most public paths, but the provider
firewall posture is too broad for promotion planning. Host UFW must not be the
only safety boundary for future public-boundary work.

## Required Approval Phrase

```text
Approve Aliyun provider firewall hardening. Restrict inbound to documented management and approved public-boundary ports only. No DNS change, no Nginx public promotion, no production authority transfer, no state copy, no user traffic, no edge traffic, and rollback by restoring the recorded provider firewall rules.
```

Do not infer approval from shorter conversational confirmations.

## Fresh Read-Only Preflight

Before mutation, the execution record must capture safe metadata for:

```text
operator repo commit and working-tree status
Aliyun provider firewall current inbound rules
exact rollback copy of the current provider firewall rules
Aliyun host listener summary
host UFW status summary
candidate app health on loopback
candidate Nginx health on loopback
management source decision for SSH
wg-home keep / scope / remove decision
HP-side public checks for Aliyun 80/443/3456/18080 and selected lab ports
AliDNS current subscription records
```

The preflight must not print:

```text
.env values
tokens
subscription URLs
private keys
WireGuard keys
SQLite rows
customer data
cloud credentials
```

## Target Provider Firewall Posture

The exact provider rule syntax is provider-specific and must be recorded in the
execution evidence. The target posture is:

```text
22/tcp:
  allow only documented operator management sources

3456/tcp:
  public closed
  loopback-only app remains local to the host

18080/tcp:
  public closed
  loopback-only candidate Nginx remains local to the host

80/tcp and 443/tcp:
  closed until the later public-boundary dry-run gate explicitly approves them
  if approved later, only subscription public boundary may be exposed

51820/udp:
  keep, scope, or remove only after the wg-home role decision is recorded

broad TCP/UDP ranges:
  remove unless explicitly justified by another approved runbook

legacy or unrelated lab ports:
  remove unless explicitly justified by another approved runbook
```

## Allowed After Approval

Only these actions are allowed after the exact approval phrase:

```text
apply provider firewall rule changes needed to reach the target posture
retain or scope SSH management access according to the recorded source decision
retain, scope, or remove wg-home UDP only according to the recorded decision
run post-change reachability checks
record rollback instructions and rollback evidence
```

## Forbidden In This Gate

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
opening 80 or 443 unless this same gate is explicitly expanded and approved as
a public-boundary dry run
raw sensitive output in logs or docs
```

Prefer keeping public-boundary dry run as a separate later gate. If 80/443 must
be opened in the same maintenance window, the execution record must explicitly
state that expanded scope and include the public-boundary approval phrase too.

## Post-Change Validation Required

The execution record must include:

```text
approval phrase
pre-change provider firewall rollback copy
post-change provider firewall inbound summary
SSH management reachability from approved source
candidate app loopback health
candidate Nginx loopback health
HP-side public checks showing 3456 and 18080 closed
HP-side public checks showing 80 and 443 closed unless a separate public-boundary
approval is in scope
wg-home public behavior according to the recorded keep/scope/remove decision
AliDNS unchanged
explicit "not performed" list
```

## Rollback

Rollback is:

```text
restore the exact provider firewall rules recorded before mutation
verify SSH management reachability
verify candidate loopback health
verify DNS unchanged
record post-rollback public checks
```

Rollback must not require DNS changes, AWS node restart, source-state copy, or
production traffic movement.

## Completion Criteria

The gate is complete only when the execution record states:

```text
provider firewall hardening passed / failed / rolled back / blocked
effective inbound public posture
wg-home decision and resulting exposure
next gate recommendation
no DNS change
no Nginx public promotion
no production authority transfer
no state copy
no user traffic
no edge traffic
```

## Current PR Not Performed

This repo-only PR does not perform:

```text
Aliyun SSH or cloud command execution
provider firewall mutation
UFW mutation
Nginx mutation
DNS change
AWS mutation
state copy
traffic movement
secret, token, subscription URL, key, or customer-data handling
```
