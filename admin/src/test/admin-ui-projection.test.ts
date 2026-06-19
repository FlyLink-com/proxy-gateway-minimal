import { describe, expect, test } from "vitest";
import { pageSubNavigation } from "../app/navigation";
import { createDefaultModuleLayout } from "../app/plugin-layout-store";
import { projectBlueprintPanelViewModels } from "../app/admin-ui-projection";
import { overviewBlueprint } from "../pages/dashboard-page";

describe("admin UI projection", () => {
  test("projects full page blueprints into light panel render models", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.modules);
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
      className: "",
      containerLabel: "Overview metric widget set",
      fieldLabels: [
        "Platform health · summary state",
        "Risk counter · severity split",
        "Freshness · P95 / latest age",
        "Coverage · channel availability"
      ],
      navId: "health-summary",
      ownerMode: "preview",
      targetId: "dashboard-health-summary",
      title: "Health Summary",
      uiSurface: "operations-health"
    });
    expect(Object.keys(panels[0]).sort()).toEqual([
      "actions",
      "ariaLabel",
      "category",
      "className",
      "containerLabel",
      "fieldLabels",
      "navId",
      "ownerMode",
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
  });

  test("omits hidden modules while preserving restored panel identity", () => {
    const blueprint = overviewBlueprint();
    const defaultLayout = createDefaultModuleLayout(blueprint.modules);
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      defaultModuleLayout: defaultLayout,
      moduleLayout: {
        ...defaultLayout,
        "risk-queue": {
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
});
