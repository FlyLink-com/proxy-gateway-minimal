# Admin Console Figma Mirror

Last updated: 2026-06-25, America/Los_Angeles.

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
| Active route baseline cards | `24:5` Operations Overview, `24:35` Accounts & Resources, `24:65` Usage & Channels |
| Active page set | `00 Index & Project Map`, `01 Design Rules V1-Polish`, `02 Component Contract`, `03 Product Baseline Frames`, `04 Figma-to-React Mapping`, `90 Evidence Gates`, `99 Archive / Source Handoff` |
| Archived file | `oZuKNtGPhP6oOQ0MSzpfvn`; keep for lineage only |
| Deprecated directions | AppLibrary, NavigationLibrary, dock/appbar, hidden-module restore, drag/resize/windowing, and old current-implementation capture frames |

Implementation must not use the archived handoff or old `373:*`, `99:*`, or
`104:*` nodes as the current source. If a rule from the archive is still useful,
copy it into the active baseline and review it there before implementing it.

## Connector Evidence

Figma connector access on 2026-06-25 can read and write the active baseline.
The baseline was populated with the seven pages above, and a read-back scan
confirmed that every page contains content.

Known local evidence:

| Evidence | Result |
| --- | --- |
| `admin/src/design/figma-mirror.ts` | Uses `NefQiIMOPIBU28TIYcwQFE` as `ADMIN_FIGMA_FILE_KEY` and records `oZuKNtGPhP6oOQ0MSzpfvn` as archive. |
| Contract test | `admin/src/test/admin-figma-mirror-contract.test.ts` verifies the active file key, route cards, component contract cards, and visual QA axes. |
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
| `Product Baseline / Operations Overview` | `24:5` | Active Operations route baseline | `dashboard` |
| `Product Baseline / Accounts & Resources` | `24:35` | Active Accounts route baseline | `portalRequests` |
| `Product Baseline / Usage & Channels` | `24:65` | Active Usage route baseline | `usageMonitor` |
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
- Future `Audit & Cases`, `Platform Development`, `System Settings`, and
  `About` areas remain planned until their UI and backend contracts exist.

The mirror must not reintroduce AppLibrary, NavigationLibrary, desktop dock,
freeform resize, hidden-widget restore, or OS-style windowing.

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

Current evidence contracts use baseline route cards `24:5`, `24:35`, and
`24:65` as their Figma source anchors. Old Visual Polish IDs are no longer
active source anchors.

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

1. Update `admin/src/design/figma-mirror.ts` first when page names, frame names,
   source boundaries, or mirror ownership change.
2. Update this document, `docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md`, and
   `docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md`.
3. Update only the active baseline file `NefQiIMOPIBU28TIYcwQFE` for current
   design work. Do not use the older handoff file as an implementation source.
4. Run focused Admin tests for the mirror and visual QA contracts.
5. Run Browser or Chrome viewport checks against the local Admin app before
   marking a visual task done.
6. Record exact validation commands and results.

## Hard Stops

- No raw subscription URLs, tokens, credentials, runtime config, env values,
  logs, SQLite rows, or customer-private data in Figma, docs, tests, or QA
  screenshots.
- No production Admin exposure.
- No production/runtime mutation from mirror or visual QA work.
- No detailed owner-page ledgers duplicated back into Overview.
