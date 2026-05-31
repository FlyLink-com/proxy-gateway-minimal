import { describe, expect, test, vi } from "vitest";
import { checkAdminConnectionHealth } from "../features/subscriptions/connection-health";

function response(status: number) {
  return new Response("ok", { status });
}

describe("connection health diagnostics", () => {
  test("empty token returns token-required without calling fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: " ",
      fetcher: fetchMock
    });

    expect(result.status).toBe("token-required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("health fetch failure maps to network-error", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("network-error");
    expect(result.message).toMatch(/wrong API base URL|SSH tunnel|CORS/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("health non-2xx maps to backend-health-unreachable", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => response(503));

    const result = await checkAdminConnectionHealth({
      baseUrl: "http://127.0.0.1:3456/",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("backend-health-unreachable");
    expect(result.healthStatus).toBe(503);
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3456/api/health", { method: "GET" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("health 2xx plus overview 2xx maps to connected", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("connected");
    expect(result.healthStatus).toBe(200);
    expect(result.adminStatus).toBe(200);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/health", { method: "GET" });
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(secondCall[0]).toBe("/api/admin/overview");
    expect((secondCall[1].headers as Headers).get("authorization")).toBe("Bearer console-secret");
  });

  test("health check does not send the console token to untrusted cross-origin API targets", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(200));

    const result = await checkAdminConnectionHealth({
      baseUrl: "https://evil.example",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("auth-origin-blocked");
    expect(result.healthStatus).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://evil.example/api/health", { method: "GET" });
  });

  test("overview 401 maps to token-invalid", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(401));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "bad-token",
      fetcher: fetchMock
    });

    expect(result.status).toBe("token-invalid");
    expect(result.adminStatus).toBe(401);
  });

  test("overview 403 maps to source-blocked", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(403));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("source-blocked");
    expect(result.adminStatus).toBe(403);
  });

  test("overview 404 maps to public-gateway-blocked", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(200))
      .mockResolvedValueOnce(response(404));

    const result = await checkAdminConnectionHealth({
      baseUrl: "",
      consoleToken: "console-secret",
      fetcher: fetchMock
    });

    expect(result.status).toBe("public-gateway-blocked");
    expect(result.message).toMatch(/public gateway|SSH tunnel/i);
    expect(result.adminStatus).toBe(404);
  });
});
