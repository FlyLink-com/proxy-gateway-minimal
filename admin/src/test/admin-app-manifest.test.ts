import { describe, expect, test } from "vitest";
import {
  adminAppManifest,
  createAppLibrarySearchIndex,
  getPlannedApps,
  getPluginApp,
  getPluginApps,
  getUtilityApps,
  getWorkspacePageApp,
  getWorkspacePageApps,
  matchesAppSearch
} from "../app/admin-app-manifest";
import { pageSubNavigation } from "../app/navigation";

describe("admin app manifest", () => {
  test("defines the first control-plane workspace apps", () => {
    expect(getWorkspacePageApps().map((app) => app.id)).toEqual([
      "operations-overview",
      "accounts-resources",
      "usage-channels"
    ]);

    expect(getWorkspacePageApp("dashboard")).toMatchObject({
      category: "monitoring",
      id: "operations-overview",
      kind: "page",
      route: {
        action: "navigate",
        page: "dashboard"
      },
      safety: {
        productionImpact: "read-only",
        redaction: "safe-summary-only"
      }
    });
    expect(getWorkspacePageApp("portalRequests")?.owner.area).toBe("User Operations");
    expect(getWorkspacePageApp("usageMonitor")?.owner.area).toBe("Platform Monitoring");
  });

  test("registers page modules as plugins with safe restore routes", () => {
    const expectedPluginCount = Object.values(pageSubNavigation)
      .reduce((count, modules) => count + modules.length, 0);

    expect(getPluginApps()).toHaveLength(expectedPluginCount);
    expect(getPluginApp("usage-ledger", "usageMonitor")).toMatchObject({
      id: "plugin.usage-ledger",
      kind: "plugin",
      library: {
        group: "plugins"
      },
      plugin: {
        navId: "usage-ledger",
        settingsEntry: "both"
      },
      route: {
        action: "openPlugin",
        page: "usageMonitor",
        targetId: "platform-monitoring-usage-ledger"
      }
    });
    expect(getPluginApp("quota-usage", "portalRequests")?.safety.capabilities).toEqual(
      expect.arrayContaining(["view", "inspect", "suggest-action"])
    );
  });

  test("keeps planned apps locked and utilities separate from business pages", () => {
    expect(getPlannedApps().map((app) => app.id)).toEqual([
      "planned.audit-workflow",
      "planned.platform-development",
      "planned.system-settings"
    ]);
    expect(getPlannedApps().every((app) => app.route.action === "locked")).toBe(true);
    expect(getUtilityApps().map((app) => app.id)).toEqual([
      "utility.risk-notifications",
      "utility.environment",
      "utility.preview-site",
      "utility.user-portal",
      "utility.admin-api"
    ]);
    expect(adminAppManifest.every((app) => app.safety.redaction === "safe-summary-only")).toBe(true);
  });

  test("builds a safe app-library search index from whitelisted summary fields", () => {
    const index = createAppLibrarySearchIndex();
    const usageLedger = index.find((entry) => entry.appId === "plugin.usage-ledger");
    const operationsOverview = index.find((entry) => entry.appId === "operations-overview");

    expect(usageLedger).toMatchObject({
      moduleNavId: "usage-ledger",
      pageId: "usageMonitor",
      resultType: "plugin",
      routeTarget: "usageMonitor#platform-monitoring-usage-ledger"
    });
    expect(operationsOverview).toMatchObject({
      pageId: "dashboard",
      resultType: "page",
      routeTarget: "dashboard"
    });
    expect(operationsOverview && matchesAppSearch(operationsOverview, "risk")).toBe(true);
    expect(usageLedger && matchesAppSearch(usageLedger, "channel")).toBe(true);

    index.forEach((entry) => {
      expect(entry.searchText).not.toMatch(/token|secret|credential|subscription\s*url|auth\s*header|bearer|password|sqlite|raw\s/i);
      expect(entry.safeSummary).not.toMatch(/token=|Bearer|password|subscriptionUrl/i);
    });
  });
});
