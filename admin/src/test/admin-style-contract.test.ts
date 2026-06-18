import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const styles = readCssWithImports("src/styles.css");
const adminOsStyles = [
  "src/styles/tokens.css",
  "src/styles/base.css",
  "src/styles/admin-os-chrome.css",
  "src/styles/admin-os-workspace.css",
  "src/styles/responsive.css"
]
  .map((filePath) => readCssWithImports(filePath))
  .join("\n");
const publicSiteStyles = readCssWithImports("src/styles/public-site.css");
const legacyEntrypointStyles = readCssWithImports("src/styles/legacy-entrypoints.css");
const responsiveStyles = readCssWithImports("src/styles/responsive.css");
const faviconSvg = readFileSync(resolve("public/favicon.svg"), "utf8").replace(/\r\n?/g, "\n");
const primitiveSources = [
  "src/components/primitives/metric-card.tsx",
  "src/components/primitives/workbench-container.tsx"
]
  .map((filePath) => readFileSync(resolve(filePath), "utf8").replace(/\r\n?/g, "\n"))
  .join("\n");

function readCssWithImports(filePath: string, seen = new Set<string>()): string {
  const resolvedPath = resolve(filePath);

  if (seen.has(resolvedPath)) {
    return "";
  }

  seen.add(resolvedPath);

  const css = readFileSync(resolvedPath, "utf8").replace(/\r\n?/g, "\n");
  const cssDir = dirname(resolvedPath);

  return css.replace(/^@import\s+["']([^"']+)["'];\s*$/gm, (_statement, importPath: string) =>
    readCssWithImports(join(cssDir, importPath), seen)
  );
}

function selectorBlock(selector: string) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
  return styles.match(pattern)?.[1] ?? "";
}

describe("admin style token contract", () => {
  test("freezes the Phase 4 Admin OS visual protocol coordinates", () => {
    const rootBlock = selectorBlock(":root");

    [
      "--admin-canvas-grid-size: 32px",
      "--admin-desktop-grid-alpha: 0.012",
      "--admin-desktop-grid-alpha-strong: 0.018",
      "--admin-canvas-gutter: 24px",
      "--admin-canvas-gutter-mobile: 12px",
      "--admin-canvas-max-width: 1520px",
      "--admin-statusbar-height: 48px",
      "--admin-appbar-height: 58px",
      "--admin-appbar-width: 960px",
      "--admin-app-icon-size: 34px",
      "--admin-app-icon-dock-size: 32px",
      "--admin-library-width: 760px",
      "--admin-library-max-height: min(560px",
      "--admin-library-padding: 12px",
      "--admin-library-gap: 10px",
      "--admin-library-cell-width: 78px",
      "--admin-library-page-cell-width: 132px",
      "--admin-library-page-columns: 3",
      "--admin-library-module-columns: 6",
      "--admin-library-utility-columns: 5",
      "--admin-library-tile-height: 64px",
      "--admin-library-icon-size: 30px",
      "--admin-library-icon-size-large: 34px",
      "--admin-library-bottom: calc(var(--admin-appbar-bottom) + var(--admin-appbar-height) + 12px)",
      "--admin-plugin-grid-min: 260px",
      "--admin-plugin-grid-row-unit: 32px",
      "--admin-plugin-gap: 16px",
      "--admin-plugin-padding: 15px",
      "--admin-plugin-header-gap: 12px",
      "--admin-plugin-small-height: 128px",
      "--admin-plugin-medium-height: 168px",
      "--admin-plugin-large-height: 216px",
      "--admin-plugin-height-tall: 252px",
      "--admin-plugin-field-height: 26px",
      "--admin-plugin-field-gap: 6px",
      "--admin-plugin-resize-handle: 22px",
      "--admin-radius-control: 8px",
      "--admin-radius-panel: 8px",
      "--admin-radius-card: 8px",
      "--admin-radius-chrome: 14px",
      "--admin-radius-floating: 18px",
      "--admin-radius-icon: 8px",
      "--admin-noise-opacity: 0"
    ].forEach((expectedToken) => {
      expect(rootBlock).toContain(expectedToken);
    });

    expect(adminOsStyles).not.toContain("font-size: 10.5px");
    expect(adminOsStyles).not.toContain("font-weight: 620");
    expect(adminOsStyles).not.toContain("font-weight: 650");
    expect(adminOsStyles).not.toContain("font-weight: 750");
    expect(adminOsStyles).not.toContain("font-weight: 850");
    expect(adminOsStyles).not.toContain("font-weight: 900");
    expect(adminOsStyles).not.toMatch(/letter-spacing:\s*0\.0[1-9]em/);
    expect(adminOsStyles).not.toContain("blur(30px)");
    expect(adminOsStyles).not.toContain("0 28px 78px");
    expect(adminOsStyles).not.toContain("linear-gradient(135deg, var(--nav-app-a), var(--nav-app-b))");
    expect(adminOsStyles).not.toContain("background-attachment: fixed");
    expect(adminOsStyles).not.toContain("mix-blend-mode");
    expect(adminOsStyles).not.toMatch(/(?:^|\n)\s*filter:\s*none;/);
    expect(adminOsStyles).not.toMatch(/stroke-width:\s*2\.[0-9]/);
    expect(adminOsStyles).not.toMatch(/(?:width|height):\s*(13|14|15|17|19|21)px;/);
    expect(primitiveSources).not.toMatch(/strokeWidth=\{2\.[0-9]/);
    expect(primitiveSources).not.toMatch(/size=\{(13|14|15|17|19|21)\}/);
    expect(primitiveSources).toContain("<svg width=\"92\" height=\"34\" viewBox=\"0 0 92 34\"");
  });

  test("declares shared New Admin visual tokens", () => {
    [
      "--admin-bg",
      "--admin-desktop-bg",
      "--admin-desktop-bg-top",
      "--admin-desktop-bg-mid",
      "--admin-desktop-bg-bottom",
      "--admin-desktop-grid-alpha",
      "--admin-desktop-grid-alpha-strong",
      "--admin-desktop-shelf",
      "--admin-desktop-shelf-border",
      "--admin-surface",
      "--admin-surface-muted",
      "--admin-surface-raised",
      "--admin-border",
      "--admin-border-hairline",
      "--admin-text",
      "--admin-muted",
      "--admin-accent",
      "--admin-accent-surface",
      "--admin-glass-surface",
      "--admin-glass-surface-strong",
      "--admin-glass-border",
      "--admin-statusbar-surface",
      "--admin-statusbar-border",
      "--admin-statusbar-shadow",
      "--admin-dock-surface",
      "--admin-dock-border",
      "--admin-dock-shadow",
      "--admin-radius-panel",
      "--admin-radius-card",
      "--admin-radius-chrome",
      "--admin-radius-floating",
      "--admin-radius-tile",
      "--admin-radius-icon",
      "--admin-shadow-chrome",
      "--admin-shadow-chrome-2k",
      "--admin-shadow-floating",
      "--admin-shadow-floating-2k",
      "--admin-shadow-plugin-rest",
      "--admin-shadow-plugin-hover",
      "--admin-shadow-panel",
      "--admin-shadow-popover",
      "--admin-canvas-grid-size",
      "--admin-canvas-grid-alpha",
      "--admin-canvas-grid-alpha-strong",
      "--admin-noise-opacity",
      "--admin-canvas-max-width",
      "--admin-canvas-gutter",
      "--admin-canvas-gutter-mobile",
      "--admin-statusbar-height",
      "--admin-statusbar-padding-x",
      "--admin-appbar-height",
      "--admin-appbar-bottom",
      "--admin-appbar-width",
      "--admin-appbar-padding",
      "--admin-appbar-gap",
      "--admin-app-icon-size",
      "--admin-app-icon-dock-size",
      "--admin-library-width",
      "--admin-library-bottom",
      "--admin-library-max-height",
      "--admin-library-padding",
      "--admin-library-gap",
      "--admin-library-grid-column-gap",
      "--admin-library-grid-row-gap",
      "--admin-library-cell-width",
      "--admin-library-page-cell-width",
      "--admin-library-page-columns",
      "--admin-library-module-columns",
      "--admin-library-utility-columns",
      "--admin-library-tile-height",
      "--admin-library-icon-size",
      "--admin-library-icon-size-large",
      "--admin-plugin-grid-min",
      "--admin-plugin-grid-row-unit",
      "--admin-plugin-small-columns",
      "--admin-plugin-medium-columns",
      "--admin-plugin-large-columns",
      "--admin-plugin-height-short-rows",
      "--admin-plugin-height-medium-rows",
      "--admin-plugin-height-tall-rows",
      "--admin-plugin-gap",
      "--admin-plugin-padding",
      "--admin-plugin-header-gap",
      "--admin-plugin-medium-height",
      "--admin-plugin-large-height",
      "--admin-plugin-small-height",
      "--admin-plugin-height-short",
      "--admin-plugin-height-medium",
      "--admin-plugin-height-tall",
      "--admin-plugin-field-height",
      "--admin-plugin-field-gap",
      "--admin-plugin-resize-handle",
      "--admin-sidebar-width",
      "--admin-content-padding",
      "--admin-workbench-gap",
      "--admin-control-height",
      "--admin-nav-card-height",
      "--admin-nav-icon-size",
      "--admin-focus-ring",
      "--admin-hover-surface",
      "--admin-selected-surface",
      "--admin-font-ui",
      "--admin-ease"
    ].forEach((token) => {
      expect(styles).toContain(token);
    });
  });

  test("routes shell, panels, and workbench through tokens", () => {
    expect(selectorBlock(":root")).toContain("text-rendering: geometricPrecision");
    expect(selectorBlock("body")).toContain("-webkit-font-smoothing: antialiased");
    expect(selectorBlock("body")).toContain("-moz-osx-font-smoothing: grayscale");
    expect(selectorBlock(".admin-shell")).toContain("display: block");
    expect(selectorBlock(".admin-shell")).toContain("var(--admin-desktop-bg)");
    expect(selectorBlock(".admin-shell")).toContain("var(--admin-desktop-bg-top)");
    expect(selectorBlock(".admin-shell")).toContain("var(--admin-desktop-bg-mid)");
    expect(selectorBlock(".admin-shell")).toContain("var(--admin-desktop-bg-bottom)");
    expect(selectorBlock(".admin-shell")).toContain("linear-gradient");
    expect(selectorBlock(".admin-shell")).toContain("var(--admin-desktop-grid-alpha)");
    expect(selectorBlock(".admin-shell")).toContain("isolation: isolate");
    expect(selectorBlock(".admin-shell::before")).toContain("var(--admin-noise-opacity)");
    expect(selectorBlock(".admin-shell::after")).toContain("var(--admin-desktop-shelf)");
    expect(selectorBlock(".admin-shell::after")).toContain("var(--admin-desktop-shelf-border)");
    expect(selectorBlock(":root")).toContain("--admin-library-width: 760px");
    expect(selectorBlock(":root")).toContain("--admin-library-max-height: min(560px");
    expect(selectorBlock(":root")).toContain("--admin-appbar-width: 960px");
    expect(selectorBlock(":root")).toContain("--admin-shadow-floating-2k: 0 16px 36px");
    expect(selectorBlock(".app-sidebar")).toContain("var(--admin-dock-surface)");
    expect(selectorBlock(".app-sidebar")).toContain("var(--admin-dock-border)");
    expect(selectorBlock(".app-sidebar")).toContain("var(--admin-dock-shadow)");
    expect(selectorBlock(".app-sidebar")).toContain("box-shadow: var(--admin-dock-shadow)");
    expect(selectorBlock(".app-sidebar::before")).toContain("linear-gradient");
    expect(selectorBlock(".app-sidebar > *")).toContain("z-index: 1");
    expect(selectorBlock(".app-sidebar")).toContain("position: fixed");
    expect(selectorBlock(".app-sidebar")).toContain("bottom: var(--admin-appbar-bottom)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-surface)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-border)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-shadow)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-height)");
    expect(selectorBlock(".top-bar")).toContain("position: sticky");
    expect(selectorBlock(":root")).toContain("--admin-statusbar-height: 48px");
    expect(selectorBlock(".top-bar")).toContain("backdrop-filter: none");
    expect(selectorBlock(".admin-content")).toContain("var(--admin-content-padding)");
    expect(selectorBlock(".admin-content")).toContain("var(--admin-canvas-max-width)");
    expect(selectorBlock(".dashboard-panel")).toContain("var(--admin-radius-panel)");
    expect(selectorBlock(".dashboard-panel")).toContain("var(--admin-shadow-panel)");
    expect(selectorBlock(".primary-button")).toContain("var(--admin-accent)");
    expect(styles).toMatch(/\.ghost-button\s*\{[\s\S]*border: 1px solid var\(--admin-border-strong\)/m);
    expect(selectorBlock(".top-menu-popover")).toContain("var(--admin-shadow-popover)");
    expect(selectorBlock(".new-console-workbench")).toContain("var(--admin-workbench-gap)");
    expect(selectorBlock(".new-console-row")).toContain("var(--admin-border)");
    expect(selectorBlock(".workbench-layer-item")).toContain("var(--admin-border)");
    expect(selectorBlock(".workbench-layer-item > div")).toContain("display: grid");
    expect(selectorBlock(".workbench-container-card")).toContain("var(--admin-border)");
    expect(selectorBlock(".workbench-container-card")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".operator-account-summary")).toContain("var(--admin-radius-pill)");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: 38px");
    expect(selectorBlock(".operator-account-avatar")).toContain("linear-gradient");
    expect(selectorBlock(".nav-library-utility-grid")).toContain("repeat(var(--admin-library-utility-columns), minmax(0, var(--admin-library-cell-width)))");
    expect(styles).not.toContain(".admin-blueprint-page-tools");
    expect(styles).not.toContain(".admin-blueprint-module-count");
    expect(styles).not.toContain(".admin-blueprint-console-header");
    expect(styles).not.toContain(".admin-blueprint-status-grid");
    expect(styles).not.toContain(".admin-blueprint-status-card");
    expect(selectorBlock(".admin-blueprint-disclosure")).toContain("box-shadow:");
    expect(selectorBlock(".admin-blueprint-disclosure summary")).toContain("var(--admin-control-height)");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("repeat(auto-fill");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("var(--admin-plugin-grid-min)");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("grid-auto-rows: var(--admin-plugin-grid-row-unit)");
    expect(styles).not.toContain(".admin-blueprint-workspace-toolbar");
    expect(styles).not.toContain(".admin-blueprint-window-tool");
    expect(selectorBlock(".admin-blueprint-card-menu")).toContain("display: inline-flex");
    expect(selectorBlock(".admin-blueprint-card-menu")).toContain("z-index: 5");
    expect(selectorBlock(".admin-blueprint-card-tool-trigger")).toContain("display: inline-grid");
    expect(selectorBlock(".admin-blueprint-card-tool-trigger:hover,\n.admin-blueprint-card-tool-trigger[aria-expanded=\"true\"]")).toContain("var(--workbench-category-bg");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("grid-template-columns:");
    expect(selectorBlock(".admin-blueprint-module-card-head")).toContain("display: flex");
    expect(selectorBlock(".admin-blueprint-card-inline-tools")).toContain("var(--admin-radius-pill)");
    expect(selectorBlock(".admin-blueprint-icon-switch")).toContain("display: inline-grid");
    expect(selectorBlock(".admin-blueprint-card-resize-grip")).toContain("var(--admin-plugin-resize-handle)");
    expect(selectorBlock(".admin-blueprint-card-resize-grip")).toContain("touch-action: none");
    expect(selectorBlock(".admin-blueprint-card-resize-e,\n.admin-blueprint-card-resize-w")).toContain("cursor: ew-resize");
    expect(selectorBlock(".admin-blueprint-card-resize-n,\n.admin-blueprint-card-resize-s")).toContain("cursor: ns-resize");
    expect(selectorBlock(".admin-blueprint-card-resize-se")).toContain("cursor: nwse-resize");
  });

  test("keeps design-draft module containers visually typed and scannable", () => {
    expect(selectorBlock(".workbench-category-pill")).toContain("var(--workbench-category-bg");
    expect(selectorBlock(".workbench-category-pill,\n.workbench-container-stage")).toContain("min-height: 22px");
    expect(selectorBlock(".workbench-container-stage")).toContain("white-space: nowrap");
    expect(selectorBlock(".workbench-container-summary")).toContain("overflow-wrap: anywhere");
    expect(selectorBlock(".workbench-container-details summary")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".workbench-container-meta div")).toContain("var(--admin-radius-control)");
    expect(selectorBlock(".workbench-category-monitoring")).toContain("--workbench-category-color: #2563eb");
    expect(selectorBlock(".admin-blueprint-list")).toContain("border-top");
    expect(selectorBlock(".admin-blueprint-list")).toContain("background: transparent");
    expect(selectorBlock(".admin-blueprint-list-heading span")).toContain("var(--admin-accent-soft)");
    expect(selectorBlock(".admin-blueprint-list li::before")).toContain("var(--admin-accent)");
    expect(selectorBlock(".admin-blueprint-module-title small")).toContain("text-overflow: ellipsis");
    expect(selectorBlock(".admin-blueprint-module-title small")).toContain("font-size: 11px");
    expect(selectorBlock(".admin-blueprint-module-title h3")).toContain("word-break: normal");
    expect(selectorBlock(".admin-blueprint-module-notes summary")).toContain("width: max-content");
    expect(selectorBlock(".admin-blueprint-module-notes .admin-blueprint-module-purpose")).toContain("display: block");
    expect(selectorBlock(".admin-blueprint-module-contract")).toContain("repeat(2, minmax(0, 1fr))");
    expect(selectorBlock(".admin-blueprint-module-card > .admin-blueprint-module-notes")).toContain("grid-column: 1 / -1");
    expect(selectorBlock(".admin-blueprint-card-fields")).toContain("display: grid");
    expect(selectorBlock(".admin-blueprint-card-fields")).toContain("repeat(auto-fit");
    expect(selectorBlock(".admin-blueprint-card-fields")).toContain("var(--admin-plugin-field-gap)");
    expect(selectorBlock(".admin-blueprint-card-fields li")).toContain("white-space: normal");
    expect(selectorBlock(".admin-blueprint-card-fields li")).toContain("border-left: 3px solid");
    expect(selectorBlock(".admin-blueprint-card-fields li")).toContain("font-weight: 600");
    expect(selectorBlock(".admin-blueprint-card-fields li")).toContain("box-shadow: none");
    expect(selectorBlock(".admin-blueprint-card-fields li::before")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".admin-blueprint-module-card-hidden")).toContain("border-style: dashed");
    expect(selectorBlock(".admin-blueprint-module-card-hidden")).toContain("var(--admin-surface-muted)");
    expect(styles).toContain(".admin-blueprint-module-card-hidden > .admin-blueprint-card-fields");
    expect(selectorBlock(".admin-blueprint-module-card-meta")).toContain("justify-items: end");
    expect(selectorBlock(".admin-blueprint-module-card-height-medium")).toContain("var(--admin-plugin-height-medium)");
    expect(selectorBlock(".admin-blueprint-module-card-height-medium")).toContain("grid-row: span var(--admin-plugin-height-medium-rows)");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("border: 1px dashed");
    expect(selectorBlock(".admin-blueprint-module-card-large")).toContain("grid-column: span var(--admin-plugin-large-columns)");
    expect(selectorBlock(".admin-blueprint-module-card-medium")).toContain("grid-column: span var(--admin-plugin-medium-columns)");
    expect(selectorBlock(".admin-blueprint-module-card-small")).toContain("grid-column: span var(--admin-plugin-small-columns)");
    expect(selectorBlock(".admin-blueprint-module-card-height-short")).toContain("var(--admin-plugin-height-short)");
    expect(selectorBlock(".admin-blueprint-module-card-height-short")).toContain("grid-row: span var(--admin-plugin-height-short-rows)");
    expect(selectorBlock(".admin-blueprint-module-card-height-tall")).toContain("var(--admin-plugin-height-tall)");
    expect(selectorBlock(".admin-blueprint-module-card-height-tall")).toContain("grid-row: span var(--admin-plugin-height-tall-rows)");
    expect(styles).toContain(".admin-blueprint-module-card-small > .admin-blueprint-actions");
    expect(selectorBlock(".admin-blueprint-card-drag-handle")).toContain("cursor: grab");
    expect(selectorBlock(".admin-blueprint-card-drag-handle")).toContain("touch-action: none");
    expect(selectorBlock(".admin-blueprint-module-card-resizing")).toContain("user-select: none");
    expect(styles).toContain(".admin-blueprint-icon-switch[aria-pressed=\"true\"]");
    expect(styles).not.toContain(".admin-blueprint-card-switches");
    expect(styles).not.toContain(".admin-blueprint-module-dock");
    expect(styles).not.toContain(".admin-blueprint-switch");
    expect(styles).not.toContain(".admin-blueprint-module-card-pinned");
    expect(styles).not.toContain(".admin-blueprint-module-card-compact");
    expect(styles).not.toContain(".admin-blueprint-module-gate");
    expect(styles).not.toContain(".admin-blueprint-library-next");
  });

  test("keeps page source status badges responsive", () => {
    expect(selectorBlock(".page-header-status-stack")).toContain("flex-wrap: wrap");
    expect(selectorBlock(".data-source-badge")).toContain("min-width: 220px");
    expect(styles).toContain(".page-header-status-stack .data-source-badge");
  });

  test("keeps app library search and account chrome compact", () => {
    expect(selectorBlock(".nav-library-toolbar")).toContain("minmax(0, 1fr)");
    expect(selectorBlock(".nav-library-search")).toContain("var(--admin-radius-pill)");
    expect(selectorBlock(".nav-library-search input")).toContain("width: 100%");
    expect(selectorBlock(".nav-library-result-count")).toContain("var(--admin-radius-pill)");
    expect(selectorBlock(".nav-library-toolbar")).toContain("position: static");
    expect(selectorBlock(".nav-library-utilities")).toContain("order: 1");
    expect(selectorBlock(".nav-library-pages")).toContain("order: 2");
    expect(selectorBlock(".nav-library-card-apps")).toContain("order: 3");
    expect(selectorBlock(".nav-library-utilities")).toContain("background: transparent");
    expect(selectorBlock(".nav-library-utility")).toContain("text-align: center");
    expect(selectorBlock(".nav-library-utility")).toContain("box-shadow: none");
    expect(styles).not.toContain(".nav-library-connection .connection-widget-popover");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: 38px");
    expect(selectorBlock(".operator-account-copy small")).toContain("white-space: nowrap");
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.nav-library-utility-grid,[\s\S]*\.nav-library-grid,[\s\S]*\.nav-library-grid-modules\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-module-card-meta\s*\{[\s\S]*justify-items: start;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-card-inline-tools\s*\{[\s\S]*justify-self: start;/m);
    expect(styles).toMatch(/@media \(max-width: 980px\) \{[\s\S]*\.admin-blueprint-module-card-head\s*\{[\s\S]*display: flex;/m);
  });

  test("keeps interactive admin controls visually consistent", () => {
    expect(selectorBlock(".nav-item")).toContain("min-height: 42px");
    expect(selectorBlock(".nav-item")).toContain("display: inline-flex");
    expect(selectorBlock(".nav-item-icon")).toContain("width: 32px");
    expect(selectorBlock(".nav-primary-list")).toContain("display: flex");
    expect(selectorBlock(".nav-planned-menu")).toContain("position: relative");
    expect(selectorBlock(".nav-planned-summary")).toContain("min-height: 42px");
    expect(selectorBlock(".nav-planned-summary")).toContain("list-style: none");
    expect(selectorBlock(".nav-planned-list")).toContain("position: fixed");
    expect(selectorBlock(".nav-planned-list")).toContain("var(--admin-library-bottom)");
    expect(selectorBlock(".nav-planned-list")).toContain("var(--admin-library-width)");
    expect(selectorBlock(".nav-planned-list")).toContain("var(--admin-library-max-height)");
    expect(selectorBlock(".nav-planned-list")).toContain("overflow-y: auto");
    expect(selectorBlock(".nav-planned-list")).toContain("backdrop-filter: none");
    expect(selectorBlock(".nav-planned-list")).toContain("contain: layout paint");
    expect(selectorBlock(".nav-planned-list")).toContain("var(--admin-shadow-floating-2k)");
    expect(selectorBlock(".nav-planned-list")).toContain("box-shadow: var(--admin-shadow-floating-2k)");
    expect(selectorBlock(".nav-library-toolbar")).toContain("display: grid");
    expect(selectorBlock(".nav-library-search")).toContain("display: flex");
    expect(selectorBlock(".nav-library-utilities")).toContain("border: 0");
    expect(selectorBlock(".nav-library-heading")).toContain("font-size: 11px");
    expect(selectorBlock(".nav-library-heading")).toContain("text-transform: none");
    expect(selectorBlock(".nav-library-utility")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(selectorBlock(".nav-library-utility")).toContain("padding: 6px 4px");
    expect(selectorBlock(".nav-library-group")).toContain("display: grid");
    expect(selectorBlock(".nav-library-grid")).toContain("repeat(var(--admin-library-page-columns), minmax(0, var(--admin-library-page-cell-width)))");
    expect(selectorBlock(".nav-library-grid")).toContain("align-items: start");
    expect(selectorBlock(".nav-library-grid")).toContain("justify-content: start");
    expect(selectorBlock(".nav-library-grid-modules")).toContain("repeat(var(--admin-library-module-columns), minmax(0, var(--admin-library-cell-width)))");
    expect(selectorBlock(".nav-library-utility-grid")).toContain("repeat(var(--admin-library-utility-columns), minmax(0, var(--admin-library-cell-width)))");
    expect(selectorBlock(".nav-library-utility-grid")).toContain("align-items: start");
    expect(selectorBlock(".nav-library-utility-grid")).toContain("justify-content: start");
    expect(selectorBlock(".nav-planned-item")).toContain("grid-template-columns: 1fr");
    expect(selectorBlock(".nav-planned-item")).toContain("var(--admin-library-tile-height)");
    expect(selectorBlock(".nav-planned-item-module")).toContain("transparent");
    expect(selectorBlock(".nav-app-icon")).toContain("background: var(--nav-app-a)");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-radius-icon)");
    expect(selectorBlock(".nav-app-icon")).toContain("0 2px 6px var(--nav-app-shadow)");
    expect(selectorBlock(".nav-app-icon::after")).toContain("display: none");
    expect(selectorBlock(".nav-app-icon svg")).toContain("position: relative");
    expect(selectorBlock(".nav-app-tone-emerald")).toContain("--nav-app-a: #059669");
    expect(selectorBlock(".nav-app-tone-indigo")).toContain("--nav-app-a: #4f46e5");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-library-icon-size)");
    expect(selectorBlock(".nav-app-icon-dock")).toContain("var(--admin-app-icon-dock-size)");
    expect(selectorBlock(".nav-item-icon.nav-app-icon-dock svg")).toContain("width: 16px");
    expect(selectorBlock(".nav-item-icon.nav-app-icon-dock svg")).toContain("height: 16px");
    expect(selectorBlock(".sidebar-safety-summary")).toContain("min-height: 42px");
    expect(styles).toMatch(/\.nav-item-active\s*\{[\s\S]*0 5px 14px rgba\(37, 99, 235, 0\.055\)/m);
    expect(selectorBlock(".nav-item")).toContain("transition:");
    expect(selectorBlock(".environment-pill,\n.protected-console,\n.icon-button")).toContain("min-height: var(--admin-control-height)");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: 38px");
    expect(styles).toMatch(/\.top-bar-link\s*\{[\s\S]*display: inline-flex/m);
    expect(styles).toMatch(/\.ghost-button\s*\{[\s\S]*display: inline-flex/m);
    expect(selectorBlock(".case-row")).toContain("transition:");
    expect(styles).toContain("outline: 3px solid var(--admin-focus-ring)");
    expect(styles).toContain("background: var(--admin-hover-surface)");
    expect(styles).toContain("background: var(--admin-selected-surface)");
    expect(styles).not.toContain("font-size: 10.5px");
    expect(styles).not.toContain("font-weight: 750");
    expect(styles).not.toContain("blur(30px)");
    expect(styles).not.toContain("0 28px 78px");
    expect(styles).not.toContain("linear-gradient(135deg, var(--nav-app-a), var(--nav-app-b))");
    expect(styles).not.toContain("0 12px 24px var(--nav-app-shadow)");
    expect(styles).not.toContain("inset 0 1px 0 rgba(255, 255, 255, 0.36)");
  });

  test("keeps dense New Admin tables and safe refs mobile-safe", () => {
    expect(selectorBlock(".new-console-table")).toContain("overflow-x: auto");
    expect(selectorBlock(".new-console-row")).toContain("min-width: min(100%, 720px)");
    expect(selectorBlock(".mono-ref")).toContain("max-width: 100%");
    expect(selectorBlock(".mono-ref")).toContain("overflow-wrap: anywhere");
    expect(styles).toMatch(/@media \(max-width: 520px\) \{[\s\S]*\.new-console-row-head\s*\{\s*display: none;/m);
  });

  test("keeps account and app library detail popovers closed until opened", () => {
    expect(styles).toMatch(/\.operator-account-menu:not\(\[open\]\)\s*>\s*\.operator-account-popover,[\s\S]*\.connection-widget:not\(\[open\]\)\s*>\s*\.connection-widget-popover\s*\{\s*display: none;/m);
  });

  test("keeps page-local subnavigation and usage charts mobile-safe", () => {
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.page-subnav-scroll\s*\{[\s\S]*flex-wrap: wrap;[\s\S]*overflow-x: visible;/m);
    expect(selectorBlock(".page-subnav-scroll")).toContain("flex-wrap: wrap");
    expect(selectorBlock(".page-subnav-link")).toContain("min-height: 36px");
    expect(selectorBlock(".page-subnav-card-head")).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(selectorBlock(".page-subnav-marker")).toContain("var(--admin-accent)");
    expect(selectorBlock(".page-subnav-mode")).toContain("var(--admin-neutral-bg)");
    expect(selectorBlock(".overview-next-action")).toContain("inset 3px 0 0 transparent");
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.usage-timeseries-layout\s*\{[\s\S]*grid-template-columns: 1fr;/m);
    expect(styles).toMatch(/@media \(max-width: 980px\) \{[\s\S]*\.admin-blueprint-module-contract,[\s\S]*\.admin-blueprint-module-card,[\s\S]*\.admin-blueprint-next-step,[\s\S]*\.workbench-container-meta\s*\{[\s\S]*grid-template-columns: 1fr;/m);
    expect(styles).toMatch(/@media \(max-width: 980px\) \{[\s\S]*\.admin-blueprint-module-card-large,[\s\S]*\.admin-blueprint-module-card-medium,[\s\S]*\.admin-blueprint-module-card-small\s*\{[\s\S]*grid-column: auto;/m);
    expect(selectorBlock(".usage-chart-panel")).toContain("overflow: hidden");
    expect(selectorBlock(".usage-chart-svg")).toContain("overflow: hidden");
  });

  test("keeps the mobile admin shell focused on active navigation and compact actions", () => {
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.top-bar-actions\s*\{[\s\S]*display: flex;[\s\S]*flex-wrap: wrap;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.operator-account-summary\s*\{[\s\S]*min-height: 38px;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.nav-library-search\s*\{[\s\S]*min-height: 38px;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.app-sidebar\s*\{[\s\S]*bottom: 8px;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.nav-primary-list\s*\{[\s\S]*display: flex;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.nav-planned-summary,[\s\S]*\.sidebar-safety-summary\s*\{[\s\S]*width: 42px;/m);
  });

  test("keeps hero metric values readable without mid-word breaks", () => {
    const metricValueBlock = selectorBlock(".ops-metric-card strong");
    expect(metricValueBlock).toContain("font-size: clamp(28px, 2.2vw, 34px)");
    expect(metricValueBlock).toContain("overflow-wrap: normal");
    expect(metricValueBlock).toContain("word-break: normal");
  });

  test("keeps the 2k visual foundation polished without adding a component-library dependency", () => {
    expect(styles).not.toContain("@tailwind");
    expect(styles).not.toContain("ant-");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("background: #ffffff");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("contain: layout paint");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("box-shadow: var(--admin-shadow-plugin-rest)");
    expect(selectorBlock(".admin-blueprint-module-card")).toContain("backdrop-filter: none");
    expect(selectorBlock(".admin-blueprint-module-card::before")).toContain("width: 2px");
    expect(selectorBlock(".admin-blueprint-module-card::before")).toContain("background: var(--admin-plugin-accent)");
    expect(selectorBlock(".admin-blueprint-module-card:not(.admin-blueprint-module-card-dragging):hover")).toContain("0 0 0 1px");
    expect(selectorBlock(".nav-library-search")).toContain("0 1px 2px");
    expect(selectorBlock(".nav-library-search input")).toContain("font-weight: 500");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("radial-gradient");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("0 10px 24px");
  });

  test("keeps portal and public entrypoint pixel regressions contained", () => {
    expect(selectorBlock(".portal-traffic-meter")).toContain("background: #eef2f7");
    expect(selectorBlock(".portal-traffic-meter span")).toContain("min-width: 4px");
    expect(selectorBlock(".portal-traffic-meter span")).toContain("linear-gradient(90deg, #2563eb, #14b8a6)");
    expect(legacyEntrypointStyles).not.toContain("rgb(22 163 74 / 0.12)");

    expect(selectorBlock(".site-orbit")).not.toContain("filter: blur(1px)");
    expect(selectorBlock(".site-terminal-card span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-section-heading span,\n.company-site-band span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-effect-copy span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-workflow-header span")).toContain("font-weight: 800");
    expect(selectorBlock(".site-effect-step span")).toContain("font-weight: 800");
    expect(publicSiteStyles).not.toContain("font-weight: 900");
    expect(publicSiteStyles).not.toMatch(/letter-spacing:\s*0\.0[6-8]em/);
    expect(responsiveStyles).toMatch(/\.site-effect-flow,[\s\S]*\.site-orbit,[\s\S]*\.site-terminal-card:hover/);

    expect(faviconSvg).toContain("GlobalCircle AI Proxy Gateway");
    expect(faviconSvg).toContain("<circle cx=\"32\" cy=\"32\"");
    expect(faviconSvg).not.toContain("M18 22h15");
  });
});
