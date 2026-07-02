import { describe, expect, test } from "vitest";
import {
  ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA,
  ADMIN_SAFE_READ_PAGE_STATE_CONTRACT,
  createAdminSafeReadPageModels,
  findAdminSafeReadPageModelIssues
} from "../app/admin-safe-read-page-model";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const adminBlueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin safe read page model", () => {
  test("creates one page-level safe read model per active Admin page", () => {
    const models = createAdminSafeReadPageModels(adminBlueprints);

    expect(models).toHaveLength(3);
    expect(models.map((model) => model.page)).toEqual([
      "dashboard",
      "portalRequests",
      "usageMonitor"
    ]);
    models.forEach((model) => {
      expect(model.schemaVersion).toBe(ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA);
      expect(model.stateContract).toEqual(ADMIN_SAFE_READ_PAGE_STATE_CONTRACT);
      expect(model.dataBoundary).toBe("safe-summary-only");
      expect(model.mutationPolicy).toBe("read-only-no-mutation");
      expect(model.routeHash).toMatch(/^#\/admin\//);
      expect(model.sections.every((section) => section.fixtureProjection.safetyNotes.length > 0)).toBe(true);
      expect(model.sections.every((section) => section.productionImpact === "none" || section.productionImpact === "read-only")).toBe(true);
    });
  });

  test("keeps first-screen modules visible and routes overflow modules to deferred subpages", () => {
    const modelsByPage = Object.fromEntries(
      createAdminSafeReadPageModels(adminBlueprints).map((model) => [model.page, model])
    );

    expect(modelsByPage.dashboard.visibleSectionIds).toEqual([
      "health-summary",
      "risk-queue",
      "next-actions",
      "review-candidates"
    ]);
    expect(modelsByPage.dashboard.deferredSectionIds).toEqual([]);

    expect(modelsByPage.portalRequests.visibleSectionIds).toEqual([
      "account-overview",
      "resource-orders",
      "lifecycle"
    ]);
    expect(modelsByPage.portalRequests.deferredSectionIds).toEqual([
      "quota-usage",
      "history-events"
    ]);

    expect(modelsByPage.usageMonitor.visibleSectionIds).toEqual([
      "freshness",
      "channel-coverage",
      "usage-ledger"
    ]);
    expect(modelsByPage.usageMonitor.deferredSectionIds).toEqual([
      "collection-anomalies",
      "receipts-collectors"
    ]);
  });

  test("summarizes fixture projection counts without exposing unsafe material", () => {
    const models = createAdminSafeReadPageModels(adminBlueprints);

    expect(findAdminSafeReadPageModelIssues(models)).toEqual([]);
    expect(models.map((model) => model.fixtureSummary)).toEqual([
      {
        chipCount: 8,
        deferredSections: 0,
        rowCount: 10,
        totalSections: 4,
        visibleSections: 4
      },
      {
        chipCount: 10,
        deferredSections: 2,
        rowCount: 9,
        totalSections: 5,
        visibleSections: 3
      },
      {
        chipCount: 10,
        deferredSections: 2,
        rowCount: 10,
        totalSections: 5,
        visibleSections: 3
      }
    ]);
    expect(JSON.stringify(models)).not.toMatch(
      /https?:\/\/|subscription\s*url|token|secret|credential|password|raw\s*(?:session|env|config|logs?|db|sqlite|runtime|operator|subscription|material)|sqlite\s*row|private\s*key|auth\s*header|bearer/i
    );
  });
});
