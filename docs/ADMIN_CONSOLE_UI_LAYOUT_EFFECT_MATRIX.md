# Admin Console UI Layout And Effect Matrix

Last updated: 2026-06-25, America/Los_Angeles.

> Status:
> - Type: UI layout, visual effect, and visual QA matrix
> - Risk: C for this document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions

This document complements `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md`.
The content matrix decides what each page and module may say. This matrix
decides how those modules should be arranged, how the interface should feel,
and how visual QA should judge the next Admin UI design pass.

The target is a structured Admin workbench aligned with the clean Figma
baseline and React page contracts. Reuse only the token, density, geometry,
and component rules that have been copied into the active baseline. Do not
reintroduce the older App Library / browser-OS experiment as the current
implementation target.

## Current Visual Source

The 2026-06-25 Figma pass promoted the clean baseline file
`NefQiIMOPIBU28TIYcwQFE` as the current visual source. The three accepted route
baseline cards are:

| Page | Current node | Current role |
| --- | --- | --- |
| `Operations Overview` | `24:5` | Current route baseline card. |
| `Accounts & Resources` | `24:35` | Current route baseline card. |
| `Usage & Channels` | `24:65` | Current route baseline card. |

The earlier `373:*`, `99:*`, `104:*`, `365:*`, and `501:*` frames are
superseded lineage. Implementation should not continue from those older frames
unless a review copies the needed rule into the clean baseline and accepts it
there.

The follow-up design-evidence frames remain useful for component/state and
responsive strategy, but they do not override the Visual Polish geometry:

- `115:2` `12 GCC-122 Component State Placement / 1600x1024`;
- `116:2` `13 GCC-122 Responsive QA Strategy / 1600x1024`;
- `117:2` `14 GCC-122 Figma-to-code Mapping / 1600x1024`.

| Priority | Work item | Acceptance |
| --- | --- | --- |
| 1 | Reverse-standardize docs and React/CSS from `24:5`, `24:35`, and `24:65`. | Current layout, density, and visible/hidden content rules are documented before code polish. |
| 2 | Implement visual parity from the clean baseline geometry. | Browser output matches ShellRail, TopBar, metric row, primary panels, and lower evidence row. |
| 3 | Preserve component/state contracts. | `02 Component Contract` in the clean baseline is the active state-placement reference; state surfaces are hidden until a real state mode needs them. |
| 4 | Collect visual QA evidence after implementation. | Browser screenshots at desktop and narrow widths prove no overlap, clipped text, nested-card clutter, or accidental wrapping. |
| 5 | Keep Figma-to-code mapping aligned. | `117:2` maps Figma component sets to React surfaces, CSS/token responsibility, and next gates without authorizing backend or runtime work. |

## Source Stack

| Source | What it controls |
| --- | --- |
| `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md` | Page/module content, visible copy, hidden design-only copy, and safe fixture boundaries. |
| `docs/ADMIN_CONSOLE_FRONTEND_STRUCTURE_BLUEPRINT.md` | Page ownership, module ownership graph, page-level structure, and viewport strategy. |
| `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md` | Token, density, spacing, surface, typography, icon, and responsive quality rules. |
| `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md` | Figma frame ownership, component mirror, DOM parity, and visual QA evidence axes. |
| `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` | Shared primitives, component roles, future functions, and backend-gap boundaries. |
| `admin/src/design/grammar/*` | Code-level layout, density, hierarchy, component-role, and metadata grammar. |
| `admin/src/app/admin-ui-contract.ts` | Active page layout contracts and required rendered metadata. |

## Current Standard Priority

When documents or code disagree, use this priority order for the current Admin
UI design phase:

1. `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md` controls what normal operator UI
   may show.
2. This layout/effect matrix controls how page modules are sized, arranged, and
   visually judged.
3. `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md` controls reusable visual tokens and
   effect boundaries only.
4. Earlier App Library, dock, plugin canvas, drag/resize/minimize, and
   browser-desktop language is legacy/future exploration, not the current page
   implementation target.

Normal operator UI must not show design-review residue:

- no field-count badges;
- no `Owner` / `Preview` review chips;
- no `purpose`, `ownership`, `boundaries`, `nextStep`, design adapter, or
  container-label copy;
- no visible module-count or fixture schema labels unless a dedicated
  design-review mode is enabled.

Design metadata may remain in code, tests, Figma notes, docs, or a future
developer/design-review mode. It should not occupy the live Admin canvas.

## Design Target

The next UI pass should make the Admin baseline feel like a real operator
console, not a draft page. The design target is:

- calm light enterprise workbench;
- table-first and evidence-first where the operator needs comparison;
- metric-first only where the operator needs a summary;
- one visible surface layer at a time;
- shared primitives over page-specific cards;
- English UI copy as the current active interface language;
- no secrets, raw operational material, or production action affordances.

## Standard Extraction Matrix

Use the Visual Polish pages as page baselines and extract only stable design
language into shared standards:

| Source layer | Current role | Extraction rule |
| --- | --- | --- |
| `Operations Overview` composition | Page-specific operator summary and routing flow. | Keep Risk Queue, Next Actions, Review Candidates, and operations evidence as Overview-owned patterns. Do not clone them into Accounts or Usage. |
| `Accounts & Resources` composition | Page-specific account/resource supervision flow. | Keep Account Directory, Resources & Orders, Lifecycle, and account history under the Accounts owner page. |
| `Usage & Channels` composition | Page-specific measurement and channel-evidence flow. | Keep Collection Freshness, Channel Coverage, Usage Ledger, anomalies, and collector evidence under Usage. |
| ShellRail + TopBar | Shared shell protocol. | Extract as reusable chrome and route/search context. |
| Metric cards | Shared visual container with page-specific metrics. | Reuse lane structure, tone, icon slot, value/detail rhythm, and bounded trend slot; do not reuse metric meaning without a data contract. |
| Panel frames | Shared surface protocol with page-specific bodies. | Reuse surface, header, border, radius, focus, and state behavior; page body layout stays owner-specific. |
| Tables/queues | Shared row/density/overflow language. | Reuse safe-row and selection behavior; columns and actions remain page-owned. |
| Curves/charts | Visual evidence slots only. | Do not treat static curves as approved time-series logic. Require source, window, aggregation, threshold, and empty/stale behavior before implementation. |

This prevents the AI-generated page content from becoming accidental global UI
law while preserving the visual quality improvements that should be shared.

## Layout Coordinate Matrix

| Area | Desktop target | Narrow target | Rule |
| --- | --- | --- | --- |
| Primary frame | Current Visual Polish frames are `1600 x 908` visible inside a named `1600x1024` stage; ShellRail remains `224 x 1024`. | `1024`, `768`, and mobile review widths. | Desktop is the primary closeout target; mobile is a safe review projection, not desktop squeezed down. |
| ShellRail | `224px` fixed left rail, dark glass, route ownership only. | Collapses or becomes compact navigation by separate review. | No AppLibrary, NavigationLibrary, dock, or desktop window model. |
| TopBar | `x=252`, `y=24`, `1296 x 58`; System Search is adaptive between the `230px` narrow contract and `379px` wide contract while the right cluster stays right-aligned. | Search width is calculated from the available space between the left offset and the right cluster; do not hard-code the visual baseline `340px` capture. | Search is a form/result surface, not an app drawer, and must never overlap environment/operator/route pills. |
| Metric row | Four `300 x 150` metric cards at `x=276/592/908/1224`, `y=102`. | Collapse to stacked cards only after narrow review. | Values and status chips must not wrap or collide. |
| Primary panels | Three `416 x 260` panels at `x=252/692/1132`; Operations/Accounts `y=300`, Usage `y=288`. | Collapse by owner page, not by mixing unrelated modules. | Avoid card-inside-card separation. Use header, table, divider, drawer, or tabs instead. |
| Lower evidence row | Chart/event-log surfaces start near `y=596`, `628 x 280`. | Converts to tabs or stacked evidence sections. | Evidence rows stay read-only and safe-ref only. |
| Detail content | Drawer, popover, expanded row, or section detail. | Drill-in card or stacked detail. | Do not add long explanatory paragraphs to the main canvas. |
| Hidden/draft content | Developer/design-review only. | Same. | Field counts, design adapter copy, purpose, ownership, and next-step copy should not be normal UI content. |

## Page Layout Matrix

| Page | Desktop layout | First-screen priority | Secondary content | Narrow/mobile projection | Hard layout boundary |
| --- | --- | --- | --- | --- | --- |
| `Operations Overview` | TopBar, four metrics, `Risk Queue`, `Next Actions`, `Review Candidates`, lower operations metrics/event evidence. | Health, risk count, freshness, channel coverage, top review candidate, owner-page route. | Locked future areas may appear as muted route targets only. | Single review flow: status summary, risk queue, next action. | No account/resource table, no usage ledger, no channel ledger, no lifecycle controls. |
| `Accounts & Resources` | TopBar, four account/resource metrics, `Account Directory`, `Resources & Orders`, `Lifecycle`, lower account metrics/event evidence. | Account selection, resource/order status, quota pressure, lifecycle warning. | Safe history preview and disabled future actions. | Account selector, selected account summary, one table/detail section at a time. | No collector activation, channel diagnostics, route latency, or runtime controls. |
| `Usage & Channels` | TopBar, four usage/channel metrics, `Collection Freshness`, `Channel Coverage`, `Usage Ledger`, lower usage metrics/event evidence. | Freshness, measured/missing channels, usage ledger evidence, anomaly count. | Receipt/collector diagnostics and route latency placeholders when safe. | Freshness status, channel status, ledger/anomaly switcher, diagnostics drill-in. | No quota ownership, account disable, order archive, or artifact lifecycle decisions. |
| `Audit & Cases` | Locked slot only. | Locked state and entry gate only. | None until durable case/history exists. | Locked state only. | No route promotion, note write, close/reopen, or object history UI. |
| `Platform Development` | Locked slot only. | Locked state and entry gate only. | None until safe tooling contracts exist. | Locked state only. | No node provisioning, runtime apply, or platform tool execution. |
| `System Settings` | Locked slot only. | Locked state and entry gate only. | None until private settings boundary exists. | Locked state only. | No auth-model change, public settings route, or production mutation. |

## Module Layout Matrix

| Page | Module | Desktop placement | Size priority | Interaction model | Effect goal |
| --- | --- | --- | --- | --- | --- |
| `Operations Overview` | `Health Summary` | Top full-width metric row. | Primary. | Read-only metric cards. | Fast scan, minimal chrome, no draft labels. |
| `Operations Overview` | `Risk Queue` | Main content column or full-width queue under metrics. | Primary. | Select candidate and route. | Dense enough for comparison, not a case-management page. |
| `Operations Overview` | `Next Actions` | Side column or compact route cards beside/below queue. | Secondary. | Open owner page or show locked gate. | Clear route affordance without action overload. |
| `Accounts & Resources` | `Account Directory` | Left/top selector table depending viewport. | Primary. | Filter, select account, view state. | Directory feel, not a marketing card. |
| `Accounts & Resources` | `Resources & Orders` | Largest table region. | Primary. | Sort/filter, row select, detail drawer. | Operational density with safe refs and stable columns. |
| `Accounts & Resources` | `Quota & Usage` | Side panel or row detail panel. | Primary for selected object. | Review policy; disabled edit affordance until gate. | Control surface, not a monitoring ledger. |
| `Accounts & Resources` | `Lifecycle` | Side/detail panel near quota. | Secondary. | Review state lanes and future dry-run split. | Decision clarity without implying mutation. |
| `Accounts & Resources` | `History & Events` | Lower timeline or drawer tab. | Secondary. | Read-only preview. | Context only, visually quieter than owner tables. |
| `Usage & Channels` | `Collection Freshness` | Top status strip. | Primary. | Expand detail only. | Trust state visible before ledgers. |
| `Usage & Channels` | `Channel Coverage` | Card/ledger region above or beside usage ledger. | Primary. | Inspect missing coverage and blockers. | Evidence hierarchy, not platform tooling. |
| `Usage & Channels` | `Usage Ledger` | Main table region. | Primary. | Read-only table with filters/pagination later. | Table-first, safe-ref overflow guarded. |
| `Usage & Channels` | `Collection Anomalies` | Queue beside/below ledger. | Secondary. | Classify and route evidence. | Attention surface without false-positive close controls. |
| `Usage & Channels` | `Receipts & Collectors` | Diagnostic panel. | Secondary. | Read-only evidence availability. | Technical but calm; no raw logs/config. |

## Visual Effect Matrix

| UI layer | Desired effect | Required treatment | Reject |
| --- | --- | --- | --- |
| App background | Calm technical workspace. | Dark blue gradient/glass shell with subtle depth; no decorative texture competing with data. | Visible drafting grid, decorative blobs, bokeh, radial empty-state decoration. |
| Shell/status bar | Stable protected console context. | ShellRail plus TopBar; compact route/search/operator controls. | Search dominating the page, crowded button clusters, page-specific business tables. |
| Page header | Hidden in current clean-baseline pages. | Route identity lives in ShellRail and TopBar; explanatory titles stay in docs or state feedback. | Hero-scale typography inside workbench pages. |
| Panels | Crisp one-level surfaces. | 8px radius, 1px token border, restrained low shadow. | Nested floating cards, muddy multi-layer shadows, heavy glass effects. |
| Metric cards | Scan-first summary. | Strong value, short label, semantic tone, bounded trend slot. | Overdecorated icon gradients, huge numbers that break layout, fake trends or unlabeled curves. |
| Tables | Operational comparison. | Dense rows, safe refs, clear headers, stable overflow behavior. | Spreadsheet clutter, clipped refs, hidden columns without mobile strategy. |
| Queues | Review priority. | Severity/state chips, bounded rows, selected row state. | Durable case actions before backend exists. |
| Chips | State language. | Semantic color plus text/icon; no color-only meaning. | High-saturation palette overload or status ambiguity. |
| Icons | Consistent product glyphs. | Lucide/repo style, solid app tone, 16/18/20px glyph inside stable slots. | Glossy highlights, multi-stop gradients on every tile. |
| Empty/loading/stale/error | Honest system feedback. | Shared `StateFeedback`, concise next safe step, no sensitive detail. | Decorative empty cards or vague "all good" when data is missing. |
| Drawers/popovers | Detail without page bloat. | One focused detail surface, close affordance, safe refs only. | Scroll-modal feel, nested drawers, raw logs/config exposure. |
| Focus states | Keyboard-visible and professional. | Visible tokenized focus ring and preserved outline behavior. | `outline: none` without replacement. |

## Typography And Density Matrix

| Text role | Target | Rule |
| --- | --- | --- |
| Page title | Compact workbench title. | Avoid hero-scale type unless a real landing/header area exists. |
| Section title | 14-16px, semibold. | Strong enough to scan, not heavier than primary metrics. |
| Table/body text | Readable normal/medium weight. | No non-integer micro sizes; no blanket heavy weights. |
| Utility labels | 10-12px, 600 max for short labels. | Use sparingly; do not make every label bold. |
| Metric value | Bounded emphasis. | Use clamp and prevent numeric wrapping. |
| Support copy | One short sentence. | If it needs a paragraph, it belongs in docs, tooltip, drawer, or empty-state detail. |

## Responsive Matrix

| Width | Expected layout | QA focus |
| --- | --- | --- |
| `1600px` | Canonical desktop frame. | Compare against Figma page mirrors and component mirror density. |
| `1366px` | Desktop workbench still multi-column. | No clipped status bar, no collapsed table headers unless intentional. |
| `1024px` | Tablet-safe desktop collapse. | Tables remain usable; side panels move below or into drawers. |
| `768px` | Narrow review layout. | One-column sections, clear section switcher, no overlapping chrome. |
| `390px` | Mobile review mode. | One active review card/detail at a time, no desktop grid assumptions. |

Mobile and narrow breakpoints should preserve the same ownership and redaction
rules. They may change information order when the operator task changes.
`116:2` is the current Figma strategy frame for the `1024px` and `768px`
checks; it is not a substitute for browser screenshots.

## Figma And Browser QA Matrix

| Axis | Evidence to collect | Pass condition |
| --- | --- | --- |
| Figma page mirror | Clean baseline route cards `24:5`, `24:35`, `24:65`, plus `01 Design Rules V1-Polish`, `02 Component Contract`, `04 Figma-to-React Mapping`, and `90 Evidence Gates`. | Page structure and shared primitives match the matrix; no older one-page file or superseded draft is used as current source. |
| DOM grammar | `data-page-id`, `data-layout`, `data-density`, `data-ui-role`, `data-mobile-projection`, `data-figma-component`. | Rendered pages expose the expected grammar hooks for QA. |
| Desktop screenshot | `1600px` and a common desktop width such as `1366px`. | No overlap, no draft chrome, no nested-card visual clutter, no wide stretching. |
| Narrow screenshot | `1024px` and `768px`. | Sections collapse predictably and tables remain readable. |
| Mobile screenshot | `390px` or equivalent review frame. | No desktop grid leakage, no blocked controls, no content under chrome. |
| Style contract | Admin CSS token and style tests. | No unapproved radius, hard-coded shadows, muddy effects, glossy gradients, or typography regressions. |
| A11y/focus | Keyboard tab path and focus rings. | Focus is visible; controls have names; status is not color-only. |
| Safety boundary | Text scan and fixture scan. | No token, credential, subscription URL, raw config/log/env, SQLite row, edge material, or customer-private data. |

## Implementation Gate

Before a visual implementation PR is ready:

1. The page uses `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md` for visible content.
2. The page uses this document for layout, surface, density, effect, and QA.
3. The page does not show design-only copy such as `purpose`, `ownership`,
   `nextStep`, field counts, or design adapter labels in normal operator mode.
4. Shared primitives are preferred over page-local card variants.
5. Tables, queues, and diagnostic panels have explicit empty, stale,
   disconnected, and loading states.
6. Desktop and narrow screenshots are collected against the local Admin app.
7. The Browser/Chrome visual pass records intentional deviations from Figma.
8. Tests cover English copy, component hooks, route ownership, and safe-data
   boundaries before the PR is marked ready.

## Out Of Scope

This matrix does not approve:

- a new navigation model;
- a return to the older App Library / OS implementation target;
- backend DTO or live API changes;
- account, order, quota, collector, runtime, audit, or case write flows;
- schema/migration work;
- production, cloud, DNS, Nginx, systemd, firewall, or deploy actions.
