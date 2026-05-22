import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createAdminApiClient, type AdminApiClient } from "../features/subscriptions/api-client";
import { loadAdminSession, saveAdminSession } from "../features/subscriptions/admin-session";
import { ResetTokenDialog } from "../features/subscriptions/reset-token-dialog";
import { SubscriptionsPage } from "../features/subscriptions/subscriptions-page";
import type { SubscriptionTenant } from "../features/subscriptions/types";
import { NodesPage } from "../pages/nodes-page";
import { OverviewPage } from "../pages/overview-page";

afterEach(() => {
  cleanup();
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

describe("admin API client", () => {
  test("lists tenants with bearer auth and normalized base URL", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        items: [
          {
            id: "tenant_1",
            displayName: "karing-blue-sg",
            status: "active",
            expiresAt: "2026-12-31T00:00:00.000Z",
            note: "primary",
            nodeName: "aws-singapore-blue",
            tokenPrefix: "pgsub_abcdefg",
            lastUsedAt: null,
            credentialMode: "shared-node"
          }
        ]
      })
    );
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    const tenants = await client.listTenants();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3456/api/admin/subscriptions",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const init = firstCall[1];
    expect((init.headers as Headers).get("authorization")).toBe("Bearer console-secret");
    expect(tenants).toHaveLength(1);
    expect(tenants[0].nodeName).toBe("aws-singapore-blue");
  });

  test("uses same-origin API paths when base URL is blank", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const client = createAdminApiClient({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    await client.listTenants();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/subscriptions",
      expect.objectContaining({ headers: expect.any(Headers) })
    );
  });
});

describe("admin session", () => {
  test("persists local API base URL and console token in session storage", () => {
    sessionStorage.clear();

    saveAdminSession({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });

    expect(loadAdminSession()).toEqual({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "secret"
    });
  });

  test("preserves blank API base URL for same-origin proxy use", () => {
    sessionStorage.clear();

    saveAdminSession({
      baseUrl: "",
      consoleToken: "secret"
    });

    expect(loadAdminSession()).toEqual({
      baseUrl: "",
      consoleToken: "secret"
    });
  });
});

function tenant(overrides: Partial<SubscriptionTenant> = {}): SubscriptionTenant {
  return {
    id: "tenant_1",
    displayName: "real-user",
    status: "active",
    expiresAt: "2026-12-31T00:00:00.000Z",
    note: "real backend row",
    nodeName: "aws-singapore-blue",
    tokenPrefix: "pgsub_realpre",
    lastUsedAt: null,
    credentialMode: "shared-node",
    ...overrides
  };
}

function adminClient(overrides: Partial<AdminApiClient> = {}): AdminApiClient {
  return {
    listTenants: async () => [],
    createTenant: async (input) => ({ tenant: tenant({ displayName: input.displayName }), subscriptionUrl: "visible-once" }),
    renewTenant: async (input) => tenant({ id: input.id, expiresAt: input.expiresAt }),
    disableTenant: async (id) => tenant({ id, status: "disabled" }),
    enableTenant: async (id) => tenant({ id, status: "active" }),
    resetToken: async (id) => ({ tenant: tenant({ id, tokenPrefix: "pgsub_newpre" }), subscriptionUrl: "reset-url" }),
    createTempLink: async (id) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }),
    listNodes: async () => [],
    overview: async () => ({ ok: true, total: 0, active: 0, expiring: 0, expired: 0, disabled: 0, nodes: [] }),
    ...overrides
  };
}

describe("subscription page", () => {
  test("loads backend tenants and does not fabricate existing subscription URLs", async () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    const listTenants = vi.fn(async () => [tenant()]);

    render(createElement(SubscriptionsPage, { search: "", apiClient: adminClient({ listTenants }) }));

    expect(await screen.findByText("real-user")).not.toBeNull();
    fireEvent.click(screen.getByTitle("Copy subscription URL"));

    expect(writeText).not.toHaveBeenCalled();
    expect(await screen.findByText(/Full subscription URLs are only visible immediately/i)).not.toBeNull();
  });

  test("asks for confirmation before disabling and cancel does not call the API", async () => {
    const disableTenant = vi.fn(async (id: string) => tenant({ id, status: "disabled" }));
    const listTenants = vi.fn(async () => [tenant({ status: "expiring" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, disableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Disable subscription"));

    const dialog = screen.getByRole("dialog", { name: /disable subscription/i });
    expect(within(dialog).getByText("real-user")).not.toBeNull();
    expect(within(dialog).getByText(/will not be able to fetch a valid subscription/i)).not.toBeNull();
    expect(disableTenant).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(disableTenant).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /disable subscription/i })).toBeNull();
  });

  test("confirms every table path that would disable a non-disabled subscription", async () => {
    const disableTenant = vi.fn(async (id: string) => tenant({ id, status: "disabled" }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant({ status: "expired" })])
      .mockResolvedValueOnce([tenant({ status: "disabled" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, disableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Disable subscription"));
    const dialog = screen.getByRole("dialog", { name: /disable subscription/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^disable subscription$/i }));

    await waitFor(() => {
      expect(disableTenant).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText(/Disabled real-user/i)).not.toBeNull();
    expect(listTenants).toHaveBeenCalledTimes(2);
  });

  test("enables disabled subscriptions directly without danger confirmation", async () => {
    const enableTenant = vi.fn(async (id: string) => tenant({ id, status: "active" }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant({ status: "disabled" })])
      .mockResolvedValueOnce([tenant({ status: "active" })]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, enableTenant })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Enable subscription"));

    await waitFor(() => {
      expect(enableTenant).toHaveBeenCalledWith("tenant_1");
    });
    expect(screen.queryByRole("dialog", { name: /disable subscription/i })).toBeNull();
    expect(await screen.findByText(/Enabled real-user/i)).not.toBeNull();
  });

  test("asks for confirmation before creating a temporary link and cancel does not call the API", async () => {
    const createTempLink = vi.fn(async (id: string) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }));
    const listTenants = vi.fn(async () => [tenant()]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, createTempLink })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Create temporary link"));

    const dialog = screen.getByRole("dialog", { name: /create temporary link/i });
    expect(within(dialog).getByText(/temporary visible-once link/i)).not.toBeNull();
    expect(within(dialog).getByText(/does not replace the primary token/i)).not.toBeNull();
    expect(createTempLink).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));

    expect(createTempLink).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog", { name: /create temporary link/i })).toBeNull();
  });

  test("confirms temporary link generation and keeps visible-once result behavior", async () => {
    const createTempLink = vi.fn(async (id: string) => ({
      tenantId: id,
      tokenPrefix: "pgtmp_prefix",
      expiresAt: "2026-05-23T00:00:00.000Z",
      subscriptionUrl: "temp-url"
    }));
    const listTenants = vi
      .fn()
      .mockResolvedValueOnce([tenant()])
      .mockResolvedValueOnce([tenant()]);

    render(createElement(SubscriptionsPage, {
      search: "",
      apiClient: adminClient({ listTenants, createTempLink })
    }));

    expect(await screen.findByText("real-user")).not.toBeNull();

    fireEvent.click(screen.getByTitle("Create temporary link"));
    const dialog = screen.getByRole("dialog", { name: /create temporary link/i });
    fireEvent.click(within(dialog).getByRole("button", { name: /^create temporary link$/i }));

    await waitFor(() => {
      expect(createTempLink).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText("Temporary link for real-user")).not.toBeNull();
    expect(screen.getByText("temp-url")).not.toBeNull();
    expect(listTenants).toHaveBeenCalledTimes(2);
  });
});

describe("reset token dialog", () => {
  test("shows reset consequences and cancel does not call reset", () => {
    const onReset = vi.fn(async (id: string) => ({
      tenant: tenant({ id }),
      subscriptionUrl: "reset-url"
    }));
    const onClose = vi.fn();

    render(createElement(ResetTokenDialog, {
      tenant: tenant(),
      onClose,
      onReset
    }));

    expect(screen.getByText(/invalidates the previous subscription URL/i)).not.toBeNull();
    expect(screen.getByText(/visible once/i)).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onReset).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test("confirms reset and keeps visible-once result behavior", async () => {
    const onReset = vi.fn(async (id: string) => ({
      tenant: tenant({ id, tokenPrefix: "pgsub_newpre" }),
      subscriptionUrl: "reset-url"
    }));

    render(createElement(ResetTokenDialog, {
      tenant: tenant(),
      onClose: vi.fn(),
      onReset
    }));

    fireEvent.click(screen.getByRole("button", { name: /confirm reset token/i }));

    await waitFor(() => {
      expect(onReset).toHaveBeenCalledWith("tenant_1");
    });
    expect(await screen.findByText("reset-url")).not.toBeNull();
  });
});

describe("overview and nodes pages", () => {
  test("loads overview and nodes from backend endpoints", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, total: 1, active: 1, expiring: 0, expired: 0, disabled: 0, nodes: [] }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "node_sg", name: "aws-singapore-blue", status: "online" }] }));
    const client = createAdminApiClient({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "secret",
      fetcher: fetchMock
    });

    expect((await client.overview()).active).toBe(1);
    expect((await client.listNodes())[0].name).toBe("aws-singapore-blue");
  });

  test("renders backend overview metrics and node rows", async () => {
    const client = adminClient({
      overview: async () => ({ ok: true, total: 3, active: 2, expiring: 1, expired: 0, disabled: 0, nodes: [] }),
      listNodes: async () => [{ id: "node_sg", name: "aws-singapore-blue", status: "online" }]
    });

    const { unmount } = render(createElement(OverviewPage, { apiClient: client }));
    expect(await screen.findByText("3")).not.toBeNull();
    expect(await screen.findByText("2")).not.toBeNull();
    unmount();

    render(createElement(NodesPage, { apiClient: client }));
    expect(await screen.findByText("aws-singapore-blue")).not.toBeNull();
    expect(await screen.findByText("online")).not.toBeNull();
  });
});
