import { describe, expect, test } from "vitest";
import {
  ADMIN_UI_REFERENCE_SOURCES,
  ADMIN_UI_SURFACE_REFERENCES,
  getAdminUiReferenceSource,
  getAdminUiSurfaceReference
} from "../app/admin-ui-reference-model";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const blueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin UI reference model", () => {
  test("registers external UI references with explicit integration boundaries", () => {
    expect(ADMIN_UI_REFERENCE_SOURCES.map((source) => source.key)).toEqual([
      "shadcn-ui",
      "tremor",
      "arco-design-pro",
      "ant-design-pro",
      "vben-admin"
    ]);

    expect(getAdminUiReferenceSource("shadcn-ui")).toMatchObject({
      directDependencyNow: false,
      integrationMode: "adopt-primitives-after-tailwind",
      stackFit: "native-react"
    });
    expect(getAdminUiReferenceSource("tremor")).toMatchObject({
      directDependencyNow: false,
      integrationMode: "port-patterns",
      stackFit: "react-pattern"
    });
    expect(getAdminUiReferenceSource("vben-admin")).toMatchObject({
      directDependencyNow: false,
      integrationMode: "study-architecture-only",
      stackFit: "vue-reference"
    });
  });

  test("maps every current blueprint module to one UI surface reference", () => {
    const roadmapKeys = new Set(ADMIN_UI_SURFACE_REFERENCES.map((surface) => surface.key));
    const moduleSurfaceKeys = blueprints.flatMap((blueprint) => (
      blueprint.modules.map((module) => module.uiSurface)
    ));

    expect(moduleSurfaceKeys).toHaveLength(14);
    expect(new Set(moduleSurfaceKeys).size).toBe(moduleSurfaceKeys.length);
    moduleSurfaceKeys.forEach((surfaceKey) => {
      expect(roadmapKeys.has(surfaceKey)).toBe(true);
      expect(getAdminUiSurfaceReference(surfaceKey)?.implementationTarget).toBeTruthy();
    });
  });

  test("uses Tremor-style patterns for monitoring and usage while keeping account operations enterprise-table oriented", () => {
    expect(getAdminUiSurfaceReference("operations-health")?.primaryReference).toBe("tremor");
    expect(getAdminUiSurfaceReference("usage-ledger")?.primaryReference).toBe("tremor");
    expect(getAdminUiSurfaceReference("account-directory")?.primaryReference).toBe("ant-design-pro");
    expect(getAdminUiSurfaceReference("resource-orders")?.supportingReferences).toContain("arco-design-pro");
    expect(getAdminUiSurfaceReference("navigation-command")?.primaryReference).toBe("shadcn-ui");
  });
});
