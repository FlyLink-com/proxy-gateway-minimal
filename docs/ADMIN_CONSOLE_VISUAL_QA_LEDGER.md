# Admin Console Visual QA Ledger

Last updated: 2026-06-29, America/Los_Angeles.

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
| Current visual source frames | `Operations Overview / Baseline / 1600x908` (`2:92`), `Accounts & Resources / Baseline / 1600x908` (`2:262`), and `Usage & Channels / Baseline / 1600x908` (`2:432`). |
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
| Next task line | `Admin React/CSS browser visual QA and page-subroute parity filtering against the clean baseline` |

Phase 1 freeze snapshot, 2026-06-26:

| Item | Frozen status | Evidence |
| --- | --- | --- |
| Figma source boundary | Frozen | `ADMIN_FIGMA_BASELINE_FREEZE.activeFile = NefQiIMOPIBU28TIYcwQFE` |
| Route baseline frames | Frozen | `2:92`, `2:262`, `2:432` are asserted in mirror and evidence contract tests. |
| Operations first screen | Frozen | Browser check shows one health summary, three workspace panels, and two evidence surfaces; tests assert summary and panel roles separately. |
| Accounts and Usage first screens | Frozen | Browser check shows three workspace panels and two evidence surfaces for each route. |
| Deep section routes | Frozen | `#/admin/accounts/quota-usage` normalizes to `#/admin/accounts` until section contracts are designed. |
| Deprecated AppLibrary/NavigationLibrary behavior | Frozen out | Navigation tests assert no AppLibrary, NavigationLibrary, module hide/restore, dock/appbar, or old page-local subnavigation behavior. |
| Backend/API/data wiring | Not frozen | Deferred to later DTO and implementation task lines. |
| Mobile below `1024px` | Not frozen | Out of scope for the current baseline gate. |

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

Local safe-read workflow calibration on 2026-06-29:

| Check | Result |
| --- | --- |
| Workflow tier | Admin UI code work remains B-tier; docs/ledger updates remain C-tier. No production, auth, schema, runtime, deployment, token, credential, subscription URL, raw config/log/env, SQLite row, or customer-data authority is granted. |
| Page sequencing | Continue one page at a time for page content. `User Access Logs`, `User Operation Logs`, `Node Health`, `Node Logs`, `Node Bandwidth`, `User Management`, and `Order Management` are the completed calibration pages. The owner-navigation pass now routes User/Order pages under `Accounts & Resources`; `System Settings` is reserved and not an active business route. |
| Shell rule | Only `Operations Overview`, `Accounts & Resources`, and `Usage & Channels` render the shared shell `TopBar`. The seven safe-read query/management pages render the Figma page-local header only. |
| `User Access Logs` rendered proof | Browser / IAB check at `#/admin/user-access-logs` returned `shellTopbar=disabled`, `topbarPresent=false`, no horizontal overflow, and no console warnings/errors. |
| `User Access Logs` row rhythm | Browser / IAB row heights were `[44, 56, 56, 56, 56, 56, 56, 56, 56]`: one `44px` header row plus eight fixed `56px` data rows. |
| `User Operation Logs` rendered proof | Local Chrome check at `#/admin/user-operation-logs` returned `shellTopbar=disabled`, `topbarPresent=false`, zero filter inputs, filters `All Operators`, `Any ID`, `All Actions`, `All Results`, `Last 24 Hours`, and `Reset`, no horizontal overflow, and no console warnings/errors. |
| `User Operation Logs` row rhythm | Local Chrome row heights were `[44, 56, 56, 56, 56, 56, 56, 56, 56]`; table/detail geometry was `940px` table card plus `340px` detail panel at shared `714px` height, and pagination rendered `Showing 1-8 of 128` without a page summary. |
| `User Operation Logs` interaction proof | Selecting `op_evt_004` updated `Log Details` to safe refs for `op_004` and `sub_8192`; protected trace, privileged detail, raw payload, token, credential, subscription URL, runtime config, and SQLite row output remained absent. |
| `Node Health` rendered proof | Browser and local Chrome checks at `#/admin/node-health` returned `shellTopbar=disabled`, `topbarPresent=false`, search `Search node ID or region...`, filters `All Regions`, `All Status`, `All Types`, and `Apply Filters`, no horizontal overflow, and no console warnings/errors. |
| `Node Health` row rhythm | Local Chrome row heights were `[44, 56, 56, 56, 56, 56, 56, 56, 56]`; table/detail geometry was `940px` health table plus `340px` detail panel at shared `714px` height, and pagination rendered `Showing 1-8 of 24` without a page summary. |
| `Node Health` interaction proof | Selecting `node_ed_03` updated `Node Details` to safe refs and redacted IP material; node-log and diagnostics actions stayed disabled/gated, and raw logs, tokens, credentials, subscription URLs, runtime config, and SQLite rows remained absent. |
| `Node Logs` rendered proof | Browser and local Chrome checks at `#/admin/node-logs` returned `shellTopbar=disabled`, `topbarPresent=false`, search `Search node ID, event type...`, filters `All Nodes`, `Last 24 Hours`, `All Events`, `All Status`, and `Apply Filters`, no raw-log surface, and no metric cards. |
| `Node Logs` row rhythm | Local Chrome screenshot `C:\Users\g\AppData\Local\Temp\globalcircle-node-logs-fixed-v3.png` rendered the Figma page-local header, `940px` log table plus `340px` detail panel at shared `714px` height, fixed `44px` header row plus eight `56px` data rows, and pagination `Showing 1-8 of 2,847` without a page summary. |
| `Node Logs` interaction proof | Browser row selection for `node_log_003` updated `Log Details` to `node_gw_03`, `Error`, `Offline`, `ERROR`, `ap-south-1`, and `[REDACTED_IP]`; raw logs, tokens, credentials, subscription URLs, runtime config, SQLite rows, and customer-private data remained absent. |
| `Node Bandwidth` rendered proof | Browser and local Chrome checks at `#/admin/node-bandwidth` returned `topbarPresent=false`, search `Search node ID or region...`, filters `All Nodes`, `Last 1h`, `All Regions`, `All Types`, and `Apply`, no metric cards, no sensitive terms, and no console warnings/errors. |
| `Node Bandwidth` row rhythm | Local Chrome screenshot `C:\Users\g\AppData\Local\Temp\globalcircle-node-bandwidth-fixed-v1.png` rendered the Figma page-local header, `940px` bandwidth table plus `340px` detail panel at shared `714px` height, fixed `44px` header row plus eight `56px` data rows, and pagination `Showing 1-8 of 24` without a page summary. |
| `Node Bandwidth` interaction proof | Browser row selection for `node_edge_07` updated `Bandwidth Detail` to safe bandwidth summaries with `91%` danger utilization, `4.2 Gbps` inbound, `3.1 Gbps` outbound, `38ms` latency, and `0.08%` packet loss; raw logs, tokens, credentials, subscription URLs, runtime config, SQLite rows, and customer-private data remained absent. |
| `User Management` rendered proof | Browser and local Chrome checks at `#/admin/user-management` returned `topbarPresent=false`, search `Search User ID, name, email...`, filters `Status All`, `Risk All`, `Plan All`, and `Created Time Last 24h`, disabled `Create User · Gated`, no metric cards, no horizontal overflow, no sensitive terms, and no console warnings/errors. |
| `User Management` row rhythm | Local Chrome screenshot `C:\Users\g\AppData\Local\Temp\globalcircle-user-management-fixed-v1.png` rendered the Figma page-local header, `940px` user table plus `340px` detail panel at shared `714px` height, fixed `44px` header row plus eight `56px` data rows, and pagination `Showing 1-8 of 32` without a page summary. |
| `User Management` interaction proof | Browser row selection for `user_008` updated `User Details` to safe user refs with `User Theta`, `[REDACTED_EMAIL]`, `Team`, `Pending`, `Medium`, and `2026-01-18 10:31`; access-log handoff, operation-log handoff, and revoke controls remained disabled/gated, and raw logs, tokens, credentials, subscription URLs, runtime config, SQLite rows, and customer-private data remained absent. |
| `Order Management` rendered proof | Browser and local Chrome checks at `#/admin/order-management` returned `topbarPresent=false`, search `Search ID, account ref, or lifecycle...`, filters `Status`, `Plan`, `Lifecycle`, and `Delivery`, disabled `Create Order · Gated`, no metric cards, no horizontal overflow, no sensitive terms, and no console warnings/errors. |
| `Order Management` row rhythm | Local Chrome screenshot `C:\Users\g\AppData\Local\Temp\globalcircle-order-management-fixed-v1.png` rendered the Figma page-local header, `940px` order table plus `340px` detail panel at shared `714px` height, fixed `44px` header row plus four `56px` data rows with Figma blank-table remainder, and pagination `Showing 1-4 of 128` without a page summary. |
| `Order Management` interaction proof | Browser row selection for `ORD-4031` updated `Order Details` to safe order refs with `enterprise_alpha_01`, `Tier 3 / Pro`, `120 / 1d`, `Suspended`, and `Blocked`; quota-architecture and usage-evidence handoffs stayed disabled/gated, and raw logs, tokens, credentials, subscription URLs, runtime config, SQLite rows, and customer-private data remained absent. |
| Shared navigation note | The workspace sidebar now renders `Accounts & Resources` with `User Management` and `Order Management`, plus `Audit & Cases` and `Platform Development` groups. `System Settings` is reserved and has no active business route or normal-operator planned gate. |
| Validation | `npm run admin:test` passed `33` files / `299` tests; `npm run admin:build` passed with the existing Vite chunk-size warning; `git diff --check origin/master...HEAD` passed. Root `npm test` ran `819` server tests with `818` pass and `1` unrelated failure in `platform-controlled-open-cli.test.mjs` because the tracked-example entitlement fixture is expired. |

Playwright/Chrome baseline and overflow check on 2026-06-28 after the first
two page-specific backend-query surfaces were added:

| Routes checked | Viewports | Page identity | Table/detail interaction | Global horizontal overflow | Header/filter overlap | Table/detail overlap | Console warnings/errors | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `#/admin/user-access-logs`, `#/admin/user-operation-logs` | `1440 x 900`, `1024 x 768`, `390 x 844` | Pass | Pass: selected rows updated the redacted detail panel. | No | No | No | 0 | Pass |

Focused Browser source-rule check on 2026-06-28 for
`#/admin/user-access-logs`:

| Check | Result |
| --- | --- |
| Browser route | In-app Browser was blocked by the local client for `localhost`/`127.0.0.1` with `ERR_BLOCKED_BY_CLIENT`; fallback validation used local headless Chrome/CDP against the same Vite dev server. |
| Header attribution | Breadcrumb variant rendered as `Home > User Access Logs`; header actions rendered `Operator Console` and `Export CSV`, both disabled. |
| Filter row | Search placeholder rendered `Search user ID, session, activity...`; filters rendered `All Results`, `Last 24 Hours`, `All Methods`, and `All Risk`. |
| Table/detail split | 1600px check rendered table and detail side by side; 1024px check stacked table and detail with no global horizontal overflow. |
| Table columns | Columns rendered as `TIMESTAMP`, `USER REF`, `EVENT TYPE`, `RESULT`, and `RISK LEVEL`; event/result/risk cells render contained `StatusChip` components. |
| Pagination | Access table pagination rendered `Showing 1-8 of 715` with `Previous`/`Next` controls and no page-number summary. |
| Interaction | Selecting `evt_access_004` updated `Event Detail` with redacted blocked-delete evidence. |
| Console/overlay | No Vite/framework overlay and no console warnings/errors in the 1600px and 1024px Chrome/CDP checks. |

Focused Browser source-rule check on 2026-06-28 for
`#/admin/user-operation-logs`:

| Check | Result |
| --- | --- |
| Header attribution | Breadcrumb variant rendered as `Home > User Operation Logs`; no title-only `h1` in the page header. |
| Header stroke tier | `rgba(255, 255, 255, 0.35)` on the top-header; secondary surfaces stay on the lower stroke tier. |
| Table/detail split | `audit-table-card` measured `940px`; `DetailPanel` measured `340px`; both shared the same top and height. |
| Column positions | Header cells measured at x `17/169/341/513/645/777`, matching the fixed `16/168/340/512/644/776` rule within 1px stroke rounding. |
| Action/result cells | Both ACTION and RESULT render as contained `StatusChip` components. |
| Pagination | Operation table pagination measured `56px` high. |
| Interaction | Selecting `op_evt_004` updated `Log Details` with redacted lifecycle evidence. |

Observed details:

- `Export CSV · Gated` stays disabled on User Access Logs; User Operation Logs
  follows the V2 source label `Export CSV` while still disabled in the current
  frontend phase.
- Tablet and mobile widths were checked for overflow safety only. The V2
  source rules explicitly keep 1440/1280/1024 breakpoint frames pending, so this
  pass must not be treated as responsive-complete for User Operation Logs.
- Local viewport screenshots were generated under a temp QA directory for
  operator inspection and were not committed.

Clean-baseline Browser check on 2026-06-25 used the active Figma baseline file
`NefQiIMOPIBU28TIYcwQFE` and the local Admin console at `127.0.0.1:5173`.
The Browser viewport was calibrated by CSS viewport width because the current
Browser session reported a non-default device-pixel ratio.

| Browser CSS viewport | Pages checked | TopBar contract | ShellRail / navigation | Cards and panels | Evidence charts | Legacy residue | Global horizontal overflow | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1600 x 1024` | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` | `1296 x 58` at `x=252`; route-aware search stayed unclipped. | `224 x 1024` shell rail; old `.app-sidebar::after` visual scrollbar absent; nav scrollport is real `overflow-y: auto`. | Four `300 x 150` KPI cards, three `416 x 260` primary panels, two `628 x 280` evidence panels on Operations; Accounts and Usage follow the same baseline slots. | SVG chart shell present with axis labels and 19 line/grid primitives. | No `AppLibrary`, `NavigationLibrary`, hidden-card control, or old development chips. | No | Pass |
| `1280 x 800` | `Operations Overview` breakpoint sweep | `1168 x 58` at `x=88`; search stayed unclipped. | Icon-only `64px` shell rail; nav scrollport remains real `overflow-y: auto`. | KPI row compacts to `120px` height; primary panels stay in three columns with `360 x 260` cards. | Chart evidence panel remains bounded at `564 x 224`. | No legacy residue detected. | No | Pass |
| `1024 x 768` | `Operations Overview` breakpoint sweep | `976 x 58` at `x=24`; search stayed unclipped. | Overlay-drawer state: sidebar hidden by design, with no fake visual scrollbar. | Primary panels split into two-column then stacked flow; no horizontal overflow. | Evidence panels stack full width under the primary panels. | No legacy residue detected. | No | Pass |

Route-level 1600px evidence:

| Route | Active route observed | Primary layout evidence | Screenshot artifact |
| --- | --- | --- | --- |
| `Operations Overview` | `Operations Overview` | Four KPI cards at `300 x 150`; primary panels at `416 x 260`; evidence panels at `628 x 280`. | `output/playwright/admin-baseline-route-operations-overview-1600x1024.png` |
| `Accounts & Resources` | `Accounts & Resources` | Same TopBar and four-card KPI slot; primary panels are `Account Directory`, `Resources & Orders`, and `Lifecycle`. | `output/playwright/admin-baseline-route-accounts-resources-1600x1024.png` |
| `Usage & Channels` | `Usage & Channels` | Same TopBar and four-card KPI slot; primary panels are `Collection Freshness`, `Channel Coverage`, and `Usage Ledger`. | `output/playwright/admin-baseline-route-usage-channels-1600x1024.png` |

Observed details:

- The current React/CSS page is now using the dark blue Visual Polish baseline,
  not the former light AppLibrary / NavigationLibrary prototype.
- Search is a normal route-aware system search input; no AppLibrary candidate
  popover appeared in the checked states.
- The hidden-card control and old development-state chips are absent in DOM and
  screenshots.
- Browser `fullPage` screenshots in this session produced unusable blank
  artifacts under the calibrated DPR state, so current visual evidence uses
  viewport screenshots plus DOM-coordinate checks. Screenshot files remain under
  ignored `output/playwright/` and are not committed.

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
| SH-02 | Navigation | Operations overview, accounts/resources, usage/channels, audit/cases, platform development, and reserved system settings. | The sidebar orders ten active routes as `Operations Overview`, `Accounts & Resources`, `User Management`, `Order Management`, `Usage & Channels`, `Audit & Cases` logs, and `Platform Development` node pages. Reserved/privileged settings stay outside the normal page list. | Pass |
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
| `Accounts & Resources` | Own user accounts, resources, orders, quota, lifecycle, and history/event entry points. | The first-screen primary row now follows the Visual Polish contract with three `416 x 260` panels: `Account Directory`, `Resources & Orders`, and `Lifecycle`. Each panel uses two compact `DataRowCompact` rows with safe refs and right-aligned state/action text; legacy tables and filter bars are not part of the primary row. | Pass |
| `Usage & Channels` | Own collection freshness, channel coverage, usage ledger, collection anomaly queue, receipt/collector entry points. | The first-screen primary row now follows the Visual Polish contract with three `416 x 260` panels: `Collection Freshness`, `Channel Coverage`, and `Usage Ledger`. Each panel uses compact measured-state rows; collection anomalies and receipts remain follow-up/evidence surfaces outside the primary row. | Pass |

Primary panel visual contract, 2026-06-25:

| Check | Required result |
| --- | --- |
| Shared geometry | Three primary panels per active page, `416 x 260`, aligned to the Figma Visual Polish row. |
| Row grammar | Two `DataRowCompact` rows per primary panel, bounded inside the panel body; no floating table/list fragments. |
| Removed residue | No retired hide/visibility button, AppLibrary/NavigationLibrary recovery text, code-development instruction chip, or old short-card layout inside the primary row. |
| Page ownership | Operations routes to owner pages; Accounts owns account/resource/lifecycle plus user/order management; Usage owns freshness/coverage/ledger; Audit owns user access/operation logs; Platform Development owns node health/logs/bandwidth; System Settings is reserved for future console configuration. |

Owner-navigation check, 2026-06-29:

| Route | Sidebar result | TopBar rule | Overflow | Console | Result |
| --- | --- | --- | --- | --- | --- |
| `#/admin/order-management` on fresh `127.0.0.1:5176` | Ordered as `Operations Overview`, `Accounts & Resources`, `User Management`, `Order Management`, `Usage & Channels`, `Audit & Cases` logs, and `Platform Development` nodes; active route `Order Management`; no `System Settings` planned gate. | `data-shell-topbar="disabled"`, no shared TopBar. | No global horizontal overflow. | 0 errors/warnings. | Pass |
| Sidebar click to `#/admin/operations` on fresh `127.0.0.1:5176` | Active route `Operations Overview`; same grouped sidebar remains visible. | `data-shell-topbar="enabled"`, one shared TopBar with system search. | No global horizontal overflow. | 0 errors/warnings. | Pass |

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
