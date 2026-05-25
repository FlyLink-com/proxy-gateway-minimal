# Product Business Unit

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active unit design
> - Risk: C for this document
> - Execution authority: Does not authorize code, CI, AWS, DNS, Nginx,
>   HTTPS, systemd, production config, node, tenant, artifact, billing,
>   credential, SQLite, deploy, or cutover changes
> - Production impact: None
> - Source of truth for: user-facing product promise, workflows, acceptance
>   criteria, and client journey decisions

## Purpose

The Product Business Unit defines what service the user receives and how that
service should feel from import through daily use. It turns business intent and
operator feedback into product requirements, user-facing workflows, and
acceptance criteria.

It does not implement commercial billing, technical access control, node
capacity, CI, or production operations.

## Responsibilities

```text
user-facing service promise
subscription/import experience
device and local-agent journey expectations
supported client expectations
operator-visible product workflows
acceptance criteria for product behavior
user-facing access and failure-state wording
workflow priority from operator feedback and validation evidence
```

## Explicit Non-Responsibilities

```text
orders, payments, invoices, or billing records
commercial entitlement source of truth
token hashing or opaque artifact authority
Subscription V2 renderer internals
production node selection or node config
AWS, DNS, Nginx, HTTPS, systemd, security group, or runtime mutation
CI execution or validation infrastructure
public Admin UI exposure
secret, token, subscription URL, credential, or customer-data storage
```

## Inputs

```text
commercial entitlement summaries
subscription access capabilities
edge capacity and availability summaries
local client behavior constraints
validation evidence
operator feedback and support observations
current project boundaries and non-goals
```

## Outputs

```text
product requirements
user-facing workflow definitions
acceptance criteria
import and device journey expectations
operator-visible workflow priorities
safe wording for access states
non-goal statements that prevent accidental production or billing scope creep
```

## Interfaces With Other Units

```text
Commercial / Entitlement:
  consumes plan, validity, quota, renewal, and commercial state summaries

Subscription Access Control:
  provides product requirements and consumes supported access behavior

Edge / Node Capacity:
  consumes capacity and health summaries, but does not select nodes directly

Local Client:
  defines the intended user journey and consumes client capability constraints

Validation / CI:
  consumes validation evidence for acceptance criteria

Operator Lab:
  consumes documented research findings, not production promises

Production Operations:
  may provide readiness evidence, but product requirements are not deployment
  approval
```

## Current Repository Anchors

```text
docs/DOMAIN_UNIT_BOUNDARIES.md
docs/PROJECT_CONTEXT.md
docs/PROJECT_TOPOLOGY.md
docs/SUBSCRIPTION_CONTROL_EDGE_ARCHITECTURE.md
docs/LOCAL_EDGE_AGENT_DESIGN.md
docs/PROJECT_SIMPLIFICATION_MAP.md
```

These anchors describe current direction and boundaries. They do not imply that
every product workflow is already implemented.

## Risk And Validation

```text
Default risk:
  C for docs-only product requirements and acceptance criteria
  B when changing UI or repository behavior
  A when changing production access semantics or external runtime state

Docs-only validation:
  git diff --check origin/master...HEAD
```

Any product requirement that turns into AWS, DNS, Nginx, HTTPS, systemd, node,
tenant, artifact, auth, schema, deployment, or rollback work must move through
the appropriate A-tier gate.

## Next Tasks

```text
define the minimum current MVP service promise
separate product acceptance criteria from technical access-control tests
document import success, expired access, disabled access, and unavailable
  capacity user states
map Local Edge Agent expectations without making it a production requirement
identify which operator workflows are product workflows versus production ops
```

## Paused / Blocked Items

```text
full commercial renewal experience
broader opaque artifact issuance
legacy query-token retirement
production node lifecycle changes
DNS, Nginx, HTTPS, systemd, or runtime migration
```
