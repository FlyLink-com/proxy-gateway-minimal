import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminOperationsShell } from "../pages/admin-operations-shell";

function dashboardSummaryResponse() {
  return new Response(JSON.stringify({
    schemaVersion: "operations-dashboard-summary/v1",
    generatedAt: "2026-11-12T00:00:00.000Z",
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
        from: "2026-11-11T00:00:00.000Z",
        to: "2026-11-12T00:00:00.000Z",
        registeredCount: 9,
        otherCreatedCount: 8,
        points: [{
          at: "2026-11-11T00:00:00.000Z",
          registeredCount: 9,
          otherCreatedCount: 8,
          coverage: "queried"
        }]
      },
      trafficCollector: {
        availability: "ready",
        observedAt: "2026-11-11T10:00:00.000Z"
      }
    },
    warnings: [{ code: "source_partial" }],
    access: { allowed: true, capability: "operations.read", reasonCode: "allowed" }
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("admin operations dashboard integration", () => {
  afterEach(() => {
    cleanup();
    window.location.hash = "";
    vi.unstubAllGlobals();
  });

  test("renders the live summary through the real AdminMonitorWorkspace dashboard branch", async () => {
    window.location.hash = "#/admin/dashboard";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/admin/operations/dashboard-summary");
      return dashboardSummaryResponse();
    });
    vi.stubGlobal("fetch", fetcher);

    render(<AdminOperationsShell />);

    expect(screen.getByRole("button", { name: "开始只读监控" })).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "Registration trend" })).not.toBeNull();
    expect(screen.getByText(/Portal registrations 9/)).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Traffic collector" })).not.toBeNull();
    expect(screen.getByText("Observed 2026-11-11T10:00:00.000Z")).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/admin/operations/dashboard-summary",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store"
      })
    );
  });
});
