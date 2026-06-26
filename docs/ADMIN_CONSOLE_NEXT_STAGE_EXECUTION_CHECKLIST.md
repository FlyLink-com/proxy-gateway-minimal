# Admin Console Next Stage Execution Checklist

Last updated: 2026-06-25, America/Los_Angeles.

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
| Visual source | Canonical Figma `/design` file `NefQiIMOPIBU28TIYcwQFE`, `GlobalCircle AI Admin UI Baseline - 2026-06-25`; active route baseline cards are `24:5`, `24:35`, and `24:65`. The older handoff file `oZuKNtGPhP6oOQ0MSzpfvn` is archive/lineage only. |
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
6. The clean baseline project `NefQiIMOPIBU28TIYcwQFE` has populated Index,
   Design Rules, Component Contract, Product Baseline, Figma-to-React Mapping,
   Evidence Gates, and Archive pages. Use it as the current implementation
   source boundary; do not rely on stale `373:*`, `99:2`, `104:2`, or
   `104:226` frame IDs for new implementation work unless the rule is copied
   into the clean baseline and re-accepted there.

## Unified Local Task Tree, 2026-06-24

The current working tree contains several related but separate task lines. Do
not report them as one completed Admin stage, and do not merge backend or
runtime work into the frontend design completion gate.

| Line | Owns | Current role | Completion boundary |
| --- | --- | --- | --- |
| Admin design baseline | Figma visual standard, page ownership, layout density, component states, and responsive rules. | Verified source is now the clean baseline project `NefQiIMOPIBU28TIYcwQFE` with route baseline cards `24:5`, `24:35`, and `24:65`. | Complete for source-boundary setup; still requires implementation, browser QA, and responsive/mobile follow-up. |
| Admin React/CSS implementation | Shared primitives, shell chrome, page-owned panels, and visual parity tests. | Next active line: reverse-standardize from the accepted clean baseline; it must not invent layout rules outside the design docs. | Complete only after browser QA and Admin test/build validation pass. |
| `GCC-77` System Search | Safe top-bar search, result routing, and planned/locked slots. | Frontend sub-lane, not AppLibrary, NavigationLibrary, module recovery, or OS windowing. | Complete only when it reads explicit safe manifest/search documents and does not index rendered UI or unsafe backend material. |
| Server/TLS/TUIC preflight | Edge/runtime preflight helpers, templates, and CLI tests. | Separate backend/runtime support line. | Review and validate separately from Admin UI; production use remains gated by the normal A-tier rules. |
| Research report inputs | External UI/system research and review notes. | Reference material only. | Promote into `docs/` only when a specific design or implementation decision depends on it. |

Local cleanup rule: ignore local tool noise such as `.claude/` and temporary
scratch output, but keep task artifacts until their owning line is reviewed.

Current design rule: the older browser-OS/AppLibrary experiment is not an
active surface. Search is a normal System Search form/result experience in the
Admin shell. Module recovery, hidden-module restore, dock/appbar, and
freeform windowing are not active product surfaces in this baseline.

Current stage order:

1. Treat `NefQiIMOPIBU28TIYcwQFE` as the verified Admin UI design source.
2. Treat `24:5`, `24:35`, and `24:65` as the active route baseline cards.
3. Normalize layout, density, component states, and responsive standards from
   the clean baseline project only.
4. Reverse-standardize React/CSS from the accepted clean-baseline design rules.
5. Complete `GCC-77` System Search as a safe frontend sub-lane.
6. Review server/TLS/TUIC changes separately with their own validation.

## Execution Order

| Order | Lane | Risk | Primary goal | Must finish before |
| --- | --- | --- | --- | --- |
| 1 | `GCC-77` System Search safe discovery | B | Build a safe system-search result model from approved manifest fields and page ownership metadata. | Capability matrix and richer route discovery. |
| 2 | `GCC-79` Capability matrix | B | Define which frontend capabilities are visible, gated, planned, disabled, or absent for the current operator context. | Any privileged Admin surface promotion. |
| 3 | Usage runtime projection v1 | B | Move `Usage & Channels` toward a view-model projection for usage, freshness, coverage, and anomalies. | Real backend DTO wiring. |
| Deferred | `GCC-78` Workspace preset and restore | B | Retired/deferred under the current baseline; no hidden/restore/preset/windowing UI is active. | Requires a new approved design gate before reactivation. |

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

Retired for the current baseline. The previous goal to replace experimental
drag/resize behavior with workspace presets is no longer part of the active
Admin UI lane. Current pages use page-owned sections, ShellRail route state,
System Search routing, pagination, and responsive page splits.

### Scope

| Area | Required outcome |
| --- | --- |
| Layout state | No active per-module visibility, hidden, pinned, compact, standard, expanded, or freeform-size state. |
| Restore model | No hidden-module recovery from System Search, page-local controls, AppLibrary, NavigationLibrary, dock, or appbar. |
| Size model | Use fixed page-owned sections, responsive breakpoints, pagination, route split, or bounded internal scroll only. |
| Persistence | No local layout preference persistence in the current baseline. |
| Safety | If a later design reintroduces layout preferences, it must remain ids/preferences only and pass a separate gate. |

### Acceptance

1. No visible hide, restore, edit-layout, drag, resize, dock, appbar, or
   NavigationLibrary affordance appears in the Admin UI.
2. System Search routes only to approved pages, sections, and planned slots.
3. Page overflow is handled by pagination, route split, or bounded internal
   scroll, not by per-card window controls.
4. No layout state stores secrets, raw API responses, logs, config, env,
   SQLite rows, subscription URLs, or customer-private data.
5. Desktop and narrow viewport screenshots show no overlap or clipped controls.
6. Tests cover absence of hide/restore/resize controls and safe System Search
   result filtering.

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
4. System Search is a safe route/search layer, not recovery, AppLibrary,
   NavigationLibrary, or a new OS runtime.
5. Workspace behavior is page-owned, responsive, and paginated/split as needed;
   it is not preset-based freeform windowing.
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
