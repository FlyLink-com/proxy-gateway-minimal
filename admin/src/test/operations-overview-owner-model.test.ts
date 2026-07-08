import { describe, expect, test } from "vitest";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA } from "../app/admin-safe-read-page-model";
import {
  createOperationsOverviewOwnerPageModel,
  findOperationsOverviewOwnerPageModelIssues,
  OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA
} from "../app/operations-overview-owner-model";
import { overviewBlueprint } from "../pages/dashboard-page";

describe("Operations Overview owner model", () => {
  test("projects the accepted Operations Overview sections from the blueprint", () => {
    const model = createOperationsOverviewOwnerPageModel(overviewBlueprint);

    expect(model.schemaVersion).toBe(OPERATIONS_OVERVIEW_OWNER_MODEL_SCHEMA);
    expect(model.page).toBe("dashboard");
    expect(model.visibleSections.map((section) => section.navId)).toEqual([
      "health-summary",
      "risk-queue",
      "next-actions"
    ]);
    expect(model.deferredSections).toEqual([]);
    expect(model.safeReadModel.schemaVersion).toBe(ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA);
    expect(model.safeReadModel.visibleSectionIds).toEqual(model.visibleSections.map((section) => section.navId));
    expect(model.safeReadModel.deferredSectionIds).toEqual([]);
  });

  test("attaches table query-state only to sections that need bounded paging", () => {
    const model = createOperationsOverviewOwnerPageModel(overviewBlueprint);
    const querySections = model.visibleSections.filter((section) => section.query);

    expect(querySections.map((section) => section.navId)).toEqual([
      "risk-queue"
    ]);
    querySections.forEach((section) => {
      expect(section.query?.schemaVersion).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
      expect(section.query?.page).toBe("dashboard");
      expect(section.query?.navId).toBe(section.navId);
      expect(section.query?.routeScope).toBe(`dashboard#${section.targetId}`);
      expect(section.resultWindow).toEqual({
        firstItem: 1,
        lastItem: section.rows.length,
        pageIndex: 1,
        totalItems: section.rows.length,
        totalPages: 1
      });
    });

    expect(model.visibleSections.find((section) => section.navId === "health-summary")?.query).toBeUndefined();
    expect(model.visibleSections.find((section) => section.navId === "next-actions")?.query).toBeUndefined();
  });

  test("keeps metrics, risk rows, and routing rows as safe display-only content", () => {
    const model = createOperationsOverviewOwnerPageModel(overviewBlueprint);
    const healthSummary = model.visibleSections.find((section) => section.navId === "health-summary");
    const riskQueue = model.visibleSections.find((section) => section.navId === "risk-queue");
    const nextActions = model.visibleSections.find((section) => section.navId === "next-actions");

    expect(healthSummary?.metrics.map((metric) => metric.title)).toEqual([
      "Platform health",
      "Risk cases",
      "Freshness",
      "Coverage"
    ]);
    expect(riskQueue?.rows.map((row) => row.label)).toEqual(["case_012", "case_017"]);
    expect(nextActions?.rows.map((row) => row.target)).toEqual(["portalRequests", "usageMonitor"]);
    expect(JSON.stringify(model)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
    expect(findOperationsOverviewOwnerPageModelIssues(model)).toEqual([]);
  });
});
