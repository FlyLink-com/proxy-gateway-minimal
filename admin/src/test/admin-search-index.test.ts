import { describe, expect, test } from "vitest";
import { createAdminSearchResults } from "../app/admin-search-index";

describe("admin system search index", () => {
  test("searches the approved app manifest across pages and page sections with domain aliases", () => {
    const results = createAdminSearchResults({ query: "账户" });
    const resultIds = results.map((result) => result.id);

    expect(resultIds).toEqual(expect.arrayContaining([
      "accounts-resources",
      "plugin.account-overview",
      "plugin.usage-ledger"
    ]));
    expect(resultIds).not.toContain("plugin.freshness");
    expect(results.find((result) => result.id === "plugin.account-overview")).toMatchObject({
      capabilityState: "available",
      dataBoundary: "safe-summary-only",
      forbiddenFields: expect.arrayContaining(["token", "credential", "SQLite row"]),
      group: "Page sections",
      objectType: "owner section",
      ownerPage: "portalRequests",
      productionImpact: "read-only",
      route: {
        action: "open-section",
        page: "portalRequests",
        targetId: "user-supervision-account-overview"
      },
      routeTarget: "#/admin/accounts",
      safetyLevel: "safe-summary-only",
      status: "active",
      statusLabel: "Owner section",
      type: "section"
    });
    expect(results.find((result) => result.id === "plugin.usage-ledger")).toMatchObject({
      capabilityState: "available",
      dataBoundary: "safe-summary-only",
      group: "Page sections",
      objectType: "owner section",
      ownerPage: "usageMonitor",
      route: {
        action: "open-section",
        page: "usageMonitor",
        targetId: "platform-monitoring-usage-ledger"
      },
      routeTarget: "#/admin/usage",
      safetyLevel: "safe-summary-only",
      statusLabel: "Owner section",
      type: "section"
    });
    expect(results.map((result) => result.type)).not.toContain("utility");
  });

  test("keeps system settings out of active business routes without a duplicate planned gate", () => {
    const results = createAdminSearchResults({ query: "settings" });
    const userResults = createAdminSearchResults({ query: "user management" });

    expect(results.find((result) => result.id === "planned.system-settings")).toBeUndefined();
    expect(results.find((result) => result.id === "user-management")).toBeUndefined();
    expect(userResults.find((result) => result.id === "user-management")).toMatchObject({
      group: "Active pages",
      owner: "Management",
      page: "userManagement",
      routeTarget: "#/admin/user-management",
      type: "page"
    });
  });

  test("surfaces current Figma safe-read query pages as active routes", () => {
    const userResults = createAdminSearchResults({ query: "user management" });
    const orderResults = createAdminSearchResults({ query: "order management" });
    const accessLogResults = createAdminSearchResults({ query: "user access logs" });
    const operationLogResults = createAdminSearchResults({ query: "operator logs" });
    const nodeHealthResults = createAdminSearchResults({ query: "node health" });
    const nodeLogResults = createAdminSearchResults({ query: "node logs" });
    const nodeBandwidthResults = createAdminSearchResults({ query: "node bandwidth" });

    expect(userResults.find((result) => result.id === "user-management")).toMatchObject({
      capabilityState: "available",
      group: "Active pages",
      page: "userManagement",
      route: { action: "navigate", page: "userManagement" },
      routeTarget: "#/admin/user-management",
      safetyLevel: "safe-summary-only",
      type: "page"
    });
    expect(orderResults.find((result) => result.id === "order-management")).toMatchObject({
      page: "orderManagement",
      routeTarget: "#/admin/order-management",
      type: "page"
    });
    expect(accessLogResults.find((result) => result.id === "user-access-logs")).toMatchObject({
      page: "userAccessLogs",
      routeTarget: "#/admin/user-access-logs",
      type: "page"
    });
    expect(operationLogResults.find((result) => result.id === "user-operation-logs")).toMatchObject({
      page: "userOperationLogs",
      routeTarget: "#/admin/user-operation-logs",
      type: "page"
    });
    expect(nodeHealthResults.find((result) => result.id === "node-health")).toMatchObject({
      page: "nodeHealth",
      routeTarget: "#/admin/node-health",
      type: "page"
    });
    expect(nodeLogResults.find((result) => result.id === "node-logs")).toMatchObject({
      page: "nodeLogs",
      routeTarget: "#/admin/node-logs",
      type: "page"
    });
    expect(nodeBandwidthResults.find((result) => result.id === "node-bandwidth")).toMatchObject({
      page: "nodeBandwidth",
      routeTarget: "#/admin/node-bandwidth",
      type: "page"
    });
  });

  test("searches typed safe business objects by type, safe id, and business context", () => {
    const accountResults = createAdminSearchResults({ query: "user_001" });
    const orderResults = createAdminSearchResults({ query: "ord_2048" });
    const channelResults = createAdminSearchResults({ query: "hk-01" });
    const caseResults = createAdminSearchResults({ query: "case_012" });

    expect(accountResults.find((result) => result.id === "object.account.user_001")).toMatchObject({
      businessArea: "Accounts & Resources",
      capabilityState: "available",
      group: "Safe objects",
      objectType: "account",
      owner: "Accounts & Resources",
      ownerPage: "portalRequests",
      route: {
        action: "open-section",
        page: "portalRequests",
        targetId: "user-supervision-account-overview"
      },
      routeTarget: "#/admin/accounts",
      safeId: "user_001",
      safetyLevel: "safe-summary-only",
      type: "object"
    });
    expect(orderResults.find((result) => result.id === "object.order.ord_2048")).toMatchObject({
      businessArea: "Accounts & Resources",
      objectType: "order",
      ownerPage: "portalRequests",
      routeTarget: "#/admin/accounts",
      safeId: "ord_2048",
      type: "object"
    });
    expect(orderResults.find((result) => result.id === "object.quota.user_001.ord_2048")).toMatchObject({
      objectType: "quota policy",
      targetId: "user-supervision-quota-usage",
      type: "object"
    });
    expect(channelResults.find((result) => result.id === "object.channel.hk-01")).toMatchObject({
      businessArea: "Usage & Channels",
      objectType: "channel",
      ownerPage: "usageMonitor",
      routeTarget: "#/admin/usage",
      safeId: "hk-01",
      type: "object"
    });
    expect(caseResults.find((result) => result.id === "object.case.case_012")).toMatchObject({
      businessArea: "Operations Overview",
      capabilityState: "read-only",
      objectType: "case",
      ownerPage: "dashboard",
      routeTarget: "#/admin/operations",
      safeId: "case_012",
      type: "object"
    });
  });

  test("does not route node objects until a node owner page exists", () => {
    const nodeResults = createAdminSearchResults({ query: "node_hk_01" });

    expect(nodeResults).toEqual([]);
  });

  test("marks overview-only sections as read-only route launchers", () => {
    const results = createAdminSearchResults({ query: "risk queue" });

    expect(results.find((result) => result.id === "plugin.risk-queue")).toMatchObject({
      capabilityState: "read-only",
      group: "Page sections",
      objectType: "overview section",
      ownerPage: "dashboard",
      route: {
        action: "open-section",
        page: "dashboard",
        targetId: "dashboard-risk-queue"
      },
      routeTarget: "#/admin/operations",
      statusLabel: "Preview section",
      type: "section"
    });
  });

  test("routes quota owner section to the owning page without restoring legacy section routes", () => {
    const results = createAdminSearchResults({ query: "quota" });

    expect(results.find((result) => result.id === "plugin.quota-usage")).toMatchObject({
      capabilityState: "available",
      group: "Page sections",
      navId: "quota-usage",
      objectType: "owner section",
      ownerPage: "portalRequests",
      route: {
        action: "open-section",
        page: "portalRequests",
        targetId: "user-supervision-quota-usage"
      },
      routeTarget: "#/admin/accounts",
      statusLabel: "Owner section",
      type: "section"
    });
  });

  test("routes history owner section to the owning page without restoring legacy section routes", () => {
    const results = createAdminSearchResults({ query: "history" });

    expect(results.find((result) => result.id === "plugin.history-events")).toMatchObject({
      capabilityState: "available",
      group: "Page sections",
      navId: "history-events",
      objectType: "owner section",
      ownerPage: "portalRequests",
      route: {
        action: "open-section",
        page: "portalRequests",
        targetId: "user-supervision-history-events"
      },
      routeTarget: "#/admin/accounts",
      statusLabel: "Owner section",
      type: "section"
    });
  });

  test("does not match sensitive boundary terms as system search targets", () => {
    expect(createAdminSearchResults({ query: "raw logs" })).toEqual([]);
    expect(createAdminSearchResults({ query: "credential material" })).toEqual([]);
    expect(createAdminSearchResults({ query: "subscription url" })).toEqual([]);
    expect(createAdminSearchResults({ query: "sqlite row" })).toEqual([]);
  });

  test("keeps privileged and utility entries out of normal operator system search", () => {
    const results = createAdminSearchResults({ query: "admin api" });

    expect(results).toEqual([]);
    expect(createAdminSearchResults({ query: "key management" })).toEqual([]);
  });
});
