import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AdminAuthError,
  createAdminAuthClient,
  type AdminAuthErrorCode,
} from "../app/admin-auth-client";
import { PASSWORD_NORMALIZATION_VECTORS } from "./password-normalization-vectors";

const FUTURE = "2099-01-01T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

function expectError(code: AdminAuthErrorCode) {
  return (error: unknown) => {
    expect(error).toBeInstanceOf(AdminAuthError);
    expect((error as AdminAuthError).code).toBe(code);
    expect(String((error as Error).message)).not.toMatch(/password|acct_|admin_session_|admin_totp_|secret|token/i);
    return true;
  };
}

describe("createAdminAuthClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("issues the four same-origin contracts without Authorization or storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const fetcher = vi.fn<typeof fetch>();
    fetcher
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: false, mode: "portalAccount" }))
      .mockResolvedValueOnce(
        jsonResponse(202, {
          challenge: {
            challengeRef: "admin_totp_challenge_1",
            operatorRef: "acct_op1",
            methods: ["totp"],
            issuedAt: FUTURE,
            expiresAt: FUTURE,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          session: {
            sessionRef: "admin_session_1",
            operatorRef: "acct_op1",
            authMethod: "totp",
            status: "active",
            issuedAt: FUTURE,
            expiresAt: FUTURE,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { loggedOut: true }));

    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;

    await expect(client.session(signal)).resolves.toEqual({
      authenticated: false,
      setupRequired: false,
    });
    await expect(client.login({ password: "secret-pass" }, signal)).resolves.toEqual({
      challengeRef: "admin_totp_challenge_1",
      expiresAt: FUTURE,
    });
    await expect(client.verify({ challengeRef: "admin_totp_challenge_1", code: "123456" }, signal)).resolves.toBeUndefined();
    await expect(client.logout(signal)).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledTimes(4);
    const [sessionInit, loginInit, verifyInit, logoutInit] = fetcher.mock.calls.map((call) => call[1] as RequestInit);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/api/admin-auth/session");
    expect(sessionInit).toMatchObject({ method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal });
    expect(sessionInit.body).toBeUndefined();

    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/admin-auth/login");
    expect(loginInit.method).toBe("POST");
    expect(JSON.parse(String(loginInit.body))).toEqual({ bootstrapToken: "secret-pass" });

    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/admin-auth/totp/verify");
    expect(JSON.parse(String(verifyInit.body))).toEqual({ challengeRef: "admin_totp_challenge_1", code: "123456" });

    expect(fetcher.mock.calls[3]?.[0]).toBe("/api/admin-auth/logout");
    expect(JSON.parse(String(logoutInit.body))).toEqual({});

    for (const init of [sessionInit, loginInit, verifyInit, logoutInit]) {
      expect(init.credentials).toBe("same-origin");
      expect(init.cache).toBe("no-store");
      expect(init.redirect).toBe("error");
      expect(init.signal).toBe(signal);
      const headers = new Headers(init.headers);
      expect(headers.has("Authorization")).toBe(false);
    }
    expect(setItem).not.toHaveBeenCalled();
  });

  it("applies the shared R1 trim-only vectors before the Admin authentication request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      jsonResponse(202, {
        challenge: {
          challengeRef: "admin_totp_challenge_1",
          operatorRef: "acct_op1",
          methods: ["totp"],
          issuedAt: FUTURE,
          expiresAt: FUTURE,
        },
      }),
    );
    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;

    for (const vector of PASSWORD_NORMALIZATION_VECTORS) {
      await expect(client.login({ password: vector.input }, signal)).resolves.toEqual({
        challengeRef: "admin_totp_challenge_1",
        expiresAt: FUTURE,
      });
      const lastCall = fetcher.mock.calls[fetcher.mock.calls.length - 1];
      expect(lastCall?.[0]).toBe("/api/admin-auth/login");
      expect(JSON.parse(String(lastCall?.[1]?.body))).toEqual({
        bootstrapToken: vector.expected,
      });
    }
    expect(fetcher).toHaveBeenCalledTimes(PASSWORD_NORMALIZATION_VECTORS.length);
  });

  it("projects authenticated session and setupRequired while stripping private extras", async () => {
    const fetcher = vi.fn<typeof fetch>();
    fetcher
      .mockResolvedValueOnce(
        jsonResponse(200, {
          authenticated: true,
          session: {
            sessionRef: "admin_session_private",
            operatorRef: "acct_op1",
            authMethod: "totp",
            status: "active",
            issuedAt: FUTURE,
            expiresAt: FUTURE,
            secret: "do-not-leak",
          },
          extra: true,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          authenticated: false,
          mode: "portalAccount",
          operatorRef: "acct_op1",
          setupRequired: true,
          enrollmentSecret: "x",
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: false }));

    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;
    await expect(client.session(signal)).resolves.toEqual({ authenticated: true, expiresAt: FUTURE });
    await expect(client.session(signal)).resolves.toEqual({
      authenticated: false,
      setupRequired: true,
    });
    await expect(client.session(signal)).resolves.toEqual({
      authenticated: false,
      setupRequired: false,
    });
  });

  it("maps HTTP statuses to safe error codes", async () => {
    const cases: Array<[number, AdminAuthErrorCode]> = [
      [401, "session"],
      [403, "permission"],
      [429, "rate_limited"],
      [404, "unavailable"],
      [503, "unavailable"],
      [400, "invalid"],
    ];
    for (const [status, code] of cases) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(status, { error: "raw private" }));
      const client = createAdminAuthClient({ fetcher });
      await expect(client.session(new AbortController().signal)).rejects.toSatisfy(expectError(code));
    }
  });

  it("rejects malformed or expired session and challenge payloads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-12T00:00:00.000Z"));
    const fetcher = vi.fn<typeof fetch>();
    fetcher
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: true, session: { expiresAt: PAST, authMethod: "totp", status: "active" } }))
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: true, session: null }))
      .mockResolvedValueOnce(jsonResponse(200, { authenticated: false, mode: "portalAccount", operatorRef: 1, setupRequired: false }))
      .mockResolvedValueOnce(
        jsonResponse(202, {
          challenge: { challengeRef: "bad ref", methods: ["totp"], expiresAt: FUTURE },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(202, {
          challenge: { challengeRef: "admin_totp_challenge_1", methods: ["sms"], expiresAt: FUTURE },
        }),
      );

    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;
    await expect(client.session(signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.session(signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.session(signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.login({ operatorRef: "acct_op1", password: "secret-pass" }, signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.login({ operatorRef: "acct_op1", password: "secret-pass" }, signal)).rejects.toSatisfy(expectError("invalid"));
  });

  it("stops invalid inputs before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;
    await expect(client.login({ operatorRef: "bad ref", password: "secret-pass" }, signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.login({ operatorRef: "acct_op1", password: "" }, signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.login({ operatorRef: "acct_op1", password: " \t\uFEFF\u00A0\u3000\u2029" }, signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.verify({ challengeRef: "admin_totp_challenge_1", code: "12 456" }, signal)).rejects.toSatisfy(expectError("invalid"));
    await expect(client.verify({ challengeRef: "bad ref", code: "123456" }, signal)).rejects.toSatisfy(expectError("invalid"));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("propagates AbortError and maps other failures to network without leaking bodies", async () => {
    const abort = new DOMException("aborted", "AbortError");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(abort).mockRejectedValueOnce(new TypeError("failed to fetch secret"));
    const client = createAdminAuthClient({ fetcher });
    const signal = new AbortController().signal;
    await expect(client.session(signal)).rejects.toBe(abort);
    await expect(client.session(signal)).rejects.toSatisfy(expectError("network"));
  });
});
