import { describe, expect, it, vi } from "vitest";
import { createSubscriptionDistributionClient, DistributionError } from "../features/third-party-node-names/subscription-distribution-client";

const revision = "a".repeat(64);
const ownedId = `ownnode_${"1".repeat(32)}`;
const candidateId = `tpnode_${"2".repeat(32)}`;
function snapshot() {
  return {
    revision, owned: { enabled: true, items: [{ id: ownedId, originalName: "US-original", defaultName: "US-default", customName: null, displayName: "US-default", protocol: "vless", countryCode: "US", enabled: true, available: true }] },
    routes: ["monthly_basic", "monthly_plus", "yearly"].map((planId) => ({ planId, mode: "owned", nodeIds: [] })),
    candidates: [{ id: candidateId, sourceId: `tpsrc_${"3".repeat(32)}`, sourceName: "许可来源", displayName: "JP", protocol: "tuic", countryCode: "JP", enabled: true, sourceEnabled: true, tiers: ["monthly_basic"] }]
  };
}
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } }); }

describe("subscription distribution transport boundary", () => {
  it("uses only same-origin cookie no-store routes and an abortable finite request", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(snapshot()));
    expect((await createSubscriptionDistributionClient({ fetcher }).read()).revision).toBe(revision);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/third-party-subscriptions/distribution");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error" });
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  });
  it.each([401, 403, 409, 503])("reports safe HTTP %s classifications without propagating error body", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(response({ error: "secret://do-not-show" }, status));
    const error = await createSubscriptionDistributionClient({ fetcher }).read().catch((error: unknown) => error);
    expect(error).toBeInstanceOf(DistributionError);
    expect(String(error)).not.toContain("secret");
    expect((error as DistributionError).code).toBe(({ 401: "session", 403: "permission", 409: "stale", 503: "unavailable" } as Record<number, string>)[status]);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    (value: ReturnType<typeof snapshot>) => Object.assign(value, { token: "hidden" }),
    (value: ReturnType<typeof snapshot>) => Object.assign(value.owned.items[0], { server: "hidden" }),
    (value: ReturnType<typeof snapshot>) => Object.assign(value.candidates[0], { password: "hidden" }),
    (value: ReturnType<typeof snapshot>) => { value.owned.items[0].id = candidateId; },
    (value: ReturnType<typeof snapshot>) => { value.candidates[0].tiers = ["unsupported"]; },
    (value: ReturnType<typeof snapshot>) => { value.owned.items[0].displayName = "name\u202eunsafe"; },
    (value: ReturnType<typeof snapshot>) => { value.owned.items[0].displayName = "name\ud800"; },
    (value: ReturnType<typeof snapshot>) => { value.routes.pop(); },
    (value: ReturnType<typeof snapshot>) => { value.candidates.push(value.candidates[0]); }
  ])("rejects malformed or sensitive snapshot fields", async (mutate) => {
    const value = snapshot(); mutate(value);
    const fetcher = vi.fn().mockResolvedValue(response(value));
    await expect(createSubscriptionDistributionClient({ fetcher }).read()).rejects.toMatchObject({ code: "invalid" });
  });
  it("posts complete revision-bound routes and keeps the response authoritative", async () => {
    const value = snapshot();
    const fetcher = vi.fn().mockResolvedValue(response(value));
    const client = createSubscriptionDistributionClient({ fetcher });
    const routes = value.routes.map((route) => ({ ...route, planId: route.planId as "monthly_basic" | "monthly_plus" | "yearly", mode: "owned" as const }));
    await client.saveRoutes({ revision, routes });
    expect(fetcher.mock.calls[0][1].method).toBe("PUT");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ revision, routes });
  });
  it("bounds an undeclared response stream and rejects malformed JSON", async () => {
    const oversized = new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { "Content-Type": "application/json" } });
    await expect(createSubscriptionDistributionClient({ fetcher: vi.fn().mockResolvedValue(oversized) }).read()).rejects.toMatchObject({ code: "invalid" });
    await expect(createSubscriptionDistributionClient({ fetcher: vi.fn().mockResolvedValue(new Response("not JSON", { headers: { "Content-Type": "application/json" } })) }).read()).rejects.toMatchObject({ code: "invalid" });
  });
  it("validates mutation keys and node IDs before any request", () => {
    const fetcher = vi.fn(); const client = createSubscriptionDistributionClient({ fetcher });
    expect(() => client.saveRoutes({ revision, routes: [] })).toThrow(DistributionError);
    expect(() => client.saveRoutes({ revision, routes: [
      { planId: "monthly_basic", mode: "third-party", nodeIds: Array.from({ length: 257 }, (_, index) => `tpnode_${index.toString(16).padStart(32, "0")}`) },
      { planId: "monthly_plus", mode: "owned", nodeIds: [] }, { planId: "yearly", mode: "owned", nodeIds: [] }
    ] })).toThrow(DistributionError);
    expect(() => client.saveOwned({ revision, enabled: true, nodes: [{ id: candidateId, enabled: true, customName: null, customCountryCode: null }] })).toThrow(DistributionError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends all owned fields and null clears on the owned endpoint", async () => {
    const value = snapshot(); value.owned.enabled = false; value.owned.items[0].enabled = false; Object.assign(value.owned.items[0], { customName: "别名" });
    const fetcher = vi.fn().mockResolvedValue(response(value));
    const input = { revision, enabled: false, nodes: [{ id: ownedId, enabled: false, customName: "别名", customCountryCode: null }] };
    await createSubscriptionDistributionClient({ fetcher }).saveOwned(input);
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/third-party-subscriptions/distribution/owned");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it("rejects a 200 save receipt that does not reflect the requested settings", async () => {
    const fetcher = vi.fn().mockImplementation(async () => response(snapshot()));
    const client = createSubscriptionDistributionClient({ fetcher });
    await expect(client.saveOwned({ revision, enabled: false, nodes: [{ id: ownedId, enabled: true, customName: null, customCountryCode: null }] })).rejects.toMatchObject({ code: "invalid" });
    await expect(client.saveRoutes({ revision, routes: [
      { planId: "monthly_basic", mode: "third-party", nodeIds: [candidateId] },
      { planId: "monthly_plus", mode: "owned", nodeIds: [] }, { planId: "yearly", mode: "owned", nodeIds: [] }
    ] })).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("times out once and never retries a mutation", async () => {
    const fetcher = vi.fn((_input, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
    const client = createSubscriptionDistributionClient({ fetcher: fetcher as typeof fetch, timeoutMs: 5 });
    await expect(client.saveOwned({ revision, enabled: true, nodes: [] })).rejects.toMatchObject({ code: "timeout" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not dispatch an already-aborted read", async () => {
    const fetcher = vi.fn(); const controller = new AbortController(); controller.abort();
    await expect(createSubscriptionDistributionClient({ fetcher }).read(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
