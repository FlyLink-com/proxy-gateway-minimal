import { describe, expect, test } from "vitest";
import {
  createUsageChannelsOwnerPageModel,
  findUsageChannelsOwnerPageModelIssues,
  USAGE_CHANNELS_OWNER_MODEL_SCHEMA
} from "../app/usage-channels-owner-model";
import { ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA } from "../app/admin-safe-read-page-model";
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
    expect(model.safeReadModel.schemaVersion).toBe(ADMIN_SAFE_READ_PAGE_MODEL_SCHEMA);
    expect(model.safeReadModel.visibleSectionIds).toEqual(model.visibleSections.map((section) => section.navId));
    expect(model.safeReadModel.deferredSectionIds).toEqual(model.deferredSections.map((section) => section.navId));
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
        meta: "42.8GB locked",
        rightMeta: "",
        statusLabel: "Locked",
        tone: "info"
      }),
      expect.objectContaining({
        actionLabel: "Open",
        label: "acct_002",
        meta: "18.6GB",
        rightMeta: "",
        statusLabel: "Measured",
        tone: "info"
      })
    ]);
    expect(JSON.stringify(model)).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret|password|credential|edgecred_|raw logs?|sqlite/i);
    expect(findUsageChannelsOwnerPageModelIssues(model)).toEqual([]);
  });
});
