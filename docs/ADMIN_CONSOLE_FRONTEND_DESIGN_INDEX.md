# Admin Console Frontend Design Index

Last updated: 2026-06-24, America/Los_Angeles.

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
| Canonical Figma file | <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19> |
| Current refined visual references | `06 AI Exploration`: `AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024`, `AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024`, `AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024` |
| Current frame nodes | `373:716`, `373:866`, `373:1016` |
| Direct review URL | <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19?node-id=365-2> |
| Local screenshot evidence | None required for this sync; Figma connector metadata is the current evidence. |
| Current Figma Site | <https://www.figma.com/site/fGP4xsj27bbcYRGnzIa3DO/Untitled> |
| Design-source boundary sync | `15 Design Source Boundary / 1600x1024`, node `240:2`, written through Figma connector on 2026-06-23. |
| Design posture | Figma design is the frontend design repository and visual contract source; GitHub stores runnable implementation, tests, contracts, docs, and QA evidence; Figma Site is optional demo/click-flow review only. |

The `06 AI Exploration` Visual Polish frames are the current desktop design
source for the three active Admin pages. Local screenshots are review evidence
only and must not replace the canonical Figma design frames.

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
| Figma design | Frontend design repository: page frames, component specs, visual baselines, copy/state contracts, and design acceptance notes. | Runtime frontend code, backend data, production authority, or secrets. | Canonical design file `oZuKNtGPhP6oOQ0MSzpfvn`; active Visual Polish frames `373:716`, `373:866`, `373:1016`; design-evidence frames remain reference material. |
| GitHub | Runnable Admin React/CSS/tests, design contracts, validation records, and PR review history. | Unreviewed visual decisions that bypass Figma and the design docs. | Current branch `codex/admin-figma-mirror-visual-qa`; Draft PR #364 tracks the visual review packet. |
| Linear | Task gates, review ownership, phase acceptance, and next-stage sequencing. | Code, design source of truth, production approval, or secret storage. | GCC Admin UI task line and acceptance notes. |

Figma Site is a fourth optional review surface, not a source of truth. It may
host a clickable demo after a design is accepted, but it must not replace the
canonical Figma `/design` file, GitHub implementation, or Linear acceptance
trail. The current Site link above is initialized for future demo use only.

Connector update, 2026-06-24: live Figma metadata for node `365:2` confirmed
page `06 AI Exploration` and the three active Visual Polish frames listed
above. The previous `99:2`, `104:2`, and `104:226` frames are now historical
draft lineage, not the current implementation source.

## Current Figma Coverage

The canonical file contains original mirrors, prior refined drafts, baseline AI
candidates, and the current Visual Polish frames. They have different roles:

| Surface | Node | Role | Current design status |
| --- | --- | --- | --- |
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
| `AI Candidate V1 / Operations Overview / Visual Polish / 1600x1024` | `373:716` | Current Operations desktop design. | Accepted current source for visual/layout implementation. |
| `AI Candidate V1 / Accounts & Resources / Visual Polish / 1600x1024` | `373:866` | Current Accounts desktop design. | Accepted current source for visual/layout implementation. |
| `AI Candidate V1 / Usage & Channels / Visual Polish / 1600x1024` | `373:1016` | Current Usage desktop design. | Accepted current source for visual/layout implementation. |

Implementation must now treat `373:716`, `373:866`, and `373:1016` as the
current desktop design source. It must not continue implementing from the older
`99:2`, `104:2`, or `104:226` drafts unless a review explicitly references
them as historical rationale.

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
| Metric cards | Platform health, risk cases, collection freshness, channel coverage. | Four fixed `300 x 150` lanes with value, concise note, owner chip, and trend slot. |
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
| Search | Operations: `Search users, orders, channels, cases, or events...`; Accounts: `Search accounts, orders, subscriptions, or lifecycle...`; Usage: `Search usage, channels, collectors, or receipts...` |
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
| Surfaces | White/light panels, low shadow, 1px border, controlled radius. |
| Grid | Background grid stays subtle and never competes with text. |
| Color semantics | Blue = navigation/action, green = healthy, amber = delayed/review, red = risk, slate/gray = neutral/planned. |
| Typography | Integer font sizes, no negative letter spacing, heavy weight only for nav, title, and primary metrics. |
| Actions | Overview routes to owner pages; it does not duplicate owner-page ledgers or mutation actions. |
| Visual frame | Current Figma nodes are named `1600x1024` but the visible polished frame is `1600 x 908`; ShellRail remains `224 x 1024`. |
| Chrome geometry | ShellRail `0/0/224/1024`; TopBar `252/24/1296/58`; System Search `340 x 40` centered in TopBar. |
| Metric geometry | Four cards at `276/592/908/1224`, `y=102`, `300 x 150`; chips sit inside the upper-right metric region. |
| Panel geometry | Three primary panels at `x=252/692/1132`, `416 x 260`; Operations/Accounts `y=300`, Usage `y=288`. |
| Lower evidence | Chart/event-log panels begin near `y=596`, each `628 x 280`. |
| Responsive | Desktop target is the current Visual Polish geometry; `1024px`, `768px`, and mobile are separate safe review projections. |

## Validation Checklist

Before marking a frontend UI pass ready:

1. Figma review uses the canonical file and current frames `373:716`,
   `373:866`, and `373:1016`.
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
