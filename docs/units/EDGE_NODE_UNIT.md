# Edge / Node Capacity Unit

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize AWS, DNS, Nginx, HTTPS, systemd,
>   security group, node config, mesh, production deploy, runtime mutation, or
>   cutover changes
> - Production impact: None
> - Source of truth for: edge capacity ownership, node identity boundaries, and
>   safe interfaces

## Purpose

The Edge / Node Capacity Unit owns replaceable data-plane capacity.

It defines edge slot roles such as `prod-edge-a`, `prod-edge-b`, and future
`prod-edge-c`, plus the safe health, readiness, listener, maintenance, and
mesh-membership boundaries around those slots.

This unit reports capacity. It does not authorize customers, issue subscription
artifacts, or decide billing.

## Responsibilities

```text
provider-neutral edge slot identities
prod-edge-a / prod-edge-b / future prod-edge-c role model
node identity and naming rules
approved listener sets as architecture records
edge health and readiness summary shape
maintenance-mode semantics
safe edge-level diagnostic counters
upstream path research only after promotion out of Operator Lab
private mesh membership design when separately approved
capacity status without secrets or raw node credentials
rollback and replacement boundaries for node capacity changes
```

## Explicit Non-Responsibilities

```text
customer commercial status
billing, packages, renewal, or payment decisions
tenant token authority
opaque artifact authority
subscription database authority
Admin UI or Admin API exposure
Subscription V2 access eligibility
production DNS, Nginx, HTTPS, systemd, AWS, security group, or node mutation
Operator Lab promotion without separate approval
private mesh as a user-facing path by default
```

## Inputs

```text
product capacity needs
access-output requirements
production safety constraints
validation requirements
operator research evidence when explicitly promoted
approved inventory facts through A-tier read-only inventory when production is
  involved
```

## Outputs

```text
edge capacity status
provider-neutral edge slot labels
approved edge endpoint metadata for subscription rendering
health and readiness summaries
maintenance-mode summaries
safe diagnostic counters
replacement and rollback evidence
mesh membership records when separately approved
```

## Interfaces With Other Units

```text
Product Business:
  consumes product capacity expectations and user-facing availability goals
  returns capacity status and edge role constraints

Commercial / Entitlement:
  has no direct billing decision interface
  commercial status must be translated through Subscription Access Control

Subscription Access Control:
  provides approved edge inventory, endpoint metadata, node labels, and safe
  status summaries for subscription rendering
  does not receive raw node credentials, mesh keys, production secrets, or
  mutation authority

Local Client:
  provides supported remote edge capabilities for client import or local-agent
  planning
  does not require local clients to connect directly to private mesh

Validation / CI:
  provides testable expectations for edge inventory records, health summary
  parsing, and architecture contracts

Operator Lab:
  may provide lab evidence after explicit promotion
  HP Relay or experiment state is not inherited as production capacity

Production Operations:
  executes real production node, listener, DNS, Nginx, systemd, security-group,
  mesh, or runtime change through A-tier gates
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/PROJECT_CONTEXT.md
docs/PRODUCTION_EDGE_FLEET.md
docs/NODE_NAMING.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
docs/SERVER_EDGE_MESH_DESIGN.md
docs/SERVER_EDGE_MESH_WIREGUARD_CANARY_RUNBOOK.md
docs/LOCAL_EDGE_AGENT_DESIGN.md
ops/edge-node/*
ops/nginx/*
ops/systemd/*
```

Current documented architecture facts:

```text
prod-edge-a is the documented current primary production slot.
prod-edge-b is documented as the iteration/canary secondary slot.
future prod-edge-c remains recovery or expansion planning until approved.
current prod-edge-a is still documented as co-located with subscription
  control-plane duties.
Server Edge Mesh is private health, validation, management, and recovery
  infrastructure first, not user-facing VPN.
```

## Risk And Validation

```text
Default risk:
  C for this document alone
  B for repository-only edge inventory or health-summary modeling with tests
  A for real production node, AWS, DNS, Nginx, HTTPS, systemd, security group,
    listener, mesh, runtime config, endpoint, deploy, rollback, tenant,
    artifact, or traffic changes

Docs-only validation:
  git diff --check origin/master...HEAD
```

A-tier edge work requires read-only inventory, dry-run planning, explicit
operator approval, validation evidence, and rollback planning.

## Next Tasks

```text
define a minimal edge inventory schema consumable by Subscription Access
  Control without secrets
define safe health and readiness summary fields
define maintenance-mode behavior for subscription rendering without unsafe
  automatic failover
separate Operator Lab upstream evidence from production edge records
keep mesh membership gated until A-tier runbook approval
```

## Paused / Blocked Items

```text
physical control-plane / edge data-plane split
prod-edge-b carrying-instance replacement or output-mode changes
prod-edge-c creation or durable third-node recovery
WireGuard install, mesh keys, UDP security-group changes, service start, or
  live mesh validation
DNS, Nginx, HTTPS redirect, production runtime config, and systemd changes
legacy node cleanup, termination, or security-group cleanup
```
