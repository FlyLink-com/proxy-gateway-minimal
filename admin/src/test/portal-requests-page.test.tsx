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
    expect(screen.getByText("User Operations / Accounts & Resources")).not.toBeNull();
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
    expect(sectionAnchorOrder()).toEqual([
      "user-supervision-account-overview",
      "user-supervision-resource-orders",
      "user-supervision-quota-usage",
      "user-supervision-lifecycle",
      "user-supervision-history-events"
    ]);

    expect(screen.queryByLabelText("Accounts & Resources page navigation")).toBeNull();
    expect(screen.queryByLabelText("Accounts & Resources card controls")).toBeNull();
    expect(screen.getByRole("button", { name: "Account Directory hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Resources & Orders hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Quota & Usage hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Lifecycle hide module" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "History & Events hide module" })).not.toBeNull();

    expect(screen.getByRole("heading", { name: "Account Directory" })).not.toBeNull();
    expect(document.querySelector("#user-supervision-account-overview")?.getAttribute("data-ui-role")).toBe("panel");
    expect(screen.getAllByLabelText("Management panel").length).toBe(3);
    expect(screen.getByLabelText("Configuration panel")).not.toBeNull();
    expect(screen.getByLabelText("Audit / Workflow panel")).not.toBeNull();
    expect(screen.queryByText("Quota policy panel")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-panel-field-count")).toHaveLength(0);
    expect(document.querySelectorAll(".admin-blueprint-module-title small")).toHaveLength(0);
    expect(screen.getByLabelText("Account Directory static operator content")).not.toBeNull();
    expect(screen.getByLabelText("Account Directory static table")).not.toBeNull();
    expect(screen.getByText("acct_safe_014")).not.toBeNull();
    expect(screen.getByText("Disabled account")).not.toBeNull();
    expect(screen.queryByText("Account ref · safe id")).toBeNull();
    expect(screen.queryByText("Decision owner for user accounts, resources, orders, subscription artifacts, quota, lifecycle, and safe history context.")).toBeNull();
    expect(screen.getByRole("heading", { name: "Resources & Orders" })).not.toBeNull();
    expect(screen.getByLabelText("Resources and Orders static table")).not.toBeNull();
    expect(screen.getByText("ord_safe_102")).not.toBeNull();
    expect(screen.getByText("Pending receipt")).not.toBeNull();
    expect(screen.queryByText("Artifact · safe ref presence")).toBeNull();
    expect(screen.getByRole("heading", { name: "Quota & Usage" })).not.toBeNull();
    expect(screen.getByText("82% used")).not.toBeNull();
    expect(screen.getByLabelText("ord_safe_101 quota usage 82 percent")).not.toBeNull();
    expect(screen.queryByText("Default quota · policy value")).toBeNull();
    expect(screen.getByRole("heading", { name: "Lifecycle" })).not.toBeNull();
    expect(screen.getAllByText("Archive candidate").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Order · pause / expiry candidate")).toBeNull();
    expect(screen.getByRole("heading", { name: "History & Events" })).not.toBeNull();
    expect(screen.getByText("Safe computed history")).not.toBeNull();
    expect(screen.getByText("Restricted backend locked")).not.toBeNull();
    expect(screen.queryByText("Audit · future entry slot")).toBeNull();
    expect(document.querySelectorAll(".admin-blueprint-module-notes")).toHaveLength(0);
    document.querySelectorAll(".admin-blueprint-module-notes").forEach((notes) => {
      expect(notes.hasAttribute("open")).toBe(false);
    });

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|raw token|raw credential|password|secret-value|sqlite-row-value/i);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
    expect(screen.queryByLabelText("Controlled delivery preview")).toBeNull();
    expect(screen.queryByLabelText("Traffic quota")).toBeNull();
  });

  test("renders Accounts & Resources fixture preview without executable controls", () => {
    render(<PortalRequestsPage fixturePreviewEnabled />);

    expect(screen.getByLabelText("Account Directory fixture preview")).not.toBeNull();
    expect(screen.queryByText("Safe account refs, resource count, risk state, and last safe event.")).toBeNull();
    expect(screen.getAllByText("acct_demo_02").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_safe_102").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ord_safe_103").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Quota edits remain disabled.")).toBeNull();

    const renderedText = document.body.textContent ?? "";
    expect(renderedText).not.toMatch(/https?:\/\/|subscriptionUrl|token=|raw token|secret-value|password|edgecred_/i);
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: /Generate delivery preview|Save quota|Approve|Disable|Archive/i })).toBeNull();
  });
});

function sectionAnchorOrder() {
  return Array.from(document.querySelectorAll(".page-anchor-group"))
    .map((element) => element.id);
}
