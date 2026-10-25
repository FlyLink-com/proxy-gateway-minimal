import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WORKSPACE_LAYOUT_VERSION } from "../app/plugin-layout-store";
import { DashboardPage } from "../pages/dashboard-page";

const WORKSPACE_LAYOUT_STORAGE_KEY = "globalcircle-admin-workspace-layout-v1";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("admin dashboard page", () => {
  test("renders a clean operations overview structure without old detail collections", () => {
    const onNavigate = vi.fn();
    const onRiskCountChange = vi.fn();

    render(<DashboardPage onNavigate={onNavigate} onRiskCountChange={onRiskCountChange} />);

    expect(screen.getByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByText("Overview / Operations Overview")).not.toBeNull();
    expect(screen.getByLabelText("Operations Overview page header")).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-contract")).toBe("page-frame");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-density")).toBe("normal");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-page-id")).toBe("dashboard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-layout")).toBe("dashboard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-role")).toBe("workspace");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-mobile-standard-status")).toBe("pending-dedicated-standard");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-responsive-standard")).toBe("desktop-tablet");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-required-blocks")).toContain("owner-action");
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Operations Overview status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(screen.queryByText("Frontend Container System")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions"
    ]);

    expect(screen.queryByLabelText("Operations Overview page navigation")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Health Summary hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue hide module" })).not.toBeNull();
    expect(screen.queryByLabelText("Risk Queue plugin display controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Large plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Medium plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue resize plugin display" })).toBeNull();

    expect(screen.getByLabelText("Monitoring panel")).not.toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-chrome")).toBe("operator");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-figma-component")).toBe("PanelFrame");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("panel-frame");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-owner-mode")).toBe("preview");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-size-preset")).toBe("standard");
    expect(screen.queryByText("Overview metric widget set")).toBeNull();
    expect(screen.getByLabelText("Operations Overview summary")).not.toBeNull();
    expect(document.querySelectorAll("#dashboard-health-summary [data-figma-component='MetricCard'][data-ui-surface='metric-card']")).toHaveLength(4);
    expect(document.querySelectorAll("#dashboard-health-summary .admin-overview-metric-card")).toHaveLength(0);
    expect(screen.getByText("Subscription tenants")).not.toBeNull();
    expect(screen.getAllByText("Reading").length).toBe(4);
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.queryByText("98.6%")).toBeNull();
    expect(screen.getByText("Platform health not connected")).not.toBeNull();
    expect(screen.getByText("Channel coverage not connected")).not.toBeNull();
    expect(screen.queryByText("Platform health · summary state")).toBeNull();
    expect(screen.queryByText("First-screen operator view for platform health, risk routing, and the next owner page.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk Queue" })).not.toBeNull();
    expect(screen.getAllByLabelText("Audit / Workflow panel").length).toBe(2);
    expect(screen.getByText("Not connected. There is no computed risk source.")).not.toBeNull();
    expect(screen.queryByText("All 18")).toBeNull();
    expect(screen.queryByText("High 5")).toBeNull();
    expect(screen.queryByText("Order traffic over limit")).toBeNull();
    expect(screen.queryByText("12 affected")).toBeNull();
    expect(screen.queryByText("Reason · quota / delay / receipt")).toBeNull();
    expect(screen.getByRole("heading", { name: "Next Actions" })).not.toBeNull();
    expect(screen.getByLabelText("Overview owner page routing content")).not.toBeNull();
    expect(screen.getByText("Audit & Cases locked")).not.toBeNull();
    expect(screen.queryByText("Audit Center")).toBeNull();
    expect(screen.queryByText("Log Access")).toBeNull();
    expect(screen.queryByText("Key Management")).toBeNull();
    expect(screen.queryByText("Wire panel routes to section-level deep links after page modules are finalized.")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-panel > .admin-blueprint-module-purpose")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-gate")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-library-next")).toHaveLength(0);
    expect(screen.queryByText("Details")).toBeNull();
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: /Open Accounts & Resources/ }));
    fireEvent.click(screen.getByRole("button", { name: /Open Usage & Channels/ }));

    expect(onNavigate).toHaveBeenCalledWith("portalRequests");
    expect(onNavigate).toHaveBeenCalledWith("usageMonitor");
    expect(onRiskCountChange).toHaveBeenCalledWith(0);
    expect(document.body.textContent ?? "").not.toMatch(/subscriptionUrl|Bearer|token=|secret|password|yaml/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Object timeline")).toBeNull();
    expect(screen.queryByText("Generate delivery preview")).toBeNull();
    expect(screen.queryByText("Save quota")).toBeNull();
  });

  test("renders real subscription tenant counts and does not invent health or coverage", async () => {
    const body = {
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
        riskCandidates: { availability: "not_connected" }
      },
      warnings: [{ code: "source_partial" }],
      access: { allowed: true, capability: "operations.read", reasonCode: "allowed" }
    };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(await screen.findByText("Updated 2026-10-24T00:00:00.000Z")).not.toBeNull();
    expect(screen.getByText("12")).not.toBeNull();
    expect(screen.getByText("8")).not.toBeNull();
    expect(screen.getAllByText("2").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Subscription tenants, not online users.")).not.toBeNull();
    expect(screen.getByText("Platform health not connected")).not.toBeNull();
    expect(screen.getByText("Channel coverage not connected")).not.toBeNull();
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.queryByText("98.6%")).toBeNull();
    expect(screen.queryByText("All 18")).toBeNull();
    vi.unstubAllGlobals();
  });

  test("renders a real zero without using it for unconnected metrics", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => summaryResponse(0, 0, 0, 0)));
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);
    expect(await screen.findByText("Updated 2026-10-24T00:00:00.000Z")).not.toBeNull();
    expect(screen.getAllByText("0")).toHaveLength(4);
    expect(screen.getByText("Platform health not connected")).not.toBeNull();
    expect(screen.queryByText("Good")).toBeNull();
    vi.unstubAllGlobals();
  });

  test("shows session and permission failures, then retries into the latest summary", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "admin_authentication_required" }, 401);
      if (calls === 2) return jsonResponse({ error: "admin_capability_required" }, 403);
      return summaryResponse(4, 3, 1, 0);
    }));
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(await screen.findAllByText("Sign-in is required.")).toHaveLength(4);
    expect(screen.getAllByText("—")).toHaveLength(4);
    expect(screen.queryByText("0")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry summary" }));

    expect(await screen.findAllByText("operations.read is required.")).toHaveLength(4);
    expect(screen.queryByText("4")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Retry summary" }));

    expect(await screen.findByText("Updated 2026-10-24T00:00:00.000Z")).not.toBeNull();
    expect(screen.getByText("4")).not.toBeNull();
    expect(screen.getByText("3")).not.toBeNull();
    expect(calls).toBe(3);
    vi.unstubAllGlobals();
  });

  test("aborts an in-flight summary when the page unmounts and does not keep its counts", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (init?.signal?.aborted) {
        abort();
        return;
      }
      init?.signal?.addEventListener("abort", abort, { once: true });
      resolveRequest = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);
    expect(screen.getAllByText("Reading")).toHaveLength(4);
    view.unmount();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: expect.any(AbortSignal) });
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    resolveRequest?.(summaryResponse(99, 1, 0, 0));
    await Promise.resolve();
    expect(document.body.textContent ?? "").not.toContain("99");
    vi.unstubAllGlobals();
  });

  test("keeps fixture preview route in operator chrome without nested preview rows", () => {
    const onRiskCountChange = vi.fn();

    render(<DashboardPage fixturePreviewEnabled onNavigate={vi.fn()} onRiskCountChange={onRiskCountChange} />);

    expect(screen.queryByLabelText("Health Summary fixture preview")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-chrome")).toBe("operator");
    expect(screen.queryByText("Metric cards for platform health, risk candidates, freshness, and channel coverage.")).toBeNull();
    expect(screen.getByText("2m 14s · stale threshold visible")).not.toBeNull();
    expect(screen.getByText("Order traffic over limit")).not.toBeNull();
    expect(screen.getAllByText("Accounts & Resources").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Overview summarizes and routes; owner pages hold detailed collections.")).toBeNull();
    expect(onRiskCountChange).toHaveBeenCalledWith(2);

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|secret-value|password|yaml|edgecred_/i);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: /Approve|Disable|Archive|Apply/i })).toBeNull();
  });

  test("supports preset-based panel layout, hiding, and restoring without drag controls", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Risk Queue Small plugin display" })).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset layout" })).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Operations Overview card controls")).toBeNull();
    expect(screen.queryByLabelText("Risk Queue plugin display controls")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue .admin-blueprint-module-panel-meta")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-chrome")).toBe("operator");
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size-preset")).toBe("standard");
    expect(screen.getByLabelText("Risk Queue layout preset controls")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue compact layout" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue standard layout" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Risk Queue wide layout" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Risk Queue full layout" })).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-panel-display-controls")).toBeNull();
    expect(document.querySelector(".admin-blueprint-module-dock")).toBeNull();
    expect(screen.queryByRole("button", { name: "Next Actions move plugin" })).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");

    fireEvent.click(screen.getByRole("button", { name: "Risk Queue wide layout" }));
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size-preset")).toBe("wide");
    expect(screen.getByRole("button", { name: "Risk Queue wide layout" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Risk Queue hide module" }));
    expect(document.querySelector("#dashboard-risk-queue")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Risk Queue module" })).toBeNull();

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-risk-queue"
      }
    }));
    expect(document.querySelector("#dashboard-risk-queue")).not.toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size-preset")).toBe("standard");

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));
    expect(document.querySelector("#dashboard-health-summary")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open Health Summary module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show Health Summary in workspace" })).toBeNull();

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-health-summary"
      }
    }));
    expect(document.querySelector("#dashboard-health-summary")).not.toBeNull();
  });

  test("uses system-search empty copy when every overview module is hidden", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));
    fireEvent.click(screen.getByRole("button", { name: "Risk Queue hide module" }));
    fireEvent.click(screen.getByRole("button", { name: "Next Actions hide module" }));

    expect(screen.getByRole("status").textContent).toContain("No modules are visible.");
    expect(screen.getByRole("status").textContent).toContain("Use system search or page controls to restore modules.");
    expect(document.body.textContent ?? "").not.toMatch(/Navigation Library|App Library|Module Library/i);
    expect(screen.queryByRole("button", { name: /Open .* module/ })).toBeNull();
  });

  test("persists fixed panel visibility locally across remounts", () => {
    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Health Summary hide module" }));

    expect(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toContain("health-summary");
    const storedLayout = JSON.parse(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY) ?? "{}");
    expect(storedLayout.dashboard.moduleOrder).toBeUndefined();
    expect(storedLayout.dashboard.moduleLayout["health-summary"]).toMatchObject({
      appId: "plugin.health-summary",
      moduleId: "health-summary",
      order: 0,
      pinned: false,
      sizePreset: "hidden",
      visible: false,
      workspaceId: "dashboard"
    });
    expect(typeof storedLayout.dashboard.moduleLayout["health-summary"].updatedAt).toBe("string");
    cleanup();

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-risk-queue",
      "dashboard-next-actions"
    ]);
    expect(document.querySelector("#dashboard-health-summary")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");

    fireEvent(window, new CustomEvent("admin-open-module", {
      detail: {
        page: "dashboard",
        targetId: "dashboard-health-summary"
      }
    }));
    expect(document.querySelector("#dashboard-health-summary")).not.toBeNull();
  });

  test("merges stored workspace layout with the current module list", () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify({
      dashboard: {
        version: WORKSPACE_LAYOUT_VERSION,
        moduleOrder: ["missing-module", "risk-queue"],
        moduleLayout: {
          "missing-module": {
            visible: true
          },
          "next-actions": {
            visible: true
          },
          "risk-queue": {
            visible: true
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions"
    ]);
    expect(document.querySelector("#dashboard-risk-queue")?.className).toContain("admin-blueprint-module-panel");
    expect(document.querySelector("#dashboard-next-actions")?.className).toContain("admin-blueprint-module-panel");
  });

  test("resets pre-visual-foundation layout cache to the current default modules", () => {
    window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, JSON.stringify({
      dashboard: {
        version: 1,
        moduleOrder: ["health-summary", "risk-queue"],
        moduleLayout: {
          "health-summary": {
            appId: "plugin.health-summary",
            moduleId: "health-summary",
            order: 0,
            pinned: false,
            sizePreset: "wide",
            updatedAt: "2026-06-21T12:00:00.000Z",
            visible: true,
            workspaceId: "dashboard"
          },
          "risk-queue": {
            appId: "plugin.risk-queue",
            moduleId: "risk-queue",
            order: 1,
            pinned: false,
            sizePreset: "standard",
            updatedAt: "2026-06-21T12:00:00.000Z",
            visible: true,
            workspaceId: "dashboard"
          },
          "next-actions": {
            appId: "plugin.next-actions",
            moduleId: "next-actions",
            order: 2,
            pinned: false,
            sizePreset: "hidden",
            updatedAt: "2026-06-21T12:00:00.000Z",
            visible: false,
            workspaceId: "dashboard"
          }
        }
      }
    }));

    render(<DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />);

    expect(sectionAnchorOrder()).toEqual([
      "dashboard-health-summary",
      "dashboard-risk-queue",
      "dashboard-next-actions"
    ]);
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-size-preset")).toBe("standard");
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-health-summary")?.getAttribute("data-ui-surface")).toBe("panel-frame");
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size")).toBeNull();
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-size-preset")).toBe("standard");
    expect(document.querySelector("#dashboard-risk-queue")?.getAttribute("data-height")).toBeNull();
    expect(document.querySelector("#dashboard-next-actions")).not.toBeNull();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function summaryResponse(total: number, active: number, expiring: number, disabledOrExpired: number) {
  return jsonResponse({
    schemaVersion: "operations-dashboard-summary/v1",
    generatedAt: "2026-10-24T00:00:00.000Z",
    freshness: "partial",
    sourceState: "implemented_source",
    data: {
      subscriptions: {
        availability: "ready",
        definition: "subscription_tenants",
        total,
        active,
        expiring,
        disabledOrExpired
      },
      platformHealth: { availability: "not_connected" },
      channelCoverage: { availability: "not_connected" },
      freshnessP95: { availability: "not_connected" },
      riskCandidates: { availability: "not_connected" }
    },
    warnings: [{ code: "source_partial" }],
    access: { allowed: true, capability: "operations.read", reasonCode: "allowed" }
  });
}

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
