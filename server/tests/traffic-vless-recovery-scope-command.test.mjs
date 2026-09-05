import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { runTrafficUsageCollectOnce } from "../../scripts/traffic-usage-collect-once.mjs";
const path = resolve("private-scope.json");
const scope = { channelRefs: ["channel-vultr-a-vless-reality-tcp"], protocol: "vless", lifecycleMode: "record-only" };
test("recovery scope argument failures never construct runtime or fall back to full collection", async () => {
  for (const argv of [["--collect", "--recovery-scope-file"], ["--collect", "--recovery-scope-file", path, "--force"], ["--collect", `--recovery-scope-file=${path}`], ["--collect", "--check", "--recovery-scope-file", path]]) {
    let calls = 0;
    let output = "";
    const exit = await runTrafficUsageCollectOnce({ argv, runtimeStateFactory() { calls++; return {}; }, stdout: { write: (s) => { output += s; } }, stderr: { write: (s) => { output += s; } } });
    assert.equal(calls, 0);
    assert.equal(exit, 2);
    assert.doesNotMatch(output, /private-scope/);
  }
});
test("scoped CLI requires admission, preserves explicit deferred policy and only writes isolated status", async () => {
  let globalStatus = 0;
  let scopedStatus = 0;
  let constructed = 0;
  let output = "";
  const report = { ok: true, collectorCount: 1, unresolvedCount: 0, reports: [], collectionScope: scope, lifecycleDeferred: true, trafficSupplySuspendDeferredCount: 1, quotaCycleRollover: { status: "deferred_for_recovery_review" }, nextAction: "review_deferred_traffic_supply_lifecycle" };
  const exit = await runTrafficUsageCollectOnce({ argv: ["--collect", "--recovery-scope-file", path],
    recoveryScopeLoader: () => ({ collectionScope: scope, statusFile: resolve("vless-recovery-status.json"), baselinePlanDigest: "a".repeat(64) }),
    recoveryStatusWriter: (_path, value) => { scopedStatus++; assert.equal(value.type, "traffic_vless_recovery_status"); assert.equal(value.summary.lifecycleDeferred, true); },
    runtimeStateFactory: (options) => { constructed++; assert.deepEqual(options.trafficUsageCollectionScope, scope); return { platform: { edgeUsageAccounting: { collectAndRecord: async () => report }, trafficCollectorStatusStore: { write() { globalStatus++; } }, japanTuicRepairObservationStore: { write() { globalStatus++; } } } }; },
    stdout: { write: (s) => { output += s; } }
  });
  assert.equal(exit, 0);
  assert.equal(constructed, 1);
  assert.equal(globalStatus, 0);
  assert.equal(scopedStatus, 1);
  assert.equal(JSON.parse(output).lifecycleDeferred, true);
});
test("scope gate rejects before runtime; scoped unresolved is never tolerated", async () => {
  let constructed = 0;
  assert.equal(await runTrafficUsageCollectOnce({ argv: ["--collect", "--recovery-scope-file", path],
    recoveryScopeLoader: () => { throw new Error("private-secret"); },
    runtimeStateFactory: () => { constructed++; }, stderr: { write: (s) => assert.doesNotMatch(s, /private-secret/) }
  }), 2);
  assert.equal(constructed, 0);
});
