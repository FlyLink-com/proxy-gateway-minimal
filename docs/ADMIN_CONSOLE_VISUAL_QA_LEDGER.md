# Admin Console Visual QA Ledger

Last updated: 2026-06-25, America/Los_Angeles.

> Status:
> - Linear: GCC-68
> - Type: Concept-to-implementation visual QA ledger
> - Risk: C for this ledger; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This ledger records how the New Admin console concept image maps to the local
React/Vite implementation and how Browser, Chrome, and Computer should be used
for visual acceptance.

Source references:

- Concept image:
  `docs/assets/admin-console/new-admin-console-rebuild-concept.png`
- Requirements matrix:
  `docs/ADMIN_CONSOLE_CONCEPT_REQUIREMENTS_MATRIX.md`
- Overview implementation spec:
  `docs/ADMIN_CONSOLE_OVERVIEW_FIGMA_SPEC.md`
- UI prompt traceability:
  `docs/ADMIN_CONSOLE_UI_PROMPT_TRACEABILITY.md`
- Domain dictionary:
  `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md`
- Component/function blueprint:
  `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md`
- Figma mirror:
  `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`

## Tool Roles

| Tool | Role | Current use | Fallback rule |
| --- | --- | --- | --- |
| Browser / IAB | Fast local DOM, viewport, console-log, and responsive checks. | Primary tool for this ledger. | Use first for local `127.0.0.1` checks. |
| Chrome | Real desktop-profile visual inspection when Browser viewport or extension state is insufficient. | Not required in this pass because Browser covered DOM, desktop, and mobile checks. | Use for final wide-screen polish or profile-specific issues. |
| Computer | Windows desktop-level fallback when browser automation cannot expose the visual state. | Not required in this pass. | Use only for visual capture or app-window issues that Browser/Chrome cannot inspect. |

## Current Figma Mirror Evidence

Figma connector evidence for the active baseline on 2026-06-25:

| Check | Result |
| --- | --- |
| Source file metadata | Active file is `https://www.figma.com/design/NefQiIMOPIBU28TIYcwQFE/GlobalCircle-AI-Admin-UI-Baseline---2026-06-25`. |
| Current top-level pages | `00 Index & Project Map`, `01 Design Rules V1-Polish`, `02 Component Contract`, `03 Product Baseline Frames`, `04 Figma-to-React Mapping`, `90 Evidence Gates`, and `99 Archive / Source Handoff`. |
| Current visual source frames | `Product Baseline / Operations Overview` (`24:5`), `Product Baseline / Accounts & Resources` (`24:35`), and `Product Baseline / Usage & Channels` (`24:65`). |
| Historical page mirror frames | Older `373:*`, `99:*`, and `104:*` frames are archive/lineage only unless their rule is copied into the clean baseline and re-accepted. |
| Implementation captures | Local screenshots remain browser QA evidence only and do not replace the active Figma baseline. |
| Previous mismatch | The earlier one-page Requirements Map and the former multi-frame handoff are not active implementation sources. |
| Connector-reported seat | `Dev / developer`. |
| User-reported Figma UI access | Full access for the connected account. |
| Desktop evidence | Figma Desktop and connector access can read and update the clean baseline file. |
| Write probe | `use_figma` populated the clean baseline pages and read-back confirmed every page contains content. |
| Next action | Use the clean baseline file for future Figma mirror and visual QA work. Keep the former handoff as archive/lineage only. |

Component-system mirror status:

| Check | Result |
| --- | --- |
| Page-level handoff | Current: the clean baseline has source boundary, design rules, component contract, product baseline cards, mapping, evidence gates, and archive pages. |
| Component-system mirror | Current: component responsibilities are contract cards on `02 Component Contract`; they are not yet a full Figma component-set library. |
| Observed contract cards | `ShellRail`, `TopBar`, `MetricCard`, `StatusChip`, `PanelFrame`, `DataRowCompact`, `EvidenceSurface`, `StateFeedback`, `PrivilegedGate`, `Deprecated / SidebarNavigation` |
| Observed component nodes / variants | `0` component-set variants in the clean baseline; current output is a design contract, not a reusable Figma library. |
| Pending component mirrors | None for source-boundary setup; React/CSS visual parity and browser QA remain open. |
| Phase 2 screenshot evidence | New baseline screenshots were captured under `output/playwright/` for 1600, 1280, and 1024 widths. |
| Next task line | `Admin React/CSS source-boundary cleanup and browser visual QA against the clean baseline` |

Local mirror contract added:

| Contract | Purpose |
| --- | --- |
| `admin/src/design/figma-mirror.ts` | Canonical Figma file key, required mirror frames, page-to-React mapping, connector evidence, component-mirror gap, and QA evidence axes. |
| `admin/src/design/figma-parity.ts` | GCC-118 design-to-code parity matrix for Figma component set, React surface, grammar role, CSS token, state semantics, responsive rules, a11y rules, and QA evidence. |
| `admin/src/test/admin-figma-mirror-contract.test.ts` | Verifies mirror page names, one page mirror per active Admin route, connector status, and component-mirror boundary. |
| `admin/src/test/admin-visual-qa-contract.test.tsx` | Verifies fixture shell landmarks, page/panel DOM ownership hooks, named interactive controls, and safe-data boundary. |
| `admin/src/components/primitives/state-feedback.tsx` | GCC-119 shared state-feedback primitive for empty/loading/stale/error surfaces across empty states and table state rows. |

GCC-118 parity status:

| Check | Result |
| --- | --- |
| Required current component families | `StatusChip`, `MetricCard`, `PanelFrame`, `DataRowCompact`, `TopBar`, `ShellRail`, `PrivilegedGate`, `StateFeedback`, `EvidenceSurface`. Deprecated `SidebarNavigation` is lineage only. |
| Design-to-code mapping | Current: each required Figma component set maps to a React or contract surface, CSS tokens, grammar roles, state semantics, responsive rules, a11y rules, and current QA evidence references. |
| Current implementation gaps | Recorded in `admin/src/design/figma-parity.ts` and `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`; handoff continues through `GCC-119` before visual evidence closes in `GCC-120`. |
| Ready gate | `PR #355` remains Draft until `GCC-118`, `GCC-119`, and `GCC-120` are complete. |

GCC-119 implementation alignment status:

| Check | Result |
| --- | --- |
| Shared state feedback | Current: `StateFeedback` is a first-class primitive with `empty`, `loading`, `stale`, and `error` tones, named `status` / `alert` roles, chrome variants, and stable DOM hooks. |
| Empty and table states | Current: `EmptyState` delegates to `StateFeedback`; `DataTableState` renders through `StateFeedback` while preserving table `row` / `cell` semantics. |
| QA DOM hooks | Current: `MetricCard`, `StatusChip`, `TopBar`, `WorkspaceSidebar`, System Search, and primary-route surfaces expose stable `data-figma-component` / `data-ui-surface` hooks for GCC-120 viewport checks. |
| Overview metric normalization | Current: `Operations Overview` metric cards now render through shared `MetricCard` hooks, not the old page-local metric-card contract. |
| PanelFrame hooks | Current: `PanelFrame` exposes stable `data-figma-component`, `data-ui-surface`, owner-mode, and workbench-category hooks across operator and draft panels. |
| Privileged gate extraction | Current: shell production guard renders through the `PrivilegedGate` primitive with explicit state and capability attributes. |
| GCC-120 handoff surface | Current: tablet and ultra-narrow screenshot evidence is recorded below. PR #355 should stay Draft until the linked Linear review gates are accepted. |

## Current Browser Evidence

Local target:

```text
http://127.0.0.1:5173/
```

GCC-117 Browser check on 2026-06-21 after Figma Component Mirror Phase 2 used
`http://127.0.0.1:5173/#/fixture-preview` and the existing local Vite listener
on `127.0.0.1:5173`:

| Browser viewport | Pages checked | Panel counts | Global horizontal overflow | Visual overlap candidates | Unnamed controls | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1600 x 1024` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | No | 0 | 0 | Pass | 0 | Pass |
| `1440 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | No | 0 | 0 | Pass | 0 | Pass |
| `390 x 844` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | No | 0 | 0 | Pass | 0 | Overflow-safety pass; mobile design pending |

GCC-117 shell interaction check on 2026-06-21:

| Browser viewport | Surfaces checked | Global horizontal overflow | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- |
| `1440 x 900` | System Search open/search for `usage`, primary routes, operator account menu, production action guard | No | Pass | 0 | Pass |
| `390 x 844` | System Search open/search for `usage`, primary routes, operator account menu, production action guard | No | Pass | 0 | Overflow-safety pass; mobile design pending |

Observed interaction details:

- System Search result count changed from `24` to `8` after searching `usage`,
  and the visible results stayed route/panel scoped.
- Operator account popover stayed within viewport on desktop and narrow safety
  viewports.
- Production action guard summary is visible on narrow safety viewports; its expanded detail is
  responsive-hidden at `390 x 844` and did not create overflow.
- Browser screenshots were generated during each checked state for visual
  inspection; no screenshot artifact was committed.

GCC-120 breakpoint/state check on 2026-06-21 after shared-surface alignment
used `http://127.0.0.1:5173/#/fixture-preview` and the existing local Vite
listener on `127.0.0.1:5173`:

| Browser viewport | Pages checked | Panel counts | Shared surface hooks | Shell interactions | Global horizontal overflow | Visual overlap candidates | Unnamed controls | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1280 x 800` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | `PanelFrame` matched all panels; Overview had `4` `MetricCard` hooks; `PrivilegedGate` present | System Search for `usage` returned `8`; operator account and production gate stayed in viewport | No | 0 panel overlaps | 0 | Pass | 0 | Pass |
| `768 x 1024` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | `PanelFrame` matched all panels; Overview had `4` `MetricCard` hooks; `PrivilegedGate` present | System Search for `usage` returned `8`; operator account and production gate stayed in viewport | No | 0 panel overlaps | 0 | Pass | 0 | Tablet/narrow safety pass; final compact projection pending |
| `360 x 740` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | `PanelFrame` matched all panels; Overview had `4` `MetricCard` hooks; `PrivilegedGate` present | System Search for `usage` returned `8`; operator account and production gate stayed in viewport | No | 0 panel overlaps | 0 | Pass | 0 | Overflow-safety pass; mobile design pending |

Observed state/surface details:

- `StatusChip` tones were present across success, info, warning, danger, and
  neutral states on the page set.
- Table rows and safe refs stayed inside their local containers; no `.mono-ref`
  overflow was detected in the breakpoint sweep.
- `PrivilegedGate` exposed `data-gate-state="gated"` and
  `data-capability="readonly"` during the shell check.
- Local screenshot and JSON artifacts were generated under `output/playwright/`
  for operator inspection and were not committed.

Fresh Browser check on 2026-06-16 after the English canonical content slice:

| Viewport | Pages checked | Han copy in body/title | Global horizontal overflow | Console errors | Result |
| --- | --- | --- | --- | --- | --- |
| Browser split viewport `584px` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | No | No | 0 | Pass |
| Desktop override `1440 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | No | No | 0 | Pass |

Focused Browser check on 2026-06-21 after adding the Figma mirror and visual QA
contracts used `http://127.0.0.1:5173/#/fixture-preview`:

| Viewport | Page checked | Panels | Global horizontal overflow | Unnamed interactive controls | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Browser override `1440 x 900` | `Operations Overview` | 3: `dashboard-health-summary`, `dashboard-risk-queue`, `dashboard-next-actions` | No | 0 | Pass | 0 | Pass |
| Browser override `390 x 844` | `Operations Overview` | 3: `dashboard-health-summary`, `dashboard-risk-queue`, `dashboard-next-actions` | No | 0 | Pass | 0 | Pass |

Focused Browser check on 2026-06-21 after the `Operations Overview` operator
chrome cleanup used `http://127.0.0.1:5173/#/fixture-preview`:

| Viewport | Page checked | Panel chrome | Nested fixture rows | Overview cards | Section cards | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Playwright `1600 x 1024` | `Operations Overview` | `operator` on all 3 panels | 0 | 4 | 2 | Pass |

Clean Browser check on 2026-06-16 after the page-ownership cleanup used
`http://127.0.0.1:5175/` to avoid stale HMR console entries from the existing
5173 dev server:

| Viewport | Pages checked | Section ownership checked | Han copy in body/title | Global horizontal overflow | Scoped console errors | Result |
| --- | --- | --- | --- | --- | --- | --- |
| Browser override `584 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | Overview section IDs, Accounts anchor order, Usage anchor order, delivery preview nesting, ledger/anomaly/receipts ownership | No | No | 0 | Pass |
| Browser override `1440 x 900` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | Overview section IDs, Accounts anchor order, Usage anchor order, delivery preview nesting, ledger/anomaly/receipts ownership | No | No | 0 | Pass |

Page-local navigation observed:

| Page | Navigation labels observed |
| --- | --- |
| `Operations Overview` | `Health Summary`, `Risk Queue`, `Next Actions` |
| `Accounts & Resources` | First-screen Visual Polish row: `Account Directory`, `Resources & Orders`, `Lifecycle`. Quota and history are follow-up/evidence surfaces outside the primary three-panel row. |
| `Usage & Channels` | First-screen Visual Polish row: `Collection Freshness`, `Channel Coverage`, `Usage Ledger`. Collection anomalies and receipts/collectors are follow-up/evidence surfaces outside the primary three-panel row. |

## Concept Alignment Checks

| ID | Concept area | Expected from concept | Current implementation | QA status |
| --- | --- | --- | --- | --- |
| SH-01 | Shell and brand | Left rail with GlobalCircle AI identity and protected operator context. | Sidebar shows brand, grouped navigation, locked future slots, and safety footer. | Pass |
| SH-02 | Navigation | Overview, user supervision, platform monitoring, audit/cases, platform development, and settings. | Active real pages remain limited to `Operations Overview`, `Accounts & Resources`, and `Usage & Channels`; planned areas are locked. | Pass |
| SH-03 | Top search | Search users, orders, channels, cases, or events. | Top search is route-aware and searches active console pages; global object search is a later data-contract gap. | Partial |
| OV-10 | Platform health metric | Health card with status, note, and sparkline. | `Platform health` follows the clean-baseline metric pattern: status pill, title, and safe summary copy. | Pass |
| OV-11 | Risk cases metric | Risk count and trend. | `Risk candidates` follows the clean-baseline metric pattern and routes only; it does not mount a case workflow. | Pass |
| OV-12 | Collection freshness metric | Freshness/P95-style latency card. | `Freshness P95` renders the safe age summary with stale-threshold wording. | Pass |
| OV-13 | Channel coverage metric | Channel coverage card. | `Channel coverage` renders aggregate-only coverage copy. | Pass |
| OV-20 | Risk queue | Bounded safe review rows. | `Risk Queue` renders two compact safe-ref rows with owner-route metadata. No severity filter row, case close, approval, or mutation action is present. | Pass |
| OV-30 | User/resources preview | User, order, quota, risk status table. | Routed out of Overview. The owning implementation is `Accounts & Resources`; Overview may show only next-action routing or aggregate signals. | Pass by intentional routing |
| OV-40 | Object timeline | Object filters, object chain, safe event list. | Routed out of Overview. Full durable history belongs to future `Audit & Cases`; interim history entry points stay under owner pages. | Pass by intentional routing |
| OV-50 | Traffic/channel preview | Status filters and channel ledger. | Routed out of Overview. The owning implementation is `Usage & Channels`; Overview keeps only freshness/coverage metrics and route action. | Pass by intentional routing |

## Detailed Page Checks

| Page | Expected role | Current result | QA status |
| --- | --- | --- | --- |
| `Operations Overview` | Summary-and-routing dashboard that sends deep work to the owning page. | The page renders operator-chrome panels with four metric cards, `Risk Queue`, `Next Actions`, and `Review Candidates`. Draft-only field counts, `Preview` / `Owner` chips, and nested fixture preview rows are suppressed on Overview. Account/resource ledgers, object timelines, and channel ledgers are intentionally absent from Overview. Legacy service/order/activity/warning/recent-activity detail panels are also removed. | Pass |
| `User Operations / Accounts & Resources` | Own user accounts, resources, orders, quota, lifecycle, and history/event entry points. | The first-screen primary row now follows the Visual Polish contract with three `416 x 260` panels: `Account Directory`, `Resources & Orders`, and `Lifecycle`. Each panel uses two compact `DataRowCompact` rows with safe refs and right-aligned state/action text; legacy tables and filter bars are not part of the primary row. | Pass |
| `Platform Monitoring / Usage & Channels` | Own collection freshness, channel coverage, usage ledger, collection anomaly queue, receipt/collector entry points. | The first-screen primary row now follows the Visual Polish contract with three `416 x 260` panels: `Collection Freshness`, `Channel Coverage`, and `Usage Ledger`. Each panel uses compact measured-state rows; collection anomalies and receipts remain follow-up/evidence surfaces outside the primary row. | Pass |

Primary panel visual contract, 2026-06-25:

| Check | Required result |
| --- | --- |
| Shared geometry | Three primary panels per active page, `416 x 260`, aligned to the Figma Visual Polish row. |
| Row grammar | Two `DataRowCompact` rows per primary panel, bounded inside the panel body; no floating table/list fragments. |
| Removed residue | No retired hide/visibility button, AppLibrary/NavigationLibrary recovery text, code-development instruction chip, or old short-card layout inside the primary row. |
| Page ownership | Operations routes to owner pages; Accounts owns account/resource/lifecycle; Usage owns freshness/coverage/ledger. |

## Responsive Checks

| Breakpoint | Check | Result |
| --- | --- | --- |
| Browser split viewport `584px` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Desktop override `1440 x 900` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Narrow safety sub-navigation | Sub-nav uses horizontal scrolling inside its own container instead of widening the page. This is not final mobile IA completion. | Pass |
| Tables and refs | Long safe refs and table content stay inside their scroll/row containers. | Covered by Admin tests and Browser overflow check. |

## Intentional Deviations

| Concept expectation | Current behavior | Reason |
| --- | --- | --- |
| Concept uses sample counts such as `18` risk cases and `98.6%` coverage. | Local implementation shows current fixture/API-derived values such as `5` risk cases or `50%` coverage. | Values must come from safe summaries, not static concept numbers. |
| Concept shows locked icons beside several navigation entries. | Current shell shows locked planned slots with explanatory entry-gate text. | More explicit for operator safety and avoids empty clickable pages. |
| Concept fits the entire first screen into a wide 1600px canvas. | Local 1280px viewport keeps the same hierarchy but allows scroll. | Current app must support narrower desktop and browser preview widths. |
| Concept shows request rate and error rate as if first-class channel facts exist. | Current channel preview exposes honest gaps or derived placeholders instead of fake runtime rates. | Backend summary contract for request/error rates is not complete. |

## Backend/Data Contract Gaps

These gaps should remain visible in planning, but they do not block the current
UI skeleton:

- Durable case/history backend for full `Audit & Cases`.
- First-class account lifecycle summary for account create/disable states.
- Durable quota audit history and reason display.
- Collector health endpoint for availability, last run, and failure reason.
- Channel rollup endpoint for request rate, error rate, and longer trends.
- Durable object event taxonomy for account/order/artifact/channel/receipt
  history.

## Acceptance Rule

Before marking a future Admin UI visual task complete, record:

1. The viewport sizes checked.
2. The pages or sections checked.
3. Whether global horizontal overflow exists.
4. Console error count.
5. Any intentional concept deviation.
6. Any backend/data contract gap.
7. The exact local validation commands that passed.

Do not use concept parity to justify production mutation, runtime apply,
collector activation, account disablement, order pause, quota enforcement, or
artifact revocation. Those remain separate tasks and may require B or A
reclassification depending on behavior.
