# Admin UI Design Audit

Last updated: 2026-06-15, America/Los_Angeles.

> Status:
> - Linear: GCC-43 under GCC-42
> - Risk: C for this audit document; follow-up UI/code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, token, credential, subscription URL, or
>   customer-data actions

This document maps the current Admin product needs to UI design patterns before
new Admin UI work continues. It is a design audit and task-routing baseline,
not a template adoption plan.

Use `docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md` as the active prompt
governance layer before turning this audit into Figma, product-design, or code
work.

## Decision

Use mature Admin products as design references, not as code sources.

The project should absorb the design language common to modern SaaS dashboards:
clear navigation groups, large but information-dense cards, explicit status
chips, quota meters, usage charts, table-first review flows, and visible data
freshness. The project should not buy, copy, or migrate into a commercial
template just to obtain a visual shell.

Reference families:

- Horizon-style SaaS dashboard: modern cards, generous spacing, strong metric
  hierarchy, technology-product feel.
- Tabler-style admin UI: clean responsive layout, readable tables, dark/light
  readiness, pragmatic operator density.
- CoreUI-style dashboard system: reusable components, charts, tables, forms,
  and accessibility-oriented primitives.

These are pattern references only. Implementation remains in the current
`admin/` React app and project-owned CSS/components unless a separate approved
technical migration says otherwise.

## Responsibility Model

The protected Admin surface is a management and supervision console. Its job is
to help the operator see users, resources, orders, quota, usage, channel health,
and anomalies. It is not the user self-service portal, and it is not a direct
production execution console.

Admin owns visibility and controlled review for:

- user accounts and whether an account is enabled or disabled;
- user resources, plans, orders, entitlement summaries, and subscription
  artifact references;
- per-order traffic limits, usage summaries, and over-limit signals;
- platform usage collection state and channel measurement coverage;
- abnormal subscriptions, stale collection, zero-usage anomalies, expiry,
  pause, and archive candidates;
- safe previews and audit metadata for controlled issuance or lifecycle work.

Admin does not own:

- public customer self-service flows;
- raw subscription URL, token, password, private key, credential, raw runtime
  config, SQLite rows, or customer-private data display;
- production runtime mutation without a separate Risk A gate;
- subscription creation as a casual UI action detached from account/resource
  review and backend issuance boundaries.

The user portal remains a separate surface for customer-visible order state,
downloads, current package details, support, and profile/security flows.

## Navigation Baseline

Current first-pass Admin navigation should stay small and responsibility-based:

| Section | Page | Responsibility |
| --- | --- | --- |
| `总览` | `运营总览` | Top-level health, risk summary, and routing to owner pages. |
| `用户监管` | `账号与资源` | User accounts, resources, orders, entitlements, quota, and account lifecycle review. |
| `平台监控` | `流量与通道` | Usage collection, channel health, data freshness, and platform anomaly review. |

Future sections can be added only when a real page exists:

- `平台开发`: internal platform/dev tools, API diagnostics, sandboxed review
  utilities.
- `系统设置`: local/private operator settings, never public Admin exposure.
- `审计记录`: durable audit log and lifecycle history if it outgrows page-local
  cards.

Do not add placeholder navigation groups just to mirror a template.

## Demand To UI Pattern Matrix

| Project demand | UI pattern to use | Current surface | Current status | Next action |
| --- | --- | --- | --- | --- |
| Operator sees whether the platform is healthy | SaaS ops dashboard with hero health, metric cards, and risk summary | `运营总览` | Existing dashboard is useful but still carries legacy tool/panel density | GCC-45: make first screen answer health, risk, and next review target. |
| User account supervision | User management table plus account detail panel | `账号与资源` | Account concept is emerging through portal access/resource data | GCC-46: make account enabled/disabled state explicit and separate from order lifecycle. |
| User resources and entitlements | Account/resource detail layout with entitlement cards | `账号与资源` | Resource, plan, and order facts are partly visible | GCC-46: group account, resource, order, and entitlement facts into one review path. |
| Order/subscription ownership | Master/detail order table with safe artifact refs | `账号与资源`, `流量与通道` | Order ownership and usage fields are now being wired | GCC-46/GCC-47: keep order identity visible without exposing raw subscription material. |
| Traffic quota editing | Quota meter, limit editor, reviewable audit note | `账号与资源` | Admin can edit delivered-order traffic limits in the current work lane | GCC-46: clarify default limit, edited limit, used/total, and audit state. |
| User-visible usage | Compact order usage meter and status chips | User Portal | Present in user panel, separate from Admin | Keep separate; Admin may supervise but should not duplicate customer self-service UX. |
| Usage collection health | Analytics dashboard with data-source freshness and stale/unknown states | `流量与通道` | Basic monitor exists and has order/account context | GCC-47: distinguish unknown, stale, failed, and true zero usage. |
| Channel health | Infrastructure health cards, channel chips, measured/expected counts | `流量与通道` | Channel breakdown exists, but page responsibility needs sharpening | GCC-47: show channel coverage and collector availability before detailed rows. |
| Abnormal subscriptions | Alert inbox or issue queue with severity chips | `运营总览` summary, `流量与通道` owner page | Not yet a first-class durable queue | GCC-45/GCC-47: Overview shows computed risk summary and route action; detailed over-limit, stale, zero-usage, receipt-missing, and collector-failed queues belong to owner pages. |
| Expiry, pause, archive | Lifecycle timeline and status workflow | `账号与资源`, later audit view | Partly represented through order status | GCC-46: separate account disable from order/subscription expiry, pause, and archive review. |
| Safe issuance or lifecycle preview | Review card with no execution authority unless gated | `账号与资源`, later gated audit/review pages | Existing preview panels are useful but must not dominate the main IA | Keep preview panels secondary, out of Overview, and label production gates clearly. |
| Shared visual consistency | Project-owned UI primitives and CSS tokens | `admin/src/components`, `admin/src/styles.css` | Mixed page-local patterns | GCC-48: normalize cards, tables, chips, meters, empty states, spacing, and responsive rules. |

## Page-Level Audit

### 运营总览

Target role: first-page supervision summary.

Primary questions:

- Is the control plane healthy enough for operator review?
- Are there urgent user/resource/usage/channel anomalies?
- Which page should the operator open next?
- Is any production action blocked behind a Risk A gate?

Recommended layout:

1. Health header: concise status, last checked time, and no-public-Admin safety
   signal.
2. Four to six metric cards: active accounts/resources, delivered orders,
   usage collection health, abnormal items, expiring/paused/archive candidates.
3. Risk queue: over-limit, stale usage, zero usage, collector unavailable,
   receipt missing, and lifecycle blockers.
4. Next-action routing: compact cards that open `账号与资源`, `流量与通道`, or a
   gated future audit/case page.
5. No detailed account/resource ledger, object timeline, channel ledger, or
   approval workbench inside Overview.

Avoid:

- making old gate-review panels the first visual impression;
- using a hero that markets the product instead of summarizing operations;
- duplicating owner-page ledgers inside Overview;
- implying any production mutation can be done from the overview page.

### 账号与资源

Target role: user and resource supervision.

Primary questions:

- Which user account is being reviewed?
- Is the account enabled, disabled, pending, risky, or incomplete?
- Which resources/orders/entitlements belong to this account?
- What traffic limit applies, how much is used, and is the order over-limit or
  stale?
- What is account lifecycle versus order/subscription lifecycle?

Recommended layout:

1. Search/filter toolbar for user account, resource, order, status, and risk.
2. User account list or master table with status chips and summary counts.
3. Account detail panel with contact-safe identity facts and account lifecycle.
4. Resource/order table with plan, entitlement, artifact safe refs, quota, and
   delivered/pending/disabled/expired status.
5. Quota card: default limit, edited limit, used/total, last collected, channel
   coverage, and safe audit note.
6. Controlled preview card for issuance/lifecycle review, clearly secondary.

Avoid:

- presenting subscription creation as the central page action;
- treating user account disabled and order disabled as the same concept;
- exposing raw subscription material or runtime credentials in table cells.

### 流量与通道

Target role: platform usage and channel monitoring.

Primary questions:

- Is usage data fresh and complete enough to trust?
- Which orders are over-limit, stale, failed, or truly zero usage?
- Which channels are measured, missing, or collector-disabled?
- Is a platform issue isolated to collection, channel health, or order state?

Recommended layout:

1. Data freshness strip: last collection, collector availability, stale window,
   and unknown count.
2. Usage summary cards: total upload, total download, total used, measured
   orders, abnormal orders.
3. Channel coverage card: expected channels, measured channels, missing
   channels, and collector status.
4. Time-series chart for usage trend, scoped by order/account/channel filters.
5. Collection anomaly queue before full ledger table.
6. Ledger table with account, order, channel, safe edge credential reference,
   upload/download/total, quota decision, and collected time.

Avoid:

- hiding unknown/stale state behind zero values;
- mixing platform channel health with customer-visible usage totals;
- showing credential material, raw config, or subscription URLs.

## State Language

Use consistent labels across pages:

| Concept | Preferred UI language |
| --- | --- |
| Account enabled | `启用` |
| Account disabled | `账号已禁用` |
| Order delivered | `已发放` |
| Order pending | `待处理` |
| Order disabled | `订阅已暂停` or `订单已暂停`, depending on backend state |
| Order expired | `已到期` |
| Archive candidate | `待归档` |
| Over quota | `超额` |
| Usage collection stale | `延迟` |
| No observed usage | `零用量` |
| Unknown usage | `未采集` |
| Collector unavailable | `采集不可用` |
| Channel partially measured | `已计量 x/y 通道` |
| Receipt missing | `回执缺失` |

Do not use one chip to represent two different states. For example, account
disabled, order paused, expired subscription, and quota overage should remain
visually distinct.

## Shared UI Primitives

GCC-48 should normalize these primitives before the design language spreads:

- `PageHeader`: title, short context, safety/status line, optional actions.
- `SectionPanel`: un-nested page section with heading, helper copy, and action
  slot.
- `MetricCard`: label, value, trend or state, and small source note.
- `StatusChip`: semantic tones for success, info, warning, danger, neutral.
- `QuotaMeter`: used/limit, percent, overage, source timestamp, channel count.
- `DataFreshness`: last collected, stale threshold, unknown/failed counters.
- `RiskQueue`: severity, entity, reason, safe next action.
- `DataTable`: dense but readable tables with stable columns and empty states.
- `SafeRef`: shortened non-secret references for account/order/channel/edge
  credential identifiers.

Visual rules:

- Keep page sections unframed or as single-level panels; do not nest cards
  inside cards.
- Use spacing and typography to create hierarchy instead of decorative gradient
  backgrounds.
- Keep table and card text readable at desktop and mobile widths.
- Prefer icons only when they clarify a repeated action or state.
- Avoid a one-note palette; use neutral surfaces plus restrained status colors.

## Validation Expectations

For this document-only audit:

```powershell
git diff --check origin/master...HEAD
```

For follow-up Admin UI/code work:

```powershell
npm run admin:test
npm run admin:build
npm test
git diff --check origin/master...HEAD
```

For visual QA:

- Open the local Admin app through the Vite dev server or preview server.
- Verify desktop and mobile widths.
- Check that navigation groups, headings, cards, tables, meters, and chips do
  not overlap.
- Check that unknown/stale/zero/over-limit states remain distinguishable.
- Check that no token, credential, subscription URL, raw runtime config,
  SQLite row, or customer-private data appears in the UI.

## Linear Execution Map

| Linear issue | Purpose |
| --- | --- |
| GCC-43 | This demand-to-design audit. |
| GCC-44 | Admin shell and navigation visual responsibility split. |
| GCC-45 | Operations overview dashboard reorder. |
| GCC-46 | Account and resource supervision page redesign. |
| GCC-47 | Usage and channel monitoring page redesign. |
| GCC-48 | Shared Admin UI primitives and browser QA. |

## Open Questions For Later Tasks

- Should account creation and disable actions live in `账号与资源` now, or
  should the first implementation only display account lifecycle until backend
  account-management routes are reviewed?
- Should anomaly queues start as computed frontend groups from existing API
  summaries, or should backend endpoints provide first-class anomaly summaries?
- Should dark mode be a near-term requirement, or only a design-token
  constraint for future implementation?
- Which audit events should become page-local recent activity versus a future
  standalone `审计记录` page?
