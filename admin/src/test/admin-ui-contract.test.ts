import { describe, expect, test } from "vitest";
import {
  ADMIN_PRIVILEGED_SURFACE_IDS,
  ADMIN_UI_CONTRACT,
  getAdminPageContract
} from "../app/admin-ui-contract";
import { ADMIN_COMPONENT_GRAMMAR } from "../design/grammar/components";
import { ADMIN_DENSITY_SPECS } from "../design/grammar/density";
import { ADMIN_HIERARCHY_RULES } from "../design/grammar/hierarchy";
import { ADMIN_LAYOUT_SPECS } from "../design/grammar/layout";

describe("admin OS UI contract", () => {
  test("names the platform visual control points", () => {
    expect(ADMIN_UI_CONTRACT.appShell.contractId).toBe("app-shell");
    expect(ADMIN_UI_CONTRACT.pageFrame.contractId).toBe("page-frame");
    expect(ADMIN_UI_CONTRACT.pluginFrame.contractId).toBe("panel-frame");
    expect(ADMIN_UI_CONTRACT.styleLayers).toEqual([
      "tokens",
      "base",
      "chrome",
      "components",
      "workspace",
      "pages",
      "utilities"
    ]);
  });

  test("keeps panel visual chrome outside module content responsibility", () => {
    expect(ADMIN_UI_CONTRACT.pluginFrame.owns).toEqual([
      "panel-surface",
      "panel-header",
      "panel-toolbar",
      "hide-action",
      "panel-state-chrome"
    ]);
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("outer-panel-border");
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("panel-resize-controls");
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("loading-error-empty-chrome");
  });

  test("locks the first density baseline for admin workspace controls", () => {
    expect(ADMIN_UI_CONTRACT.density).toEqual({
      buttonMdHeight: "44px",
      inputHeight: "44px",
      panelPadding: "20px",
      pageGap: "20px",
      pluginHeaderMinHeight: "48px",
      sectionGap: "24px",
      tableRowHeight: "44px"
    });
  });

  test("keeps desktop and tablet accepted while mobile waits for its own standard", () => {
    expect(ADMIN_UI_CONTRACT.viewportTargets.desktopWorkbench).toMatchObject({
      contractId: "desktop-workbench",
      frame: "1600x1024",
      implementationMode: "primary-web-design",
      layoutModel: "multi-column-workbench"
    });

    expect(ADMIN_UI_CONTRACT.viewportTargets.tabletReview).toMatchObject({
      contractId: "tablet-review",
      frame: "1024x768",
      implementationMode: "accepted-responsive-check",
      layoutModel: "contained-reflow"
    });

    expect(ADMIN_UI_CONTRACT.viewportTargets.mobilePending).toMatchObject({
      contractId: "mobile-pending",
      frame: "390x844",
      implementationMode: "blocked-until-dedicated-standard",
      layoutModel: "not-yet-defined"
    });
    expect(ADMIN_UI_CONTRACT.viewportTargets.mobilePending.forbiddenLayoutReuse).toEqual([
      "desktop-column-map",
      "desktop-plugin-grid",
      "desktop-card-density",
      "desktop-page-scroll-plan"
    ]);
  });

  test("defines grammar primitives before QA checks rendered visuals", () => {
    expect(ADMIN_LAYOUT_SPECS.dashboard).toMatchObject({
      contentFlow: "stack",
      mobileStandardStatus: "pending-dedicated-standard"
    });
    expect(ADMIN_LAYOUT_SPECS.table.maxPrimaryColumns).toBe(1);
    expect(ADMIN_DENSITY_SPECS.normal).toMatchObject({
      cardPadding: "16px",
      minTouchTargetPx: 44,
      rowHeight: "44px"
    });
    expect(ADMIN_HIERARCHY_RULES.map((rule) => rule.role)).toEqual([
      "metric",
      "context",
      "state",
      "action",
      "evidence",
      "detail"
    ]);
    expect(ADMIN_COMPONENT_GRAMMAR.container.forbiddenResponsibilities).toContain("raw-log-display");
  });

  test("declares page-level grammar contracts for active Admin surfaces", () => {
    expect(Object.keys(ADMIN_UI_CONTRACT.pageContracts).sort()).toEqual([
      "dashboard",
      "portalRequests",
      "usageMonitor",
      "paymentLogs"
    ]);

    expect(getAdminPageContract("dashboard")).toMatchObject({
      layout: "dashboard",
      mobileStandardStatus: "pending-dedicated-standard",
      page: "dashboard"
    });
    expect(getAdminPageContract("portalRequests")).toMatchObject({
      layout: "table",
      page: "portalRequests"
    });
    expect(getAdminPageContract("usageMonitor").requiredBlocks).toContain("evidence-row");

    Object.values(ADMIN_UI_CONTRACT.pageContracts).forEach((contract) => {
      expect(contract.density).toBe("normal");
      expect(contract.mobileStandardStatus).toBe("pending-dedicated-standard");
      expect(contract.requiredBlocks).toContain("page-title");
      expect(contract.requiredBlocks).toContain("state-preview");
      expect(contract.forbiddenSurfaces).toEqual(ADMIN_PRIVILEGED_SURFACE_IDS);
    });
  });

  test("declares page composition budgets so overflow moves to subpages or pagination", () => {
    expect(ADMIN_UI_CONTRACT.pageCompositionContracts.dashboard).toMatchObject({
      activeModuleLimit: 3,
      firstViewportStrategy: "overview-summary",
      overflowPolicy: "overview-summary-only",
      requiresSubpages: false,
      subpageModuleLimit: 0
    });

    expect(ADMIN_UI_CONTRACT.pageCompositionContracts.portalRequests).toMatchObject({
      activeModuleLimit: 2,
      firstViewportStrategy: "owner-subpage",
      overflowPolicy: "subpage-or-pagination",
      requiresSubpages: true,
      subpageModuleLimit: 2
    });

    expect(ADMIN_UI_CONTRACT.pageCompositionContracts.usageMonitor).toMatchObject({
      activeModuleLimit: 2,
      firstViewportStrategy: "owner-subpage",
      overflowPolicy: "subpage-or-pagination",
      requiresSubpages: true,
      subpageModuleLimit: 2
    });
  });
});
