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
const responsiveStyles = readCssWithImports("src/styles/responsive.css");
const faviconSvg = readFileSync(resolve("public/favicon.svg"), "utf8").replace(/\r\n?/g, "\n");
const primitiveSources = [
  "src/components/primitives/metric-card.tsx"
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
      "--admin-desktop-grid-alpha: 0.006",
      "--admin-desktop-grid-alpha-strong: 0.008",
      "--admin-canvas-gutter: 24px",
      "--admin-canvas-gutter-mobile: 12px",
      "--admin-canvas-max-width: 1520px",
      "--admin-statusbar-height: 64px",
      "--admin-mobile-nav-height: 58px",
      "--admin-mobile-nav-width: 960px",
      "--admin-app-icon-size: 34px",
      "--admin-sidebar-route-icon-size: 32px",
      "--admin-sidebar-width: 240px",
      "--admin-sidebar-offset: 0px",
      "--admin-sidebar-gap: 0px",
      "--admin-plugin-grid-min: 260px",
      "--admin-plugin-grid-row-unit: 32px",
      "--admin-plugin-gap: 16px",
      "--admin-plugin-padding: 15px",
      "--admin-plugin-header-gap: 12px",
      "--admin-plugin-small-height: 128px",
      "--admin-plugin-medium-height: 168px",
      "--admin-plugin-large-height: 216px",
      "--admin-plugin-height-tall: 252px",
      "--admin-plugin-screen-max-height: min(680px",
      "--admin-plugin-screen-max-height-mobile: clamp(280px",
      "--admin-plugin-field-height: 26px",
      "--admin-plugin-field-gap: 6px",
      "--admin-radius-control: 10px",
      "--admin-radius-panel: 12px",
      "--admin-radius-card: 12px",
      "--admin-radius-chrome: 16px",
      "--admin-radius-floating: 12px",
      "--admin-radius-icon: 8px",
      "--admin-density-compact-card-padding: 12px",
      "--admin-density-normal-card-padding: 16px",
      "--admin-density-spacious-card-padding: 20px",
      "--admin-touch-target-min: 44px",
      "--admin-touch-target-comfortable: 48px",
      "--admin-control-height: var(--admin-touch-target-min)",
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
    expect(adminOsStyles).not.toMatch(/outline:\s*(?:none|0)\s*;/);
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
      "--admin-radius-panel",
      "--admin-radius-card",
      "--admin-radius-chrome",
      "--admin-radius-floating",
      "--admin-radius-tile",
      "--admin-radius-icon",
      "--admin-density-compact-card-padding",
      "--admin-density-normal-card-padding",
      "--admin-density-spacious-card-padding",
      "--admin-touch-target-min",
      "--admin-touch-target-comfortable",
      "--admin-shadow-chrome",
      "--admin-shadow-chrome-2k",
      "--admin-shadow-floating",
      "--admin-shadow-floating-2k",
      "--admin-shadow-plugin-rest",
      "--admin-shadow-plugin-hover",
      "--admin-shadow-panel",
      "--admin-shadow-popover",
      "--admin-canvas-grid-size",
      "--admin-noise-opacity",
      "--admin-canvas-max-width",
      "--admin-canvas-gutter",
      "--admin-canvas-gutter-mobile",
      "--admin-statusbar-height",
      "--admin-statusbar-padding-x",
      "--admin-mobile-nav-height",
      "--admin-mobile-nav-bottom",
      "--admin-mobile-nav-width",
      "--admin-mobile-nav-padding",
      "--admin-mobile-nav-gap",
      "--admin-sidebar-offset",
      "--admin-sidebar-gap",
      "--admin-app-icon-size",
      "--admin-sidebar-route-icon-size",
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
    expect(selectorBlock(".admin-shell::after")).toContain("display: none");
    expect(selectorBlock(":root")).toContain("--admin-sidebar-width: 240px");
    expect(selectorBlock(":root")).toContain("--admin-mobile-nav-width: 960px");
    expect(selectorBlock(":root")).toContain("--admin-shadow-floating-2k: 0 12px 28px");
    expect(selectorBlock(".app-sidebar")).toContain("width: var(--admin-sidebar-width)");
    expect(selectorBlock(".app-sidebar")).toContain("top: var(--admin-sidebar-offset)");
    expect(selectorBlock(".app-sidebar")).toContain("bottom: var(--admin-sidebar-offset)");
    expect(selectorBlock(".app-sidebar")).toContain("background: #0f172a");
    expect(selectorBlock(".app-sidebar")).toContain("border: 0");
    expect(selectorBlock(".app-sidebar")).toContain("box-shadow: none");
    expect(selectorBlock(".app-sidebar")).toContain("flex-direction: column");
    expect(selectorBlock(".app-sidebar")).toContain("box-shadow: none");
    expect(selectorBlock(".app-sidebar::before")).toContain("display: none");
    expect(selectorBlock(".app-sidebar > *")).toContain("z-index: 1");
    expect(selectorBlock(".app-sidebar")).toContain("position: fixed");
    expect(selectorBlock(".admin-main")).toContain("margin-left: calc(var(--admin-sidebar-offset) + var(--admin-sidebar-width) + var(--admin-sidebar-gap))");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-surface)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-border)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-shadow)");
    expect(selectorBlock(".top-bar")).toContain("var(--admin-statusbar-height)");
    expect(selectorBlock(".top-bar")).toContain("position: sticky");
    expect(selectorBlock(":root")).toContain("--admin-statusbar-height: 64px");
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
    expect(selectorBlock(".state-feedback")).toContain("min-width: 0");
    expect(selectorBlock(".operator-account-summary")).toContain("var(--admin-radius-pill)");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".operator-account-avatar")).toContain("background: #0891b2");
    expect(styles).not.toContain(".admin-blueprint-page-tools");
    expect(styles).not.toContain(".admin-blueprint-module-count");
    expect(styles).not.toContain(".admin-blueprint-console-header");
    expect(styles).not.toContain(".admin-blueprint-status-grid");
    expect(styles).not.toContain(".admin-blueprint-status-card");
    expect(styles).not.toContain(".admin-blueprint-disclosure");
    expect(styles).not.toContain(".admin-blueprint-module-notes");
    expect(styles).not.toContain(".admin-blueprint-module-contract");
    expect(styles).not.toContain(".admin-blueprint-next-step");
    expect(styles).not.toContain(".workbench-container-card");
    expect(styles).not.toContain(".workbench-layer-map");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("grid-auto-flow: row");
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("grid-auto-rows: auto");
    expect(styles).not.toContain(".admin-blueprint-workspace-toolbar");
    expect(styles).not.toContain(".admin-blueprint-window-tool");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("grid-auto-rows: max-content");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("align-content: start");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("max-block-size: var(--admin-plugin-screen-max-height)");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("overflow-y: auto");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("overscroll-behavior: contain");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("scrollbar-gutter: stable");
    expect(selectorBlock(".admin-blueprint-module-panel[data-size-preset=\"compact\"]")).toContain("min-height: var(--admin-plugin-small-height)");
    expect(selectorBlock(".admin-blueprint-module-panel[data-size-preset=\"standard\"]")).toContain("min-height: var(--admin-plugin-medium-height)");
    expect(selectorBlock(".admin-blueprint-module-panel[data-size-preset=\"wide\"]")).toContain("grid-column: span 2");
    expect(selectorBlock(".admin-blueprint-module-panel[data-size-preset=\"full\"]")).toContain("grid-column: 1 / -1");
    expect(selectorBlock(".admin-blueprint-module-panel-head")).toContain("display: flex");
    expect(selectorBlock(".admin-blueprint-panel-tool-trigger")).toContain("display: inline-grid");
    expect(selectorBlock(".admin-blueprint-panel-tool-trigger")).toContain("width: var(--admin-touch-target-min)");
    expect(selectorBlock(".admin-blueprint-panel-tool-trigger")).toContain("height: var(--admin-touch-target-min)");
    expect(selectorBlock(".admin-blueprint-panel-tool-trigger:hover")).toContain("var(--workbench-category-bg");
    expect(selectorBlock(".admin-blueprint-panel-preset-controls")).toContain("display: inline-flex");
    expect(selectorBlock(".admin-blueprint-panel-preset-button[aria-pressed=\"true\"]")).toContain("background: var(--workbench-category-bg");
    expect(selectorBlock(".admin-blueprint-panel-field-count")).toContain("display: inline-grid");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("background: transparent");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("border: 0");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("max-block-size: none");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"] .admin-blueprint-panel-tool-trigger-floating")).toContain("position: absolute");
    expect(styles).not.toContain(".admin-blueprint-card-menu");
    expect(styles).not.toContain(".admin-blueprint-card-tool-trigger");
    expect(styles).not.toContain(".admin-blueprint-module-card");
    expect(styles).not.toContain(".admin-blueprint-card-inline-tools");
    expect(styles).not.toContain(".admin-blueprint-icon-switch");
    expect(styles).not.toContain(".admin-blueprint-card-drag-handle");
    expect(styles).not.toContain("admin-blueprint-card-resize");
    expect(styles).not.toContain("admin-blueprint-module-card-resizing");
    expect(styles).not.toContain("--admin-plugin-resize-handle");
  });

  test("keeps subpage plugin layouts within the Figma viewport protocol", () => {
    expect(selectorBlock(".admin-blueprint-subpage-button")).toContain("min-height: 64px");
    expect(selectorBlock(".admin-blueprint-subpage-button")).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(selectorBlock(".admin-blueprint-subpage-description")).toContain("text-overflow: ellipsis");
    expect(selectorBlock(".admin-blueprint-subpage-description")).toContain("white-space: nowrap");
    expect(selectorBlock(".admin-blueprint-page[data-subpage-mode=\"true\"] .admin-blueprint-module-board"))
      .toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(selectorBlock(".admin-blueprint-page[data-subpage-mode=\"true\"] [data-module-nav-id=\"usage-ledger\"]"))
      .toContain("min-height: 0");
    expect(selectorBlock(".admin-blueprint-page[data-subpage-mode=\"true\"] .admin-blueprint-module-panel[data-size-preset=\"standard\"]"))
      .toContain("block-size: var(--admin-plugin-height-tall)");
    expect(selectorBlock(".admin-blueprint-page[data-subpage-mode=\"true\"] .admin-blueprint-module-panel[data-size-preset=\"standard\"]"))
      .toContain("max-block-size: var(--admin-plugin-height-tall)");
    expect(selectorBlock(".admin-blueprint-page[data-subpage-mode=\"true\"] .admin-blueprint-module-panel[data-size-preset=\"full\"]"))
      .toContain("block-size: min(520px, var(--admin-plugin-screen-max-height))");
  });

  test("keeps design-draft module containers visually typed and scannable", () => {
    expect(selectorBlock(".workbench-category-pill")).toContain("background: transparent");
    expect(selectorBlock(".workbench-category-pill::before")).toContain("background: currentColor");
    expect(selectorBlock(".workbench-category-monitoring")).toContain("--workbench-category-color: #2563eb");
    expect(selectorBlock(".admin-blueprint-module-title small")).toContain("text-overflow: ellipsis");
    expect(selectorBlock(".admin-blueprint-module-title small")).toContain("font-size: 12px");
    expect(selectorBlock(".admin-blueprint-module-title h3")).toContain("word-break: normal");
    expect(styles).not.toContain(".admin-figma-panel-description");
    expect(styles).not.toContain(".admin-blueprint-panel-fields");
    expect(styles).not.toContain(".admin-fixture-preview-safety");
    expect(selectorBlock(".admin-blueprint-module-panel-meta")).toContain("justify-content: flex-end");
    expect(selectorBlock(".admin-fixture-preview")).toContain("display: grid");
    expect(selectorBlock(".admin-fixture-preview-row")).toContain("grid-template-columns: minmax(120px, 0.34fr) minmax(0, 1fr)");
    expect(selectorBlock(".admin-fixture-preview-banner")).toContain("var(--admin-info-bg)");
    expect(selectorBlock(".admin-overview-metric-grid")).toContain("repeat(4, minmax(0, 1fr))");
    expect(styles).not.toContain(".admin-overview-metric-card");
    expect(selectorBlock(".admin-overview-section-card")).toContain("min-height: 520px");
    expect(selectorBlock(".admin-overview-section-card")).toContain("align-content: start");
    expect(styles).toMatch(/^\.admin-overview-action-card\s*\{[\s\S]*text-align: left;/m);
    expect(selectorBlock(".admin-overview-table-row")).toContain("grid-template-columns: minmax(0, 1fr) minmax(96px, 0.5fr) minmax(132px, 0.7fr)");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("border: 1px dashed");
    expect(styles).not.toContain(".admin-blueprint-card-switches");
    expect(styles).not.toContain(".admin-blueprint-module-dock");
    expect(styles).not.toContain(".admin-blueprint-switch");
    expect(styles).not.toContain(".admin-blueprint-module-card-pinned");
    expect(styles).not.toContain(".admin-blueprint-module-card-compact");
    expect(styles).not.toContain(".admin-blueprint-module-gate");
    expect(styles).not.toContain(".admin-blueprint-library-next");
    expect(styles).not.toContain("--admin-library-");
    expect(styles).not.toContain(".nav-library-");
    expect(styles).not.toContain(".nav-planned-menu");
    expect(styles).not.toContain(".nav-planned-list");
  });

  test("keeps page source status badges responsive", () => {
    expect(selectorBlock(".page-header-status-stack")).toContain("flex-wrap: wrap");
    expect(selectorBlock(".data-source-badge")).toContain("min-width: 220px");
    expect(styles).toContain(".page-header-status-stack .data-source-badge");
  });

  test("keeps system search and account chrome compact", () => {
    expect(selectorBlock(".top-bar-search")).toContain("width: min(420px, 42vw)");
    expect(selectorBlock(".top-bar-search input")).toContain("min-height: var(--admin-control-height)");
    expect(selectorBlock(".search-box input")).toContain("min-height: var(--admin-control-height)");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".operator-account-copy small")).toContain("white-space: nowrap");
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.top-bar-search\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.top-bar-actions > \.dashboard-status-badge\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.operator-account-summary\s*\{[\s\S]*width: var\(--admin-touch-target-min\);/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.operator-account-summary > svg,[\s\S]*\.operator-account-copy\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-module-panel-meta\s*\{[\s\S]*justify-items: start;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-page\s*\{[\s\S]*gap: 12px;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-page-hero\s*\{[\s\S]*gap: 6px;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-fixture-preview-banner p\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-module-panel\s*\{[\s\S]*max-block-size: var\(--admin-plugin-screen-max-height-mobile\);/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-page\[data-page\] \[data-module-nav-id\] \.admin-fixture-preview-row\s*\{[\s\S]*min-height: 0;/m);
    expect(styles).toMatch(/@media \(max-width: 980px\) \{[\s\S]*\.admin-blueprint-module-panel-head\s*\{[\s\S]*display: flex;/m);
  });

  test("keeps interactive admin controls visually consistent", () => {
    expect(selectorBlock(".nav-item")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".nav-item")).toContain("display: inline-flex");
    expect(selectorBlock(".nav-item-icon")).toContain("width: 0");
    expect(selectorBlock(".nav-primary-list")).toContain("display: flex");
    expect(selectorBlock(".nav-app-icon")).toContain("background: var(--nav-app-a)");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-radius-icon)");
    expect(selectorBlock(".nav-app-icon")).toContain("0 0 0 1px rgba(255, 255, 255, 0.32)");
    expect(selectorBlock(".nav-app-icon::after")).toContain("display: none");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-app-icon-size)");
    expect(selectorBlock(".nav-app-icon svg")).toContain("position: relative");
    expect(selectorBlock(".nav-app-tone-emerald")).toContain("--nav-app-a: #059669");
    expect(selectorBlock(".nav-app-tone-indigo")).toContain("--nav-app-a: #4f46e5");
    expect(selectorBlock(".nav-route-icon")).toContain("var(--admin-sidebar-route-icon-size)");
    expect(selectorBlock(".nav-item-icon.nav-route-icon svg")).toContain("width: 16px");
    expect(selectorBlock(".nav-item-icon.nav-route-icon svg")).toContain("height: 16px");
    expect(selectorBlock(".sidebar-safety-summary")).toContain("min-height: 102px");
    expect(styles).toMatch(/\.nav-item-active\s*\{[\s\S]*box-shadow: none;/m);
    expect(selectorBlock(".nav-item")).toContain("transition:");
    expect(selectorBlock(".environment-pill,\n.protected-console,\n.icon-button")).toContain("min-height: var(--admin-control-height)");
    expect(selectorBlock(".icon-button,\n.protected-console,\n.console-tools-summary")).toContain("width: var(--admin-touch-target-min)");
    expect(selectorBlock(".operator-account-summary")).toContain("min-height: var(--admin-touch-target-min)");
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

  test("keeps admin touch targets on the grammar minimum token", () => {
    [
      ".nav-item",
      ".top-bar-search",
      ".operator-account-summary",
      ".top-search-shell",
      ".top-search-shell .search-box",
      ".environment-pill,\n.protected-console,\n.icon-button",
      ".icon-button,\n.protected-console,\n.console-tools-summary",
      ".top-menu-action",
      ".page-subnav-link",
      ".admin-blueprint-panel-tool-trigger",
      ".channel-status-filter",
      ".object-timeline-tab"
    ].forEach((selector) => {
      const block = selectorBlock(selector);
      expect(block).not.toMatch(/(?:min-height|height|width|min-width):\s*(?:3[0-9]|4[0-3])px/);
    });

    expect(selectorBlock(".admin-blueprint-panel-tool-trigger")).toContain("width: var(--admin-touch-target-min)");
    expect(selectorBlock(".admin-blueprint-panel-tool-trigger")).toContain("height: var(--admin-touch-target-min)");
    expect(selectorBlock(".page-subnav-link")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".channel-status-filter")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".object-timeline-tab")).toContain("min-height: var(--admin-touch-target-min)");
  });

  test("keeps dense New Admin tables and safe refs mobile-safe", () => {
    expect(selectorBlock(".new-console-table")).toContain("overflow-x: auto");
    expect(selectorBlock(".new-console-row")).toContain("min-width: min(100%, 720px)");
    expect(selectorBlock(".new-console-state-stale")).toContain("var(--admin-warning-bg)");
    expect(selectorBlock(".new-console-state-cell small,\n.new-console-state-feedback p")).toContain("var(--admin-muted)");
    expect(selectorBlock(".mono-ref")).toContain("max-width: 100%");
    expect(selectorBlock(".mono-ref")).toContain("overflow-wrap: anywhere");
    expect(styles).toMatch(/@media \(max-width: 520px\) \{[\s\S]*\.new-console-row-head\s*\{\s*display: none;/m);
  });

  test("keeps account and connection detail popovers closed until opened", () => {
    expect(styles).toMatch(/\.operator-account-menu:not\(\[open\]\)\s*>\s*\.operator-account-popover,[\s\S]*\.connection-widget:not\(\[open\]\)\s*>\s*\.connection-widget-popover\s*\{\s*display: none;/m);
  });

  test("keeps page-local subnavigation and usage charts mobile-safe", () => {
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.page-subnav-scroll\s*\{[\s\S]*flex-wrap: wrap;[\s\S]*overflow-x: visible;/m);
    expect(selectorBlock(".page-subnav-scroll")).toContain("flex-wrap: wrap");
    expect(selectorBlock(".page-subnav-link")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".page-subnav-card-head")).toContain("grid-template-columns: auto minmax(0, 1fr)");
    expect(selectorBlock(".page-subnav-marker")).toContain("var(--admin-accent)");
    expect(selectorBlock(".page-subnav-mode")).toContain("var(--admin-neutral-bg)");
    expect(selectorBlock(".overview-next-action")).toContain("inset 3px 0 0 transparent");
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.usage-timeseries-layout\s*\{[\s\S]*grid-template-columns: 1fr;/m);
    expect(selectorBlock(".usage-chart-panel")).toContain("overflow: hidden");
    expect(selectorBlock(".usage-chart-svg")).toContain("overflow: hidden");
  });

  test("keeps the mobile admin shell focused on active navigation and compact actions", () => {
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.top-bar-actions\s*\{[\s\S]*display: flex;[\s\S]*flex-wrap: wrap;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.operator-account-summary\s*\{[\s\S]*min-height: var\(--admin-touch-target-min\);/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.app-sidebar\s*\{[\s\S]*bottom: 8px;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.nav-primary-list\s*\{[\s\S]*display: flex;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.nav-primary-list\s*\{[\s\S]*flex: 1 1 auto;[\s\S]*width: auto;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.nav-list\s*\{[\s\S]*gap: var\(--admin-mobile-nav-gap\);/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-summary\s*\{[\s\S]*min-height: var\(--admin-touch-target-min\);/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-summary span,[\s\S]*\.sidebar-safety-summary strong\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-detail\s*\{[\s\S]*display: none;/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-summary svg:first-of-type\s*\{[\s\S]*display: block;/m);
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
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("background: #ffffff");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("contain: layout paint");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("box-shadow: none");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("backdrop-filter: none");
    expect(styles).toContain('min-height: min(680px, var(--admin-plugin-screen-max-height))');
    expect(selectorBlock(".admin-blueprint-module-panel::before")).toContain("width: 0");
    expect(selectorBlock(".admin-blueprint-module-panel::before")).toContain("background: var(--admin-plugin-accent)");
    expect(selectorBlock(".admin-blueprint-module-panel:hover")).toContain("border-color: var(--workbench-category-border");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("background: var(--admin-surface-muted)");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("box-shadow: none");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).not.toContain("radial-gradient");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).not.toContain("inset 0 1px");
  });

  test("keeps portal and public entrypoint pixel regressions contained", () => {
    expect(selectorBlock(".portal-traffic-meter")).toContain("background: #eef2f7");
    expect(selectorBlock(".portal-traffic-meter span")).toContain("min-width: 4px");
    expect(selectorBlock(".portal-traffic-meter span")).toContain("linear-gradient(90deg, #2563eb, #14b8a6)");
    expect(styles).not.toMatch(/rgb\([^)]*\/[^)]*\)/);

    expect(selectorBlock(".site-orbit")).not.toContain("filter: blur(1px)");
    expect(selectorBlock(".site-terminal-card span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-section-heading span,\n.company-site-band span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-effect-copy span")).toContain("letter-spacing: 0");
    expect(selectorBlock(".company-site-workflow-header span")).toContain("font-weight: 800");
    expect(selectorBlock(".site-effect-step span")).toContain("font-weight: 800");
    expect(publicSiteStyles).not.toContain("font-weight: 900");
    expect(publicSiteStyles).not.toMatch(/letter-spacing:\s*0\.0[6-8]em/);
    expect(responsiveStyles).toMatch(/\.site-effect-flow,[\s\S]*\.site-orbit,[\s\S]*\.site-terminal-card:hover/);
    expect(selectorBlock(".company-site-footer .company-site-footer-bottom span:first-child")).toContain("color: inherit");
    expect(selectorBlock(".company-site-footer .company-site-footer-bottom span:first-child")).toContain("font-weight: 600");
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-intake\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-intake-panel\s*\{[\s\S]*padding: 28px 20px;/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-form-grid\s*\{[\s\S]*grid-template-columns: 1fr;/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-faq\s*\{[\s\S]*padding: 64px 20px;/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-faq-grid\s*\{[\s\S]*grid-template-columns: 1fr;/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-footer\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/m);
    expect(styles).toMatch(/@media \(max-width: 768px\) \{[\s\S]*\.company-site-footer-links\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: 1fr;/m);

    expect(faviconSvg).toContain("GCC WebOS secure access");
    expect(faviconSvg).toContain("<circle cx=\"32\" cy=\"32\"");
    expect(faviconSvg).not.toContain("M18 22h15");
  });
});
