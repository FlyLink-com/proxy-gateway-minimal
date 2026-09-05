import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createRuntimeState } from "../state.mjs";
import { createRuntimeUsageAccountingService } from "../services/platform/runtime-usage-accounting.mjs";

const VLESS = ["channel-japan-vless", "channel-sgp-vless"];
const ALL = [...VLESS, "channel-japan-hy2", "channel-japan-tuic", "channel-other-vless"];
const scope = (channelRefs = VLESS) => ({ channelRefs: [...channelRefs], protocol: "vless", lifecycleMode: "record-only" });
const SOURCES = VLESS.map((channelRef, index) => ({ channelRefs: [channelRef], statsServer: `127.0.0.1:${10085 + index}` }));

function fixture(t, overrides = {}) {
  const directory = mkdtempSync(join(tmpdir(), "traffic-scope-"));
  const configPath = join(directory, "proxy.json");
  writeFileSync(configPath, JSON.stringify({ servers: ALL.map((name) => ({
    id: name, name, type: name.endsWith("hy2") ? "hysteria2" : name.endsWith("tuic") ? "tuic" : "vless",
    protocol: name.endsWith("hy2") ? "hysteria2" : name.endsWith("tuic") ? "tuic" : "vless",
    host: "synthetic.example.test", port: 443, uuid: "11111111-1111-4111-8111-111111111111",
    password: "synthetic", status: "online"
  })) }));
  let state;
  t.after(async () => {
    await state?.close();
    rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });
  const env = Object.freeze({
    CONSOLE_TOKEN: "synthetic-console", SS_PASSWORD: "synthetic",
    SUBSCRIPTION_PROXY_CONFIG_PATH: configPath,
    SUBSCRIPTION_DB_PATH: join(directory, "subscriptions.sqlite"),
    SUBSCRIPTION_CONTROL_DB_PATH: join(directory, "control.sqlite"),
    EDGE_CREDENTIAL_CHANNEL_REFS: ALL.join(","),
    EDGE_USAGE_COLLECTOR_ENABLED: "true",
    EDGE_XRAY_USAGE_SOURCES_JSON: JSON.stringify(SOURCES),
    // Construction of either excluded reader must fail, even without a network call.
    EDGE_HYSTERIA2_TRAFFIC_STATS_LISTEN: "not-a-loopback-source",
    EDGE_MIHOMO_USAGE_SOURCES_JSON: JSON.stringify([{ controllerSecretPath: join(directory, "must-not-read") }]),
    ...overrides
  });
  return { env, directory, create(options = {}) {
    state = createRuntimeState({ rootDir: new URL("../../", import.meta.url), env, autoStartHttpProxy: false, ...options });
    return state;
  } };
}

test("scoped runtime constructs only selected VLESS readers and preserves lifecycle/issuer inputs", async (t) => {
  const f = fixture(t, { EDGE_XRAY_USAGE_SOURCES_JSON: JSON.stringify([
    ...SOURCES, { channelRefs: ["channel-other-vless"], statsServer: "invalid-excluded-source" }
  ]) });
  const original = { ...f.env };
  const issuer = { marker: "unchanged-issuer" };
  const lifecycle = { marker: "unchanged-lifecycle" };
  const gate = { handleUsageDecision() { throw new Error("must not suspend"); }, sweepQuotaCycleRollovers() { throw new Error("must not sweep"); } };
  const calls = [];
  let forbiddenCalls = 0;
  let admissionCalls = 0;
  const state = f.create({
    trafficUsageCollectionScope: scope(), edgeCredentialIssuer: issuer, edgeLifecycleService: lifecycle,
    trafficUsageCollectionAdmission() { admissionCalls += 1; assert.equal(calls.length, 2); return true; },
    orderUsageQuotaLifecycleGate: gate,
    edgeUsageFetch() { forbiddenCalls += 1; throw new Error("excluded fetch"); },
    edgeUsageCommandRunner(command, args) {
      calls.push({ command, args });
      return { exitCode: 0, stdout: JSON.stringify({ stat: [] }) };
    }
  });
  assert.deepEqual(state.platform.edgeUsageCollectors.map((item) => item.channelRef), VLESS);
  assert.equal(state.platform.edgeCredentialIssuer, issuer);
  assert.equal(state.platform.edgeLifecycleService, lifecycle);
  assert.equal(state.platform.orderUsageQuotaLifecycleGate, gate);
  const report = await state.platform.edgeUsageAccounting.collectAndRecord();
  assert.equal(report.ok, true);
  assert.equal(report.lifecycleDeferred, true);
  assert.equal(report.nextAction, "review_deferred_traffic_supply_lifecycle");
  assert.equal(report.execution.trafficSupplyMutationAttempted, false);
  assert.equal(forbiddenCalls, 0);
  assert.equal(admissionCalls, 1);
  assert.deepEqual(calls.map(({ args }) => args.find((arg) => arg.startsWith("--server="))), SOURCES.map(({ statsServer }) => `--server=${statsServer}`));
  assert.equal(calls.every(({ args }) => !args.some((arg) => /reset|clear/i.test(arg))), true);
  assert.deepEqual(f.env, original);
  assert.equal(f.env.EDGE_CREDENTIAL_CHANNEL_REFS, ALL.join(","));
});

test("real credential issuer and lifecycle fanout retain all channels under a narrow collector scope", (t) => {
  const f = fixture(t, { USER_PORTAL_EDGE_LIFECYCLE_ENABLED: "true" });
  const state = f.create({
    trafficUsageCollectionScope: scope([VLESS[0]]),
    edgeCredentialMaterialStore: { putCredentialMaterial({ credentialRef, materialDigest }) { return { credentialRef, materialDigest }; } }
  });
  const credentials = state.platform.edgeCredentialIssuer.ensureCredentialsForOrder({ id: "synthetic-order" });
  assert.deepEqual(credentials.map(({ edgeChannelRef }) => edgeChannelRef), ALL);
  const lifecycle = state.platform.edgeLifecycleService.reconcileOrderLifecycle();
  assert.deepEqual(lifecycle.channelRefs, ALL);
  assert.equal(lifecycle.reports.every((report) => report.mutation === false), true);
  assert.deepEqual(state.platform.edgeUsageCollectors.map(({ channelRef }) => channelRef), [VLESS[0]]);
});

for (const [label, invalid] of [
  ["null", null], ["empty", scope([])], ["unknown", scope(["channel-missing"])],
  ["non-vless", scope(["channel-japan-hy2"])], ["duplicate", scope([VLESS[0], VLESS[0]])],
  ["wrong protocol", { ...scope(), protocol: "tuic" }], ["wrong lifecycle", { ...scope(), lifecycleMode: "automatic" }],
  ["unexpected key", { ...scope(), force: true }]
]) test(`runtime rejects ${label} scope before opening stores or constructing readers`, (t) => {
  const f = fixture(t);
  assert.throws(() => f.create({ trafficUsageCollectionScope: invalid }), { code: "traffic_usage_collection_scope_invalid" });
  assert.equal(existsSync(f.env.SUBSCRIPTION_CONTROL_DB_PATH), false);
  assert.equal(existsSync(f.env.SUBSCRIPTION_DB_PATH), false);
});

for (const [label, sources] of [
  ["missing", [SOURCES[0]]], ["duplicate mapping", [...SOURCES, SOURCES[0]]],
  ["duplicate reader endpoint", [SOURCES[0], { ...SOURCES[1], statsServer: SOURCES[0].statsServer }]],
  ["loopback alias duplicate endpoint", [SOURCES[0], { ...SOURCES[1], statsServer: "localhost:10085" }]],
  ["broadcast source", [{ statsServer: "127.0.0.1:10085" }]],
  ["multi-channel source", [{ channelRefs: VLESS, statsServer: "127.0.0.1:10085" }]]
]) test(`runtime rejects ${label} VLESS source before reader initialization`, (t) => {
  const f = fixture(t, { EDGE_XRAY_USAGE_SOURCES_JSON: JSON.stringify(sources) });
  assert.throws(() => f.create({ trafficUsageCollectionScope: scope() }), { code: "traffic_usage_collection_scope_invalid" });
  assert.equal(existsSync(f.env.SUBSCRIPTION_CONTROL_DB_PATH), false);
});

for (const [label, env, options] of [
  ["disabled collection", { EDGE_USAGE_COLLECTOR_ENABLED: "false" }, {}],
  ["target excluded from configured edge refs", { EDGE_CREDENTIAL_CHANNEL_REFS: "channel-japan-hy2" }, {}],
  ["invalid source JSON", { EDGE_XRAY_USAGE_SOURCES_JSON: "invalid" }, {}],
  ["custom collectors", {}, { edgeUsageCollectors: [] }],
  ["custom accounting", {}, { edgeUsageAccounting: { collectAndRecord() {} } }]
]) test(`scoped runtime rejects ${label} before opening the control store`, (t) => {
  const f = fixture(t, env);
  assert.throws(() => f.create({ trafficUsageCollectionScope: scope(), ...options }), { code: "traffic_usage_collection_scope_invalid" });
  assert.equal(existsSync(f.env.SUBSCRIPTION_CONTROL_DB_PATH), false);
});

function observation(channelRef) {
  return { channelRef, sourceRef: "xray_statsquery_user_traffic", edgeCredentialRef: "synthetic-ref", accountingMode: "cumulative" };
}

function accountingFixture({ collectionScope = scope(), observations = VLESS.map((ref) => [observation(ref)]), collectedOverride = {}, beforeRecordGuard } = {}) {
  const calls = { record: [], suspend: 0, rollover: 0, read: 0 };
  const service = createRuntimeUsageAccountingService({
    collectionScope,
    beforeRecordGuard,
    collectors: VLESS.map((channelRef, index) => ({ channelRef, async collect() {
      calls.read += 1;
      return { ok: true, status: "collected", channelRef, accountingMode: "cumulative", observations: observations[index], ...collectedOverride };
    } })),
    accounting: { recordUsageObservation(input) {
      calls.record.push(input);
      return { ok: true, sampleInserted: true, status: "over_quota_disable_required", lifecycleAction: "traffic_supply_suspend_required", channelRef: input.channelRef };
    } },
    trafficSupplyLifecycleGate: {
      handleUsageDecision() { calls.suspend += 1; return { ok: true, status: "suspended", mutation: true }; },
      sweepQuotaCycleRollovers() { calls.rollover += 1; return { ok: true, status: "swept", mutation: false }; }
    }
  });
  return { calls, service };
}

test("record-only records selected observations while deferring both lifecycle paths", async () => {
  const { calls, service } = accountingFixture();
  const report = await service.collectAndRecord();
  assert.equal(calls.record.length, 2);
  assert.equal(calls.suspend, 0);
  assert.equal(calls.rollover, 0);
  assert.equal(report.lifecycleDeferred, true);
  assert.equal(report.trafficSupplySuspendDeferredCount, 2);
  assert.equal(report.quotaCycleRollover.status, "deferred_for_recovery_review");
  assert.equal(report.execution.trafficSupplyMutationExecuted, false);
  assert.equal(report.reports.every((item) => item.recorded[0].trafficSupplyLifecycle.status === "deferred_for_recovery_review"), true);
});

for (const [label, guard] of [
  ["false", async () => false], ["undefined", () => undefined], ["throw", () => { throw new Error("private admission context"); }]
]) test(`scoped admission guard ${label} rejects after reads and before all writes`, async () => {
  let guardCalls = 0;
  const { calls, service } = accountingFixture({ beforeRecordGuard: async () => {
    guardCalls += 1;
    assert.equal(calls.read, 2);
    assert.equal(calls.record.length, 0);
    return guard();
  } });
  const report = await service.collectAndRecord();
  assert.equal(guardCalls, 1);
  assert.equal(report.ok, false);
  assert.equal(report.errorCode, "traffic_usage_collection_admission_rejected");
  assert.equal(calls.record.length, 0);
  assert.equal(calls.suspend, 0);
  assert.equal(calls.rollover, 0);
  assert.doesNotMatch(JSON.stringify(report), /private admission context/);
});

test("scoped admission guard must return exact true before any accounting", async () => {
  let guardCalls = 0;
  const { calls, service } = accountingFixture({ beforeRecordGuard: async (batch) => {
    guardCalls += 1;
    assert.equal(calls.read, 2);
    assert.equal(calls.record.length, 0);
    assert.deepEqual(batch.map(({ channelRef, collected }) => [channelRef, collected.observations]), VLESS.map((ref) => [ref, [observation(ref)]]));
    return true;
  } });
  assert.equal((await service.collectAndRecord()).ok, true);
  assert.equal(guardCalls, 1);
  assert.equal(calls.record.length, 2);
});

for (const [label, overrides] of [
  ["mixed out-of-scope observations", { observations: [[observation(VLESS[0])], [observation(VLESS[1]), observation("channel-japan-tuic")]] }],
  ["misattributed selected channel", { observations: [[observation(VLESS[0])], [observation(VLESS[0])]] }],
  ["non-cumulative report", { collectedOverride: { accountingMode: "delta" } }],
  ["failed reader with observations", { collectedOverride: { ok: false } }]
]) test(`${label} rejects the entire collected batch before any accounting`, async () => {
  const { calls, service } = accountingFixture(overrides);
  const report = await service.collectAndRecord();
  assert.equal(report.ok, false);
  assert.equal(report.recordedCount, 0);
  assert.equal(report.insertedCount, 0);
  assert.equal(calls.record.length, 0);
  assert.equal(calls.suspend, 0);
  assert.equal(calls.rollover, 0);
  assert.equal(report.errorCode, "traffic_usage_collection_scope_violation");
  assert.doesNotMatch(JSON.stringify(report), /channel-japan-tuic|synthetic-ref/);
});

test("ordinary unscoped accounting retains automatic suspension and rollover", async () => {
  const calls = { suspend: 0, rollover: 0 };
  const ordinary = createRuntimeUsageAccountingService({
    beforeRecordGuard() { throw new Error("ordinary accounting must not call a recovery-only guard"); },
    collectors: [{ channelRef: VLESS[0], collect: async () => ({ ok: true, observations: [observation(VLESS[0])] }) }],
    accounting: { recordUsageObservation() { return { ok: true, sampleInserted: true, lifecycleAction: "traffic_supply_suspend_required" }; } },
    trafficSupplyLifecycleGate: {
      handleUsageDecision() { calls.suspend += 1; return { ok: true, mutation: true }; },
      sweepQuotaCycleRollovers() { calls.rollover += 1; return { ok: true }; }
    }
  });
  const report = await ordinary.collectAndRecord();
  assert.equal(report.ok, true);
  assert.equal(calls.suspend, 1);
  assert.equal(calls.rollover, 1);
  assert.equal(Object.hasOwn(report, "lifecycleDeferred"), false);
});

test("accounting copies and freezes scope before callers can change selected channels", async () => {
  const input = scope();
  const { calls, service } = accountingFixture({ collectionScope: input });
  input.channelRefs.push("channel-other-vless");
  input.lifecycleMode = "automatic";
  const report = await service.collectAndRecord();
  assert.deepEqual(report.collectionScope.channelRefs, VLESS);
  assert.equal(report.collectionScope.lifecycleMode, "record-only");
  assert.equal(Object.isFrozen(report.collectionScope), true);
  assert.equal(Object.isFrozen(report.collectionScope.channelRefs), true);
  assert.equal(calls.suspend, 0);
  assert.equal(calls.rollover, 0);
});

for (const refs of [[VLESS[0]], [VLESS[0], VLESS[0]], [...VLESS, "channel-other-vless"]]) {
  test(`accounting rejects collector inventory mismatch (${refs.join(",")}) before readers run`, () => {
    let calls = 0;
    assert.throws(() => createRuntimeUsageAccountingService({
      collectionScope: scope(),
      collectors: refs.map((channelRef) => ({ channelRef, collect() { calls += 1; } })),
      accounting: { recordUsageObservation() { calls += 1; } }
    }), { code: "traffic_usage_collection_scope_invalid" });
    assert.equal(calls, 0);
  });
}

const rawRow = (direction, value) => ({ name: `user>>>synthetic-ref>>>traffic>>>${direction}`, value });
for (const [label, rows] of [
  ["invalid numeric", [rawRow("uplink", "not-a-number"), rawRow("downlink", 2)]],
  ["negative counter", [rawRow("uplink", -1), rawRow("downlink", 2)]],
  ["missing direction", [rawRow("uplink", 1)]],
  ["duplicate direction", [rawRow("uplink", 1), rawRow("uplink", 2), rawRow("downlink", 3)]]
]) test(`real scoped readers reject ${label} before any channel is recorded`, async (t) => {
  const f = fixture(t);
  let records = 0;
  const state = f.create({
    trafficUsageCollectionScope: scope(),
    platformTrafficAccounting: { recordUsageObservation() { records += 1; return { ok: true, sampleInserted: true }; } },
    edgeUsageCommandRunner(command, args) {
      return { exitCode: 0, stdout: JSON.stringify({ stat: args.includes("--server=127.0.0.1:10085")
        ? [rawRow("uplink", 1), rawRow("downlink", 2)] : rows }) };
    }
  });
  const report = await state.platform.edgeUsageAccounting.collectAndRecord();
  assert.equal(records, 0);
  assert.equal(report.ok, false);
  assert.equal(report.errorCode, "traffic_usage_collection_scope_violation");
});
