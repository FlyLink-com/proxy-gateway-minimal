# Admin Console Rebuild Baseline

Last updated: 2026-06-16, America/Los_Angeles.

> Status:
> - Linear: GCC-42, GCC-45, GCC-48, GCC-50
> - Risk: C for this design baseline; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, or customer-data actions

This document records the first New Admin Console rebuild baseline. The
existing `admin/` app is implementation material and a protected local testing
surface; it is not the final product-design baseline by itself.

## Direction

Build Admin as a sustainable operator console, closer to an infrastructure
control console than to a subscription-creation form. The console is for
supervision, operations, maintenance, anomaly review, and future platform
development.

User Portal remains separate. User Portal shows customer-facing account,
package, import, support, and usage state. Admin shows operator-facing user,
resource, order, quota, usage, channel, case, and audit supervision.

## Visual Reference

Use Horizon UI / NobleUI-style SaaS dashboard patterns as visual references:

- light operator shell with a clear left navigation rail;
- large but information-bearing cards;
- visible status chips, quota meters, and freshness labels;
- table-first review surfaces;
- a polished technology-product feel without importing a commercial template.

Do not buy, copy, or migrate to a commercial template for this lane. The code
remains the current React/Vite Admin app unless a separate migration is
approved.

Concept asset:

- `docs/assets/admin-console/new-admin-console-rebuild-concept.png`

Concept-to-requirements matrix:

- `docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`

Overview Figma/page implementation spec:

- `docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md`

Use the matrix as the card-by-card implementation checklist. This baseline
defines direction and boundaries; the matrix defines the concrete page, card,
table, timeline, interaction, data-source, and acceptance items visible in the
concept image. The overview spec turns the `总览 / 运营控制台` first screen into
an executable Figma and React implementation target.

Open-source source candidates checked for the concept direction:

- [Horizon UI Tailwind React](https://github.com/horizon-ui/horizon-tailwind-react)
  is the closest match to the Horizon-style visual language the project is
  using as a reference. It is useful for card rhythm, left rail composition,
  and polished SaaS dashboard hierarchy.
- [TailAdmin React](https://github.com/TailAdmin/free-react-tailwind-admin-dashboard)
  is the closest technical reference if a future lane decides to study
  React + TypeScript + Tailwind dashboard source structure. It should still be
  treated as a pattern source, not imported into this branch.
- [Mosaic Lite](https://github.com/cruip/tailwind-dashboard-template) is useful
  for analytics widgets and dashboard density, but its redistribution terms
  make direct code adoption a poor fit for this project.
- [Flowbite Admin Dashboard](https://github.com/themesberg/flowbite-admin-dashboard)
  is useful for table/sidebar/component coverage, but it assumes Flowbite,
  Tailwind, Hugo, and Webpack patterns that do not match the current Admin app.

Decision: keep the current React/Vite app and project-owned CSS. Borrow layout
patterns, state language, spacing, charts, chips, meters, and review surfaces;
do not copy template code or add a Tailwind/template migration in this lane.

## Design Tooling Path

Use design tools as review and translation aids, not as the product source of
truth. The source of truth for behavior remains backend domain services, safe
Admin API summaries, and the React/Vite implementation in this repository.

Current decision:

- Primary design source: use Product Design and Figma when the Figma MCP quota
  is available, especially for converting the concept matrix into reviewable
  frames and page-by-page layout specs.
- Implementation source: use the local React/Vite Admin app with project-owned
  CSS. Build Web Apps can help translate approved specs into code, but it does
  not replace the repository's component and test discipline.
- Visual verification: use Browser, Chrome, or Computer for local screenshots,
  interaction checks, and responsive review against the approved concept/spec.
- Figma fallback: Penpot is a future open-source design-source candidate if
  Figma access or quota becomes a recurring blocker. It is not adopted in this
  lane and does not imply a file-format or workflow migration.
- Code-side design governance: Storybook, Chromatic, or similar component
  review tooling may be considered later for shared primitives and visual
  regression. Adding those dependencies is follow-up B-tier work, not part of
  this docs-only baseline.
- Presentation/marketing tools: Canva may be useful for decks or external
  narrative assets, but it is not the Admin console design-source tool.

This means the immediate path is:

```text
concept matrix
  -> Figma/Product Design frame when available
  -> local React/Vite implementation
  -> Browser/Chrome/Computer visual QA
  -> backend/API upgrade only when the reviewed UI exposes a real domain gap
```

## Concept Review Mode

This baseline is a requirements checklist before business integration. The
concept image is close to the product's current business logic: users, orders,
subscription artifacts, traffic usage, channels, receipts, cases, and audit
history already exist as domain concepts. The next step is not to invent a new
planning surface, but to map these existing objects into an operator console
and check each region one by one before wiring deeper backend behavior.

Review rule:

- first write and review the screen outline, information architecture, labels,
  object ownership, and data-source expectations;
- then implement UI support for approved regions;
- then connect or extend backend contracts only when a region needs facts that
  are not already available through safe summaries;
- keep production mutation, runtime apply, collector activation, schema
  migration, and account/order side effects outside this design baseline.

## First Screen

The first screen should answer four operator questions:

1. Is the platform healthy enough for review?
2. Which user/resource/order/usage cases need attention?
3. Which channels or collectors are stale, missing, or abnormal?
4. Which future work areas exist but are still gated?

The first implementation slice therefore uses:

- `运营控制台` hero with explicit protected-console wording;
- metric cards for platform health, risk cases, collection freshness, and
  measured channel coverage;
- a selectable `监管案件` queue;
- next-action routing to `Accounts & Resources`, `Usage & Channels`, and future
  `Audit & Cases`;
- detailed user/resource tables, traffic/channel ledgers, and object history
  stay on their owner pages instead of the Overview page;
- locked navigation slots for audit/work orders, platform development, and
  system settings.

## Concept Region Checklist

Use this table as the one-by-one review checklist before implementation or
backend connection.

| ID | Region | Concept requirement | Current data support | Review status |
| --- | --- | --- | --- | --- |
| CUI-01 | Shell and brand | Left rail, top bar, protected operator identity, environment state, search, alerts, and quick links. | Existing Admin shell, navigation model, local connection session. | Needs visual/content review. |
| CUI-02 | Navigation | Active pages are `总览`, `用户监管`, and `平台监控`; future areas are visible only as locked slots. | `docs/ADMIN_CONSOLE_NAVIGATION_IA.md` and current React route model. | Needs label/order review. |
| CUI-03 | Core metrics | Four cards: platform health, risk cases, collection freshness, channel coverage. | Admin overview and usage monitor summaries. | Needs metric definition review. |
| CUI-04 | Risk cases | Queue with severity filters: all, high, medium, low. Rows show safe title, reason, object ref, and severity. | Computed candidates from portal request summaries and usage monitor rows. | Needs reason taxonomy review. |
| CUI-05 | User and resources | Table-first view of user account refs, related orders, quota usage, and risk state. | Portal access request summaries plus order usage metadata; owner page is `Accounts & Resources`. | Needs column review. |
| CUI-06 | Object timeline | Selected object history: account, order, subscription artifact, channel, usage, receipt, audit events. | Computed safe events are planning input only; durable history belongs to future `Audit & Cases`, not current Overview. | Needs backend gap review. |
| CUI-07 | Traffic and channels | Table with channel id, status, traffic, anomaly signal, freshness, receipt status, and usage meter. | Subscription usage monitor rows and safe channel/binding summaries drive `Usage & Channels`; Overview uses only aggregate signals and routing. | Needs exact status labels review. |
| CUI-08 | Empty states | Local or disconnected Admin can still show the shell, explain missing facts, and avoid fake data. | Existing local Admin session and loading/error states. | Needs copy review. |
| CUI-09 | Drilldown links | "View all" links should move to real pages only; no clickable placeholder pages. | Active pages for user/resource and usage monitor; locked slots for planned pages. | Needs route review. |
| CUI-10 | Safety boundary | No subscription URL, token, credential, raw config, raw logs, raw env, SQLite rows, or customer-private data. | Existing redaction tests and safe summary contracts. | Must remain mandatory. |

## Detailed Requirements

### Shell And Navigation

The shell should feel like a professional infrastructure console rather than a
single-purpose subscription screen. The first viewport uses a left navigation
rail, a top operation bar, and a content workbench. The shell can display
locked future areas, but a locked item must communicate why it is locked and
must not navigate to an empty page.

Required active areas:

- `总览`: cross-surface operating summary.
- `用户监管`: accounts, resources, orders, quota, and lifecycle facts.
- `平台监控`: usage accounting, channel health, collectors, receipts, and
  anomalies.

Required locked areas:

- `审计与工单`: durable cases, object history, audit notes, and review flows.
- `平台开发`: channel/node strategy, platform tooling, and future automation.
- `系统设置`: private operator configuration only.

### Core Metrics

The four metric cards are not marketing counters. They are operator signals:

- `平台健康`: whether current safe overview facts indicate that the platform is
  reviewable. It may show blocked when the Admin API is disconnected or
  distribution has blockers.
- `风险案件`: count of computed review candidates from orders, usage, receipts,
  expiry, and lifecycle facts.
- `采集新鲜度`: latest usage observation age against the monitor generation
  time, or a clear disconnected/not-collected state.
- `通道覆盖`: measured channel coverage across issued channel/binding facts.

These cards should never imply that production has been changed, paused,
archived, or repaired.

### Risk Case Queue

Risk cases are review candidates, not durable work orders yet. The first slice
can compute candidates from safe summaries and show:

- severity filter: `全部`, `高风险`, `中风险`, `低风险`;
- candidate title and reason;
- safe object type and object ref;
- selected state that drives the detail/timeline panel;
- no close, archive, disable, false-positive, note, or assignment action until
  a durable Case/history backend exists.

### User And Resource Supervision

Admin supervises user accounts and their resources. It does not use the old
model where Admin looks like a subscription creation surface.

The first table should focus on:

- safe user account ref;
- related order ref;
- quota usage ratio;
- risk or supervision state;
- link to the real user/resource page when that page has the same safe
  boundary.

Future controlled actions are about user account management, account disable,
resource review, quota review, or gated lifecycle plans. They are not casual
subscription creation buttons.

### Object Timeline

The timeline concept represents the Linear-like long-running history surface
that will eventually support cases, audits, notes, and object history. It is not
a current Overview-owned right-side panel; until durable history exists, owner
pages may show safe entry points and computed summaries only.

Timeline events should be object-bound:

- account lifecycle;
- order lifecycle;
- entitlement/quota updates;
- subscription artifact access;
- channel desired-state and receipt state;
- usage collection;
- future case workflow events.

Until the durable backend exists, the panel may show computed safe events from
current summaries and a clear empty state. It must not invent historical facts.

### Traffic And Channel Monitoring

The traffic/channel table is the core platform-monitoring area. It should help
an operator see whether each subscription/channel is being measured, whether
usage is stale, whether receipt evidence is missing, and whether quota usage is
abnormal.

Required columns:

- channel or node safe ref;
- collection status;
- measured traffic summary;
- anomaly/error signal derived from safe warnings and receipt gaps;
- collection freshness;
- receipt status;
- usage meter.

Actual runtime sample ingestion, quota enforcement, auto-disable, and collector
activation are separate gates. The UI can show facts and candidates, but it
does not execute those gates.

## Legacy UI Cleanup

The old Admin shell prototype has been removed from the active UI surface. It
was centered on direct subscription management, node lists, provisioning forms,
and channel gate workbench pages, which conflicts with the current Admin
responsibility model.

Removed code-only surfaces:

- legacy subscription creation and mutation page;
- legacy create, renew, reset-token, temporary-link, and disable dialogs;
- legacy overview, nodes, and provisioning pages;
- legacy shared component wrappers that were used only by those pages.

Retained surfaces:

- the current `运营总览`, `账号与资源`, and `流量与通道` routes;
- the Admin API client, session, connection panel, and safe summary types;
- `ModalFrame`, because User Portal still uses it;
- CSS utility classes such as `metric-card` and `status-badge`, because current
  pages still use those class names directly.

The cleanup does not remove backend routes or API client contracts. Those facts
remain useful for safe summaries, tests, and future page wiring. Further API
contract retirement should be handled as a separate backend review, not as a UI
file deletion side effect.

## Integration Phases

| Phase | Scope | Output | Validation |
| --- | --- | --- | --- |
| Phase 0 | Requirements and outline review. | This baseline, concept checklist, and navigation IA. | `git diff --check origin/master...HEAD`. |
| Phase 1 | Static UI support from existing safe summaries. | Dashboard shell, metric cards, case queue, user/resource table, channel table, object detail/timeline empty states. | Admin tests, build, Browser QA. |
| Phase 2 | Existing API wiring. | Use current overview, portal request, and usage monitor data without new mutation authority. | Admin tests, server tests for summary safety. |
| Phase 3 | Durable case/history backend. | Real case records, audit events, object timelines, notes, and work-order flows. | Separate B/A risk classification depending on schema and runtime impact. |
| Phase 4 | Controlled operations planning. | Gated pause/archive/quota/collector plans and dry-run review packets. | Separate Risk A gates for production-affecting behavior. |

## Object Responsibilities

| Area | Primary objects | Responsibility |
| --- | --- | --- |
| `总览` | accounts, orders, cases, usage summary | Cross-surface health, risks, and next review target. |
| `用户监管` | user accounts, resources, orders, entitlements, quota | Supervise account/resource ownership and quota state. |
| `平台监控` | channels, collectors, receipts, usage rows | Supervise collection freshness, channel coverage, and anomalies. |
| `审计与工单` | durable cases, audit events, object history | Planned; requires backend Case/history facts before promotion. |
| `平台开发` | nodes, channel candidates, strategy tools | Planned; requires real platform tooling and safe boundaries. |
| `系统设置` | private operator settings | Planned; must remain private and non-public. |

## Boundaries

Admin may visualize safe facts, surface risk candidates, and prepare review
context. Admin does not casually create subscriptions, expose raw subscription
material, or mutate production state.

The rebuild must not output or persist:

- raw subscription URLs;
- tokens, passwords, private keys, or credentials;
- raw runtime config, raw logs, raw env values, or SQLite rows;
- customer-private data.

Production pause, archive, restore, runtime apply, collector activation,
schema migration, auth changes, DNS, Nginx, systemd, firewall, cloud-provider
mutation, and live order creation remain separate Risk A gates.

## Acceptance For This Slice

This slice is complete only when:

- the dashboard first screen uses the new operator-console frame;
- active navigation stays tied to real pages;
- planned navigation slots are visibly gated and non-clickable;
- the first screen shows health metrics, selectable cases, and routing to
  user/resource supervision, traffic/channel supervision, and future audit
  history without duplicating their detailed ledgers;
- risk filters, freshness labels, anomaly status, receipt status, and usage
  meters are driven by existing safe Admin API summaries;
- tests assert the new shell semantics and no destructive Admin action button
  appears;
- `npm run admin:test`, `npm run admin:build`, `npm run project-state:check`,
  `npm test`, and `git diff --check origin/master...HEAD` pass before PR
  closeout.
