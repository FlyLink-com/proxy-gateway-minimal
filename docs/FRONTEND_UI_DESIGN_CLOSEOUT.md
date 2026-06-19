# Frontend UI Design Closeout

Last updated: 2026-06-19, Asia/Shanghai.

> Status:
> - Type: Active frontend UI design closeout handoff
> - Risk: C
> - Execution authority: Does not authorize production, DNS, Nginx, systemd,
>   firewall, SQLite, tenant, artifact mutation, subscription output mutation,
>   subscription URL, credential, payment, deploy, rollback, or customer-data
>   actions
> - Production impact: None
> - Source of truth for: Current frontend UI closeout scope, screen contracts,
>   safe design reference handling, state coverage, and implementation handoff

## Purpose

This document closes the current frontend UI design pass enough for
implementation and review to proceed without waiting for Figma automation.

The Figma file for the visual pass exists:

- `https://www.figma.com/design/pqEbpwFvzJxEJTuo8dL7GC`

At the time of this closeout, Figma canvas generation is blocked by the
Starter-plan MCP tool-call limit. Until that is unblocked, this document is the
repository design handoff for the frontend UI lane.

Use this document with:

- `docs/FRONTEND_ARCHITECTURE.md`
- `docs/USER_PORTAL_FLOW.md`
- `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md`
- `docs/ADMIN_UI_LEGACY_ARCHIVE.md`
- `docs/VALIDATION_BASELINE.md`

Do not copy raw YAML, raw subscription URLs, node material, credentials, tokens,
SQLite rows, runtime config, or customer-private data into Figma, docs, tests,
PR bodies, Linear, Slack, screenshots, or chat output.

## Design Inputs

Current verified local inputs:

| Input | Current use |
| --- | --- |
| `admin/src/App.tsx` | Current route shell for protected Admin, `#/portal`, `#/portal-preview`, and `#/site`. |
| `admin/src/app/navigation.ts` | Current protected Admin navigation: dashboard, portal requests, usage monitor. |
| `admin/src/features/user-portal/user-portal-page.tsx` | Current customer portal page structure and order lifecycle UI. |
| `admin/src/pages/portal-requests-page.tsx` | Current protected Admin review companion for portal/order requests. |
| `docs/FRONTEND_ARCHITECTURE.md` | Current frontend surface and client-boundary map. |
| `docs/USER_PORTAL_FLOW.md` | Customer portal product flow and forbidden behavior. |
| `docs/SUBSCRIPTION_DEVICE_SCOPED_OPAQUE_URLS.md` | Opaque artifact and visible-once subscription material model. |

The supplied YAML-style design reference is treated as design material only.
It must be converted to redacted screenshots, sanitized excerpts, or safe
summary requirements before it is used in durable design or implementation
artifacts.

## Closeout Scope

This pass closes three frontend design surfaces:

1. Protected Admin UI closeout board.
2. User Portal subscription management and import/refresh flow.
3. Protected Admin review companion for user portal/order requests.

Public Site is not part of this UI closeout except for preserving its boundary:
it remains a public lead-intake surface and must not absorb portal, Admin,
subscription, or runtime controls.

## Surface Contracts

| Surface | Design status | Implementation anchor | Non-goals |
| --- | --- | --- | --- |
| Protected Admin shell | Close as an internal operator console with live-data or clearly labeled preview routes. | `admin/src/App.tsx`, `admin/src/app/navigation.ts`, `admin/src/components/layout/*` | Public Admin, static blueprint replacement for active routes, unaudited execution buttons. |
| User Portal | Close as customer self-service for orders, import guidance, refresh, disable, support, and profile. | `admin/src/features/user-portal/*` | Admin APIs, browser-owned entitlement, raw YAML preview, raw URL persistence. |
| Admin review companion | Close as protected queue/detail/preview UI for portal/order requests. | `admin/src/pages/portal-requests-page.tsx` | Production issuance authority, raw delivery material, unreviewed execution. |
| Public Site | Preserve existing public boundary. | `admin/src/features/company-site/*` | Portal session, Admin API, subscription/runtime API, private customer data. |

## Protected Admin UI Closeout

The protected Admin UI should read as a compact operations console, not a public
customer surface and not an OS clone.

Required layout:

```text
AdminLayout
  -> sidebar navigation
  -> top connection/search/status area
  -> page heading
  -> page-specific live-data or preview-labeled panels
```

Current navigation labels remain:

- `运营总览`
- `订单管理`
- `用量监护`

Design rules:

- The sidebar must communicate that Admin is internal and protected.
- Search is a local console search affordance until a backend search contract
  exists.
- A visible page must either use protected `AdminApiClient` data or label itself
  as preview/design-only.
- Route labels must not imply production execution authority.
- Empty/loading/error states must be explicit and business-readable.
- Safe refs may appear; raw tokens, raw subscription URLs, raw YAML, raw logs,
  raw config, node credentials, and customer-private details must not appear.

## User Portal Subscription Flow

The User Portal design closes around four top-level views:

| View | Design commitment |
| --- | --- |
| Subscription Management | Primary order list, package selection, client target, status tabs, copy issued material only when present, refresh, disable, delete disabled. |
| Use Guide | Client import and refresh guidance for Clash/Mihomo-style clients. |
| Support | Support category selection and safe issue-context preparation. |
| Profile | Account facts, history summary, and local-preview security controls. |

Order row design:

```text
order number
plan and quantity
client target
lifecycle chip
expiry or pending label
available action cluster
```

Visible-once delivery panel states:

| State | UI behavior |
| --- | --- |
| Pending | Show "awaiting delivery" copy and disable raw material controls. |
| Active with material | Show visible-once copy panel, copy action, and warning not to store the link in logs/docs/chat. |
| Refreshed | Show new visible-once material and old-link-invalidated notice. |
| Disabled | Hide copy action and show disabled reason/status. |
| Expired | Hide copy action and show renewal/refresh guidance if backend allows. |
| Revoked | Hide copy action, show revoked status, and direct user to support/review path. |
| Refresh failed | Preserve current safe state, show retry/support action, and do not reveal backend raw errors. |

Forbidden portal behavior:

- Do not call Admin APIs.
- Do not derive lifecycle state from browser time.
- Do not send package duration as frontend authority.
- Do not persist raw subscription material in local storage.
- Do not display raw YAML.
- Do not include node diagnostics or operator controls.

## Protected Admin Review Companion

The Admin review companion design must keep a queue/detail/preview shape.

Required regions:

```text
summary metrics
status filter
request queue
selected request detail
safe approval preview form
preview result summary
review-only safety note
```

Queue states:

| State | Operator label | Next action copy |
| --- | --- | --- |
| `pending_admin_review` | `待处理` | `处理订单` |
| `approved_pending_delivery` | `待交付` | `执行交付` |
| `delivered` | `已交付` | `查看记录` |
| `rejected` | `已拒绝` | `无需处理` |
| `cancelled` | `已取消` | `无需处理` |
| `expired` | `已过期` | `复核过期` |
| `revoked` | `已撤销` | `查看撤销` |

Preview panel rules:

- Show safe input summaries and redacted artifact presence only.
- Do not show raw issue payloads as the primary operating surface.
- Keep backend enum values behind business labels unless a debugging view is
  explicitly labeled and protected.
- A preview is not delivery execution.
- Any future execution action must be split into the appropriate B or A tier.

## Component Rules

Use the same visual vocabulary across Admin and Portal:

| Component | Purpose | Required states |
| --- | --- | --- |
| Page heading | Orient the current surface and boundary. | normal, review-only, preview-only |
| Metric card | Summarize safe counts and health. | loading, empty, warning, error |
| Status chip | Render lifecycle and review state. | active, pending, expired, disabled, revoked, unknown |
| Data table / queue | Show orders, requests, usage, or risk rows. | loading, empty, selected, filtered, error |
| Detail panel | Explain one selected object. | selected, missing, redacted, preview |
| Visible-once panel | Copy newly returned material only in reviewed flows. | available, copied, refreshed, disabled, revoked, expired |
| Safety note | Make non-goals and authority boundaries visible. | info, warning, blocked |

Do not introduce a new UI framework for this closeout. Keep the existing
React/CSS stack and align implementation with current tests before adding
visual complexity.

## Implementation Handoff

Follow this file ownership to avoid parallel-PR conflicts:

| Work item | Primary files | Risk |
| --- | --- | --- |
| Admin shell labels and route affordances | `admin/src/App.tsx`, `admin/src/app/navigation.ts`, `admin/src/components/layout/*` | B |
| Portal visible-once and import/refresh UX | `admin/src/features/user-portal/user-portal-page.tsx`, `admin/src/features/user-portal/user-portal-client.ts`, `admin/src/test/user-portal.test.tsx` | B |
| Admin review queue/detail/preview polish | `admin/src/pages/portal-requests-page.tsx`, `admin/src/test/portal-requests-page.test.tsx` | B |
| Public Site boundary preservation | `admin/src/features/company-site/*`, `admin/src/test/company-site.test.tsx` | B if changed |
| Design-only updates | `docs/FRONTEND_UI_DESIGN_CLOSEOUT.md`, `docs/README.md`, Linear/Figma references | C |

High-conflict files:

- `admin/src/App.tsx`
- `admin/src/app/navigation.ts`
- `admin/src/styles.css`
- shared layout components
- broad Admin tests

Do not run multiple implementation agents against those files without an
explicit merge order.

## Validation

Docs-only closeout:

```bash
git diff --check origin/master...HEAD
npm run project-state:check
```

Admin or Portal implementation:

```bash
npm run admin:test
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

User Portal standalone bundle changes:

```bash
npm run admin:portal:build
npm run admin:portal:verify
```

Public Site changes:

```bash
npm run admin:site:build
npm run admin:site:verify
```

## Closeout Decision

Current design closeout is complete for implementation planning when:

- this document is indexed from `docs/README.md`;
- Figma file exists or is explicitly blocked by plan limits;
- raw YAML and raw subscription material are excluded from durable artifacts;
- Admin, User Portal, and Admin review companion scopes are separated;
- each implementation lane has file ownership and validation commands;
- Linear `GCC-81`, `GCC-83`, and `GCC-99` point to this closeout.

If Figma MCP quota becomes available later, use this document as the source
for creating three editable frames in the existing Figma file. The Figma work
should refine visuals, not reopen the product boundaries closed here.
