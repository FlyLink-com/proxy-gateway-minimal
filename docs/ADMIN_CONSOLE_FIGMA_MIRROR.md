# Admin Console Figma Mirror

Last updated: 2026-06-21, America/Los_Angeles.

> Status:
> - Source Figma file:
>   <https://www.figma.com/design/EvQXTtJ2XnRfcGxRLTRt0B>
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

Figma metadata read succeeded on 2026-06-21 for file
`EvQXTtJ2XnRfcGxRLTRt0B`.

Observed current canvas:

| Item | Current value |
| --- | --- |
| Top-level page | `00 Requirements Map` |
| Main frame | `GlobalCircle AI Admin Console / Requirements Map` |
| Main frame size | `1440 x 1200` |
| React-visible implementation baseline | Three active Admin pages: `Operations Overview`, `Accounts & Resources`, `Usage & Channels` |

Observed mirror quality issue:

| Node / section | Problem |
| --- | --- |
| `Section / Design To Implementation Workflow` | Row frame height is smaller than child cards, causing clipping risk. |
| `Page cards row 1` | Row frame height is smaller than child cards, causing clipping risk. |
| `Page cards row 2` | Row frame height is smaller than child cards, causing clipping risk. |

Write attempt:

| Field | Result |
| --- | --- |
| Date | 2026-06-21 |
| Attempted operation | Resize clipped rows and create mirror pages. |
| Connector account seat | `Dev / developer`. |
| Connector result | `get_metadata` can read the file, but `use_figma` read-only execution is blocked with `User does not have view permission on file`. |
| Required action | Verify the connected account has a Full Figma Design seat, or reconnect Figma with a Full-seat account, then rerun the mirror write step. |

Do not infer from this blocker that the React Admin UI is unavailable. The
blocker is scoped to Figma write access.

## Required Mirror Pages

The canonical local contract is `ADMIN_FIGMA_MIRROR_PAGES` in
`admin/src/design/figma-mirror.ts`.

| Page | Role | Maps to React page |
| --- | --- | --- |
| `00 Requirements Map` | Requirements map | All three active pages |
| `01 Design Tokens / Components` | Token and primitive mirror | Shared Admin shell, workspace, panel, and primitive contracts |
| `02 Operations Overview / 1600x1024` | Page mirror | `dashboard` / `Operations Overview` |
| `03 Accounts & Resources / 1600x1024` | Page mirror | `portalRequests` / `Accounts & Resources` |
| `04 Usage & Channels / 1600x1024` | Page mirror | `usageMonitor` / `Usage & Channels` |
| `05 Visual QA / Ledger` | QA evidence page | Figma, DOM, Browser, style-token, and safe-data evidence |

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
3. Regenerate or update the Figma file only with an account that has edit
   access.
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
