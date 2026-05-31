import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { App } from "../App";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import {
  createLocalUserPortalClient,
  type PortalAuthInput,
  type PortalSession,
  type PortalSubscriptionRequest,
  type PortalSubscriptionRequestInput,
  type UserPortalClient
} from "../features/user-portal/user-portal-client";

afterEach(() => {
  cleanup();
  window.location.hash = "";
  vi.restoreAllMocks();
});

function portalClient(overrides: Partial<UserPortalClient> = {}): UserPortalClient {
  return {
    authenticate: vi.fn(async (input: PortalAuthInput): Promise<PortalSession> => ({
      status: "authenticated_preview",
      userRef: "user_safe_ref",
      displayName: input.email.split("@")[0],
      authMode: input.mode,
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noRawPasswordReturned: true
      }
    })),
    requestSubscription: vi.fn(async (input: PortalSubscriptionRequestInput): Promise<PortalSubscriptionRequest> => ({
      status: "ready_for_operator_review",
      requestRef: "subreq_safe_ref",
      userRef: input.userRef,
      planId: input.planId,
      clientTarget: input.clientTarget,
      expiresAt: "2026-06-26T00:00:00.000Z",
      nextAction: "operator_review_required",
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    })),
    ...overrides
  };
}

async function enterPortalDashboard() {
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "customer@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery staple" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  return screen.findByRole("navigation", { name: "用户中心导航" });
}

describe("user portal route", () => {
  test("opens a separate customer portal without Admin navigation", async () => {
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
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    fireEvent.click(screen.getByRole("button", { name: "立即注册" }));

    expect(screen.getByRole("heading", { name: "Sign up" })).not.toBeNull();
    expect(screen.getByText("创建新账户，开始使用我们的服务")).not.toBeNull();
    expect(screen.getByLabelText("验证码")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(screen.getByRole("heading", { name: "Log in" })).not.toBeNull();
  });

  test("requests a subscription through a user-scoped portal client instead of Admin APIs", async () => {
    const client = portalClient();

    render(createElement(UserPortalPage, { portalClient: client }));

    const portalNav = await enterPortalDashboard();
    expect(within(portalNav).getByText("Dashboard")).not.toBeNull();
    expect(within(portalNav).getByText("订阅管理")).not.toBeNull();
    expect(within(portalNav).getByText("开始使用")).not.toBeNull();
    expect(within(portalNav).getByText("安全清单")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "订阅管理" }));
    fireEvent.click(screen.getByRole("button", { name: /Professional/ }));
    fireEvent.change(screen.getByLabelText("用户邮箱"), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Customer Alpha" } });
    fireEvent.change(screen.getByLabelText("有效期"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: "提交订阅申请" }));

    expect(await screen.findByText("订阅申请已提交，等待运营授权")).not.toBeNull();
    expect(client.requestSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        displayName: "Customer Alpha",
        email: "customer@example.com",
        planId: "professional",
        clientTarget: "clash",
        durationDays: 90
      })
    );
    expect(screen.queryByText(/https:\/\/sub\.example\.test/)).toBeNull();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });

  test("local portal client is safe by default and does not return subscription material", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-29T00:00:00.000Z")
    });

    const session = await client.authenticate({
      mode: "login",
      email: "customer@example.com",
      password: "correct horse battery staple"
    });
    const request = await client.requestSubscription({
      userRef: session.userRef,
      displayName: "Customer Alpha",
      email: "customer@example.com",
      planId: "professional",
      clientTarget: "clash",
      durationDays: 30
    });

    expect(session.userRef).toMatch(/^user_/);
    expect(session).not.toHaveProperty("password");
    expect(request.status).toBe("ready_for_operator_review");
    expect("subscriptionUrl" in request).toBe(false);
    expect(request.safety.noAdminApi).toBe(true);
    expect(request.safety.noDbMutation).toBe(true);
  });

  test("default local portal UI submits requests without exposing subscription links", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-29T00:00:00.000Z")
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "订阅管理" }));
    fireEvent.change(screen.getByLabelText("用户邮箱"), { target: { value: "customer@example.com" } });
    fireEvent.change(screen.getByLabelText("显示名称"), { target: { value: "Customer Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: "提交订阅申请" }));

    expect(await screen.findByText("订阅申请已提交，等待运营授权")).not.toBeNull();
    expect(screen.getByText(/用户面板只显示安全状态，不直接展示订阅链接。/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
    expect(screen.queryByText(/subscriptionUrl|token=|https:\/\/sub/i)).toBeNull();
  });

  test("renders device onboarding guides and user-facing FAQ", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "开始使用" }));

    expect(screen.getByText("订阅导入指南")).not.toBeNull();
    expect(screen.getByText("Windows / macOS")).not.toBeNull();
    expect(screen.getByText("iOS / Android")).not.toBeNull();
    expect(screen.getByText("常见问题")).not.toBeNull();
    expect(screen.getByText("更新订阅失败怎么办？")).not.toBeNull();
    expect(screen.getByText("为什么有些网站仍显示原 IP？")).not.toBeNull();
  });

  test("separates recommended and forbidden safety actions", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "安全清单" }));

    expect(screen.getByText("正确做法")).not.toBeNull();
    expect(screen.getByText("禁止做法")).not.toBeNull();
    expect(screen.getByText("保持受控配置私密，仅在自己的设备中导入。")).not.toBeNull();
    expect(screen.getByText("不要共享受控配置或账号。")).not.toBeNull();
  });

  test("shows support and profile placeholders without implying live integrations", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortalDashboard();
    fireEvent.click(screen.getByRole("button", { name: "客服支持" }));

    expect(screen.getByText("工单系统")).not.toBeNull();
    expect(screen.getByText("邮箱支持")).not.toBeNull();
    expect(screen.getByText("即时消息")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("设备管理")).not.toBeNull();
    expect(screen.getByText("账单记录")).not.toBeNull();
    expect(screen.getByText("账号安全")).not.toBeNull();
  });
});
