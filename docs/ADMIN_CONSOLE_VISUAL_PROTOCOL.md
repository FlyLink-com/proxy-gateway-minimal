# Admin Console Visual Protocol

Last updated: 2026-06-24, America/Los_Angeles.

> Status:
> - Linear: GCC-82 under GCC-81 / GCC-42
> - Type: Phase 4 Gate 0 visual protocol and coordinate system
> - Risk: C for this protocol; follow-up Admin UI implementation is B unless it
>   touches auth, schema, runtime, production gates, or deploys.
> - Production impact: None.
> - Execution authority: Does not authorize production, AWS, Vultr, DNS,
>   Nginx, systemd, DB, runtime, auth model, schema/migration, token,
>   credential, subscription URL, raw config/log/env, SQLite row, or
>   customer-data actions.

This document freezes the shared visual protocol for the Admin Console. It is
the Gate 0 source of truth for spacing, surface hierarchy, typography, icon
treatment, responsive behavior, and approved surface effects.

For page-specific layout, module priority, visual-effect acceptance, and
Browser/Chrome evidence requirements, use
`docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md`. That matrix keeps the current
implementation target aligned with the structured Admin workbench and must not
be used to revive older App Library / browser-OS experiments as the primary
page model.

Current implementation target:

- `docs/ADMIN_CONSOLE_UI_CONTENT_MATRIX.md` decides visible page content.
- `docs/ADMIN_CONSOLE_UI_LAYOUT_EFFECT_MATRIX.md` decides page layout, panel
  priority, visual QA gates, and whether a concept is current or legacy.
- This protocol supplies reusable tokens and visual rules only. Older
  App Library, dock, plugin canvas, drag/resize/minimize, and browser-desktop
  language is superseded exploration unless the layout/effect matrix
  explicitly reactivates it for a future phase. The current phase uses System
  Search, Sidebar / Primary Routes, page-owned modules, and bounded
  subpages/pagination.

Use this before implementing token or primitive changes:

- `GCC-74` app map and control-plane application list;
- `GCC-75` App Manifest and app authoring standard;
- `GCC-76` plugin container template;
- `GCC-77` System Search route indexing and safe discovery;
- `GCC-78` workspace preset/restore model;
- `GCC-79` permission capability matrix.

No downstream task should invent new radius, shadow, typography, icon size,
System Search density, route-card density, or module geometry without updating
this protocol and its style contract tests.

## Design Goal

The current Admin surface is a structured operator workbench:

```text
protected shell
  -> compact page context
  -> page-owned summary
  -> one-level operational panels
  -> drawer/popover/detail surfaces only when needed
```

The visual system should feel modern, technical, and calm. The current accepted
desktop direction is a dark glass operator shell with restrained light data
surfaces. It should not feel like a scroll-modal prototype, a nested-card
dashboard, a template collage, or an unfinished browser-OS experiment.

## Current Accepted Desktop Baseline

The current desktop source is `06 AI Exploration` in the canonical Figma file:

| Page | Node | Role |
| --- | --- | --- |
| `Operations Overview` | `373:716` | Current Visual Polish source. |
| `Accounts & Resources` | `373:866` | Current Visual Polish source. |
| `Usage & Channels` | `373:1016` | Current Visual Polish source. |

These frames supersede the older `99:2`, `104:2`, and `104:226` layout drafts
for implementation. The old frames remain useful as history only.

Current geometry contract:

| Element | Contract |
| --- | --- |
| Visible polished frame | `1600 x 908` inside the named `1600x1024` design stage. |
| ShellRail | `x=0`, `y=0`, `224 x 1024`; dark translucent glass. |
| Content start | `x=252`; keeps a `28px` gutter after ShellRail. |
| TopBar | `x=252`, `y=24`, `1296 x 58`; glass chrome with `16px` radius. |
| System Search | `340 x 40`, centered in TopBar; normal search form/result surface. |
| Metric cards | Four `300 x 150` cards at `x=276/592/908/1224`, `y=102`. |
| Primary panels | Three `416 x 260` panels at `x=252/692/1132`; Operations/Accounts `y=300`, Usage `y=288`. |
| Lower evidence | Chart/event-log panels begin near `y=596`, `628 x 280`. |

Hidden Figma nodes for page title/subtitle, System Search badges,
StateFeedback, PrivilegedGate, and page-local split boundary are design
evidence only. They should not appear in normal operator UI unless a future
state or review mode explicitly activates them.

## Baseline Scope And Reuse Boundary

The three Visual Polish pages are the accepted desktop page baseline, not a
completed universal component library. Treat them as follows:

| Layer | Reuse rule |
| --- | --- |
| Page structure | Page-specific. `Operations Overview`, `Accounts & Resources`, and `Usage & Channels` may use different panel composition because each page owns different work. Do not promote a page-specific panel group into a generic component without a separate component review. |
| Visual shell | Reusable. ShellRail, TopBar, System Search density, glass treatment, content gutter, and protected-console context form the shared shell protocol. |
| Surface style | Reusable. White/light panels, 8px radius, 1px token borders, low shadow, restrained accent bars, compact icon slots, and bounded text rhythm are reusable style rules. |
| Component behavior | Reusable only after explicit primitive mapping. Metric card, status chip, panel frame, table row, state feedback, and privileged gate behavior must map to shared primitives before reuse. |
| Business content | Page-owned. Risk queues, account directories, lifecycle panels, usage ledgers, channel coverage, and collector evidence stay on their owner pages. |
| Trend/curve visuals | Visual slot only until a data contract exists. The current lines/sparklines show where trend evidence may live; they do not define a metric window, aggregation rule, threshold rule, or backend DTO. |

The reusable design protocol is the motion, density, card/surface language, and
state treatment extracted from the pages. The exact business card inventory in
the AI-generated pages is not itself a reusable UI system.

## Coordinate System

| Area | Protocol |
| --- | --- |
| Spacing | Use a 4px base rhythm and 8px visible control rhythm. Prefer `8`, `12`, `16`, `24`, and `32` px steps. |
| Canvas grid | Use a subtle 32px workspace grid through `--admin-canvas-grid-size`. The grid is texture only, not a visible drafting layer. |
| Canvas width | Use the accepted `1600px` design frame with content bounded by the ShellRail and TopBar coordinates above. |
| Canvas gutter | Desktop gutter is `24px`; mobile gutter is `12px`. |
| Workbench gap | Plugin/module gaps use `16px`. |
| Plugin row unit | Workspace plugin layout uses a `32px` row unit before richer drag/resize behavior. |

## Surface Hierarchy

Use one visible panel layer at a time. Do not put card surfaces inside larger
card surfaces just to create separation.

| Surface | Radius | Border | Shadow |
| --- | --- | --- | --- |
| Controls | `8px` | `--admin-border` or `--admin-border-strong` | no raised shadow by default |
| Panels/cards/plugins | `8px` | `--admin-border` / category accent where needed | low shadow only |
| Workspace chrome | `16px` for TopBar, `16px` ShellRail glass | `--admin-chrome-border` or 0.5px translucent white border | restrained dark-glass elevation |
| Floating search/popovers | `18px` | `--admin-glass-border` or `--admin-border` | `--admin-shadow-floating-2k` / popover shadow |
| Pills | `999px` | semantic or neutral border | no heavy shadow |

Allowed effects:

- dark blue glass shell gradient and low-opacity blue/teal workspace tint;
- thin hairline borders where it improves 2K clarity;
- single solid app-icon fills with restrained shadow;
- translucent TopBar/ShellRail treatment when contrast remains clear.

Motion rules:

- use short `120ms` to `180ms` transitions for hover, focus, selected, and
  menu/open states;
- animate opacity, transform, or border color only when it improves state
  recognition;
- do not animate layout size, table row height, chart data, or background
  decoration in normal operator mode;
- respect reduced-motion and keep all state changes understandable without
  animation.

Disallowed effects:

- muddy multi-layer shadows that read as dirt;
- high-saturation gradients on every icon;
- inset highlight stacks on small icons;
- glossy app-icon treatments, bokeh, radial empty-state decoration, or
  decorative blur used to simulate quality;
- `font-size: 10.5px`;
- literal `font-weight: 650`, `750`, or blanket `900`;
- decorative bokeh/orb backgrounds;
- nested floating cards inside plugin cards.

## Typography

| Use | Size/weight rule |
| --- | --- |
| Body and table copy | System/Inter stack, normal to medium weight, readable line height. |
| Utility labels | 10-12px, `600`, uppercase only for short chrome labels. |
| Route/search tile labels | 12px, `600` or `700`, centered or compact; avoid mid-word breaks. |
| Navigation labels | 12-13px, `700` to `800`, no negative letter spacing. |
| Page titles | 16px in status bar, larger inside page headers only when the page owns a real title area. |
| Metric values | Use bounded `clamp(...)`; do not break numeric values mid-word. |

Default rule: use stronger weight sparingly. Heavy labels should identify
navigation, active app state, or primary metrics, not every piece of copy.

## Trend And Curve Protocol

The current Visual Polish curves are placeholders for evidence density, not a
completed data-visualization contract. A trend, sparkline, or chart can move
from visual placeholder to product UI only when these fields are defined:

| Requirement | Rule |
| --- | --- |
| Metric owner | The page/module owns the metric and the route for deeper inspection. |
| Time window | Declare the window, such as latest sample, 5 minutes, 1 hour, 24 hours, or rolling period. |
| Aggregation | Declare latest, count, average, P95, sum, ratio, or rolling comparison. |
| Empty/unknown handling | Missing, stale, zero, disabled, and not-collected are separate states. |
| Threshold semantics | Color and line style come from a documented threshold or state, not decoration. |
| Source boundary | Data comes from safe summaries or approved DTOs; no raw logs, URLs, tokens, credentials, or config. |
| Accessibility | Every curve has a text equivalent and does not rely on color alone. |

Until this contract exists, curves may remain as static visual slots in Figma
and fixture previews, but implementation must not infer production meaning
from their shape.

## App Icons

| Location | Size |
| --- | --- |
| System Search icon | `30px` |
| Large route/action icon | `34px` |
| Primary route icon | `32px` |
| Nav item icon slot | `32px` |
| Top bar app icon | `30px` |

Icon treatment:

- use solid color fills from the app tone tokens;
- use lucide or repo icon style consistently;
- keep icon stroke/fill style consistent inside one app family;
- do not use iOS-6 style glossy highlights;
- do not use multi-stop gradients for every tile.

## System Search And Primary Routes Protocol

System Search is a top-bar route/object search surface, not an app drawer,
scroll dialog, or browser desktop. Sidebar / Primary Routes is the persistent
navigation surface for active pages and locked planned slots.

| Rule | Value |
| --- | --- |
| Top-bar search height | `40px` standard, icon-first when idle or constrained |
| Search result surface | Page-owned result list or lightweight popover; never a long scroll drawer |
| Primary route card | Compact height, `8px` radius, icon/marker slot, selected owner state |
| Module restore | System Search or page-local controls dispatch route/page target ids |
| Planned slots | Searchable only as gated/planned entries; not executable |
| Mobile behavior | Use compact search entry and page-owned result flow; do not reuse desktop grids |

Required structure:

1. Search stays in the top-bar System Search entry and result page/popover.
2. Sidebar / Primary Routes owns page navigation.
3. Page-owned modules stay under their owner page and subpage.
4. Planned apps stay grouped and visually quieter.
5. Hidden modules recover from System Search or page-local controls and should
   not occupy canvas space.

## Plugin Container Protocol

Plugins are manageable workspace applications. A plugin owns its header tools,
display state, and restore path.

| Token | Value |
| --- | --- |
| Min grid width | `260px` |
| Gap | `16px` |
| Padding | `15px` |
| Header gap | `12px` |
| Small height | `128px` |
| Medium height | `168px` |
| Tall height | `252px` |
| Resize handle | `22px` |
| Field height | `26px` |
| Field gap | `6px` |

Display states:

- `large`: spans three plugin columns and is reserved for primary workbench
  modules;
- `medium`: spans two columns and is the default for substantial modules;
- `small`: spans one column and must still expose title, status, and restore
  logic;
- `hidden`: removed from canvas, recoverable from System Search or page-local controls;
- `readonly`: visible but without mutation controls;
- `planned`: visibly gated and not treated as active functionality.

Plugin controls belong in the plugin header or local menu. Do not create a
separate page-level editor card that duplicates controls already present on
the plugin.

## Chrome Protocol

| Element | Rule |
| --- | --- |
| Status bar | Current TopBar is `58px` high at `x=252`, `y=24`; it holds System Search, environment, alert, operator, and route context only. |
| Search | `340 x 40` centered System Search. It is a normal form/result entry, not AppLibrary, NavigationLibrary, or an app drawer. |
| Workspace appbar | Not active in the current product model. Do not implement a bottom dock or appbar from older OS exploration. |
| Brand | Keep brand compact in ShellRail; do not add a second brand/header block in the content area. |
| Account/operator | Right-side status context only; detailed settings belong in future settings or account-detail surfaces. |

## Responsive Protocol

| Breakpoint | Rule |
| --- | --- |
| Wide desktop | Canvas maxes at `1520px`; System Search stays in the top bar and result surfaces stay page-owned. |
| Under 980px | Plugin cards collapse to one-column ownership where needed; metadata shifts left. |
| Under 860px | ShellRail and TopBar need a separate compact projection; planned/safety controls become icon-first. |
| Under 620px | Search becomes compact; controls wrap; module tools align left. |
| Under 520px | Dense table headers may hide and rows must stay horizontally safe. |

Responsive CSS is only a safety layer for the desktop workbench while the web
design is being completed. It may prevent clipping, overflow, and blocked touch
targets, but it must not be treated as the final mobile product design.

Mobile has a separate review-mode target:

```text
status bar
  -> compact page identity
  -> priority section switcher
  -> one active review card / drill-in detail
  -> compact primary routes and System Search recovery
```

Mobile must preserve route ownership, capability gates, and redaction rules,
but it must not reuse the desktop column map, desktop plugin grid, desktop
card density, or desktop page scroll plan. If a mobile screen needs different
information order, implement a separate mobile projection instead of adding
more breakpoint-specific desktop CSS.

## Design Grammar Layer

The visual protocol is no longer only a descriptive QA checklist. The code
source of truth for first-pass Admin UI grammar lives in
`admin/src/design/grammar/*` and is consumed by
`admin/src/app/admin-ui-contract.ts`.

That grammar defines:

- layout archetypes such as `dashboard` and `table`;
- density modes and the minimum `44px` touch target / `48px` comfortable
  target;
- hierarchy roles for metric, context, state, action, evidence, and detail;
- component role groups for system, container, content, control, and state.

Rendered Admin pages must expose grammar metadata with `data-page-id`,
`data-layout`, `data-density`, `data-ui-role`, and `data-mobile-projection`.
Visual QA should validate those attributes, overflow, touch targets, redaction,
and gated surfaces. It should not invent spacing, density, or hierarchy rules
outside the grammar contract.

## Implementation Checklist

Before a Phase 4 implementation PR is ready, verify:

1. New styles use existing `--admin-*` tokens or add protocol-approved tokens.
2. System Search keeps compact search/result density and uses the safe route
   index.
3. Plugin controls are local to the plugin header/menu.
4. Hidden/minimized plugins do not occupy canvas space.
5. No duplicate editor controls exist at both canvas and plugin level.
6. Typography avoids non-integer micro sizes and excessive weights.
7. App icons use solid tone treatment and consistent sizing.
8. Desktop and mobile screenshots match this protocol.
9. Browser console has no UI-introduced errors.
10. No production, backend schema, auth, runtime, token, credential, raw config,
    raw log, SQLite row, or customer-private data enters the UI, tests, docs,
    screenshots, or PR body.

Next visual-quality pass should prioritize these items before adding new
feature surfaces:

1. Move remaining workspace/shared primitive hard-coded colors, radius, and
   shadows into protocol-approved tokens.
2. Remove decorative radial empty states, glossy icon highlights, white inset
   strokes, and multi-stop icon gradients from Admin OS surfaces.
3. Normalize older metric, usage, table, and dashboard primitives to one-level
   8px panel surfaces with low shadows and no nested floating cards.
4. Lock icon pixel grammar around 30/32/34px slots, 16/18/20px glyphs, and
   consistent lucide/repo stroke treatment.
5. Record Browser/Chrome screenshots for desktop, wide/2K, tablet, and mobile
   viewports in the visual QA ledger.

Style-contract candidates for follow-up PRs:

- block new non-token hard-coded colors, unapproved radii, and unapproved
  shadows in Admin OS CSS outside explicit token files;
- block `radial-gradient` decorative empty states, card/plugin
  `backdrop-filter`, small-icon inset highlights, and multi-stop icon
  gradients;
- keep typography bans for `10.5px`, literal `650`, `750`, `900`, and negative
  letter spacing;
- require System Search, module panel, status bar, and primary-route geometry
  to match the tokenized protocol.

## Validation

For this Gate 0 protocol:

```powershell
git diff --check
npm run admin:test -- src/test/admin-style-contract.test.ts
```

For later code PRs touching the Admin workspace:

```powershell
git diff --check
npm run admin:test
npm run admin:build
npm test
```

Use Browser/Chrome visual QA for desktop and mobile before marking Phase 4 UI
implementation complete.
