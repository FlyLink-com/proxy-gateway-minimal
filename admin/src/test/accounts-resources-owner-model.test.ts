import { describe, expect, test } from "vitest";
import {
  ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA,
  createAccountsResourcesOwnerPageModel,
  findAccountsResourcesOwnerPageModelIssues
} from "../app/accounts-resources-owner-model";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";

describe("accounts resources owner model", () => {
  test("projects the visible Accounts owner sections from the accepted blueprint overview modules", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);

    expect(model.schemaVersion).toBe(ACCOUNTS_RESOURCES_OWNER_MODEL_SCHEMA);
    expect(model.page).toBe("portalRequests");
    expect(model.visibleSections.map((section) => section.navId)).toEqual([
      "account-overview",
      "resource-orders",
      "lifecycle"
    ]);
    expect(model.deferredSections.map((section) => section.navId)).toEqual([
      "quota-usage",
      "history-events"
    ]);
  });

  test("attaches every visible section to the shared table query-state contract", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);

    model.visibleSections.forEach((section) => {
      expect(section.query.schemaVersion).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
      expect(section.query.page).toBe("portalRequests");
      expect(section.query.navId).toBe(section.navId);
      expect(section.query.routeScope).toBe(`portalRequests#${section.targetId}`);
      expect(section.resultWindow).toEqual({
        firstItem: 1,
        lastItem: section.rows.length,
        pageIndex: 1,
        totalItems: section.rows.length,
        totalPages: 1
      });
    });
  });

  test("keeps account, order, and lifecycle rows safe for display-only rendering", () => {
    const model = createAccountsResourcesOwnerPageModel(accountsResourcesBlueprint);
    const accountDirectory = model.visibleSections.find((section) => section.navId === "account-overview");
    const resources = model.visibleSections.find((section) => section.navId === "resource-orders");
    const lifecycle = model.visibleSections.find((section) => section.navId === "lifecycle");

    expect(accountDirectory?.rows).toEqual([
      {
        actionLabel: "Open",
        detail: "Order ord_2048 · Plan standard",
        label: "user_001",
        meta: "Risk Med",
        statusLabel: "Active",
        tone: "info"
      },
      {
        actionLabel: "Open",
        detail: "Order ord_2047 · Plan trial",
        label: "user_002",
        meta: "Risk Low",
        statusLabel: "Active",
        tone: "success"
      }
    ]);
    expect(resources?.rows.map((row) => row.label)).toEqual(["ord_2048", "ord_2047"]);
    expect(lifecycle?.rows.map((row) => row.label)).toEqual(["pause_check", "archive_due"]);
    expect(JSON.stringify(model)).not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i
    );
    expect(findAccountsResourcesOwnerPageModelIssues(model)).toEqual([]);
  });
});
