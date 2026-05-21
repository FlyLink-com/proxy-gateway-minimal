import { describe, expect, test } from "vitest";
import { createMockSubscriptionStore } from "../features/subscriptions/mock-client";

describe("mock subscription store", () => {
  test("creates a subscription and returns a visible-once URL", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });

    expect(result.tenant.displayName).toBe("test-user");
    expect(result.subscriptionUrl).toContain("/sub/clash.yaml?token=");
    expect(store.list()).toHaveLength(1);
  });

  test("disables and re-enables a subscription", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });

    expect(store.disable(result.tenant.id)?.status).toBe("disabled");
    expect(store.enable(result.tenant.id)?.status).toBe("active");
  });

  test("reset token changes token prefix", () => {
    const store = createMockSubscriptionStore([]);
    const result = store.create({
      displayName: "test-user",
      expiresAt: "2026-06-21T00:00:00.000Z",
      note: "manual"
    });
    const reset = store.resetToken(result.tenant.id);

    expect(reset).not.toBeNull();
    expect(reset?.tokenPrefix).not.toBe(result.tenant.tokenPrefix);
  });
});
