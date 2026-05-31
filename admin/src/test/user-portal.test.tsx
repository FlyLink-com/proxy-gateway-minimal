import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../App";
import { UserPortalPage } from "../features/user-portal/user-portal-page";
import {
  createLocalUserPortalClient,
  type PortalAuthInput,
  type PortalApplySubscriptionInput,
  type PortalContactInfo,
  type PortalContactInfoUpdate,
  type PortalRefreshSubscriptionInput,
  type PortalSession,
  type PortalSubscriptionRequest,
  type PortalUserState,
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
      registeredAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPublicAuthActivated: true,
        noRawPasswordReturned: true
      }
    })),
    fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
      userRef: input.userRef,
      contactInfo: null,
      subscriptionRequest: null,
      historySummary: [],
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    })),
    updateContactInfo: vi.fn(async (input: { userRef: string; contact: PortalContactInfo }): Promise<PortalContactInfoUpdate> => ({
      userRef: input.userRef,
      contact: input.contact,
      updatedAt: "2026-05-31T00:00:00.000Z",
      safety: {
        noAdminApi: true,
        noPaymentActivation: true,
        noPublicAdmin: true
      }
    })),
    applyForSubscription: vi.fn(async (input: PortalApplySubscriptionInput): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: `subreq_${input.planId}`,
      userRef: input.userRef,
      planId: input.planId,
      clientTarget: input.clientTarget,
      expiresAt: input.planId === "yearly" ? "2027-05-31T00:00:00.000Z" : "2026-06-30T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/visible-once",
      nextAction: "copy_subscription_url",
      updatedAt: "2026-05-31T00:00:00.000Z",
      historySummary: [
        {
          recordRef: `history_${input.planId}`,
          label: `申请${input.planId === "yearly" ? "年卡" : "月卡"}（已授权）`,
          status: "已授权",
          occurredAt: "2026-05-31T00:00:00.000Z"
        }
      ],
      safety: {
        noAdminApi: true,
        noDbMutation: true,
        noPaymentActivation: true,
        noPublicAdmin: true,
        noRawCustomerDataReturned: true
      }
    })),
    refreshSubscription: vi.fn(async (input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
      status: "subscription_ready",
      lifecycle: "active",
      requestRef: input.requestRef,
      userRef: input.userRef,
      planId: "yearly",
      clientTarget: input.clientTarget,
      expiresAt: "2027-05-31T00:00:00.000Z",
      subscriptionUrl: "https://sub.example.test/import/refreshed-visible-once",
      nextAction: "copy_subscription_url",
      updatedAt: "2026-05-31T00:00:00.000Z",
      event: {
        type: "old_link_invalidated",
        occurredAt: "2026-05-31T00:00:00.000Z"
      },
      historySummary: [
        {
          recordRef: "history_refresh",
          label: "刷新订阅（已刷新）",
          status: "已刷新",
          occurredAt: "2026-05-31T00:00:00.000Z"
        }
      ],
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

async function enterPortal() {
  fireEvent.change(screen.getByLabelText("邮箱"), { target: { value: "customer@example.com" } });
  fireEvent.change(screen.getByLabelText("密码"), { target: { value: "correct horse battery staple" } });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  return screen.findByRole("navigation", { name: "用户中心导航" });
}

async function fillContactInfo() {
  fireEvent.click(screen.getByRole("button", { name: "填写联系资料" }));
  fireEvent.change(screen.getByLabelText("联系手机号"), { target: { value: "+86 138 0013 8000" } });
  fireEvent.change(screen.getByLabelText("Telegram 账号"), { target: { value: "@customer_support" } });
  fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "填写联系资料" })).toBeNull());
}

describe("user portal route", () => {
  test("opens a separate customer portal without Admin navigation", async () => {
    render(createElement(App));

    expect(screen.getByLabelText("Admin navigation").textContent).not.toContain("Portal");

    fireEvent.click(screen.getByRole("link", { name: /open user portal/i }));

    expect(await screen.findByRole("heading", { name: "登录" })).not.toBeNull();
    expect(screen.getByText("登录后管理你的套餐和订阅。")).not.toBeNull();
    expect(screen.getByLabelText("邮箱")).not.toBeNull();
    expect(screen.getByLabelText("密码")).not.toBeNull();
    expect(screen.getByRole("button", { name: "登录" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "立即注册" })).not.toBeNull();
    expect(screen.queryByLabelText("Admin navigation")).toBeNull();
  });
});

describe("user portal product surface", () => {
  test("switches between login and signup states before entering subscription management", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    fireEvent.click(screen.getByRole("button", { name: "立即注册" }));

    expect(screen.getByRole("heading", { name: "注册" })).not.toBeNull();
    expect(screen.getByText("用邮箱创建账户，进入订阅管理。")).not.toBeNull();
    expect(screen.getByLabelText("验证码")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "返回登录" }));

    expect(screen.getByRole("heading", { name: "登录" })).not.toBeNull();
  });

  test("defaults to a simple subscription page rather than a dashboard", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    const portalNav = await enterPortal();

    expect(within(portalNav).getByText("订阅管理")).not.toBeNull();
    expect(within(portalNav).getByText("使用教程")).not.toBeNull();
    expect(within(portalNav).getByText("客服支持")).not.toBeNull();
    expect(within(portalNav).getByText("个人中心")).not.toBeNull();
    expect(within(portalNav).queryByText("Dashboard")).toBeNull();
    expect(screen.getByRole("heading", { name: "订阅管理" })).not.toBeNull();
    expect(screen.queryByText("流量仪表盘")).toBeNull();
    expect(screen.queryByText("安全清单")).toBeNull();
  });

  test("submits monthly and yearly opening requests through the user-scoped client", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: /年卡/ }));
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));

    expect(await screen.findByText("服务生效中")).not.toBeNull();
    expect(client.applyForSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        userRef: "user_safe_ref",
        displayName: "customer",
        email: "customer@example.com",
        contact: {
          email: "customer@example.com",
          phone: "+86 138 0013 8000",
          telegram: "@customer_support"
        },
        planId: "yearly",
        clientTarget: "clash"
      })
    );
    expect(client.applyForSubscription).not.toHaveBeenCalledWith(expect.objectContaining({ durationDays: expect.anything() }));
    expect(screen.getByText("https://sub.example.test/import/visible-once")).not.toBeNull();
    expect(screen.getAllByText("年卡").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2027\/05\/31/).length).toBeGreaterThan(0);
  });

  test("requires contact details through a popup before package application", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));

    expect(screen.getByText("请先填写授权联系资料。")).not.toBeNull();
    expect(screen.getByRole("dialog", { name: "填写联系资料" })).not.toBeNull();
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("refreshing an active subscription is separate from opening a package", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));
    expect(await screen.findByText("服务生效中")).not.toBeNull();

    expect(screen.getByRole("button", { name: "刷新当前订阅" })).not.toBeNull();
    expect(screen.getByText(/刷新当前订阅只重置链接，不影响原到期时间/)).not.toBeNull();
    expect(screen.getByRole("button", { name: /月卡/ }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "刷新当前订阅" }));

    await waitFor(() => expect(client.applyForSubscription).toHaveBeenCalledTimes(1));
    expect(client.refreshSubscription).toHaveBeenCalledWith({
      userRef: "user_safe_ref",
      requestRef: "subreq_monthly",
      clientTarget: "clash"
    });
    expect(screen.getByText(/之前的旧链接已失效/)).not.toBeNull();
    expect(screen.queryByText("旧订阅失效")).toBeNull();
  });

  test("renders old-link invalidation only when the portal client returns the event", async () => {
    const client = portalClient({
      refreshSubscription: vi.fn(async (input: PortalRefreshSubscriptionInput): Promise<PortalSubscriptionRequest> => ({
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: input.requestRef,
        userRef: input.userRef,
        planId: "monthly",
        clientTarget: input.clientTarget,
        expiresAt: "2026-06-30T00:00:00.000Z",
        subscriptionUrl: "https://sub.example.test/import/refreshed-no-event",
        nextAction: "copy_subscription_url",
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));
    expect(await screen.findByText("服务生效中")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "刷新当前订阅" }));

    await waitFor(() => expect(client.refreshSubscription).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/之前的旧链接已失效/)).toBeNull();
  });

  test("trusts server-provided lifecycle instead of recalculating expiry from the browser clock", async () => {
    const client = portalClient({
      applyForSubscription: vi.fn(async (input: PortalApplySubscriptionInput): Promise<PortalSubscriptionRequest> => ({
        status: "subscription_ready",
        lifecycle: "active",
        requestRef: "subreq_server_authoritative_active",
        userRef: input.userRef,
        planId: input.planId,
        clientTarget: input.clientTarget,
        expiresAt: "2000-01-01T00:00:00.000Z",
        subscriptionUrl: "https://sub.example.test/import/server-authoritative",
        nextAction: "copy_subscription_url",
        safety: {
          noAdminApi: true,
          noDbMutation: true,
          noPaymentActivation: true,
          noPublicAdmin: true,
          noRawCustomerDataReturned: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));

    expect(await screen.findByText("服务生效中")).not.toBeNull();
    expect(screen.getByRole("button", { name: "刷新当前订阅" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "重新申请开通" })).toBeNull();
  });

  test("hydrates existing active subscription state after authentication", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        contactInfo: {
          email: "customer@example.com",
          phone: "+86 139 0013 9000",
          telegram: "@existing_user"
        },
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_yearly",
          userRef: input.userRef,
          planId: "yearly",
          clientTarget: "karing",
          expiresAt: "2027-05-31T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-06-01T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();

    expect(client.fetchCurrentState).toHaveBeenCalledWith({ userRef: "user_safe_ref" });
    expect((await screen.findAllByText("服务生效中")).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "刷新当前订阅" })).not.toBeNull();
    expect(screen.getByText("https://sub.example.test/import/existing-visible-once")).not.toBeNull();
    expect(screen.getAllByText("年卡").length).toBeGreaterThan(0);
    expect(client.applyForSubscription).not.toHaveBeenCalled();
  });

  test("does not invent profile history from current subscription state", async () => {
    const client = portalClient({
      fetchCurrentState: vi.fn(async (input: { userRef: string }): Promise<PortalUserState> => ({
        userRef: input.userRef,
        contactInfo: {
          email: "customer@example.com",
          phone: "+86 139 0013 9000",
          telegram: "@existing_user"
        },
        subscriptionRequest: {
          status: "subscription_ready",
          lifecycle: "active",
          requestRef: "subreq_existing_yearly",
          userRef: input.userRef,
          planId: "yearly",
          clientTarget: "karing",
          expiresAt: "2027-05-31T00:00:00.000Z",
          subscriptionUrl: "https://sub.example.test/import/existing-visible-once",
          nextAction: "copy_subscription_url",
          safety: {
            noAdminApi: true,
            noDbMutation: true,
            noPaymentActivation: true,
            noPublicAdmin: true,
            noRawCustomerDataReturned: true
          }
        },
        updatedAt: "2026-06-01T00:00:00.000Z",
        safety: {
          noAdminApi: true,
          noPaymentActivation: true,
          noPublicAdmin: true
        }
      }))
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("暂无完成套餐记录")).not.toBeNull();
    expect(screen.queryByText(/申请年卡（已授权）/)).toBeNull();
  });

  test("copies a generated subscription only when the portal client returns visible material", async () => {
    const client = portalClient();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });

    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));
    expect(await screen.findByText("服务生效中")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "复制" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://sub.example.test/import/visible-once"));
  });

  test("default local portal client is safe by default and exposes no subscription link", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z")
    });
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    await fillContactInfo();
    fireEvent.click(screen.getByRole("button", { name: "申请开通" }));

    expect(await screen.findByText("等待授权")).not.toBeNull();
    expect(screen.getByText("下一步：联系客服完成授权")).not.toBeNull();
    expect(screen.getByText(/账户 ID/)).not.toBeNull();
    expect(screen.getByRole("button", { name: "联系客服支持" })).not.toBeNull();
    expect(screen.getByText("授权完成后显示订阅链接")).not.toBeNull();
    expect(screen.getByRole("button", { name: "复制" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "等待授权中" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));

    expect(screen.getByText("查看账户基础信息、授权联系资料与历史记录。")).not.toBeNull();
    expect(screen.getAllByText("月卡 · 等待授权").length).toBeGreaterThan(0);
    expect(screen.getByText("待授权")).not.toBeNull();
    expect(screen.getByText("已填写邮箱、手机号、Telegram")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "修改资料" }));
    expect(screen.getByDisplayValue("+86 138 0013 8000")).not.toBeNull();
    expect(screen.getByDisplayValue("@customer_support")).not.toBeNull();
    expect(screen.getByText(/申请月卡（审核中）/)).not.toBeNull();
    expect(screen.queryByText("2026/06/30 到期")).toBeNull();
    expect(screen.queryByText("月卡 / 年卡套餐，申请开通；生效期内可刷新当前订阅。")).toBeNull();
  });

  test("saving profile contact info persists through the user-scoped client", async () => {
    const client = portalClient();
    render(createElement(UserPortalPage, { portalClient: client }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
    fireEvent.click(screen.getByRole("button", { name: "填写资料" }));
    fireEvent.change(screen.getByLabelText("联系手机号"), { target: { value: "+86 139 0099 0000" } });
    fireEvent.change(screen.getByLabelText("Telegram 账号"), { target: { value: "@updated_user" } });
    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));

    await waitFor(() => expect(client.updateContactInfo).toHaveBeenCalledWith({
      userRef: "user_safe_ref",
      contact: {
        email: "customer@example.com",
        phone: "+86 139 0099 0000",
        telegram: "@updated_user"
      }
    }));
    expect(screen.queryByRole("dialog", { name: "填写联系资料" })).toBeNull();
    expect(screen.getByText("已填写邮箱、手机号、Telegram")).not.toBeNull();
  });

  test("local preview client preserves server-owned package facts when refreshing", async () => {
    const client = createLocalUserPortalClient({
      now: () => new Date("2026-05-31T00:00:00.000Z"),
      demoSubscriptionUrl: "https://sub.example.test/import/local-visible-once"
    });

    const applied = await client.applyForSubscription({
      userRef: "user_safe_ref",
      displayName: "customer",
      email: "customer@example.com",
      contact: {
        email: "customer@example.com",
        phone: "+86 138 0013 8000",
        telegram: "@customer_support"
      },
      planId: "yearly",
      clientTarget: "clash"
    });
    const refreshed = await client.refreshSubscription({
      userRef: "user_safe_ref",
      requestRef: applied.requestRef,
      clientTarget: "karing"
    });

    expect(refreshed.lifecycle).toBe("active");
    expect(refreshed.planId).toBe("yearly");
    expect(refreshed.expiresAt).toBe(applied.expiresAt);
    expect(refreshed.clientTarget).toBe("karing");
  });

  test("renders usage guide, support handoff, and personal center without payment or dashboard language", async () => {
    render(createElement(UserPortalPage, { portalClient: portalClient() }));

    await enterPortal();
    fireEvent.click(screen.getByRole("button", { name: "使用教程" }));
    expect(screen.getByText("下载客户端")).not.toBeNull();
    expect(screen.getByText("复制订阅")).not.toBeNull();
    expect(screen.getByText("导入配置")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "客服支持" }));
    expect(screen.getAllByText(/Telegram 机器人助手/).length).toBeGreaterThan(0);
    expect(screen.getByText("人工支持")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "个人中心" }));
    expect(screen.getAllByText("注册日期").length).toBeGreaterThan(0);
    expect(screen.getByText("历史消费账单")).not.toBeNull();
    expect(screen.queryByText("充值")).toBeNull();
    expect(screen.queryByText("余额")).toBeNull();
    expect(screen.queryByText("扣费")).toBeNull();
  });
});
