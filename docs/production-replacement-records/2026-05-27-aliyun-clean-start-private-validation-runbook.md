# Aliyun Clean-Start Private Validation Runbook


```yaml
document_metadata:
  doc_type: evidence
  lifecycle: historical
  authority_scope: aliyun_clean_start_private_validation_runbook
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

This record defines the next private validation gate for the Aliyun clean-start
subscription control-plane path. It does not execute the gate and does not
authorize Aliyun runtime mutation by itself.

## Agent / Task Routing

```text
Lead agent: Codex
Primary unit: Production Operations
Supporting units:
  Subscription Control Platform
  Subscription Access Control
  Validation / CI
  Edge / Node Capacity
Recommended next owner: Production Operations Agent
Follow-up agent suitability: high for a dedicated A-tier ops agent after
operator approval
```

## Purpose

Validate Aliyun as a clean-start subscription-control candidate without copying
historical AWS subscription, artifact, legacy query-token, or subscription
output state.

The validation should prove only this:

```text
Aliyun candidate can initialize clean-start control-plane state privately.
Aliyun candidate can render subscription output privately.
Protected Admin access remains protected.
Candidate state can be backed up, rolled back, or cleaned up.
No public traffic or production authority is moved.
```

## Prerequisites

All of these must be true before requesting execution approval:

```text
PR #178 clean-start repo package is merged into the validated baseline.
Fresh Gate A live inventory exists for Aliyun, DNS, HP public checks, and the
operator repo checkout.
Candidate app and loopback Nginx are healthy in fresh read-only evidence.
Candidate SQLite integrity check is ok in fresh read-only evidence.
Provider-firewall hardening is scheduled before any public-boundary dry run.
The operator accepts clean-start authority for this private validation gate.
Rollback or cleanup decision for candidate-only state is written before
mutation.
No historical AWS source state is required for this gate.
```

## Required Approval Phrase

```text
Approve Aliyun clean-start private validation. Allow candidate-only clean-start state initialization and private rendering checks on Aliyun. No DNS change, no public listener exposure, no public Admin, no edge traffic, no AWS mutation, and no historical state copy.
```

Do not infer approval from shorter conversational confirmations.

## Fresh Read-Only Preflight

The execution record must refresh and record only safe metadata for:

```text
operator repo commit and working-tree status
Aliyun host identity and OS summary
candidate app health on loopback
candidate Nginx health on loopback
host listener summary
UFW status summary
provider firewall posture summary
candidate SQLite integrity_check result without row dumps
candidate backup presence by filename/metadata only
AliDNS current subscription records
HP-side public checks for Aliyun 80/443/3456/18080 closed
Admin auth boundary through private path
```

The preflight must not print:

```text
.env values
tokens
subscription URLs
opaque artifact paths
private keys
raw portal URLs
node credentials
SQLite rows
customer emails
organization names
cloud credentials
```

## Allowed After Approval

Only these actions are allowed after the exact approval phrase:

```text
create a candidate backup before validation
initialize candidate-only clean-start state
run protected clean-start readiness checks
run private subscription rendering dry-run checks
verify candidate SQLite integrity after validation
create a candidate backup after validation if state is retained
record rollback or cleanup decision
```

## Forbidden In This Gate

```text
DNS change
public 80/443 promotion
public Admin exposure
public listener exposure beyond the already approved private candidate posture
edge traffic activation
AWS start, stop, reboot, terminate, or source rescue
historical AWS SQLite, artifact, query-token, or subscription-output copy
provider firewall mutation
Nginx public-boundary promotion
customer-facing announcement
all-user rollout
raw sensitive output in logs or docs
```

Provider-firewall hardening is deliberately separate. If firewall hardening is
needed first, use the separate firewall hardening runbook and approval phrase.

## Validation Evidence Required

The execution record must include:

```text
approval phrase
operator repo commit
pre-validation candidate health summary
pre-validation candidate SQLite integrity result
candidate backup metadata before mutation
clean-start readiness summary from the protected Admin route
private rendering summary with only safe metadata
post-validation candidate health summary
post-validation candidate SQLite integrity result
rollback or cleanup decision
explicit "not performed" list
```

Private rendering evidence may include safe metadata such as readiness status,
node count, protocol families, and generated YAML byte size. It must not
include rendered subscription content or raw access material.

## Rollback / Cleanup

Rollback choices must be selected before mutation:

```text
restore the pre-validation candidate backup
or remove candidate-only clean-start seed state
or retain candidate-only state with a named follow-up gate
```

Rollback must not depend on DNS, AWS node restart, source-state copy, or public
traffic movement.

## Completion Criteria

The gate is complete only when the execution record states:

```text
private validation passed / failed / blocked
candidate state retained / rolled back / cleaned up
next gate recommendation
no DNS change
no public listener exposure
no public Admin exposure
no edge traffic
no AWS mutation
no historical state copy
```

## Current PR Not Performed

This repo-only PR does not perform:

```text
Aliyun SSH or cloud command execution
candidate state initialization
backup or restore
SQLite mutation
Nginx mutation
UFW or provider firewall mutation
DNS change
AWS mutation
traffic movement
secret, token, subscription URL, or customer-data handling
```
