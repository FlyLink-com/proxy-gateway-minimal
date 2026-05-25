# Unit Design Index

Last updated: 2026-05-25, Asia/Shanghai.

> Status:
> - Type: Active unit design index
> - Risk: C
> - Execution authority: Does not authorize code, commercial system, CI host,
>   AWS, DNS, Nginx, HTTPS, production config, node, tenant, secret, SQLite,
>   deploy, or cutover changes
> - Production impact: None
> - Source of truth for: navigation across separated project unit designs

## Purpose

This directory keeps each project unit design separate. Use
`docs/DOMAIN_UNIT_BOUNDARIES.md` as the top-level boundary and these unit files
for focused ownership, interfaces, risks, and next tasks.

## Unit Designs

| Unit | Document | Status |
| --- | --- | --- |
| Product Business | `docs/units/PRODUCT_BUSINESS_UNIT.md` | Active |
| Commercial / Entitlement | `docs/units/COMMERCIAL_ENTITLEMENT_UNIT.md` | Active |
| Subscription Access Control | `docs/units/SUBSCRIPTION_ACCESS_UNIT.md` | Active |
| Edge / Node Capacity | `docs/units/EDGE_NODE_UNIT.md` | Active |
| Local Client | `docs/units/LOCAL_CLIENT_UNIT.md` | Active |
| Validation / CI | `docs/units/VALIDATION_CI_UNIT.md` | Active |
| Operator Lab | `docs/units/OPERATOR_LAB_UNIT.md` | Active |
| Production Operations | `docs/units/PRODUCTION_OPS_UNIT.md` | Active |

## Standard Unit Template

Each unit design should answer:

```text
Purpose:
  What this unit exists to decide or operate.

Responsibilities:
  What this unit owns.

Explicit non-responsibilities:
  What this unit must not own.

Inputs:
  What this unit consumes from other units.

Outputs:
  What this unit produces for other units.

Interfaces:
  How this unit connects to the others without sharing internals.

Current repository anchors:
  Current docs, code, or project-state files that relate to this unit.

Risk and validation:
  Default risk tier and validation commands.

Next tasks:
  The next safe repository or design work.

Paused / blocked items:
  Work that needs a separate design, runbook, approval, or production gate.
```

## Boundary Rule

Do not merge these designs back into one large "subscription management"
concept. Integration belongs at explicit interfaces:

```text
commercial entitlement decision
access artifact / subscription output
edge capacity and health
local bootstrap / diagnostics
validation evidence
operator lab evidence
production execution record
```
