import { describe, expect, test } from "vitest";
import {
  ADMIN_TABLE_QUERY_STATE_SCHEMA,
  createAdminTableQueryState,
  createAdminTableQueryStates,
  findAdminTableQueryStateIssues,
  projectAdminTableResultWindow
} from "../app/admin-table-query-state";
import { createAdminSafeReadProjections } from "../app/admin-safe-read-projection";
import { overviewBlueprint } from "../pages/dashboard-page";
import { accountsResourcesBlueprint } from "../pages/portal-requests-page";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

const adminBlueprints = [
  overviewBlueprint(),
  accountsResourcesBlueprint,
  usageChannelsBlueprint
];

describe("admin table query state", () => {
  test("creates bounded query states only for modules that need pagination or route splits", () => {
    const states = createAdminTableQueryStates(adminBlueprints);

    expect(states.map((state) => `${state.page}:${state.navId}`)).toEqual([
      "dashboard:risk-queue",
      "portalRequests:account-overview",
      "portalRequests:resource-orders",
      "portalRequests:lifecycle",
      "portalRequests:history-events",
      "usageMonitor:channel-coverage",
      "usageMonitor:usage-ledger",
      "usageMonitor:partner-attribution-report",
      "usageMonitor:collection-anomalies",
      "usageMonitor:receipts-collectors"
    ]);
    states.forEach((state) => {
      expect(state.schemaVersion).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
      expect(state.dataBoundary).toBe("safe-summary-only");
      expect(state.mutationPolicy).toBe("read-only-no-mutation");
      expect(state.pageIndex).toBe(1);
      expect(state.pageSize).toBe(10);
      expect(state.maxPageSize).toBe(100);
      expect(state.sort).toEqual({ direction: "desc", key: "updatedAt" });
      expect(state.filters).toMatchObject({
        owner: "all",
        state: "all",
        tone: "all"
      });
      expect(state.filters.route).toBe(`${state.page}#${state.targetId}`);
    });
  });

  test("normalizes overrides without accepting unsafe or unknown query fields", () => {
    const projection = createAdminSafeReadProjections(adminBlueprints)
      .find((item) => item.page === "usageMonitor" && item.navId === "usage-ledger");

    expect(projection).toBeTruthy();
    const state = createAdminTableQueryState(projection!, {
      filters: {
        owner: "Usage & Channels",
        route: "raw logs",
        state: "measured",
        unsafe: "token"
      },
      pageIndex: -8,
      pageSize: 500,
      sort: {
        direction: "sideways",
        key: "rawSqliteRow"
      }
    });

    expect(state.pageIndex).toBe(1);
    expect(state.pageSize).toBe(100);
    expect(state.sort).toEqual({ direction: "desc", key: "updatedAt" });
    expect(state.filters).toEqual({
      owner: "Usage & Channels",
      route: "usageMonitor#platform-monitoring-usage-ledger",
      state: "measured",
      tone: "all"
    });
    expect(findAdminTableQueryStateIssues([state])).toEqual([]);
  });

  test("projects a stable result window for table pagination labels", () => {
    const [state] = createAdminTableQueryStates(adminBlueprints);

    expect(projectAdminTableResultWindow(state, 24)).toEqual({
      firstItem: 1,
      lastItem: 10,
      pageIndex: 1,
      totalItems: 24,
      totalPages: 3
    });
    expect(projectAdminTableResultWindow({ ...state, pageIndex: 3 }, 24)).toEqual({
      firstItem: 21,
      lastItem: 24,
      pageIndex: 3,
      totalItems: 24,
      totalPages: 3
    });
    expect(projectAdminTableResultWindow({ ...state, pageIndex: 7 }, 0)).toEqual({
      firstItem: 0,
      lastItem: 0,
      pageIndex: 1,
      totalItems: 0,
      totalPages: 1
    });
  });
});
