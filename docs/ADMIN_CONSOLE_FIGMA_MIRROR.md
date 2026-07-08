# Admin Console Figma Mirror

Last updated: 2026-06-22, America/Los_Angeles.

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

Figma metadata and `use_figma` access succeeded on 2026-06-22 for canonical
file `oZuKNtGPhP6oOQ0MSzpfvn`.

Observed current canvas:

| Item | Current value |
| --- | --- |
| Top-level pages | `Admin UI Handoff`; `Admin Component Mirror v1` |
| Canonical build/order frame | `00 Contract & Build Order`, `1600 x 1024` |
| Active page mirror frames | `01 Operations Overview / 1600x1024`, `02 Accounts & Resources / 1600x1024`, `03 Usage & Channels / 1600x1024` |
| Safety/review frames | `04 State & Safety Matrix`, `05 GCC-103 Review Addendum / 1600x1024` |
| Implementation capture frames | `06 Current Implementation / Operations Overview / 1600w full-content capture`, `07 Current Implementation / Accounts & Resources / 1600w full-content capture`, `08 Current Implementation / Usage & Channels / 1600w full-content capture` |
| GCC-122 gate frames | `12 GCC-122 Component State Placement / 1600x1024`, `13 GCC-122 Responsive QA Strategy / 1600x1024`, `14 GCC-122 Figma-to-code Mapping / 1600x1024`, `15 GCC-122 Stage Review Evidence Source Rule / 1600x1024`, `16 GCC-122 PR #364 Review Packet / 1600x1024`, `17 GCC-122 Review Findings And Next Gates / 1600x1024`, `18 GCC-122 P0 Gate Hardening / 1600x1024`, `19 GCC-122 Pagination Standard / 1600x1024` |
| Implementation capture sizing | The `06` / `07` / `08` captures are reference-only full-content captures, not accepted standard page sizes: `1600x1457`, `1600x2346`, and `1600x1650`. |
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
| Next task line | `Admin React/CSS grammar alignment from Figma Component Mirror v1` plus `GCC-122` pagination/mobile-pending contract alignment. |

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

Additional GCC-122 gate frames are tracked separately from
`ADMIN_FIGMA_MIRROR_PAGES` because they are implementation gates rather than
page mirrors. The current hard gate is
`ADMIN_FIGMA_PAGINATION_STANDARD`, mapped to Figma node `157:2`:

| Gate frame | Role | Local contract |
| --- | --- | --- |
| `13 GCC-122 Responsive QA Strategy / 1600x1024` | Desktop/tablet responsive acceptance and mobile boundary. | `ADMIN_UI_CONTRACT.viewportTargets.tabletReview` and `mobilePending` |
| `14 GCC-122 Figma-to-code Mapping / 1600x1024` | Page/component mapping acceptance. | `admin/src/design/figma-parity.ts` and Figma mirror tests |
| `18 GCC-122 P0 Gate Hardening / 1600x1024` | P0 acceptance rows for mapping, responsive, and state placement. | `admin/src/test/admin-figma-mirror-contract.test.ts` |
| `19 GCC-122 Pagination Standard / 1600x1024` | Pagination, route split, bounded internal scroll, and no page-level scroll wall. | `ADMIN_FIGMA_PAGINATION_STANDARD` and module `containmentStrategy` |

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
implementation target. System Search, primary routes, and panel hiding remain
useful patterns, but the current web implementation is a structured Admin
workbench.

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
- `Sidebar / Primary Routes`
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
| `MetricCard` | `src/components/primitives/metric-card.tsx` | Metric priority, trend evidence, card density/radius/shadow tokens. Overview metrics now use this primitive. | `GCC-119` |
| `PanelFrame` | `src/components/primitives/panel-frame.tsx` | Panel chrome ownership, header layout, density, hide affordance, state chrome. | `GCC-119` |
| `DataRow` | `src/components/primitives/data-table.tsx` | Row interaction, table state rows, safe-ref overflow boundary. | `GCC-119` |
| `TopBar` | `src/components/layout/top-bar.tsx` | Shell height, search/account controls, route status chips, Risk A notice. | `GCC-119` |
| `SidebarNavigation` | `src/components/primitives/workspace-sidebar.tsx` | Sidebar route state, System Search handoff, local route controls, planned-route gate. | `GCC-119` |
| `PrivilegedGate` | `src/components/primitives/privileged-gate.tsx`, `admin-ui-contract`, `admin-app-manifest`, and shell safety surfaces | Hidden/gated/fresh-MFA/unavailable semantics and production-action guard copy. | `GCC-119` |
| `StateFeedback` | `src/components/primitives/state-feedback.tsx`, `empty-state.tsx`, and `DataTableState` | Loading, empty, stale, error, status/alert role, redacted detail. | `GCC-119` |

The matrix intentionally records current gaps instead of hiding them:

- `StatusChip`: decide whether `stale` becomes an explicit React tone or stays
  warning copy.
- `MetricCard`: Overview-specific metric markup now routes through the shared
  primitive; `GCC-120` must visually verify its density in the page frame.
- `PanelFrame`: shared panel chrome now exposes stable
  `data-figma-component`, `data-ui-surface`, owner-mode, and workbench-category
  hooks for browser evidence.
- `DataRow`: choose one mobile safe-ref strategy: local horizontal scroll or
  stacked row. This is now blocked on a dedicated accepted mobile standard
  instead of being treated as complete desktop reuse.
- `TopBar`: confirm compact search behavior is token-owned, not page-owned.
- `SidebarNavigation`: tablet behavior is token-owned, contract-covered, and
  has `GCC-120` browser evidence for 768 and 1024-class viewports.
- `PrivilegedGate`: the shell production guard is now a first-class primitive;
  future super-admin detail surfaces remain contract-only until backend
  authority exists.
- `StateFeedback`: consolidate empty, loading, stale, and error presentation
  into one explicit mapping.

GCC-119 implementation alignment started from the shared primitives rather than
page-local rewrites:

- `StateFeedback` is now a first-class primitive with `empty`, `loading`,
  `stale`, and `error` tones, named `status` / `alert` roles, chrome variants,
  and a stable `data-ui-surface="state-feedback"` hook.
- `EmptyState` now delegates to `StateFeedback` while retaining the existing
  workstream and case chrome class names.
- `DataTableState` now accepts the shared state-feedback tones and renders state
  content through `StateFeedback` inside the existing table cell.
- `MetricCard`, `StatusChip`, `TopBar`, `WorkspaceSidebar`, and System Search /
  primary-route surfaces now expose stable `data-figma-component` /
  `data-ui-surface` hooks for GCC-120 browser evidence.
- Overview health metrics now render through `MetricCard` instead of the old
  page-local `admin-overview-metric-card` contract.
- `PanelFrame` now exposes stable Figma/DOM hooks for owner mode, surface, and
  workbench category.
- `PrivilegedGate` is now a first-class primitive for the shell production
  action guard; it does not add production authority or backend write behavior.

`PR #355` merged after the linked Linear review gates for the parity matrix,
`GCC-119` implementation alignment, and `GCC-120` breakpoint/state evidence
were accepted. Treat this file as the merged Admin Figma mirror baseline, not
as an open Draft gate. Follow-on PRs #356, #357, and #358 extended the same
baseline with System Search safe discovery, workspace layout presets, and the
Admin capability boundary matrix.

## GCC-122 Pagination And Mobile Boundary

`GCC-122` changes the active implementation boundary:

- Desktop `1600x1024` remains the primary web design target.
- Tablet `1024x768` is an accepted responsive check target.
- Mobile is `pending-dedicated-standard`; do not report mobile as completed
  until a dedicated Figma mobile frame is accepted.
- Long tables/lists must declare one of `pagination`, `route-split`, or
  `bounded-internal-scroll` before implementation.
- Pagination belongs inside the data card. Do not add floating page-level
  pagination or duplicate header controls.
- If a page exceeds the standard viewport, move content to a subpage or
  paginated list rather than stacking more panels into the same page.

Current local implementation hooks:

| Contract | Purpose |
| --- | --- |
| `admin/src/design/figma-mirror.ts` | Exports `ADMIN_FIGMA_PAGINATION_STANDARD` for node `157:2` and adds `pagination-containment` to the visual QA axes. |
| `admin/src/design/grammar/layout.ts` | Replaces the old mobile projection with `mobileStandardStatus: "pending-dedicated-standard"`. |
| `admin/src/app/admin-ui-contract.ts` | Adds `tabletReview` and `mobilePending` viewport contracts. |
| `admin/src/app/admin-ui-projection.ts` | Projects every module's `containmentStrategy` and binds non-trivial strategies to node `157:2`. |
| `admin/src/app/admin-module-contract.ts` | Fails contract checks when a module lacks a containment strategy. |
| `admin/src/components/primitives/panel-frame.tsx` | Emits `data-containment-strategy` and `data-pagination-standard-node-id`. |

Current module containment map:

| Page | Module | Strategy |
| --- | --- | --- |
| `Operations Overview` | `Health Summary` | `not-applicable` |
| `Operations Overview` | `Risk Queue` | `pagination` |
| `Operations Overview` | `Next Actions` | `not-applicable` |
| `Accounts & Resources` | `Account Directory` | `pagination` |
| `Accounts & Resources` | `Resources & Orders` | `pagination` |
| `Accounts & Resources` | `Quota & Usage` | `not-applicable` |
| `Accounts & Resources` | `Lifecycle` | `route-split` |
| `Accounts & Resources` | `History & Events` | `pagination` |
| `Usage & Channels` | `Collection Freshness` | `not-applicable` |
| `Usage & Channels` | `Channel Coverage` | `pagination` |
| `Usage & Channels` | `Usage Ledger` | `pagination` |
| `Usage & Channels` | `Collection Anomalies` | `pagination` |
| `Usage & Channels` | `Receipts & Collectors` | `pagination` |

## Visual QA Evidence Axes

Every future visual QA pass should record these axes:

1. Figma mirror status.
2. DOM contract status.
3. Browser desktop viewport status.
4. Browser tablet viewport status.
5. Mobile standard status, currently `pending-dedicated-standard`.
6. Pagination containment status.
7. Style-token regression status.
8. Safe-data boundary status.

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
5. Run Browser or Chrome viewport checks against `#/fixture-preview` for
   desktop/tablet. Do not promote mobile from historical overflow check to
   accepted standard without a dedicated Figma mobile frame.
6. Record the exact validation commands before marking the visual task done.

## Hard Stops

- No raw subscription URLs, tokens, credentials, runtime config, env values,
  logs, SQLite rows, or customer-private data in Figma, docs, tests, or QA
  screenshots.
- No production Admin exposure.
- No production/runtime mutation from mirror or visual QA work.
- No detailed owner-page ledgers duplicated back into Overview.
