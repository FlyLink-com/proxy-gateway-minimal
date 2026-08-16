# Admin Console Visual Protocol

Last updated: 2026-06-18, America/Los_Angeles.

```yaml
document_metadata:
  doc_type: canonical
  lifecycle: active
  authority_scope: admin_console_visual_protocol
  superseded_by: null
  last_verified_at: 2026-06-18
  production_authority: false
```


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

This document freezes the visual protocol for the protected Admin console after
the browser-desktop workspace skeleton in PR #330. It is the Gate 0 source of
truth for spacing, surface hierarchy, System Search density, route-card
density, module dimensions, typography, icon treatment, and responsive
behavior.

Use this before implementing:

- `GCC-74` app map and control-plane application list;
- `GCC-75` App Manifest and app authoring standard;
- `GCC-76` plugin container template;
- `GCC-77` System Search safe discovery;
- `GCC-78` workspace layout preset and restore model;
- `GCC-79` permission capability matrix.

No downstream task should invent new radius, shadow, typography, icon size,
System Search density, route-card density, or module geometry without updating
this protocol and its style contract tests.

## Design Goal

The Admin surface is a browser desktop / control-plane workspace:

```text
status bar
  -> workspace appbar / dock
  -> System Search
  -> primary route launcher
  -> plugin canvas
```

The visual system should feel modern, technical, and calm. It should not feel
like a scroll-modal prototype, a nested-card dashboard, or a template collage.

## Coordinate System

| Area | Protocol |
| --- | --- |
| Spacing | Use a 4px base rhythm and 8px visible control rhythm. Prefer `8`, `12`, `16`, `24`, and `32` px steps. |
| Canvas grid | Use a subtle 32px workspace grid through `--admin-canvas-grid-size`. The grid is texture only, not a visible drafting layer. |
| Canvas width | Keep the main canvas bounded by `--admin-canvas-max-width: 1520px`. |
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
| Workspace chrome | `14px` | `--admin-chrome-border` | `--admin-shadow-chrome-2k` |
| Floating library/popovers | `18px` | `--admin-glass-border` or `--admin-border` | `--admin-shadow-floating-2k` / popover shadow |
| Pills | `999px` | semantic or neutral border | no heavy shadow |

Allowed effects:

- low-opacity blue/teal workspace tint;
- thin hairline borders where it improves 2K clarity;
- single solid app-icon fills with restrained shadow.

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
| App/library tile labels | 12px, `600` or `700`, centered or compact; avoid mid-word breaks. |
| Navigation labels | 12-13px, `700` to `800`, no negative letter spacing. |
| Page titles | 16px in status bar, larger inside page headers only when the page owns a real title area. |
| Metric values | Use bounded `clamp(...)`; do not break numeric values mid-word. |

Default rule: use stronger weight sparingly. Heavy labels should identify
navigation, active app state, or primary metrics, not every piece of copy.

## App Icons

| Location | Size |
| --- | --- |
| Search/route icon | `30px` |
| Large route/action icon | `34px` |
| Dock/appbar icon | `32px` |
| Nav item icon slot | `32px` |
| Top bar app icon | `30px` |

Icon treatment:

- use solid color fills from the app tone tokens;
- use lucide or repo icon style consistently;
- keep icon stroke/fill style consistent inside one app family;
- do not use iOS-6 style glossy highlights;
- do not use multi-stop gradients for every tile.

## System Search And Route Launcher Protocol

System Search is the global discovery/recovery surface. It is not an app
drawer, scroll dialog, or secondary navigation tree. Primary routes and
page-local controls remain the visible route mechanism.

| Rule | Value |
| --- | --- |
| System Search width | `640px`, capped by viewport gutter |
| System Search max height | `min(480px, viewport-safe height)` |
| Padding | `12px` |
| Group gap | `10px` |
| Result row height | `44px` minimum |
| Route card height | `44px` minimum |
| Module launcher height | `44px` minimum |
| Mobile behavior | collapse to a route-aware search sheet only after a dedicated mobile standard exists |

Required structure:

1. Top-bar search is a real system search form, not a hidden launcher trigger.
2. Results come from the safe manifest/search document contract.
3. Primary routes appear in sidebar/top route controls, not inside a second
   launcher layer.
4. Planned apps stay out of active navigation unless explicitly gated.
5. Hidden/collapsed modules recover from System Search or page-local controls
   and should not occupy canvas space.

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
- `hidden`: removed from canvas, recoverable from System Search or page-local
  controls;
- `readonly`: visible but without mutation controls;
- `planned`: visibly gated and not treated as active functionality.

Plugin controls belong in the plugin header or local menu. Do not create a
separate page-level editor card that duplicates controls already present on
the plugin.

## Chrome Protocol

| Element | Rule |
| --- | --- |
| Status bar | `48px` minimum height; sticky; minimal page context and operator/environment controls only. |
| Search | Collapsed to icon when idle; expands in place when active. Search should not dominate the status bar. |
| Workspace appbar | Bottom dock at `58px` height and `960px` max width. |
| Brand | Keep brand compact in the appbar; do not rebuild a traditional tall sidebar. |
| Account/operator | Right-side status context only; detailed settings belong in System Search or a future settings route. |

## Responsive Protocol

| Breakpoint | Rule |
| --- | --- |
| Wide desktop | Canvas maxes at `1520px`; System Search opens as a bounded command surface aligned to the status bar. |
| Under 980px | Plugin cards collapse to one-column ownership where needed; metadata shifts left. |
| Under 860px | Appbar stays compact near the bottom; planned/safety controls become icon-first. |
| Under 620px | System Search becomes a bounded route-aware sheet only after the dedicated mobile standard is accepted; controls wrap and plugin tools align left. |
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
  -> compact route/search recovery
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
2. System Search uses the safe search contract and does not duplicate primary
   navigation or page content.
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
- require System Search, plugin, status bar, route controls, and appbar
  geometry to match the tokenized protocol.

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
