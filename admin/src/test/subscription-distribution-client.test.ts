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
function supply() {
  return { revision: "d".repeat(64), state: "enabled", protocolsRunning: 3, collectorState: "running", nativeDistributionEnabled: true,
    observedAt: "2026-10-19T09:00:00.000Z", canPause: true, canEnable: false };
}

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
  it("accepts an exact optional automation capability without inventing it for legacy snapshots", async () => {
    const automation = { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    const fetcher = vi.fn().mockResolvedValueOnce(response(snapshot())).mockResolvedValueOnce(response({ ...snapshot(), automation }));
    const client = createSubscriptionDistributionClient({ fetcher });
    expect(await client.read()).not.toHaveProperty("automation");
    expect((await client.read()).automation).toEqual(automation);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([[false, false], [true, false], [false, true]])("preserves independent capability flags (%s, %s)", async (clientHealthCheckEnabled, dailyRotationEnabled) => {
    const automation = { clientHealthCheckEnabled, dailyRotationEnabled, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" };
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), automation }));
    expect((await createSubscriptionDistributionClient({ fetcher }).read()).automation).toEqual(automation);
  });
  it.each([
    null,
    {},
    { clientHealthCheckEnabled: "true", dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" },
    { clientHealthCheckEnabled: true, dailyRotationEnabled: 1, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC" },
    { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 30, rotationTimezone: "UTC" },
    { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: "300", rotationTimezone: "UTC" },
    { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "local" },
    { clientHealthCheckEnabled: true, dailyRotationEnabled: true, healthCheckIntervalSeconds: 300, rotationTimezone: "UTC", token: "hidden" }
  ])("rejects malformed, incomplete or expanded automation projections", async (automation) => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), automation }));
    await expect(createSubscriptionDistributionClient({ fetcher }).read()).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each(["enabled", "paused", "transitioning", "failed", "unavailable"])("accepts the bounded optional BWH supply state %s", async (state) => {
    const bwhSupply = { ...supply(), state };
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhSupply }));
    expect((await createSubscriptionDistributionClient({ fetcher }).read()).bwhSupply).toEqual(bwhSupply);
  });
  it.each([
    null,
    {},
    { ...supply(), revision: "short" },
    { ...supply(), state: "unknown" },
    { ...supply(), protocolsRunning: -1 },
    { ...supply(), protocolsRunning: 4 },
    { ...supply(), protocolsRunning: 1.5 },
    { ...supply(), collectorState: "enabled" },
    { ...supply(), nativeDistributionEnabled: "true" },
    { ...supply(), observedAt: "not-a-time" },
    { ...supply(), observedAt: "2026-02-30T09:00:00.000Z" },
    { ...supply(), canPause: 1 },
    { ...supply(), canEnable: "false" },
    { ...supply(), service: "hidden" }
  ])("rejects malformed or expanded BWH supply projections", async (bwhSupply) => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhSupply }));
    await expect(createSubscriptionDistributionClient({ fetcher }).read()).rejects.toMatchObject({ code: "invalid" });
  });
  it("keeps legacy supply absent and accepts null observation time", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(snapshot())).mockResolvedValueOnce(response({ ...snapshot(), bwhSupply: { ...supply(), observedAt: null } }));
    const client = createSubscriptionDistributionClient({ fetcher });
    expect(await client.read()).not.toHaveProperty("bwhSupply");
    expect((await client.read()).bwhSupply?.observedAt).toBeNull();
  });
  it("posts only revisions and desired supply enablement with same-origin no-store transport", async () => {
    const bwhSupply = { ...supply(), revision: "e".repeat(64), state: "paused", protocolsRunning: 0, collectorState: "paused", nativeDistributionEnabled: false, canPause: false, canEnable: true };
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhSupply }));
    const input = { revision, supplyRevision: supply().revision, enabled: false };
    expect((await createSubscriptionDistributionClient({ fetcher }).setBwhSupply(input)).bwhSupply).toEqual(bwhSupply);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/third-party-subscriptions/distribution/supply");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "PUT", credentials: "same-origin", mode: "same-origin", cache: "no-store", redirect: "error" });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual(input);
  });
  it("rejects caller-selected service paths and invalid supply input before dispatch", () => {
    const fetcher = vi.fn(); const client = createSubscriptionDistributionClient({ fetcher });
    const valid = { revision, supplyRevision: supply().revision, enabled: false };
    expect(() => client.setBwhSupply({ ...valid, service: "hidden" } as typeof valid)).toThrow(DistributionError);
    expect(() => client.setBwhSupply({ ...valid, supplyRevision: "short" })).toThrow(DistributionError);
    expect(() => client.setBwhSupply({ ...valid, enabled: "false" as unknown as boolean })).toThrow(DistributionError);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    { ...supply(), state: "transitioning" },
    { ...supply(), state: "paused", nativeDistributionEnabled: false, collectorState: "paused" },
    { ...supply(), state: "paused", protocolsRunning: 0, nativeDistributionEnabled: false },
    { ...supply(), state: "paused", protocolsRunning: 0, collectorState: "paused" }
  ])("rejects a pause receipt without verified terminal supply state", async (bwhSupply) => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), ...(bwhSupply ? { bwhSupply } : {}) }));
    await expect(createSubscriptionDistributionClient({ fetcher }).setBwhSupply({ revision, supplyRevision: supply().revision, enabled: false })).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([
    { ...supply(), state: "paused" },
    { ...supply(), protocolsRunning: 2 },
    { ...supply(), collectorState: "unknown" },
    { ...supply(), nativeDistributionEnabled: false }
  ])("rejects enablement before protocol, collector and native-output verification", async (bwhSupply) => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhSupply }));
    await expect(createSubscriptionDistributionClient({ fetcher }).setBwhSupply({ revision, supplyRevision: "e".repeat(64), enabled: true })).rejects.toMatchObject({ code: "invalid" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("accepts verified enablement and aborts an already-cancelled supply command before dispatch", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhSupply: supply() }));
    const client = createSubscriptionDistributionClient({ fetcher });
    const input = { revision, supplyRevision: "e".repeat(64), enabled: true };
    expect((await client.setBwhSupply(input)).bwhSupply?.state).toBe("enabled");
    const controller = new AbortController(); controller.abort();
    await expect(client.setBwhSupply(input, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("waits up to 60 seconds for a supply command and never retries after timeout", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input, init: RequestInit) => new Promise<Response>((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
      const result = createSubscriptionDistributionClient({ fetcher: fetcher as typeof fetch }).setBwhSupply({ revision, supplyRevision: supply().revision, enabled: false });
      const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });
      await vi.advanceTimersByTimeAsync(59_999);
      expect(fetcher.mock.calls[0][1].signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await assertion;
      expect(fetcher).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
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
  it("parses optional total bandwidth and rejects extra or zero rates", async () => {
    const plain = snapshot();
    expect(await createSubscriptionDistributionClient({ fetcher: vi.fn().mockResolvedValue(response(plain)) }).read()).not.toHaveProperty("bwhBandwidth");
    const bwhBandwidth = { revision: "c".repeat(64), state: "desired", inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: null };
    expect((await createSubscriptionDistributionClient({ fetcher: vi.fn().mockResolvedValue(response({ ...snapshot(), bwhBandwidth })) }).read()).bwhBandwidth).toEqual(bwhBandwidth);
    for (const broken of [
      { ...bwhBandwidth, mark: "0xb100" },
      { ...bwhBandwidth, state: "enabled" },
      { ...bwhBandwidth, inboundMbps: "0" },
      { ...bwhBandwidth, inboundMbps: "1.55" },
      { ...bwhBandwidth, outboundMbps: 0 }
    ]) {
      await expect(createSubscriptionDistributionClient({ fetcher: vi.fn().mockResolvedValue(response({ ...snapshot(), bwhBandwidth: broken })) }).read()).rejects.toMatchObject({ code: "invalid" });
    }
  });
  it("sends total bandwidth once and rejects a command field before the request", async () => {
    const bandwidthRevision = "c".repeat(64);
    const bwhBandwidth = { revision: "f".repeat(64), state: "desired", inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: null };
    const fetcher = vi.fn().mockResolvedValue(response({ ...snapshot(), bwhBandwidth }));
    const client = createSubscriptionDistributionClient({ fetcher });
    const save = client.saveBwhBandwidth;
    if (!save) throw new Error("missing bandwidth save");
    const input = { bandwidthRevision, inboundEnabled: true, outboundEnabled: false, inboundMbps: "1.5", outboundMbps: "0.1" };
    expect((await save(input)).bwhBandwidth).toEqual(bwhBandwidth);
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/third-party-subscriptions/distribution/bandwidth");
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual(input);
    expect(() => save({ ...input, command: "tc" } as typeof input)).toThrow(DistributionError);
    expect(() => save({ ...input, inboundMbps: "0" })).toThrow(DistributionError);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not dispatch an already-aborted read", async () => {
    const fetcher = vi.fn(); const controller = new AbortController(); controller.abort();
    await expect(createSubscriptionDistributionClient({ fetcher }).read(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
