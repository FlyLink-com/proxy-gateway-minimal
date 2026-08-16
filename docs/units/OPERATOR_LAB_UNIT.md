# Operator Lab Unit

Last updated: 2026-05-25, Asia/Shanghai.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: operator_lab_unit
  superseded_by: null
  last_verified_at: 2026-05-25
  production_authority: false
```

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize code, CI, staging, AWS, DNS,
>   Nginx, HTTPS, systemd, production config, node, tenant, artifact, secret,
>   deploy, or cutover changes
> - Production impact: None
> - Source of truth for: operator-only research, diagnostics, local path
>   testing, and evidence boundaries

## Purpose

The Operator Lab Unit is the controlled research space for operator-only
troubleshooting and experiments.

It answers questions such as:

```text
Can HP Relay expose useful diagnostics?
Can a local path be tested without becoming production?
What does an upstream path do under controlled observation?
What evidence does channel-manager provide?
Which network-route hypotheses are worth promoting into a formal design?
```

Operator Lab produces evidence. It does not become runtime authority by default.

## Responsibilities

```text
HP Relay diagnostics
local path testing
upstream behavior research
channel-manager evidence
network-route experiments
operator-only troubleshooting notes
hypothesis capture
evidence packaging for later design review
```

It may document:

```text
observed behavior
known limitations
local-only reproduction notes
operator hypotheses
candidate follow-up questions
promotion requirements for another unit
```

## Explicit Non-Responsibilities

```text
CI
staging
production
prod-edge-c
official Local Edge Agent runtime
customer traffic service
Server Edge Mesh membership
production DNS or node identity
production Nginx, HTTPS, or systemd behavior
tenant or artifact state
subscription authority
commercial package design
```

Operator Lab findings must not be treated as production readiness, CI success,
staging validation, or approved runtime design.

## Inputs

```text
operator questions
local diagnostics
local reproduction steps
HP Relay observations
channel-manager observations
network-route experiment notes
upstream behavior samples with sensitive data removed
unit boundary documents
```

## Outputs

```text
research notes
candidate hypotheses
diagnostic evidence
redacted observations
local-only experiment summaries
risk notes
promotion recommendations
```

Valid outputs are evidence packages, not operational decisions.

## Interfaces With Other Units

```text
Product Business:
  may consume user-impact observations or troubleshooting evidence

Commercial / Entitlement:
  no direct commercial source-of-truth interface

Subscription Access Control:
  may consume subscription import or access-path observations
  does not receive token issuance, artifact authority, or access-rule mutation

Edge / Node Capacity:
  may consume promoted network-path research
  does not inherit HP Relay as production capacity

Local Client:
  may consume local path and adapter behavior evidence
  HP Relay does not become official Local Edge Agent runtime without promotion

Validation / CI:
  may turn lab findings into repository tests later
  lab evidence is not CI

Production Operations:
  may consume evidence for a future runbook only after promotion through design
  and risk gates
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/PROJECT_CONTEXT.md
docs/PROJECT_OPERATING_MODEL.md
docs/PROJECT_SIMPLIFICATION_MAP.md
docs/LOCAL_EDGE_AGENT_DESIGN.md
docs/SERVER_EDGE_MESH_DESIGN.md
docs/CI_MANUAL_VALIDATION.md
```

## Risk And Validation

```text
Default risk:
  C for research notes, design boundaries, and redacted evidence summaries
  B for repository code or test changes based on lab findings
  A for AWS, DNS, Nginx, HTTPS, systemd, security group, production node,
    production runtime config, tenant, artifact, database, deploy, rollback, or
    customer-traffic impact

Docs-only validation:
  git diff --check origin/master...HEAD
```

Any task that would make Operator Lab carry real customer traffic, become a
production node, join Server Edge Mesh, or act as the Local Edge Agent runtime
is not an Operator Lab task anymore.

## Next Tasks

```text
create a redacted evidence template for Operator Lab notes
define what evidence is sufficient to propose promotion into another unit
link known HP Relay and channel-manager notes without exposing sensitive data
add a promotion checklist mapping findings to Product, Local Client, Edge,
  Validation, or Production Ops
keep Operator Lab tasks explicitly labeled local-only or evidence-only
```

## Paused / Blocked Items

```text
HP Relay promotion to runtime
Operator Lab as staging
Operator Lab as CI
Operator Lab as prod-edge-c
Operator Lab as Server Edge Mesh member
Operator Lab as official Local Edge Agent runtime
Operator Lab serving customer traffic
```
