import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../App";
import { createAdminProtectedAuthClient } from "../features/admin-auth/admin-auth-client";
import { AdminProtectedAuthShell } from "../features/admin-auth/admin-protected-auth-shell";

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.location.hash = "";
});

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) }
  });
}

describe("admin protected auth client", () => {
  test("uses same-origin cookie auth without sending bearer authorization", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      authenticated: true,
      session: {
        authMethod: "totp",
        expiresAt: "2026-07-01T01:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        operatorRef: "operator_local_admin",
        sessionRef: "admin_session_ref",
        status: "active"
      }
    }));
    const client = createAdminProtectedAuthClient({ fetcher: fetchMock });

    const status = await client.session();

    expect(status.authenticated).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin-auth/session",
      expect.objectContaining({ credentials: "same-origin", headers: expect.any(Headers) })
    );
    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((firstCall[1].headers as Headers).has("authorization")).toBe(false);
  });

  test("business Admin API can use protected cookie session without browser bearer", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const { createAdminApiClient } = await import("../features/subscriptions/api-client");
    const client = createAdminApiClient({
      authMode: "protectedSession",
      baseUrl: "",
      fetcher: fetchMock
    });

    await client.listTenants();

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe("/api/admin/subscriptions");
    expect(firstCall[1].credentials).toBe("same-origin");
    expect((firstCall[1].headers as Headers).has("authorization")).toBe(false);
  });

  test("business Admin API ignores legacy console tokens and never sends browser bearer", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [] }));
    const { createAdminApiClient } = await import("../features/subscriptions/api-client");
    const legacyOptions = {
      baseUrl: "",
      consoleToken: "legacy-console-token",
      fetcher: fetchMock
    } as Parameters<typeof createAdminApiClient>[0] & { consoleToken: string };
    const client = createAdminApiClient(legacyOptions);

    await client.listTenants();

    const firstCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(firstCall[0]).toBe("/api/admin/subscriptions");
    expect(firstCall[1].credentials).toBe("same-origin");
    expect((firstCall[1].headers as Headers).has("authorization")).toBe(false);
  });

  test("maps bootstrap, enrollment, login, TOTP verify, and logout endpoints", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/api/admin-auth/bootstrap/start")) {
        return jsonResponse({
          enrollment: {
            enrollmentRef: "enroll_1",
            issuer: "GlobalCircle Admin",
            manualKey: "JBSWY3DPEHPK3PXP",
            operatorRef: "operator_local_admin",
            otpauthUri: "otpauth://totp/GlobalCircle%20Admin:operator_local_admin?secret=JBSWY3DPEHPK3PXP",
            issuedAt: "2026-07-01T00:00:00.000Z",
            expiresAt: "2026-07-01T00:05:00.000Z"
          }
        }, { status: 201 });
      }
      if (path.endsWith("/api/admin-auth/totp/enrollment/confirm")) {
        return jsonResponse({ session: { operatorRef: "operator_local_admin", sessionRef: "session_1" } });
      }
      if (path.endsWith("/api/admin-auth/login")) {
        return jsonResponse({
          challenge: {
            challengeRef: "challenge_1",
            operatorRef: "operator_local_admin",
            methods: ["totp"],
            issuedAt: "2026-07-01T00:10:00.000Z",
            expiresAt: "2026-07-01T00:15:00.000Z"
          }
        }, { status: 202 });
      }
      if (path.endsWith("/api/admin-auth/totp/verify")) {
        return jsonResponse({ session: { operatorRef: "operator_local_admin", sessionRef: "session_2" } });
      }
      if (path.endsWith("/api/admin-auth/logout")) {
        return jsonResponse({ loggedOut: true });
      }
      return jsonResponse({}, { status: 404 });
    });
    const client = createAdminProtectedAuthClient({ fetcher: fetchMock });

    const enrollment = await client.startBootstrap({ bootstrapToken: "bootstrap" });
    const setupSession = await client.confirmEnrollment({ enrollmentRef: enrollment.enrollmentRef, code: "123456" });
    const challenge = await client.login({ operatorRef: "operator_local_admin", bootstrapToken: "bootstrap" });
    const loginSession = await client.verifyTotp({ challengeRef: challenge.challengeRef, code: "654321" });
    const logout = await client.logout();

    expect(enrollment.manualKey).toBe("JBSWY3DPEHPK3PXP");
    expect(setupSession.operatorRef).toBe("operator_local_admin");
    expect(challenge.challengeRef).toBe("challenge_1");
    expect(loginSession.sessionRef).toBe("session_2");
    expect(logout.loggedOut).toBe(true);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect((init.headers as Headers).has("authorization")).toBe(false);
      expect(init.credentials).toBe("same-origin");
    }
  });
});

describe("admin protected auth shell", () => {
  test("starts first-admin setup only after the server explicitly requires setup", async () => {
    const onAuthenticated = vi.fn();
    const client = {
      session: vi.fn(async () => ({ authenticated: false as const, setupRequired: true })),
      startBootstrap: vi.fn(async () => ({
        enrollmentRef: "enroll_1",
        issuer: "GlobalCircle Admin",
        manualKey: "JBSWY3DPEHPK3PXP",
        operatorRef: "operator_local_admin",
        otpauthUri: "otpauth://totp/GlobalCircle%20Admin:operator_local_admin?secret=JBSWY3DPEHPK3PXP",
        issuedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2026-07-01T00:05:00.000Z"
      })),
      confirmEnrollment: vi.fn(async () => ({
        authMethod: "totp" as const,
        operatorRef: "operator_local_admin",
        sessionRef: "session_1",
        status: "active" as const
      })),
      login: vi.fn(),
      verifyTotp: vi.fn(),
      logout: vi.fn()
    };

    render(<AdminProtectedAuthShell client={client} onAuthenticated={onAuthenticated} />);

    expect(await screen.findByRole("heading", { name: "First administrator setup" })).not.toBeNull();
    expect(screen.queryByRole("list", { name: "Protected Admin login steps" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Protected Admin password step" })).toBeNull();
    expect(screen.getByRole("form", { name: "Authenticator enrollment step" })).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Administrator setup key"), { target: { value: "bootstrap" } });
    fireEvent.click(screen.getByRole("button", { name: "Start administrator setup" }));

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("Authenticator code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm authenticator" }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(expect.objectContaining({
        authMode: "protectedSession",
        baseUrl: expect.any(String)
      }));
    });
    expect(client.confirmEnrollment).toHaveBeenCalledWith({ enrollmentRef: "enroll_1", code: "123456" });
    expect(window.sessionStorage.getItem("proxy-gateway-admin-session") ?? "").not.toMatch(/bootstrap|123456|JBSWY/i);
  });

  test("shows account and password login first and verifies with TOTP", async () => {
    const onAuthenticated = vi.fn();
    const client = {
      session: vi.fn(async () => ({ authenticated: false as const })),
      startBootstrap: vi.fn(),
      confirmEnrollment: vi.fn(),
      login: vi.fn(async () => ({
        challengeRef: "challenge_1",
        operatorRef: "operator_local_admin",
        methods: ["totp"],
        issuedAt: "2026-07-01T00:10:00.000Z",
        expiresAt: "2026-07-01T00:15:00.000Z"
      })),
      verifyTotp: vi.fn(async () => ({
        authMethod: "totp" as const,
        operatorRef: "operator_local_admin",
        sessionRef: "session_2",
        status: "active" as const
      })),
      logout: vi.fn(async () => ({ loggedOut: true as const }))
    };

    render(<AdminProtectedAuthShell client={client} onAuthenticated={onAuthenticated} />);

    expect(await screen.findByRole("heading", { name: "Admin account login" })).not.toBeNull();
    expect(screen.queryByLabelText("Bootstrap token")).toBeNull();
    expect(screen.queryByRole("list", { name: "Protected Admin login steps" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Verify Google Authenticator code" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Admin ID"), { target: { value: "operator_local_admin" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bootstrap" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Google Authenticator Verification" })).not.toBeNull();
    });
    expect(screen.queryByRole("list", { name: "Protected Admin login steps" })).toBeNull();
    expect(screen.queryByRole("form", { name: "Protected Admin password step" })).toBeNull();
    expect((screen.queryByLabelText("Password") as HTMLInputElement | null)?.value ?? "").toBe("");

    fireEvent.change(screen.getByLabelText("6-digit verification code"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and open Admin" }));

    await waitFor(() => {
      expect(onAuthenticated).toHaveBeenCalledWith(expect.objectContaining({
        authMode: "protectedSession",
        baseUrl: expect.any(String)
      }));
    });
    expect(client.verifyTotp).toHaveBeenCalledWith({ challengeRef: "challenge_1", code: "654321" });
    expect(document.body.textContent ?? "").not.toMatch(/console token|bootstrap token|Bearer|secret=/i);
  });

  test("renders portal-account Admin login without bootstrap setup when authenticator is already bound", async () => {
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
      login: vi.fn(async () => ({
        challengeRef: "challenge_portal_1",
        operatorRef: "portal_user_20260604_001",
        methods: ["totp"],
        issuedAt: "2026-07-01T00:10:00.000Z",
        expiresAt: "2026-07-01T00:15:00.000Z"
      })),
      verifyTotp: vi.fn(async () => ({
        authMethod: "totp" as const,
        operatorRef: "portal_user_20260604_001",
        sessionRef: "session_portal_1",
        status: "active" as const
      })),
      logout: vi.fn(async () => ({ loggedOut: true as const }))
    };

    render(<AdminProtectedAuthShell client={client} onAuthenticated={onAuthenticated} />);

    expect(await screen.findByRole("heading", { name: "Portal account login" })).not.toBeNull();
    expect(screen.queryByLabelText("Bootstrap token")).toBeNull();
    expect(screen.queryByText("First administrator setup")).toBeNull();
    expect((screen.getByLabelText("Account ID") as HTMLInputElement).value).toBe("portal_user_20260604_001");

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "portal-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => {
      expect(client.login).toHaveBeenCalledWith({
        operatorRef: "portal_user_20260604_001",
        bootstrapToken: "portal-password"
      });
    });
    expect(screen.getByRole("form", { name: "Verify Google Authenticator code" })).not.toBeNull();
  });
});

describe("admin app protected auth entry", () => {
  test("renders protected Admin auth without the legacy console token panel when no session is configured", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/api/admin-auth/session")) {
        return jsonResponse({ authenticated: false });
      }
      return jsonResponse({}, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Admin account login" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "Connect Admin API" })).toBeNull();
    expect(screen.queryByText(/Console token/i)).toBeNull();
    expect(screen.queryByText(/Bootstrap token/i)).toBeNull();
    expect(screen.queryByText(/API base URL/i)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin-auth/session",
      expect.objectContaining({ credentials: "same-origin" })
    );
  });
});
