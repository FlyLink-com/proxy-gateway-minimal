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
});
