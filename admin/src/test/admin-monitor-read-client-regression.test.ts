import { describe, expect, test, vi } from "vitest";

import {
  MonitorReadError,
  createAdminMonitorReadClient
} from "../app/admin-monitor-read-client";

const SIGNAL = new AbortController().signal;
const LEAK = /secret|token=|password|visible-once|cannot read|Failed to fetch|https?:\/\/|edgecred_|rawConfig/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function clientWith(fetcher: typeof fetch) {
  return createAdminMonitorReadClient({ fetcher });
}

function usageBody(monitor: Record<string, unknown> = {}) {
  return {
    monitor: {
      type: "subscription_usage_monitor",
      generatedAt: "2026-09-12T00:00:00.000Z",
      items: [],
      series: {
        type: "subscription_usage_timeseries",
        range: { from: null, to: null, bucket: "hour" },
        points: []
      },
      ...monitor
    }
  };
}

describe("admin monitor read client regressions", () => {
  test("preserves bounded Unicode plan labels and nulls unsafe plan text", async () => {
    const fetcher = vi.fn<typeof fetch>(async (url) => {
      if (String(url).endsWith("/entitlements")) {
        return jsonResponse({
          items: [{
            id: "ent_cn_plan",
            type: "platform_entitlement_summary",
            accountId: "acct_cn_plan",
            status: "active",
            plan: "100 GB 月卡",
            usable: true,
            validUntil: "2027-07-08T10:00:00.000Z"
          }, {
            id: "ent_bad_plan",
            accountId: "acct_cn_plan",
            status: "active",
            plan: "<script>secret token=leak</script>"
          }]
        });
      }
      return jsonResponse(usageBody({
        items: [{
          accountId: "acct_cn_plan",
          entitlementId: "ent_cn_plan",
          issuanceRequestId: "pareq_cn_plan",
          plan: "100 GB 月卡",
          usageStatus: "measured",
          usedBytes: 40,
          lastUsageObservedAt: "2026-09-12T01:00:00+08:00"
        }]
      }));
    });
    const client = clientWith(fetcher);
    await expect(client.entitlements(SIGNAL)).resolves.toEqual([
      {
        id: "ent_cn_plan",
        accountId: "acct_cn_plan",
        plan: "100 GB 月卡",
        status: "active",
        usable: true,
        validUntil: "2027-07-08T10:00:00.000Z"
      },
      {
        id: "ent_bad_plan",
        accountId: "acct_cn_plan",
        plan: null,
        status: "active",
        usable: null,
        validUntil: null
      }
    ]);
    const usage = await client.usage(SIGNAL);
    expect(usage.items[0]).toMatchObject({
      entitlementId: "ent_cn_plan",
      plan: "100 GB 月卡",
      status: "measured",
      usedBytes: 40,
      observedAt: "2026-09-11T17:00:00.000Z"
    });
    expect(JSON.stringify(usage.items[0])).not.toContain("pareq_cn_plan");
  });

  test("normalizes offset query datetimes that cross the UTC day", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(usageBody()));
    await clientWith(fetcher).usage(SIGNAL, {
      from: "2026-09-12T01:00:00+08:00",
      to: "2026-09-12T02:00:00+08:00"
    });
    const url = new URL(String(fetcher.mock.calls[0]?.[0]), "http://admin.local");
    expect(url.searchParams.get("from")).toBe("2026-09-11T17:00:00.000Z");
    expect(url.searchParams.get("to")).toBe("2026-09-11T18:00:00.000Z");
  });

  test.each([
    [{ from: "2026-09-12T00:00:00.000Z" }],
    [{ to: "2026-09-12T00:00:00.000Z" }],
    [{ from: "2026-09-12T00:00:00", to: "2026-09-13T00:00:00Z" }],
    [{ from: "2026-09-12", to: "2026-09-13T00:00:00.000Z" }],
    [{ from: "2026-02-30T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" }]
  ])("rejects incomplete or naive usage query %j", async (query) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(clientWith(fetcher).usage(SIGNAL, query as never)).rejects.toMatchObject({
      name: "MonitorReadError",
      code: "invalid",
      message: "Admin monitor response is invalid."
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("keeps null contagious per series metric, sums genuine zeros, and rejects overflow", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse(usageBody({
      items: [{
        accountId: "acct_zero",
        entitlementId: "ent_zero",
        plan: "monthly",
        usageStatus: "measured_zero",
        usedBytes: 0,
        lastUsageObservedAt: null
      }, {
        accountId: "acct_measured",
        entitlementId: "ent_measured",
        plan: "monthly",
        usageStatus: "measured",
        usedBytes: 40,
        lastUsageObservedAt: "2026-09-12T00:00:00.000Z"
      }],
      series: {
        range: { from: null, to: null, bucket: "hour" },
        points: [
          {
            bucketStart: "2026-09-12T00:00:00.000Z",
            channelRef: "channel-a",
            uploadBytes: 10,
            downloadBytes: 4,
            usedBytes: 0
          },
          {
            bucketStart: "2026-09-12T00:00:00.000Z",
            channelRef: "channel-b",
            uploadBytes: 20,
            downloadBytes: 6,
            usedBytes: 40
          },
          {
            bucketStart: "2026-09-12T01:00:00.000Z",
            channelRef: "channel-a",
            uploadBytes: 1,
            usedBytes: 5
          },
          {
            bucketStart: "2026-09-12T01:00:00.000Z",
            channelRef: "channel-b",
            uploadBytes: 2,
            downloadBytes: 3,
            usedBytes: 9
          },
          {
            bucketStart: "2026-09-12T02:00:00.000Z",
            channelRef: "channel-a",
            uploadBytes: Number.MAX_SAFE_INTEGER,
            downloadBytes: 1,
            usedBytes: Number.MAX_SAFE_INTEGER
          },
          {
            bucketStart: "2026-09-12T02:00:00.000Z",
            channelRef: "channel-b",
            uploadBytes: 1,
            downloadBytes: 1,
            usedBytes: 1
          }
        ]
      }
    })));
    const usage = await clientWith(fetcher).usage(SIGNAL);
    expect(usage.items.map((item) => item.usedBytes)).toEqual([0, 40]);
    expect(usage.points).toEqual([
      {
        at: "2026-09-12T00:00:00.000Z",
        uploadBytes: 30,
        downloadBytes: 10,
        totalBytes: 40
      },
      {
        at: "2026-09-12T01:00:00.000Z",
        uploadBytes: 3,
        downloadBytes: null,
        totalBytes: 14
      },
      {
        at: "2026-09-12T02:00:00.000Z",
        uploadBytes: null,
        downloadBytes: 2,
        totalBytes: null
      }
    ]);
  });

  test("always throws a fresh fixed AbortError", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new DOMException("secret token=leak", "AbortError");
    });
    const error = await clientWith(fetcher).accounts(SIGNAL).then(
      () => {
        throw new Error("expected AbortError");
      },
      (value) => value
    );
    expect(error).toMatchObject({
      name: "AbortError",
      message: "The operation was aborted."
    });
    expect(error).not.toBeInstanceOf(MonitorReadError);
    expect(String(error)).not.toMatch(LEAK);
  });

  test("classifies 401 before reading a failing error body", async () => {
    const response = new Response("secret token=leak", { status: 401 });
    const text = vi.spyOn(response, "text").mockRejectedValue(new TypeError("cannot read secret body"));
    const error = await clientWith(vi.fn<typeof fetch>(async () => response)).accounts(SIGNAL).then(
      () => {
        throw new Error("expected MonitorReadError");
      },
      (value) => value
    );
    expect(error).toBeInstanceOf(MonitorReadError);
    expect(error).toMatchObject({
      code: "session",
      message: "Admin session required."
    });
    expect(text).not.toHaveBeenCalled();
    expect(String(error)).not.toMatch(LEAK);
  });

  test("projects known account status enums or unknown without echoing secrets", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      items: [
        { id: "acct_missing_status", entitlementCount: 0, usableEntitlementCount: 0 },
        { id: "acct_pending", status: "pending_review", entitlementCount: 1, usableEntitlementCount: 0 },
        { id: "acct_untrusted_status", status: "password", entitlementCount: 0, usableEntitlementCount: 0 }
      ]
    }));
    const accounts = await clientWith(fetcher).accounts(SIGNAL);
    expect(accounts).toEqual([
      {
        id: "acct_missing_status",
        status: "unknown",
        entitlementCount: 0,
        usableEntitlementCount: 0
      },
      {
        id: "acct_pending",
        status: "pending_review",
        entitlementCount: 1,
        usableEntitlementCount: 0
      },
      {
        id: "acct_untrusted_status",
        status: "unknown",
        entitlementCount: 0,
        usableEntitlementCount: 0
      }
    ]);
    expect(JSON.stringify(accounts)).not.toMatch(LEAK);
    expect(JSON.stringify(accounts)).not.toContain("password");
  });

  test("uses collector snapshot observedAt and keeps health distinct from availability and idle condition", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({
      collectorStatus: {
        type: "traffic_collector_admin_projection",
        schemaVersion: "1",
        availability: "available",
        observedAt: "2026-07-10T13:00:00.000Z",
        collectors: [{
          health: "failed",
          condition: "runtime_down",
          sourceRef: "mihomo_usage_primary",
          channelRef: "channel-vultr-a-tuic",
          lastCollectorSuccessAt: "2026-07-01T00:00:00.000Z",
          reasonCodes: ["controller_unauthorized"]
        }, {
          health: "healthy",
          condition: "idle_no_user_traffic",
          sourceRef: "hy2_usage_primary",
          channelRef: "channel-vultr-a-hy2",
          lastCollectorSuccessAt: "2026-07-10T12:58:00.000Z",
          reasonCodes: []
        }]
      }
    }));
    const result = await clientWith(fetcher).collectors(SIGNAL);
    expect(result.state).toBe("available");
    expect(result.state).not.toBe("healthy");
    expect(result.observedAt).toBe("2026-07-10T13:00:00.000Z");
    expect(result.collectors).toEqual([
      {
        name: "channel-vultr-a-tuic",
        state: "failed",
        observedAt: "2026-07-10T13:00:00.000Z",
        reasons: ["controller_unauthorized", "runtime_down"]
      },
      {
        name: "channel-vultr-a-hy2",
        state: "healthy",
        observedAt: "2026-07-10T13:00:00.000Z",
        reasons: ["idle_no_user_traffic"]
      }
    ]);
    expect(JSON.stringify(result)).not.toContain("2026-07-01T00:00:00.000Z");
    expect(JSON.stringify(result)).not.toContain("2026-07-10T12:58:00.000Z");
  });
});
