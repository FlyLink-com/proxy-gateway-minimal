import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const styles = readCssWithImports("src/styles.css");
const visualPolishStyles = readCssWithImports("src/styles/admin-os-visual-polish.css");
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
  return selectorBlockFrom(styles, selector);
}

function selectorBlockFrom(css: string, selector: string) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m");
  return css.match(pattern)?.[1] ?? "";
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
      "--admin-radius-control: 8px",
      "--admin-radius-panel: 8px",
      "--admin-radius-card: 8px",
      "--admin-radius-chrome: 14px",
      "--admin-radius-floating: 18px",
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
    expect(selectorBlock(":root")).not.toContain("--admin-library-");
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
    expect(selectorBlock(".admin-blueprint-module-board")).toContain("align-items: start");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] .admin-blueprint-module-board")).toContain("repeat(3, minmax(0, 1fr))");
    expect(styles).not.toContain(".admin-blueprint-workspace-toolbar");
    expect(styles).not.toContain(".admin-blueprint-window-tool");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("var(--workbench-category-color");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("grid-template-columns: minmax(0, 1fr)");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("grid-auto-rows: max-content");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("align-content: start");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("max-block-size: none");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("overflow: visible");
    expect(selectorBlock(".admin-blueprint-module-panel")).not.toContain("overflow-y: auto");
    expect(selectorBlock(".admin-blueprint-module-panel")).not.toContain("overscroll-behavior: contain");
    expect(selectorBlock(".admin-blueprint-module-panel")).not.toContain("scrollbar-gutter: stable");
    expect(selectorBlock(".admin-blueprint-module-panel-head")).toContain("display: flex");
    expect(selectorBlock(".admin-blueprint-panel-field-count")).toContain("display: inline-grid");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("background: transparent");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("border: 0");
    expect(selectorBlock(".admin-blueprint-module-panel[data-chrome=\"operator\"]")).toContain("max-block-size: none");
    expect(styles).not.toContain(".admin-blueprint-panel-tool-trigger");
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

  test("keeps the Figma Visual Polish background quiet and tokenized", () => {
    const shellBlock = selectorBlockFrom(visualPolishStyles, ".admin-shell");
    const sceneGridBlock = selectorBlockFrom(visualPolishStyles, ".admin-shell::before");

    [
      "--admin-scene-bg-top",
      "--admin-scene-bg-mid",
      "--admin-scene-bg-bottom",
      "--admin-scene-grid-line",
      "--admin-scene-grid-opacity",
      "--admin-scene-ambient-blue",
      "--admin-scene-ambient-cyan",
      "--admin-scene-glass",
      "--admin-scene-border",
      "--admin-scene-border-strong"
    ].forEach((token) => {
      expect(shellBlock).toContain(token);
    });

    expect(shellBlock).toContain("--admin-scene-bg-top: #152a60");
    expect(shellBlock).toContain("--admin-scene-bg-mid: #23478f");
    expect(shellBlock).toContain("--admin-scene-bg-bottom: #3261ae");
    expect(shellBlock).toContain("--admin-scene-glass: rgba(255, 255, 255, 0.18)");
    expect(shellBlock).toContain("--admin-scene-border: rgba(255, 255, 255, 0.28)");
    expect(shellBlock).toContain("--admin-scene-border-strong: rgba(255, 255, 255, 0.35)");
    expect(shellBlock).toContain("--admin-success-bg: rgba(74, 222, 128, 0.15)");
    expect(shellBlock).toContain("--admin-info-bg: rgba(96, 165, 250, 0.15)");
    expect(shellBlock).toContain("--admin-warning-bg: rgba(251, 191, 36, 0.15)");
    expect(shellBlock).toContain("--admin-danger-bg: rgba(242, 89, 89, 0.15)");
    expect(shellBlock).toContain("var(--admin-scene-bg-top)");
    expect(shellBlock).toContain("var(--admin-scene-bg-mid)");
    expect(shellBlock).toContain("var(--admin-scene-bg-bottom)");
    expect(sceneGridBlock).toContain("var(--admin-scene-grid-line)");
    expect(sceneGridBlock).toContain("opacity: var(--admin-scene-grid-opacity)");
    expect(sceneGridBlock).not.toContain("rgba(255, 255, 255, 0.035) 1px");
    expect(sceneGridBlock).not.toContain("opacity: 1");
  });

  test("keeps the Figma Visual Polish shell navigation and top bar geometry", () => {
    const sidebarBlock = selectorBlockFrom(visualPolishStyles, ".app-sidebar");
    const brandMarkBlock = selectorBlockFrom(visualPolishStyles, ".brand-mark");
    const navListBlock = selectorBlockFrom(visualPolishStyles, ".nav-list");
    const navListFocusBlock = selectorBlockFrom(visualPolishStyles, ".nav-list:focus-visible");
    const navListScrollbarBlock = selectorBlockFrom(visualPolishStyles, ".nav-list::-webkit-scrollbar");
    const navItemBlock = selectorBlockFrom(visualPolishStyles, ".nav-item,\n.nav-item-planned,\n.nav-item-planned:disabled");
    const navIconBlock = selectorBlockFrom(visualPolishStyles, ".nav-item-icon,\n.nav-item-icon.nav-route-icon");
    const activeNavIconBlock = selectorBlockFrom(visualPolishStyles, ".nav-item-active .nav-item-icon,\n.nav-item-active .nav-item-icon.nav-route-icon");
    const plannedNavIconBlock = selectorBlockFrom(visualPolishStyles, ".nav-item-planned .nav-item-icon,\n.nav-item-planned .nav-item-icon.nav-route-icon");
    const topBarBlock = selectorBlockFrom(visualPolishStyles, ".top-bar");
    const searchBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-search");
    const searchIconBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-search svg");
    const searchInputBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-search input");
    const actionsBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-actions");
    const topBarBadgeBlock = selectorBlockFrom(visualPolishStyles, ".top-bar .dashboard-status-badge,\n.top-bar-notification-indicator,\n.operator-account-summary");
    const notificationBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-notification-indicator");
    const notificationDotBlock = selectorBlockFrom(visualPolishStyles, ".top-bar-notification-dot");
    const operatorMenuBlock = selectorBlockFrom(visualPolishStyles, ".operator-account-menu");

    expect(sidebarBlock).toContain("width: 224px");
    expect(sidebarBlock).toContain("height: 100vh");
    expect(sidebarBlock).toContain("height: 100dvh");
    expect(sidebarBlock).toContain("max-height: 100dvh");
    expect(sidebarBlock).toContain("padding: 28px 20px 32px");
    expect(sidebarBlock).toContain("overflow: hidden");
    expect(visualPolishStyles).not.toContain(".app-sidebar::after");
    expect(visualPolishStyles).not.toContain(".workspace-sidebar-scrollport");
    expect(brandMarkBlock).toContain("display: none");
    expect(navListBlock).toContain("display: flex");
    expect(navListBlock).toContain("flex: 1 1 auto");
    expect(navListBlock).toContain("flex-direction: column");
    expect(navListBlock).toContain("width: 100%");
    expect(navListBlock).toContain("gap: 96px");
    expect(navListBlock).toContain("min-height: 0");
    expect(navListBlock).toContain("overflow-y: auto");
    expect(navListBlock).toContain("overflow-x: hidden");
    expect(navListBlock).toContain("overscroll-behavior: contain");
    expect(navListBlock).toContain("scrollbar-width: none");
    expect(navListBlock).not.toContain("scrollbar-gutter: stable");
    expect(navListFocusBlock).toContain("outline: 1px solid rgba(147, 197, 253, 0.7)");
    expect(navListFocusBlock).toContain("outline-offset: 4px");
    expect(navListScrollbarBlock).toContain("width: 0");
    expect(navListScrollbarBlock).toContain("height: 0");
    expect(navItemBlock).toContain("justify-content: flex-start");
    expect(navItemBlock).toContain("width: 100%");
    expect(navIconBlock).toContain("background: #38bdf8");
    expect(activeNavIconBlock).toContain("background: #93c5fd");
    expect(plannedNavIconBlock).toContain("background: #64748b");
    expect(plannedNavIconBlock).toContain("opacity: 0.6");
    expect(topBarBlock).toContain("width: var(--admin-visual-topbar-width)");
    expect(topBarBlock).toContain("max-width: calc(100vw - var(--admin-sidebar-width) - 28px)");
    expect(topBarBlock).toContain("margin: 24px 0 0 28px");
    expect(topBarBlock).toContain("height: var(--admin-statusbar-height)");
    expect(topBarBlock).toContain("grid-template-columns:");
    expect(topBarBlock).toContain("var(--admin-topbar-left-zone-width)");
    expect(topBarBlock).toContain("minmax(var(--admin-topbar-search-min-width), var(--admin-topbar-search-max-width))");
    expect(topBarBlock).toContain("minmax(16px, 1fr)");
    expect(topBarBlock).toContain("var(--admin-topbar-right-cluster-width)");
    expect(topBarBlock).toContain("border: 0.5px solid var(--admin-scene-border-strong)");
    expect(searchBlock).toContain("grid-column: 2");
    expect(searchBlock).toContain("justify-self: stretch");
    expect(searchBlock).toContain("width: 100%");
    expect(searchBlock).toContain("max-width: var(--admin-topbar-search-max-width)");
    expect(searchBlock).toContain("min-width: 0");
    expect(searchBlock).toContain("display: flex");
    expect(searchBlock).toContain("gap: var(--admin-topbar-search-placeholder-gap)");
    expect(searchBlock).toContain("overflow: hidden");
    expect(searchIconBlock).toContain("flex: 0 0 var(--admin-topbar-search-icon-size)");
    expect(searchInputBlock).toContain("width: 100%");
    expect(searchInputBlock).toContain("min-width: 0");
    expect(searchInputBlock).toContain("overflow: hidden");
    expect(searchInputBlock).toContain("text-overflow: ellipsis");
    expect(searchInputBlock).toContain("white-space: nowrap");
    expect(actionsBlock).toContain("grid-column: 4");
    expect(actionsBlock).toContain("width: var(--admin-topbar-right-cluster-width)");
    expect(actionsBlock).toContain("var(--admin-topbar-action-pill-width)");
    expect(actionsBlock).toContain("var(--admin-topbar-notification-size)");
    expect(actionsBlock).toContain("gap: var(--admin-topbar-action-gap)");
    expect(topBarBadgeBlock).toContain("background: rgba(255, 255, 255, 0.12)");
    expect(notificationBlock).toContain("width: var(--admin-topbar-notification-size)");
    expect(notificationBlock).toContain("background: rgba(255, 255, 255, 0.1)");
    expect(notificationBlock).toContain("position: relative");
    expect(notificationDotBlock).toContain("width: 8px");
    expect(notificationDotBlock).toContain("height: 8px");
    expect(notificationDotBlock).toContain("background: #4ade80");
    expect(notificationDotBlock).toContain("box-shadow: none");
    expect(operatorMenuBlock).toContain("width: var(--admin-topbar-action-pill-width)");
    expect(topBarBlock).toContain("backdrop-filter: blur(40px)");
    expect(topBarBlock).toContain("0 8px 16px rgba(0, 10, 51, 0.18)");
  });

  test("keeps the Figma Visual Polish card layout geometry tokenized", () => {
    const shellBlock = selectorBlockFrom(visualPolishStyles, ".admin-shell");
    const metricGridBlock = selectorBlockFrom(visualPolishStyles, ".admin-overview-metric-grid,\n.ops-metric-grid");
    const metricCardBlock = selectorBlockFrom(visualPolishStyles, ".ops-metric-card,\n.admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-metric-grid .ops-metric-card");
    const routedPageStackBlock = selectorBlockFrom(
      visualPolishStyles,
      ".admin-blueprint-page[data-page=\"portalRequests\"],\n.admin-blueprint-page[data-page=\"usageMonitor\"]"
    );
    const moduleBoardBlock = selectorBlockFrom(visualPolishStyles, ".admin-blueprint-module-board");
    const routedModuleBoardBlock = selectorBlockFrom(
      visualPolishStyles,
      ".admin-blueprint-page[data-page=\"dashboard\"] .admin-blueprint-module-board,\n.admin-blueprint-page[data-page=\"portalRequests\"] .admin-blueprint-module-board,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-blueprint-module-board"
    );
    const dashboardHealthSummaryBlock = selectorBlockFrom(visualPolishStyles, ".admin-blueprint-page[data-page=\"dashboard\"] [data-module-nav-id=\"health-summary\"]");
    const modulePanelBlock = selectorBlockFrom(visualPolishStyles, ".admin-blueprint-module-panel,\n.admin-blueprint-module-panel[data-chrome=\"operator\"]");
    const evidenceGridBlock = selectorBlockFrom(visualPolishStyles, ".admin-blueprint-lower-evidence-grid");
    const pageOwnedEvidenceGridBlock = selectorBlockFrom(
      visualPolishStyles,
      ".admin-blueprint-page[data-page=\"portalRequests\"] .admin-blueprint-lower-evidence-grid,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-blueprint-lower-evidence-grid"
    );
    const evidencePanelBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-panel");
    const evidenceChartPanelBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-panel-chart");
    const evidenceLogPanelBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-panel-log");
    const evidenceChartHeaderBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-header");
    const evidenceChartTitleBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-title h2");
    const evidenceChartLegendBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-legend");
    const evidenceChartLegendItemBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-legend > span");
    const evidenceChartLegendDotBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-legend i");
    const evidenceChartBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart");
    const evidenceChartShellBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-shell");
    const evidenceTimeRangeBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-time-range");
    const evidenceTimeRangeItemBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-time-range > *");
    const evidenceAxisBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-axis");
    const evidenceAxisItemBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-axis > *");
    const evidenceChartGridLineBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-grid line");
    const evidenceChartAxesBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-axes");
    const evidenceChartAxisLineBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-axis-line");
    const evidenceChartAxisTickBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-axis-tick");
    const evidenceChartYLabelBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-y-label");
    const evidenceChartLineBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-chart-line");
    const evidenceLogListBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-log-list");
    const evidenceLogEntryBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-log-entry");
    const evidenceLogTitleBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-log-entry strong");
    const evidenceLogDetailBlock = selectorBlockFrom(visualPolishStyles, ".admin-evidence-log-entry p");
    const metricStatusChipBlock = selectorBlockFrom(
      visualPolishStyles,
      ".ops-metric-card > .dashboard-status-badge,\n.admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-metric-grid .ops-metric-card > .dashboard-status-badge"
    );
    const statusChipBlock = selectorBlockFrom(visualPolishStyles, ".dashboard-status-badge[data-figma-component=\"StatusChip\"]");
    const statusChipDotBlock = selectorBlockFrom(
      visualPolishStyles,
      ".dashboard-status-badge[data-figma-component=\"StatusChip\"]::before,\n.top-bar .dashboard-status-success::before"
    );
    const successChipDotBlock = selectorBlockFrom(
      visualPolishStyles,
      ".dashboard-status-success[data-figma-component=\"StatusChip\"]::before,\n.top-bar .dashboard-status-success::before"
    );
    const sharedCompactRowBlock = selectorBlockFrom(
      visualPolishStyles,
      ".admin-blueprint-page[data-page=\"dashboard\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"portalRequests\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-compact-data-row"
    );

    [
      "--admin-visual-design-width: 1600px",
      "--admin-visual-topbar-width: 1296px",
      "--admin-status-chip-height: 24px",
      "--admin-status-chip-min-width: 72px",
      "--admin-topbar-left-zone-width: 385px",
      "--admin-topbar-search-min-width: 230px",
      "--admin-topbar-search-max-width: 379px",
      "--admin-topbar-right-cluster-width: 424px",
      "--admin-visual-metric-card-width: clamp(240px, 18.75vw, 300px)",
      "--admin-visual-metric-card-height: clamp(120px, 9.375vw, 150px)",
      "--admin-visual-metric-gap: clamp(12px, 1vw, 16px)",
      "--admin-visual-panel-width: clamp(332px, 26vw, 416px)",
      "--admin-visual-panel-height: clamp(208px, 16.25vw, 260px)",
      "--admin-visual-panel-gap: clamp(18px, 1.5vw, 24px)",
      "--admin-visual-panel-row-gap: clamp(32px, 3vw, 48px)",
      "--admin-visual-evidence-width: clamp(502px, 39.25vw, 628px)",
      "--admin-visual-evidence-height: clamp(224px, 17.5vw, 280px)",
      "--admin-visual-evidence-gap: clamp(28px, 2.5vw, 40px)",
      "--admin-visual-evidence-top-offset: 12px",
      "--admin-visual-kpi-to-panel-gap: 48px",
      "--admin-visual-panel-to-evidence-gap: 36px",
      "--admin-evidence-chart-line-weight: 2.5",
      "--admin-evidence-time-range-gap: 4px",
      "--admin-evidence-time-range-pill-width: 26px",
      "--admin-evidence-time-range-right-inset: 24px",
      "--admin-evidence-axis-label-gap: 8px",
      "--admin-evidence-axis-left-gutter: 48px"
    ].forEach((expectedToken) => {
      expect(shellBlock).toContain(expectedToken);
    });

    expect(metricGridBlock).toContain("repeat(4, var(--admin-visual-metric-card-width))");
    expect(metricGridBlock).toContain("gap: var(--admin-visual-metric-gap)");
    expect(metricCardBlock).toContain("width: var(--admin-visual-metric-card-width)");
    expect(metricCardBlock).toContain("height: var(--admin-visual-metric-card-height)");
    expect(metricCardBlock).toContain("position: relative");
    expect(metricCardBlock).toContain("border: 0.5px solid var(--admin-scene-border-strong)");
    expect(metricCardBlock).toContain("background: var(--admin-scene-glass)");
    expect(metricCardBlock).toContain("backdrop-filter: blur(40px)");
    expect(metricCardBlock).toContain("0 8px 16px rgba(0, 10, 51, 0.18)");
    expect(statusChipBlock).toContain("min-width: var(--admin-status-chip-min-width)");
    expect(statusChipBlock).toContain("height: var(--admin-status-chip-height)");
    expect(statusChipBlock).toContain("border: 0.5px solid var(--admin-scene-border-strong)");
    expect(statusChipBlock).toContain("backdrop-filter: blur(8px)");
    expect(statusChipDotBlock).toContain("content: \"\"");
    expect(statusChipDotBlock).toContain("opacity: 1");
    expect(statusChipDotBlock).toContain("box-shadow: none");
    expect(successChipDotBlock).toContain("background: #4ade80");
    expect(metricStatusChipBlock).toContain("position: absolute");
    expect(metricStatusChipBlock).toContain("top: 14px");
    expect(metricStatusChipBlock).toContain("right: clamp(18px, 2.25vw, 36px)");
    expect(metricStatusChipBlock).toContain("width: max-content");
    expect(metricStatusChipBlock).toContain("min-width: var(--admin-status-chip-min-width)");
    expect(metricStatusChipBlock).toContain("height: var(--admin-status-chip-height)");
    expect(metricStatusChipBlock).toContain("min-height: var(--admin-status-chip-height)");
    expect(metricStatusChipBlock).toContain("border: 0.5px solid var(--admin-scene-border-strong)");
    expect(metricStatusChipBlock).toContain("backdrop-filter: blur(8px)");
    expect(sharedCompactRowBlock).toContain("min-height: 44px");
    expect(moduleBoardBlock).toContain("grid-template-columns: repeat(3, var(--admin-visual-panel-width))");
    expect(moduleBoardBlock).toContain("column-gap: var(--admin-visual-panel-gap)");
    expect(moduleBoardBlock).toContain("row-gap: var(--admin-visual-panel-row-gap)");
    expect(routedPageStackBlock).toContain("gap: 0");
    expect(routedModuleBoardBlock).toContain("grid-template-columns: repeat(3, var(--admin-visual-panel-width))");
    expect(visualPolishStyles).toContain(
      ".admin-blueprint-page[data-page=\"portalRequests\"] .admin-blueprint-module-board,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-blueprint-module-board {\n  margin-top: var(--admin-visual-kpi-to-panel-gap);\n}"
    );
    expect(visualPolishStyles).toContain(
      ".admin-blueprint-page[data-page=\"usageMonitor\"] .admin-blueprint-module-board {\n  grid-template-columns: repeat(3, minmax(0, 1fr));\n  max-width: var(--admin-visual-topbar-width);"
    );
    expect(
      selectorBlockFrom(
        visualPolishStyles,
        ".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"freshness\"],\n.admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"channel-coverage\"],\n.admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"usage-ledger\"]"
      )
    ).toContain("height: var(--admin-visual-panel-height)");
    expect(dashboardHealthSummaryBlock).toContain("height: var(--admin-visual-metric-card-height)");
    expect(dashboardHealthSummaryBlock).toContain("max-height: var(--admin-visual-metric-card-height)");
    expect(modulePanelBlock).toContain("width: var(--admin-visual-panel-width)");
    expect(modulePanelBlock).toContain("height: var(--admin-visual-panel-height)");
    expect(modulePanelBlock).toContain("box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.18)");
    expect(evidenceGridBlock).toContain("grid-template-columns: repeat(2, var(--admin-visual-evidence-width))");
    expect(evidenceGridBlock).toContain("gap: var(--admin-visual-evidence-gap)");
    expect(evidenceGridBlock).toContain("margin-top: var(--admin-visual-evidence-top-offset)");
    expect(pageOwnedEvidenceGridBlock).toContain("margin-top: var(--admin-visual-panel-to-evidence-gap)");
    expect(evidencePanelBlock).toContain("width: var(--admin-visual-evidence-width)");
    expect(evidencePanelBlock).toContain("height: var(--admin-visual-evidence-height)");
    expect(evidencePanelBlock).toContain("border: 0.5px solid var(--admin-scene-border)");
    expect(evidencePanelBlock).toContain("box-shadow: inset 0 0 0 0.5px rgba(255, 255, 255, 0.18)");
    expect(evidencePanelBlock).not.toContain("0 14px 30px");
    expect(evidenceChartPanelBlock).toContain("gap: 0");
    expect(evidenceChartPanelBlock).toContain("padding: 0");
    expect(evidenceLogPanelBlock).toContain("gap: 10px");
    expect(evidenceLogPanelBlock).toContain("padding: 16px 20px");
    expect(evidenceChartHeaderBlock).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(evidenceChartHeaderBlock).toContain("height: 32px");
    expect(evidenceChartHeaderBlock).toContain("background: rgba(255, 255, 255, 0.08)");
    expect(evidenceChartTitleBlock).toContain("font-size: 11px");
    expect(evidenceChartTitleBlock).toContain("text-overflow: ellipsis");
    expect(evidenceChartLegendBlock).toContain("padding: 5px 44px 0");
    expect(evidenceChartLegendBlock).toContain("gap: 34px");
    expect(evidenceChartLegendItemBlock).toContain("font-size: 9px");
    expect(evidenceChartLegendDotBlock).toContain("background: var(--admin-evidence-tone)");
    expect(evidenceChartBlock).toContain("min-height: 148px");
    expect(evidenceChartBlock).toContain("height: 100%");
    expect(evidenceChartShellBlock).toContain("grid-template-rows: minmax(0, 1fr) auto");
    expect(evidenceChartShellBlock).toContain("flex: 1 1 auto");
    expect(evidenceChartShellBlock).toContain("min-width: 0");
    expect(evidenceChartShellBlock).toContain("padding: 0 12px 8px 0");
    expect(evidenceTimeRangeBlock).toContain("display: grid");
    expect(evidenceTimeRangeBlock).toContain("grid-template-columns: repeat(7, var(--admin-evidence-time-range-pill-width))");
    expect(evidenceTimeRangeBlock).toContain("justify-content: end");
    expect(evidenceTimeRangeBlock).toContain("gap: var(--admin-evidence-time-range-gap)");
    expect(evidenceTimeRangeBlock).toContain("padding-right: var(--admin-evidence-time-range-right-inset)");
    expect(evidenceTimeRangeItemBlock).toContain("width: var(--admin-evidence-time-range-pill-width)");
    expect(evidenceTimeRangeItemBlock).toContain("height: 20px");
    expect(evidenceTimeRangeItemBlock).toContain("min-width: 0");
    expect(evidenceTimeRangeItemBlock).toContain("white-space: nowrap");
    expect(selectorBlockFrom(visualPolishStyles, ".admin-evidence-time-range > :nth-child(4)")).toContain(
      "background: rgba(255, 255, 255, 0.18)"
    );
    expect(evidenceAxisBlock).toContain("grid-template-columns: repeat(6, minmax(0, 1fr))");
    expect(evidenceAxisBlock).toContain("gap: var(--admin-evidence-axis-label-gap)");
    expect(evidenceAxisBlock).toContain("padding-left: var(--admin-evidence-axis-left-gutter)");
    expect(evidenceAxisItemBlock).toContain("text-overflow: ellipsis");
    expect(evidenceAxisItemBlock).toContain("white-space: nowrap");
    expect(evidenceChartGridLineBlock).toContain("stroke: rgba(255, 255, 255, 0.16)");
    expect(evidenceChartGridLineBlock).toContain("stroke-width: 0.75");
    expect(evidenceChartGridLineBlock).toContain("vector-effect: non-scaling-stroke");
    expect(evidenceChartAxesBlock).toContain("pointer-events: none");
    expect(evidenceChartAxisLineBlock).toContain("stroke: rgba(224, 235, 250, 0.62)");
    expect(evidenceChartAxisLineBlock).toContain("stroke-width: 0.75");
    expect(evidenceChartAxisTickBlock).toContain("stroke: rgba(224, 235, 250, 0.62)");
    expect(evidenceChartYLabelBlock).toContain("fill: #bfd1eb");
    expect(evidenceChartYLabelBlock).toContain("font-size: 10px");
    expect(evidenceChartLineBlock).toContain("filter: none");
    expect(evidenceChartLineBlock).toContain("stroke-width: var(--admin-evidence-chart-line-weight)");
    expect(evidenceLogListBlock).toContain("grid-template-rows: repeat(3, minmax(0, 1fr))");
    expect(evidenceLogListBlock).toContain("min-height: 0");
    expect(evidenceLogEntryBlock).toContain("grid-template-columns: 42px 8px minmax(0, 1fr)");
    expect(evidenceLogEntryBlock).toContain("min-height: 0");
    expect(evidenceLogEntryBlock).toContain("overflow: hidden");
    expect(evidenceLogTitleBlock).toContain("white-space: nowrap");
    expect(evidenceLogDetailBlock).toContain("line-height: 14px");
    expect(visualPolishStyles).toMatch(/\.admin-evidence-log-entry p\s*\{[\s\S]*-webkit-line-clamp: 1;/m);
    expect(visualPolishStyles).not.toContain(".admin-evidence-contract-strip");
    expect(visualPolishStyles).not.toContain(".admin-evidence-stat-grid");
    expect(visualPolishStyles).not.toContain("admin-blueprint-page[data-page=\"usageMonitor\"] .admin-evidence-panel-chart");
    expect(visualPolishStyles).toContain("--admin-evidence-tone: #33d480");
    expect(visualPolishStyles).toContain("--admin-evidence-tone: #66a6fa");
    expect(visualPolishStyles).toContain("--admin-evidence-tone: #f59e0d");
    expect(visualPolishStyles).toContain("--admin-evidence-tone: #f25959");
  });

  test("keeps the Figma Visual Polish responsive breakpoint contract explicit", () => {
    expect(visualPolishStyles).toMatch(/@media \(min-width: 1920px\) \{[\s\S]*--admin-visual-metric-card-width: 360px;[\s\S]*--admin-visual-metric-gap: 16px;[\s\S]*--admin-visual-panel-width: 512px;[\s\S]*--admin-visual-evidence-width: 802px;[\s\S]*--admin-visual-topbar-width: 1644px;/m);
    expect(visualPolishStyles).toMatch(/@media \(max-width: 1440px\) and \(min-width: 1281px\) \{[\s\S]*--admin-visual-metric-card-width: 260px;[\s\S]*--admin-visual-panel-width: 360px;[\s\S]*--admin-visual-evidence-width: 574px;[\s\S]*--admin-visual-topbar-width: 1188px;/m);
    expect(visualPolishStyles).toMatch(/@media \(max-width: 1280px\) and \(min-width: 1025px\) \{[\s\S]*--admin-sidebar-width: 64px;[\s\S]*--admin-visual-metric-card-width: 256px;[\s\S]*--admin-visual-panel-width: 360px;[\s\S]*--admin-visual-evidence-width: 564px;[\s\S]*--admin-visual-topbar-width: 1168px;/m);
    expect(visualPolishStyles).toMatch(/@media \(max-width: 1024px\) \{[\s\S]*--admin-content-padding: 24px;[\s\S]*--admin-visual-metric-card-width: 460px;[\s\S]*--admin-visual-panel-width: 470px;[\s\S]*--admin-visual-evidence-width: 976px;[\s\S]*--admin-visual-topbar-width: 976px;/m);
    expect(visualPolishStyles).toMatch(/@media \(max-width: 1024px\) \{[\s\S]*\.admin-overview-metric-grid,[\s\S]*\.ops-metric-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 460px\)\);/m);
    expect(visualPolishStyles).toMatch(/@media \(max-width: 1024px\) \{[\s\S]*\.admin-blueprint-module-board,[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 470px\)\);/m);
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
    expect(selectorBlock(".admin-fixture-preview-banner")).toContain("display: inline-flex");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"collection-anomalies\"] .admin-fixture-preview-rows")).toContain("minmax(min(100%, 220px), 1fr)");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"channel-coverage\"] .admin-fixture-preview-row")).toContain("min-height: 0");
    expect(selectorBlock(".admin-overview-metric-grid")).toContain("repeat(4, minmax(0, 1fr))");
    expect(styles).not.toContain(".admin-overview-metric-card");
    expect(selectorBlock(".admin-overview-compact-stack")).toContain("border: 0");
    expect(selectorBlock(".admin-overview-compact-stack")).toContain("background: transparent");
    expect(selectorBlock(".admin-compact-row-list")).toContain("display: grid");
    expect(selectorBlock(".admin-compact-data-row")).toContain("grid-template-columns: minmax(0, 1fr) auto auto auto");
    expect(selectorBlock(".admin-compact-data-row")).toContain("text-align: left");
    expect(selectorBlock(".admin-compact-data-row-status")).toContain("font-weight: 700");
    expect(selectorBlock(".admin-panel-compact-card")).toContain("display: grid");
    expect(selectorBlockFrom(styles, ".admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-compact-stack,\n.admin-panel-compact-card")).toContain("grid-template-rows: auto minmax(0, 1fr) auto");
    expect(selectorBlockFrom(styles, ".admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-compact-stack,\n.admin-panel-compact-card")).toContain("max-height: calc(var(--admin-visual-panel-height) - 44px)");
    expect(styles).not.toContain(".admin-overview-filter-row");
    expect(styles).not.toContain(".admin-risk-filter-chip");
    expect(selectorBlockFrom(styles, ".admin-blueprint-page[data-page=\"dashboard\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"portalRequests\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-compact-data-row")).toContain("border: 0.5px solid var(--admin-scene-border)");
    expect(selectorBlockFrom(styles, ".admin-blueprint-page[data-page=\"dashboard\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"portalRequests\"] .admin-compact-data-row,\n.admin-blueprint-page[data-page=\"usageMonitor\"] .admin-compact-data-row")).toContain("grid-template-columns: minmax(0, 1fr) auto auto auto");
    expect(selectorBlockFrom(styles, ".admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-panel-footer,\n.admin-panel-compact-card .admin-overview-panel-footer")).toContain("justify-content: space-between");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"dashboard\"] .admin-overview-metric-grid .ops-metric-icon")).toContain("display: none");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"dashboard\"] .admin-blueprint-module-board")).toContain("repeat(3, minmax(0, 1fr))");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"dashboard\"] [data-module-nav-id=\"risk-queue\"]")).toContain("min-height: 260px");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"dashboard\"] [data-module-nav-id=\"next-actions\"]")).toContain("order: 3");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"dashboard\"] [data-module-nav-id=\"review-candidates\"]")).toContain("min-height: 260px");
    expect(styles).not.toContain("data-module-nav-id=\"owner-handoff\"");
    expect(selectorBlock(".admin-blueprint-empty-workbench")).toContain("border: 1px dashed");
    expect(styles).not.toContain(".admin-blueprint-card-switches");
    expect(styles).not.toContain(".admin-blueprint-module-dock");
    expect(styles).not.toContain(".admin-blueprint-switch");
    expect(styles).not.toContain(".admin-blueprint-module-card-pinned");
    expect(styles).not.toContain(".admin-blueprint-module-card-compact");
    expect(styles).not.toContain(".admin-blueprint-module-gate");
    expect(styles).not.toContain(".admin-blueprint-library-next");
    expect(styles).not.toContain(".nav-planned-list");
    expect(styles).not.toContain(".nav-planned-menu");
    expect(styles).not.toContain(".top-search-shell");
    expect(styles).not.toContain(".top-search-results");
    expect(styles).not.toContain(".search-box");
  });

  test("keeps page source status badges responsive", () => {
    expect(selectorBlock(".page-header-status-stack")).toContain("flex-wrap: wrap");
    expect(selectorBlock(".data-source-badge")).toContain("min-width: 220px");
    expect(styles).toContain(".page-header-status-stack .data-source-badge");
  });

  test("keeps system search and account chrome compact", () => {
    expect(styles).not.toContain(".top-search-shell");
    expect(styles).not.toContain(".top-search-results");
    expect(styles).not.toContain(".top-search-option");
    expect(styles).not.toContain(".search-box");
    expect(selectorBlock(".top-bar-search")).toContain("width: min(420px, 42vw)");
    expect(selectorBlock(".top-bar-search")).toContain("justify-content: flex-start");
    expect(selectorBlock(".top-bar-search")).not.toContain("width 180ms var(--admin-ease)");
    expect(selectorBlock(".top-bar-search input")).toContain("min-height: var(--admin-control-height)");
    expect(selectorBlock(".top-bar-search input")).toContain("width: 100%");
    expect(selectorBlock(".top-bar-search input")).not.toContain("pointer-events: none");
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
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-module-panel\s*\{[\s\S]*max-block-size: none;/m);
    expect(styles).toMatch(/@media \(max-width: 620px\) \{[\s\S]*\.admin-blueprint-page\[data-page\] \[data-module-nav-id\] \.admin-fixture-preview-row\s*\{[\s\S]*min-height: 0;/m);
    expect(styles).toMatch(/@media \(max-width: 980px\) \{[\s\S]*\.admin-blueprint-module-panel-head\s*\{[\s\S]*display: flex;/m);
  });

  test("keeps interactive admin controls visually consistent", () => {
    expect(selectorBlock(".nav-item")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".nav-item")).toContain("display: inline-flex");
    expect(selectorBlock(".nav-item-icon")).toContain("width: 0");
    expect(selectorBlock(".nav-primary-list")).toContain("display: flex");
    expect(selectorBlock(".nav-planned-sidebar-list")).toContain("display: grid");
    expect(styles).not.toContain(".nav-planned-menu");
    expect(styles).not.toContain(".nav-planned-summary");
    expect(styles).not.toContain(".nav-planned-list");
    expect(styles).not.toContain(".nav-planned-item");
    expect(selectorBlock(".nav-app-icon")).toContain("background: var(--nav-app-a)");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-radius-icon)");
    expect(selectorBlock(".nav-app-icon")).toContain("0 0 0 1px rgba(255, 255, 255, 0.32)");
    expect(selectorBlock(".nav-app-icon::after")).toContain("display: none");
    expect(selectorBlock(".nav-app-icon svg")).toContain("position: relative");
    expect(selectorBlock(".nav-app-tone-emerald")).toContain("--nav-app-a: #059669");
    expect(selectorBlock(".nav-app-tone-indigo")).toContain("--nav-app-a: #4f46e5");
    expect(selectorBlock(".nav-app-icon")).toContain("var(--admin-app-icon-size)");
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
      ".environment-pill,\n.protected-console,\n.icon-button",
      ".icon-button,\n.protected-console,\n.console-tools-summary",
      ".top-menu-action",
      ".page-subnav-link",
      ".channel-status-filter",
      ".object-timeline-tab"
    ].forEach((selector) => {
      const block = selectorBlock(selector);
      expect(block).not.toMatch(/(?:min-height|height|width|min-width):\s*(?:3[0-9]|4[0-3])px/);
    });

    expect(selectorBlock(".page-subnav-link")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".channel-status-filter")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".object-timeline-tab")).toContain("min-height: var(--admin-touch-target-min)");
  });

  test("keeps dense New Admin tables and safe refs mobile-safe", () => {
    expect(selectorBlock(".new-console-table-shell")).toContain("display: grid");
    expect(selectorBlock(".new-console-table-shell")).toContain("min-width: 0");
    expect(selectorBlock(".new-console-table")).toContain("overflow-x: auto");
    expect(selectorBlock(".new-console-table-shell-compact")).toContain("gap: 6px");
    expect(selectorBlock(".new-console-table-compact")).toContain("gap: 7px");
    expect(selectorBlock(".new-console-table-compact .new-console-row")).toContain("padding: 7px 9px");
    expect(selectorBlock(".new-console-table-shell-compact .data-card-pagination")).toContain("padding: 6px 8px");
    expect(selectorBlock(".new-console-row")).toContain("min-width: min(100%, 720px)");
    expect(selectorBlock(".new-console-state-stale")).toContain("var(--admin-warning-bg)");
    expect(selectorBlock(".new-console-state-cell small,\n.new-console-state-feedback p")).toContain("var(--admin-muted)");
    expect(selectorBlock(".data-card-pagination")).toContain("display: flex");
    expect(selectorBlock(".data-card-pagination")).toContain("var(--admin-surface-muted)");
    expect(selectorBlock(".data-card-pagination-button")).toContain("min-height: var(--admin-touch-target-min)");
    expect(selectorBlock(".data-card-pagination-button:disabled")).toContain("cursor: not-allowed");
    expect(selectorBlock(".data-card-pagination-page")).toContain("white-space: nowrap");
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
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-footer\s*\{[\s\S]*flex: 0 0 var\(--admin-touch-target-min\);/m);
    expect(styles).toMatch(/@media \(max-width: 860px\) \{[\s\S]*\.sidebar-safety-summary\s*\{[\s\S]*width: var\(--admin-touch-target-min\);/m);
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
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("contain: layout");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("box-shadow: none");
    expect(selectorBlock(".admin-blueprint-module-panel")).toContain("backdrop-filter: none");
    expect(adminOsStyles).not.toMatch(/(?:^|\n)\s*height:\s*(?:220|326)px;/);
    expect(selectorBlock(".admin-blueprint-page-summary")).toContain("min-width: 0");
    expect(selectorBlock(".admin-search-page")).toContain("display: flex");
    expect(selectorBlock(".admin-search-summary")).toContain("background: var(--admin-info-bg)");
    expect(selectorBlock(".admin-search-summary")).toContain("border-radius: var(--admin-radius-control)");
    expect(selectorBlock(".admin-search-summary span")).toContain("overflow-wrap: anywhere");
    expect(selectorBlock(".admin-search-result-list")).toContain("repeat(auto-fit, minmax(min(100%, 360px), 1fr))");
    expect(selectorBlock(".admin-search-result-card")).toContain("grid-template-columns: minmax(0, 1fr) auto");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"portalRequests\"] [data-module-nav-id=\"account-overview\"]")).toContain("grid-column: auto");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"portalRequests\"] [data-module-nav-id=\"account-overview\"]")).toContain("min-height: 260px");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"portalRequests\"] [data-module-nav-id=\"resource-orders\"]")).toContain("order: 2");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"portalRequests\"] [data-module-nav-id=\"lifecycle\"]")).toContain("min-height: 260px");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"usage-ledger\"]")).toContain("grid-column: auto");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"usage-ledger\"]")).toContain("min-height: 260px");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"freshness\"]")).toContain("order: 1");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"channel-coverage\"]")).toContain("order: 2");
    expect(selectorBlock(".admin-blueprint-page[data-page=\"usageMonitor\"] [data-module-nav-id=\"usage-ledger\"]")).toContain("order: 3");
    expect(selectorBlock(".admin-blueprint-module-panel > .case-workbench-card")).toContain("border: 0");
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

    expect(faviconSvg).toContain("GlobalCircle AI Proxy Gateway");
    expect(faviconSvg).toContain("<circle cx=\"32\" cy=\"32\"");
    expect(faviconSvg).not.toContain("M18 22h15");
  });
});
