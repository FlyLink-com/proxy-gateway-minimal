# Admin Console Overview Figma Spec

Last updated: 2026-06-21, Asia/Shanghai.

> Status:
> - Source of truth: current React Admin implementation.
> - Figma handoff file:
>   <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn>
> - Current implementation capture set:
>   <https://www.figma.com/design/oZuKNtGPhP6oOQ0MSzpfvn?node-id=17-2>
> - Overview annotation node: `18:2`
> - Active capture set annotation node: `24:2`
> - Captured active implementation nodes: `17:2`, `22:2`, `23:2`
> - Risk: C for this spec; follow-up Admin UI code changes are B
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions

This document is now a reverse handoff record: the current React Admin
OS/pluginized frontend is the design source for Figma. Older Figma frames in
the same file remain useful semantic references, but they are no longer the
visual authority for the active implementation.

## Current Figma Source

| Item | Value |
| --- | --- |
| File | `GlobalCircle AI Admin UI Handoff` |
| File key | `oZuKNtGPhP6oOQ0MSzpfvn` |
| Operations implementation frame | `06 Current Implementation / Operations Overview / 1600w full-content capture` |
| Operations implementation node | `17:2` |
| Accounts implementation frame | `07 Current Implementation / Accounts & Resources / 1600w full-content capture` |
| Accounts implementation node | `22:2` |
| Usage implementation frame | `08 Current Implementation / Usage & Channels / 1600w full-content capture` |
| Usage implementation node | `23:2` |
| Active capture annotation | `24:2` |
| Captured size | `1600px` browser width, full rendered content height |
| Capture basis | Local React Admin fixture preview, 1600px browser width |
| Capture date | 2026-06-21 |
| Data posture | Safe synthetic fixture data only |

The imported frames intentionally preserve the full rendered page height. The
previous 1600x1024 concept frames assumed first-viewport fit, but the current
implementation renders taller OS workspace pages with module panels and fixture
preview content. Treat those height differences as implementation evidence, not
as Figma import bugs.

The current active Admin pages are:

| Page | Code route | Figma implementation node | Status |
| --- | --- | --- | --- |
| `Operations Overview` | `dashboard` | `17:2` | Active |
| `Accounts & Resources` | `portalRequests` | `22:2` | Active |
| `Usage & Channels` | `usageMonitor` | `23:2` | Active |

The current planned/gated shell entries are not active page captures in this
handoff:

| Planned/gated entry | Current status |
| --- | --- |
| `Platform Development` | Planned/gated in the sidebar. |
| `System Settings` | Planned/gated in the sidebar. |
| `About` | Planned/gated in the sidebar. |
| Durable cases, logs, audit history | Future privileged/audit surfaces only. |

## Legacy Frames

These frames remain in the Figma file for comparison and semantic constraints:

| Node | Frame | Current role |
| --- | --- | --- |
| `2:2` | `00 Contract & Build Order` | Historical planning and build-order reference. |
| `2:81` | `01 Operations Overview / 1600x1024` | Legacy flat concept reference. Not current visual authority. |
| `2:189` | `02 Accounts & Resources / 1600x1024` | Legacy owner-page concept reference. |
| `2:*` | `03 Usage & Channels / 1600x1024` | Legacy owner-page concept reference. |
| `2:427` | `04 State & Safety Matrix` | Still valid for state/security constraints. |
| `14:2` | `05 GCC-103 Review Addendum / 1600x1024` | Review notes predating the reverse handoff. |
| `17:2` | `06 Current Implementation / Operations Overview / 1600w full-content capture` | Active visual baseline. |
| `22:2` | `07 Current Implementation / Accounts & Resources / 1600w full-content capture` | Active visual baseline. |
| `23:2` | `08 Current Implementation / Usage & Channels / 1600w full-content capture` | Active visual baseline. |
| `24:2` | `Annotation / Active implementation page capture set` | Active capture set explanation. |

Do not use the older flat `01/02/03 ... / 1600x1024` frames as pixel-parity
targets unless the product direction explicitly changes back away from the
Admin OS/pluginized shell.

## Implementation Visual Contract

The active Admin shell is an operator workspace, not a flat dashboard page. The
active pages share this shell:

1. Workspace sidebar.
2. Top bar with page context, search, risk posture chips, and operator control.
3. Fixture preview banner when safe preview mode is enabled.
4. Page header with `Overview / Operations Overview` and the page title.
5. Module board with `Health Summary`, `Risk Queue`, and `Next Actions`.
6. Panel-level controls: field count, preview chip, and hide-module control.
7. Navigation library and planned workspace routes.

The visible UI intentionally contains OS/workspace behaviors that were not in
the legacy flat Figma concept:

| Current behavior | Design implication |
| --- | --- |
| `Fixture preview` banner | Figma must preserve the safe-preview state for fixture captures. |
| Module panel headers | Panels are plugin/workbench units, not plain content sections. |
| Field-count badges | Design must account for panel metadata density. |
| Hide-module controls | Module chrome is part of the UI contract. |
| Navigation library | Sidebar design must include the library entry and count badge. |
| `About` planned route | Current React navigation includes this planned route. |
| Full content height > 1024 | Desktop QA should distinguish first-viewport fit from full-page workspace height. |

## Current Page Ownership

Overview owns only cross-page summary and routing. Detailed ledgers remain on
owner pages.

| Overview module | Current role |
| --- | --- |
| `Health Summary` | Platform health, risk count, freshness, and channel coverage summary. |
| `Risk Queue` | Computed safe review candidates and severity routing. |
| `Next Actions` | Route operators to the page that owns the detailed work. |

Owner-page captures now exist for the two active detailed areas:

| Owner page | Figma node | Ownership |
| --- | --- | --- |
| `Accounts & Resources` | `22:2` | Accounts, orders, resources, quota, lifecycle, and safe history/events. |
| `Usage & Channels` | `23:2` | Usage ledger, freshness, channel coverage, receipts, collectors, and anomalies. |

The following detailed areas must not be duplicated as Overview-owned ledgers:

| Detailed area | Owning page |
| --- | --- |
| Accounts, orders, resources, quota, lifecycle | `Accounts & Resources` |
| Usage ledger, freshness, channel coverage, receipts, collectors | `Usage & Channels` |
| Durable cases, logs, audit history | Future privileged/audit surfaces only |

## Figma Update Rule

For this phase, the direction is:

```text
React Admin implementation -> Figma handoff -> QA / future design iteration
```

Do not force the current frontend to match the older flat Figma frame. If the
frontend changes, refresh or replace the current implementation capture in the
Figma file and update this document with the new node ID.

## Capture Procedure

Use this local-only process when refreshing the implementation frame:

1. Start the Admin dev server with safe fixture preview enabled:

   ```bash
   VITE_ADMIN_FIXTURE_PREVIEW=1 npm run admin:dev
   ```

2. Temporarily load the Figma capture script in `admin/index.html`.
3. For non-default Admin pages, use a temporary local-only query or equivalent
   safe route hook so the target page is selected before capture. Remove that
   hook before committing.
4. Open the local Admin page at a 1600px-wide browser viewport using the capture
   URL generated by the Figma MCP `generate_figma_design` tool.
5. Confirm the page heading and active nav match the intended target before
   polling the capture.
6. Poll the capture until Figma reports completion.
7. Rename the imported frame to the next implementation handoff label.
8. Remove the temporary capture script from `admin/index.html`.
9. Verify the repo is back to a normal state and run `git diff --check` for any
   documentation changes.

Never leave the capture script committed to the project.
The HTML-to-design import may expose closed `<details>` children structurally;
visible-state QA should still verify browser screenshots in addition to the
Figma capture nodes.

## Security Contract

The Figma implementation capture and this document must not include:

- raw subscription URLs;
- tokens or credentials;
- private keys;
- runtime config;
- raw logs;
- raw environment values;
- SQLite rows;
- customer-private data.

Safe synthetic fixture labels, redacted refs, and aggregate states are allowed.

## Acceptance

- The Figma file contains clearly named current implementation captures for all
  active Admin pages.
- The current implementation captures are marked as the active visual baseline.
- Legacy flat Figma frames are clearly treated as concept references, not the
  implementation parity target.
- The repo does not retain the temporary capture script.
- Future Admin UI visual QA compares the current frontend against nodes `17:2`,
  `22:2`, and `23:2` or their successors, not the stale requirements-map file.
