import { describe, expect, test } from "vitest";
import { createAdminSearchResults } from "../app/admin-search-index";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const blueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin system search index", () => {
  test("searches across pages and page sections with domain aliases", () => {
    const results = createAdminSearchResults({ blueprints, query: "账户" });
    const resultIds = results.map((result) => result.id);

    expect(resultIds).toEqual(expect.arrayContaining([
      "portalRequests:page",
      "portalRequests:account-overview",
      "usageMonitor:usage-ledger"
    ]));
    expect(resultIds).not.toContain("usageMonitor:freshness");
    expect(results.find((result) => result.id === "portalRequests:account-overview")).toMatchObject({
      capabilityState: "available",
      group: "Page sections",
      matchedField: "Alias",
      objectType: "owner section",
      routeTarget: "user-supervision-account-overview",
      statusLabel: "Owner section",
      type: "section"
    });
    expect(results.find((result) => result.id === "usageMonitor:usage-ledger")).toMatchObject({
      capabilityState: "available",
      group: "Page sections",
      matchedField: "Alias",
      objectType: "owner section",
      routeTarget: "platform-monitoring-usage-ledger",
      statusLabel: "Owner section",
      type: "section"
    });
    expect(results.map((result) => result.type)).not.toContain("module");
  });

  test("keeps planned console routes searchable without promoting them to pages", () => {
    const results = createAdminSearchResults({ blueprints, query: "settings" });

    expect(results).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "planned:system-settings",
        capabilityState: "planned",
        group: "Planned routes",
        matchedField: "Page",
        objectType: "planned route",
        routeTarget: "Roadmap gate",
        statusLabel: "Planned",
        type: "planned"
      })
    ]));
    expect(results.find((result) => result.id === "planned:system-settings")?.page).toBeUndefined();
  });

  test("marks overview-only sections as read-only route launchers", () => {
    const results = createAdminSearchResults({ blueprints, query: "risk queue" });

    expect(results.find((result) => result.id === "dashboard:risk-queue")).toMatchObject({
      capabilityState: "read-only",
      group: "Page sections",
      matchedField: "Label",
      objectType: "overview section",
      routeTarget: "dashboard-risk-queue",
      statusLabel: "Preview section",
      type: "section"
    });
  });

  test("does not match sensitive boundary terms as system search targets", () => {
    expect(createAdminSearchResults({ blueprints, query: "raw logs" })).toEqual([]);
    expect(createAdminSearchResults({ blueprints, query: "credential material" })).toEqual([]);
    expect(createAdminSearchResults({ blueprints, query: "subscription url" })).toEqual([]);
    expect(createAdminSearchResults({ blueprints, query: "sqlite row" })).toEqual([]);
  });
});
