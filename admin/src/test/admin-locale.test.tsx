import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { AdminLayout } from "../components/layout/admin-layout";
import { AdminProtectedAuthShell } from "../features/admin-auth/admin-protected-auth-shell";
import { DashboardPage } from "../pages/dashboard-page";
import { AdminSetupPage } from "../pages/admin-setup-page";

const ADMIN_LOCALE_STORAGE_KEY = "gccwebos-admin-locale";

afterEach(() => {
  cleanup();
  localStorage.removeItem(ADMIN_LOCALE_STORAGE_KEY);
  sessionStorage.clear();
  document.documentElement.removeAttribute("lang");
});

describe("admin language preference", () => {
  test("applies and persists an operator console language independently from public entrypoints", () => {
    localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, "zh");

    render(
      <AdminLayout
        activePage="dashboard"
        search=""
        onNavigate={vi.fn()}
        onSearchChange={vi.fn()}
      >
        <DashboardPage onNavigate={vi.fn()} onRiskCountChange={vi.fn()} />
      </AdminLayout>
    );

    const sidebar = screen.getByLabelText("工作区侧栏");
    expect(within(sidebar).getByLabelText("监测 路由")).not.toBeNull();
    expect(within(sidebar).getByText("监测")).not.toBeNull();
    expect(within(sidebar).getByRole("button", { name: "运营总览" }).getAttribute("aria-current")).toBe("page");
    expect(within(sidebar).getByRole("button", { name: "账户与资源" })).not.toBeNull();
    expect(within(sidebar).getByRole("button", { name: "节点带宽" })).not.toBeNull();

    const topSearch = screen.getByRole("search", { name: "搜索 Admin 操作面板" });
    const searchInput = within(topSearch).getByLabelText("搜索用户、订单、渠道、案例或事件");
    expect(searchInput.getAttribute("placeholder")).toBe("搜索用户、订单、渠道...");
    expect(screen.getByText("生产")).not.toBeNull();
    expect(screen.getByLabelText("操作员账户")).not.toBeNull();
    expect(screen.getAllByText("操作员").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("运营")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "运营总览" })).not.toBeNull();
    expect(screen.getByText("仅显示健康、风险路由和下一步行动；明细台账留在归属页面。")).not.toBeNull();
    expect(screen.getByLabelText("运营总览 摘要指标")).not.toBeNull();
    expect(screen.getByLabelText("运营总览 模块布局")).not.toBeNull();
    expect(screen.getByLabelText("运营总览 证据区域")).not.toBeNull();
    expect(document.documentElement.lang).toBe("zh-CN");

    fireEvent.click(screen.getByLabelText("操作员账户"));
    fireEvent.click(screen.getByRole("button", { name: "切换 Admin 语言为英文" }));

    expect(localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBe("en");
    expect(within(sidebar).getByLabelText("Monitoring routes")).not.toBeNull();
    expect(within(sidebar).getByRole("button", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByRole("search", { name: "Search Admin Console" })).not.toBeNull();
    expect(screen.getByText("Production")).not.toBeNull();
    expect(screen.getByLabelText("Operator account")).not.toBeNull();
    expect(screen.getByText("Operations")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Operations Overview" })).not.toBeNull();
    expect(screen.getByLabelText("Operations Overview summary metrics")).not.toBeNull();
    expect(document.documentElement.lang).toBe("en-US");
  });

  test("localizes the protected login shell while leaving account refs unchanged", async () => {
    localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, "zh");
    const onAuthenticated = vi.fn();
    const client = {
      session: vi.fn(async () => ({
        authenticated: false as const,
        mode: "portalAccount" as const,
        operatorRef: "portal_user_20260604_001",
        setupRequired: false
      })),
      startBootstrap: vi.fn(),
      confirmEnrollment: vi.fn(),
      login: vi.fn(),
      verifyTotp: vi.fn(),
      logout: vi.fn()
    };

    render(
      <AdminSetupPage
        onOpenSite={vi.fn()}
        protectedAuthPanel={(
          <AdminProtectedAuthShell
            client={client}
            onAuthenticated={onAuthenticated}
          />
        )}
      />
    );

    expect(screen.getByText("操作控制台")).not.toBeNull();
    expect(screen.getByRole("button", { name: "预览官网" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "管理员登录" })).not.toBeNull();
    expect(screen.getByLabelText("受保护 Admin 登录表单")).not.toBeNull();
    expect(await screen.findByRole("heading", { name: "门户账户登录" })).not.toBeNull();
    expect(screen.getByRole("form", { name: "受保护 Admin 密码步骤" })).not.toBeNull();
    expect((screen.getByLabelText("账户 ID") as HTMLInputElement).value).toBe("portal_user_20260604_001");
    expect(screen.getByLabelText("密码")).not.toBeNull();
  });
});
