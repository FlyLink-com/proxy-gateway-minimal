import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const AUTH_SESSION_PATH = "/api/admin-auth/session";
const LEGACY_SESSION_KEY = "proxy-gateway-admin-session";
const LEGACY_SESSION_JSON = JSON.stringify({
  baseUrl: "",
  consoleToken: "synthetic-legacy",
});

const realAuthStatusTrue = {
  authenticated: true,
  session: {
    sessionRef: "admin_session_test",
    operatorRef: "acct_test",
    authMethod: "totp",
    status: "active",
    issuedAt: "2026-09-12T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
  },
};

function pathOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Request) return new URL(input.url, "http://localhost").pathname;
  if (input && typeof input === "object" && "url" in input) {
    return new URL(String((input as { url: string }).url), "http://localhost").pathname;
  }
  return String(input);
}

async function importApp() {
  vi.resetModules();
  const mod = await import("../App");
  return mod.App;
}

function fetchPaths(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => pathOf(call[0]));
}

function seedLegacySession() {
  sessionStorage.setItem(LEGACY_SESSION_KEY, LEGACY_SESSION_JSON);
}

function expectLegacyKeyUnread(getItemSpy: ReturnType<typeof vi.spyOn>) {
  expect(getItemSpy.mock.calls.some((call: unknown[]) => call[0] === LEGACY_SESSION_KEY)).toBe(false);
}

describe("admin formal entry", () => {
  const originalLocation = window.location.href;
  let fetchMock: ReturnType<typeof vi.fn>;
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_ADMIN_BASELINE_PREVIEW", "false");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    getItemSpy = vi.spyOn(Storage.prototype, "getItem");
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    sessionStorage.clear();
    window.history.replaceState(null, "", originalLocation);
  });

  it("pending session probe does not render nav or business GETs", async () => {
    seedLegacySession();
    let resolveSession: (value: Response) => void = () => {};
    fetchMock.mockImplementation((input: unknown) => {
      const p = pathOf(input);
      if (p === AUTH_SESSION_PATH) {
        return new Promise<Response>((resolve) => {
          resolveSession = resolve;
        });
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    const App = await importApp();
    render(<App />);

    await waitFor(() => {
      expect(fetchPaths(fetchMock).some((p) => p === AUTH_SESSION_PATH)).toBe(true);
    });
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.queryByRole("heading", { name: /FlinkVPN · Admin Console/ })).toBeNull();
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(fetchPaths(fetchMock).every((p) => p === AUTH_SESSION_PATH)).toBe(true);
    expectLegacyKeyUnread(getItemSpy);

    await act(async () => {
      resolveSession(
        new Response(JSON.stringify({ authenticated: false, operatorRef: "acct_op", setupRequired: false }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText("密码")).toBeTruthy();
    });
    expect(screen.queryByRole("navigation", { name: "Admin 导航" })).toBeNull();
    expect(fetchPaths(fetchMock).every((p) => p === AUTH_SESSION_PATH)).toBe(true);
    expectLegacyKeyUnread(getItemSpy);
  });

  it("unauthenticated session shows login and ignores ConsoleToken", async () => {
    seedLegacySession();
    fetchMock.mockImplementation((input: unknown) => {
      if (pathOf(input) === AUTH_SESSION_PATH) {
        return Promise.resolve(
          new Response(JSON.stringify({ authenticated: false, operatorRef: "acct_op", setupRequired: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const App = await importApp();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("密码")).toBeTruthy();
    });
    expect(screen.queryByRole("navigation", { name: "Admin 导航" })).toBeNull();
    expect(fetchPaths(fetchMock).filter((p) => p !== AUTH_SESSION_PATH)).toEqual([]);
    expectLegacyKeyUnread(getItemSpy);
  });

  it("authenticated session shows ten nav items without default business reads", async () => {
    seedLegacySession();
    fetchMock.mockImplementation((input: unknown) => {
      if (pathOf(input) === AUTH_SESSION_PATH) {
        return Promise.resolve(
          new Response(JSON.stringify(realAuthStatusTrue), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("unexpected", { status: 500 }));
    });

    const App = await importApp();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("navigation", { name: "Admin 导航" })).toBeTruthy();
    });
    expect(screen.getByText("FlinkVPN · Admin Console")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Admin 导航" });
    expect(nav.querySelectorAll("button").length).toBe(12);
    expect(screen.getByRole("button", { name: "住宅流量包" })).toBeTruthy();
    expect(nav.querySelectorAll("a").length).toBe(0);
    expect(fetchPaths(fetchMock).filter((p) => p !== AUTH_SESSION_PATH)).toEqual([]);
    expectLegacyKeyUnread(getItemSpy);
  });

  it("DEV preview hash keeps baseline title with no auth fetch; production ignores fixture hash", async () => {
    vi.stubEnv("DEV", true);
    vi.stubEnv("VITE_ADMIN_BASELINE_PREVIEW", "true");
    window.history.replaceState(null, "", "/#/admin-baseline/dashboard");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    let App = await importApp();
    const first = render(<App />);
    await waitFor(() => {
      expect(screen.getByText("GlobalCircle AI - Operator Console")).toBeTruthy();
    });
    expect(screen.getByText("本地候选 · 只读监控")).toBeTruthy();
    expect(screen.queryByText(/Connect Admin API/i)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    first.unmount();

    vi.unstubAllEnvs();
    vi.stubEnv("DEV", false);
    window.history.replaceState(null, "", "/#/admin-baseline/dashboard");
    fetchMock.mockImplementation((input: unknown) => {
      if (pathOf(input) === AUTH_SESSION_PATH) {
        return Promise.resolve(
          new Response(JSON.stringify({ authenticated: false, operatorRef: "acct_op", setupRequired: false }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    });

    App = await importApp();
    render(<App />);
    await waitFor(() => {
      expect(screen.getByLabelText("密码")).toBeTruthy();
    });
    expect(screen.queryByText("GlobalCircle AI - Operator Console")).toBeNull();
    expect(screen.queryByText(/Connect Admin API/i)).toBeNull();
    expect(fetchPaths(fetchMock).every((p) => p === AUTH_SESSION_PATH)).toBe(true);
  });
});
