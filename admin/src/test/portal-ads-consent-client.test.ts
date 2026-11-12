import { expect, test, vi } from "vitest";
import { createHttpUserPortalClient } from "../features/user-portal/user-portal-client";

const sessionRef = `portalctx_${"d".repeat(64)}`;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

test("reads account consent through the authenticated no-store Portal transport", async () => {
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input)).toBe("/api/portal/ads-consent");
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("error");
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Portal-Session")).toBeNull();
    expect(headers.get("X-Portal-Session-Context")).toBe(sessionRef);
    return jsonResponse({
      consent: {
        decision: "unknown",
        adUserData: null,
        adPersonalization: false,
        updatedAt: null
      }
    });
  });

  const client = createHttpUserPortalClient({ fetchFn });
  await expect(client.adsConsent.getConsent({ sessionRef })).resolves.toEqual({
    decision: "unknown",
    adUserData: null,
    adPersonalization: false,
    updatedAt: null
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test("records only the explicit account adUserData choice and fixes personalization off", async () => {
  const fetchFn = vi.fn<typeof fetch>(async (input, init) => {
    expect(String(input)).toBe("/api/portal/ads-consent");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ adUserData: true });
    const headers = new Headers(init?.headers);
    expect(headers.get("X-Portal-Session-Context")).toBe(sessionRef);
    return jsonResponse({
      consent: {
        decision: "granted",
        adUserData: true,
        adPersonalization: false,
        updatedAt: 1_798_000_000_000,
        revocation: { claims: 0, bindings: 0, outbox: 0 }
      }
    });
  });

  const client = createHttpUserPortalClient({ fetchFn });
  await expect(client.adsConsent.setConsent({ sessionRef, adUserData: true })).resolves.toEqual({
    decision: "granted",
    adUserData: true,
    adPersonalization: false,
    updatedAt: 1_798_000_000_000
  });
  expect(fetchFn).toHaveBeenCalledTimes(1);
});

test("rejects inconsistent server consent projections", async () => {
  const fetchFn = vi.fn<typeof fetch>(async () => jsonResponse({
    consent: {
      decision: "granted",
      adUserData: false,
      adPersonalization: false,
      updatedAt: 1_798_000_000_000
    }
  }));
  const client = createHttpUserPortalClient({ fetchFn });
  await expect(client.adsConsent.getConsent({ sessionRef })).rejects.toThrow("广告衡量授权状态无效。");
});
