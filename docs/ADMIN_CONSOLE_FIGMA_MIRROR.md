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
| Component-system mirror | Required. The Figma file does not yet expose local components, variables, text styles, or paint styles for the Admin grammar. |
| Observed local components | `0` |
| Observed local variable collections | `0` |
| Observed local text styles | `0` |
| Observed local paint styles | `0` |
| Next task line | `Admin Figma Component Mirror v1` |

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

## Component Mirror Gap

The current Figma source is a page-level handoff, not yet a full component
library. The next visual-design task is to mirror the existing code grammar and
tokens into Figma components and variants instead of reopening page-level
direction.

Required component mirrors:

- `PanelFrame`
- `MetricCard`
- `StatusChip`
- `DataTable / DataRow`
- `TopBar`
- `Sidebar / Navigation Library`
- `PrivilegedGate`
- `EmptyState / Loading / Stale / Error`

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
