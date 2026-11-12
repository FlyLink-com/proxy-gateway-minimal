import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { abortControllers } = vi.hoisted(() => ({
  abortControllers: [] as AbortController[]
}));

vi.mock("../pages/admin-monitor-workspace", () => ({
  AdminMonitorWorkspace: ({
    pageId,
    createClient,
    formatPageHref,
    children
  }: {
    pageId: string;
    createClient?: () => ReturnType<
      typeof import("../app/admin-monitor-read-client").createAdminMonitorReadClient
    >;
    formatPageHref?: (pageId: string) => string;
    children?: ReactNode;
  }) => {
    const href = formatPageHref ? formatPageHref("userManagement") : "";
    return (
      <div data-testid="admin-monitor-workspace">
        <span data-testid="monitor-page-id">{pageId}</span>
        <span data-testid="monitor-has-factory">{createClient ? "yes" : "no"}</span>
        {formatPageHref ? (
          <a data-testid="monitor-format-link" href={href}>
            summary-link
          </a>
        ) : null}
        <button
          type="button"
          data-testid="monitor-start"
          onClick={() => {
            const controller = new AbortController();
            abortControllers.push(controller);
            void createClient?.()
              .accounts(controller.signal)
              .catch(() => undefined);
          }}
        >
          start
        </button>
        {children}
      </div>
    );
  }
}));

vi.mock("../pages/admin-user-monitor-workspace", () => ({
  AdminUserMonitorWorkspace: ({
    createClient
  }: {
    createClient?: () => ReturnType<
      typeof import("../app/admin-user-monitor-client").createAdminUserMonitorClient
    >;
  }) => (
    <div data-testid="admin-user-monitor-workspace">
      <span data-testid="user-has-factory">{createClient ? "yes" : "no"}</span>
      <button
        type="button"
        data-testid="user-start"
        onClick={() => {
          const controller = new AbortController();
          abortControllers.push(controller);
          void createClient?.()
            .accounts({ limit: 20 }, controller.signal)
            .catch(() => undefined);
        }}
      >
        start
      </button>
    </div>
  )
}));

vi.mock("../features/third-party-node-names/third-party-admin-workspace", () => ({
  ThirdPartyAdminWorkspace: ({ onSessionExpired }: { onSessionExpired?: () => void }) => (
    <div data-testid="third-party-admin-workspace">
      <button type="button" onClick={onSessionExpired}>第三方会话失效</button>
    </div>
  )
}));
vi.mock("../features/third-party-node-names/subscription-distribution-panel", () => ({
  SubscriptionDistributionPanel: () => <div data-testid="subscription-distribution-panel" />
}));

import { AdminOperationsShell } from "../pages/admin-operations-shell";
import { AdminProductionBaselinePreview } from "../pages/admin-production-baseline-preview";

function lastFetchInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit | undefined {
  const call = fetchMock.mock.calls.at(-1);
  return call?.[1] as RequestInit | undefined;
}

describe("AdminOperationsShell", () => {
  beforeEach(() => {
    window.location.hash = "";
    abortControllers.length = 0;
  });

  afterEach(() => {
    cleanup();
    window.location.hash = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders formal baseline nav plus protected third-party entry, brand, default dashboard, and no DEV banner", () => {
    render(<AdminOperationsShell />);

    expect(screen.getByRole("heading", { name: "GCC WebOS · Admin Console" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Admin 导航" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "运营总览" })).toBeTruthy();
    expect(screen.queryByLabelText("本地对比导航")).toBeNull();
    expect(screen.queryByLabelText("Admin production baseline preview status")).toBeNull();
    expect(screen.queryByText("GlobalCircle AI - Operator Console")).toBeNull();
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    expect(screen.getByRole("button", { name: "订阅分发" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "用户商业" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((el) => el.classList.contains("nav-item")).length).toBe(12);
  });

  it("opens the formal third-party route and forwards session expiration without mounting read-only workspaces", async () => {
    const onSessionExpired = vi.fn();
    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByRole("button", { name: "订阅分发" }));
    expect(window.location.hash).toBe("#/admin/thirdPartyNodes");
    expect(await screen.findByTestId("third-party-admin-workspace")).toBeTruthy();
    expect(await screen.findByTestId("subscription-distribution-panel")).toBeTruthy();
    expect(screen.queryByTestId("admin-monitor-workspace")).toBeNull();
    expect(screen.queryByTestId("admin-user-monitor-workspace")).toBeNull();
    expect(screen.getByRole("button", { name: "订阅分发" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "第三方会话失效" }));
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("supports direct formal third-party hash navigation", async () => {
    window.location.hash = "#/admin/thirdPartyNodes";
    render(<AdminOperationsShell />);
    expect(await screen.findByTestId("third-party-admin-workspace")).toBeTruthy();
  });

  it.each(["#/admin/thirdPartyNodes", "#/admin-baseline/thirdPartyNodes"])("does not expose third-party writes in the ten-page preview at %s", async (hash) => {
    window.location.hash = hash;
    render(<AdminProductionBaselinePreview />);
    expect(screen.queryByRole("button", { name: "订阅分发" })).toBeNull();
    expect(screen.queryByRole("button", { name: "用户商业" })).toBeNull();
    expect(screen.getAllByRole("button").filter((el) => el.classList.contains("nav-item")).length).toBe(10);
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    expect(screen.queryByTestId("third-party-admin-workspace")).toBeNull();
  });

  it("unmounts third-party writes immediately if the same shell changes into preview mode", async () => {
    window.location.hash = "#/admin/thirdPartyNodes";
    const view = render(<AdminOperationsShell />);
    expect(await screen.findByTestId("third-party-admin-workspace")).toBeTruthy();
    view.rerender(<AdminOperationsShell preview={{ title: "本地预览", navLabel: "预览导航", banner: null }} />);
    expect(screen.queryByTestId("third-party-admin-workspace")).toBeNull();
    expect(screen.queryByRole("button", { name: "订阅分发" })).toBeNull();
    expect(screen.queryByRole("button", { name: "用户商业" })).toBeNull();
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
  });

  it("navigates to userManagement and back via hashchange and popstate; unknown hash becomes dashboard", async () => {
    render(<AdminOperationsShell />);

    fireEvent.click(screen.getByRole("button", { name: "用户管理" }));
    expect(window.location.hash).toBe("#/admin/userManagement");
    expect(screen.getByTestId("admin-user-monitor-workspace")).toBeTruthy();
    expect(screen.getByTestId("user-has-factory").textContent).toBe("yes");

    fireEvent.click(screen.getByRole("button", { name: "运营总览" }));
    expect(window.location.hash).toBe("#/admin/dashboard");
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");

    window.location.hash = "#/admin/%E0%A4%A";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    await waitFor(() => {
      expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    });

    window.location.hash = "#/admin/not-a-page";
    window.dispatchEvent(new PopStateEvent("popstate"));
    await waitFor(() => {
      expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    });
  });

  it("preview thin wrapper keeps DEV nav, title, and banner copy", () => {
    render(<AdminProductionBaselinePreview />);

    expect(screen.getByRole("heading", { name: "GlobalCircle AI - Operator Console" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "本地对比导航" })).toBeTruthy();
    expect(screen.getByLabelText("Admin production baseline preview status")).toBeTruthy();
    expect(screen.getByText("本地候选 · 只读监控")).toBeTruthy();
    expect(screen.getByText("Admin 本地验收")).toBeTruthy();
    expect(screen.getByText("默认未连接实时数据；开始后仅查询已接入的安全摘要。")).toBeTruthy();
  });

  it("passes formal vs preview formatPageHref to monitor workspace summary links", () => {
    const { unmount } = render(<AdminOperationsShell />);
    expect(screen.getByTestId("monitor-format-link").getAttribute("href")).toBe("#/admin/userManagement");
    unmount();

    render(<AdminProductionBaselinePreview />);
    expect(screen.getByTestId("monitor-format-link").getAttribute("href")).toBe("#/admin-baseline/userManagement");
  });

  it("reads the formal dashboard summary on mount; monitor accounts stay idle until start", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.startsWith("/api/admin/operations/dashboard-summary")) {
        return new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("expired", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/api/admin/platform/accounts"))).toBe(false);
    const summaryCall = fetchMock.mock.calls.find((call) => String(call[0]).startsWith("/api/admin/operations/dashboard-summary"));
    expect(summaryCall?.[0]).toBe("/api/admin/operations/dashboard-summary");
    const summaryInit = summaryCall?.[1] as RequestInit;
    expect(summaryInit?.credentials).toBe("same-origin");
    expect(summaryInit?.cache).toBe("no-store");
    expect(new Headers(summaryInit?.headers).has("Authorization")).toBe(false);
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Registration trend" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Traffic collector observation" })).toBeTruthy();
    expect(screen.queryByText("Platform health")).toBeNull();

    fireEvent.click(screen.getByTestId("monitor-start"));
    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    const accountCall = fetchMock.mock.calls.find((call) => call[0] === "/api/admin/platform/accounts");
    const init = accountCall?.[1] as RequestInit | undefined;
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.signal).toBeTruthy();
    expect(init?.credentials).toBe("same-origin");
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  });

  it("expires the formal session when the dashboard summary returns 401", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("no", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledOnce();
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/operations/dashboard-summary");
    expect(screen.getAllByText("Sign-in is required.").length).toBeGreaterThan(0);
  });

  it("keeps the baseline preview dashboard disconnected from the summary route", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminProductionBaselinePreview />);

    expect(screen.getByText("Platform health")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Registration trend" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("monitor 403 does not invoke onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByTestId("monitor-start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("aborted late 401 does not invoke onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    let resolveFetch: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByTestId("monitor-start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const controller = abortControllers.at(-1);
    expect(controller).toBeTruthy();
    controller?.abort();
    resolveFetch?.(new Response("expired", { status: 401 }));

    await waitFor(() => {
      expect(lastFetchInit(fetchMock)?.signal?.aborted).toBe(true);
    });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("user start uses accounts({ limit: 20 }, signal); 401 invokes onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      expect(url.includes("/api/admin/platform/user-monitor/accounts")).toBe(true);
      expect(url.includes("limit=20")).toBe(true);
      return new Response("expired", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    window.location.hash = "#/admin/userManagement";
    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByTestId("user-start"));
    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });
    expect(lastFetchInit(fetchMock)?.credentials).toBe("same-origin");
    const headers = new Headers(lastFetchInit(fetchMock)?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("user 403 does not invoke onSessionExpired", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByRole("button", { name: "用户管理" }));
    fireEvent.click(screen.getByTestId("user-start"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(onSessionExpired).not.toHaveBeenCalled();
  });

  it("formal usageMonitor shows the pending ledger without query controls or fabricated totals", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AdminOperationsShell />);
    fireEvent.click(screen.getByRole("button", { name: "使用情况和渠道" }));
    expect(window.location.hash).toBe("#/admin/usageMonitor");
    const ledger = within(screen.getByRole("region", { name: "用量台账" }));
    expect(ledger.getByRole("heading", { name: "用量台账汇总" })).toBeTruthy();
    expect(ledger.getByRole("status").textContent).toBe("真实汇总查询验收中，暂未开放。");
    expect(ledger.getByText(/本阶段不读取汇总台账/)).toBeTruthy();
    expect(ledger.getByText(/无法区分测试账户与真实客户/)).toBeTruthy();
    expect(ledger.getByText(/第三方未计量流量不在此台账/)).toBeTruthy();
    expect(ledger.getByText(/缺失时间段视为未知/)).toBeTruthy();
    expect(ledger.getByText(/不表示采集器健康/)).toBeTruthy();
    expect(ledger.queryByRole("button")).toBeNull();
    expect(ledger.queryByRole("table")).toBeNull();
    expect(ledger.queryByText(/0 B|0 字节|尚无样本|合计一致/)).toBeNull();
    expect(fetchMock.mock.calls.every((call) => String(call[0]).startsWith("/api/admin/operations/dashboard-summary"))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("usage-ledger"))).toBe(false);
    expect(screen.getByTestId("admin-monitor-workspace")).toBeTruthy();
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("usageMonitor");
    expect(ledger.getByRole("link", { name: "前往用户管理查看账户明细" }).getAttribute("href")).toBe("#/admin/userManagement");
    expect(screen.queryByTestId("admin-user-monitor-workspace")).toBeNull();
  });

  it("does not inject the pending ledger into the ten-page baseline preview", () => {
    window.location.hash = "#/admin-baseline/usageMonitor";
    render(<AdminProductionBaselinePreview />);
    expect(screen.queryByRole("region", { name: "用量台账" })).toBeNull();
    expect(screen.queryByText("真实汇总查询验收中，暂未开放。")).toBeNull();
    expect(screen.getByTestId("admin-monitor-workspace")).toBeTruthy();
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("usageMonitor");
  });

  it("keeps account details reachable and never queries the ledger during navigation and remount", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<AdminOperationsShell />);
    fireEvent.click(screen.getByRole("button", { name: "使用情况和渠道" }));
    fireEvent.click(screen.getByRole("link", { name: "前往用户管理查看账户明细" }));
    await waitFor(() => {
      expect(window.location.hash).toBe("#/admin/userManagement");
      expect(screen.getByTestId("admin-user-monitor-workspace")).toBeTruthy();
    });
    expect(screen.queryByRole("region", { name: "用量台账" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "运营总览" }));
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    fireEvent.click(screen.getByRole("button", { name: "使用情况和渠道" }));
    expect(screen.getByRole("region", { name: "用量台账" })).toBeTruthy();
    view.unmount();
    render(<AdminOperationsShell />);
    expect(screen.getByRole("region", { name: "用量台账" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /读取用量台账|重新读取/ })).toBeNull();
    expect(fetchMock.mock.calls.every((call) => String(call[0]).startsWith("/api/admin/operations/dashboard-summary"))).toBe(true);
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("usage-ledger"))).toBe(false);
  });

  it("preserves the existing monitor read and session guard beside the pending ledger", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("expired", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    window.location.hash = "#/admin/usageMonitor";
    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("monitor-start"));
    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledOnce();
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/platform/accounts");
    expect(screen.getByText("真实汇总查询验收中，暂未开放。")).toBeTruthy();
  });
});
