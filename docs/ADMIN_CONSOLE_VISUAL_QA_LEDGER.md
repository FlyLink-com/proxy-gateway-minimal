# Admin Console Visual QA Ledger

Last updated: 2026-06-21, America/Los_Angeles.

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

Figma connector evidence on 2026-06-21:

| Check | Result |
| --- | --- |
| Source file metadata | Read succeeded for `https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19`. |
| Current top-level page | `Admin UI Handoff`. |
| Current mirror frames | `00 Contract & Build Order`, `01 Operations Overview / 1600x1024`, `02 Accounts & Resources / 1600x1024`, `03 Usage & Channels / 1600x1024`, `04 State & Safety Matrix`, `05 GCC-103 Review Addendum / 1600x1024`. |
| Implementation captures | `06 Current Implementation / Operations Overview / 1600w full-content capture`, `07 Current Implementation / Accounts & Resources / 1600w full-content capture`, `08 Current Implementation / Usage & Channels / 1600w full-content capture`. |
| Previous mismatch | The earlier recorded `EvQXTtJ2XnRfcGxRLTRt0B` file is a one-page Requirements Map, not the canonical multi-frame handoff file. |
| Connector-reported seat | `Dev / developer`. |
| User-reported Figma UI access | Full access for the connected account. |
| Desktop evidence | Figma Desktop opens the canonical multi-frame file. The Share button shows a Full-seat upgrade prompt; do not continue that prompt through automation. |
| Write probe | `use_figma` succeeded on the canonical file and wrote safe shared plugin data under `adminos.mcpWriteProbe` on page `0:1`. |
| Next action | Use the canonical handoff file for future Figma mirror and visual QA work. Avoid Share or seat/billing prompts unless the operator explicitly approves that action. |

Component-system mirror status:

| Check | Result |
| --- | --- |
| Page-level handoff | Current: the canonical file has page mirrors, safety/review frames, and implementation captures. |
| Component-system mirror | Current: the required component-system batch exists on page `Admin Component Mirror v1`. |
| Observed component sets | `8`: `StatusChip`, `MetricCard`, `PanelFrame`, `DataRow`, `TopBar`, `SidebarNavigation`, `PrivilegedGate`, `StateFeedback` |
| Observed component nodes / variants | `41` component nodes / `41` variants |
| Observed variable collections / variables | `4` collections / `57` variables |
| Observed text styles / effect styles | `6` text styles / `3` effect styles |
| Observed paint styles | `0` |
| Pending component mirrors | None for this phase. |
| Phase 2 screenshot evidence | `TopBar`, `SidebarNavigation`, `PrivilegedGate`, and `StateFeedback` screenshots generated successfully; three newly added variant grids were resized after overlap detection. |
| Next task line | `Admin React/CSS grammar alignment from Figma Component Mirror v1` |

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
| Required component families | `StatusChip`, `MetricCard`, `PanelFrame`, `DataRow`, `TopBar`, `SidebarNavigation`, `PrivilegedGate`, `StateFeedback`. |
| Design-to-code mapping | Current: each required Figma component set maps to a React or contract surface, CSS tokens, grammar roles, state semantics, responsive rules, a11y rules, and current QA evidence references. |
| Current implementation gaps | Recorded in `admin/src/design/figma-parity.ts` and `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`; handoff continues through `GCC-119` before visual evidence closes in `GCC-120`. |
| Ready gate | `PR #355` remains Draft until `GCC-118`, `GCC-119`, and `GCC-120` are complete. |

GCC-119 implementation alignment status:

| Check | Result |
| --- | --- |
| Shared state feedback | Current: `StateFeedback` is a first-class primitive with `empty`, `loading`, `stale`, and `error` tones, named `status` / `alert` roles, chrome variants, and stable DOM hooks. |
| Empty and table states | Current: `EmptyState` delegates to `StateFeedback`; `DataTableState` renders through `StateFeedback` while preserving table `row` / `cell` semantics. |
| QA DOM hooks | Current: `MetricCard`, `StatusChip`, `TopBar`, `WorkspaceSidebar`, and `NavigationLibrary` expose stable `data-figma-component` / `data-ui-surface` hooks for GCC-120 viewport checks. |
| Remaining GCC-119 surface | `PanelFrame` override reduction, overview metric normalization, privileged-gate extraction decision, and tablet navigation behavior still need review before `GCC-119` can close. |

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
| `390 x 844` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `3`, `5`, `5` | No | 0 | 0 | Pass | 0 | Pass |

GCC-117 shell interaction check on 2026-06-21:

| Browser viewport | Surfaces checked | Global horizontal overflow | Sensitive text boundary | Console errors | Result |
| --- | --- | --- | --- | --- | --- |
| `1440 x 900` | Navigation library open, navigation-library search for `usage`, operator account menu, production action guard | No | Pass | 0 | Pass |
| `390 x 844` | Navigation library open, navigation-library search for `usage`, operator account menu, production action guard | No | Pass | 0 | Pass |

Observed interaction details:

- Navigation library result count changed from `24` to `8` after searching
  `usage`, and the visible results stayed route/panel scoped.
- Operator account popover stayed within viewport on desktop and mobile.
- Production action guard summary is visible on mobile; its expanded detail is
  responsive-hidden at `390 x 844` and did not create overflow.
- Browser screenshots were generated during each checked state for visual
  inspection; no screenshot artifact was committed.

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
| `Accounts & Resources` | `Account Directory`, `Resources & Orders`, `Quota & Usage`, `Lifecycle`, `History & Events` |
| `Usage & Channels` | `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, `Collection Anomalies`, `Receipts & Collectors` |

## Concept Alignment Checks

| ID | Concept area | Expected from concept | Current implementation | QA status |
| --- | --- | --- | --- | --- |
| SH-01 | Shell and brand | Left rail with GlobalCircle AI identity and protected operator context. | Sidebar shows brand, grouped navigation, locked future slots, and safety footer. | Pass |
| SH-02 | Navigation | Overview, user supervision, platform monitoring, audit/cases, platform development, and settings. | Active real pages remain limited to `Operations Overview`, `Accounts & Resources`, and `Usage & Channels`; planned areas are locked. | Pass |
| SH-03 | Top search | Search users, orders, channels, cases, or events. | Top search is route-aware and searches active console pages; global object search is a later data-contract gap. | Partial |
| OV-10 | Platform health metric | Health card with status, note, and sparkline. | `Platform health` now follows the canonical handoff card pattern: status pill, title, and safe summary copy. | Pass |
| OV-11 | Risk cases metric | Risk count and trend. | `Risk candidates` now follows the canonical handoff card pattern and routes only; it does not mount a case workflow. | Pass |
| OV-12 | Collection freshness metric | Freshness/P95-style latency card. | `Freshness P95` renders the safe age summary with stale-threshold wording. | Pass |
| OV-13 | Channel coverage metric | Channel coverage card. | `Channel coverage` renders aggregate-only coverage copy. | Pass |
| OV-20 | Risk queue | Severity filters and selectable risk rows. | `Risk Queue` renders the handoff-style filters and bounded rows. No case close, approval, or mutation action is present. | Pass |
| OV-30 | User/resources preview | User, order, quota, risk status table. | Routed out of Overview. The owning implementation is `Accounts & Resources`; Overview may show only next-action routing or aggregate signals. | Pass by intentional routing |
| OV-40 | Object timeline | Object filters, object chain, safe event list. | Routed out of Overview. Full durable history belongs to future `Audit & Cases`; interim history entry points stay under owner pages. | Pass by intentional routing |
| OV-50 | Traffic/channel preview | Status filters and channel ledger. | Routed out of Overview. The owning implementation is `Usage & Channels`; Overview keeps only freshness/coverage metrics and route action. | Pass by intentional routing |

## Detailed Page Checks

| Page | Expected role | Current result | QA status |
| --- | --- | --- | --- |
| `Operations Overview` | Summary-and-routing dashboard that sends deep work to the owning page. | The page renders operator-chrome panels with four metric cards, `Risk Queue`, and `Next Actions`. Draft-only field counts, `Preview` / `Owner` chips, and nested fixture preview rows are suppressed on Overview. Account/resource ledgers, object timelines, and channel ledgers are intentionally absent from Overview. Legacy service/order/activity/warning/recent-activity detail panels are also removed. | Pass |
| `User Operations / Accounts & Resources` | Own user accounts, resources, orders, quota, lifecycle, and history/event entry points. | Page header, safety note, resource data badge, sub-navigation, account directory, resource/order section, quota section, lifecycle summary, history/events cases, controlled delivery preview, and safe refs render in page-local ownership order. | Pass |
| `Platform Monitoring / Usage & Channels` | Own collection freshness, channel coverage, usage ledger, collection anomaly queue, receipt/collector entry points. | Page header, read-only safety note, data badge, sub-navigation, freshness, channel health, usage ledger with filters/curves/activity/order table, collection anomalies with case queue and anomaly queue, and a real receipts/collectors panel render. | Pass |

## Responsive Checks

| Breakpoint | Check | Result |
| --- | --- | --- |
| Browser split viewport `584px` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Desktop override `1440 x 900` | Three pages have no global horizontal overflow, no Han copy, and render active navigation. | Pass |
| Mobile sub-navigation | Sub-nav uses horizontal scrolling inside its own container instead of widening the page. | Pass |
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
