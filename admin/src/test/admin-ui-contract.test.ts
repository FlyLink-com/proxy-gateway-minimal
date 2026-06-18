import { describe, expect, test } from "vitest";
import { ADMIN_UI_CONTRACT } from "../app/admin-ui-contract";

describe("admin OS UI contract", () => {
  test("names the platform visual control points", () => {
    expect(ADMIN_UI_CONTRACT.appShell.contractId).toBe("app-shell");
    expect(ADMIN_UI_CONTRACT.pageFrame.contractId).toBe("page-frame");
    expect(ADMIN_UI_CONTRACT.pluginFrame.contractId).toBe("plugin-frame");
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

  test("keeps plugin visual chrome outside plugin content responsibility", () => {
    expect(ADMIN_UI_CONTRACT.pluginFrame.owns).toEqual([
      "plugin-card-surface",
      "plugin-header",
      "plugin-toolbar",
      "drag-handle",
      "resize-handle",
      "hide-action",
      "plugin-state-chrome"
    ]);
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("outer-card-border");
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("plugin-resize-controls");
    expect(ADMIN_UI_CONTRACT.pluginFrame.forbiddenPluginResponsibilities).toContain("loading-error-empty-chrome");
  });

  test("locks the first density baseline for admin workspace controls", () => {
    expect(ADMIN_UI_CONTRACT.density).toEqual({
      buttonMdHeight: "36px",
      cardPadding: "20px",
      inputHeight: "36px",
      pageGap: "20px",
      pluginHeaderMinHeight: "48px",
      sectionGap: "24px",
      tableRowHeight: "44px"
    });
  });
});
