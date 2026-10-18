import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

vi.mock("../features/residential-relay-packs/residential-relay-admin-workspace", () => ({
  ResidentialRelayAdminWorkspace: ({ onSessionExpired }: { onSessionExpired?: () => void }) => (
    <div data-testid="residential-relay-admin-workspace">
      <button type="button" onClick={onSessionExpired}>住宅包会话失效</button>
    </div>
  )
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

    expect(screen.getByRole("heading", { name: "FlinkVPN · Admin Console" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Admin 导航" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "运营总览" })).toBeTruthy();
    expect(screen.queryByLabelText("本地对比导航")).toBeNull();
    expect(screen.queryByLabelText("Admin production baseline preview status")).toBeNull();
    expect(screen.queryByText("GlobalCircle AI - Operator Console")).toBeNull();
    expect(screen.getByTestId("monitor-page-id").textContent).toBe("dashboard");
    expect(screen.getByRole("button", { name: "第三方节点" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "住宅流量包" })).toBeTruthy();
    expect(screen.getAllByRole("button").filter((el) => el.classList.contains("nav-item")).length).toBe(12);
  });

  it("opens the formal third-party route and forwards session expiration without mounting read-only workspaces", async () => {
    const onSessionExpired = vi.fn();
    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByRole("button", { name: "第三方节点" }));
    expect(window.location.hash).toBe("#/admin/thirdPartyNodes");
    expect(await screen.findByTestId("third-party-admin-workspace")).toBeTruthy();
    expect(screen.queryByTestId("admin-monitor-workspace")).toBeNull();
    expect(screen.queryByTestId("admin-user-monitor-workspace")).toBeNull();
    expect(screen.getByRole("button", { name: "第三方节点" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "第三方会话失效" }));
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("supports direct formal third-party hash navigation", async () => {
    window.location.hash = "#/admin/thirdPartyNodes";
    render(<AdminOperationsShell />);
    expect(await screen.findByTestId("third-party-admin-workspace")).toBeTruthy();
  });

  it.each(["#/admin/thirdPartyNodes", "#/admin-baseline/thirdPartyNodes", "#/admin/residentialRelayPacks", "#/admin-baseline/residentialRelayPacks"])("does not expose third-party or residential writes in the ten-page preview at %s", async (hash) => {
    window.location.hash = hash;
    render(<AdminProductionBaselinePreview />);
    expect(screen.queryByRole("button", { name: "第三方节点" })).toBeNull();
    expect(screen.queryByRole("button", { name: "住宅流量包" })).toBeNull();
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
    expect(screen.queryByRole("button", { name: "第三方节点" })).toBeNull();
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

  it("does not fetch until start; monitor 401 invokes onSessionExpired with GET /api/admin/accounts, signal, same-origin, no Authorization", async () => {
    const onSessionExpired = vi.fn();
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response("expired", { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("monitor-start"));
    await waitFor(() => {
      expect(onSessionExpired).toHaveBeenCalledTimes(1);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [input, init] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit | undefined];
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(url).toBe("/api/admin/platform/accounts");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.signal).toBeTruthy();
    expect(init?.credentials).toBe("same-origin");
    const headers = new Headers(init?.headers);
    expect(headers.has("Authorization")).toBe(false);
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

    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByRole("button", { name: "用户管理" }));
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
});

  it("opens the residential relay pack workspace from the formal nav", async () => {
    const onSessionExpired = vi.fn();
    render(<AdminOperationsShell onSessionExpired={onSessionExpired} />);
    fireEvent.click(screen.getByRole("button", { name: "住宅流量包" }));
    expect(window.location.hash).toBe("#/admin/residentialRelayPacks");
    expect(await screen.findByTestId("residential-relay-admin-workspace")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "住宅包会话失效" }));
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
