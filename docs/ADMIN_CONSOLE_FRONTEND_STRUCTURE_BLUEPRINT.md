# Admin Console Frontend Structure Blueprint

Last updated: 2026-06-18, America/Los_Angeles.

> Status:
> - Linear: GCC-73 under GCC-42
> - Risk: C for this Phase 1 structure blueprint; follow-up React implementation
>   is B unless it touches auth, schema, runtime, production gates, or deploys.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This document freezes the Phase 1 frontend page structure and module ownership
before more UI implementation work continues. It is a structure blueprint, not a
React implementation plan and not a design-system token spec.

Use it after:

- `docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md`
- `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`
- `docs/ADMIN_CONSOLE_NAVIGATION_IA.md`

Use it before:

- `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md`
- `docs/ADMIN_CONSOLE_APP_MAP.md`
- `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`
- any Phase 2 design-system work
- any Phase 3 React page implementation or cleanup

## Phase Boundary

Phase 1 only defines the product UI structure:

1. business requirements;
2. page ownership;
3. page-local sections;
4. rough page/module layout;
5. content fields and state coverage;
6. prompt path for later implementation.

Phase 1 does not implement React, wire new backend APIs, perform Browser QA,
create production actions, or introduce new runtime authority.

Current follow-up React work keeps that boundary: it implements only the local
Admin shell, App Library, plugin container rules, and persisted browser layout
preferences. It does not add backend authority, production mutation, schema
migration, or sensitive runtime data exposure.

## Frontend Containerization Model

The Admin console is designed as a frontend container system, not as a set of
unrelated pages. Each function enters the UI through a bounded container first,
then connects to safe backend adapters later.

```mermaid
flowchart TD
  Shell["Shell Container"]
  Page["Page Container"]
  Section["Section Container"]
  Widget["Widget Container"]
  Adapter["Data Adapter"]

  Shell --> Page
  Page --> Section
  Section --> Widget
  Widget --> Adapter

  Monitoring["Monitoring"]
  Management["Management"]
  Configuration["Configuration"]
  AuditWorkflow["Audit / Workflow"]
  PlatformTools["Platform Tools"]

  Widget --> Monitoring
  Widget --> Management
  Widget --> Configuration
  Widget --> AuditWorkflow
  Widget --> PlatformTools
```

| Layer | Purpose | Current rule |
| --- | --- | --- |
| Shell Container | Sidebar, top bar, search, environment, and operator context. | Shared shell only; no page-specific business tables here. |
| Page Container | One navigation page owns one operator question. | The page contract decides whether content is owner, preview, or evidence only. |
| Section Container | One task-focused group inside a page. | No unrelated long-scroll collections inside the same section. |
| Widget Container | Cards, tables, queues, timelines, drawers, forms, or tool panels. | Widgets expose layout and interaction boundaries before API connection. |
| Data Adapter | Static design data now, safe backend API adapter later. | Backend data must stay redacted, paged/filterable when needed, and scoped to the container. |

| Category | UI responsibility | Examples |
| --- | --- | --- |
| Monitoring | Read-only health, freshness, channel, usage, and anomaly evidence. | Health cards, channel coverage, usage ledger, anomaly queue. |
| Management | User, account, resource, order, artifact, quota, and lifecycle supervision. | Account directory, resource/order table, lifecycle review. |
| Configuration | Default values, thresholds, quota policy, private operator preferences. | Quota policy panel, future refresh/settings panels. |
| Audit / Workflow | Review candidates, object history, cases, work orders, and routing. | Risk queue, history preview, future durable cases. |
| Platform Tools | Safe diagnostics, channel tools, node onboarding, dry-run utilities. | Receipts/collectors diagnostics entry, future platform tools. |

Overview may use draggable, hideable, and reorderable widgets because it is a
summary workbench. Owner pages should prefer collapsible sections, saved
filters, detail drawers, and lazy-mounted widgets so management and monitoring
logic remains predictable.

The current React implementation treats each visible module as a plugin app:
the App Library is the restore/search entrypoint, the plugin card header owns
display controls, and `admin/src/app/plugin-workspace-engine.ts` owns the
shared local layout rules for visibility, restore, discrete size/height changes,
drag reordering, and pointer resize distance. Page frames should not invent
their own editor panels or module-specific layout semantics.
`admin/src/app/admin-app-manifest.ts` is now the concrete App Map source for
workspace pages, plugin apps, console utilities, planned apps, and safe App
Library search fields; `docs/ADMIN_CONSOLE_APP_MAP.md` documents that contract.
New app entries should also follow
`docs/ADMIN_CONSOLE_APP_MANIFEST_AUTHORING_STANDARD.md`, which freezes the
required authoring fields, entry types, layout sizes, runtime states, and
safe-search boundaries before additional visible UI is added.

## Visual Container Rules

The container model also defines the first visual style baseline:

- Shell, top bar, panels, subnav, widgets, and popovers must use shared Admin
  CSS tokens rather than one-off color/radius/shadow values.
- The desktop theme is part of the shell contract: canvas background,
  coordinate grid, bottom shelf, status bar, and dock each use dedicated tokens
  (`--admin-desktop-*`, `--admin-statusbar-*`, `--admin-dock-*`) so future
  pages do not restyle the operator desktop one component at a time.
- Phase 4 visual work must follow `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md`
  before adding App Library, plugin, workspace, chrome, or drag/resize
  behaviors.
- Sidebar navigation, page-local subnavigation, top-bar route links, and
  route/action cards share one nav-card format: compact height, 8px radius, 1px
  border, icon or marker slot, blue owner/selected state, and muted preview or
  locked state.
- Primary interaction color is blue; status colors are semantic only.
- Page sections use one visible panel layer. Do not nest cards inside cards.
- Overview widgets may be reorderable later; owner-page sections stay
  predictable and use collapsible/lazy detail containers instead.
- Workspace pages may keep container contracts in collapsed details, but the
  visible chrome should read as the operator console instead of a design draft.
- Plugin contracts use category chips, category connector bars, bounded metadata
  cells, and counted content/state/boundary slots so the React workspace can be
  reviewed before API wiring without showing redundant planning copy by default.

## Frontend Page Structure

```mermaid
flowchart TD
  Shell["Admin Console Shell"]
  Shell --> Sidebar["Sidebar Navigation"]
  Shell --> TopBar["Top Bar"]
  Shell --> Workbench["Page Workbench"]

  Sidebar --> Active["Active Areas"]
  Sidebar --> Locked["Locked Areas"]

  Active --> Overview["Overview / Operations Overview"]
  Active --> UserOps["User Operations / Accounts & Resources"]
  Active --> PlatformMonitoring["Platform Monitoring / Usage & Channels"]

  Locked --> AuditCases["Audit & Cases"]
  Locked --> PlatformDev["Platform Development"]
  Locked --> Settings["System Settings"]

  Overview --> O1["Health Summary"]
  Overview --> O2["Risk Queue"]
  Overview --> O3["Next Actions"]

  UserOps --> U1["Account Directory"]
  UserOps --> U2["Resources & Orders"]
  UserOps --> U3["Quota & Usage"]
  UserOps --> U4["Lifecycle"]
  UserOps --> U5["History & Events"]

  PlatformMonitoring --> P1["Collection Freshness"]
  PlatformMonitoring --> P2["Channel Coverage"]
  PlatformMonitoring --> P3["Usage Ledger"]
  PlatformMonitoring --> P4["Collection Anomalies"]
  PlatformMonitoring --> P5["Receipts & Collectors"]

  AuditCases --> Gate1["Locked until durable case/history facts exist"]
  PlatformDev --> Gate2["Locked until safe platform tools exist"]
  Settings --> Gate3["Locked until private settings boundary exists"]
```

## Page Ownership Map

| Page | Role | Primary question | Sections | Must not own |
| --- | --- | --- | --- | --- |
| `Operations Overview` | Overview and routing surface | What needs attention, and where should the operator go next? | `Health Summary`, `Risk Queue`, `Next Actions` | Account/resource ledger, object timeline, channel ledger, quota editing, order pause/archive, runtime apply. |
| `Accounts & Resources` | Decision owner | Which account owns which resources, and what quota or lifecycle decision is needed? | `Account Directory`, `Resources & Orders`, `Quota & Usage`, `Lifecycle`, `History & Events` | Collector activation, channel strategy, runtime apply, platform tooling, operator settings. |
| `Usage & Channels` | Evidence owner | Are usage collection, channels, and receipts trustworthy? | `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, `Collection Anomalies`, `Receipts & Collectors` | Account create/disable, quota ownership, order pause/archive, artifact lifecycle, runtime apply. |
| `Audit & Cases` | Locked future work area | What happened over time, who reviewed it, and what case state is durable? | `Case Inbox`, `Object History`, `Audit Notes`, `Work Orders`, `Close / False Positive Review` | Direct production execution. |
| `Platform Development` | Locked future work area | Which platform tool, strategy, or onboarding path should be reviewed? | `Channel Strategy`, `Node Onboarding`, `Collector Lab`, `API Diagnostics`, `Dry-run Tools` | User account operations and ungated production mutation. |
| `System Settings` | Locked future work area | How is this private console configured? | `Connection Settings`, `Environment Profiles`, `Refresh Policy`, `Permissions`, `Safety Policy` | Public user settings and auth model changes without a separate gate. |

## Module Ownership Graph

```mermaid
flowchart LR
  Shared["Shared UI primitives"]
  Shared --> Header["PageHeader"]
  Shared --> Section["SectionPanel"]
  Shared --> Metric["MetricCard"]
  Shared --> Table["DataTable"]
  Shared --> Chip["StatusChip"]
  Shared --> Meter["QuotaMeter"]
  Shared --> Ref["SafeRef"]
  Shared --> Freshness["DataFreshness"]
  Shared --> Sparkline["Sparkline"]

  Header --> Overview["Operations Overview"]
  Header --> Accounts["Accounts & Resources"]
  Header --> Usage["Usage & Channels"]
  Section --> Overview
  Section --> Accounts
  Section --> Usage

  Metric --> Overview
  Metric --> Usage
  Table --> Accounts
  Table --> Usage
  Chip --> Overview
  Chip --> Accounts
  Chip --> Usage
  Meter --> Accounts
  Meter -.-> Usage
  Ref --> Accounts
  Ref --> Usage
  Freshness --> Overview
  Freshness --> Usage
  Sparkline --> Overview
  Sparkline --> Usage

  RiskQueue["RiskQueue"] --> Overview
  RiskQueue -.-> Audit["Audit & Cases"]

  ObjectHistory["Object history / timeline"]
  ObjectHistory -.-> Audit
  ObjectHistory -.-> Accounts
  ObjectHistory -.-> Usage
```

## Operations Overview Structure

Purpose: show operator attention and route to the owner page.

```mermaid
flowchart TD
  Overview["Operations Overview"]
  Overview --> Header["Page header"]
  Overview --> Health["Health Summary"]
  Overview --> Risk["Risk Queue"]
  Overview --> Next["Next Actions"]

  Health --> H1["Platform health"]
  Health --> H2["Risk count"]
  Health --> H3["Collection freshness"]
  Health --> H4["Channel coverage"]

  Risk --> R1["Top computed candidates"]
  Risk --> R2["Severity filters"]
  Risk --> R3["Reason: quota / delay / receipt"]

  Next --> N1["Open Accounts & Resources"]
  Next --> N2["Open Usage & Channels"]
  Next --> N3["Explain locked Audit & Cases gate"]
```

Content requirements:

| Module | Content fields | State coverage | Route target |
| --- | --- | --- | --- |
| Health cards | label, value, source note, trend, freshness | loading, disconnected, ready, stale | None or owner-page action. |
| Risk queue | severity, reason, affected safe refs, count, source | empty, filtered, warning, danger | Owner page or future case page. |
| Next actions | owner page, why open it, gated/future state | ready, disabled, locked | `Accounts & Resources`, `Usage & Channels`, future `Audit & Cases`. |

Overview must not render full account tables, object timelines, or channel
ledgers. If a module needs filters, paging, drawers, or row-level action, it
belongs to the owner page.

## Accounts & Resources Structure

Purpose: own user account, resource, order, quota, and lifecycle decisions.

```mermaid
flowchart TD
  Accounts["Accounts & Resources"]
  Accounts --> Header["Page header"]
  Accounts --> Directory["Account Directory"]
  Accounts --> Resources["Resources & Orders"]
  Accounts --> Quota["Quota & Usage"]
  Accounts --> Lifecycle["Lifecycle"]
  Accounts --> History["History & Events"]

  Directory --> A1["Safe account refs"]
  Directory --> A2["Risk state"]
  Directory --> A3["Resource count"]

  Resources --> R1["Orders"]
  Resources --> R2["Entitlements"]
  Resources --> R3["Subscription artifact safe refs"]
  Resources --> R4["Delivery state"]

  Quota --> Q1["Default limit"]
  Quota --> Q2["Edited limit"]
  Quota --> Q3["Used / total"]
  Quota --> Q4["Measured channels as evidence"]
  Quota --> Q5["Audit note required gate"]

  Lifecycle --> L1["Account enabled/disabled"]
  Lifecycle --> L2["Order paused/expired"]
  Lifecycle --> L3["Artifact revoked"]
  Lifecycle --> L4["Archive candidate"]

  History --> H1["Case candidates"]
  History --> H2["Safe computed events"]
  History --> H3["Future durable audit entry"]
```

Content requirements:

| Section | Primary objects | Decisions owned here | Evidence allowed |
| --- | --- | --- | --- |
| Account Directory | user account | account review, create/disable planning | risk badges from usage/case summaries |
| Resources & Orders | resource, order, entitlement, artifact | resource/order lifecycle, artifact lifecycle review | channel refs and collection state |
| Quota & Usage | quota, usage summary | quota policy, over-limit disposition | freshness, measured channel count |
| Lifecycle | account, order, artifact | account disabled, order paused, expired, revoked, archive candidate | future audit/case evidence |
| History & Events | safe event, case candidate | review entry only until durable backend | usage/channel facts as context |

## Usage & Channels Structure

Purpose: own usage collection, channel coverage, receipt, and collector evidence.

```mermaid
flowchart TD
  Usage["Usage & Channels"]
  Usage --> Header["Page header"]
  Usage --> Fresh["Collection Freshness"]
  Usage --> Coverage["Channel Coverage"]
  Usage --> Ledger["Usage Ledger"]
  Usage --> Anomalies["Collection Anomalies"]
  Usage --> Receipts["Receipts & Collectors"]

  Fresh --> F1["Generated time"]
  Fresh --> F2["Observed age"]
  Fresh --> F3["Unknown / stale count"]

  Coverage --> C1["Issued channels"]
  Coverage --> C2["Measured channels"]
  Coverage --> C3["Missing channels"]
  Coverage --> C4["Receipt blockers"]

  Ledger --> L1["Account safe ref"]
  Ledger --> L2["Order safe ref"]
  Ledger --> L3["Channel safe ref"]
  Ledger --> L4["Traffic: upload / download / total"]
  Ledger --> L5["Collected time"]

  Anomalies --> A1["Delayed collection"]
  Anomalies --> A2["True zero usage"]
  Anomalies --> A3["Not collected"]
  Anomalies --> A4["Missing receipt"]

  Receipts --> R1["Receipt freshness"]
  Receipts --> R2["Collectors: availability"]
  Receipts --> R3["Future safe diagnostics"]
```

Content requirements:

| Section | Primary objects | Decisions owned here | Forbidden here |
| --- | --- | --- | --- |
| Collection Freshness | collector, usage sample | collection trust and stale/unknown diagnosis | quota editing, account disable |
| Channel Coverage | channel, receipt, edge credential ref | measured/missing channel diagnosis | channel runtime apply |
| Usage Ledger | usage sample, account/order refs | measurement evidence and correlation | order pause/archive decision |
| Collection Anomalies | usage sample, collector, receipt | anomaly classification | durable case close/reopen |
| Receipts & Collectors | receipt, collector | evidence availability and future diagnostics | raw logs, raw config, credentials |

## Locked Page Structure

Locked pages may be visible as non-clickable navigation slots, but they do not
get empty route pages.

```mermaid
flowchart TD
  Locked["Locked Work Areas"]
  Locked --> Audit["Audit & Cases"]
  Locked --> Dev["Platform Development"]
  Locked --> Settings["System Settings"]

  Audit --> A1["Needs durable case/history backend"]
  Audit --> A2["Needs audit event taxonomy"]
  Audit --> A3["Needs authorization and tests"]

  Dev --> D1["Needs real safe tools"]
  Dev --> D2["Needs no-secret data contracts"]
  Dev --> D3["Needs dry-run boundaries"]

  Settings --> S1["Needs private settings boundary"]
  Settings --> S2["Needs no public Admin exposure"]
  Settings --> S3["Needs explicit non-goals"]
```

## Data And Decision Flow

```mermaid
flowchart LR
  Backend["Safe backend summaries"]
  Backend --> Overview["Overview summary signals"]
  Backend --> Accounts["Accounts & Resources decision data"]
  Backend --> Usage["Usage & Channels evidence data"]

  Overview --> RouteAccounts["Route to account/resource owner"]
  Overview --> RouteUsage["Route to usage/channel owner"]
  Overview --> RouteAudit["Explain future Audit & Cases gate"]

  Usage --> Evidence["Usage/channel/receipt evidence"]
  Evidence --> Accounts

  Accounts --> Decision["Account/resource/quota/lifecycle decision"]
  Decision -.-> Audit["Audit & Cases"]
  Usage -.-> Audit
```

Rules:

- Overview summarizes and routes.
- Accounts & Resources owns user/resource/quota/lifecycle decisions.
- Usage & Channels owns measurement evidence and anomaly diagnosis.
- Audit & Cases owns durable case/history workflow only after backend facts
  exist.
- No page may display subscription URLs, tokens, credentials, raw runtime
  config, raw logs, raw env, raw SQLite rows, or customer-private data.

## Implementation Mapping

This blueprint maps to the current React contract without requiring immediate
implementation:

| Design concept | Current code anchor | Implementation note |
| --- | --- | --- |
| Top-level active areas | `consoleSections` in `admin/src/app/navigation.ts` | Keep active pages limited to real content. |
| Active pages | `AdminPage` in `admin/src/app/navigation.ts` | Current routes: `dashboard`, `portalRequests`, `usageMonitor`. |
| Page-local sections | `pageSubNavigation` in `admin/src/app/navigation.ts` | Section IDs must match page content anchors and tests. |
| Ownership boundary | `pageWorkbenchContracts` in `admin/src/app/navigation.ts` | Update docs, contract, tests, and QA together if ownership changes. |
| App and plugin registry | `admin/src/app/admin-app-manifest.ts` | Search, App Library grouping, safe route targets, and plugin restore metadata must come from the manifest. |
| Workspace layout engine | `admin/src/app/plugin-workspace-engine.ts` and `admin/src/app/plugin-layout-store.ts` | Keep hide/restore/resize/reorder behavior pure and tested before adding richer drag or persistence features. |
| Plugin container primitive | `admin/src/components/primitives/plugin-container.tsx` | Card-level controls belong in the plugin header; no separate page-level editor card. |
| Shared UI modules | `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` | Phase 2 design-system work should refine component states before broad implementation. |
| Visual QA | `docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md` | Phase 3 implementation should verify rendered pages against this structure. |

## Phase 1 Completion Checklist

Before starting Phase 2 or Phase 3 work, confirm:

1. Every active page has one primary operator question.
2. Every section has one owner page.
3. Every repeated object is marked owned, preview-only, or evidence-only.
4. Overview has no detailed account/resource ledger, object timeline, or channel
   ledger.
5. Accounts & Resources owns quota and lifecycle decisions.
6. Usage & Channels owns collection/channel/receipt evidence only.
7. Locked pages have entry gates and no empty route pages.
8. Future implementation has a code anchor and test anchor.
