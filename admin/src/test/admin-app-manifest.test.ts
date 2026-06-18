import { describe, expect, test } from "vitest";
import {
  ADMIN_APP_AUTHORING_STANDARD,
  adminAppManifest,
  adminAppAuthoringManifest,
  createAppLibrarySearchDocument,
  createAppLibrarySearchIndex,
  getAdminAppAuthoringManifest,
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

const forbiddenSearchTextPattern = /token|secret|credential|subscription\s*url|auth\s*header|bearer|password|sqlite|raw\s/i;

describe("admin app manifest", () => {
  test("defines the App Manifest authoring standard", () => {
    expect(ADMIN_APP_AUTHORING_STANDARD.requiredFields).toEqual([
      "appId",
      "title",
      "subtitle",
      "icon",
      "entryType",
      "category",
      "primaryObject",
      "capabilities",
      "routes",
      "searchFields",
      "layoutDefaults",
      "visibility",
      "riskTier",
      "dataBoundary",
      "state",
      "forbiddenFields"
    ]);
    expect(ADMIN_APP_AUTHORING_STANDARD.entryTypes).toEqual([
      "workspace-app",
      "plugin-module",
      "planned-app",
      "system-action"
    ]);
    expect(ADMIN_APP_AUTHORING_STANDARD.layoutSizes).toEqual([
      "large",
      "medium",
      "compact",
      "icon-only",
      "hidden"
    ]);
    expect(ADMIN_APP_AUTHORING_STANDARD.states).toEqual([
      "normal",
      "warning",
      "blocked",
      "readonly",
      "planned",
      "needs-config"
    ]);
    expect(ADMIN_APP_AUTHORING_STANDARD.forbiddenFields).toEqual(expect.arrayContaining([
      "token",
      "credential",
      "subscription URL",
      "SQLite row",
      "raw session/env/config/log"
    ]));
  });

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

  test("derives app authoring manifests from the app map without unsafe fields", () => {
    const authoringManifest = getAdminAppAuthoringManifest();
    const byId = new Map(authoringManifest.map((app) => [app.appId, app]));

    expect(authoringManifest).toBe(adminAppAuthoringManifest);
    expect(authoringManifest).toHaveLength(adminAppManifest.length);
    expect(new Set(authoringManifest.map((app) => app.appId)).size).toBe(authoringManifest.length);

    expect(byId.get("operations-overview")).toMatchObject({
      appId: "operations-overview",
      category: "monitoring",
      dataBoundary: "safe-summary-only",
      entryType: "workspace-app",
      icon: "grid",
      layoutDefaults: {
        defaultPinned: true,
        size: "large",
        visibility: "pinned"
      },
      primaryObject: "platform health",
      riskTier: "B",
      routes: [{
        action: "navigate",
        page: "dashboard",
        routeTarget: "dashboard"
      }],
      state: "normal",
      subtitle: "运营概览",
      title: "Operations Overview",
      visibility: "pinned"
    });
    expect(byId.get("accounts-resources")).toMatchObject({
      entryType: "workspace-app",
      primaryObject: "user account",
      subtitle: "账号与资源",
      title: "Accounts & Resources"
    });
    expect(byId.get("usage-channels")).toMatchObject({
      entryType: "workspace-app",
      primaryObject: "usage sample",
      subtitle: "使用情况和渠道",
      title: "Usage & Channels"
    });
    expect(byId.get("plugin.quota-usage")).toMatchObject({
      entryType: "plugin-module",
      layoutDefaults: {
        allowedSizes: ["large", "medium", "compact", "hidden"],
        size: "medium",
        visibility: "library"
      },
      routes: [{
        action: "openPlugin",
        page: "portalRequests",
        routeTarget: "portalRequests#user-supervision-quota-usage",
        targetId: "user-supervision-quota-usage"
      }],
      visibility: "library"
    });
    expect(byId.get("planned.platform-development")).toMatchObject({
      entryType: "planned-app",
      layoutDefaults: {
        allowedSizes: ["icon-only"],
        size: "icon-only",
        visibility: "locked"
      },
      riskTier: "A",
      state: "planned",
      visibility: "locked"
    });
    expect(byId.get("utility.admin-api")).toMatchObject({
      entryType: "system-action",
      layoutDefaults: {
        size: "icon-only",
        visibility: "library"
      },
      state: "needs-config"
    });
    expect(byId.get("utility.environment")).toMatchObject({
      entryType: "system-action",
      state: "readonly"
    });

    authoringManifest.forEach((app) => {
      expect(ADMIN_APP_AUTHORING_STANDARD.entryTypes).toContain(app.entryType);
      expect(ADMIN_APP_AUTHORING_STANDARD.layoutSizes).toContain(app.layoutDefaults.size);
      app.layoutDefaults.allowedSizes.forEach((size) => {
        expect(ADMIN_APP_AUTHORING_STANDARD.layoutSizes).toContain(size);
      });
      expect(ADMIN_APP_AUTHORING_STANDARD.states).toContain(app.state);
      expect(app.searchFields.join(" ")).not.toMatch(forbiddenSearchTextPattern);
      expect(app.forbiddenFields).toEqual(expect.arrayContaining(["token", "credential", "SQLite row"]));
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
      expect(entry.searchText).not.toMatch(forbiddenSearchTextPattern);
      expect(entry.safeSummary).not.toMatch(/token=|Bearer|password|subscriptionUrl/i);
      expect(entry.searchableFields.join(" ")).not.toMatch(forbiddenSearchTextPattern);
    });
  });

  test("builds the app-library search index from an explicit safe document", () => {
    const usageLedger = getPluginApp("usage-ledger", "usageMonitor");
    expect(usageLedger).toBeDefined();

    const document = createAppLibrarySearchDocument(usageLedger!);

    expect(document).toEqual({
      aliases: usageLedger!.aliases,
      appId: usageLedger!.id,
      capabilities: usageLedger!.safety.capabilities,
      category: usageLedger!.category,
      label: usageLedger!.label,
      libraryGroup: usageLedger!.library.group,
      ownerArea: usageLedger!.owner.area,
      routeTarget: "usageMonitor#platform-monitoring-usage-ledger",
      safeDescription: usageLedger!.description,
      searchableFields: expect.arrayContaining(["usage-ledger", "Usage Ledger", "Platform Monitoring"]),
      status: usageLedger!.status,
      zhName: usageLedger!.catalog.zhName
    });
    expect(JSON.stringify(document)).not.toMatch(forbiddenSearchTextPattern);
  });

  test("redacts unsafe app-library search document fields before indexing", () => {
    const baseline = getWorkspacePageApp("dashboard");
    expect(baseline).toBeDefined();
    const unsafeApp = {
      ...baseline!,
      aliases: ["safe alias", "Bearer token alias"],
      catalog: {
        ...baseline!.catalog,
        searchableFields: ["safe field", "raw SQLite row", "credential ref"],
        zhName: "secret console"
      },
      description: "Inspect raw config with password and subscriptionUrl.",
      id: "unsafe-token-fixture",
      label: "Subscription URL console",
      library: {
        ...baseline!.library,
        searchableText: ["auth header bearer"]
      },
      route: {
        ...baseline!.route,
        targetId: "raw-config-token"
      }
    } satisfies typeof baseline;

    const document = createAppLibrarySearchDocument(unsafeApp);
    const [indexEntry] = createAppLibrarySearchIndex([unsafeApp]);
    const indexedText = JSON.stringify({ document, indexEntry });

    expect(document.aliases).toContain("[redacted unsafe search text]");
    expect(document.searchableFields).toEqual([
      "safe field",
      "[redacted unsafe search text]",
      "[redacted unsafe search text]"
    ]);
    expect(indexEntry.searchText).toContain("safe field");
    expect(indexEntry.searchText).not.toContain("auth header bearer");
    expect(indexedText).not.toMatch(forbiddenSearchTextPattern);
  });
});
