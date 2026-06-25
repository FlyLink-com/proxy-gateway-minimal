import { describe, expect, test } from "vitest";
import { pageSubNavigation } from "../app/navigation";
import { projectBlueprintPanelViewModels } from "../app/admin-ui-projection";
import { overviewBlueprint } from "../pages/dashboard-page";

describe("admin UI projection", () => {
  test("projects full page blueprints into light panel render models", () => {
    const blueprint = overviewBlueprint();
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels).toHaveLength(4);
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

  test("projects all modules because local panel hiding is no longer part of the UI contract", () => {
    const blueprint = overviewBlueprint();
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels.map((panel) => panel.navId)).toEqual([
      "health-summary",
      "risk-queue",
      "next-actions",
      "review-candidates"
    ]);
    expect(panels.map((panel) => panel.targetId)).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions",
      "dashboard-review-candidates"
    ]);
  });

  test("keeps dashboard projection in operator chrome without fixture preview rows", () => {
    const blueprint = overviewBlueprint();
    const panels = projectBlueprintPanelViewModels({
      blueprint,
      fixturePreviewEnabled: true,
      subNavigation: pageSubNavigation[blueprint.page]
    });

    expect(panels.map((panel) => panel.chrome)).toEqual(["operator", "operator", "operator", "operator"]);
    expect(panels.some((panel) => panel.fixturePreview)).toBe(false);
    expect(JSON.stringify(panels)).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|edgecred_/i);
  });
});
