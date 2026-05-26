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
  test("opens a separate customer portal on the EqualDCDN /use-style auth shell", async () => {
    render(createElement(App));

    expect(screen.getByLabelText("Admin navigation").textContent).not.toContain("Portal");

    fireEvent.click(screen.getByRole("link", { name: /open user portal/i }));

    expect(await screen.findByRole("heading", { name: "Log in" })).not.toBeNull();
    expect(screen.getByText("欢迎回来，请登录您的账户")).not.toBeNull();
    expect(screen.getByLabelText("邮箱")).not.toBeNull();
    expect(screen.getByLabelText("密码")).not.toBeNull();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "立即注册" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });
});

describe("user portal onboarding", () => {
  test("switches between login and signup states before entering the dashboard preview", async () => {
    render(createElement(UserPortalPage, { apiClient: adminClient() }));

    fireEvent.click(screen.getByRole("button", { name: "立即注册" }));

    expect(screen.getByRole("heading", { name: "Sign up" })).not.toBeNull();
    expect(screen.getByText("创建新账户，开始使用我们的服务")).not.toBeNull();
    expect(screen.getByLabelText("验证码")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(screen.getByRole("heading", { name: "Log in" })).not.toBeNull();
  });

  test("generates a visible-once subscription from the dashboard-style use page", async () => {
    const createTenant = vi.fn(adminClient().createTenant);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(createElement(UserPortalPage, { apiClient: adminClient({ createTenant }) }));

    fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery staple" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    const portalNav = await screen.findByRole("navigation", { name: "用户中心导航" });
    expect(within(portalNav).getByText("Dashboard")).not.toBeNull();
    expect(within(portalNav).getByText("订阅管理")).not.toBeNull();
    expect(within(portalNav).getByText("开始使用")).not.toBeNull();
    expect(within(portalNav).getByText("安全清单")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "订阅管理" }));
    fireEvent.click(screen.getByRole("button", { name: /Professional/ }));
    fireEvent.change(screen.getByLabelText("用户邮箱"), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Customer Alpha" } });
    fireEvent.change(screen.getByLabelText("有效期"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "生成订阅" }));

    expect(await screen.findByText("订阅链接")).not.toBeNull();
    expect(screen.getByText("国内备用订阅链接")).not.toBeNull();
    expect(screen.getByText("应用下载")).not.toBeNull();
    expect(screen.getByText("使用步骤")).not.toBeNull();
    expect(createTenant).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: "Customer Alpha",
        note: expect.stringContaining("portal plan=professional")
      })
    );
    expect(screen.getAllByText("https://sub.example.test/import/visible-once").length).toBeGreaterThan(0);

    const result = screen.getByRole("region", { name: "开始使用" });
    expect(within(result).getAllByRole("button", { name: "复制" }).length).toBeGreaterThan(0);
    expect(within(result).getAllByText(/Clash/i).length).toBeGreaterThan(0);

    fireEvent.click(within(result).getAllByRole("button", { name: "复制" })[0]);

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });
});
