# Admin Console Component And Function Blueprint

Last updated: 2026-06-17, America/Los_Angeles.

> Status:
> - Product Design brief: locked from the current concept image, existing
>   React/Vite Admin app, Horizon/NobleUI-style dashboard direction, and the
>   approved operator-console responsibility split.
> - Risk: C for this design blueprint; follow-up Admin UI implementation is B.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This document is the execution blueprint for the New Admin console design. It
connects the concept image, page requirements, component inventory, future
functions, backend gaps, implementation phases, and visual QA workflow.

Use it after:

- `docs/ADMIN_CONSOLE_REBUILD_BASELINE.md`
- `docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`
- `docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md`
- `docs/ADMIN_CONSOLE_NAVIGATION_IA.md`
- `docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md`
- `docs/ADMIN_UI_GITHUB_REFERENCE_STUDY.md`

## Design Brief

GlobalCircle AI Admin is a protected operator console. It supervises users,
resources, orders, quota, usage accounting, channel coverage, cases, audit
history, and future platform tools. It is not the User Portal, not a casual
subscription-creation panel, and not a production execution console.

The design draft is built in layers:

1. **Shell layer:** protected console frame, navigation, top bar, environment,
   search, alerts, and locked future slots.
2. **Page layer:** overview, user supervision, platform monitoring,
   audit/work orders, platform development, and system settings.
3. **Component layer:** reusable cards, chips, meters, tables, queues,
   timelines, drawers, forms, and empty states.
4. **Data layer:** existing safe Admin summaries first; new backend contracts
   only when a component needs facts that do not exist.
5. **Action layer:** visual review and dry-run context first; production
   mutation remains a separate Risk A gate.

## Visual Style Baseline

The first Admin rebuild style pass standardizes the console as a light,
international operator workbench. It is inspired by the approved concept image
and Horizon/NobleUI-style dashboard direction, but remains code-native and
project-specific.

| Style area | Baseline |
| --- | --- |
| Background | Light blue-gray app background with white surfaces; no dark shell and no heavy decorative gradients. |
| Surfaces | White or very light raised panels, 1px borders, low shadows, and `8px` panel/control radius. |
| Navigation | Left shell, page subnav, top-bar links, and route/action cards use one compact card rhythm: 8px radius, 1px border, icon/marker slot, blue selected/owner state, and muted locked or preview states. |
| Top bar | Sticky white translucent command bar with search, environment, alerts, operator, and connection controls. |
| Widgets | Metric cards, section panels, subnav links, and container cards share the same border/radius/shadow system. |
| Design-draft modules | Container cards expose typed category chips, a `Design adapter` stage, category connector bars, and counted content/state/boundary slots. |
| Palette | Blue is the primary interaction color; green, amber, red, neutral, and slate are semantic only. |
| Typography | Inter/system UI stack, no negative letter spacing, compact labels, readable dashboard titles. |
| Motion | Short hover/focus transitions only; no decorative animation in the design-draft layer. |

The visual contract is guarded by `admin/src/test/admin-style-contract.test.ts`
so later UI work does not drift back into one-off rough styling.
Phase 4 frontend quality work now uses
`docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md` as the Gate 0 source for exact spacing,
radius, shadow, App Library density, plugin geometry, icon sizing, and
responsive behavior before implementation sub-agents continue.
`docs/ADMIN_CONSOLE_APP_MAP.md` and `admin/src/app/admin-app-manifest.ts`
define the active workspace apps, plugin apps, console utilities, planned apps,
safe search fields, and follow-up task ownership used by the App Library.

## Tooling Roles

| Tool/plugin | Role in this lane | Boundary |
| --- | --- | --- |
| Product Design | Confirms the design brief, turns product objects into screen structure, and keeps the concept image as the visual source. | Does not override repo source, backend facts, or safety boundaries. |
| Build Web Apps | Translates approved design sections into React/Vite components and visual QA criteria. | No template migration or imported commercial UI code in this lane. |
| Chrome | Desktop-width visual QA, local Admin screenshots, and interaction checks when Browser/IAB viewport is too constrained. | Local testing only; no cookies, profile secrets, or external side effects. |
| Computer Use | Fallback Windows app inspection or visual capture if browser surfaces cannot show the needed state. | No Windows settings, security changes, terminal automation, or external side effects. |
| Browser/IAB | Fast local DOM and console checks for `http://127.0.0.1:5173/`. | Useful for local smoke; not sufficient alone for wide desktop fidelity if viewport is narrow. |
| Figma | Future editable source for final page frames when quota is available. | The repo remains behavior source of truth. |

## Design Source Stack

| Source | What it controls |
| --- | --- |
| Concept image `docs/assets/admin-console/new-admin-console-rebuild-concept.png` | Visual skeleton, visible copy, first-screen card inventory, table columns, timeline shape, and shell rhythm. |
| Current React/Vite Admin app | Implementation constraints, current routes, existing safe API client, tests, CSS system, and lucide icon usage. |
| Backend domain services | Business meaning for accounts, orders, artifacts, quota, usage, channel facts, receipts, and cases. |
| GitHub reference study | Pattern comparison and anti-pattern rejection. |
| Figma spec | Future editable design handoff for `Overview / Operations Overview`. |

Visible React Admin labels use English as the canonical UI language. Chinese
terms in this blueprint are planning notes and can later be mapped into locale
packs; implementation tests should anchor on English navigation and page labels.
The current content-layer contract covers the active Admin pages, shared
workbench primitives, and case candidate labels through
`admin/src/test/admin-english-copy-contract.test.ts`; User Portal remains a
separate self-service surface and is not part of this Admin copy contract.

## Page Map

| Page | Route state | Primary objects | Main job | First implementation state | Future implementation state |
| --- | --- | --- | --- | --- | --- |
| `Overview / Operations Overview` | Active | platform, cases, users, orders, channels, events | Answer what needs operator attention now. | Existing safe summaries compose metric cards, risk queue, and next-action routing to the owner pages. | Pixel-aligned overview concept can be revisited only through IA/test updates; durable history and richer trend data belong to owner pages first. |
| `User Operations / Accounts & Resources` | Active | account, resource, order, entitlement, artifact, quota | Supervise accounts and their resources. | Portal request summaries, quota metadata, safe refs, and controlled preview. | Account lifecycle backend, account create/disable flow, durable quota audit, resource lifecycle panels. |
| `Platform Monitoring / Usage & Channels` | Active | usage row, channel, collector, receipt, edge credential safe ref | Supervise usage collection trust and channel health. | Usage monitor summaries, collection anomaly queue, channel health, time-series, order ledger. | Collector health contract, channel rollup endpoint, richer historical trends. |
| `Audit & Cases` | Locked | case, audit event, object history, work order | Track long-running investigations and decisions. | Locked slot only. | Durable case/history store, notes, assignment, close/reopen, work-order packet generation. |
| `Platform Development` | Locked | node, channel candidate, strategy tool, dry-run packet | Support future platform development and safe tools. | Locked slot only. | Channel strategy, node onboarding readiness, collector lab, API diagnostics, dry-run utilities. |
| `System Settings` | Locked | operator setting, environment profile, permission, refresh policy | Configure private console behavior. | Locked slot only. | Admin connection settings, environment labels, refresh intervals, permissions, safety policy. |

## Front-End Page Logic

The React implementation is organized as a containerized workbench. The current
design draft renders this container contract directly so later API work can
attach to the correct UI boundary instead of mixing monitoring, management, and
configuration logic in one long page.

| Layer | Responsibility | Current source |
| --- | --- | --- |
| Shell Container | Protected frame, active navigation, locked future slots, command palette, environment, alert, and operator controls. | `AdminLayout`, `AppSidebar`, `TopBar`, and `admin/src/app/navigation.ts`. |
| Page Container | One operator workbench per active page. It owns layout, page-local sections, selected object state, and safe derived view state. | `dashboard-page.tsx`, `portal-requests-page.tsx`, and `subscription-usage-monitor-page.tsx`. |
| Section Container | One task-focused group under the page contract. | `AdminConsolePageFrame` and page-local blueprint modules. |
| Widget Container | Reusable cards, tables, queues, timelines, drawers, forms, or tool panels. | `admin/src/components/primitives/*`, including `WorkbenchContainerCard`. |
| Data Adapter | Static design data now; backend summaries later. It must not invent backend facts or expose sensitive material. | Page-local static blueprints first, future safe selectors/adapters later. |

Each module declares one category before it can be implemented as a real
business component:

| Category | What belongs here | First active examples |
| --- | --- | --- |
| `Monitoring` | Health, freshness, channel coverage, usage ledger, anomaly evidence. | Overview health, usage freshness, channel coverage, usage ledger, collection anomalies. |
| `Management` | Account/resource/order/artifact/lifecycle supervision. | Account directory, resources and orders, lifecycle review. |
| `Configuration` | Quota policy, thresholds, defaults, private operator preferences. | Quota policy panel. |
| `Audit / Workflow` | Review candidates, routing, history preview, future durable cases. | Risk queue, next actions, history and events. |
| `Platform Tools` | No-secret diagnostics, channel tools, collector/tooling entry points. | Receipts and collectors safe diagnostics entry. |

`admin/src/app/navigation.ts` now exports `pageWorkbenchContracts` as the
code-level guard for page ownership. Each active page must match one of these
roles before new UI is added:

| Role | UI meaning | Current page |
| --- | --- | --- |
| `overview` | Summarize cross-area risk and route the operator to the owning page. | `Operations Overview` |
| `decision-owner` | Own lifecycle, quota, account/resource, and future review decisions for its objects. | `Accounts & Resources` |
| `evidence-owner` | Own measurement trust, channel coverage, receipts, and anomaly diagnosis without taking account/quota lifecycle actions. | `Usage & Channels` |

Implementation rule: a component may show an object outside its owning page
only when the page contract marks that concern as `previewOnly` or
`evidenceOnly`. If a new component needs a forbidden decision, update the domain
dictionary, navigation IA, tests, and risk classification before implementing
the UI.

## Shared Component Inventory

### Shell Components

| Component | Purpose | Required functions | Current source | Future source | Phase |
| --- | --- | --- | --- | --- | --- |
| `AdminShell` | App frame with sidebar, top bar, and content area. | Active route rendering, locked slots, responsive shell, no-public-Admin signal. | `AdminLayout`, `AppSidebar`, `TopBar`. | Shared shell package inside `admin/src/components/layout`. | P0 |
| `SidebarNavigation` | Shows active and locked console areas. | Active item, disabled locked entry, entry-gate text, icon alignment. | `admin/src/app/navigation.ts`. | Feature gate metadata and permission summary. | P0 |
| `TopSearch` | Search users, orders, channels, cases, events. | Input shell, page-aware placeholder, active-page command results, empty state. | Top bar local command palette over active navigation items. | Safe global search endpoint or page adapters. | P2 |
| `EnvironmentPill` | Shows current environment and protected state. | Read-only environment label, status dot, Risk A gate menu. | Read-only top bar environment menu. | Private settings/environment profile summary. | P1 |
| `NotificationButton` | Shows risk/case count. | Badge count, click back to the Overview risk surface. | Computed dashboard risk candidates routed through the shell. | Durable case inbox with filtered route. | P2 |
| `OperatorMenu` | Shows safe operator identity. | Safe display name, help, shield, settings entry. | Read-only top bar operator menu. | Operator profile/permission summary. | P2 |

### Primitive Components

| Component | Purpose | Required functions | States | Test focus | Phase |
| --- | --- | --- | --- | --- | --- |
| `PageHeader` | Page title, responsibility, freshness, safety line. | Title, subtitle, refresh status, action slot. | loading, disconnected, stale, ready | Copy and freshness rendering. | P0 |
| `SectionPanel` | Single-level page section. | Header, helper text, action slot, body, stable empty state. | loading, empty, error, ready | No nested-card regression. | P0 |
| `MetricCard` | Operator KPI card. | Icon, label, value, note, sparkline, semantic tone. | success, info, warning, danger, neutral, disconnected | Values do not imply action. | P0 |
| `StatusChip` | Stable state language. | Label, tone, optional icon, compact size. | normal, warning, danger, muted, disabled | State taxonomy consistency. | P0 |
| `QuotaMeter` | Used/limit and channel coverage. | Ratio, used/total, overage, source, measured channels. | within, near, over, unmetered, uncollected | Zero/stale/unknown separation. | P0 |
| `DataFreshness` | Shows collection trust. | Last observed, generated time, P95/age label, stale threshold. | fresh, stale, missing, disabled | `0 B` not treated as fresh. | P1 |
| `Sparkline` | Tiny bounded trend. | SVG line/bar, empty state, semantic color. | positive, neutral, warning, danger, no-data | No fake production values. | P1 |
| `DataTable` | Dense operator table. | Header, row, sort-ready columns, overflow, empty/loading/error rows. | loading, empty, error, ready | Mobile/desktop no overlap. | P0 |
| `SafeRef` | Displays non-secret refs. | Short display, optional safe copy, type icon. | account, order, artifact, channel, credential-ref | No raw material. | P0 |
| `RiskQueue` | Selectable review candidates. | Severity filters, counts, row selection, reason taxonomy. | none, filtered-empty, selected, loading | No action buttons before durable cases. | P0 |
| `ObjectChain` | Linked account/order/artifact/channel path. | Type chips, selected object, safe refs. | partial, complete, missing | No raw URL/material. | P1 |
| `ObjectTimeline` | Safe event list. | Event filter, source chip, timestamp, detail, selected target. | computed, durable, empty | Computed events labeled honestly. | P1 |

## Overview Page Components

| Component/section | Function | Data source | Current gap | Later implementation |
| --- | --- | --- | --- | --- |
| Overview header | Shows `Operator Control Center`, refresh time, protected-console note. | Usage monitor generatedAt and page source availability. | Manual refresh action not wired yet. | Shared refresh action after page-level reload control is approved. |
| Platform health card | Indicates if platform is reviewable. | Admin overview distribution readiness and load errors. | Historical trend window missing. | Add history-backed trend when safe samples exist. |
| Risk cases card | Count review candidates. | Portal + usage case candidate builders. | Delta versus previous period missing. | Durable cases or local previous-window aggregate. |
| Collection freshness card | Shows latest/P95 collection latency. | Usage monitor generatedAt and observed usage timestamps. | P95 rollup missing. | Backend or selector-derived freshness summary. |
| Channel coverage card | Shows measured channel coverage. | Issued/measured channels and receipts. | Per-channel coverage rollup partial. | Channel aggregate endpoint. |
| Case queue | Selects top review candidate. | Computed safe candidates. | Durable case status unavailable. | Promote to durable case inbox. |
| Next-action routing | Sends detailed work to `Accounts & Resources`, `Usage & Channels`, or gated future `Audit & Cases`. | Active route contracts and computed safe signals. | Detailed ledgers intentionally live on owner pages. | Durable case/history backend and owner-page deep links. |

## User Supervision Components

| Component/section | Function | Data source | Current gap | Later implementation |
| --- | --- | --- | --- | --- |
| Account toolbar | Search/filter account, order, status, risk. | Portal request summaries. | Account status backend absent. | Account index endpoint and filter adapter. |
| Account summary table | Account ref, lifecycle, resource count, quota risk. | Derived from portal request summaries. | Lifecycle is placeholder. | Account lifecycle summary. |
| Account detail panel | Shows account enabled/disabled state and recent events. | Future account service. | Backend not present. | Account create/disable and audit trail. |
| Resource/order table | Shows order, plan, entitlement, artifact, lifecycle, quota. | Portal request summaries. | Full resource index partial. | Account-to-resource index endpoint. |
| Quota panel | Shows and edits traffic limit for delivered resources. | Current traffic limit update API. | Durable quota audit list missing. | Quota history and reason display. |
| Controlled delivery preview | Previews issuance inputs safely. | Existing approval preview API. | Not a full execution workflow. | Keep secondary; execution remains gated. |
| Account action drawer | Create, enable, disable account. | Future account service. | Requires auth/audit/backend contract. | Separate B/A scoped implementation. |
| Lifecycle separation row | Distinguishes account disabled, order paused, expired, revoked, over-limit. | Existing statuses + future fields. | Missing some backend fields. | State taxonomy endpoint or expanded summaries. |

## Platform Monitoring Components

| Component/section | Function | Data source | Current gap | Later implementation |
| --- | --- | --- | --- | --- |
| Freshness strip | Shows collector state, last collection, stale threshold, unknown count. | Usage monitor generatedAt, collection status. | Runtime collector health summary missing. | Collector health endpoint. |
| Usage cards | Upload/download/total, measured orders, zero usage, over-limit. | Usage monitor aggregates. | Trend windows partial. | Time-window aggregate endpoint. |
| Channel coverage cards | Issued/measured/missing channels and receipt blockers. | Usage rows and bindings. | First-class channel rollup missing. | Channel coverage endpoint. |
| Usage chart | Trend by account/order/channel. | Usage series when available. | History may be sparse. | Durable time-series query. |
| Collection anomaly queue | Stale usage, true zero, not-collected, collector disabled, missing receipt, and quota-risk evidence for correlation. | Warnings and derived selectors. | Backend anomaly summaries optional. | Durable cases or anomaly endpoint. |
| Channel ledger | Channel status, traffic, freshness, receipt, utilization, order count. | Aggregated usage rows. | Error rate/req-s fields missing. | Channel health rollup. |
| Order usage ledger | Account, order, plan, issued channels, safe binding coverage, usage, warnings. | Usage monitor rows. | Works for first slice. | Add pagination/export only after privacy review. |
| Receipts and collectors | Shows receipt binding, unbound rows, stale collection, collection gaps, and disabled collector counts. | Usage monitor rows and safe binding summaries. | Runtime collector health summary missing. | Collector health endpoint; visual-only until separate gate. |

## Active Page Ownership Slice

The 2026-06-16 IA cleanup makes each active page carry only its own page-local
sections. It does not introduce new routes or backend contracts.

| Page | Section order now enforced by tests | Ownership outcome |
| --- | --- | --- |
| `Operations Overview` | `Health Summary`, `Risk Queue`, `Next Actions` | Overview is preview-only and route-first. The older service/order/activity/warning/recent-activity detail panels plus account/resource, object-timeline, and channel ledgers are removed from this page so deep work routes to the owning page. |
| `Accounts & Resources` | `Account Directory`, `Resources & Orders`, `Quota & Usage`, `Lifecycle`, `History & Events` | Account directory leads the page. Resource order detail, controlled delivery preview, and preview result live under `Resources & Orders`; cases and object history live under `History & Events`. |
| `Usage & Channels` | `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, `Collection Anomalies`, `Receipts & Collectors` | Usage ledger owns filters, historical curves, activity summary, and the order ledger. Collection anomalies own usage/channel cases and anomaly queue. Receipts/collectors is a real visual supervision panel, not an empty anchor. |

## Audit And Work Orders Components

| Component/section | Function | Entry gate | Later implementation |
| --- | --- | --- | --- |
| Case inbox | Durable cases by severity, owner, status, object, updated time. | Case/history backend. | List, filter, select, assign after audit service exists. |
| Case detail | Evidence, linked objects, notes, source events, suggested next step. | Safe redaction tests. | No raw source rows; bounded evidence only. |
| Object history | Timeline for account/order/artifact/channel/receipt/quota. | Durable event taxonomy and storage. | Becomes source for overview timeline. |
| Review workflow | Assign, note, close, reopen, false-positive. | Authorization + audit trail. | UI actions only after backend contract. |
| Work-order bridge | Turn a case into dry-run plan or approval packet. | Explicit non-execution boundary. | Risk A packets are prepared, not executed. |

## Platform Development Components

| Component/section | Function | Entry gate | Later implementation |
| --- | --- | --- | --- |
| Channel strategy board | Compare channel candidates and rollout recommendations. | Safe channel planning adapters. | Read-only strategy first, no runtime apply. |
| Node onboarding readiness | Show no-secret node facts, registration readiness, material preflight. | Node registry and preflight summaries. | Links to Risk A runbooks only. |
| Collector lab | Review collector sample coverage and freshness proofs. | Collector service contract. | No collector activation button until approved. |
| API diagnostics | Safe route health, version/build metadata, API availability. | Redacted status endpoints. | No logs/env/config dumps. |
| Sandbox utilities | Dry-run-only helper forms. | Existing CLI/helper contracts when safe. | Output redacted packets only. |

## System Settings Components

| Component/section | Function | Entry gate | Later implementation |
| --- | --- | --- | --- |
| Admin API connection | Local/private base URL and console session input. | Existing connection panel. | Move from setup page/top bar into settings route. |
| Environment profiles | Safe labels for local/staging/production contexts. | Private config summary. | Do not show secret values. |
| Refresh settings | Auto refresh, manual refresh, stale thresholds. | Local UI settings. | Persist private operator preferences. |
| Permissions panel | Operator role, locked sections, feature visibility. | Operator profile/permission backend. | No auth model changes in UI-only work. |
| Safety policy | Redaction, no-public-Admin, Risk A reminders. | Static policy and docs links. | Link to runbooks, not execution buttons. |

## State Taxonomy

| Domain | Distinct UI states |
| --- | --- |
| Account | `启用`, `账号已禁用`, `待接入账号状态`, `需复核` |
| Order/resource | `待处理`, `待发放`, `已发放`, `已暂停`, `已到期`, `已撤销`, `待归档` |
| Quota | `正常`, `接近额度`, `超额`, `未限额`, `未采集` |
| Collection | `已采集`, `零用量`, `延迟`, `未采集`, `采集关闭`, `采集不可用` |
| Channel | `正常`, `降级`, `异常`, `未使用`, `回执缺失`, `回执延迟` |
| Case | `高风险`, `中风险`, `低风险`, `待处理`, `已关闭`, `误报` |
| Safety | `预览`, `只读`, `需要门禁`, `执行未授权`, `生产动作禁止` |

Rules:

- `0 B` must not mean unknown by itself.
- Account disabled and order paused are different states.
- Subscription artifact revoked and runtime credential missing are different
  states.
- A page may show a future state only if it also shows that the backing
  contract is not connected yet.

## Data Contract Map

| Need | Existing support | Gap | Follow-up risk |
| --- | --- | --- | --- |
| Platform health | Admin overview summary. | Health trend and freshness history. | B if API summary changes. |
| Portal/resource rows | Portal access request summaries. | Account lifecycle and resource index. | B for backend summary contract. |
| Order usage | Usage metadata on portal summaries and usage monitor rows. | Live runtime sample activation. | Risk A for runtime collector activation. |
| Traffic limit edit | Safe traffic limit update API for delivered requests. | Durable quota audit history. | B for audit summary; A if enforcement mutates production. |
| Channel health | Usage monitor rows, issued channels, bindings. | First-class channel rollup, req/s, error rate. | B for summary endpoint. |
| Cases | Computed candidates. | Durable case/history store. | B/A depending on schema/migration and production use. |
| Object timeline | Computed safe events. | Durable object event taxonomy and storage. | B/A depending on migration. |
| Settings | Local Admin session and static safety copy. | Operator profile, permissions, persisted preferences. | B for local/private settings; A if auth model changes. |

## Implementation Phases

| Phase | Scope | Output | Validation |
| --- | --- | --- | --- |
| P0 Design blueprint | This component/function blueprint and docs index wiring. | `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`. | `git diff --check origin/master...HEAD`; `npm run project-state:check` if state updated. |
| P1 Shared primitives | Extract shell, cards, chips, meters, tables, queues, empty states. | Reusable React components and CSS tokens. | `npm run admin:test`, `npm run admin:build`, Browser/Chrome QA. |
| P2 Overview parity | Match the concept first screen against the Figma spec. | Desktop-first overview plus responsive fallback. | Concept screenshot vs implementation screenshot ledger. |
| P3 User supervision | Make account/resource/order/quota separation complete. | `Accounts & Resources` master/detail workbench. | Admin tests plus safe-summary server tests if API changes. |
| P4 Platform monitoring | Make freshness/channel/anomaly states impossible to confuse. | `Usage & Channels` monitor workbench. | Admin tests, usage monitor server tests, visual QA. |
| P5 Durable cases/history | Promote `审计与工单` from locked slot. | Case inbox, detail, notes, object history. | Separate design, backend contract, schema gate, tests. |
| P6 Platform dev/settings | Promote planned slots only after real contracts. | Safe tools and private settings. | Per-page B/A classification before coding. |

### P1 Implementation Ledger

- 2026-06-16: The first shared primitive slice is coded in
  `admin/src/components/primitives`: `MetricCard`, `StatusChip`, and
  `QuotaMeter` are covered by component tests and wired into the Overview page.
- 2026-06-16: The second shared primitive slice adds `SectionPanel`,
  `DataTable`, `SafeRef`, and `EmptyState`, then rewires the Overview user/resource
  and traffic/channel workbench cards to use those shared primitives.
- 2026-06-16: The P1.2 follow-up adds shared `PageHeader` and `DataTable`
  loading/error/empty state rows, then rewires the Overview page header and
  workbench tables so loading and failed source states keep stable table headers.
- 2026-06-16: The P1.3 styling contract adds shared `--admin-*` CSS tokens
  for the protected shell, sidebar, top bar, content padding, panels, workbench
  gaps, table rows, status chips, quota meters, empty states, and case queue
  surfaces. `admin/src/test/admin-style-contract.test.ts` guards the first token
  routing layer so later pages can extend the same visual system instead of
  adding one-off styles.
- 2026-06-16: The P1.4 workbench primitive slice adds shared `RiskQueue`,
  `ObjectChain`, and `ObjectTimeline` primitives, then rewires the Overview case
  workbench wrapper to keep only business label mapping in
  `features/admin-case-workbench`. These are display-only primitives for safe
  refs, evidence chains, and object history; backend Case mutation, notes,
  false-positive handling, closure, and archive actions remain gated future work.
  Remaining P1 work includes broader low-risk cross-page adoption and any shell
  extraction that can be done without changing route ownership.
- 2026-06-17: The P1.5 design-draft polish adds typed visual treatment to
  `WorkbenchContainerCard`: category chip, category icon, `Design adapter`
  stage, category connector, bounded metadata cells, and counted blueprint
  slots. This makes the current React pages behave as a scannable design spec
  while the finished management panel remains a later implementation phase.

### P2 Implementation Ledger

- 2026-06-16: The first Overview concept-parity slice was coded in
  `admin/src/pages/dashboard-page.tsx` and shared primitives. The page header now
  renders `Refreshed at HH:mm:ss` from safe monitor timestamps, the four metric cards
  include bounded SVG sparklines from current safe aggregates, and early concept
  parity explored detailed timeline/channel preview panels. Durable Case/history
  storage, manual refresh, request/error-rate channel metrics, and production
  collector/runtime activation remain future gated work. This entry is
  historical and superseded by the P2.5 ownership cleanup below: detailed
  timeline and owner-page preview panels are no longer current Overview
  implementation targets.
- 2026-06-16: The P2.2 Overview parity slice made the workbench selectable
  across computed cases and concept-sourced account/channel rows. The case queue
  exposed a disabled `View all cases` footer so the durable case inbox was
  visible but not clickable, and channel rows reserved future request-rate and
  error-rate fields without inventing runtime facts. First-class request-rate
  rollups, durable case inbox, and object-history persistence remain future
  data-contract work. This entry is also historical; the current page-ownership
  prompt routes these detailed rows to `Accounts & Resources` and
  `Usage & Channels`.
- 2026-06-16: The P2.3 shell-control slice turns the top bar into usable
  protected-console controls. The global search now acts as a command palette
  over active routes only, so locked future slots stay out of clickable results.
  The risk notification badge is fed by the Dashboard's computed case candidates
  and routes back to the Overview risk surface. Environment and operator controls
  now open read-only menus that state the production/Risk A gate and the future
  account-management task line without executing mutations. A safe global search
  endpoint, durable case-inbox filtering, operator profile data, and private
  settings remain future data-contract work.
- 2026-06-16: The P2.4 content-language slice makes active Admin production copy
  English canonical across `Operations Overview`, `Accounts & Resources`,
  `Usage & Channels`, shared workbench primitives, and computed case candidates.
  Date rendering now uses English locale output in active Admin pages, and
  `admin/src/test/admin-english-copy-contract.test.ts` guards against Chinese
  copy drifting back into the active Admin content layer. Future Chinese UI
  should be introduced through an explicit locale pack rather than inline page
  copy.
- 2026-06-16: The P2.5 page-ownership cleanup enforces active-page section
  order in Admin tests. `Operations Overview` is now preview-only and no longer
  renders service/order/activity/warning/recent-activity detail panels.
  `Accounts & Resources` now starts with account directory, nests controlled
  delivery preview under `Resources & Orders`, and puts cases under
  `History & Events`. `Usage & Channels` now keeps filters, historical curves,
  activity summary, and order ledger under `Usage Ledger`; keeps cases and the
  anomaly queue under `Collection Anomalies`; and renders a real
  `Receipts and collectors` panel from safe usage-monitor facts.

## QA And Review Plan

| Review target | Tool | Checks |
| --- | --- | --- |
| Local DOM and console | Browser/IAB | Routes load, no Vite overlay, no console errors, core labels visible. |
| Desktop visual fidelity | Chrome | 1600px overview screenshot compared against concept/Figma spec. |
| Windows visual fallback | Computer Use | Capture Chrome or design app state if browser viewport/plugin is blocked. |
| Component fidelity | Build Web Apps workflow | Compare concept and implementation for layout, copy, color, spacing, icons, table density, and responsive behavior. |
| Product structure | Product Design workflow | Confirm pages/components still match the operator-console brief and backend domain model. |
| Automated repo validation | npm/git | Admin tests, build, project-state check, full test suite when code changes. |

Visual QA ledger must cover at least:

1. navigation and locked slots;
2. top search/environment/alert/operator bar;
3. four overview metric cards;
4. risk queue and next-action routing on Overview;
5. account/resource detail on `Accounts & Resources` and usage/channel detail on
   `Usage & Channels`;
6. mobile/narrow fallback with no overlapping text.

## Acceptance For This Blueprint

This design draft is ready for implementation planning when:

- every visible page has component ownership and future implementation notes;
- every shared primitive has purpose, states, and test focus;
- every active data need is mapped to existing support or a named gap;
- locked pages have entry gates and are not treated as placeholder routes;
- Chrome/Computer/Browser/Build Web Apps/Product Design responsibilities are
  explicit;
- no production mutation or sensitive material display is authorized by this
  document.
