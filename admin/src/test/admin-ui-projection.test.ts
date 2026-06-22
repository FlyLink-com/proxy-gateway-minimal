import { describe, expect, test } from "vitest";
import { pageSubNavigation } from "../app/navigation";
import { createDefaultModuleLayout } from "../app/plugin-layout-store";
import { projectBlueprintPanelViewModels } from "../app/admin-ui-projection";
import { overviewBlueprint } from "../pages/dashboard-page";

describe("admin UI projection", () => {
  test("projects full page blueprints into light panel render models", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.page, blueprint.modules);
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      defaultModuleLayout: defaultLayout,
      moduleLayout: defaultLayout,
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels).toHaveLength(3);
    expect(panels[0]).toEqual({
      actions: blueprint.modules[0].actions,
      ariaLabel: "Monitoring panel",
      category: "monitoring",
      chrome: "operator",
      className: "",
      content: blueprint.modules[0].content,
      containerLabel: "Overview metric widget set",
      fieldLabels: [
        "Platform health · summary state",
        "Risk counter · severity split",
        "Freshness · P95 / latest age",
        "Coverage · channel availability"
      ],
      navId: "health-summary",
      ownerMode: "preview",
      sizePreset: "standard",
      targetId: "dashboard-health-summary",
      title: "Health Summary",
      uiSurface: "operations-health"
    });
    expect(Object.keys(panels[0]).sort()).toEqual([
      "actions",
      "ariaLabel",
      "category",
      "chrome",
      "className",
      "containerLabel",
      "content",
      "fieldLabels",
      "navId",
      "ownerMode",
      "sizePreset",
      "targetId",
      "title",
      "uiSurface"
    ]);

    const projectedText = JSON.stringify(panels);
    expect(projectedText).not.toContain("Data adapter");
    expect(projectedText).not.toContain("Layout policy");
    expect(projectedText).not.toContain("Performance boundary");
    expect(projectedText).not.toContain("Interaction model");
    expect(projectedText).not.toContain("Wire panel routes");
    expect(projectedText).not.toContain("Overview owns only first-screen monitoring");
    expect(projectedText).not.toContain("Summarize platform health without owning");
  });

  test("omits hidden modules while preserving restored panel identity", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.page, blueprint.modules);
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      defaultModuleLayout: defaultLayout,
      moduleLayout: {
        ...defaultLayout,
        "risk-queue": {
          ...defaultLayout["risk-queue"],
          visible: false
        }
      },
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels.map((panel) => panel.navId)).toEqual([
      "health-summary",
      "next-actions"
    ]);
    expect(panels.map((panel) => panel.targetId)).toEqual([
      "dashboard-health-summary",
      "dashboard-next-actions"
    ]);
  });

  test("keeps dashboard projection in operator chrome without fixture preview rows", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.page, blueprint.modules);
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      defaultModuleLayout: defaultLayout,
      fixturePreviewEnabled: true,
      moduleLayout: defaultLayout,
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels.map((panel) => panel.chrome)).toEqual(["operator", "operator", "operator"]);
    expect(panels.some((panel) => panel.fixturePreview)).toBe(false);
    expect(JSON.stringify(panels)).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_/i);
  });

  test("projects module size presets without reintroducing freeform resize coordinates", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.page, blueprint.modules);
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      defaultModuleLayout: defaultLayout,
      moduleLayout: {
        ...defaultLayout,
        "risk-queue": {
          ...defaultLayout["risk-queue"],
          sizePreset: "wide"
        }
      },
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels.find((panel) => panel.navId === "risk-queue")).toMatchObject({
      navId: "risk-queue",
      sizePreset: "wide"
    });
    expect(JSON.stringify(panels)).not.toMatch(/"x"|"y"|width|height|resizeHandle/i);
  });
});
