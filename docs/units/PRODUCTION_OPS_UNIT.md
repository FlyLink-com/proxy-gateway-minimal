# Production Operations Unit

Last updated: 2026-09-02, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: production_ops_unit
  superseded_by: null
  last_verified_at: 2026-09-02
  production_authority: false
```

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize AWS, DNS, Nginx, HTTPS, systemd,
>   production config, node, tenant, artifact, secret, deploy, rollback,
>   cutover, or code changes
> - Production impact: None
> - Source of truth for: production operations ownership, gated external-state
>   boundaries, serialized execution, and A-tier handoff requirements

## Purpose

The Production Operations Unit owns gated external state.

It executes approved operational changes with evidence, rollback, and clear
authority boundaries. It is responsible for production-facing infrastructure
and runtime state after a task has passed the appropriate design, validation,
and approval gates.

Production Operations does not decide what the product is. It executes approved
operational changes safely.

## Responsibilities

```text
AWS resources
DNS
Nginx
HTTPS
systemd
SQLite backup / restore
production runtime config
production tenant or artifact state
node lifecycle
rollback records
execution records
incident records
production-impacting closeout records
```

Production actions must remain:

```text
gated
serialized
observable
reversible where practical
evidence-backed
clearly recorded
```

## Explicit Non-Responsibilities

```text
product pricing
commercial package design
product scope
customer plan definition
billing policy
repository-only architecture decisions
operator lab experiments unless explicitly promoted
CI approval
business roadmap decisions
```

If an operational task reveals a product or commercial issue, Production
Operations records the issue and routes it to the owning unit.

## Inputs

```text
approved runbooks
read-only inventory
explicit operator approval
validation evidence
rollback plans
promotion decisions from other units
approved production change scope
known maintenance window or execution boundary when required
```

For A-tier work, required inputs include:

```text
read-only inventory
dry-run or preflight notes
explicit operator approval
runbook-bound validation evidence where applicable
rollback plan
post-change validation checklist
sensitive-data handling boundary
```

The runbook may bind staging, a clean host, or an isolated immutable candidate
with a temporary `current` pointer fixture. The isolated fixture is Source/Merge
evidence only: a Git branch is not a release identity, and the fixture neither
satisfies the Production Gate nor authorizes external-state mutation.

## Outputs

```text
execution records
verified production state changes
rollback evidence
incident records
closeout records
production validation summaries
known residual risk notes
```

Outputs should distinguish:

```text
known facts
reasonable assumptions
risks
validation evidence
rollback status
next actions
```

## Interfaces With Other Units

```text
Product Business:
  executes only approved operational changes needed to support product goals
  does not change the product promise during execution

Commercial / Entitlement:
  may execute approved production configuration/state transitions that support
  commercial decisions
  does not design packages or rewrite commercial meaning

Subscription Access Control:
  may back up, restore, deploy, or validate production state only through
  approved runbooks and A-tier gates

Edge / Node Capacity:
  executes node lifecycle, replacement, rollback, and runtime configuration
  only after approval

Local Client:
  does not deploy local-client behavior into production infrastructure unless a
  separate design and risk gate require it

Validation / CI:
  consumes validation evidence, but CI success is not deployment approval

Operator Lab:
  consumes lab evidence only after separate promotion through design and risk
  decision
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/PROJECT_CONTEXT.md
docs/CURRENT_RELEASE_STATE.md
docs/PROJECT_OPERATING_MODEL.md
docs/RUNTIME_LANE_AUTHORITY.md
docs/PRODUCTION_EDGE_FLEET.md
docs/DOMAIN_IMPLEMENTATION_RUNBOOK.md
docs/production-replacement-records/*
docs/production-incident-records/*
docs/domain-implementation-records/*
docs/server-edge-mesh-records/*
```

Historical compatibility evidence remains available in
`docs/DEPLOYMENT_FLOW.md`, `docs/PRODUCTION_DR.md`,
`docs/PRODUCTION_REPLACEMENT.md`, and
`docs/ALIYUN_CONTROL_LOCAL_CI_REBUILD_PLAN.md`. Those documents are not current
repository anchors, do not select a production target, and carry no execution
authority.

## Risk And Validation

```text
Default risk:
  C for this document alone
  A for AWS, DNS, Nginx, HTTPS, systemd, security groups, production nodes,
    production runtime config, SQLite backup/restore, tenant state, artifact
    state, deployment, rollback, cutover, public endpoint behavior, or customer
    traffic

Docs-only validation:
  git diff --check origin/master...HEAD
```

A-tier work requires:

```text
read-only inventory
dry-run or preflight
explicit operator approval
runbook-bound validation environment where applicable
implementation plan
post-change validation
rollback plan
execution record
closeout when production facts or long-term boundaries change
```

Production Operations mutations must be serialized. Do not run concurrent
production mutations against shared external state unless a separate approved
runbook explicitly proves the operations are independent and safe.

## Next Tasks

```text
define a standard Production Operations execution-record template
define a standard rollback-record template that avoids sensitive data
add promotion checklists from Edge / Node Capacity and Subscription Access
  Control into Production Operations
define the minimum read-only inventory packet before any production mutation
keep all production-impacting work serialized through A-tier gates
keep Aliyun production-control candidate preparation separate from local Linux
  CI bootstrap and clean edge-node rebuild records
```

## Paused / Blocked Items

```text
ungated production mutation
parallel mutation of shared external state
DNS cutover without explicit approval
Nginx or HTTPS changes without approved runbook
systemd changes without approved runbook
SQLite restore without backup and rollback plan
tenant or artifact mutation without access-control approval
Operator Lab promotion into production without separate design
commercial package redesign inside an ops task
product scope rewrite inside an ops task
```
