import { describe, expect, test } from "vitest";
import {
  createUsageChannelsOwnerPageModel,
  findUsageChannelsOwnerPageModelIssues,
  USAGE_CHANNELS_OWNER_MODEL_SCHEMA
} from "../app/usage-channels-owner-model";
import { ADMIN_TABLE_QUERY_STATE_SCHEMA } from "../app/admin-table-query-state";
import { usageChannelsBlueprint } from "../pages/subscription-usage-monitor-page";

describe("Usage & Channels owner page model", () => {
  test("projects the visible Usage owner sections from the accepted blueprint overview modules", () => {
    const model = createUsageChannelsOwnerPageModel(usageChannelsBlueprint);

    expect(model.schemaVersion).toBe(USAGE_CHANNELS_OWNER_MODEL_SCHEMA);
    expect(model.page).toBe("usageMonitor");
    expect(model.visibleSections.map((section) => section.navId)).toEqual([
      "freshness",
      "channel-coverage",
      "usage-ledger"
    ]);
    expect(model.deferredSections.map((section) => section.navId)).toEqual([
      "collection-anomalies",
      "receipts-collectors"
    ]);
  });

  test("attaches every visible section to the shared table query-state contract", () => {
    const model = createUsageChannelsOwnerPageModel(usageChannelsBlueprint);

    model.visibleSections.forEach((section) => {
      expect(section.query.schemaVersion).toBe(ADMIN_TABLE_QUERY_STATE_SCHEMA);
      expect(section.query.page).toBe("usageMonitor");
      expect(section.query.navId).toBe(section.navId);
      expect(section.query.routeScope).toBe(`usageMonitor#${section.targetId}`);
      expect(section.resultWindow).toMatchObject({
        firstItem: 1,
        lastItem: section.rows.length,
        pageIndex: 1,
        totalItems: section.rows.length,
        totalPages: 1
      });
      expect(section.rows.length).toBeGreaterThan(0);
    });
  });

  test("keeps usage ledger as safe display rows with no credentials or subscription material", () => {
    const model = createUsageChannelsOwnerPageModel(usageChannelsBlueprint);
    const usageLedger = model.visibleSections.find((section) => section.navId === "usage-ledger");

    expect(usageLedger).toBeTruthy();
    expect(usageLedger?.rows).toEqual([
      expect.objectContaining({
        actionLabel: "Open",
        label: "acct_001",
        meta: "Order ord_2048 · Traffic 42.8GB",
        rightMeta: "State Locked",
        statusLabel: "OK",
        tone: "success"
      }),
      expect.objectContaining({
        actionLabel: "Open",
        label: "acct_002",
        meta: "Order ord_2047 · Traffic 18.6GB",
        rightMeta: "State Measured",
        statusLabel: "OK",
        tone: "info"
      })
    ]);
    expect(JSON.stringify(model)).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i);
    expect(findUsageChannelsOwnerPageModelIssues(model)).toEqual([]);
  });
});
