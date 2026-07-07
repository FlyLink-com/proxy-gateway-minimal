# Admin Console UI Content Matrix

Last updated: 2026-06-26, America/Los_Angeles.

> Status:
> - Type: UI design copy and implementation matrix
> - Risk: C for this document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions

This document collects the current Admin design copy from the IA, visual
protocol, Figma mirror, component blueprint, and React page blueprints. Its job
is to turn scattered planning text into a page-by-page UI content contract
before the next visual design implementation pass.

Use `docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md` with this document when the
task is layout, visual hierarchy, surface treatment, responsive behavior, or
Browser/Chrome visual QA. This document answers what appears; the layout/effect
matrix answers how it is arranged and judged.

The Admin baseline is a design foundation. It is not a claim that the active
pages are business-complete, backend-complete, or visually final.

## Source Stack

Use these sources in this order:

| Source | What it controls |
| --- | --- |
| `docs/ADMIN_CONSOLE_NAVIGATION_IA.md` | Page ownership, active navigation, planned slots, and page-local sub-navigation. |
| `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md` | Object wording and ownership boundaries. |
| `docs/ADMIN_CONSOLE_FRONTEND_STRUCTURE_BLUEPRINT.md` | Page structure, module ownership graph, data/decision flow, and locked-page gates. |
| `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md` | Spacing, density, shell, surface hierarchy, typography, icon, and responsive rules. |
| `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md` | Figma frame and component mirror alignment. |
| `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` | Component roles, future functions, and page implementation boundaries. |
| `admin/src/pages/*` page blueprints | Current module purpose, fields, states, ownership, boundaries, and next-step text. |

Use the visual protocol for tokens, density, component geometry, and QA
constraints. Do not use this matrix to reintroduce the older App Library /
browser-OS experiment as the implementation target; the current target is the
structured Admin workbench described by the Figma mirror and navigation IA.

## Copy Classification

The current code already contains useful design copy. The next UI pass must
separate it into these layers:

| Copy class | Should be visible in the product UI? | Examples | Rule |
| --- | --- | --- | --- |
| Navigation copy | Yes | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | Stable English labels only. |
| Module title copy | Yes | `Health Summary`, `Risk Queue`, `Quota & Usage`, `Usage Ledger` | Short, scannable, owner-page specific. |
| Field and column copy | Yes | `Account`, `Order`, `Channel`, `Traffic`, `Collected`, `State` | Table-first wording, no implementation jargon. |
| State copy | Yes | `Ready`, `Stale`, `Disabled`, `Missing receipt`, `Over limit` | Honest status language, never color-only. |
| Action copy | Yes, only when backed by an allowed UI action | `Open owner page`, `Review evidence`, `Check connection` | No write or production mutation copy before gates exist. |
| Support copy | Sometimes | Empty, stale, disconnected, locked, no-data states | Show only when it helps an operator decide the next safe step. |
| Design-only copy | No | `purpose`, `ownership`, `nextStep`, `dataAdapter`, `performanceBoundary` | Keep in docs, code metadata, tests, or developer-only fixtures. |
| Future/backlog copy | No, except locked slots | Future `Audit & Cases`, `Platform Development`, `System Settings` details | Locked slots may name the area but must not imply shipped functionality. |

## Active Page Content Matrix

| Page | Active route state | Page job | Visible page identity | Current design status | Next design goal |
| --- | --- | --- | --- | --- | --- |
| `Operations Overview` | Active | Summarize platform health, risk, and next owner-page route. | Page title, protected console status, freshness summary, risk count. | Baseline page and Figma mirror exist; content is still mostly design/fixture shaped. | Convert to a polished first-screen dashboard: metric row, risk queue, and owner-route actions only. |
| `Accounts & Resources` | Active | Supervise accounts, resources, orders, quota, lifecycle, and safe history preview. | Account/resource workbench title, filters, selected object context. | Page blueprints exist; content needs final information hierarchy and table/drawer design. | Build the owner-page UI for account/resource decisions without duplicating monitoring ledgers. |
| `Usage & Channels` | Active | Supervise collection trust, channel coverage, usage evidence, anomalies, receipts, and collectors. | Monitoring workbench title, freshness/channels status, evidence tables. | Safe usage view-model helpers and fixture-preview surfaces exist; UI still needs final monitoring layout. | Build the evidence-owner page around freshness, channel coverage, ledger, anomaly, and receipt panels. |
| `Audit & Cases` | Planned/locked | Durable cases, object history, notes, work orders, and close/reopen workflow. | Locked slot only. | Not an active route. | Keep out of active UI until durable case/history contracts exist. |
| `Platform Development` | Planned/locked | Future no-secret platform tools and diagnostics. | Locked slot only. | Not an active route. | Keep out of active UI until safe tool contracts exist. |
| `System Settings` | Planned/locked | Private console settings, environment profiles, permissions, and safety policy. | Locked slot only. | Not an active route. | Keep out of active UI until private settings boundaries exist. |

## Current Clean Baseline Visible Mapping

The accepted clean baseline route cards define the current desktop first-screen
content. The fuller ownership matrices below remain the domain backlog, but
they must not be rendered as extra first-screen cards until a subpage, drawer,
or route split is designed.

| Page | Current frame | Visible first-screen content |
| --- | --- | --- |
| `Operations Overview` | `2:92` | ShellRail, TopBar System Search, four metrics, `Risk Queue`, `Next Actions`, `Review Candidates`, lower Operations metrics/event evidence. |
| `Accounts & Resources` | `2:262` | ShellRail, TopBar System Search, four account/resource metrics, `Account Directory`, `Resources & Orders`, `Lifecycle`, lower Account metrics/event evidence. |
| `Usage & Channels` | `2:432` | ShellRail, TopBar System Search, four usage/channel metrics, `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, lower Usage metrics/event evidence. |

Current compression rules:

1. Page title/subtitle/header badges are hidden in normal operator UI.
2. `Quota & Usage`, `History & Events`, `Collection Anomalies`, and
   `Receipts & Collectors` remain valid domain modules, but the current
   clean-baseline first screen expresses them through metrics, event evidence,
   later subpages, drawers, or future route splits.
3. System Search is normal top-bar search. It must not open AppLibrary,
   NavigationLibrary, dock, or browser-OS surfaces.
4. No current first-screen module may expand by adding long planning text; use
   a subpage, drawer, tooltip, or state-feedback surface instead.

## Operations Overview Modules

| Module | Visible UI copy | Main fields | Required states | Preferred UI shape | Design-only copy to keep hidden | Next implementation target |
| --- | --- | --- | --- | --- | --- | --- |
| `Health Summary` | Health, risk, freshness, coverage. | Platform health, risk count, freshness age, channel coverage. | Loading, disconnected, ready, stale/partial. | Four compact metric cards plus trend/sparkline space. | Purpose, owner-page boundary notes, API reconnect note. | Replace any draft explanatory strips with metric-card and state-chip primitives. |
| `Risk Queue` | Review candidates and owner route. | Severity, reason, affected safe refs, candidate count, owner page. | Empty, filtered, warning, danger. | Bounded queue with severity filters and selected row. | Durable-case future workflow copy and close/reopen language. | Render as queue, not as a case-management surface. |
| `Next Actions` | Open owner page, review evidence, locked future work. | Owner page, reason, gate, locked state. | Ready route, disabled route, locked future area. | Action cards or compact routing list. | Backend write, collector activation, production execution notes. | Deep-link to page sections only after section anchors are stable. |

## Accounts & Resources Modules

| Module | Visible UI copy | Main fields | Required states | Preferred UI shape | Design-only copy to keep hidden | Next implementation target |
| --- | --- | --- | --- | --- | --- | --- |
| `Account Directory` | Accounts, state, resources, risk, activity. | Safe account ref, account state, linked resource count, risk chip, last safe event. | Empty, normal, needs review, disabled. | Filterable account table with selected account context. | Backend account-model gap and create/disable planning text. | Design the table and selection drawer before enabling account actions. |
| `Resources & Orders` | Orders, plan, artifact, delivery, channels. | Safe order ref, entitlement state, artifact safe ref, delivery state, channel safe refs. | Pending review, pending delivery, delivered, expired/revoked. | Dense table plus detail drawer. | Raw subscription output, credential material, runtime apply language. | Finalize object columns and overflow behavior. |
| `Quota & Usage` | Quota policy, usage, measured channels, review note. | Default quota, edited quota, used/total, measured channel count, review note. | Within quota, near quota, over limit, unmetered/collection gap. | Policy panel with quota meter and disabled edit affordance until approved. | Collector trust diagnosis and channel coverage ownership copy. | Keep usage as evidence; quota decision stays in this page. |
| `Lifecycle` | Account, order, artifact, archive, evidence. | Account lifecycle, order pause/expiry candidate, artifact revoked state, archive candidate, required evidence. | Active, paused, expired, revoked, archive candidate. | Review lanes with dry-run planning space. | Direct production mutation and runtime service control copy. | Split read-only review, dry-run preview, and approved mutation phases later. |
| `History & Events` | Safe event, object, source, case candidate. | Event label, safe ref, source, candidate reason, restricted future slot. | No events, context available, case backend locked, write unavailable. | Bounded timeline preview. | Raw logs, raw SQLite row, note-write language. | Keep as computed preview until restricted case workflow owns durable history. |

## Usage & Channels Modules

| Module | Visible UI copy | Main fields | Required states | Preferred UI shape | Design-only copy to keep hidden | Next implementation target |
| --- | --- | --- | --- | --- | --- | --- |
| `Collection Freshness` | Generated, latest usage, unknown, stale, delay. | Monitor generated time, latest observed age, unknown count, stale count, threshold. | Fresh, stale, unknown, disconnected. | Monitoring strip with expandable detail. | Quota/account lifecycle boundary notes. | Reconnect after collector DTO and layout approval. |
| `Channel Coverage` | Channels, measured coverage, utilization, blockers, latency. | Channel safe ref, issued/measured count, utilization, error rate, receipt blocker, p50/p95/p99. | Fully measured, partial, missing receipt, route stale, no issued channel. | Coverage cards plus safe ledger. | Node provisioning, runtime apply, credential/material language. | Rebuild from redacted monitor rows and later channel rollup. |
| `Usage Ledger` | Account, order, channel, traffic, collected. | Safe account ref, safe order ref, safe channel ref, upload/download/total, collected timestamp. | Measured, measured zero, not collected, collector disabled. | Read-only data table. | Quota controls, pause/archive actions, artifact lifecycle copy. | Finalize privacy filters, columns, and pagination before live rows. |
| `Collection Anomalies` | Reason, severity, affected refs, evidence, owner page. | Anomaly type, queue level, safe refs, evidence source, handoff owner. | No anomalies, delay warning, zero usage, collection gap, missing receipt. | Bounded anomaly queue with filters. | False-positive close, note write, durable case action copy. | Map taxonomy to future case candidates after usage rows are reconnected. |
| `Receipts & Collectors` | Receipts, pending/missing counts, agent, collector, inspection. | Receipt freshness, pending count, missing count, heartbeat/version, pull/push state, inspection result. | Healthy, pending, disabled, degraded, warning, diagnostics locked. | Read-only diagnostics entry panel. | Raw logs, raw config, audit trail, credential or edge material output. | Connect no-secret diagnostics only after data contracts and tests exist. |

## Visible Copy Cleanup Rules

The next visual UI pass should remove or hide copy that reads like a design
document instead of an operator console:

1. Do not render `purpose`, `ownership`, `boundaries`, or `nextStep` as normal
   page content.
2. Do not show module counts, field counts, or design-adapter labels unless the
   page is explicitly in a developer/design-review mode.
3. Keep action labels short. If the action is not implemented, show a locked or
   disabled state instead of long explanatory text.
4. Prefer tables, chips, meters, queues, and state feedback over paragraphs.
5. Use page-local drawers or popovers for detail, not nested cards inside cards.
6. Keep Overview free of owner-page ledgers. It routes to owner pages instead.
7. Keep `Usage & Channels` free of quota/lifecycle decisions. It provides
   evidence only.
8. Keep `Accounts & Resources` free of collector/runtime controls. It owns
   account, order, quota, and lifecycle decisions.

## Fixture And Safety Policy

For the UI design phase:

- Use fixtures or safe mock data only.
- Use safe refs such as account refs, order refs, channel refs, and artifact
  refs.
- Never display tokens, credentials, subscription URLs, raw configs, raw logs,
  raw SQLite rows, raw env values, edge material, or customer-private data.
- Label disconnected, missing, unknown, and stale data honestly.
- Do not imply a write path exists because a future module needs it.

## Design Implementation Checklist

Before the next Admin UI visual PR is ready:

1. Each active page uses the module list in this matrix as its visible content
   boundary.
2. Each module maps to shared primitives where possible: `PanelFrame`,
   `MetricCard`, `StatusChip`, `DataTable`, `StateFeedback`, and safe refs.
3. Design-only copy is kept out of the visible product UI.
4. The UI keeps the ownership model from navigation IA and domain dictionary.
5. Figma component mirror names stay aligned with React primitive names.
6. Browser/Chrome visual QA captures desktop and narrow widths after the
   visual pass.
7. Admin tests cover English copy, route ownership, component hooks, and
   no-sensitive-output boundaries.

## Out Of Scope

This matrix does not approve:

- backend DTO changes;
- live API connection;
- account creation or disablement;
- order pause/archive/restore;
- quota mutation without a reviewed contract;
- collector activation;
- runtime apply;
- audit/case note writes;
- schema or migration work;
- production, cloud, DNS, Nginx, systemd, firewall, or deploy actions.
