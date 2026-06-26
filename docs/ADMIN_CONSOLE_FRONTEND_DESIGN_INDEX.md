# Admin Console Frontend Design Index

Last updated: 2026-06-25, America/Los_Angeles.

> Status:
> - Type: Frontend design source index and implementation handoff map
> - Risk: C for this index; follow-up Admin UI code work is B unless it touches
>   auth, schema/migration, runtime, production gates, deploy, or secrets.
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, raw log, audit export,
>   SQLite row, or customer-data actions.

This is the single entry index for turning the current Admin Figma design into
frontend implementation work. It does not replace the detailed design docs.
It tells a frontend or review agent what to read, what each source controls,
which Figma frame is current, which React surfaces receive the work, and which
boundaries must not be crossed.

## Current Design Source

| Item | Current value |
| --- | --- |
| Canonical Figma file | <https://www.figma.com/design/NefQiIMOPIBU28TIYcwQFE/GlobalCircle-AI-Admin-UI-Baseline---2026-06-25> |
| Archived source handoff | <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19> |
| Current refined visual references | Clean baseline pages: `01 Design Rules V1-Polish`, `02 Component Contract`, `03 Product Baseline Frames`, `04 Figma-to-React Mapping`, `90 Evidence Gates`, and `99 Archive / Source Handoff`. |
| Current product baseline nodes | `24:5` Operations Overview, `24:35` Accounts & Resources, `24:65` Usage & Channels. |
| Direct review URL | <https://www.figma.com/design/NefQiIMOPIBU28TIYcwQFE/GlobalCircle-AI-Admin-UI-Baseline---2026-06-25?node-id=0-1> |
| Clean baseline role | `NefQiIMOPIBU28TIYcwQFE` is now the active Admin UI design baseline. The old handoff file remains archive/lineage only unless a rule is explicitly copied into this baseline and reviewed there. |
| Local screenshot evidence | `output/playwright/admin-new-baseline-qa-1600x1024.png`, `output/playwright/admin-new-baseline-qa-1280x800.png`, and `output/playwright/admin-new-baseline-qa-1024x768.png` were captured for the first visual QA pass. |
| Current Figma Site | <https://www.figma.com/site/fGP4xsj27bbcYRGnzIa3DO/Untitled> |
| Design-source boundary sync | `15 Design Source Boundary / 1600x1024`, node `240:2`, written through Figma connector on 2026-06-23. |
| Design posture | Figma design is the frontend design repository and visual contract source; GitHub stores runnable implementation, tests, contracts, docs, and QA evidence; Figma Site is optional demo/click-flow review only. |

The clean baseline project is the current design source for the three active
Admin pages. Local screenshots are review evidence only and must not replace
the canonical Figma design frames.

Scope rule:

- The three Visual Polish pages are page baselines for the active routes, not a
  completed universal component library.
- Reusable standards are the extracted visual protocol: ShellRail/TopBar
  chrome, System Search density, surface/card treatment, metric lane rhythm,
  row/table density, state semantics, focus, and motion.
- Page-local assemblies such as Risk Queue, Account Directory, Lifecycle,
  Usage Ledger, Channel Coverage, and collector evidence stay page-owned unless
  a separate component contract promotes them.
- Curves, sparklines, and chart-like lines are visual evidence slots until a
  source, time window, aggregation, threshold, empty/stale behavior, and
  accessibility contract exists.

## Three-Party Evidence Boundary

Use this boundary when reviewing design work or handing tasks between agents.
Local browser screenshots and local development servers are useful reference
evidence, but the reviewable source chain is Figma, GitHub, and Linear.

| Surface | Owns | Does not own | Current evidence |
| --- | --- | --- | --- |
| Figma design | Frontend design repository: page frames, component specs, visual baselines, responsive rules, copy/state contracts, and design acceptance notes. | Runtime frontend code, backend data, production authority, or secrets. | Canonical design file `NefQiIMOPIBU28TIYcwQFE`; active product baseline cards `24:5`, `24:35`, `24:65`; old handoff file is archive/lineage only. |
| GitHub | Runnable Admin React/CSS/tests, design contracts, validation records, and PR review history. | Unreviewed visual decisions that bypass Figma and the design docs. | Current branch `codex/admin-figma-mirror-visual-qa`; Draft PR #364 tracks the visual review packet. |
| Linear | Task gates, review ownership, phase acceptance, and next-stage sequencing. | Code, design source of truth, production approval, or secret storage. | GCC Admin UI task line and acceptance notes. |

Figma Site is a fourth optional review surface, not a source of truth. It may
host a clickable demo after a design is accepted, but it must not replace the
canonical Figma `/design` file, GitHub implementation, or Linear acceptance
trail. The current Site link above is initialized for future demo use only.

Historical connector update, 2026-06-24: live Figma metadata for node `365:2`
confirmed page `06 AI Exploration` and the three Visual Polish frames that were
current at that time. The previous `99:2`, `104:2`, and `104:226` frames became
historical draft lineage.

Historical connector update, 2026-06-25: live Figma metadata also confirmed
`V1 Design Rules · Master Reference` at node `501:488` and `12` responsive
Visual Polish frames under `06 AI Exploration`. Those rules were used as input
for the clean baseline, but the current implementation source is now
`NefQiIMOPIBU28TIYcwQFE`. Frontend implementation must use breakpoint-driven
layout adaptation, not whole-frame scaling or baseline-only coordinates.

Baseline project update, 2026-06-25: the clean Figma baseline project
`NefQiIMOPIBU28TIYcwQFE` is populated and re-verified. It now owns the active
source boundary through `00 Index & Project Map`, reusable rules through
`01 Design Rules V1-Polish`, component responsibilities through
`02 Component Contract`, route baselines through `03 Product Baseline Frames`,
implementation mapping through `04 Figma-to-React Mapping`, PR gates through
`90 Evidence Gates`, and lineage through `99 Archive / Source Handoff`.
The original handoff file is historical canvas only.

## Current Figma Coverage

The active clean baseline contains the source boundary, rule cards, component
contract cards, route baseline cards, implementation mapping, evidence gates,
and archive page. Older handoff frames have different lineage roles:

| Surface | Node | Role | Current design status |
| --- | --- | --- | --- |
| Clean baseline project | `NefQiIMOPIBU28TIYcwQFE` | Active Admin UI design baseline. | Use for implementation handoff and visual QA. |
| `Product Baseline / Operations Overview` | `24:5` | Active Operations route baseline card. | Current source for page ownership and first-screen modules. |
| `Product Baseline / Accounts & Resources` | `24:35` | Active Accounts route baseline card. | Current source for page ownership and first-screen modules. |
| `Product Baseline / Usage & Channels` | `24:65` | Active Usage route baseline card. | Current source for page ownership and first-screen modules. |
| `01 Operations Overview / 1600x1024` | `2:81` | Original page mirror and ownership map. | Superseded visually by `373:716`, still useful for page content lineage. |
| `02 Accounts & Resources / 1600x1024` | `2:189` | Original page mirror and ownership map. | Superseded visually by `373:866`, still useful for page content lineage. |
| `03 Usage & Channels / 1600x1024` | `2:309` | Original page mirror and ownership map. | Superseded visually by `373:1016`, still useful for page content lineage. |
| `04 State & Safety Matrix` | `2:427` | Required state and safety coverage. | Present, but page-level state placement still needs visual QA. |
| `06` / `07` / `08` current implementation captures | `17:2`, `22:2`, `23:2` | React-visible implementation baseline. | Evidence only; do not treat as final visual design. |
| `09 Layout Effect Draft v1.2 Text Rhythm / 1600x1024` | `99:2` | Prior refined workbench protocol. | Superseded by `373:716`; keep as lineage only. |
| `10 Layout Effect Draft v1.3 Accounts & Resources / 1600x1024` | `104:2` | Prior Accounts desktop draft. | Superseded by `373:866`; keep as lineage only. |
| `11 Layout Effect Draft v1.3 Usage & Channels / 1600x1024` | `104:226` | Prior Usage desktop draft. | Superseded by `373:1016`; keep as lineage only. |
| `AI Candidate Baseline / Operations Overview / 1600x1024` | `365:8` | Baseline AI candidate. | Reference only; hidden contract/footer areas are not current visible UI. |
| `AI Candidate Baseline / Accounts & Resources / 1600x1024` | `365:52` | Baseline AI candidate. | Reference only; hidden contract/footer areas are not current visible UI. |
| `AI Candidate Baseline / Usage & Channels / 1600x1024` | `365:96` | Baseline AI candidate. | Reference only; hidden contract/footer areas are not current visible UI. |
| `AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024` | `373:716` | Archived Operations desktop exploration. | Lineage only; not an active implementation source. |
| `AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024` | `373:866` | Archived Accounts desktop exploration. | Lineage only; not an active implementation source. |
| `AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024` | `373:1016` | Archived Usage desktop exploration. | Lineage only; not an active implementation source. |

Implementation must now treat `NefQiIMOPIBU28TIYcwQFE` as the current design
source and `24:5`, `24:35`, and `24:65` as the active route baseline cards.
The older `373:716`, `373:866`, `373:1016`, `99:2`, `104:2`, and `104:226`
nodes remain lineage only unless a review explicitly copies their rule into
the clean baseline and re-accepts it there.

Local sync status, 2026-06-24:

- Shell chrome, page summary metrics, primary panel geometry, and the lower
  evidence row are now represented in local React/CSS.
- The desktop Visual Polish card geometry is tokenized in
  `admin/src/styles/admin-os-visual-polish.css` and guarded by
  `admin/src/test/admin-style-contract.test.ts`: metric cards `300 x 150`,
  primary panels `416 x 260`, metric-to-panel gap `48`, and lower evidence
  panels `628 x 280`.
- The lower evidence row maps to local `EvidenceSurface` DOM hooks and the
  `evidence-row` surface role. This is a page-level visual evidence slot, not a
  new navigation library, app library, or freeform OS windowing model.
- Metrics evidence surfaces must be structurally identical across Operations,
  Accounts, and Usage: chart header, right-aligned time range, legend row,
  plot/grid/axis, and bottom x-axis. They must not render page-local bottom
  stat cards or rely on route-specific CSS to hide/show chart subregions.
- The curve shapes are safe static design evidence. The local contract now
  records source name, sampling window, aggregation, threshold, empty/stale
  behavior, redaction mode, and backend adapter state, but all panels remain
  `design-static` until reviewed read-only DTOs are approved.
- First-screen primary panels are now a three-page shared rule, not page-local
  improvisation: each active route uses exactly three `416 x 260` panels with
  compact `DataRowCompact` rows. Operations uses `Risk Queue`, `Next Actions`,
  `Review Candidates`; Accounts uses `Account Directory`, `Resources & Orders`,
  `Lifecycle`; Usage uses `Collection Freshness`, `Channel Coverage`,
  `Usage Ledger`.
- The primary panel bodies must not show the retired hide/visibility action,
  AppLibrary/NavigationLibrary recovery text, severity filter bars, old table
  controls, or code-development instruction chips. Those are draft residue, not
  Visual Polish UI.

Evidence data-contract status:

| Surface | Owner page | Contract state | Backend state |
| --- | --- | --- | --- |
| `operationsMetrics` | `dashboard` | `design-static` | `pending-contract` |
| `operationsEventLog` | `dashboard` | `design-static` | `pending-contract` |
| `accountMetrics` | `portalRequests` | `design-static` | `pending-contract` |
| `accountEventLog` | `portalRequests` | `design-static` | `pending-contract` |
| `usageMetrics` | `usageMonitor` | `design-static` | `pending-contract` |
| `usageChannelEventLog` | `usageMonitor` | `design-static` | `pending-contract` |

The contract lives in `admin/src/app/admin-evidence-contract.ts` and is
verified by `admin/src/test/admin-evidence-contract.test.tsx`. It is a guard
against accidental real-data assumptions, not a backend integration.

First-review cleanup completed on 2026-06-22:

- removed visible `preview` wording from operator UI copy;
- replaced raw-log-oriented Usage copy with diagnostics-locked copy;
- kept `Account Directory` account-only in the Accounts draft;
- cleaned stale cloned layer names in Accounts and Usage refined frames.

GCC-122 evidence frames added on 2026-06-22:

- `115:2` `12 GCC-122 Component State Placement / 1600x1024`;
- `116:2` `13 GCC-122 Responsive QA Strategy / 1600x1024`;
- `117:2` `14 GCC-122 Figma-to-code Mapping / 1600x1024`.

Local review screenshots:

- `tmp/figma-gcc122-component-state-placement-115-2.png`;
- `tmp/figma-gcc122-responsive-qa-116-2.png`;
- `tmp/figma-gcc122-figma-to-code-mapping-117-2.png`.

These frames define design QA and code handoff rules; they are not new Admin
pages.

## Required Reading Order

Use this order before implementing or reviewing Admin frontend UI from the
current design.

| Step | Read | Purpose |
| --- | --- | --- |
| 1 | This index | Establish the active Figma frame, source stack, implementation targets, and hard stops. |
| 2 | `docs/ADMIN_CONSOLE_DESIGN_COMPLETION_CHECKLIST.md` | Confirm Figma/page/visual/component-state gates before moving to implementation. |
| 3 | `docs/ADMIN_CONSOLE_NEXT_STAGE_EXECUTION_CHECKLIST.md` | Confirm the next task order, hard stops, and per-lane acceptance criteria after design completion. |
| 4 | `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md` | Confirm canonical Figma file, required mirror frames, component mirror, parity matrix, and Figma-to-code evidence. |
| 5 | `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md` | Confirm page/module content, visible UI copy, hidden design-only copy, and safe fixture boundaries. |
| 6 | `docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md` | Confirm layout, module priority, visual hierarchy, responsive behavior, and visual QA criteria. |
| 7 | `docs/ADMIN_CONSOLE_NAVIGATION_IA.md` | Confirm navigation ownership, active/planned pages, route gates, and sub-navigation boundaries. |
| 8 | `docs/ADMIN_CONSOLE_DOMAIN_DICTIONARY.md` | Confirm object wording, decision ownership, page responsibility, and forbidden decision moves. |
| 9 | `docs/ADMIN_CONSOLE_FRONTEND_STRUCTURE_BLUEPRINT.md` | Confirm shell/page/section/widget/data-adapter structure and rendered grammar metadata. |
| 10 | `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` | Confirm component inventory, function boundaries, implementation phases, and QA tool roles. |
| 11 | `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md` | Confirm token, typography, radius, shadow, density, focus, icon, and responsive rules. |

Do not implement from old screenshots, older single-page Figma files, or the
earlier App Library / browser-OS experiment unless a new IA/design decision
explicitly reopens that direction.

Do not implement from Figma Site. The Figma MCP/connector is a design-context
bridge for the canonical `/design` file; it is not a frontend runtime, not a
replacement for React/Admin code, and not a source for production UI behavior.

## Design Requirements

The current frontend design work must satisfy these requirements:

1. Admin is a protected operator console for supervision, operations,
   maintenance, and future platform development.
2. Admin is not the User Portal, not a subscription creation page, and not a
   public production execution console.
3. Current implementation target is a structured Admin workbench:
   left navigation, top status/search bar, and page-owned content area.
4. The active page set is `Operations Overview`, `Accounts & Resources`, and
   `Usage & Channels`.
5. `Audit & Cases`, `Platform Development`, and `System Settings` remain
   planned/locked until backend contracts, redaction boundaries, tests, and
   validation exist.
6. UI copy uses English canonical labels in the active Admin interface.
7. Design-only planning text must not appear in normal operator UI.
8. Figma-to-code work must map to shared primitives rather than creating
   page-local one-off card systems.
9. Use safe refs and fixtures only until a separate backend integration task
   provides approved read-only DTOs.
10. No token, credential, subscription URL, raw config/log/env, SQLite row,
    edge material, or customer-private data may appear in Figma, docs,
    fixtures, tests, screenshots, or UI.
11. Figma Site, if used, stays demo-only; implementation must be approved from
    the Figma design frames and this GitHub design index.
12. The visible operator page no longer includes a large hero/page-title block;
    page identity is carried by the ShellRail route state and TopBar context.
13. System Search is a normal top-bar form/result surface. AppLibrary,
    NavigationLibrary, app drawer, dock, drag/resize/windowing, and OS desktop
    behavior are not part of the current Admin implementation target.

## Current Page Design Content

### Operations Overview

| Area | Required content | Current Figma intent |
| --- | --- | --- |
| ShellRail | Brand, primary routes, planned route group. | Compact route ownership; no separate app drawer. |
| TopBar | Center System Search, environment, alert, operator, route pill. | Protected console context and safe global chrome. |
| Metric cards | Platform health, risk cases, collection freshness, channel coverage. | Four baseline `300 x 150` lanes with value, concise note, owner chip, and trend slot; breakpoint rules resize to LG/MD widths and SM `2 x 2` layout. |
| Risk Queue | Level, object, owner, seen, action. | Main operator review queue; overview routes rather than owning detail. |
| Next Actions | Route to owner pages; locked future work stays gated. | Compact owner-page handoff, not a duplicate ledger. |
| Review Candidates | Candidate evidence and route ownership. | Bounded review panel, not a durable case-management UI. |
| Lower evidence strip | Operations metrics and event log. | Read-only signal trend and recent event context. |

### Accounts & Resources

| Module | Owns |
| --- | --- |
| Account Directory | Account refs, state, linked resources, risk, last safe activity. |
| Resources & Orders | Order/resource/artifact safe refs, plan, lifecycle, delivery state. |
| Lifecycle | Account/order/artifact lifecycle review and future dry-run split. |
| Account Metrics | Active account, resource order, quota pressure, and lifecycle warning trend. |
| Account Event Log | Safe computed event preview until durable history exists. |

### Usage & Channels

| Module | Owns |
| --- | --- |
| Collection Freshness | Generated time, observed age, stale/unknown state, threshold. |
| Channel Coverage | Issued/measured/missing channels, blockers, utilization, latency. |
| Usage Ledger | Account/order/channel usage rows with safe refs and collected time. |
| Usage Metrics | Freshness, coverage, and anomaly trend evidence. |
| Usage & Channel Event Log | Delay, zero usage, collection gap, missing receipt, and owner handoff context. |

## Frontend Implementation Targets

| Figma / design component | React target | Notes |
| --- | --- | --- |
| Shell / protected frame | `admin/src/components/layout/admin-layout.tsx` | Holds route chrome only; no page business ledgers. |
| Top status bar | `admin/src/components/layout/top-bar.tsx` | Search/status/operator context; compact and token-owned. |
| Sidebar navigation | `admin/src/components/layout/app-sidebar.tsx`, `admin/src/components/primitives/workspace-sidebar.tsx`, `admin/src/app/navigation.ts` | Active pages and planned locked slots. |
| Page frame | `admin/src/pages/admin-console-page-frame.tsx` | Emits grammar metadata and page-level ownership. |
| Metric card | `admin/src/components/primitives/metric-card.tsx` | Use for Overview metrics and owner-page summary metrics. |
| Status chip | `admin/src/components/primitives/status-chip.tsx` | Text plus semantic color; no color-only meaning. |
| Panel frame | `admin/src/components/primitives/panel-frame.tsx` | One visible surface layer; no nested card clutter. |
| Risk/data row | `admin/src/components/primitives/data-table.tsx` | Table/queue rows with stable overflow strategy. |
| Evidence surface | `admin/src/components/primitives/evidence-surface.tsx`, `admin/src/app/admin-evidence-contract.ts` | Page-level lower evidence row with static trend/event slots and explicit data-boundary metadata. |
| State feedback | `admin/src/components/primitives/state-feedback.tsx` and `empty-state.tsx` | Empty, loading, stale, and error states. |
| Privileged gate | `admin/src/components/primitives/privileged-gate.tsx` | Planned/locked/sensitive areas; no hidden unauthorized routes. |
| Overview page | `admin/src/pages/dashboard-page.tsx` | Implement from the v1.2 Operations Overview design first. |
| Accounts page | `admin/src/pages/portal-requests-page.tsx` | Follow the content and layout matrices, not Overview layout. |
| Usage page | `admin/src/pages/subscription-usage-monitor-page.tsx` | Evidence-owner page; no quota/lifecycle decisions. |
| Design contracts | `admin/src/design/figma-mirror.ts`, `admin/src/design/figma-parity.ts`, `admin/src/design/grammar/*`, `admin/src/app/admin-ui-contract.ts` | Keep Figma names, DOM hooks, grammar, and tests aligned. |

## UI Copy Pack For Current Figma Frame

Use this copy pack for the first frontend pass from the Visual Polish frames.

| Surface | Copy |
| --- | --- |
| Brand | `GlobalCircle AI`, `Proxy Gateway` |
| Search | Accessible label stays system-wide: `Search users, orders, channels, cases, or events`. Visible placeholders are page-shortened to avoid TopBar clipping: Operations `Search users, orders, channels...`; Accounts `Search accounts, orders, lifecycle...`; Usage `Search usage, channels, receipts...`. |
| Status chips | Environment, alert count, operator, and route pill in TopBar only. |
| Operator | `Operator`, `Safe review` |
| Sidebar active | `Operations Overview`, `Accounts & Resources`, `Usage & Channels` |
| Sidebar planned | `Audit & Cases`, `Platform Development`, `System Settings` |
| Page title | Hidden in the visible Visual Polish pages; route identity lives in shell chrome. |
| Page subtitle | Hidden in the visible Visual Polish pages; supporting explanation stays in docs or state feedback. |
| Header chips | Removed from normal operator UI. |
| Metrics | `Health / Good / Ready / No source errors`; `Risk cases / 18 / +6 yesterday / High 4 · Med 9 · Low 5`; `Freshness / 2m 14s / P95 age / Threshold 5m`; `Coverage / 98.6% / 24 / 25 measured / 1 delayed` |
| Risk Queue | `Level`, `Object`, `Owner`, `Seen`, `Action`; rows route to `Accounts`, `Usage`, or `Audit` |
| Next Actions | `Accounts & Resources`, `Usage & Channels`, `Audit & Cases`; actions `Open`, `Locked` |
| Review Candidates | Bounded candidate rows with owner route and severity state. |

Copy must stay short enough to fit the v1.2 text lanes. If a label needs a
paragraph, move the detail to docs, tooltip, drawer, or state feedback.

## Visual Rules To Preserve

| Rule | Acceptance |
| --- | --- |
| Text rhythm | No forced sidebar wraps, no floating text in large empty cards, no chip/text collisions. |
| Metric cards | Fixed lanes for label, value, note, detail, owner chip, and trend. |
| Surfaces | Deep-blue glass panels, low shadow, 0.5px/1px border, controlled radius; use shared scene glass tokens instead of one-off rgba values. |
| Grid | Background grid stays faint, tokenized, and below the glass layer; it must never read as a visible desktop grid or compete with text. |
| Color semantics | Blue = navigation/action, green = healthy, amber = delayed/review, red = risk, slate/gray = neutral/planned. |
| Typography | Integer font sizes, no negative letter spacing, heavy weight only for nav, title, and primary metrics. |
| Actions | Overview routes to owner pages; it does not duplicate owner-page ledgers or mutation actions. |
| Visual frame | Current Figma nodes are named `1600x1024` but the visible polished frame is `1600 x 908`; ShellRail remains `224 x 1024`. |
| Chrome geometry | Baseline: ShellRail `0/0/224/1024`; TopBar `252/24/1296/58`. TopBar search is adaptive: do not hard-code `340px`; use the `501:488` rule of a `230px` narrow contract and `379px` wide contract while the right cluster stays right-aligned. |
| Metric geometry | Baseline: four cards at `276/592/908/1224`, `y=102`, `300 x 150`; chips sit inside the upper-right metric region. LG/MD/SM card widths are rule-driven. |
| Panel geometry | Baseline: three primary panels at `x=252/692/1132`, `416 x 260`; Operations/Accounts `y=300`, Usage `y=288`. LG/MD reduce width; SM shows two columns and routes the third panel through subpage/pagination. |
| Panel rows | Primary panel body rows use `DataRowCompact`: two rows per panel, row width `372`, row height `44`, main/detail text left-aligned, status/action text right-aligned. Do not use legacy `DataTable`, fixture preview rows, or page-specific short-card layouts inside the first-screen primary row. |
| Lower evidence | Baseline: chart/event-log panels begin near `y=596`, each `628 x 280`. Metrics charts use one shared `header + time range + legend + plot/grid/axis` structure across all three active pages; no bottom stat cards. Chart area width is `card.width - 56`; chart area height is `card.height - 80`; EventLog rows use columns `16 / 82 / 130 / 290`. |
| Chart scales | Operations uses `Platform Metrics` with `Freshness / Coverage / Risk` and y-axis `99 / 56 / 12`; Accounts uses `Account Metrics` with `Active / Orders / Quota` and y-axis `12 / 6.5 / 1.0`; Usage uses `Usage Metrics` with `Freshness / Coverage / Anomalies` and y-axis `99 / 50 / 1.0`. Time range pills are fixed `26px` slots with `4px` gaps and the `1h` slot highlighted. |
| Responsive | Current scope is `1600`, `1440`, `1280`, and `1024` Figma rules. Widths below `1024px` remain out of scope/pending, not completed mobile design. |

## Validation Checklist

Before marking a frontend UI pass ready:

1. Figma review uses the canonical clean baseline file and current route
   baseline cards `24:5`, `24:35`, and `24:65`.
2. Implemented UI matches the page ownership model from Navigation IA.
3. Visible copy matches the UI content matrix and this copy pack.
4. Design-only copy is not rendered in normal operator mode.
5. Shared primitives expose expected `data-figma-component` and grammar hooks.
6. `Operations Overview` does not render account/resource/usage ledgers as
   owned detail.
7. `Accounts & Resources` does not own collector/runtime/channel diagnostics.
8. `Usage & Channels` does not own quota/lifecycle/account disable decisions.
9. Desktop screenshot at `1600px` shows no overlap, clipped text, wrap drift,
   or nested-card clutter.
10. Narrow screenshots at `1024px` and `768px` remain readable.
11. Keyboard focus remains visible; no `outline: none` without replacement.
12. No sensitive material appears in UI, fixtures, tests, logs, screenshots, or
    docs.

Expected local validation for Admin UI implementation remains:

```powershell
npm run admin:test
npm run admin:build
npm test
git diff --check
```

For docs-only updates to this index, `git diff --check` is sufficient.

## Out Of Scope

This index does not approve:

- live backend API wiring;
- account creation or disablement;
- quota mutation;
- order pause/archive/restore;
- subscription artifact mutation;
- collector activation;
- runtime apply;
- privileged Key/Audit/Log UI promotion;
- schema/migration work;
- public Admin exposure;
- production/cloud/DNS/Nginx/systemd/firewall/deploy actions.

## Update Rule

When the active Figma frame changes, update this document first with:

1. new frame name;
2. new node id and direct review URL;
3. changed copy pack;
4. changed component targets;
5. changed validation evidence.

Then update `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md` if the mirror contract or
component parity matrix changes. Do not silently move the frontend source from
Figma to screenshots or local temporary files.
