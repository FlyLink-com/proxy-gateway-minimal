import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import type { AdminApiClient } from "../features/subscriptions/api-client";
import type { SubscriptionTenant } from "../features/subscriptions/types";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function tenant(overrides: Partial<SubscriptionTenant> = {}): SubscriptionTenant {
  return {
    id: "tenant_portal_1",
    displayName: "portal-user",
    status: "active",
    expiresAt: "2026-06-26T00:00:00.000Z",
    note: "portal self-service onboarding",
    nodeName: "sub-control-a",
    tokenPrefix: "pgsub_portal",
    lastUsedAt: null,
    credentialMode: "shared-node",
    ...overrides
  };
}

function adminClient(overrides: Partial<AdminApiClient> = {}): AdminApiClient {
  return {
    listTenants: async () => [],
    createTenant: async (input) => ({
      tenant: tenant({ displayName: input.displayName, note: input.note, expiresAt: input.expiresAt }),
      subscriptionUrl: "https://sub.example.test/import/visible-once"
    }),
    renewTenant: async (input) => tenant({ id: input.id, expiresAt: input.expiresAt }),
    disableTenant: async (id) => tenant({ id, status: "disabled" }),
    enableTenant: async (id) => tenant({ id, status: "active" }),
    resetToken: async (id) => ({
      tenant: tenant({ id, tokenPrefix: "pgsub_reset" }),
      subscriptionUrl: "https://sub.example.test/import/reset"
    }),
    createTempLink: async (id) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_portal",
      expiresAt: "2026-05-27T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/temp"
    }),
    listNodes: async () => [],
    overview: async () => ({
      ok: true,
      total: 0,
      active: 0,
      expiring: 0,
      expired: 0,
      disabled: 0,
      nodes: [],
      distribution: {
        mode: "subscription-v2",
        ready: true,
        eligibleNodes: 1,
        blockedNodes: 0,
        blockers: []
      }
    }),
    ...overrides
  };
}

describe("user portal route", () => {
  test("opens a separate customer portal without adding operator navigation items", async () => {
    render(createElement(App));

    expect(screen.getByLabelText("Admin navigation").textContent).not.toContain("Portal");

    fireEvent.click(screen.getByRole("link", { name: /open user portal/i }));

    expect(await screen.findByRole("heading", { name: /create your subscription/i })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });
});

describe("user portal onboarding", () => {
  test("generates a visible-once subscription from customer-facing registration fields", async () => {
    const createTenant = vi.fn(adminClient().createTenant);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(createElement(UserPortalPage, { apiClient: adminClient({ createTenant }) }));

    fireEvent.click(screen.getByRole("button", { name: /professional/i }));
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: "Customer Alpha" } });
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /generate subscription/i }));

    expect(await screen.findByText("Subscription ready")).not.toBeNull();
    expect(createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Customer Alpha",
        note: expect.stringContaining("portal plan=professional")
      })
    );
    expect(screen.getByText("https://sub.example.test/import/visible-once")).not.toBeNull();

    const result = screen.getByRole("region", { name: /subscription distribution/i });
    expect(within(result).getByText(/copy link/i)).not.toBeNull();
    expect(within(result).getAllByText(/clash/i).length).toBeGreaterThan(0);

    fireEvent.click(within(result).getByRole("button", { name: /copy link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });
});
