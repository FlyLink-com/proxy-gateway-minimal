import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ADMIN_LOCALE_STORAGE_KEY } from "../app/admin-locale";
import { pageTitles } from "../app/navigation";
import { AdminLayout } from "../components/layout/admin-layout";
import { ADMIN_LANGUAGE_PACKS, getAdminLanguagePack } from "../i18n/admin";
import { DashboardPage } from "../pages/dashboard-page";

afterEach(() => {
  cleanup();
  window.localStorage.removeItem(ADMIN_LOCALE_STORAGE_KEY);
  document.documentElement.removeAttribute("lang");
});

describe("admin shell locale", () => {
  test("registers language packs for the current Admin workspace pages", () => {
    expect(ADMIN_LANGUAGE_PACKS.map((pack) => pack.tag)).toEqual(["en-US", "zh-CN"]);
    expect(ADMIN_LANGUAGE_PACKS.map((pack) => pack.id)).toEqual(["en", "zh"]);

    const englishPack = getAdminLanguagePack("en");
    const chinesePack = getAdminLanguagePack("zh");

    expect(englishPack.shell.topBar.pageTitles).toEqual(pageTitles);
    expect(Object.keys(chinesePack.shell.topBar.pageTitles)).toEqual(Object.keys(pageTitles));
    expect(Object.keys(chinesePack.shell.sidebar.routes)).toEqual(Object.keys(pageTitles));
    expect(chinesePack.shell.topBar.pageTitles.dashboard).toBe("运营总览");
    expect(chinesePack.shell.sidebar.routes.portalRequests).toBe("账户与资源");
    expect(chinesePack.shell.sidebar.safetyTitle).toBe("Risk A 门禁");
  });

  test("applies and persists the operator console language independently from public entrypoints", () => {
    window.localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, "zh");

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
    expect(within(sidebar).getByRole("button", { name: "运营总览" }).getAttribute("aria-current")).toBe("page");
    expect(within(sidebar).getByRole("button", { name: "账户与资源" })).not.toBeNull();
    expect(within(sidebar).getByText("代理网关")).not.toBeNull();
    expect(screen.getByRole("search", { name: "搜索 Admin 操作面板" })).not.toBeNull();
    expect(screen.getByLabelText("搜索账户、订单、渠道、案例").getAttribute("placeholder")).toBe("搜索账户、订单、渠道、案例");
    expect(screen.getByLabelText("操作员账户")).not.toBeNull();
    expect(screen.getByText("摘要和路由")).not.toBeNull();
    expect(document.documentElement.lang).toBe("zh-CN");

    fireEvent.click(screen.getByLabelText("操作员账户"));
    fireEvent.click(screen.getByRole("button", { name: "切换 Admin 语言为英文" }));

    expect(window.localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY)).toBe("en");
    expect(screen.getByLabelText("Workspace sidebar")).not.toBeNull();
    expect(screen.getByRole("search", { name: "Search Admin Console" })).not.toBeNull();
    expect(screen.getByLabelText("Search accounts, orders, channels, cases").getAttribute("placeholder")).toBe("Search accounts, orders, channels, cases");
    expect(screen.getByLabelText("Operator account")).not.toBeNull();
    expect(screen.getByText("Summary and routing")).not.toBeNull();
    expect(document.documentElement.lang).toBe("en-US");
  });
});
