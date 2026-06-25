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
      statusLabel: "Owner section",
      type: "section"
    });
    expect(results.find((result) => result.id === "usageMonitor:usage-ledger")).toMatchObject({
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
        statusLabel: "Planned",
        type: "planned"
      })
    ]));
    expect(results.find((result) => result.id === "planned:system-settings")?.page).toBeUndefined();
  });
});
