import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

const loadAdminSession = vi.hoisted(() => vi.fn());

vi.mock("../features/subscriptions/admin-session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/subscriptions/admin-session")>();
  loadAdminSession.mockImplementation(() => {
    const session = { ...actual.loadAdminSession(), consoleToken: "" };
    if ("apiBaseUrl" in session) {
      session.apiBaseUrl = "";
    }
    if ("baseUrl" in session) {
      session.baseUrl = "";
    }
    return session;
  });
  return {
    ...actual,
    loadAdminSession
  };
});

const { App } = await import("../App");

function stubUnauthenticatedAdminSessionFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    expect(url).toBe("/api/admin-auth/session");
    expect(init?.method ?? "GET").toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    return new Response(JSON.stringify({
      authenticated: false,
      operatorRef: "acct_op",
      setupRequired: false
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  loadAdminSession.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("admin production baseline App isolation", () => {
  test("does not mount ordinary Admin while the DEV preview fallback or preview is shown", async () => {
    vi.stubEnv("VITE_ADMIN_BASELINE_PREVIEW", "true");
    window.location.hash = "#/admin-baseline/dashboard";
    const fetchMock = stubUnauthenticatedAdminSessionFetch();

    render(<App />);

    expect(loadAdminSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();

    expect(await screen.findByRole("heading", { name: "GlobalCircle AI - Operator Console" })).not.toBeNull();
    expect(screen.getByLabelText("Admin production baseline preview status")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "运营总览" })).not.toBeNull();
    expect(loadAdminSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Admin Console" })).toBeNull();
    expect(screen.queryByLabelText("Workspace sidebar")).toBeNull();
    expect(screen.queryByText("Proxy Gateway Admin")).toBeNull();
  });

  test("unmounts the preview on hash exit then mounts protected AdminAuthBoundary", async () => {
    vi.stubEnv("VITE_ADMIN_BASELINE_PREVIEW", "true");
    window.location.hash = "#/admin-baseline/dashboard";
    const fetchMock = stubUnauthenticatedAdminSessionFetch();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "GlobalCircle AI - Operator Console" })).not.toBeNull();
    expect(loadAdminSession).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      window.location.hash = "";
    });

    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "GlobalCircle AI - Operator Console" })).toBeNull();
      expect(screen.getByRole("heading", { name: "Admin Console" })).not.toBeNull();
    });
    expect(await screen.findByLabelText("密码")).not.toBeNull();
    expect(loadAdminSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(screen.queryByLabelText("Admin production baseline preview status")).toBeNull();
  });

  test("ignores the baseline hash when the opt-in flag is off", async () => {
    vi.stubEnv("VITE_ADMIN_BASELINE_PREVIEW", "false");
    window.location.hash = "#/admin-baseline/dashboard";
    const fetchMock = stubUnauthenticatedAdminSessionFetch();

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Admin Console" })).not.toBeNull();
    expect(await screen.findByLabelText("密码")).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "GlobalCircle AI - Operator Console" })).toBeNull();
    expect(screen.queryByLabelText("Admin production baseline preview status")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(loadAdminSession).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
