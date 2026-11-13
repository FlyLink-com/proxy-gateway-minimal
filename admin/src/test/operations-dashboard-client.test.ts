import { describe, expect, test, vi } from "vitest";
import {
  OperationsDashboardReadError,
  parseOperationsDashboardSummary,
  readOperationsDashboardSummary
} from "../app/operations-dashboard-client";

const summary = {
  schemaVersion: "operations-dashboard-summary/v1",
  generatedAt: "2026-10-24T00:00:00.000Z",
  freshness: "partial",
  sourceState: "implemented_source",
  data: {
    subscriptions: {
      availability: "ready",
      definition: "subscription_tenants",
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    },
    platformHealth: { availability: "not_connected" },
    channelCoverage: { availability: "not_connected" },
    freshnessP95: { availability: "not_connected" },
    riskCandidates: { availability: "not_connected" },
    registrationGrowth: {
      availability: "ready",
      timezone: "UTC",
      definition: "account_created_at",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-02T00:00:00.000Z",
      registeredCount: 2,
      otherCreatedCount: 0,
      points: [{
        at: "2026-10-01T00:00:00.000Z",
        registeredCount: 2,
        otherCreatedCount: 0,
        coverage: "queried"
      }]
    },
    trafficCollector: { availability: "ready", observedAt: "2026-10-20T01:02:03.000Z" }
  },
  warnings: [{ code: "source_partial" }],
  access: { allowed: true, capability: "operations.read", reasonCode: "allowed" }
};

describe("operations dashboard client", () => {
  test("accepts subscription tenant counts and rejects invented metric values", () => {
    expect(parseOperationsDashboardSummary(summary).subscriptions).toEqual({
      total: 12,
      active: 8,
      expiring: 2,
      disabledOrExpired: 2
    });
    expect(() => parseOperationsDashboardSummary({
      ...summary,
      data: { ...summary.data, platformHealth: { availability: "not_connected", value: 0 } }
    })).toThrow(OperationsDashboardReadError);
    expect(() => parseOperationsDashboardSummary({
      ...summary,
      data: { ...summary.data, nodes: [{ name: "node-secret" }] }
    })).toThrow(OperationsDashboardReadError);
    expect(() => parseOperationsDashboardSummary({
      ...summary,
      data: {
        ...summary.data,
        registrationGrowth: { availability: "not_authorized", registeredCount: 0 }
      }
    })).toThrow(OperationsDashboardReadError);
    expect(() => parseOperationsDashboardSummary({
      ...summary,
      data: {
        ...summary.data,
        trafficCollector: { availability: "unknown", observedAt: "2026-10-20T01:02:03.000Z" }
      }
    })).toThrow(OperationsDashboardReadError);
    expect(() => parseOperationsDashboardSummary({
      ...summary,
      data: {
        ...summary.data,
        trafficCollector: { availability: "ready", observedAt: "2026-10-20T01:02:03.000Z", channelRef: "channel-secret" }
      }
    })).toThrow(OperationsDashboardReadError);
  });

  test("rejects stale or unknown freshness instead of treating it as a count", () => {
    expect(() => parseOperationsDashboardSummary({ ...summary, freshness: "stale" })).toThrow(OperationsDashboardReadError);
    expect(() => parseOperationsDashboardSummary({ ...summary, freshness: "unknown" })).toThrow(OperationsDashboardReadError);
    expect(parseOperationsDashboardSummary({
      ...summary,
      data: {
        ...summary.data,
        subscriptions: { ...summary.data.subscriptions, total: 0, active: 0, expiring: 0, disabledOrExpired: 0 }
      }
    }).subscriptions).toEqual({ total: 0, active: 0, expiring: 0, disabledOrExpired: 0 });
  });

  test("maps unauthorized and unavailable responses without inventing counts", async () => {
    const forbidden = vi.fn(async () => new Response(JSON.stringify({ error: "admin_capability_required" }), {
      status: 403,
      headers: { "content-type": "application/json" }
    }));
    await expect(readOperationsDashboardSummary({ fetcher: forbidden })).rejects.toMatchObject({ code: "permission", status: 403 });
    const unauthenticated = vi.fn(async () => new Response(JSON.stringify({ error: "admin_authentication_required" }), {
      status: 401,
      headers: { "content-type": "application/json" }
    }));
    await expect(readOperationsDashboardSummary({ fetcher: unauthenticated })).rejects.toMatchObject({ code: "session", status: 401 });
    const unavailable = vi.fn(async () => new Response("nope", { status: 503 }));
    await expect(readOperationsDashboardSummary({ fetcher: unavailable })).rejects.toMatchObject({ code: "unavailable", status: 503 });
    const invalid = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ error: "invalid_query" }), { status: 400 }));
    await expect(readOperationsDashboardSummary({
      fetcher: invalid,
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-10-24T00:00:00.000Z"
    })).rejects.toMatchObject({ code: "invalid", status: 400 });
    expect(invalid.mock.calls[0]?.[0]).toBe("/api/admin/operations/dashboard-summary?from=2026-09-01T00%3A00%3A00.000Z&to=2026-10-24T00%3A00%3A00.000Z");
    const controller = new AbortController();
    controller.abort();
    const aborted = vi.fn(async () => {
      throw new DOMException("The operation was aborted.", "AbortError");
    });
    await expect(readOperationsDashboardSummary({ fetcher: aborted, signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError"
    });
  });
});
