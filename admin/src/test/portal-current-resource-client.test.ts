import { describe, expect, test, vi } from "vitest";

import { createHttpUserPortalClient } from "../features/user-portal/user-portal-client";

const AVAILABLE_RESOURCE = {
  resource: {
    state: "available",
    plan: {
      id: "monthly_basic",
      durationDays: 30,
      monthlyTrafficGb: 50
    },
    validUntil: "2026-09-14T00:00:00.000Z",
    setupAvailable: false
  }
};

const SETUP_DELIVERY = {
  delivery: {
    handoffRef: "portal_setup_handoff_001",
    kind: "subscription_url",
    subscriptionUrl: "https://portal.example.test/subscriptions/temporary-delivery"
  }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Portal current-resource HTTP client", () => {
  test("uses only the Portal session header and maps the safe available projection", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(AVAILABLE_RESOURCE));
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.fetchCurrentResource({ sessionRef: "portal_resource_session_001" })).resolves.toEqual({
      state: "available",
      plan: {
        id: "monthly_basic",
        durationDays: 30,
        monthlyTrafficGb: 50
      },
      validUntil: "2026-09-14T00:00:00.000Z",
      setupAvailable: false
    });

    expect(fetchFn).toHaveBeenCalledWith("/api/portal/resources/current", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": "portal_resource_session_001"
      }
    });
  });

  test.each([
    [{ resource: { state: "none" } }, { state: "none" }],
    [{ resource: { state: "reconciliation_required" } }, { state: "reconciliation_required" }]
  ])("maps the safe %s state without inventing resource data", async (body, expected) => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse(body))
    });

    await expect(client.fetchCurrentResource({ sessionRef: "portal_resource_session_002" })).resolves.toEqual(expected);
  });

  test("rejects an unexpected subscription URL or other delivery material", async () => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({
        resource: {
          ...AVAILABLE_RESOURCE.resource,
          subscriptionUrl: "https://example.invalid/private-material"
        }
      }))
    });

    await expect(client.fetchCurrentResource({ sessionRef: "portal_resource_session_003" }))
      .rejects.toThrow("当前资源状态无效。");
  });

  test("rejects fields that do not belong to the reported resource state", async () => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({
        resource: {
          state: "none",
          setupAvailable: false
        }
      }))
    });

    await expect(client.fetchCurrentResource({ sessionRef: "portal_resource_session_004" }))
      .rejects.toThrow("当前资源状态无效。");
  });

  test("fails before any request when the Portal session is absent", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.fetchCurrentResource({ sessionRef: "" })).rejects.toThrow("用户会话无效。");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  test("requests explicit setup with only the Portal session and idempotency key", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse(SETUP_DELIVERY));
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.createCurrentResourceSetup({
      sessionRef: "portal_resource_session_005",
      idempotencyKey: "2e2c88a9-0d2d-4ed8-9f0a-d9730fcf5432"
    })).resolves.toEqual({
      handoffRef: "portal_setup_handoff_001",
      kind: "subscription_url",
      subscriptionUrl: "https://portal.example.test/subscriptions/temporary-delivery"
    });

    expect(fetchFn).toHaveBeenCalledWith("/api/portal/resources/current/setup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": "portal_resource_session_005"
      },
      body: JSON.stringify({ idempotencyKey: "2e2c88a9-0d2d-4ed8-9f0a-d9730fcf5432" })
    });
  });

  test("rejects setup delivery material with internal references or unknown fields", async () => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({
        delivery: {
          ...SETUP_DELIVERY.delivery,
          credentialRef: "internal_credential_ref"
        }
      }))
    });

    await expect(client.createCurrentResourceSetup({
      sessionRef: "portal_resource_session_006",
      idempotencyKey: "be4e0ffb-b2e0-4a4f-9f86-cb0e7f1941bd"
    })).rejects.toThrow("配置交付结果无效。");
  });

  test.each([
    "http://portal.example.test/subscriptions/not-secure",
    "https://user:password@portal.example.test/subscriptions/private",
    "https://portal.example.test/subscriptions/private#fragment"
  ])("rejects an unsafe subscription URL in a setup delivery", async (subscriptionUrl) => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({
        delivery: {
          ...SETUP_DELIVERY.delivery,
          subscriptionUrl
        }
      }))
    });

    await expect(client.createCurrentResourceSetup({
      sessionRef: "portal_resource_session_unsafe_url",
      idempotencyKey: "fd39712d-ec01-494f-85e1-09519033028d"
    })).rejects.toThrow("配置交付结果无效。");
  });

  test("acknowledges an explicit handoff using the exact no-content contract", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.acknowledgeCurrentResourceSetup({
      sessionRef: "portal_resource_session_007",
      handoffRef: "portal_setup_handoff_002"
    })).resolves.toBeUndefined();

    expect(fetchFn).toHaveBeenCalledWith("/api/portal/resources/current/setup/ack", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Portal-Session": "portal_resource_session_007"
      },
      body: JSON.stringify({ handoffRef: "portal_setup_handoff_002" })
    });
  });

  test("rejects a setup acknowledgement response that is not exact 204 no-content", async () => {
    const client = createHttpUserPortalClient({
      fetchFn: vi.fn<typeof fetch>(async () => jsonResponse({ acknowledged: true }))
    });

    await expect(client.acknowledgeCurrentResourceSetup({
      sessionRef: "portal_resource_session_008",
      handoffRef: "portal_setup_handoff_003"
    })).rejects.toThrow("配置确认结果无效。");
  });

  test("fails before any setup or acknowledgement request when required caller input is absent", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    const client = createHttpUserPortalClient({ fetchFn });

    await expect(client.createCurrentResourceSetup({
      sessionRef: "portal_resource_session_009",
      idempotencyKey: ""
    })).rejects.toThrow("配置请求无效。");
    await expect(client.acknowledgeCurrentResourceSetup({
      sessionRef: "portal_resource_session_009",
      handoffRef: ""
    })).rejects.toThrow("配置确认无效。");
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
