import { describe, expect, test } from "vitest";
import {
  adminAppManifest,
  createAppLibrarySearchIndex,
  getAdminAppMap,
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
    expect(getWorkspacePageApp("dashboard")?.catalog).toMatchObject({
      appId: "operations-overview",
      coreViews: ["health summary", "risk queue", "next action routing"],
      enName: "Operations Overview",
      primaryObjects: expect.arrayContaining(["platform health", "risk case"]),
      searchableFields: expect.arrayContaining(["overview", "health", "risk"]),
      zhName: "运营概览"
    });
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
    expect(getPluginApp("quota-usage", "portalRequests")?.catalog).toMatchObject({
      enName: "Quota & Usage",
      followUpTask: "GCC-76 plugin container template and GCC-78 workspace engine",
      primaryObjects: expect.arrayContaining(["quota policy", "total usage", "quota risk"]),
      searchableFields: expect.arrayContaining(["quota-usage", "Quota & Usage", "User Operations"]),
      zhName: "配额与使用情况"
    });
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
    expect(getPlannedApps().find((app) => app.id === "planned.platform-development")?.catalog).toMatchObject({
      category: "platform-tools",
      primaryObjects: expect.arrayContaining(["node", "channel candidate", "dry-run packet"]),
      zhName: "平台开发"
    });
    expect(getUtilityApps().find((app) => app.id === "utility.admin-api")?.catalog).toMatchObject({
      coreViews: ["Admin API connection widget", "local console settings"],
      primaryObjects: ["Admin API connection", "local console setting"],
      zhName: "管理员 API"
    });
  });

  test("builds a single app map for pages, plugins, utilities, and planned apps", () => {
    const appMap = getAdminAppMap();
    const expectedPluginRoutes = Object.entries(pageSubNavigation).flatMap(([page, modules]) => (
      modules.map((module) => `${page}:${module.id}:${module.targetId}`)
    ));
    const actualPluginRoutes = appMap.plugins.map((app) => (
      `${app.route.page}:${app.plugin?.navId}:${app.route.targetId}`
    ));

    expect(Object.keys(appMap.byId).sort()).toEqual(adminAppManifest.map((app) => app.id).sort());
    expect(new Set(adminAppManifest.map((app) => app.id)).size).toBe(adminAppManifest.length);
    expect(appMap.workspacePages.map((app) => app.id)).toEqual([
      "operations-overview",
      "accounts-resources",
      "usage-channels"
    ]);
    expect(appMap.utilities.map((app) => app.library.group)).toEqual([
      "console-settings",
      "console-settings",
      "console-settings",
      "console-settings",
      "console-settings"
    ]);
    expect(actualPluginRoutes.sort()).toEqual(expectedPluginRoutes.sort());
    expect(appMap.pluginsByPage.portalRequests.map((app) => app.plugin?.navId)).toEqual([
      "account-overview",
      "resource-orders",
      "quota-usage",
      "lifecycle",
      "history-events"
    ]);
    expect(appMap.pluginsByPage.usageMonitor.map((app) => app.plugin?.navId)).toEqual([
      "freshness",
      "channel-coverage",
      "usage-ledger",
      "collection-anomalies",
      "receipts-collectors"
    ]);
    expect(appMap.searchIndex).toHaveLength(adminAppManifest.length);

    adminAppManifest.forEach((app) => {
      expect(app.catalog.appId).toBe(app.id);
      expect(app.catalog.enName).toBe(app.label);
      expect(app.catalog.category).toBe(app.category);
      expect(app.catalog.primaryObjects.length).toBeGreaterThan(0);
      expect(app.catalog.coreViews.length).toBeGreaterThan(0);
      expect(app.catalog.searchableFields.length).toBeGreaterThan(0);
      expect(app.catalog.safetyBoundary).toMatch(/safe|locked|console/i);
      expect(app.catalog.followUpTask).toMatch(/^GCC-/);
    });
  });

  test("builds a safe app-library search index from whitelisted summary fields", () => {
    const index = createAppLibrarySearchIndex();
    const usageLedger = index.find((entry) => entry.appId === "plugin.usage-ledger");
    const operationsOverview = index.find((entry) => entry.appId === "operations-overview");

    expect(usageLedger).toMatchObject({
      moduleNavId: "usage-ledger",
      pageId: "usageMonitor",
      resultType: "plugin",
      routeTarget: "usageMonitor#platform-monitoring-usage-ledger",
      searchableFields: expect.arrayContaining(["usage-ledger", "Usage Ledger", "Platform Monitoring"])
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
      expect(entry.searchableFields.join(" ")).not.toMatch(/token|secret|credential|subscription\s*url|auth\s*header|bearer|password|sqlite|raw\s/i);
    });
  });
});
