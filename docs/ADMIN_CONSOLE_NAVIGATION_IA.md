# Admin Console Navigation IA

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Linear: GCC-57 under GCC-50
> - Risk: C for this IA document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, or customer-data actions

This document defines the Admin console navigation model after GCC-57. Admin is
not a subscription creation surface and is not the user self-service portal. It
is the operator console for supervision, operations, maintenance, and future
platform development.

## Decision

Treat Admin as a sustainable operator console shell, similar in product shape to
an infrastructure console: one protected shell, multiple domain work areas, and
strict entry gates before a work area becomes visible navigation.

Do not add placeholder menu items only to look like a commercial template. A
navigation entry becomes visible only when it has a real page, a real data
source, a safe redaction boundary, explicit non-goals, tests, and validation.

## Current Visible Navigation

These sections are active now because they have real pages and safe data
boundaries:

| Section | Page | Responsibility | Current data source |
| --- | --- | --- | --- |
| `总览` | `运营总览` | Platform health, risk summary, recent safe activity. | Admin overview API and computed case candidates. |
| `用户监管` | `账号与资源` | User accounts, owned resources, orders, subscription artifacts, quota state. | Portal access request summaries and safe refs. |
| `平台监控` | `流量与通道` | Usage accounting, collector freshness, channel health, anomaly queue. | Subscription usage monitor summaries and safe refs. |

The visible shell subtitle is `运营与平台控制台` to reflect that the panel is a
long-running operator and platform workbench.

## Planned Navigation Slots

These sections are part of the console IA, but they must not render as empty
navigation until their entry gate is met:

| Planned section | Responsibility | Entry gate |
| --- | --- | --- |
| `审计与工单` | Durable cases, object history, audit notes, close/reopen review flows. | GCC-55 durable Case/history backend contract and UI integration. |
| `平台开发` | Channel experiments, node onboarding, strategy tools, platform extension utilities. | Real platform tooling with object model, data source, safe boundary, tests, and validation. |
| `系统设置` | Private operator settings and local console configuration. | Private access boundary, explicit non-goals, validation, and no public Admin exposure. |

## Entry Gate

Every new top-level Admin entry must define:

1. Object model: user, resource, order, subscription artifact, channel, node,
   case, audit event, or platform tool.
2. Primary task: supervise, investigate, review, maintain, dry-run, or plan.
3. Data source: API, computed safe candidate, durable case/history, or local
   operator configuration.
4. Redaction boundary: no token, credential, subscription URL, raw runtime
   material, raw SQLite row, raw env/config/log, or customer private data.
5. Non-goals: especially production mutation, auth changes, schema migration,
   runtime apply, DNS/Nginx/systemd/firewall changes, or empty placeholder UI.
6. Tests and validation: targeted Admin tests, build, Browser QA when UI
   changes, and risk-tier validation from `docs/VALIDATION_BASELINE.md`.

## Phase Map

| Phase | Linear issue | Navigation effect |
| --- | --- | --- |
| Phase 1 | GCC-57 | Define console shell IA; keep only three real pages visible. |
| Phase 2 | GCC-55 | Promote durable cases/history into `审计与工单 -> 监管工作台` after backend facts exist. |
| Phase 3 | GCC-58 / GCC-59 | Expand user/resource/account lifecycle supervision and controlled action design. |
| Phase 4 | GCC-61 | Add platform extension entry only after real tools and automated case strategy exist. |
| Phase 5 | GCC-60 | Keep overage/expiry pause/archive as a separate A-tier production gate; UI work does not authorize execution. |

## User Portal Boundary

User Portal remains a separate self-service surface for account login,
subscription state, user-visible usage, client import, support handoff, and
security settings. Admin must not reuse User Portal navigation or expose
operator-only state to end users.

## Production Boundary

This IA does not approve any production action. Admin may visualize risk,
generate safe review candidates, and prepare dry-run plans, but production
pause, archive, restore, node changes, runtime apply, schema migration, auth
changes, DNS, Nginx, systemd, firewall, or cloud-provider mutations remain
A-tier gates requiring explicit runbook and operator approval.
