import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AdminAuthBoundary } from "../pages/admin-auth-boundary";
import type { AdminAuthClient, AdminAuthStatus } from "../app/admin-auth-client";
import { AdminAuthError } from "../app/admin-auth-client";

const FUTURE = "2099-01-01T00:00:00.000Z";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mockClient(overrides: Partial<AdminAuthClient> = {}): AdminAuthClient {
  return {
    session: vi.fn(async () => ({ authenticated: false as const, operatorRef: "acct_op", setupRequired: false })),
    login: vi.fn(async () => ({ challengeRef: "admin_totp_challenge_1", expiresAt: FUTURE })),
    verify: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    ...overrides
  };
}

function renderBoundary(client: AdminAuthClient, onReady?: (expired: () => void) => void) {
  const child = vi.fn(({ onSessionExpired }: { onSessionExpired: () => void }) => {
    onReady?.(onSessionExpired);
    return (
      <button type="button" onClick={onSessionExpired}>
        业务面板
      </button>
    );
  });
  render(
    <AdminAuthBoundary createClient={() => client}>
      {child as (controls: { onSessionExpired: () => void }) => ReactNode}
    </AdminAuthBoundary>
  );
  return child;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AdminAuthBoundary", () => {
  it("does not invoke children until session is authenticated", async () => {
    const pending = deferred<AdminAuthStatus>();
    const client = mockClient({ session: vi.fn(() => pending.promise) });
    const child = renderBoundary(client);
    expect(child).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Admin Console" })).toBeTruthy();
    pending.resolve({ authenticated: false, operatorRef: "acct_op", setupRequired: false });
    await waitFor(() => expect(screen.getByLabelText("管理员账户")).toBeTruthy());
    expect(child).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it("walks unauth login challenge verify then fresh session before ready", async () => {
    const session = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: false, operatorRef: "acct_op", setupRequired: false })
      .mockResolvedValue({ authenticated: true, expiresAt: FUTURE });
    const client = mockClient({ session, verify: vi.fn(async () => undefined) });
    const child = renderBoundary(client);
    await waitFor(() => expect(screen.getByLabelText("密码")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("管理员账户"), { target: { value: "acct_op" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByLabelText("动态验证码")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy());
    expect(child).toHaveBeenCalled();
    expect(screen.getByText("业务面板")).toBeTruthy();
  });

  it("blocks login when setup is required", async () => {
    const client = mockClient({
      session: vi.fn(async () => ({ authenticated: false as const, operatorRef: "acct_op", setupRequired: true }))
    });
    const child = renderBoundary(client);
    await waitFor(() => expect(screen.getByText("管理员尚未完成安全设置，请联系维护人员。")).toBeTruthy());
    expect(screen.queryByLabelText("密码")).toBeNull();
    expect(child).not.toHaveBeenCalled();
  });

  it("maps session 401 to login-available copy without secrets", async () => {
    const session = vi.fn().mockRejectedValue(
      Object.assign(new AdminAuthError("session"), { message: "secret stack challengeRef bootstrap" })
    );
    const client = mockClient({ session });
    const child = renderBoundary(client);
    await waitFor(() => expect(screen.getByText("登录状态已失效，请重新登录。")).toBeTruthy());
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(screen.queryByText("业务面板")).toBeNull();
    expect(child).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(/secret|stack|challengeRef|bootstrap/i);
  });

  it.each([
    ["permission", "当前账户没有管理权限。"],
    ["rate_limited", "尝试过于频繁，请稍后再试。"],
    ["network", "网络异常，请检查连接后重试。"]
  ] as const)("maps %s to static copy without secrets", async (code, copy) => {
    const session = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new AdminAuthError(code), { message: "secret stack challengeRef bootstrap" })
      )
      .mockRejectedValueOnce(
        Object.assign(new AdminAuthError(code), { message: "secret stack challengeRef bootstrap" })
      );
    const client = mockClient({ session });
    renderBoundary(client);
    await waitFor(() => expect(screen.getByText(copy)).toBeTruthy());
    expect(document.body.textContent).not.toMatch(/secret|stack|challengeRef|bootstrap/i);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(screen.getByText(copy)).toBeTruthy());
    expect(session).toHaveBeenCalledTimes(2);
  });

  it("unmounts children immediately on logout success", async () => {
    const client = mockClient({
      session: vi.fn(async () => ({ authenticated: true as const, expiresAt: FUTURE }))
    });
    const child = renderBoundary(client);
    await waitFor(() => expect(screen.getByText("业务面板")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(screen.queryByText("业务面板")).toBeNull());
    expect(child.mock.calls.length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.getByRole("button", { name: "登录" })).toBeTruthy());
  });

  it("keeps children unmounted and offers retry when logout POST fails", async () => {
    const client = mockClient({
      session: vi.fn(async () => ({ authenticated: true as const, expiresAt: FUTURE })),
      logout: vi.fn(async () => {
        throw new AdminAuthError("unavailable");
      })
    });
    renderBoundary(client);
    await waitFor(() => expect(screen.getByText("业务面板")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
    await waitFor(() => expect(screen.getByText("退出未确认，请重试。")).toBeTruthy());
    expect(screen.queryByText("业务面板")).toBeNull();
    expect(screen.getByRole("button", { name: /重试/ })).toBeTruthy();
  });

  it("unmounts children on business session expiry signal and ignores stale ready", async () => {
    let expire: () => void = () => undefined;
    const pending = deferred<AdminAuthStatus>();
    const session = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true, expiresAt: FUTURE })
      .mockImplementationOnce(() => pending.promise);
    const client = mockClient({ session });
    renderBoundary(client, (onExpired) => {
      expire = onExpired;
    });
    await waitFor(() => expect(screen.getByText("业务面板")).toBeTruthy());
    act(() => {
      expire();
    });
    await waitFor(() => expect(screen.getByText("登录状态已失效，请重新登录。")).toBeTruthy());
    expect(screen.queryByText("业务面板")).toBeNull();
    pending.resolve({ authenticated: true, expiresAt: FUTURE });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("业务面板")).toBeNull();
  });

  it("expires ready session via fake timers and aborts on unmount", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const expiresAt = new Date(Date.now() + 5_000).toISOString();
    const session = vi.fn(async (_signal: AbortSignal) => ({ authenticated: true as const, expiresAt }));
    const client = mockClient({ session });
    const { unmount } = render(
      <AdminAuthBoundary createClient={() => client}>
        {({ onSessionExpired }) => (
          <button type="button" onClick={onSessionExpired}>
            业务面板
          </button>
        )}
      </AdminAuthBoundary>
    );
    await waitFor(() => expect(screen.getByText("业务面板")).toBeTruthy());
    await act(async () => {
      vi.advanceTimersByTime(6_000);
    });
    await waitFor(() => expect(screen.queryByText("业务面板")).toBeNull());
    unmount();
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it.each(["network", "rate_limited"] as const)(
    "returns to password login when challenge expires after a failed %s verify without advancing request timeout",
    async (code) => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const challengeExpiresAt = new Date(Date.now() + 5_000).toISOString();
    const session = vi.fn(async () => ({
      authenticated: false as const,
      operatorRef: "acct_op",
      setupRequired: false
    }));
    const verify = vi.fn(async () => {
      throw new AdminAuthError(code);
    });
    const client = mockClient({
      session,
      login: vi.fn(async () => ({
        challengeRef: "admin_totp_challenge_1",
        expiresAt: challengeExpiresAt
      })),
      verify
    });
    renderBoundary(client);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByLabelText("密码")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("管理员账户"), { target: { value: "acct_op" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByLabelText("动态验证码")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("动态验证码")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(6_000);
      await Promise.resolve();
    });
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.queryByLabelText("动态验证码")).toBeNull();
    }
  );

  it("ignores a late authenticated session after an old onSessionExpired during verify probe", async () => {
    let expire: () => void = () => undefined;
    const pending = deferred<AdminAuthStatus>();
    let probeSignal: AbortSignal | null = null;
    const session = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: true, expiresAt: FUTURE })
      .mockImplementation((signal: AbortSignal) => {
        probeSignal = signal;
        return pending.promise;
      });
    const verify = vi.fn(async () => undefined);
    const client = mockClient({ session, verify });
    const child = renderBoundary(client, (onExpired) => {
      expire = onExpired;
    });
    await waitFor(() => expect(screen.getByText("业务面板")).toBeTruthy());
    act(() => {
      expire();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "登录" })).toBeTruthy());
    expect(screen.queryByText("业务面板")).toBeNull();
    fireEvent.change(screen.getByLabelText("管理员账户"), { target: { value: "acct_op" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByLabelText("动态验证码")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(session).toHaveBeenCalledTimes(2));
    expect(probeSignal).toBeTruthy();
    act(() => {
      expire();
    });
    await waitFor(() => expect(probeSignal?.aborted).toBe(true));
    pending.resolve({ authenticated: true, expiresAt: FUTURE });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
    expect(screen.queryByText("业务面板")).toBeNull();
    expect(child.mock.calls.length).toBeGreaterThan(0);
  });

  it("keeps an unexpired challenge after invalid TOTP session error then reaches ready on retry", async () => {
    const session = vi
      .fn()
      .mockResolvedValueOnce({ authenticated: false, operatorRef: "acct_op", setupRequired: false })
      .mockResolvedValue({ authenticated: true, expiresAt: FUTURE });
    const verify = vi
      .fn()
      .mockRejectedValueOnce(new AdminAuthError("session"))
      .mockResolvedValueOnce(undefined);
    const client = mockClient({ session, verify });
    const child = renderBoundary(client);
    await waitFor(() => expect(screen.getByLabelText("密码")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("管理员账户"), { target: { value: "acct_op" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByLabelText("动态验证码")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByLabelText("动态验证码")).toBeTruthy());
    expect(screen.queryByLabelText("密码")).toBeNull();
    fireEvent.change(screen.getByLabelText("动态验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "验证并登录" }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "退出登录" })).toBeTruthy());
    expect(child).toHaveBeenCalled();
    expect(screen.getByText("业务面板")).toBeTruthy();
  });
});
