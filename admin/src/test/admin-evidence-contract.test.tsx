import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import {
  ADMIN_EVIDENCE_SURFACE_CONTRACTS,
  findAdminEvidenceSurfaceContractIssues,
  listAdminEvidenceSurfaceContracts
} from "../app/admin-evidence-contract";
import { overviewBlueprint } from "../pages/dashboard-page";
import { PortalRequestsPage } from "../pages/portal-requests-page";
import { SubscriptionUsageMonitorPage } from "../pages/subscription-usage-monitor-page";
import { AdminConsolePageFrame } from "../pages/admin-console-page-frame";

const PROHIBITED_SENSITIVE_TEXT =
  /https?:\/\/|subscriptionUrl|token=|Bearer|raw token|raw credential|secret-value|password|edgecred_|sqlite-row-value/i;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("admin evidence surface contracts", () => {
  test("declares a bounded static contract for every current lower evidence surface", () => {
    expect(Object.keys(ADMIN_EVIDENCE_SURFACE_CONTRACTS).sort()).toEqual([
      "accountEventLog",
      "accountMetrics",
      "operationsEventLog",
      "operationsMetrics",
      "usageChannelEventLog",
      "usageMetrics"
    ]);

    const contracts = listAdminEvidenceSurfaceContracts();
    expect(contracts).toHaveLength(6);
    expect(findAdminEvidenceSurfaceContractIssues(contracts)).toEqual([]);
    expect(contracts.map((contract) => contract.ownerPage).sort()).toEqual([
      "dashboard",
      "dashboard",
      "portalRequests",
      "portalRequests",
      "usageMonitor",
      "usageMonitor"
    ]);

    contracts.forEach((contract) => {
      expect(contract.mode).toBe("design-static");
      expect(contract.backendAdapter).toBe("pending-contract");
      expect(contract.samplingWindow).toBe("7-point design placeholder");
      expect(contract.aggregation).toBe("none; visual placeholder only");
      expect(contract.threshold).toContain("backend threshold pending");
      expect(contract.emptyState).toContain("bounded empty evidence surface");
      expect(contract.staleState).toContain("without mutation");
      expect(["safe-summary-only", "safe-events-only"]).toContain(contract.redaction);
      expect(JSON.stringify(contract)).not.toMatch(PROHIBITED_SENSITIVE_TEXT);
    });
  });

  test.each([
    {
      expectedChartLegend: ["Freshness", "Coverage", "Risk"],
      expectedChartTitle: "Platform Metrics",
      expectedYAxis: "99 56 12",
      pageName: "Operations Overview",
      renderPage: () => render(<AdminConsolePageFrame blueprint={overviewBlueprint()} />)
    },
    {
      expectedChartLegend: ["Active", "Orders", "Quota"],
      expectedChartTitle: "Account Metrics",
      expectedYAxis: "12 6.5 1.0",
      pageName: "Accounts & Resources",
      renderPage: () => render(<PortalRequestsPage />)
    },
    {
      expectedChartLegend: ["Freshness", "Coverage", "Anomalies"],
      expectedChartTitle: "Usage Metrics",
      expectedYAxis: "99 50 1.0",
      pageName: "Usage & Channels",
      renderPage: () => render(<SubscriptionUsageMonitorPage />)
    }
  ])("renders $pageName evidence surfaces with DOM data contract hooks", ({
    expectedChartLegend,
    expectedChartTitle,
    expectedYAxis,
    renderPage
  }) => {
    renderPage();

    const surfaces = Array.from(document.querySelectorAll<HTMLElement>(
      "[data-figma-component='EvidenceSurface'][data-ui-surface='evidence-row']"
    ));

    expect(surfaces).toHaveLength(2);
    surfaces.forEach((surface) => {
      expect(surface.getAttribute("data-ui-role")).toBe("evidence");
      expect(surface.getAttribute("data-evidence-mode")).toBe("design-static");
      expect(surface.getAttribute("data-evidence-backend")).toBe("pending-contract");
      expect(surface.getAttribute("data-evidence-window")).toBe("7-point design placeholder");
      expect(surface.getAttribute("data-evidence-aggregation")).toBe("none; visual placeholder only");
      expect(surface.getAttribute("data-evidence-threshold")).toContain("backend threshold pending");
      expect(surface.getAttribute("data-evidence-source")).toMatch(/^safe /);
      expect(surface.getAttribute("data-evidence-redaction")).toMatch(/^safe-/);
      expect(surface.querySelector(".admin-evidence-contract-strip")).toBeNull();
      expect(surface.textContent ?? "").not.toMatch(/Design static|7-point design placeholder|safe-summary-only|safe-events-only/);
      expect(surface.textContent ?? "").not.toMatch(PROHIBITED_SENSITIVE_TEXT);
    });

    const chartSurfaces = surfaces.filter((surface) => surface.classList.contains("admin-evidence-panel-chart"));
    expect(chartSurfaces).toHaveLength(1);
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-ranges")).toBe("1m 5m 15m 1h 24h 7d 1M");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-range-dense")).toBe("1m 15m 1h 7d 1M");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-range-compact")).toBe("1m 1h 1M");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-axis")).toBe("-60m -48m -36m -24m -12m Now");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-area-width-formula")).toBe("card.width - 56");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-area-height-formula")).toBe("card.height - 80");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-grid-lines")).toBe("5");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-structure")).toBe("header legend plot axis");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-stat-count")).toBe("3");
    expect(chartSurfaces[0].getAttribute("data-evidence-time-range-rule")).toBe("right-aligned-collapsible");
    expect(chartSurfaces[0].getAttribute("data-evidence-chart-y-axis")).toBe(expectedYAxis);
    expect(chartSurfaces[0].querySelector(".admin-evidence-chart-header")).not.toBeNull();
    expect(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-legend > span")).toHaveLength(3);
    expect(chartSurfaces[0].querySelector(".admin-evidence-chart-title h2")?.textContent).toBe(expectedChartTitle);
    expect(
      Array.from(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-legend > span")).map((item) => item.textContent)
    ).toEqual(expectedChartLegend);
    expect(chartSurfaces[0].querySelector(".admin-evidence-stat-grid")).toBeNull();
    expect(chartSurfaces[0].querySelector("[data-ui-role='evidence-chart-shell']")).not.toBeNull();
    expect(chartSurfaces[0].querySelector(".admin-evidence-chart-axes")).not.toBeNull();
    expect(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-axis-line")).toHaveLength(2);
    expect(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-grid line")).toHaveLength(5);
    expect(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-axis-tick")).toHaveLength(9);
    expect(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-y-label")).toHaveLength(3);
    expect(
      Array.from(chartSurfaces[0].querySelectorAll(".admin-evidence-chart-y-label")).map((item) => item.textContent)
    ).toEqual(expectedYAxis.split(" "));
    expect(chartSurfaces[0].querySelector(".admin-evidence-time-range")?.textContent).toBe("1m5m15m1h24h7d1M");
    expect(chartSurfaces[0].querySelector(".admin-evidence-axis")?.textContent).toBe("-60m-48m-36m-24m-12mNow");

    const logSurfaces = surfaces.filter((surface) => surface.classList.contains("admin-evidence-panel-log"));
    expect(logSurfaces).toHaveLength(1);
    expect(logSurfaces[0].getAttribute("data-evidence-log-columns")).toBe("16 82 130 290");
    expect(logSurfaces[0].getAttribute("data-evidence-log-description-width-formula")).toBe("card.width - 290 - 16");
    expect(logSurfaces[0].getAttribute("data-evidence-log-divider-width-formula")).toBe("card.width - 32");
    expect(logSurfaces[0].getAttribute("data-evidence-log-header-rule")).toBe(
      "x0 y0 width-card height36 natural-title live-after-title"
    );
    expect(logSurfaces[0].querySelectorAll(".admin-evidence-log-entry")).toHaveLength(3);
    const logStatuses = Array.from(logSurfaces[0].querySelectorAll(".admin-evidence-log-status")).map((item) => item.textContent);
    expect(logStatuses).toHaveLength(3);
    expect(logStatuses.every((status) => /^(OK|INFO|WARN|ERROR|SAFE)$/.test(status ?? ""))).toBe(true);
  });
});
