import { describe, expect, test } from "vitest";
import { createAdminSearchResults } from "../app/admin-search-index";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";
import { paymentLogsBlueprint } from "../pages/payment-logs-page";

const blueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint,
  paymentLogsBlueprint
];

describe("admin system search index", () => {
  test("searches across pages and modules with domain aliases", () => {
    const results = createAdminSearchResults({ blueprints, query: "账户" });
    const resultIds = results.map((result) => result.id);

    expect(resultIds).toEqual(expect.arrayContaining([
      "portalRequests:page",
      "portalRequests:account-overview",
      "usageMonitor:usage-ledger"
    ]));
    expect(resultIds).not.toContain("usageMonitor:freshness");
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

  test("searches Payment Logs page and module aliases", () => {
    expect(createAdminSearchResults({ blueprints, query: "payment" }).map((result) => result.id)).toEqual(expect.arrayContaining(["paymentLogs:page", "paymentLogs:payment-attempts"]));
  });
});
