import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { PortalRequestsPage } from "../pages/portal-requests-page";

afterEach(() => {
  cleanup();
});

describe("portal requests page", () => {
  test("renders Accounts & Resources as a clean user operations structure", () => {
    render(<PortalRequestsPage />);

    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getByText("Accounts & Resources / Owner Page")).not.toBeNull();
    expect(screen.getByLabelText("Accounts & Resources page header")).not.toBeNull();
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-page-id")).toBe("portalRequests");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-layout")).toBe("table");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-ui-role")).toBe("workspace");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-mobile-projection")).toBe("single-column-review-flow");
    expect(document.querySelector(".admin-blueprint-page")?.getAttribute("data-required-blocks")).toContain("evidence-row");
    expect(screen.queryByRole("button", { name: "Card settings" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Edit workspace" })).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources status dashboard")).toBeNull();
    expect(screen.queryByLabelText("Active module count")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources workspace editor")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources layout controls")).toBeNull();
    expect(screen.queryByText("Module Library")).toBeNull();
    expect(screen.queryByText("Page design notes")).toBeNull();
    expect(document.querySelector(".admin-blueprint-edit-zone")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(sectionAnchorOrder()).toEqual([
      "user-supervision-account-overview",
      "user-supervision-resource-orders",
      "user-supervision-lifecycle"
    ]);

    expect(screen.queryByLabelText("Accounts & Resources page navigation")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.queryByRole("button", { name: "Account Directory hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resources & Orders hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Quota & Usage hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Lifecycle hide module" })).toBeNull();
    expect(screen.queryByRole("button", { name: "History & Events hide module" })).toBeNull();

    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(document.querySelector("#user-supervision-account-overview")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#user-supervision-resource-orders")?.getAttribute("data-ui-role")).toBe("panel");
    expect(document.querySelector("#user-supervision-lifecycle")?.getAttribute("data-ui-role")).toBe("panel");
    expect(screen.getAllByLabelText("Management panel")).toHaveLength(3);
    expect(screen.queryByText("Quota policy panel")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-panel-field-count")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-title small")).toHaveLength(0);
    expect(screen.getByLabelText("Account Directory owner model content")).not.toBeNull();
    expect(screen.getByLabelText("Resources and Orders owner model content")).not.toBeNull();
    expect(screen.getByLabelText("Lifecycle owner model content")).not.toBeNull();
    expect(screen.queryByRole("table", { name: "Account Directory table" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Resources & Orders table" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Lifecycle table" })).toBeNull();
    expect(screen.queryByLabelText("Account Directory detail drawer")).toBeNull();
    expect(screen.queryByLabelText("Resources & Orders detail drawer")).toBeNull();
    expect(screen.queryByLabelText("Lifecycle detail drawer")).toBeNull();
    expect(screen.queryByLabelText("Account Directory static operator content")).toBeNull();
    expect(screen.queryByLabelText("Resources and Orders static operator content")).toBeNull();
    expect(screen.queryByLabelText("Lifecycle static operator content")).toBeNull();
    expect(document.querySelectorAll("[data-figma-component='DataRowCompact'][data-ui-surface='compact-row']")).toHaveLength(6);
    expect(document.querySelectorAll(".admin-panel-compact-card .admin-compact-data-row-action")).toHaveLength(0);
    expect(ownerModelRouteScopes()).toEqual([
      "portalRequests#user-supervision-account-overview",
      "portalRequests#user-supervision-resource-orders",
      "portalRequests#user-supervision-lifecycle"
    ]);
    expect(ownerModelResultWindows()).toEqual(["1-2/2", "1-2/2", "1-2/2"]);
    expect(screen.getByLabelText("Accounts & Resources evidence surfaces")).not.toBeNull();
    expect(screen.getByLabelText("Account Metrics evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Metrics" })).not.toBeNull();
    expect(screen.getByRole("img", { name: "Account Metrics safe trend" })).not.toBeNull();
    expect(screen.getByLabelText("Account Event Log evidence panel")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Event Log" })).not.toBeNull();
    expect(screen.getByText("Quota evidence attached")).not.toBeNull();
    expect(document.querySelectorAll("[data-figma-component='EvidenceSurface'][data-ui-surface='evidence-row']")).toHaveLength(2);
    expect(screen.queryByLabelText("Account Directory static table")).toBeNull();
    expect(screen.getAllByText("acct_001").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("acct_002").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_2048").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_2047").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sub_8192").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("acct_005").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("acct_safe_014")).toBeNull();
    expect(screen.queryByText("Disabled account")).toBeNull();
    expect(screen.queryByText("Account ref · safe id")).toBeNull();
    expect(screen.queryByText("Decision owner for user accounts, resources, orders, subscription artifacts, quota, lifecycle, and safe history context.")).toBeNull();
    expect(screen.queryByLabelText("Resources and Orders static table")).toBeNull();
    expect(screen.queryByText("Artifact · safe ref presence")).toBeNull();
    expect(screen.queryByRole("button", { name: "Quota & Usage hide module" })).toBeNull();
    expect(screen.queryByLabelText("Configuration panel")).toBeNull();
    expect(screen.queryByText("82% used")).toBeNull();
    expect(screen.queryByLabelText("ord_safe_101 quota usage 82 percent")).toBeNull();
    expect(screen.queryByText("Default quota · policy value")).toBeNull();
    expect(screen.queryByRole("button", { name: "Lifecycle hide module" })).toBeNull();
    expect(screen.queryByText("Archive candidate")).toBeNull();
    expect(screen.queryByText("Order · pause / expiry candidate")).toBeNull();
    expect(screen.queryByRole("button", { name: "History & Events hide module" })).toBeNull();
    expect(screen.queryByLabelText("Audit / Workflow panel")).toBeNull();
    expect(screen.queryByText("Safe computed history")).toBeNull();
    expect(screen.queryByText("Restricted backend locked")).toBeNull();
    expect(screen.queryByText("Audit · future entry slot")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|raw token|raw credential|password|secret-value|sqlite-row-value/i);
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
    expect(screen.queryByLabelText("Controlled delivery preview")).toBeNull();
    expect(screen.queryByLabelText("Traffic quota")).toBeNull();
  });

  test("ignores legacy Quota & Usage section focus on the baseline page", () => {
    render(<PortalRequestsPage activeModuleNavId="quota-usage" />);

    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getAllByLabelText("Accounts & Resources summary metrics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Accounts & Resources evidence surfaces")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Quota & Usage" })).toBeNull();
    expect(screen.queryByRole("table", { name: "Quota & Usage table" })).toBeNull();
    expect(screen.queryByLabelText("Quota & Usage detail drawer")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|raw token|raw credential|password|secret-value|sqlite-row-value/i
    );
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
  });

  test("ignores legacy History & Events section focus on the baseline page", () => {
    render(<PortalRequestsPage activeModuleNavId="history-events" />);

    expect(screen.getByRole("heading", { name: "Accounts & Resources" })).not.toBeNull();
    expect(screen.getAllByLabelText("Accounts & Resources summary metrics").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByLabelText("Accounts & Resources evidence surfaces")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "History & Events" })).toBeNull();
    expect(screen.queryByRole("table", { name: "History & Events table" })).toBeNull();
    expect(screen.queryByLabelText("History & Events detail drawer")).toBeNull();
    expect(screen.queryByLabelText("History and Events static operator content")).toBeNull();
    expect(screen.queryByText("Restricted backend locked")).toBeNull();
    expect(document.body.textContent ?? "").not.toMatch(
      /https?:\/\/|subscriptionUrl|token=|raw token|raw credential|password|secret-value|sqlite-row-value/i
    );
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive|Write note|Close case/i })).toBeNull();
  });

  test("renders Accounts & Resources fixture preview without executable controls", () => {
    render(<PortalRequestsPage fixturePreviewEnabled />);

    expect(screen.getByLabelText("Account Directory fixture preview")).not.toBeNull();
    expect(screen.getByLabelText("Resources & Orders fixture preview")).not.toBeNull();
    expect(screen.getByLabelText("Lifecycle fixture preview")).not.toBeNull();
    expect(screen.queryByText("Safe account refs, resource count, risk state, and last safe event.")).toBeNull();
    expect(screen.getAllByText("acct_demo_02").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_safe_102").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Lifecycle").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("navigation", { name: "Accounts & Resources sections" })).toBeNull();
    expect(screen.queryByText("Quota edits remain disabled.")).toBeNull();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|raw token|secret-value|password|edgecred_/i);
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}

function ownerModelRouteScopes() {
  return Array.from(document.querySelectorAll("[data-query-schema='admin-table-query-state/v1']"))
    .map((element) => element.getAttribute("data-route-scope"));
}

function ownerModelResultWindows() {
  return Array.from(document.querySelectorAll("[data-query-schema='admin-table-query-state/v1']"))
    .map((element) => element.getAttribute("data-result-window"));
}
