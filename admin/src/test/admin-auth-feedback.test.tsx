import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AdminAuthBoundary } from "../pages/admin-auth-boundary";
import { AdminAuthError, type AdminAuthChallenge, type AdminAuthClient } from "../app/admin-auth-client";

const sessionFalse = {
  authenticated: false as const,
  operatorRef: "acct_op",
  setupRequired: false,
};
const sessionTrue = {
  authenticated: true as const,
  expiresAt: "2099-01-01T00:00:00Z",
};
const challenge: AdminAuthChallenge = {
  challengeRef: "challenge_test",
  expiresAt: "2099-01-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function renderBoundary(createClient: () => AdminAuthClient) {
  return render(
    <AdminAuthBoundary createClient={createClient}>
      {() => <span>business</span>}
    </AdminAuthBoundary>
  );
}

describe("admin auth feedback", () => {
  it("shows network alert when login aborts after timeout", async () => {
    vi.useFakeTimers();
    const login = vi.fn((_body: unknown, signal?: AbortSignal) => {
      return new Promise<AdminAuthChallenge>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("timeout", "AbortError"));
        });
      });
    });
    renderBoundary(() => ({
      session: vi.fn(async () => sessionFalse),
      login,
      verify: vi.fn(async () => undefined),
      logout: vi.fn(async () => undefined),
    }));
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });
    await act(async () => {});
    expect(screen.getByRole("alert").textContent).toMatch(/网络异常/);
    expect((screen.getByRole("button", { name: "登录" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText("business")).toBeNull();
    expect((screen.getByLabelText("密码") as HTMLInputElement).value).toBe("");
  });

  it("retries session after network error and restores business", async () => {
    const session = vi
      .fn()
      .mockResolvedValueOnce(sessionFalse)
      .mockRejectedValueOnce(new AdminAuthError("network"))
      .mockResolvedValueOnce(sessionTrue);
    const login = vi.fn(async () => challenge);
    const verify = vi.fn(async () => undefined);
    renderBoundary(() => ({
      session,
      login,
      verify,
      logout: vi.fn(async () => undefined),
    }));
    await waitFor(() => {
      expect(screen.getByLabelText("管理员账户")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("管理员账户"), { target: { value: "acct_op" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => {
      expect(screen.getByLabelText("动态验证码")).toBeTruthy();
    });
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/网络异常/);
    });
    expect(screen.getByRole("button", { name: "重试" })).toBeTruthy();
    expect(screen.queryByLabelText("动态验证码")).toBeNull();
    expect(screen.queryByText("business")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => {
      expect(screen.getByText("business")).toBeTruthy();
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(session).toHaveBeenCalledTimes(3);
  });
});
