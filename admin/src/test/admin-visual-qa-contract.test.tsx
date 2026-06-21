import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../App";
import { pageSubNavigation, type AdminPage } from "../app/navigation";
import { ADMIN_VISUAL_QA_AXES } from "../design/figma-mirror";
import { DashboardPage } from "../pages/dashboard-page";
import { PortalRequestsPage } from "../pages/portal-requests-page";
import { SubscriptionUsageMonitorPage } from "../pages/subscription-usage-monitor-page";

const PROHIBITED_SENSITIVE_TEXT =
  /https?:\/\/|subscriptionUrl|token=|Bearer|raw token|raw credential|secret-value|password|edgecred_|sqlite-row-value/i;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.location.hash = "";
  vi.unstubAllGlobals();
});

describe("admin visual QA contract", () => {
  test("renders the fixture shell as a QA-safe desktop workbench surface", async () => {
    vi.stubGlobal("fetch", vi.fn());
    window.location.hash = "#/fixture-preview";

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(document.querySelector("[data-ui-role='system'][data-ui-contract='app-shell']")).not.toBeNull();
    expect(document.querySelector("[data-ui-surface='top-bar'][data-figma-component='TopBar']")).not.toBeNull();
    expect(document.querySelector("[data-ui-surface='privileged-gate'][data-figma-component='PrivilegedGate']")).not.toBeNull();
    expect(document.querySelector("[data-ui-surface='privileged-gate']")?.getAttribute("data-gate-state")).toBe("gated");
    expect(document.querySelector(".admin-content")).not.toBeNull();
    expect(screen.getByLabelText("Workspace sidebar")).not.toBeNull();
    expect(screen.getByLabelText("Open navigation library")).not.toBeNull();
    expect(screen.getByLabelText("Operator account")).not.toBeNull();
    expect(screen.getByLabelText("Admin fixture preview status")).not.toBeNull();
    expect(screen.queryByLabelText("Console status bar")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByText("App Library")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(document.querySelector(".admin-blueprint-module-dock")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(PROHIBITED_SENSITIVE_TEXT);

    assertNamedInteractiveControls();
  });

  test.each([
    {
      page: "dashboard" as const,
      expectedLayout: "dashboard",
      renderPage: () => render(
        <DashboardPage fixturePreviewEnabled onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />
      )
    },
    {
      page: "portalRequests" as const,
      expectedLayout: "table",
      renderPage: () => render(<PortalRequestsPage fixturePreviewEnabled />)
    },
    {
      page: "usageMonitor" as const,
      expectedLayout: "dashboard",
      renderPage: () => render(<SubscriptionUsageMonitorPage fixturePreviewEnabled />)
    }
  ])("keeps $page panels aligned with page ownership and mirror QA hooks", ({ page, expectedLayout, renderPage }) => {
    renderPage();

    const workspace = document.querySelector(".admin-blueprint-page");
    expect(workspace?.getAttribute("data-ui-role")).toBe("workspace");
    expect(workspace?.getAttribute("data-page-id")).toBe(page);
    expect(workspace?.getAttribute("data-layout")).toBe(expectedLayout);
    expect(workspace?.getAttribute("data-mobile-projection")).toBe("single-column-review-flow");
    expect(workspace?.getAttribute("data-required-blocks")).toMatch(/page-title|primary-panel/);

    const panels = Array.from(document.querySelectorAll("[data-ui-role='panel']"));
    expect(panels).toHaveLength(pageSubNavigation[page].length);
    expect(panels.map((panel) => panel.getAttribute("data-module-nav-id"))).toEqual(
      pageSubNavigation[page].map((section) => section.id)
    );
    expect(panels.map((panel) => panel.id)).toEqual(
      pageSubNavigation[page].map((section) => section.targetId)
    );

    panels.forEach((panel) => {
      expect(panel.getAttribute("data-ui-contract")).toBe("panel-frame");
      expect(panel.getAttribute("data-figma-component")).toBe("PanelFrame");
      expect(panel.getAttribute("data-ui-surface")).toBe("panel-frame");
      expect(panel.getAttribute("data-owner-mode")).toMatch(/preview|owner/);
      expect(panel.getAttribute("data-workbench-category")).toMatch(/monitoring|management|configuration|audit-workflow|platform-tools/);
      expect(panel.getAttribute("data-density")).toBe("normal");
      expect(panel.getAttribute("aria-label")).toMatch(/panel/i);
      if (page === "dashboard") {
        expect(panel.getAttribute("data-chrome")).toBe("operator");
        expect(panel.querySelector(".admin-blueprint-module-panel-head")).toBeNull();
      } else {
        expect(panel.getAttribute("data-chrome")).toBe("draft");
        expect(panel.querySelector(".admin-blueprint-module-panel-head")).not.toBeNull();
      }
      expect(panel.querySelector(".admin-blueprint-panel-display-controls")).toBeNull();
      expect(panel.querySelector(".admin-blueprint-module-notes")).toBeNull();
    });

    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(document.querySelector(".admin-blueprint-module-dock")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(PROHIBITED_SENSITIVE_TEXT);
    assertNamedInteractiveControls();
  });

  test("keeps automated QA coverage aligned with the Figma mirror evidence axes", () => {
    expect(ADMIN_VISUAL_QA_AXES).toEqual(expect.arrayContaining([
      "figma-mirror",
      "dom-contract",
      "browser-desktop",
      "browser-mobile",
      "style-token-regression",
      "safe-data-boundary"
    ]));
  });
});

function assertNamedInteractiveControls() {
  const interactiveControls = Array.from(
    document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, summary, [role='button']")
  );
  expect(interactiveControls.length).toBeGreaterThan(0);

  interactiveControls.forEach((control) => {
    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("placeholder"),
      control.textContent
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    expect(label).not.toBe("");
  });
}
