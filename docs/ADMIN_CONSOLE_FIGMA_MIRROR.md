# Admin Console Figma Mirror

Last updated: 2026-06-21, America/Los_Angeles.

> Status:
> - Source Figma file:
>   <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn/GlobalCircle-AI-Admin-UI-Handoff---2026-06-19>
> - Local contract: `admin/src/design/figma-mirror.ts`
> - Risk: C for this mirror document; follow-up Admin UI code work is B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This document is the bridge between the Figma canvas, the React Admin console,
and visual QA. The mirror is not a second product surface. It is a reviewable
design artifact that must stay aligned with the local Admin page contracts.

## Current Connector Evidence

Figma metadata and `use_figma` access succeeded on 2026-06-21 for canonical
file `oZuKNtGPhP6oOQ0MSzpfvn`.

Observed current canvas:

| Item | Current value |
| --- | --- |
| Top-level page | `Admin UI Handoff` |
| Canonical build/order frame | `00 Contract & Build Order`, `1600 x 1024` |
| Active page mirror frames | `01 Operations Overview / 1600x1024`, `02 Accounts & Resources / 1600x1024`, `03 Usage & Channels / 1600x1024` |
| Safety/review frames | `04 State & Safety Matrix`, `05 GCC-103 Review Addendum / 1600x1024` |
| Implementation capture frames | `06 Current Implementation / Operations Overview / 1600w full-content capture`, `07 Current Implementation / Accounts & Resources / 1600w full-content capture`, `08 Current Implementation / Usage & Channels / 1600w full-content capture` |
| React-visible implementation baseline | Three active Admin pages: `Operations Overview`, `Accounts & Resources`, `Usage & Channels` |

Previous source mismatch:

| File key | Finding |
| --- | --- |
| `EvQXTtJ2XnRfcGxRLTRt0B` | Older one-page Requirements Map used during early handoff. Do not use it as the active mirror source. |
| `oZuKNtGPhP6oOQ0MSzpfvn` | Canonical multi-frame Admin UI Handoff file. |

Write attempt:

| Field | Result |
| --- | --- |
| Date | 2026-06-21 |
| Attempted operation | Read canonical handoff metadata, execute `use_figma`, and write a shared-plugin-data probe. |
| Connector-reported seat | `Dev / developer`. |
| User-reported Figma UI access | Full access for the connected account. |
| Desktop evidence | Figma Desktop opens the canonical multi-frame file. The Share button shows a Full-seat upgrade prompt; do not continue that prompt through automation. |
| Connector result | `get_metadata` can read the canonical file, `use_figma` can execute, and a shared plugin data write probe succeeded on page `0:1`. |
| Required action | Use the canonical handoff file for future Figma mirror and visual QA work. Avoid Share or seat/billing prompts unless the operator explicitly approves that action. |

Follow-up component mirror evidence:

| Item | Current value |
| --- | --- |
| Page-level handoff | Current. The canonical file contains multi-frame page mirrors and implementation captures. |
| Component-system mirror | Current. The required component-system batch now exists on page `Admin Component Mirror v1`. |
| Observed component sets | `8`: `StatusChip`, `MetricCard`, `PanelFrame`, `DataRow`, `TopBar`, `SidebarNavigation`, `PrivilegedGate`, `StateFeedback` |
| Observed component nodes / variants | `41` component nodes / `41` variants |
| Observed variable collections / variables | `4` collections / `57` variables |
| Observed text styles / effect styles | `6` text styles / `3` effect styles |
| Observed paint styles | `0` |
| Next task line | `Admin React/CSS grammar alignment from Figma Component Mirror v1` |

Do not infer from the previous blocker that the React Admin UI is unavailable.
That blocker was scoped to using the wrong one-page file key and the earlier
`use_figma` permission probe against that key.

## Required Mirror Pages

The canonical local contract is `ADMIN_FIGMA_MIRROR_PAGES` in
`admin/src/design/figma-mirror.ts`.

| Frame | Role | Maps to React page |
| --- | --- | --- |
| `00 Contract & Build Order` | Contract and build-order map | All three active pages |
| `01 Operations Overview / 1600x1024` | Page mirror | `dashboard` / `Operations Overview` |
| `02 Accounts & Resources / 1600x1024` | Page mirror | `portalRequests` / `Accounts & Resources` |
| `03 Usage & Channels / 1600x1024` | Page mirror | `usageMonitor` / `Usage & Channels` |
| `04 State & Safety Matrix` | Safety and boundary matrix | All three active pages |
| `05 GCC-103 Review Addendum / 1600x1024` | Visual QA / review addendum | Figma, DOM, Browser, style-token, and safe-data evidence |

## Page Ownership Rules

The mirror must follow the same ownership model as the React implementation:

- `Operations Overview` is summary and routing only.
- `Accounts & Resources` owns account, resource, order, quota, lifecycle, and
  history-entry panels.
- `Usage & Channels` owns collection freshness, channel coverage, usage ledger,
  collection anomalies, and receipt/collector evidence.
- Future `Audit & Cases`, `Platform Development`, `System Settings`, and
  `About` areas remain planned until their backend and UI contracts exist.

The mirror must not reintroduce the older App Library / OS experiment as an
implementation target. Navigation library and panel hiding remain useful
patterns, but the current web implementation is a structured Admin workbench.

Current implementation alignment:

- `Operations Overview` uses operator chrome for its three visible panels:
  `dashboard-health-summary`, `dashboard-risk-queue`, and
  `dashboard-next-actions`.
- Operator chrome keeps panel IDs, ownership hooks, and hide/restore events,
  but removes draft-only field counts, `Preview` / `Owner` chips, and nested
  fixture preview rows from the visible dashboard surface.
- The `01 Operations Overview / 1600x1024` mirror frame is the reference for
  the current top-level structure: metric cards, `Risk Queue`, and
  `Next Actions`. Owner-page ledgers stay out of Overview.

## Component Mirror Progress

The current Figma source now has the required component-system batch for this
phase. The next Admin UI task is to align the React/CSS grammar with these
components instead of reopening page-level direction.

Completed component mirrors:

- `PanelFrame`
- `MetricCard`
- `StatusChip`
- `DataTable / DataRow`
- `TopBar`
- `Sidebar / Navigation Library`
- `PrivilegedGate`
- `EmptyState / Loading / Stale / Error`

Pending component mirrors:

- None for this phase.

Observed Figma component sets:

| Component set | Node ID | Variants |
| --- | --- | --- |
| `StatusChip` | `69:20` | `5` |
| `MetricCard` | `73:42` | `5` |
| `PanelFrame` | `74:178` | `8` |
| `DataRow` | `75:107` | `5` |
| `TopBar` | `79:88` | `4` |
| `SidebarNavigation` | `82:212` | `6` |
| `PrivilegedGate` | `83:62` | `4` |
| `StateFeedback` | `84:73` | `4` |

Phase 2 Figma validation evidence:

- `use_figma` created `TopBar`, `SidebarNavigation`, `PrivilegedGate`, and
  `StateFeedback` component sets.
- Final Figma inventory reported `8` component sets, `41` component nodes,
  `41` variants, `4` variable collections, `57` variables, `6` text styles,
  and `3` effect styles.
- Screenshot checks covered the four Phase 2 component sets. During that pass,
  `SidebarNavigation`, `PrivilegedGate`, and `StateFeedback` variant grids were
  resized after overlap detection so the canvas shows the complete variant
  library.

Required variant groups:

- Semantic status: success, info, warning, danger, neutral, stale.
- Panel state: default, loading, empty, stale, error.
- Metric priority: stable, attention, critical, unavailable.
- Data-row interaction: default, hover, selected, disabled, flagged.
- Privileged gate state: hidden, gated, fresh-MFA-required, unavailable.

This task line should reuse the existing React grammar and tokens from
`admin/src/design/grammar/*`, `admin/src/app/admin-ui-contract.ts`, and
`admin/src/styles/tokens.css`. It must not create a second naming system in
Figma.

## GCC-118 Design-To-Code Parity Matrix

`GCC-118` is the first hard gate before shared-component implementation
alignment. The local contract is
`admin/src/design/figma-parity.ts`, and the regression coverage lives in
`admin/src/test/admin-figma-mirror-contract.test.ts`.

This matrix makes the implicit handoff explicit:

| Component set | React surface | CSS / grammar responsibility | Next gate |
| --- | --- | --- | --- |
| `StatusChip` | `src/components/primitives/status-chip.tsx` | Semantic status tokens, visible text state, no color-only meaning. | `GCC-119` |
| `MetricCard` | `src/components/primitives/metric-card.tsx` | Metric priority, trend evidence, card density/radius/shadow tokens. | `GCC-119` |
| `PanelFrame` | `src/components/primitives/panel-frame.tsx` | Panel chrome ownership, header layout, density, hide affordance, state chrome. | `GCC-119` |
| `DataRow` | `src/components/primitives/data-table.tsx` | Row interaction, table state rows, safe-ref overflow boundary. | `GCC-119` |
| `TopBar` | `src/components/layout/top-bar.tsx` | Shell height, search/account controls, route status chips, Risk A notice. | `GCC-119` |
| `SidebarNavigation` | `src/components/primitives/workspace-sidebar.tsx` | Sidebar route state, navigation library, local search, planned-route gate. | `GCC-119` |
| `PrivilegedGate` | `admin-ui-contract`, `admin-app-manifest`, and shell safety surfaces | Hidden/gated/fresh-MFA/unavailable semantics and production-action guard copy. | `GCC-119` |
| `StateFeedback` | `src/components/primitives/empty-state.tsx` and `DataTableState` | Loading, empty, stale, error, status/alert role, redacted detail. | `GCC-119` |

The matrix intentionally records current gaps instead of hiding them:

- `StatusChip`: decide whether `stale` becomes an explicit React tone or stays
  warning copy.
- `MetricCard`: normalize overview-specific metric markup with the shared
  primitive where possible.
- `PanelFrame`: move page-level panel chrome overrides back to the shared
  frame.
- `DataRow`: choose one mobile safe-ref strategy: local horizontal scroll or
  stacked row.
- `TopBar`: confirm compact search behavior is token-owned, not page-owned.
- `SidebarNavigation`: lock tablet behavior for the navigation library.
- `PrivilegedGate`: decide whether to extract a first-class primitive from the
  current contract and shell surfaces.
- `StateFeedback`: consolidate empty, loading, stale, and error presentation
  into one explicit mapping.

`PR #355` must stay Draft until this parity matrix, `GCC-119` implementation
alignment, and `GCC-120` breakpoint/state evidence are all complete.

## Visual QA Evidence Axes

Every future visual QA pass should record these axes:

1. Figma mirror status.
2. DOM contract status.
3. Browser desktop viewport status.
4. Browser mobile or narrow viewport status.
5. Style-token regression status.
6. Safe-data boundary status.

The automated contract for these axes is covered by
`admin/src/test/admin-figma-mirror-contract.test.ts` and
`admin/src/test/admin-visual-qa-contract.test.tsx`.

## Update Procedure

1. Update `admin/src/design/figma-mirror.ts` first when page names, frame names,
   or mirror ownership changes.
2. Update this document and `docs/ADMIN_CONSOLE_VISUAL_QA_LEDGER.md`.
3. Update only the canonical `oZuKNtGPhP6oOQ0MSzpfvn` Figma file. Do not use
   the older one-page Requirements Map file for active mirror work.
4. Run focused Admin tests for the mirror and visual QA contracts.
5. Run Browser or Chrome viewport checks against `#/fixture-preview`.
6. Record the exact validation commands before marking the visual task done.

## Hard Stops

- No raw subscription URLs, tokens, credentials, runtime config, env values,
  logs, SQLite rows, or customer-private data in Figma, docs, tests, or QA
  screenshots.
- No production Admin exposure.
- No production/runtime mutation from mirror or visual QA work.
- No detailed owner-page ledgers duplicated back into Overview.
