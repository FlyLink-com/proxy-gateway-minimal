import { describe, expect, test } from "vitest";
import {
  ADMIN_APP_AUTHORING_STANDARD,
  adminAppManifest,
  adminAppAuthoringManifest,
  createAdminAppSearchDocument,
  createAdminAppSearchIndex,
  DEFAULT_ADMIN_CAPABILITY_CONTEXT,
  getAdminAppCapabilityBoundaryMatrix,
  getCapabilityScopedAdminAppMap,
  getAdminAppAuthoringManifest,
  getAdminAppMap,
  getPlannedApps,
  getPluginApp,
  getPluginApps,
  getRegisteredAdminApiHookIds,
  getUtilityApps,
  getWorkspacePageApp,
  getWorkspacePageApps,
  matchesAppSearch,
  SUPER_ADMIN_CAPABILITY_CONTEXT,
  SUPER_ADMIN_FRESH_MFA_CAPABILITY_CONTEXT
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
      "sourceContract",
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
      sourceContract: {
        dataSourceRefs: expect.arrayContaining(["platform-health-summary", "risk-case-summary"]),
        drilldownTargets: expect.arrayContaining(["dashboard#dashboard-risk-queue"]),
        evidenceRoutes: expect.arrayContaining(["risk-case"]),
        transformBoundary: "display-only"
      },
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
        allowedControls: ["hide"],
        navId: "usage-ledger",
        settingsEntry: "panelSettings",
        states: ["visible", "hidden"]
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
      followUpTask: "GCC-76 panel container template and GCC-78 workspace engine",
      primaryObjects: expect.arrayContaining(["quota policy", "total usage", "quota risk"]),
      searchableFields: expect.arrayContaining(["quota-usage", "Quota & Usage", "User Operations"]),
      sourceContract: {
        dataSourceRefs: expect.arrayContaining(["quota-policy-summary", "usage-rollup-summary"]),
        drilldownTargets: expect.arrayContaining([
          "portalRequests#user-supervision-quota-usage",
          "usageMonitor#platform-monitoring-usage-ledger"
        ]),
        evidenceRoutes: expect.arrayContaining(["quota-state", "order-ref"]),
        transformBoundary: "display-only"
      },
      zhName: "配额与使用情况"
    });
  });

  test("keeps planned apps locked and utilities separate from business pages", () => {
    expect(getPlannedApps().map((app) => app.id)).toEqual([
      "planned.audit-workflow",
      "planned.platform-development",
      "planned.system-settings",
      "planned.about",
      "privileged.key-management",
      "privileged.audit-center",
      "privileged.log-access"
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

  test("scopes privileged route, search, and API-hook registration by operator capability", () => {
    const operatorMap = getCapabilityScopedAdminAppMap(DEFAULT_ADMIN_CAPABILITY_CONTEXT);
    const operatorIds = Object.keys(operatorMap.byId).sort();
    const operatorSearchText = operatorMap.searchIndex.map((entry) => entry.searchText).join(" ");

    expect(operatorMap.plannedApps.map((app) => app.id)).toEqual([
      "planned.platform-development",
      "planned.system-settings",
      "planned.about"
    ]);
    expect(operatorIds).not.toEqual(expect.arrayContaining([
      "planned.audit-workflow",
      "privileged.key-management",
      "privileged.audit-center",
      "privileged.log-access"
    ]));
    expect(operatorSearchText).not.toMatch(/key management|audit center|log access|audit & cases/i);
    expect(getRegisteredAdminApiHookIds(DEFAULT_ADMIN_CAPABILITY_CONTEXT)).toEqual([]);

    const adminMap = getCapabilityScopedAdminAppMap({ freshMfa: false, role: "admin" });
    expect(Object.keys(adminMap.byId)).not.toEqual(expect.arrayContaining([
      "planned.audit-workflow",
      "privileged.key-management",
      "privileged.audit-center",
      "privileged.log-access"
    ]));
    expect(getRegisteredAdminApiHookIds({ freshMfa: false, role: "admin" })).toEqual([]);

    const superAdminMap = getCapabilityScopedAdminAppMap(SUPER_ADMIN_CAPABILITY_CONTEXT);
    expect(superAdminMap.plannedApps.map((app) => app.id)).toEqual(expect.arrayContaining([
      "planned.audit-workflow",
      "privileged.key-management",
      "privileged.audit-center",
      "privileged.log-access"
    ]));
    expect(getRegisteredAdminApiHookIds(SUPER_ADMIN_CAPABILITY_CONTEXT)).toEqual([
      "admin.auditSummary",
      "admin.keyMetadataSummary",
      "admin.logAccessRequestSummary"
    ]);
    expect(getRegisteredAdminApiHookIds(SUPER_ADMIN_FRESH_MFA_CAPABILITY_CONTEXT)).toEqual([
      "admin.auditDetail",
      "admin.auditSummary",
      "admin.ephemeralLogViewSession",
      "admin.keyMetadataDetail",
      "admin.keyMetadataSummary",
      "admin.logAccessRequestSummary"
    ]);
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
      expect(app.catalog.sourceContract.dataSourceRefs.length).toBeGreaterThan(0);
      expect(app.catalog.sourceContract.drilldownTargets.length).toBeGreaterThan(0);
      expect(app.catalog.sourceContract.evidenceRoutes.length).toBeGreaterThan(0);
      expect(app.catalog.sourceContract.transformBoundary).toBe("display-only");
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
      expect(JSON.stringify(app.sourceContract)).not.toMatch(forbiddenSearchTextPattern);
      expect(app.sourceContract.transformBoundary).toBe("display-only");
      expect(app.forbiddenFields).toEqual(expect.arrayContaining(["token", "credential", "SQLite row"]));
    });
  });

  test("defines source-backed panel contracts without granting execution", () => {
    const usageLedger = getPluginApp("usage-ledger", "usageMonitor");
    const riskQueue = getPluginApp("risk-queue", "dashboard");
    const environmentUtility = getUtilityApps().find((app) => app.id === "utility.environment");

    expect(usageLedger?.catalog.sourceContract).toMatchObject({
      dataSourceRefs: expect.arrayContaining(["usage-ledger-summary", "usage-rollup-summary"]),
      drilldownTargets: expect.arrayContaining([
        "usageMonitor#platform-monitoring-usage-ledger",
        "portalRequests#user-supervision-quota-usage"
      ]),
      evidenceRoutes: expect.arrayContaining(["account-ref", "order-ref", "measured-usage"]),
      transformBoundary: "display-only"
    });
    expect(riskQueue?.catalog.sourceContract).toMatchObject({
      dataSourceRefs: expect.arrayContaining(["risk-case-summary", "usage-anomaly-summary"]),
      evidenceRoutes: expect.arrayContaining(["risk-case", "receipt-state"]),
      transformBoundary: "display-only"
    });
    expect(environmentUtility?.catalog.sourceContract).toMatchObject({
      dataSourceRefs: expect.arrayContaining(["environment-status-summary", "risk-gate-summary"]),
      evidenceRoutes: expect.arrayContaining(["environment-state", "risk-gate"]),
      transformBoundary: "display-only"
    });

    for (const app of adminAppManifest) {
      const sourceContract = JSON.stringify(app.catalog.sourceContract);
      expect(sourceContract).not.toMatch(forbiddenSearchTextPattern);
      expect(app.safety.capabilities).not.toContain("execute");
      expect(app.catalog.sourceContract.transformBoundary).toBe("display-only");
    }
  });

  test("builds a capability boundary matrix without granting auth or execution", () => {
    const matrix = getAdminAppCapabilityBoundaryMatrix(DEFAULT_ADMIN_CAPABILITY_CONTEXT);
    const byId = new Map(matrix.map((entry) => [entry.appId, entry]));

    expect(matrix).toHaveLength(adminAppManifest.length);
    expect(byId.get("operations-overview")).toMatchObject({
      defaultCapabilities: expect.arrayContaining(["view", "inspect"]),
      dangerousCapabilities: expect.arrayContaining(["execute"]),
      resultType: "workspace-app",
      riskBoundary: "repo-only-ui",
      uiState: "requires-review",
      uiStateLabel: "Review suggestions"
    });
    expect(byId.get("accounts-resources")).toMatchObject({
      defaultCapabilities: expect.arrayContaining(["view", "inspect"]),
      dangerousCapabilities: expect.arrayContaining(["execute", "administer"]),
      futureCapabilities: expect.arrayContaining(["execute", "configure", "administer"]),
      uiState: "requires-review"
    });
    expect(byId.get("usage-channels")).toMatchObject({
      approvalBoundary: expect.stringContaining("Risk A"),
      defaultCapabilities: expect.arrayContaining(["view", "inspect"]),
      dangerousCapabilities: expect.arrayContaining(["execute"]),
      uiState: "requires-review"
    });
    expect(byId.get("planned.platform-development")).toMatchObject({
      resultType: "planned-app",
      riskBoundary: "risk-a-before-execution",
      uiState: "planned",
      uiStateLabel: "Planned gate"
    });
    expect(byId.get("planned.system-settings")).toMatchObject({
      dangerousCapabilities: expect.arrayContaining(["configure", "administer"]),
      uiState: "planned"
    });
    expect(byId.get("privileged.key-management")).toMatchObject({
      riskBoundary: "future-contract-required",
      uiState: "disabled",
      uiStateLabel: "Capability disabled"
    });

    matrix.forEach((entry) => {
      expect(entry.defaultCapabilities.length).toBeGreaterThan(0);
      expect(entry.dangerousCapabilities.length).toBeGreaterThan(0);
      expect(entry.futureCapabilities.length).toBeGreaterThan(0);
      expect(entry.forbiddenFields).toEqual(expect.arrayContaining(["token", "credential", "SQLite row"]));
      expect(entry.productionImpact).not.toBe("execute");
      expect(JSON.stringify({
        approvalBoundary: entry.approvalBoundary,
        routeTarget: entry.routeTarget,
        uiStateLabel: entry.uiStateLabel,
        uiStateSummary: entry.uiStateSummary
      })).not.toMatch(forbiddenSearchTextPattern);
    });
  });

  test("promotes privileged capability boundaries only after super-admin fresh MFA", () => {
    const operatorMatrix = getAdminAppCapabilityBoundaryMatrix(DEFAULT_ADMIN_CAPABILITY_CONTEXT);
    const superAdminMatrix = getAdminAppCapabilityBoundaryMatrix(SUPER_ADMIN_CAPABILITY_CONTEXT);
    const superAdminFreshMfaMatrix = getAdminAppCapabilityBoundaryMatrix(SUPER_ADMIN_FRESH_MFA_CAPABILITY_CONTEXT);

    expect(operatorMatrix.find((entry) => entry.appId === "privileged.audit-center")).toMatchObject({
      registeredApiHooks: [],
      uiState: "disabled"
    });
    expect(superAdminMatrix.find((entry) => entry.appId === "privileged.audit-center")).toMatchObject({
      registeredApiHooks: ["admin.auditSummary"],
      requiredDetailApiHooks: [],
      uiState: "requires-approval"
    });
    expect(superAdminFreshMfaMatrix.find((entry) => entry.appId === "privileged.audit-center")).toMatchObject({
      registeredApiHooks: ["admin.auditSummary"],
      requiredDetailApiHooks: ["admin.auditDetail"],
      uiState: "requires-approval"
    });
  });

  test("builds a safe system-search search index from whitelisted summary fields", () => {
    const index = createAdminAppSearchIndex();
    const usageLedger = index.find((entry) => entry.appId === "plugin.usage-ledger");
    const operationsOverview = index.find((entry) => entry.appId === "operations-overview");

    expect(usageLedger).toMatchObject({
      moduleNavId: "usage-ledger",
      pageId: "usageMonitor",
      resultType: "plugin-module",
      routeTarget: "usageMonitor#platform-monitoring-usage-ledger",
      searchableFields: expect.arrayContaining(["usage-ledger", "Usage Ledger", "Platform Monitoring"])
    });
    expect(operationsOverview).toMatchObject({
      pageId: "dashboard",
      resultType: "workspace-app",
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

  test("classifies system-search results and exposes module recovery without canvas allocation", () => {
    const index = createAdminAppSearchIndex();
    const operationsOverview = index.find((entry) => entry.appId === "operations-overview");
    const usageLedger = index.find((entry) => entry.appId === "plugin.usage-ledger");
    const adminApi = index.find((entry) => entry.appId === "utility.admin-api");
    const platformDevelopment = index.find((entry) => entry.appId === "planned.platform-development");

    expect(operationsOverview).toMatchObject({
      dataBoundary: "safe-summary-only",
      catalogGroup: "workspace-pages",
      productionImpact: "read-only",
      resultType: "workspace-app"
    });
    expect(usageLedger).toMatchObject({
      dataBoundary: "safe-summary-only",
      catalogGroup: "plugins",
      moduleRecovery: {
        action: "restore-module",
        consumesCanvasSpaceWhenHidden: false,
        source: "system-search"
      },
      productionImpact: "read-only",
      resultType: "plugin-module"
    });
    expect(adminApi).toMatchObject({
      catalogGroup: "console-settings",
      resultType: "system-action"
    });
    expect(platformDevelopment).toMatchObject({
      catalogGroup: "planned-apps",
      resultType: "planned-app"
    });

    index.forEach((entry) => {
      expect(entry.forbiddenFields).toEqual(expect.arrayContaining(["token", "credential", "SQLite row"]));
      expect(entry.searchText).not.toMatch(forbiddenSearchTextPattern);
      expect(JSON.stringify(entry.moduleRecovery ?? {})).not.toMatch(forbiddenSearchTextPattern);
    });
  });

  test("builds the system-search search index from an explicit safe document", () => {
    const usageLedger = getPluginApp("usage-ledger", "usageMonitor");
    expect(usageLedger).toBeDefined();

    const document = createAdminAppSearchDocument(usageLedger!);

    expect(document).toEqual({
      aliases: usageLedger!.aliases,
      appId: usageLedger!.id,
      capabilities: usageLedger!.safety.capabilities,
      category: usageLedger!.category,
      label: usageLedger!.label,
      catalogGroup: usageLedger!.library.group,
      ownerArea: usageLedger!.owner.area,
      routeTarget: "usageMonitor#platform-monitoring-usage-ledger",
      safeDescription: usageLedger!.description,
      searchableFields: expect.arrayContaining(["usage-ledger", "Usage Ledger", "Platform Monitoring"]),
      status: usageLedger!.status,
      zhName: usageLedger!.catalog.zhName
    });
    expect(JSON.stringify(document)).not.toMatch(forbiddenSearchTextPattern);
  });

  test("redacts unsafe system-search search document fields before indexing", () => {
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

    const document = createAdminAppSearchDocument(unsafeApp);
    const [indexEntry] = createAdminAppSearchIndex([unsafeApp]);
    const indexedText = JSON.stringify({
      document,
      indexEntry: {
        aliases: indexEntry.aliases,
        appId: indexEntry.appId,
        routeTarget: indexEntry.routeTarget,
        safeSummary: indexEntry.safeSummary,
        searchableFields: indexEntry.searchableFields,
        searchText: indexEntry.searchText,
        targetId: indexEntry.targetId,
        title: indexEntry.title
      }
    });

    expect(document.aliases).toContain("[redacted unsafe search text]");
    expect(document.searchableFields).toEqual([
      "safe field",
      "[redacted unsafe search text]",
      "[redacted unsafe search text]"
    ]);
    expect(indexEntry.searchText).toContain("safe field");
    expect(indexEntry.searchText).not.toContain("auth header bearer");
    expect(indexedText).not.toMatch(forbiddenSearchTextPattern);
    expect(indexEntry.forbiddenFields).toEqual(expect.arrayContaining(["token", "credential", "SQLite row"]));
  });
});
