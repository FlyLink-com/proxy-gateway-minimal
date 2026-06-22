# Admin Console Design Completion Checklist

Last updated: 2026-06-22, America/Los_Angeles.

> Status:
> - Type: Figma/page/visual/component-state design completion gate
> - Risk: C for this document. Follow-up UI implementation work is B unless it
>   touches auth, schema/migration, runtime, production gates, deploy, or
>   sensitive data.
> - Production impact: None
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This checklist is the current gate before starting the next Admin frontend
implementation lane. The frontend design direction is accepted, but the design
is not complete until the Figma pages, visual rhythm, component states, and
Figma-to-code QA checks below are closed.

Use this document after `docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md` and before
`docs/ADMIN_CONSOLE_NEXT_STAGE_EXECUTION_CHECKLIST.md`.

## Current Decision

| Area | Decision |
| --- | --- |
| Design direction | Accepted. Continue with the protected Admin Console model, not the browser-OS experiment. |
| Active pages | `Operations Overview`, `Accounts & Resources`, `Usage & Channels`. |
| Figma source | Canonical file is `GlobalCircle AI Admin UI Handoff - 2026-06-19`; refined frames are `99:2`, `104:2`, and `104:226`. |
| Current phase | Design completion and visual QA, not backend integration or runtime projection. |
| Deferred work | `Usage & Channels` runtime projection, backend DTOs, auth/schema/runtime work, and privileged surfaces. |

## GCC-122 Figma Audit, 2026-06-22

This audit used the canonical Figma file `oZuKNtGPhP6oOQ0MSzpfvn` and a
read-only `use_figma` inventory of page `0:1`. Figma write capability exists,
but this pass only inspected page coverage and local screenshot evidence.

| Area | Figma evidence | Status | Required follow-up |
| --- | --- | --- | --- |
| Top-level page map | `0:1 Admin UI Handoff` contains `14` top-level frames. | Verified. | Keep this file as the only active mirror source. |
| Original active page mirrors | `2:81` Operations, `2:189` Accounts, `2:309` Usage. | Present and ownership-correct. | Migrate Accounts and Usage to the refined visual protocol. |
| Current implementation captures | `17:2`, `22:2`, `23:2`. | Present. | Use as implementation baseline evidence, not as final design polish. |
| Refined visual drafts | `99:2` Operations, `104:2` Accounts, `104:226` Usage. | Initial desktop drafts present. | Complete component-state placement, narrow QA, and user review. |
| State and safety matrix | `2:427` `04 State & Safety Matrix`. | Present. | Still needs page-level state placement and responsive visual QA. |

GCC-122 cleanup pass after first review:

- Removed visible design-only wording such as `preview` from the three refined
  desktop drafts.
- Replaced raw-log-oriented operator copy with diagnostics-locked wording.
- Corrected `Accounts & Resources` so `Account Directory` contains account refs
  only, not order/history placeholder rows.
- Renamed stale cloned Figma layer names in `104:2` and `104:226`; follow-up
  scan found `0` stale `Risk Queue` / `Next Actions` / old metric layer names
  in the two cloned refined frames.
- Current local screenshot evidence:
  - `tmp/figma-gcc122-refined-operations-99-2-cleaned.png`
  - `tmp/figma-gcc122-refined-accounts-104-2-cleaned.png`
  - `tmp/figma-gcc122-refined-usage-104-226-cleaned.png`

GCC-122 design-evidence pass:

- Added `12 GCC-122 Component State Placement / 1600x1024` (`115:2`) to map
  required shared-primitive states to active page placement.
- Added `13 GCC-122 Responsive QA Strategy / 1600x1024` (`116:2`) to document
  the `1024px` and `768px` collapse strategy before React/CSS implementation.
- Added `14 GCC-122 Figma-to-code Mapping / 1600x1024` (`117:2`) to align
  Figma component names, React targets, CSS/token responsibilities, and next
  gates.
- Saved local screenshot evidence:
  - `tmp/figma-gcc122-component-state-placement-115-2.png`
  - `tmp/figma-gcc122-responsive-qa-116-2.png`
  - `tmp/figma-gcc122-figma-to-code-mapping-117-2.png`
- These frames are review/handoff artifacts, not operator-facing Admin UI
  pages.

Audit conclusion:

- `Operations Overview` has an accepted refined visual direction in `99:2`.
- `Accounts & Resources` and `Usage & Channels` now have first refined desktop
  drafts in `104:2` and `104:226`, cloned from the accepted `99:2` protocol and
  rewritten to their page ownership.
- Component-state placement, responsive strategy, and Figma-to-code mapping now
  have explicit evidence frames. The design is not complete until these frames
  pass user review and are validated against browser implementation evidence.
- This gate does not authorize backend integration, runtime projection,
  production work, auth/schema changes, or sensitive-data exposure.

## Completion Gates

| Gate | Required result | Evidence |
| --- | --- | --- |
| G1 Figma page completeness | Each active page has a final review frame with header, primary modules, empty/locked states, and footer or handoff area where needed. | Figma frame links and `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`. |
| G2 Page ownership | Each module appears on its owner page only; Overview routes to details instead of duplicating ledgers. | `docs/ADMIN_CONSOLE_NAVIGATION_IA.md` and `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md`. |
| G3 Visual hierarchy | Text rhythm, spacing, density, surface treatment, icon sizing, color semantics, and page rhythm are consistent. | `docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md` and `docs/ADMIN_CONSOLE_VISUAL_PROTOCOL.md`. |
| G4 Component states | Shared primitives include required visual states and do not require page-local visual hacks. | `docs/ADMIN_CONSOLE_COMPONENT_FUNCTION_BLUEPRINT.md` and Figma component set review. |
| G5 Figma-to-code parity | Component names, React targets, CSS tokens, grammar hooks, and visual QA expectations match. | `docs/ADMIN_CONSOLE_FIGMA_MIRROR.md`, `admin/src/design/figma-parity.ts`. |
| G6 Accessibility baseline | Visible focus, accessible names, semantic state labels, and non-color-only status are designed before implementation. | Visual QA notes and follow-up tests. |
| G7 Sensitive-data boundary | Figma, fixtures, screenshots, tests, and docs contain no token, credential, subscription URL, raw config/log/env, SQLite row, or customer-private data. | Review notes and diff checks. |

The design is not complete if any gate still has unresolved page ownership,
copy, spacing, state, or accessibility questions.

## Page-Level Completion

### Operations Overview

Must show:

- protected console shell context;
- health, risk, freshness, and coverage metrics;
- risk queue with route ownership;
- next actions that route to owner pages;
- no account/resource/usage ledgers as owned detail;
- concise English operator copy only.

Design gaps to close:

- confirm metric-card density at desktop and narrow widths;
- confirm queue row overflow behavior for long safe refs;
- confirm action chips do not read like mutation buttons;
- confirm planned Audit route is visibly locked.

### Accounts & Resources

Must show:

- account directory;
- resources and orders;
- quota and usage summary;
- lifecycle review;
- history and events preview;
- no collector/runtime/channel diagnostics as owned detail.

Design gaps to close:

- confirm account/order/resource safe-ref display rules;
- confirm quota cards do not imply mutation authority;
- confirm lifecycle and history remain review surfaces, not execution controls;
- confirm empty, locked, and readonly states.

### Usage & Channels

Must show:

- collection freshness;
- channel coverage;
- usage ledger;
- receipts and collectors;
- collection anomalies;
- no account disable, quota mutation, or lifecycle ownership.

Design gaps to close:

- confirm freshness and coverage are readable without overusing status colors;
- confirm ledger rows keep safe refs compact;
- confirm anomaly states cover stale, zero usage, missing channel, overage, and unknown data;
- confirm collectors expose diagnostics only, not raw logs or credentials.

## Component-State Matrix

| Component | Required states before implementation |
| --- | --- |
| `TopBar` | normal, focused search, collapsed search, environment readonly, alert count, operator menu. |
| `SidebarNavigation` | active, inactive, planned, locked, collapsed, focus, narrow. |
| `PageFrame` | normal, readonly, loading, empty, gated, narrow. |
| `MetricCard` | normal, healthy, warning, danger, unknown, loading, compact, trend available, trend absent. |
| `StatusChip` | neutral, success, warning, danger, info, planned, readonly, locked. |
| `PanelFrame` | normal, dense, empty, loading, stale, error, locked, overflow. |
| `DataTable` / `DataRow` | normal, hover, focus, selected, empty, loading, stale, error, long safe-ref overflow. |
| `StateFeedback` | empty, loading, stale, error, readonly, gated, no source. |
| `PrivilegedGate` | planned, locked, disabled, absent, requires review, unavailable. |

Do not advance to data projection or backend wiring until the relevant states
for the target page exist in Figma and are mapped to shared primitives.

## Visual QA Checklist

Before design completion is accepted:

1. Desktop review at `1600 x 1024` shows no overlap, clipped text, floating
   cards, nested-card clutter, or excessive empty space.
2. Narrow review at `1024px` keeps navigation, page title, primary cards, and
   tables readable.
3. Compact review at `768px` has a deliberate stacking strategy, not accidental
   wrapping.
4. Search focus style matches the system focus style and does not create a
   stray browser-default outline.
5. Component settings/actions are integrated into component headers or menus;
   no duplicate editor panel is visible in normal mode.
6. Status colors are semantic, not decorative.
7. Text uses integer font sizes, stable weights, and no negative letter spacing.
8. Icon buttons have visible focus and accessible names in the implementation
   plan.
9. Design-only words such as `draft`, `preview`, `page design explanation`, or
   `prototype` do not appear in operator UI.
10. No sensitive material appears in Figma, fixtures, screenshots, tests, docs,
    or UI.

## Handoff To Implementation

Only after this checklist is accepted:

1. move to `docs/ADMIN_CONSOLE_NEXT_STAGE_EXECUTION_CHECKLIST.md`;
2. keep `GCC-77`, `GCC-78`, and `GCC-79` as completed prerequisites;
3. decide whether the next implementation PR is visual polish, component-state
   completion, or `Usage & Channels` runtime projection;
4. keep backend DTO/API wiring out of scope unless a separate task explicitly
   approves it.

## Validation

For this document, docs-only validation is:

```powershell
git diff --check
```

When implementation starts, use the Admin validation matrix from
`docs/VALIDATION_BASELINE.md` and the command set in
`docs/ADMIN_CONSOLE_FRONTEND_DESIGN_INDEX.md`.
