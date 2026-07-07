# Admin Console Figma Mirror

Last updated: 2026-06-27, America/Los_Angeles.

> Status:
> - Source Figma file:
>   <https://www.figma.com/design/NefQiIMOPIBU28TIYcwQFE/GlobalCircle-AI-Admin-UI-Baseline---2026-06-25>
> - Archived source handoff:
>   <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19>
> - Local contract: `admin/src/design/figma-mirror.ts`
> - Risk: C for this mirror document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This document is the current bridge between the Figma baseline, the React Admin
console, and visual QA. The mirror is not a second product surface. It records
which Figma source is allowed to drive implementation, which older material is
archive-only, and which local code/tests must stay aligned.

For the active design handoff entrypoint, use
`docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md`. For page layout and browser
acceptance criteria, use `docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md`.

## Current Source Boundary

| Item | Current value |
| --- | --- |
| Active Figma file | `NefQiIMOPIBU28TIYcwQFE` |
| Active Figma name | `GlobalCircle AI Admin UI Baseline - 2026-06-25` |
| Active owner-page route frames | `2:92` Operations Overview, `2:262` Accounts & Resources, `2:432` Usage & Channels |
| Active safe-read query frames | `59:4` User Management, `58:4` Order Management, `57:4` User Access Logs, `64:4` User Operation Logs, `61:4` Node Health, `62:4` Node Logs, `63:4` Node Bandwidth |
| Active page set | `00 Index & Project Map`, `01 Design Rules V1-Polish`, `02 Component Contract`, `03 Product Baseline Frames`, `04 Figma-to-React Mapping`, `90 Evidence Gates`, `99 Archive / Source Handoff` |
| Archived file | `oZuKNtGPhP6oOQ0MSzpfvn`; keep for lineage only |
| Deprecated directions | AppLibrary, NavigationLibrary, dock/appbar, hidden-module restore, drag/resize/windowing, and old current-implementation capture frames |
| Freeze state | Source boundary and ten route anchors are frozen in `ADMIN_FIGMA_BASELINE_FREEZE`; the seven feature routes remain component-gap open. Future changes must update the freeze gate and tests. |

Implementation must not use the archived handoff or old `373:*`, `99:*`, or
`104:*` nodes as the current source. If a rule from the archive is still useful,
copy it into the active baseline and review it there before implementing it.

## Frozen Baseline Gates

The following items are frozen for the current Admin UI phase:

| Frozen item | Meaning | Guard |
| --- | --- | --- |
| Active Figma source | `NefQiIMOPIBU28TIYcwQFE` is the only current design source. | `ADMIN_FIGMA_BASELINE_FREEZE`, `admin-figma-mirror-contract.test.ts` |
| Active route frames | The current active route anchors are the three owner-page frames plus seven safe-read query frames recorded in `ADMIN_FIGMA_BASELINE_FREEZE.activeRouteFrames`. | Mirror contract and evidence contract tests |
| Operations first screen | Health metrics render as summary; Risk Queue, Next Actions, and Review Candidates render as the three workspace panels. | `admin-dashboard.test.tsx`, `admin-visual-qa-contract.test.tsx` |
| Accounts and Usage first screens | Each renders three workspace panels plus lower evidence surfaces. | Page tests and visual QA contract tests |
| Safe-read query pages | User/order/log/node pages are route baselines for read-only query and navigation only; feature-specific components, DTOs, pagination, and backend adapters remain open. Create, mutate, export, runtime apply, and production actions remain gated. | Navigation, manifest, search, safe-read page, and mirror component-gap tests |
| Page section deep links | Legacy section deep links normalize to the owning page until section contracts are designed. | `navigation.test.ts` |
| Deprecated surfaces | AppLibrary, NavigationLibrary, hidden-module restore, dock/appbar, drag/resize, and OS windowing are not active product surfaces. | Navigation, mirror, and visual QA tests |

These frozen items can still change later, but only through an explicit design
gate update that changes the Figma baseline, local contract constants, tests,
and docs together.

## Not Frozen

The following items are intentionally not frozen:

- backend DTO/API integration;
- real production data wiring;
- mobile layouts below `1024px`;
- full reusable Figma component-set library;
- feature-specific table, filter, chart, log, detail, and action-gate components
  for the seven route shells;
- feature-page DTO/API adapters for user, order, log, node health, node log, and
  bandwidth pages;
- backend-backed mutation flows for user/order/log/node pages;
- future `System Settings` pages;
- runtime, auth model, schema, deployment, or production operations.

## Connector Evidence

Figma connector access on 2026-06-25 can read and write the active baseline.
The active product baseline now contains three owner-page frames plus seven
safe-read query frames. The seven query frames are current route baselines for
local UI, manifest, and System Search discovery, but they do not authorize
feature completion, backend DTO/API integration, mutations, exports, runtime
apply, or production operations.

Known local evidence:

| Evidence | Result |
| --- | --- |
| `admin/src/design/figma-mirror.ts` | Uses `NefQiIMOPIBU28TIYcwQFE` as `ADMIN_FIGMA_FILE_KEY` and records `oZuKNtGPhP6oOQ0MSzpfvn` as archive. |
| Contract test | `admin/src/test/admin-figma-mirror-contract.test.ts` verifies the active file key, route anchors, component contract cards, and visual QA axes against the clean baseline `2:*` route frames. |
| Screenshot QA | `output/playwright/admin-new-baseline-qa-1600x1024.png`, `output/playwright/admin-new-baseline-qa-1280x800.png`, and `output/playwright/admin-new-baseline-qa-1024x768.png` were captured during the first visual QA pass. |

The output screenshots are local QA artifacts and are intentionally ignored by
Git. They help review the live browser state but do not replace the Figma
baseline.

## Required Mirror Pages

The canonical local contract is `ADMIN_FIGMA_MIRROR_PAGES` in
`admin/src/design/figma-mirror.ts`.

| Frame | Node | Role | Maps to React |
| --- | --- | --- | --- |
| `00 Index & Project Map` | `0:1` | Source boundary and review order | All active pages |
| `01 Design Rules V1-Polish` | `2:2` | Shared visual and responsive rules | All active pages |
| `02 Component Contract` | `2:3` | Reusable shell, surface, row, gate, and feedback responsibilities | Shared primitives |
| `Operations Overview / Baseline / 1600x908` | `2:92` | Active Operations route baseline | `dashboard` |
| `Accounts & Resources / Baseline / 1600x908` | `2:262` | Active Accounts route baseline | `portalRequests` |
| `Usage & Channels / Baseline / 1600x908` | `2:432` | Active Usage route baseline | `usageMonitor` |
| `user-management` | `59:4` | Safe-read user management route baseline | `userManagement` |
| `order-management` | `58:4` | Safe-read order management route baseline | `orderManagement` |
| `user-access-logs` | `57:4` | Safe-read user access log route baseline | `userAccessLogs` |
| `user-operation-logs` | `64:4` | Safe-read operation log route baseline | `userOperationLogs` |
| `node-health` | `61:4` | Safe-read node health route baseline | `nodeHealth` |
| `node-logs` | `62:4` | Safe-read node log route baseline | `nodeLogs` |
| `Node Bandwidth Inspector / Baseline / 1600x908` | `63:4` | Safe-read node bandwidth route baseline | `nodeBandwidth` |
| `04 Figma-to-React Mapping` | `2:5` | Route/component/token/QA hook bridge | All active pages |
| `90 Evidence Gates` | `2:6` | Figma/GitHub/browser acceptance gates | All active pages |
| `99 Archive / Source Handoff` | `2:7` | Archived source and deprecated concepts | Lineage only |

## Component Contract Cards

The active Figma baseline currently records component responsibilities as
contract cards, not as a finished Figma component-set library.

| Contract card | Node | Local responsibility |
| --- | --- | --- |
| `ShellRail` | `23:5` | Route ownership, planned slots, responsive nav behavior |
| `TopBar` | `23:11` | System Search, environment, operator, route context |
| `MetricCard` | `23:17` | Summary value, trend slot, tone pairing |
| `StatusChip` | `23:23` | Semantic state chip, dot, label |
| `PanelFrame` | `23:29` | One-level operator panel chrome |
| `DataRowCompact` | `23:35` | Bounded compact row inside primary panels |
| `EvidenceSurface` | `23:41` | Lower trend/event-log evidence slots |
| `StateFeedback` | `23:47` | Empty/loading/stale/error feedback |
| `PrivilegedGate` | `23:53` | Read-only/gated/blocked safety surface |
| `Deprecated / SidebarNavigation` | `23:59` | Archive notice; do not implement as active component |

React/CSS may already have shared primitives for these concepts, but parity is
not complete until browser visual QA confirms the rendered UI follows the
baseline. Page-specific AI-generated assemblies are not reusable components
unless they are promoted through this contract.

## Page Ownership Rules

- `Operations Overview` is summary and routing only.
- `Accounts & Resources` owns account, resource, order, quota, lifecycle, and
  safe history-entry review.
- `Usage & Channels` owns collection freshness, channel coverage, usage ledger,
  collection anomalies, and receipt/collector evidence.
- `Audit & Cases` currently owns user access and operation log query pages.
- `Platform Development` currently owns node health, node logs, and node
  bandwidth query pages.
- Future `System Settings` and `About` areas remain planned until their UI and
  backend contracts exist.

The mirror must not reintroduce AppLibrary, NavigationLibrary, desktop dock,
freeform resize, hidden-widget restore, or OS-style windowing.

## Safe-Read Query Route Baselines

The clean Figma baseline contains seven user/order/log/node query pages in
`03 Product Baseline Frames`. These pages are approved as current local route,
manifest, and System Search entries only for safe-read query carrying.

Scope boundaries:

- render safe IDs, statuses, metrics, redacted details, filters, tables, and
  route ownership;
- keep create/edit/delete/pause/archive/export/runtime-apply controls disabled
  or gated until backend contracts exist;
- do not expose tokens, subscription URLs, credentials, raw logs, raw configs,
  raw SQLite rows, customer network data, or raw identity material;
- do not treat fixture/projection rows as production evidence.

Backend DTO contracts, pagination/query-state adapters, and browser visual QA
remain follow-up work before these pages can be considered fully functional.

### Seven-Page Component Gap Matrix

The current local implementation carries these pages through navigation,
manifest, System Search, and the generic safe-read renderer. It does not yet
implement the page-specific components visible in the Figma baseline.

| Route shell | Figma node | Local status | Missing feature component contracts | Missing DTO/API contracts |
| --- | --- | --- | --- | --- |
| User Management | `59:4` | Generic safe-read renderer only | Query toolbar, status filters, user table, readonly detail panel, account action gate | `accountManagementSummary.safeSearch`, table rows, detail DTO |
| Order Management | `58:4` | Generic safe-read renderer only | Query toolbar, delivery filters, order table, quota summary panel, order action gate | `orderManagementSummary.safeSearch`, table rows, quota usage DTO |
| User Access Logs | `57:4` | V2 source-rule Audit Table+Detail baseline aligned; backend adapter open | Backend-backed query state, case handoff gate, privileged export approval, responsive breakpoint frames | `userAccessLogSummary.safeSearch`, table rows, redacted detail DTO |
| User Operation Logs | `64:4` | V2 source-rule Audit Table+Detail baseline aligned; backend adapter open | Backend-backed query state, durable audit context handoff, privileged export approval, responsive breakpoint frames | `operatorLogSummary.safeSearch`, table rows, redacted detail DTO |
| Node Health | `61:4` | Generic safe-read renderer only | Node metric row, node health table, heartbeat status panel, diagnostic route preview | `nodeHealthSummary.safeSearch`, table rows, diagnostic preview DTO |
| Node Logs | `62:4` | Generic safe-read renderer only | Node-log toolbar, severity filter, redacted node-log table, privileged redaction gate | `nodeLogSessionSummary.safeSearch`, redacted rows, access-gate DTO |
| Node Bandwidth | `63:4` | Generic safe-read renderer only | Bandwidth metric row, trend chart, channel breakdown table, node activity event log | `nodeBandwidthSummary.safeSearch`, chart series, channel rows, activity events |

## Design-To-Code Mapping

| Figma concept | React/CSS target |
| --- | --- |
| `ShellRail` | `src/components/primitives/workspace-sidebar.tsx`, route metadata, nav CSS |
| `TopBar` | `src/components/layout/top-bar.tsx`, System Search contracts |
| `MetricCard` | `src/components/primitives/metric-card.tsx` |
| `StatusChip` | `src/components/primitives/status-chip.tsx` |
| `PanelFrame` | `src/components/primitives/panel-frame.tsx` |
| `DataRowCompact` | compact row grammar in page-owned panels |
| `EvidenceSurface` | `src/components/primitives/evidence-surface.tsx`, `src/app/admin-evidence-contract.ts` |
| `StateFeedback` | `src/components/primitives/state-feedback.tsx`, empty/table state surfaces |
| `PrivilegedGate` | `src/components/primitives/privileged-gate.tsx` and shell safety surfaces |

Current evidence contracts use baseline route frames `2:92`, `2:262`, and
`2:432` as their Figma source anchors. Old `24:*` and Visual Polish IDs are no
longer active source anchors.

## Visual QA Evidence Axes

Every visual QA pass should record:

1. Figma baseline status.
2. DOM contract status.
3. Browser desktop viewport status.
4. Browser responsive viewport status.
5. Style-token regression status.
6. Safe-data boundary status.

The automated contract for these axes is covered by
`admin/src/test/admin-figma-mirror-contract.test.ts` and
`admin/src/test/admin-visual-qa-contract.test.tsx`.

## Update Procedure

1. Update documentation source-boundary notes first when live Figma evidence
   changes and local code still lags.
2. Update `admin/src/design/figma-mirror.ts`, `admin/src/app/admin-evidence-contract.ts`,
   and related tests in a separate code-contract pass.
3. Update this document, `docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md`, and
   `docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md`.
4. Update only the active baseline file `NefQiIMOPIBU28TIYcwQFE` for current
   design work. Do not use the older handoff file as an implementation source.
5. Run focused Admin tests for the mirror and visual QA contracts.
6. Run Browser or Chrome viewport checks against the local Admin app before
   marking a visual task done.
7. Record exact validation commands and results.

## Hard Stops

- No raw subscription URLs, tokens, credentials, runtime config, env values,
  logs, SQLite rows, or customer-private data in Figma, docs, tests, or QA
  screenshots.
- No production Admin exposure.
- No production/runtime mutation from mirror or visual QA work.
- No detailed owner-page ledgers duplicated back into Overview.
