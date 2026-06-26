import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import {
  createAdminModuleContracts,
  findAdminModuleContractIssues
} from "../app/admin-module-contract";
import { getAdminAppMap } from "../app/admin-app-manifest";
import { ADMIN_PAGINATION_STANDARD } from "../app/admin-ui-standards";
import { pageSubNavigation, pageWorkbenchContracts } from "../app/navigation";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const adminBlueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin module contract", () => {
  test("keeps module contracts independent from page component imports", () => {
    const source = readFileSync("src/app/admin-module-contract.ts", "utf8");

    expect(source).toContain("from \"./admin-ui-projection\"");
    expect(source).not.toContain("../pages/");
  });

  test("keeps page blueprints, navigation modules, and plugin manifests aligned", () => {
    const issues = findAdminModuleContractIssues(adminBlueprints);

    expect(issues).toEqual([]);
  });

  test("creates one contract record per visible module with route and source contract metadata", () => {
    const contracts = createAdminModuleContracts(adminBlueprints);
    const expectedContracts = Object.values(pageSubNavigation).flatMap((modules) => modules);

    expect(contracts).toHaveLength(expectedContracts.length);
    expect(contracts.map((contract) => `${contract.page}:${contract.navId}:${contract.targetId}`)).toEqual([
      "dashboard:health-summary:dashboard-health-summary",
      "dashboard:risk-queue:dashboard-risk-queue",
      "dashboard:next-actions:dashboard-next-actions",
      "dashboard:review-candidates:dashboard-review-candidates",
      "portalRequests:account-overview:user-supervision-account-overview",
      "portalRequests:resource-orders:user-supervision-resource-orders",
      "portalRequests:quota-usage:user-supervision-quota-usage",
      "portalRequests:lifecycle:user-supervision-lifecycle",
      "portalRequests:history-events:user-supervision-history-events",
      "usageMonitor:freshness:platform-monitoring-freshness",
      "usageMonitor:channel-coverage:platform-monitoring-channel-coverage",
      "usageMonitor:usage-ledger:platform-monitoring-usage-ledger",
      "usageMonitor:collection-anomalies:platform-monitoring-anomalies",
      "usageMonitor:receipts-collectors:platform-monitoring-receipts-collectors"
    ]);

    contracts.forEach((contract) => {
      expect(contract.manifestId).toBe(`plugin.${contract.navId}`);
      expect(contract.pageRole).toBe(pageWorkbenchContracts[contract.page].role);
      expect(contract.sourceContract.dataSourceRefs.length).toBeGreaterThan(0);
      expect(contract.sourceContract.drilldownTargets).toContain(`${contract.page}#${contract.targetId}`);
      expect(contract.sourceContract.evidenceRoutes.length).toBeGreaterThan(0);
      expect(contract.sourceContract.transformBoundary).toBe("display-only");
      expect([
        "not-applicable",
        ...ADMIN_PAGINATION_STANDARD.containmentStrategies
      ]).toContain(contract.containmentStrategy);
      if (contract.containmentStrategy === "not-applicable") {
        expect(contract.paginationStandardId).toBeUndefined();
      } else {
        expect(contract.paginationStandardId).toBe(ADMIN_PAGINATION_STANDARD.id);
      }
    });
  });

  test("declares containment strategy for every module before long content implementation", () => {
    const contracts = createAdminModuleContracts(adminBlueprints);

    expect(Object.fromEntries(contracts.map((contract) => [
      `${contract.page}:${contract.navId}`,
      contract.containmentStrategy
    ]))).toEqual({
      "dashboard:health-summary": "not-applicable",
      "dashboard:risk-queue": "pagination",
      "dashboard:next-actions": "not-applicable",
      "dashboard:review-candidates": "pagination",
      "portalRequests:account-overview": "pagination",
      "portalRequests:resource-orders": "pagination",
      "portalRequests:quota-usage": "not-applicable",
      "portalRequests:lifecycle": "route-split",
      "portalRequests:history-events": "pagination",
      "usageMonitor:freshness": "not-applicable",
      "usageMonitor:channel-coverage": "pagination",
      "usageMonitor:usage-ledger": "pagination",
      "usageMonitor:collection-anomalies": "pagination",
      "usageMonitor:receipts-collectors": "pagination"
    });
  });

  test("keeps every blueprint module attached to an external UI reference surface", () => {
    adminBlueprints.forEach((blueprint) => {
      blueprint.modules.forEach((module) => {
        expect(module.uiSurface).toBeTruthy();
        expect(module.containmentStrategy).toBeTruthy();
      });
    });
  });

  test("does not leave orphan plugin routes outside the page blueprint contract", () => {
    const appMap = getAdminAppMap();
    const contractRoutes = new Set(
      createAdminModuleContracts(adminBlueprints, appMap).map((contract) => (
        `${contract.page}:${contract.navId}:${contract.targetId}`
      ))
    );

    appMap.plugins.forEach((plugin) => {
      expect(contractRoutes.has(`${plugin.route.page}:${plugin.plugin?.navId}:${plugin.route.targetId}`)).toBe(true);
    });
  });
});
