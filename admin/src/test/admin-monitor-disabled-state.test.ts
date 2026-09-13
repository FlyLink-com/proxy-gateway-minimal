import { describe, expect, test, vi } from "vitest";
import { createAdminMonitorReadClient } from "../app/admin-monitor-read-client";

describe("admin monitor disabled collection state", () => {
  test("projects collector_disabled and null bytes when usage is not_collected", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            monitor: {
              type: "subscription_usage_monitor",
              generatedAt: null,
              items: [
                {
                  accountId: "acct_local",
                  plan: "trial",
                  usageStatus: "not_collected",
                  collectionStatus: "collector_disabled",
                  usedBytes: 0,
                  lastUsageObservedAt: null,
                },
              ],
              series: { range: {}, points: [] },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await createAdminMonitorReadClient({ fetcher }).usage(new AbortController().signal);
    expect(result.items[0].status).toBe("collector_disabled");
    expect(result.items[0].usedBytes).toBeNull();
  });

  test("measured samples stay measured when collectionStatus is collector_disabled", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            monitor: {
              type: "subscription_usage_monitor",
              generatedAt: null,
              items: [
                {
                  accountId: "acct_local",
                  plan: "trial",
                  usageStatus: "measured",
                  collectionStatus: "collector_disabled",
                  usedBytes: 4096,
                  lastUsageObservedAt: "2026-09-12T00:00:00.000Z",
                },
              ],
              series: { range: {}, points: [] },
            },
          }),
          { status: 200 },
        ),
    ) as typeof fetch;

    const result = await createAdminMonitorReadClient({ fetcher }).usage(new AbortController().signal);
    expect(result.items[0].status).toBe("measured");
  });
});
