# Admin Console Next Stage Execution Checklist

Last updated: 2026-06-24, America/Los_Angeles.

> Status:
> - Type: Admin frontend next-stage execution checklist
> - Risk: C for this document. Follow-up Admin implementation tasks are B
>   unless they touch auth, schema/migration, runtime, production gates,
>   deploy, or sensitive data.
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This checklist turns the Admin Console design review into executable frontend
task lanes after the design completion gate is accepted. It depends on
`docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md` for the active Figma source and
`docs/ADMIN_CONSOLE_DESIGN_COMPLETION_CHECKLIST.md` for the Figma/page/visual/
component-state gate. It does not replace the detailed IA, visual, component,
or app-map documents.

## Current Baseline

| Item | Current decision |
| --- | --- |
| Product posture | Protected operator console for supervision, operations, maintenance, and future platform development. |
| Active pages | `Operations Overview`, `Accounts & Resources`, `Usage & Channels`. |
| Planned slots | `Audit & Cases`, `Platform Development`, `System Settings`. |
| Visual source | Canonical Figma `/design` file, `06 AI Exploration` (`365:2`), and current Visual Polish frames `373:716`, `373:866`, `373:1016`; design-evidence frames `115:2`, `116:2`, `117:2` remain reference gates. |
| Git role | Runnable Admin implementation, source index, design contracts, implementation mapping, QA records, and validation evidence. |
| Figma Site role | Optional demo/click-flow review surface only; not a source of truth or implementation target. |
| Linear role | Task gates, review ownership, phase acceptance, and next-stage sequencing. |
| Non-goals | User Portal, subscription creation UI, public Admin, production execution console, auth/schema/runtime migration. |

The current baseline is not ready for the follow-up implementation lanes until
`docs/ADMIN_CONSOLE_DESIGN_COMPLETION_CHECKLIST.md` is accepted. After that
gate, implementation must keep page ownership strict and use shared primitives
instead of page-local visual systems.

## Precondition: Design Completion Gate

Before starting the execution order below:

1. Figma active-page frames are visually complete for `Operations Overview`,
   `Accounts & Resources`, and `Usage & Channels`.
2. Page ownership, visible copy, visual hierarchy, component states, and
   accessibility expectations are reviewed.
3. `Usage & Channels` runtime projection remains deferred unless the design
   completion gate explicitly allows the technical follow-up.
4. No backend DTO/API wiring, auth/schema/runtime work, production action, or
   sensitive material enters the frontend baseline.
5. Figma Site evidence, if present, is demo-only and must not replace canonical
   `/design` frames or GitHub validation.
6. The current Figma canvas has been reverified at node `365:2`; do not rely
   on stale `99:2`, `104:2`, or `104:226` frame IDs for new implementation
   work.

## Unified Local Task Tree, 2026-06-24

The current working tree contains several related but separate task lines. Do
not report them as one completed Admin stage, and do not merge backend or
runtime work into the frontend design completion gate.

| Line | Owns | Current role | Completion boundary |
| --- | --- | --- | --- |
| Admin design baseline | Figma visual standard, page ownership, layout density, component states, and responsive rules. | `373:716`, `373:866`, and `373:1016` are now the accepted desktop design source. | Complete for desktop page-design source; still requires implementation, browser QA, and responsive/mobile follow-up. |
| Admin React/CSS implementation | Shared primitives, shell chrome, page-owned panels, and visual parity tests. | Next active line: reverse-standardize from the accepted Visual Polish baseline; it must not invent layout rules outside the design docs. | Complete only after browser QA and Admin test/build validation pass. |
| `GCC-77` System Search | Safe top-bar search, result routing, planned/locked slots, and hidden-module recovery. | Frontend sub-lane, not AppLibrary or NavigationLibrary. | Complete only when it reads explicit safe manifest/search documents and does not index rendered UI or unsafe backend material. |
| Server/TLS/TUIC preflight | Edge/runtime preflight helpers, templates, and CLI tests. | Separate backend/runtime support line. | Review and validate separately from Admin UI; production use remains gated by the normal A-tier rules. |
| Research report inputs | External UI/system research and review notes. | Reference material only. | Promote into `docs/` only when a specific design or implementation decision depends on it. |

Local cleanup rule: ignore local tool noise such as `.claude/` and temporary
scratch output, but keep task artifacts until their owning line is reviewed.

Current design rule: the older browser-OS/AppLibrary experiment is not an
active surface. Search is a normal System Search form/result experience in the
Admin shell, and module recovery belongs to System Search or page-local
controls.

Current stage order:

1. Treat `373:716`, `373:866`, and `373:1016` as the accepted desktop visual baseline.
2. Normalize layout, density, component states, and responsive standards from those frames.
3. Reverse-standardize React/CSS from the accepted design rules.
4. Complete `GCC-77` System Search as a safe frontend sub-lane.
5. Review server/TLS/TUIC changes separately with their own validation.

## Execution Order

| Order | Lane | Risk | Primary goal | Must finish before |
| --- | --- | --- | --- | --- |
| 1 | `GCC-77` System Search safe discovery | B | Build a safe system-search result model from approved manifest fields and page ownership metadata. | Workspace restore and capability actions. |
| 2 | `GCC-78` Workspace preset and restore | B | Stabilize visible, hidden, pinned, and size behavior as predictable workspace presets. | Capability matrix and richer layout behavior. |
| 3 | `GCC-79` Capability matrix | B | Define which frontend capabilities are visible, gated, planned, disabled, or absent for the current operator context. | Any privileged Admin surface promotion. |
| 4 | Usage runtime projection v1 | B | Move `Usage & Channels` toward a view-model projection for usage, freshness, coverage, and anomalies. | Real backend DTO wiring. |

Before Lane 1 implementation, align the current UI shell with the accepted
Visual Polish geometry: ShellRail, TopBar, System Search, metric row, primary
panel row, and lower evidence row. Do not reopen the older browser-OS/
AppLibrary direction as a separate product surface in these lanes. Search and
recovery now belong to System Search, ShellRail / Primary Routes, and
page-local controls; there is no active Navigation Library or App Library
product surface.

## Lane 1: GCC-77 System Search Safe Discovery

### Goal

Create a controlled navigation/search layer that helps operators find pages,
modules, safe refs, planned areas, and recovery actions without indexing
rendered UI text or unsafe backend/raw material.

### Scope

| Area | Required outcome |
| --- | --- |
| Search source | Explicit safe manifest fields, route metadata, page ownership, and approved tags. |
| Result types | Page, module, planned slot, recovery action, safe diagnostic route, documentation hint. |
| Result fields | `id`, `label`, `type`, `ownerPage`, `route`, `status`, `tags`, `description`, `safetyLevel`. |
| Empty state | Clear no-result message with safe fallback to active pages. |
| Locked/planned state | Planned areas remain visible only as gated/locked results. |
| Redaction | No token, credential, subscription URL, raw config/log/env, SQLite row, or customer-private data. |

### Acceptance

1. Search never reads or indexes secrets, raw logs, raw config, raw env,
   SQLite rows, subscription URLs, credentials, or customer-private data.
2. Search results route to active pages or planned locked slots only.
3. `Operations Overview`, `Accounts & Resources`, and `Usage & Channels`
   remain the active page anchors.
4. Planned slots are discoverable but not executable.
5. Keyboard focus is visible, named, and testable.
6. Tests cover result filtering, planned-slot handling, empty state, and
   redaction boundaries.

## Lane 2: GCC-78 Workspace Preset And Restore

### Goal

Replace experimental drag/resize behavior with stable workspace layout presets
and recovery controls that fit a browser-based control console.

### Scope

| Area | Required outcome |
| --- | --- |
| Layout state | `visible`, `hidden`, `pinned`, `compact`, `standard`, `expanded`. |
| Restore model | Hidden modules can be recovered from System Search or page-local controls. |
| Size model | Use named sizes first; defer freeform resize unless the layout engine can enforce constraints. |
| Persistence | Local UI preference only until a separate storage design is approved. |
| Safety | Layout state stores ids and preferences only, never runtime data or sensitive material. |

### Acceptance

1. Hiding or compacting a module does not leave broken whitespace.
2. Restored modules return to the correct owner page.
3. Size changes use named presets with stable responsive constraints.
4. Workspace state cannot store secrets, raw API responses, logs, config, env,
   SQLite rows, subscription URLs, or customer-private data.
5. Desktop and narrow viewport screenshots show no overlap or clipped controls.
6. Tests cover visible/hidden/restore and size-preset behavior.

## Lane 3: GCC-79 Capability Matrix

### Goal

Define a frontend capability matrix for what the current operator can see,
inspect, route to, or recognize as planned, without promoting privileged backend
actions.

### Scope

| Capability state | Meaning |
| --- | --- |
| `visible` | Safe current UI feature is available. |
| `readonly` | Safe inspection only, no mutation. |
| `planned` | Product direction exists, but no active route/action. |
| `locked` | Visible gated slot; not executable in current context. |
| `disabled` | UI control exists but is unavailable due to known safe state. |
| `absent` | Do not register or render for this operator context. |

### Acceptance

1. Matrix covers active pages, planned slots, System Search results, and
   future privileged surfaces.
2. Key/Audit/Log or super-admin-only areas stay absent or locked unless a
   separate auth/backend contract task promotes them.
3. Capability state controls visibility and copy, but does not imply backend
   authority.
4. Tests cover visible, readonly, planned, locked, disabled, and absent states.
5. No schema, migration, production permission, or auth model change is part of
   this lane.

## Follow-Up: Usage & Channels Runtime Projection V1

### Goal

Prepare `Usage & Channels` for real data by introducing a stable frontend
projection model before live backend DTO wiring.

### Scope

| Projection area | Required outcome |
| --- | --- |
| Freshness | Generated time, observed age, stale/unknown threshold state. |
| Coverage | Issued, measured, missing, delayed, and blocked channels. |
| Usage ledger | Safe account/order/channel refs, uploaded/downloaded/total usage, collected time. |
| Exceptions | Delay, zero usage, collection gap, missing receipt, overage. |
| Diagnostics | Collector and receipt summaries only; no raw logs or credentials. |

### Acceptance

1. Static page arrays move behind a named view-model/projection boundary.
2. Projection tests cover normal, stale, unknown, overage, missing channel,
   zero usage, and collector failure states.
3. UI still uses safe fixture refs until backend DTOs are approved.
4. No token, credential, subscription URL, raw config/log/env, SQLite row, or
   customer-private data appears in fixtures, tests, screenshots, or UI.
5. Backend wiring remains a separate task.

## Current-Stage Hard Stops

Move these out of the current frontend baseline stage:

- backend API contract changes;
- receipt or data-plane fix work;
- super-admin fixture surfaces;
- auth model changes;
- schema or migration work;
- production permissions;
- live backend DTO wiring;
- app YAML upload runtime;
- public Admin exposure;
- secrets, tokens, credentials, subscription URLs, raw config/log/env, raw logs,
  SQLite rows, or customer-private data in UI, tests, fixtures, screenshots, or
  docs.

## Review Checklist For The User

Before opening the next implementation PR, review these points:

1. `Operations Overview` still routes to owner pages and does not own detail
   ledgers.
2. `Accounts & Resources` owns account, order, quota, lifecycle, and history
   review.
3. `Usage & Channels` owns freshness, coverage, usage ledger, collectors, and
   collection anomalies.
4. System Search is a safe search/recovery layer, not a new OS runtime.
5. Workspace behavior is preset-based and constraint-based, not freeform
   windowing.
6. Capability matrix only affects frontend visibility/copy until backend
   authority is separately approved.
7. Visual changes still follow Figma and
   `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md`.
8. Accessibility checks include visible focus and named controls.
9. Sensitive material never enters visible UI, fixtures, tests, screenshots, or
   docs.

## Validation

For this document, docs-only validation is:

```powershell
git diff --check
```

For any follow-up Admin implementation PR, expected validation is:

```powershell
npm run admin:test
npm run admin:build
npm test
git diff --check
```

Add `npm run project-state:check` when `project-state/*.json` changes.
