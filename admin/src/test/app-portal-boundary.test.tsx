import { afterEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const localClientCalls = vi.hoisted(() => [] as unknown[]);
const commerceClientCalls = vi.hoisted(() => ({ http: 0, local: [] as unknown[] }));

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

vi.mock("../features/user-portal/commerce/commerce-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/user-portal/commerce/commerce-client")>();
  return {
    ...actual,
    createHttpCommerceClient: vi.fn((options?: unknown) => {
      commerceClientCalls.http += 1;
      return actual.createHttpCommerceClient(options as never);
    }),
    createLocalPreviewCommerceClient: vi.fn((options: unknown) => {
      commerceClientCalls.local.push(options);
      return actual.createLocalPreviewCommerceClient(options as never);
    })
  };
});

const { App } = await import("../App");

afterEach(() => {
  cleanup();
  localClientCalls.length = 0;
  commerceClientCalls.http = 0;
  commerceClientCalls.local.length = 0;
  window.history.replaceState(null, "", "/");
  window.location.hash = "";
  vi.restoreAllMocks();
});

describe("App portal boundary", () => {
  test("does not construct the preview portal client for the real portal route", async () => {
    window.history.replaceState(null, "", "/portal");

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(localClientCalls).toEqual([]);
    expect(commerceClientCalls.http).toBeGreaterThan(0);
    expect(commerceClientCalls.local).toEqual([]);
  });

  test("constructs the demo portal client only for the explicit preview route", async () => {
    window.history.replaceState(null, "", "/");
    window.location.hash = "#/portal-preview";

    render(createElement(App));

    expect(await screen.findByRole("heading", { name: "账号登录" })).not.toBeNull();
    expect(localClientCalls).toEqual([{
      demoSubscriptionUrl: "https://sub.example.test/import/local-preview-visible-once"
    }]);
    expect(commerceClientCalls.http).toBe(0);
    expect(commerceClientCalls.local).toHaveLength(1);
  });

  test("active Portal source has no legacy direct payment caller", () => {
    const source = readFileSync(resolve("src/features/user-portal/user-portal-page.tsx"), "utf8");
    const client = readFileSync(resolve("src/features/user-portal/user-portal-client.ts"), "utf8");
    expect(`${source}\n${client}`).not.toMatch(/\/api\/portal\/payments\/(current|checkout)|createPaymentCheckout|fetchPaymentOrders/);
  });
});
