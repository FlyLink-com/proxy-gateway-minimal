import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createPortalReferralClient,
  PortalReferralClientError,
} from "../features/user-portal/referrals/referral-client";
import { createPortalBrowserFetch } from "../features/user-portal/portal-browser-session";

const SESSION = "portalsession_fixture";
const CONTEXT = `portalctx_${"a".repeat(64)}`;
const POLICY = {
  policyRef: "policy_fixture", version: 1, effectiveAt: "2026-09-08T00:00:00.000Z",
  rateBps: 500, rounding: "floor", attributionDays: 30, confirmationDays: 7,
};
const PROFILE = { eligible: true, linkPath: `/r/${"A".repeat(32)}`, policy: POLICY };
const PERFORMANCE = {
  registrations: 4, firstRechargeConversions: 1, creditedFirstRechargeCoins: 100,
  pendingRewardCoins: 5, availableRewardCoins: 0, reversedRewardCoins: 0,
  conversionRate: 0.25, reconciliationRequired: false,
};
function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, redirected: false,
    text: async () => JSON.stringify(body) } as Response;
}
function setup(body: unknown, status = 200) {
  const fetchFn = vi.fn(async () => response(body, status));
  return { fetchFn, client: createPortalReferralClient({ fetchFn }) };
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Portal referral strict client", () => {
  test.each(["getProfile", "createLink"] as const)("%s consumes the exact profile and fixed route", async method => {
    const { client, fetchFn } = setup({ profile: PROFILE });
    expect(await client[method]({ sessionRef: SESSION })).toEqual({ ...PROFILE, attributionDays: 30 });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/portal/referral/${method === "createLink" ? "link" : "profile"}`);
    expect(init.method).toBe(method === "createLink" ? "POST" : "GET");
    expect(init.body).toBe(method === "createLink" ? "{}" : undefined);
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect(init.credentials).toBe("omit");
    expect(new Headers(init.headers).get("X-Portal-Session")).toBe(SESSION);
  });
  test("cookie context remains non-credential context and uses same-origin cookies", async () => {
    const { client, fetchFn } = setup({ performance: PERFORMANCE });
    expect(await client.getPerformance({ sessionRef: CONTEXT })).toEqual(PERFORMANCE);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/portal/referral/performance");
    expect(init.credentials).toBe("same-origin");
    const headers = new Headers(init.headers);
    expect(headers.has("X-Portal-Session")).toBe(false);
    expect(headers.get("X-Portal-Session-Context")).toBe(CONTEXT);
    expect(headers.get("X-Portal-Request")).toBe("browser-v1");
  });
  test("existing wrapped Portal transport remains idempotent", async () => {
    for (const sessionRef of [SESSION, CONTEXT]) {
      const fetchFn = vi.fn(async () => response({ profile: PROFILE }));
      const client = createPortalReferralClient({ fetchFn: createPortalBrowserFetch(fetchFn) });
      expect(await client.getProfile({ sessionRef })).toEqual({ ...PROFILE, attributionDays: 30 });
      const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
      expect(new Headers(init.headers).get(sessionRef === CONTEXT ? "X-Portal-Session-Context" : "X-Portal-Session")).toBe(sessionRef);
      expect(init.credentials).toBe(sessionRef === CONTEXT ? "same-origin" : "omit");
    }
  });
  test.each([
    { eligible: true, linkPath: null, policy: null },
    { eligible: false, linkPath: null, policy: POLICY },
    { ...PROFILE, policy: { ...POLICY, rounding: "half_up", confirmationDays: 0 } },
  ])("accepts exact legitimate profile states %#", async profile => {
    expect(await setup({ profile }).client.getProfile({ sessionRef: SESSION })).toEqual({ ...profile, attributionDays: profile.policy?.attributionDays ?? null });
  });
  test.each([1, 365])("distribution-only profile permits link creation with explicit %i-day attribution", async attributionDays => {
    const profile = { ...PROFILE, policy: null, attributionDays };
    const { client } = setup({ profile });
    expect(await client.getProfile({ sessionRef: SESSION })).toEqual(profile);
    expect(await client.createLink({ sessionRef: SESSION })).toEqual(profile);
  });
  test.each([
    { ...PROFILE, attributionDays: 30 },
    { eligible: true, linkPath: null, policy: null, attributionDays: null },
    { eligible: false, linkPath: null, policy: null, attributionDays: 30 },
  ])("accepts exact extended profile state %#", async profile => {
    expect(await setup({ profile }).client.getProfile({ sessionRef: SESSION })).toEqual(profile);
  });
  test.each([0, -1, 366, 1.5, "30", false, {}, undefined])("rejects malformed attribution window %#", async attributionDays => {
    const profile = { ...PROFILE, policy: null, attributionDays };
    // Undefined is absent on JSON wires; test a missing field plus an unknown key.
    if (attributionDays === undefined) Object.assign(profile, { unexpectedWindow: 30 });
    await expect(setup({ profile }).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    { ...PROFILE, attributionDays: null }, { ...PROFILE, attributionDays: 31 },
    { ...PROFILE, attributionDays: 30, rewardsEnabled: false },
  ])("rejects inconsistent policy windows and extra authority fields %#", async profile => {
    await expect(setup({ profile }).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    { ...PROFILE, policy: null },
    { ...PROFILE, policy: null, attributionDays: null },
  ])("does not invent an attribution window for a successful link mutation %#", async profile => {
    await expect(setup({ profile }).client.createLink({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    "https://outside.invalid/r/code", "//outside.invalid/r/code", "/r/../admin",
    `/r/${"A".repeat(32)}?next=x`, `/r/${"A".repeat(32)}#x`, `/r/${"A".repeat(31)}`,
    `/r/${"A".repeat(32)}\n`, `/r/${"A".repeat(32)}/`, "/r/%41".repeat(32),
  ])("rejects injected/noncanonical link %#", async linkPath => {
    await expect(setup({ profile: { ...PROFILE, linkPath } }).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    { ...PROFILE, eligible: 1 }, { ...PROFILE, extra: "private" },
    { ...PROFILE, eligible: false }, { ...PROFILE, policy: { ...POLICY, version: 0 } },
    { ...PROFILE, policy: { ...POLICY, rateBps: 0 } },
    { ...PROFILE, policy: { ...POLICY, rateBps: 10001 } },
    { ...PROFILE, policy: { ...POLICY, attributionDays: 366 } },
    { ...PROFILE, policy: { ...POLICY, confirmationDays: -1 } },
    { ...PROFILE, policy: { ...POLICY, effectiveAt: "2026-02-30T00:00:00.000Z" } },
    { ...PROFILE, policy: { ...POLICY, rounding: "ceil" } },
    { ...PROFILE, policy: { ...POLICY, policyRef: "policy_fixture\n" } },
  ])("rejects malformed profile/policy %#", async profile => {
    await expect(setup({ profile }).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test("createLink cannot report successful creation without a usable profile", async () => {
    await expect(setup({ profile: { eligible: true, linkPath: null, policy: null } }).client.createLink({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    { ...PERFORMANCE, registrations: -1 }, { ...PERFORMANCE, pendingRewardCoins: 0.5 },
    { ...PERFORMANCE, availableRewardCoins: Number.MAX_SAFE_INTEGER + 1 },
    { ...PERFORMANCE, firstRechargeConversions: 5 }, { ...PERFORMANCE, conversionRate: 0.3 },
    { ...PERFORMANCE, reconciliationRequired: "false" }, { ...PERFORMANCE, customer: "private" },
  ])("rejects malformed aggregate %#", async performance => {
    await expect(setup({ performance }).client.getPerformance({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test("accepts empty metrics and exact repeating conversion ratio", async () => {
    for (const performance of [
      { registrations: 0, firstRechargeConversions: 0, creditedFirstRechargeCoins: 0,
        pendingRewardCoins: 0, availableRewardCoins: 0, reversedRewardCoins: 0,
        conversionRate: 0, reconciliationRequired: false },
      { ...PERFORMANCE, registrations: 3, conversionRate: 1 / 3 },
    ]) expect(await setup({ performance }).client.getPerformance({ sessionRef: SESSION })).toEqual(performance);
  });
  test.each([
    [401, "invalid_session", false], [403, "referral_request_invalid", false],
    [400, "referral_request_invalid", false], [413, "referral_request_invalid", false],
    [403, "referral_account_ineligible", false], [503, "referral_policy_unavailable", false],
    [503, "referral_unavailable", true], [429, "referral_rate_limited", true],
    [404, "not_found", false],
  ] as const)("maps wire %i/%s without leaking bodies", async (status, code, retryable) => {
    await expect(setup({ error: code }, status).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code, retryable, message: "Portal referral request failed." });
  });
  test.each(["getProfile", "createLink", "getPerformance"] as const)("%s recognizes the disabled backend's exact empty 404", async method => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 404 }));
    await expect(createPortalReferralClient({ fetchFn })[method]({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "not_found", retryable: false });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  test.each([
    [404, "<html>not found</html>"], [404, "private upstream failure"], [404, " "],
    [404, JSON.stringify({ error: "not_found", secret: "private" })],
    [200, ""], [401, ""], [403, ""], [503, ""],
  ])("does not widen empty-404 handling to other responses %#", async (status, text) => {
    const fetchFn = vi.fn(async () => new Response(text as string, { status: status as number }));
    await expect(createPortalReferralClient({ fetchFn }).getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test.each([
    [503, { error: "invalid_session" }], [200, { error: "referral_unavailable" }],
    [503, { error: "private details" }], [503, { error: "referral_unavailable", secret: "private" }],
    [201, { profile: PROFILE }], [200, { profile: PROFILE, accountId: "private" }],
  ])("rejects status/shape confusion %#", async (status, body) => {
    await expect(setup(body, status as number).client.getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
  });
  test("caller identity/extra attribution operands fail before fetch", async () => {
    const { client, fetchFn } = setup({ profile: PROFILE });
    for (const input of [null, {}, { sessionRef: "bad value" }, { sessionRef: SESSION, accountId: "account_other" },
      { sessionRef: SESSION, signal: {} }]) {
      await expect(client.getProfile(input as never)).rejects.toBeInstanceOf(PortalReferralClientError);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test("pre-aborted caller signal does not issue requests", async () => {
    const controller = new AbortController(); controller.abort("private abort reason");
    const { client, fetchFn } = setup({ profile: PROFILE });
    await expect(client.createLink({ sessionRef: SESSION, signal: controller.signal }))
      .rejects.toMatchObject({ code: "referral_request_aborted", retryable: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });
  test("caller abort reaches actual fetch and does not expose reason", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn((_url, init: RequestInit | undefined) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("private")));
    }));
    const pending = createPortalReferralClient({ fetchFn }).getProfile({ sessionRef: SESSION, signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ code: "referral_request_aborted", message: "Portal referral request failed." });
    controller.abort("private reason"); await assertion;
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  test("deadline aborts real fetch without retrying createLink", async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((_url, init: RequestInit | undefined) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("private timeout")));
    }));
    const pending = createPortalReferralClient({ fetchFn }).createLink({ sessionRef: SESSION });
    const assertion = expect(pending).rejects.toMatchObject({ code: "referral_request_failed", retryable: true });
    await vi.advanceTimersByTimeAsync(15_000); await assertion;
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  test("abort during body read and malformed/oversized JSON stay closed", async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(async () => ({ ...response({ profile: PROFILE }), text: async () => {
      controller.abort(); return JSON.stringify({ profile: PROFILE });
    } }));
    await expect(createPortalReferralClient({ fetchFn }).getProfile({ sessionRef: SESSION, signal: controller.signal }))
      .rejects.toMatchObject({ code: "referral_request_aborted" });
    for (const text of ["private bad JSON", " ".repeat(65537), JSON.stringify({ profile: PROFILE }).replace('"eligible":true', '"eligible":true,"eligible":false')]) {
      const raw = async () => ({ ...response({}), text: async () => text });
      await expect(createPortalReferralClient({ fetchFn: raw }).getProfile({ sessionRef: SESSION }))
        .rejects.toMatchObject({ code: "referral_request_failed" });
    }
  });
  test("unexpected redirect or network exception stays generic", async () => {
    const fetchFn = vi.fn(async () => ({ ...response({ profile: PROFILE }), redirected: true }));
    await expect(createPortalReferralClient({ fetchFn }).getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed" });
    await expect(createPortalReferralClient({ fetchFn: async () => { throw new Error("secret network detail"); } }).getProfile({ sessionRef: SESSION }))
      .rejects.toMatchObject({ code: "referral_request_failed", message: "Portal referral request failed." });
  });
});
