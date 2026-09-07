import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";

const localClientCalls = vi.hoisted(() => [] as unknown[]);

vi.mock("../features/user-portal/user-portal-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/user-portal/user-portal-client")>();
  return {
    ...actual,
    createLocalUserPortalClient: vi.fn((options?: unknown) => {
      localClientCalls.push(options);
      return actual.createLocalUserPortalClient(options as never);
    })
  };
});

const { App } = await import("../App");

afterEach(() => {
  cleanup();
  localClientCalls.length = 0;
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("App portal boundary", () => {
  test("does not construct the preview portal client for the real portal route", async () => {
    window.history.replaceState(null, "", "/portal");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => new Response(JSON.stringify(
      String(input) === "/api/portal/browser-session" ? { session: null } : {}
    )));

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(localClientCalls).toEqual([]);
    expect(fetchSpy.mock.calls[0][0]).toBe("/api/portal/browser-session");
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store", redirect: "error" });
  });

  test("constructs the demo portal client only for the explicit preview route", async () => {
    window.history.replaceState(null, "", "/");
    window.location.hash = "#/portal-preview";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(localClientCalls).toEqual([{
      demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
    }]);
  });
});
