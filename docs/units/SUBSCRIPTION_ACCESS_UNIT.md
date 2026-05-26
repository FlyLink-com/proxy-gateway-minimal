# Subscription Access Control Unit

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize code, tenant, artifact, token,
>   SQLite, Admin access, production config, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: technical subscription access boundary
>   responsibilities and interfaces

## Purpose

The Subscription Access Control Unit owns the technical access boundary between
product/commercial decisions and subscription delivery.

It decides how approved access is represented inside the gateway:
server-side subscription state, token containment, opaque artifacts,
Subscription V2 rendering, and operator-facing access operations.

This unit is not a billing system and is not an edge runtime.

## Responsibilities

```text
server-side subscription access state
hashed or otherwise non-secret access material
visible-once token or artifact-secret behavior
opaque subscription artifact authority when implemented or activated
Subscription V2 rendering from approved state and approved edge inventory
Admin access operations for create/update/disable/rotate/inspect workflows
operator-safe summaries without raw secrets or URLs
device bootstrap records when implemented
dynamic customer portal entrance records when implemented
legacy access compatibility until separately retired
```

## Explicit Non-Responsibilities

```text
payment collection
order, renewal, refund, package, or billing status decisions
customer commercial status ownership
edge-node runtime implementation
production node provisioning, mutation, or retirement
Nginx, DNS, systemd, security group, or production listener changes
public Admin UI or Admin API exposure
HP Relay, Operator Lab experiments, or manual CI host lifecycle
edge health as authorization by itself
```

## Inputs

```text
product requirements
commercial entitlement decisions when implemented
approved edge inventory
operator actions from approved Admin workflows
validation evidence
production boundary constraints
```

## Outputs

```text
Subscription V2 YAML or successor subscription output
opaque artifact responses when implemented and approved
token-contained access records
device bootstrap material when implemented
dynamic portal entrance metadata suitable for operator-issued customer access
operator-safe access summaries
node delivery policy derived only from approved inventory
access-state audit boundaries suitable for validation without secrets
```

## Interfaces With Other Units

```text
Product Business:
  consumes user-facing subscription and import requirements
  returns behavior expressible as safe subscription output or access workflows

Commercial / Entitlement:
  consumes entitlement decisions such as active, expired, disabled, time limit,
  quota limit, or commercial flags
  does not interpret payment records directly as network routes

Edge / Node Capacity:
  consumes approved edge slots, labels, endpoint metadata, and safe health
  summaries
  does not mutate node runtime state or infer unapproved capacity

Local Client:
  produces subscription output and future bootstrap material
  does not own local adapter runtime, system proxy mutation, TUN behavior, or
  local diagnostics

Public Company Site:
  may describe the service and collect business interest
  must not directly link to logged-in portal hosts, subscription artifacts,
  Admin APIs, or customer-specific access material

Validation / CI:
  exposes testable contracts for storage, rendering, Admin behavior, token
  containment, and artifact handling

Production Operations:
  requires A-tier approval for production tenant, artifact, runtime config,
  database, public path, or migration changes
```

## Current Repository Anchors

```text
server/services/subscriptions/*
server/services/subscriptions/edge-inventory.mjs
server/routes/subscription.mjs
server/routes/admin-subscriptions.mjs
server/services/clash-subscription.mjs
server/tests/subscription-token.test.mjs
server/tests/subscription-service.test.mjs
server/tests/subscription-repository.test.mjs
server/tests/subscription-architecture-contract.test.mjs
server/tests/admin-subscriptions.test.mjs
server/tests/clash-subscription.test.mjs
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
docs/SUBSCRIPTION_V2_REPLACEMENT.md
docs/SUBSCRIPTION_OPAQUE_IMPLEMENTATION_PLAN.md
docs/SUBSCRIPTION_OPAQUE_ACCESS_MODEL_GAP.md
docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md
```

## Risk And Validation

```text
Default risk:
  C for this document alone
  B for repository-only access behavior, token handling, Admin API behavior, or
    renderer logic changes with tests
  A for production tenant state, artifact activation, legacy query-token
    retirement, public gateway path, Nginx logging, SQLite, auth model,
    migration, deployment, or rollback changes

Docs-only validation:
  git diff --check origin/master...HEAD
```

## Next Tasks

```text
map each subscription access feature to an owning code anchor and test anchor
separate current implemented behavior from planned opaque artifact and
  device-bootstrap behavior
define operator-safe Admin summary fields
extend the edge inventory handoff beyond repository-local status metadata only
add explicit contract tests when future access interfaces are proposed
```

## Paused / Blocked Items

```text
broader opaque artifact issuance
legacy query-token retirement
device-scoped bootstrap records unless implemented by separate task
dynamic portal entrance YAML/config runtime unless implemented by separate task
traffic accounting, quota enforcement, and device-abuse enforcement
production access-state mutation
```
