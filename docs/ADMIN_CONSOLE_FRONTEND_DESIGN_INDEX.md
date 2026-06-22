# Admin Console Frontend Design Index

Last updated: 2026-06-22, America/Los_Angeles.

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
| Current refined visual references | `09 Layout Effect Draft v1.2 Text Rhythm / 1600x1024`, `10 Layout Effect Draft v1.3 Accounts & Resources / 1600x1024`, `11 Layout Effect Draft v1.3 Usage & Channels / 1600x1024` |
| Current frame nodes | `99:2`, `104:2`, `104:226` |
| Direct review URL | <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19?node-id=99-2> |
| Local screenshot evidence | `tmp/figma-admin-layout-effect-draft-v1-2-text-rhythm-final.png` |
| Design posture | Figma is the visual source; Git stores design contracts, implementation code, QA records, and optional review screenshots. |

The `tmp/` screenshot is local review evidence only. It is not the canonical
design source and should not be treated as a permanent Git asset unless a
separate visual baseline decision adds screenshots to the repository.

## Current Figma Coverage

The canonical file now contains both the original page mirrors and a refined
visual draft. They have different roles:

| Surface | Node | Role | Current design status |
| --- | --- | --- | --- |
| `01 Operations Overview / 1600x1024` | `2:81` | Original page mirror and ownership map. | Superseded visually by `99:2`, still useful for page content lineage. |
| `02 Accounts & Resources / 1600x1024` | `2:189` | Original page mirror and ownership map. | Superseded visually by `104:2`, still useful for page content lineage. |
| `03 Usage & Channels / 1600x1024` | `2:309` | Original page mirror and ownership map. | Superseded visually by `104:226`, still useful for page content lineage. |
| `04 State & Safety Matrix` | `2:427` | Required state and safety coverage. | Present, but page-level state placement still needs visual QA. |
| `06` / `07` / `08` current implementation captures | `17:2`, `22:2`, `23:2` | React-visible implementation baseline. | Evidence only; do not treat as final visual design. |
| `09 Layout Effect Draft v1.2 Text Rhythm / 1600x1024` | `99:2` | Refined workbench visual protocol. | Accepted direction for Operations. |
| `10 Layout Effect Draft v1.3 Accounts & Resources / 1600x1024` | `104:2` | Refined Accounts desktop draft. | First review cleanup complete; needs component states and responsive QA. |
| `11 Layout Effect Draft v1.3 Usage & Channels / 1600x1024` | `104:226` | Refined Usage desktop draft. | First review cleanup complete; needs component states and responsive QA. |

Implementation must not infer that all active pages are accepted just because
the first refined desktop drafts now exist. The next design work is to review
`104:2` and `104:226`, place missing component states, and collect narrow/
responsive QA before frontend implementation treats them as final.

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

## Current Page Design Content

### Operations Overview

| Area | Required content | Current Figma intent |
| --- | --- | --- |
| Top status | Search, `Production read-only`, `Summary route`, `No write actions`, operator role. | Protected console context and safe global chrome. |
| Page header | `Overview / Operations Overview`, `Operations Overview`, short operator summary. | Orientation without hero weight. |
| Metric cards | Health, risk cases, collection freshness, channel coverage. | Four fixed text lanes with value, concise note, owner chip, and trend slot. |
| Risk Queue | Level, object, owner, seen, action. | Main operator review queue; overview routes rather than owning detail. |
| Next Actions | Route to Accounts/Usage; locked Audit route. | Compact owner-page handoff, not a duplicate ledger. |
| Owner Page Handoff | Accounts, Usage, Audit ownership strips. | Bottom route ownership reminder with short copy. |

### Accounts & Resources

| Module | Owns |
| --- | --- |
| Account Directory | Account refs, state, linked resources, risk, last safe activity. |
| Resources & Orders | Order/resource/artifact safe refs, plan, lifecycle, delivery state. |
| Quota & Usage | Quota policy, used/total, measured channel count, review note. |
| Lifecycle | Account/order/artifact lifecycle review and future dry-run split. |
| History & Events | Safe computed event preview until durable history exists. |

### Usage & Channels

| Module | Owns |
| --- | --- |
| Collection Freshness | Generated time, observed age, stale/unknown state, threshold. |
| Channel Coverage | Issued/measured/missing channels, blockers, utilization, latency. |
| Usage Ledger | Account/order/channel usage rows with safe refs and collected time. |
| Collection Anomalies | Delay, zero usage, collection gap, missing receipt, owner handoff. |
| Receipts & Collectors | Receipt freshness, collector state, heartbeat/diagnostic availability. |

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

Use this copy pack for the first frontend pass from the v1.2 frame.

| Surface | Copy |
| --- | --- |
| Brand | `GlobalCircle AI`, `Proxy Gateway` |
| Search | `Search users, orders, channels, cases...` |
| Status chips | `Production read-only`, `Summary route`, `No write actions` |
| Operator | `Operator`, `Safe review` |
| Sidebar active | `Overview`, `Accounts`, `Usage` |
| Sidebar planned | `Audit`, `Platform`, `Settings`, state `Plan` |
| Page title | `Operations Overview` |
| Page subtitle | `Operator summary for health, risk routing, and owner-page handoff.` |
| Header chips | `3 modules active`, `Read-only route` |
| Metrics | `Health / Good / Ready / No source errors`; `Risk cases / 18 / +6 yesterday / High 4 · Med 9 · Low 5`; `Freshness / 2m 14s / P95 age / Threshold 5m`; `Coverage / 98.6% / 24 / 25 measured / 1 delayed` |
| Risk Queue | `Level`, `Object`, `Owner`, `Seen`, `Action`; rows route to `Accounts`, `Usage`, or `Audit` |
| Next Actions | `Accounts & Resources`, `Usage & Channels`, `Audit & Cases`; actions `Open`, `Locked` |
| Owner Page Handoff | `Accounts & Resources / Directory · orders · quota / Decision`; `Usage & Channels / Freshness · coverage · receipts / Evidence`; `Audit & Cases / History · review workflow / Planned` |

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
| Responsive | Desktop target is `1600 x 1024`; narrow/mobile are separate safe review projections. |

## Validation Checklist

Before marking a frontend UI pass ready:

1. Figma review uses the canonical file and current frame `99:2`.
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
