import { describe, expect, test } from "vitest";
import {
  ADMIN_SAFE_READ_PROJECTION_SCHEMA,
  createAdminSafeReadProjections,
  findAdminSafeReadProjectionIssues
} from "../app/admin-safe-read-projection";
import { ADMIN_PAGINATION_STANDARD } from "../app/admin-ui-standards";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const adminBlueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin safe read projection", () => {
  test("creates one safe read projection per visible Admin module", () => {
    const projections = createAdminSafeReadProjections(adminBlueprints);

    expect(projections).toHaveLength(14);
    projections.forEach((projection) => {
      expect(projection.schemaVersion).toBe(ADMIN_SAFE_READ_PROJECTION_SCHEMA);
      expect(projection.dataBoundary).toBe("safe-summary-only");
      expect(projection.mutationPolicy).toBe("read-only-no-mutation");
      expect(projection.transformBoundary).toBe("display-only");
      expect(projection.sourceRefs.length).toBeGreaterThan(0);
      expect(projection.drilldownTargets).toContain(`${projection.page}#${projection.targetId}`);
      expect(projection.allowedDisplayFields.length).toBeGreaterThan(0);
      expect(projection.fixtureSnapshot?.safetyNotes.length).toBeGreaterThan(0);
    });
  });

  test("marks long owner/evidence modules as bounded by the Figma pagination standard", () => {
    const projections = createAdminSafeReadProjections(adminBlueprints);
    const byKey = Object.fromEntries(projections.map((projection) => [
      `${projection.page}:${projection.navId}`,
      projection
    ]));

    expect(byKey["usageMonitor:usage-ledger"].query.pagination).toEqual({
      defaultPageSize: 10,
      maxPageSize: 100,
      required: true,
      standardId: ADMIN_PAGINATION_STANDARD.id
    });
    expect(byKey["portalRequests:lifecycle"].query.routeSplitRequired).toBe(true);
    expect(byKey["dashboard:health-summary"].query.pagination.required).toBe(false);
  });

  test("keeps unsafe data labels out of allowed display fields and source refs", () => {
    const projections = createAdminSafeReadProjections(adminBlueprints);

    expect(findAdminSafeReadProjectionIssues(projections)).toEqual([]);
    expect(projections.find((projection) => projection.navId === "resource-orders")?.forbiddenFields).toEqual(
      expect.arrayContaining([
        "subscription URL",
        "credential",
        "raw session/env/config/log"
      ])
    );
  });

  test("keeps Usage Ledger as read-only evidence and Account Directory as the decision-owner table", () => {
    const projections = createAdminSafeReadProjections(adminBlueprints);
    const usageLedger = projections.find((projection) => projection.page === "usageMonitor" && projection.navId === "usage-ledger");
    const accountDirectory = projections.find((projection) => projection.page === "portalRequests" && projection.navId === "account-overview");

    expect(usageLedger).toMatchObject({
      label: "Usage Ledger",
      ownerMode: "owner",
      pageRole: "evidence-owner",
      query: {
        filterKeys: ["state", "tone", "owner", "route"],
        sortKeys: ["updatedAt", "state", "safeRef"]
      },
      uiSurface: "usage-ledger"
    });
    expect(usageLedger?.allowedDisplayFields).toEqual([
      "Account · safe ref",
      "Order · safe ref",
      "Channel · safe ref",
      "Traffic · upload / download / total",
      "Collected · timestamp"
    ]);

    expect(accountDirectory).toMatchObject({
      label: "Account Directory",
      pageRole: "decision-owner",
      uiSurface: "account-directory"
    });
  });
});
