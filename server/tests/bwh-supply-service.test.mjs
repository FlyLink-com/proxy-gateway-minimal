import assert from "node:assert/strict";
import test from "node:test";
import { createBwhSupplyService } from "../services/platform/bwh-supply-service.mjs";

const AT = "2026-10-19T10:00:00.000Z";
const HOST_REV = "a".repeat(64);
const NEXT_REV = "b".repeat(64);
const POLICY_REV = "c".repeat(64);
const NODE_ID = "tpnode_" + "1".repeat(32);
const PLANS = ["monthly_basic", "monthly_plus", "yearly"];
const input = enabled => ({ revision: POLICY_REV, supplyRevision: HOST_REV, enabled });
const code = expected => error => error?.code === expected;
function status(state = "enabled", overrides = {}) {
  const running = state === "enabled";
  return { revision: running ? HOST_REV : NEXT_REV, state, protocolsRunning: running ? 3 : 0,
    collectorState: running ? "running" : "paused", nativeDistributionEnabled: running,
    observedAt: AT, canPause: running, canEnable: state === "paused", ...overrides };
}
function fixture({ featureEnabled = true, host: suppliedHost, policy: suppliedPolicy } = {}) {
  let persisted = status();
  let calls = 0;
  const policy = suppliedPolicy || {
    revision: POLICY_REV,
    routes: PLANS.map(planId => ({ planId, mode: "third-party", nodeIds: [NODE_ID] })),
    candidates: [{ id: NODE_ID, enabled: true, sourceEnabled: true, tiers: [...PLANS] }]
  };
  const host = suppliedHost || {
    durableIntent: true,
    readStatus: () => ({ ...persisted }),
    allowsNativeDistribution: () => persisted.state === "enabled" && persisted.nativeDistributionEnabled,
    setEnabled: async ({ enabled, expectedRevision }) => {
      calls += 1;
      assert.equal(expectedRevision, persisted.revision);
      persisted = status(enabled ? "enabled" : "paused", { revision: NEXT_REV });
      return { ...persisted };
    }
  };
  const distributionStore = { getSnapshot: () => structuredClone(policy) };
  const service = createBwhSupplyService({ enabled: featureEnabled, host, distributionStore, nowFn: () => new Date(AT) });
  return { service, host, policy, distributionStore, get calls() { return calls; }, setPersisted: value => { persisted = value; } };
}

test("disabled and unconfigured service returns unavailable controls; enabled unknown blocks native", async () => {
  const off = createBwhSupplyService();
  assert.equal(off.read().state, "unavailable");
  assert.equal(off.read().canPause, false);
  assert.equal(off.read().canEnable, false);
  assert.equal(off.allowsNativeDistribution(), true);
  const missing = createBwhSupplyService({ enabled: true });
  assert.equal(missing.read().state, "unavailable");
  assert.equal(missing.allowsNativeDistribution(), false);
  await assert.rejects(missing.setEnabled(input(false)), code("supply_unavailable"));
  await assert.rejects(off.setEnabled(input(false)), code("supply_unavailable"));
});

test("pause validates policy and host revisions then returns actual host readback without editing policy", async () => {
  const f = fixture();
  const before = structuredClone(f.policy);
  const result = await f.service.setEnabled(input(false));
  assert.equal(result.state, "paused");
  assert.equal(result.protocolsRunning, 0);
  assert.equal(result.collectorState, "paused");
  assert.equal(result.nativeDistributionEnabled, false);
  assert.equal(f.calls, 1);
  assert.deepEqual(f.policy, before);
  assert.equal(f.service.allowsNativeDistribution(), false);
});

test("enable requires all three protocols, native output and collector running before reporting success", async () => {
  const f = fixture();
  f.setPersisted(status("paused"));
  const result = await f.service.setEnabled({ ...input(true), supplyRevision: NEXT_REV });
  assert.equal(result.state, "enabled");
  assert.equal(result.protocolsRunning, 3);
  assert.equal(result.collectorState, "running");
  assert.equal(result.nativeDistributionEnabled, true);
  assert.equal(f.service.allowsNativeDistribution(), true);
});

test("stale host and policy revisions reject before host mutation", async () => {
  const f = fixture();
  await assert.rejects(f.service.setEnabled({ ...input(false), revision: "f".repeat(64) }), code("revision_conflict"));
  await assert.rejects(f.service.setEnabled({ ...input(false), supplyRevision: "f".repeat(64) }), code("revision_conflict"));
  assert.equal(f.calls, 0);
  assert.equal(f.service.allowsNativeDistribution(), true);
});

test("strict input rejects command, unit, path, coercions and forged DTO fields", async () => {
  const f = fixture();
  for (const value of [null, {}, { ...input(false), enabled: "false" }, { ...input(false), unit: "arbitrary.service" }, { ...input(false), command: "stop" }, { ...input(false), path: "/tmp/marker" }, { ...input(false), state: "paused" }, { ...input(false), supplyRevision: "bad" }]) {
    await assert.rejects(f.service.setEnabled(value), code("invalid_input"));
  }
  assert.equal(f.calls, 0);
});

test("all three plans need nonempty enabled eligible third-party selections before pause", async () => {
  for (const modify of [
    policy => { policy.routes.pop(); },
    policy => { policy.routes[0].mode = "owned"; },
    policy => { policy.routes[0].nodeIds = []; },
    policy => { policy.routes[0].nodeIds.push("tpnode_" + "2".repeat(32)); },
    policy => { policy.candidates[0].enabled = false; },
    policy => { policy.candidates[0].sourceEnabled = false; },
    policy => { policy.candidates[0].tiers = ["yearly"]; },
    policy => { policy.routes[1] = { ...policy.routes[0] }; }
  ]) {
    const f = fixture(); modify(f.policy);
    assert.equal(f.service.read().canPause, false);
    await assert.rejects(f.service.setEnabled(input(false)), code("third_party_required"));
    assert.equal(f.calls, 0);
  }
});

test("in-flight request blocks native immediately, refuses concurrency, and never queues a second action", async () => {
  let persisted = status();
  let complete;
  let calls = 0;
  const host = { durableIntent: true, readStatus: () => persisted,
    allowsNativeDistribution: () => true,
    setEnabled: () => { calls += 1; return new Promise(resolve => { complete = () => { persisted = status("paused"); resolve(persisted); }; }); } };
  const f = fixture({ host });
  const pending = f.service.setEnabled(input(false));
  assert.equal(f.service.isTransitioning(), true);
  assert.equal(f.service.read().state, "transitioning");
  assert.equal(f.service.allowsNativeDistribution(), false);
  await assert.rejects(f.service.setEnabled(input(false)), code("supply_busy"));
  assert.equal(calls, 1);
  complete();
  await pending;
  assert.equal(f.service.isTransitioning(), false);
});

test("unknown operation outcome stays fail closed until an explicit fresh read", async () => {
  let persisted = status();
  const host = { durableIntent: true, readStatus: () => persisted, allowsNativeDistribution: () => true,
    setEnabled: async () => { persisted = status("transitioning", { nativeDistributionEnabled: false, collectorState: "unknown", protocolsRunning: 1 }); throw new Error("sensitive host payload"); } };
  const f = fixture({ host });
  await assert.rejects(f.service.setEnabled(input(false)), error => error.code === "supply_failed" && !error.message.includes("sensitive"));
  assert.equal(f.service.allowsNativeDistribution(), false);
  assert.equal(f.service.isTransitioning(), true);
  assert.equal(f.service.read().canPause, false);
  persisted = status("enabled", { revision: NEXT_REV });
  assert.equal(f.service.allowsNativeDistribution(), false);
  assert.equal(f.service.read().state, "enabled");
  assert.equal(f.service.isTransitioning(), false);
  assert.equal(f.service.allowsNativeDistribution(), true);
});

test("restart sees durable host pending and cannot resume native output or queue an action", async () => {
  const pending = status("transitioning", { protocolsRunning: 1, collectorState: "unknown", nativeDistributionEnabled: false });
  const host = { durableIntent: true, readStatus: () => pending, allowsNativeDistribution: () => false, setEnabled: async () => { throw new Error("must not run"); } };
  const restarted = fixture({ host }).service;
  assert.equal(restarted.read().state, "transitioning");
  assert.equal(restarted.isTransitioning(), true);
  assert.equal(restarted.allowsNativeDistribution(), false);
  await assert.rejects(restarted.setEnabled({ ...input(false), supplyRevision: NEXT_REV }), code("supply_busy"));
});

test("adapters without durable host intent cannot authorize physical operations", async () => {
  const host = { readStatus: () => status(), allowsNativeDistribution: () => true, setEnabled: async () => status("paused") };
  const service = fixture({ host }).service;
  assert.equal(service.read().state, "unavailable");
  assert.equal(service.allowsNativeDistribution(), false);
  await assert.rejects(service.setEnabled(input(false)), code("supply_unavailable"));
});

test("malformed, contradictory, stale and future DTOs are sanitized unavailable", async () => {
  for (const supplied of [null, { ...status(), secret: "hidden" }, status("enabled", { protocolsRunning: 0 }), status("paused", { nativeDistributionEnabled: true }), status("enabled", { observedAt: null }), status("enabled", { observedAt: "2026-10-19T09:58:59.000Z" }), status("enabled", { observedAt: "2026-10-19T10:00:01.000Z" }), status("failed", { nativeDistributionEnabled: true }), status("enabled", { collectorState: "paused" }), status("enabled", { canEnable: true })]) {
    const host = { durableIntent: true, readStatus: () => supplied, setEnabled: async () => supplied };
    const service = fixture({ host }).service;
    const read = service.read();
    assert.equal(read.state, "unavailable");
    assert.equal(read.nativeDistributionEnabled, false);
    assert.equal(read.canPause, false);
    assert.equal(JSON.stringify(read).includes("hidden"), false);
    assert.equal(service.allowsNativeDistribution(), false);
    await assert.rejects(service.setEnabled(input(false)), code("supply_unavailable"));
  }
});

test("fallback status freshness expires but concrete durable hot path does not execute Admin status queries", () => {
  let calls = 0;
  const service = fixture({ host: { durableIntent: true,
    readStatus: () => { calls += 1; throw new Error("would launch status command"); },
    allowsNativeDistribution: () => true, setEnabled: async () => status() } }).service;
  assert.equal(service.allowsNativeDistribution(), true);
  assert.equal(calls, 0);
});

test("false success or mismatched persisted postflight remains failed until reread", async () => {
  for (const result of [status("enabled"), status("paused", { protocolsRunning: 1 }), status("paused", { collectorState: "running" }), status("paused", { nativeDistributionEnabled: true }), status("paused", { observedAt: null })]) {
    const host = { durableIntent: true, readStatus: () => status(), allowsNativeDistribution: () => true, setEnabled: async () => result };
    const service = fixture({ host }).service;
    await assert.rejects(service.setEnabled(input(false)), code("supply_failed"));
    assert.equal(service.allowsNativeDistribution(), false);
  }
});

test("policy drift during host action is reported after completion and native stays fail closed", async () => {
  let persisted = status();
  let policy;
  const host = { durableIntent: true, readStatus: () => persisted, allowsNativeDistribution: () => true,
    setEnabled: async () => { policy.revision = "f".repeat(64); persisted = status("paused"); return persisted; } };
  const f = fixture({ host }); policy = f.policy;
  await assert.rejects(f.service.setEnabled(input(false)), code("supply_failed"));
  assert.equal(f.service.allowsNativeDistribution(), false);
});

test("throwing host status and material errors expose only constant safe output", async () => {
  const host = { durableIntent: true, readStatus: () => { throw new Error("password=synthetic-private-material"); }, setEnabled: async () => { throw new Error("private"); } };
  const service = fixture({ host }).service;
  const result = service.read();
  assert.equal(JSON.stringify(result).includes("private"), false);
  assert.deepEqual(Object.keys(result).sort(), ["revision", "state", "protocolsRunning", "collectorState", "nativeDistributionEnabled", "observedAt", "canPause", "canEnable"].sort());
  assert.match(result.revision, /^[a-f0-9]{64}$/);
  await assert.rejects(service.setEnabled(input(false)), error => error.code === "supply_unavailable" && !error.message.includes("private"));
});
