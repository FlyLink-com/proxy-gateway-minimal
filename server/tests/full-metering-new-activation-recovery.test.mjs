import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { createSqliteSubscriptionControlStore } from "../services/platform/subscription-control-db.mjs";
import { summarizeUsageSamples, usageCycleForBinding } from "../services/platform/usage-billing-cycle.mjs";
import { PLAN_SWITCH_TIERS } from "../services/platform/coin-commerce-plan-switch-policy.mjs";
import { runFullMeteringCollection } from "../../scripts/lib/full-metering-collection.mjs";
import { fullMeteringDigest, readFullMeteringJournal } from "../../scripts/lib/full-metering-journal.mjs";
import { createFullMeteringSampleWriter, makeFullMeteringSample } from "../../scripts/lib/full-metering-sample-writer.mjs";
import { fullMeteringChannels, LOCAL_METERING_SCOPE } from "../../scripts/lib/full-metering-scope.mjs";
import {
  NEW_ACTIVATION_RECOVERY_LIMITS, assertNewActivationRecoveryBounds,
  parseFullMeteringNewActivationRecoveryCommand, validateFullMeteringNewActivationRecoveryRequest,
  runFullMeteringNewActivationRecovery
} from "../../scripts/lib/full-metering-new-activation-recovery.mjs";
import { protectedSha256, runFullMeteringNewActivationRecoveryCommand } from "../../scripts/lib/full-metering-new-activation-recovery-command.mjs";

const [BASIC, PLUS] = PLAN_SWITCH_TIERS;
const channels = fullMeteringChannels(LOCAL_METERING_SCOPE);
const start = "2026-10-01T00:00:00.000Z", first = "2026-10-01T00:01:00.000Z";
const changedAt = "2026-10-01T01:00:00.000Z", resumed = "2026-10-01T02:00:00.000Z", next = "2026-10-01T02:01:00.000Z";
const generation = "f".repeat(64);
const oldContext = { scopeDigest: "a".repeat(64), databaseIdentityDigest: "b".repeat(64), meteringScope: LOCAL_METERING_SCOPE };
const newContext = { ...oldContext, scopeDigest: "c".repeat(64) };
const oldActivation = "synthetic-old-local-three", newActivation = "synthetic-new-local-three";
const rightsTables = ["platform_accounts", "platform_entitlements", "platform_issuance_requests",
  "platform_issued_subscription_links", "platform_portal_access_requests", "platform_portal_edge_credentials", "platform_usage_counter_cursors"];

function tree(directory) {
  const result = [];
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) walk(child);
      else result.push([child.slice(directory.length + 1).replaceAll("\\", "/"), readFileSync(child).toString("base64")]);
    }
  };
  walk(directory);
  return result;
}

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), "new-activation-recovery-"));
  const db = new Database(join(parent, "synthetic.sqlite"));
  const store = createSqliteSubscriptionControlStore({ database: db });
  t.after(() => { if (db.open) db.close(); rmSync(parent, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); });
  const billingBinding = { plan: BASIC.offerVersionRef, validFrom: start, validUntil: "2026-10-31T00:00:00.000Z" };
  for (const n of [0, 1]) {
    store.createAccount({ id: `account-${n}`, ownerRef: `owner-${n}`, status: "active", createdAt: start, updatedAt: start });
    store.createEntitlement({ id: `ent-${n}`, accountId: `account-${n}`, status: "active",
      ...billingBinding, trafficLimitBytes: 1000000, createdAt: start, updatedAt: start });
    store.createIssuanceRequest({ id: `request-${n}`, accountId: `account-${n}`, entitlementId: `ent-${n}`, status: "issued",
      approvalRef: "synthetic", quantity: 1, nodeId: channels[0].channelRef, purpose: "synthetic", requestedByRef: "synthetic", createdAt: start, updatedAt: start });
  }
  const bindings = channels.flatMap((source, index) => [0, 1].map(n => ({ ...source, edgeCredentialRef: `synthetic-${index}-${n}`,
    accountId: `account-${n}`, entitlementId: `ent-${n}`, requestId: `request-${n}`, materialDigest: `sha256:${"d".repeat(64)}`,
    billingBinding: { ...billingBinding } })));
  const f = { parent, db, store, bindings, now: start, value: 1000, sourceReads: 0, writerCalls: 0, proofCalls: 0,
    oldDirectory: join(parent, "old-journal"), newDirectory: join(parent, "new-journal"),
    rights: () => rightsTables.map(name => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]),
    samples: () => db.prepare("SELECT * FROM platform_usage_samples ORDER BY id").all(),
    summary: () => ({ samples: db.prepare("SELECT count(*) AS count, coalesce(sum(total_bytes),0) AS bytes FROM platform_usage_samples").get(),
      rollupBytes: db.prepare("SELECT coalesce(sum(total_bytes),0) AS bytes FROM platform_usage_rollups").get().bytes }),
    billingUsage() {
      return [0, 1].reduce((total, n) => {
        const cycle = usageCycleForBinding(billingBinding, f.now);
        return total + summarizeUsageSamples(store.listUsageSamples({ accountId: `account-${n}`, entitlementId: `ent-${n}`,
          requestId: `request-${n}`, observedFrom: cycle.startedAt, observedTo: cycle.endedAt })).totalBytes;
      }, 0);
    },
    snapshots() {
      return channels.map((source, index) => ({ ...source, generation, observedAt: f.now,
        observations: [0, 1].map(n => ({ edgeCredentialRef: `synthetic-${index}-${n}`, uploadBytes: f.value, downloadBytes: f.value,
          ...(source.mode === "connections" ? { connectionId: `connection-${index}-${n}` } : {}) })) }));
    },
    proof(request) {
      f.proofCalls++;
      return { ok: true, proof: { version: 1, kind: "commerce_billing_chain",
        fromIdentityDigest: fullMeteringDigest(request.previousIdentity), toIdentityDigest: fullMeteringDigest(request.currentIdentity),
        evidenceDigest: "e".repeat(64), transitionCount: 1, changedAt } };
    },
    async runOld(mode, extra = {}) {
      const writer = createFullMeteringSampleWriter({ database: db, controlStore: store, meteringScope: LOCAL_METERING_SCOPE,
        activationId: oldActivation, readBindings: () => ({ entries: bindings }) });
      return runFullMeteringCollection({ directory: f.oldDirectory, context: oldContext, activationId: oldActivation, mode,
        meteringScope: LOCAL_METERING_SCOPE, nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: [] }),
        readSources: async () => { f.sourceReads++; return f.snapshots(); },
        readPlanSwitchProof: () => { throw new Error("unexpected_old_lane_proof"); },
        applySamples: samples => { f.writerCalls++; return writer(samples); }, ...extra });
    },
    recovery(mode, extra = {}) {
      const writer = createFullMeteringSampleWriter({ database: db, controlStore: store, meteringScope: LOCAL_METERING_SCOPE,
        activationId: newActivation, readBindings: () => ({ entries: bindings }) });
      return runFullMeteringNewActivationRecovery({
        mode, oldDirectory: f.oldDirectory, oldContext, oldActivationId: oldActivation,
        newDirectory: f.newDirectory, newContext, newActivationId: newActivation, meteringScope: LOCAL_METERING_SCOPE,
        oldWriterStopped: true, activationUnused: true, knownActivationIds: [oldActivation],
        nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: [] }),
        readSources: async () => { f.sourceReads++; return f.snapshots(); },
        readPlanSwitchProof: request => f.proof(request),
        applySamples: samples => { f.writerCalls++; return writer(samples); }, ...extra
      });
    },
    async collectNew(extra = {}) {
      const writer = createFullMeteringSampleWriter({ database: db, controlStore: store, meteringScope: LOCAL_METERING_SCOPE,
        activationId: newActivation, readBindings: () => ({ entries: bindings }) });
      return runFullMeteringCollection({ directory: f.newDirectory, context: newContext, activationId: newActivation, mode: "collect",
        meteringScope: LOCAL_METERING_SCOPE, nowFn: () => f.now, readInventory: () => ({ entries: structuredClone(bindings), retainedBindings: [] }),
        readSources: async () => { f.sourceReads++; return f.snapshots(); },
        readPlanSwitchProof: request => f.proof(request),
        applySamples: samples => { f.writerCalls++; return writer(samples); }, ...extra });
    },
    change() { bindings.filter(entry => entry.accountId === "account-0").forEach(entry => { entry.billingBinding.plan = PLUS.offerVersionRef; }); },
    async seed() { await f.runOld("initialize"); f.now = first; f.value = 1010; await f.runOld("collect"); }
  };
  return f;
}

function requestShape(changes = {}) {
  return {
    version: 1, meteringScope: LOCAL_METERING_SCOPE, oldJournalDirectory: "/private/old-journal",
    oldActivationId: oldActivation, oldContext, newActivationId: newActivation,
    newConfigPath: "/private/new-config.json", newConfigSha256: "c".repeat(64),
    oldWriterStopped: true, activationUnused: true, knownActivationIds: [oldActivation], ...changes
  };
}

test("command requires exact precheck or initialize-new-journal request digest", () => {
  const precheck = ["--precheck", "--request", "/private/request.json", "--request-sha256", "a".repeat(64)];
  assert.deepEqual(parseFullMeteringNewActivationRecoveryCommand(precheck), { mode: "precheck", requestPath: "/private/request.json", requestSha256: "a".repeat(64) });
  assert.deepEqual(parseFullMeteringNewActivationRecoveryCommand(["--initialize-new-journal", ...precheck.slice(1)]), { mode: "initialize", requestPath: "/private/request.json", requestSha256: "a".repeat(64) });
  for (const argv of [[], precheck.slice(0, 3), [...precheck, "--collect"], ["--initialize", ...precheck.slice(1)],
    ["--precheck", "--request", "relative", "--request-sha256", "a".repeat(64)]]) {
    assert.throws(() => parseFullMeteringNewActivationRecoveryCommand(argv), /command_invalid/);
  }
});

test("recovery request refuses dual activation, active old writer and incomplete known-id set", () => {
  assert.deepEqual(validateFullMeteringNewActivationRecoveryRequest(requestShape()), requestShape());
  for (const change of [
    { oldWriterStopped: false }, { activationUnused: false }, { newActivationId: oldActivation },
    { knownActivationIds: [oldActivation, newActivation] }, { knownActivationIds: ["other-activation"] },
    { extra: true }
  ]) {
    assert.throws(() => validateFullMeteringNewActivationRecoveryRequest(requestShape(change)), /recovery_request_invalid/);
  }
});

if (process.platform !== "linux") {
  test("production CLI refuses non-linux hosts before opening files", async () => {
    await assert.rejects(runFullMeteringNewActivationRecoveryCommand(["--precheck", "--request", "/private/request.json", "--request-sha256", "a".repeat(64)]),
      error => error.code === "full_metering_linux_required");
  });
}

test("recovery bounds reject overrun time and memory", () => {
  assert.equal(NEW_ACTIVATION_RECOVERY_LIMITS.maxDurationMs, 60_000);
  assert.equal(NEW_ACTIVATION_RECOVERY_LIMITS.maxRssBytes, 512 * 1024 * 1024);
  assert.doesNotThrow(() => assertNewActivationRecoveryBounds(Date.now() - 10, { rss: 1024 }));
  assert.throws(() => assertNewActivationRecoveryBounds(Date.now() - NEW_ACTIVATION_RECOVERY_LIMITS.maxDurationMs - 1, { rss: 1024 }), /time_limit/);
  assert.throws(() => assertNewActivationRecoveryBounds(Date.now(), { rss: NEW_ACTIVATION_RECOVERY_LIMITS.maxRssBytes + 1 }), /memory_limit/);
});

test("backup sha256 is chunked and does not keep a file-sized buffer", t => {
  const dir = mkdtempSync(join(tmpdir(), "recovery-backup-sha-"));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  const file = join(dir, "backup.bin");
  const piece = Buffer.alloc(1024 * 1024, 0x5a);
  const written = openSync(file, "w", 0o600);
  try { for (let index = 0; index < 64; index += 1) writeSync(written, piece); }
  finally { closeSync(written); }
  if (process.platform !== "win32") chmodSync(file, 0o600);
  const size = 64 * 1024 * 1024;
  const before = process.memoryUsage().arrayBuffers;
  const actual = protectedSha256(file);
  const increase = process.memoryUsage().arrayBuffers - before;
  assert.equal(actual, createHash("sha256").update(readFileSync(file)).digest("hex"));
  assert.ok(increase < size / 8, `arrayBuffers increased by ${increase}, file is ${size}`);
  symlinkSync(file, join(dir, "backup-link.bin"));
  assert.throws(() => protectedSha256(join(dir, "backup-link.bin")), error => error.code === "full_metering_file_invalid");
  const small = join(dir, "small.bin");
  writeFileSync(small, Buffer.from("stable-backup"));
  if (process.platform !== "win32") chmodSync(small, 0o600);
  assert.throws(() => protectedSha256(small, {
    onBound(target) { appendFileSync(target, Buffer.from("mutated")); }
  }), error => error.code === "full_metering_file_changed");
  // Windows stat mode cannot clear group/other bits, so the 0o644 rejection runs on Linux.
  if (process.platform !== "win32") {
    const loose = join(dir, "loose.bin");
    writeFileSync(loose, Buffer.from("loose"));
    chmodSync(loose, 0o644);
    assert.throws(() => protectedSha256(loose), error => error.code === "full_metering_permissions_invalid");
  }
});

test("changed and unchanged identities skip paused bytes and keep historical 120 plus 84 new", async t => {
  const f = fixture(t); await f.seed();
  const oldBytes = tree(f.oldDirectory), samplesBefore = f.samples(), rightsBefore = f.rights();
  assert.deepEqual(f.summary(), { samples: { count: 6, bytes: 120 }, rollupBytes: 120 });
  assert.equal(f.billingUsage(), 120);
  f.change(); f.now = resumed; f.value = 6000;
  const checked = await f.recovery("precheck");
  assert.equal(checked.status, "precheck_passed");
  assert.equal(checked.unchanged, 3); assert.equal(checked.billingChanged, 3); assert.equal(checked.admitted, 3);
  assert.equal(checked.sampleCount, 0); assert.equal(checked.recoveryReady, false);
  assert.equal(existsSync(f.newDirectory), false);
  assert.doesNotMatch(JSON.stringify(checked), /account-0|synthetic-0-0|request-0|ent-0|evidenceDigest/);
  const writes = f.writerCalls;
  const initialized = await f.recovery("initialize");
  assert.equal(initialized.status, "baseline_initialized");
  assert.equal(initialized.sampleCount, 0); assert.equal(initialized.recordedBytes, 0); assert.equal(f.writerCalls, writes);
  assert.deepEqual(f.samples(), samplesBefore); assert.deepEqual(f.rights(), rightsBefore);
  assert.equal(f.billingUsage(), 120); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  const created = readFullMeteringJournal({ directory: f.newDirectory, context: newContext });
  assert.equal(created.activationId, newActivation); assert.equal(created.sequence, 0);
  f.now = next; f.value = 6007;
  const collected = await f.collectNew();
  assert.equal(collected.sampleCount, 6); assert.equal(collected.recordedBytes, 84);
  assert.deepEqual(f.summary(), { samples: { count: 12, bytes: 204 }, rollupBytes: 204 });
  assert.equal(f.billingUsage(), 204); assert.deepEqual(f.rights(), rightsBefore); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  for (const row of samplesBefore) assert.deepEqual(f.samples().find(current => current.id === row.id), row);
  const newSamples = f.samples().filter(row => !samplesBefore.some(old => old.id === row.id));
  assert.ok(newSamples.every(row => row.interval_started_at === resumed && row.interval_ended_at === next && row.total_bytes === 14));
  assert.equal((await f.collectNew()).sampleCount, 0);
  assert.equal(f.db.pragma("integrity_check", { simple: true }), "ok");
});

test("unchanged identities need no proof and still skip the paused interval", async t => {
  const f = fixture(t); await f.seed();
  f.now = resumed; f.value = 6000;
  const initialized = await f.recovery("initialize", { readPlanSwitchProof: () => { throw new Error("unexpected_proof"); } });
  assert.equal(initialized.unchanged, 6); assert.equal(initialized.billingChanged, 0); assert.equal(initialized.admitted, 0);
  assert.equal(initialized.sampleCount, 0); assert.equal(f.billingUsage(), 120);
  f.now = next; f.value = 6007;
  assert.equal((await f.collectNew({ readPlanSwitchProof: () => { throw new Error("unexpected_proof"); } })).recordedBytes, 84);
  assert.equal(f.billingUsage(), 204);
});

test("old pending batch is refused and native-style bypass is not offered", async t => {
  const f = fixture(t); await f.seed(); f.now = resumed; f.value = 1020;
  await assert.rejects(f.runOld("collect", { onStage(stage) { if (stage === "pending_durable") throw new Error("synthetic_pause"); } }), /synthetic_pause/);
  assert.equal(existsSync(join(f.oldDirectory, "pending.json")), true);
  const before = f.summary(), oldBytes = tree(f.oldDirectory), reads = f.sourceReads;
  await assert.rejects(f.recovery("initialize"), error => error.code === "full_metering_pending_recovery_required");
  assert.equal(existsSync(f.newDirectory), false); assert.equal(f.sourceReads, reads);
  assert.deepEqual(f.summary(), before); assert.deepEqual(tree(f.oldDirectory), oldBytes);
});

test("crash before new journal remains retryable; leftover directory is not auto-deleted", async t => {
  const f = fixture(t); await f.seed(); f.now = resumed; f.value = 6000;
  const before = f.summary(), oldBytes = tree(f.oldDirectory), rightsBefore = f.rights();
  await assert.rejects(f.recovery("initialize", { readSources: async () => { throw new Error("synthetic_source_failed"); } }), /synthetic_source_failed/);
  assert.equal(existsSync(f.newDirectory), false); assert.deepEqual(tree(f.oldDirectory), oldBytes);
  assert.deepEqual(f.summary(), before); assert.deepEqual(f.rights(), rightsBefore);
  const initialized = await f.recovery("initialize");
  assert.equal(initialized.sampleCount, 0); assert.equal(existsSync(f.newDirectory), true);
  mkdirSync(join(f.parent, "other-new-journal"));
  await assert.rejects(f.recovery("initialize", { newDirectory: join(f.parent, "other-new-journal") }), error => error.code === "full_metering_new_journal_exists");
  assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(f.summary(), before);
});

test("collect crash after the new baseline recovers exactly once without charging the pause", async t => {
  const f = fixture(t); await f.seed(); f.now = resumed; f.value = 6000;
  await f.recovery("initialize");
  f.now = next; f.value = 6007;
  await assert.rejects(f.collectNew({ onStage(stage) { if (stage === "pending_durable") throw new Error("synthetic_interruption"); } }), /synthetic_interruption/);
  assert.equal(existsSync(join(f.newDirectory, "pending.json")), true);
  assert.equal(f.billingUsage(), 120);
  assert.equal((await f.collectNew()).recordedBytes, 0);
  assert.deepEqual(f.summary(), { samples: { count: 12, bytes: 204 }, rollupBytes: 204 });
  assert.equal(existsSync(join(f.newDirectory, "pending.json")), false);
  assert.equal(f.billingUsage(), 204);
});

test("repeat initialize refuses to overwrite the new journal or old evidence", async t => {
  const f = fixture(t); await f.seed(); f.now = resumed; f.value = 6000;
  await f.recovery("initialize");
  const oldBytes = tree(f.oldDirectory), newBytes = tree(f.newDirectory), before = f.summary();
  await assert.rejects(f.recovery("initialize"), error => error.code === "full_metering_new_journal_exists");
  assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(tree(f.newDirectory), newBytes);
  assert.deepEqual(f.summary(), before); assert.equal(f.billingUsage(), 120);
});

test("dual activation and live old writer are rejected before any new journal write", async t => {
  const f = fixture(t); await f.seed(); const before = f.summary(), oldBytes = tree(f.oldDirectory);
  f.now = resumed; f.value = 6000;
  await assert.rejects(f.recovery("initialize", { oldWriterStopped: false }), error => error.code === "full_metering_old_writer_active");
  await assert.rejects(f.recovery("initialize", { activationUnused: false }), error => error.code === "full_metering_activation_not_unique");
  await assert.rejects(f.recovery("initialize", { newActivationId: oldActivation }), error => error.code === "full_metering_activation_reused");
  await assert.rejects(f.recovery("initialize", { knownActivationIds: [oldActivation, newActivation] }), error => error.code === "full_metering_activation_not_unique");
  mkdirSync(join(f.oldDirectory, "writer.lock"));
  await assert.rejects(f.recovery("initialize"), error => error.code === "full_metering_old_writer_lock");
  rmSync(join(f.oldDirectory, "writer.lock"), { recursive: true, force: true });
  assert.equal(existsSync(f.newDirectory), false); assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(f.summary(), before);
});

test("unmatched retained bindings do not block precheck", async t => {
  const f = fixture(t); await f.seed();
  f.now = resumed; f.value = 6000;
  const retained = { channelRef: channels[0].channelRef, edgeCredentialRef: "synthetic-retained-unmatched", materialDigest: `sha256:${"e".repeat(64)}` };
  const oldBytes = tree(f.oldDirectory);
  const checked = await f.recovery("precheck", {
    readInventory: () => ({ entries: structuredClone(f.bindings), retainedBindings: [retained] })
  });
  assert.equal(checked.status, "precheck_passed");
  assert.equal(checked.unchanged, 6); assert.equal(checked.billingChanged, 0); assert.equal(checked.sampleCount, 0);
  assert.equal(existsSync(f.newDirectory), false); assert.deepEqual(tree(f.oldDirectory), oldBytes);
});

test("retained binding matching an old identity stays unresolved", async t => {
  const f = fixture(t); await f.seed();
  f.now = resumed; f.value = 6000;
  const matched = structuredClone(f.bindings[0]);
  const entries = f.bindings.filter(entry => entry.channelRef !== matched.channelRef || entry.edgeCredentialRef !== matched.edgeCredentialRef);
  const before = f.summary(), oldBytes = tree(f.oldDirectory);
  await assert.rejects(f.recovery("precheck", {
    readInventory: () => ({ entries: structuredClone(entries), retainedBindings: [matched] })
  }), error => error.code === "full_metering_identity_unresolved");
  assert.equal(existsSync(f.newDirectory), false);
  assert.deepEqual(tree(f.oldDirectory), oldBytes); assert.deepEqual(f.summary(), before);
});

test("foreign activation samples remain distinct; this is not cross-lane deduplication", t => {
  const f = fixture(t);
  const input = { binding: f.bindings[0], generation, delta: { uploadBytes: 3, downloadBytes: 7, totalBytes: 10, intervalStartedAt: resumed, intervalEndedAt: next } };
  const oldSample = makeFullMeteringSample({ ...input, activationId: oldActivation });
  const newSample = makeFullMeteringSample({ ...input, activationId: newActivation });
  assert.notEqual(oldSample.record.id, newSample.record.id);
  const writer = createFullMeteringSampleWriter({ database: f.db, controlStore: f.store, meteringScope: LOCAL_METERING_SCOPE,
    activationId: newActivation, readBindings: () => ({ entries: f.bindings }) });
  assert.throws(() => writer([oldSample]), /full_metering_sample_scope_invalid/);
  assert.deepEqual(f.summary(), { samples: { count: 0, bytes: 0 }, rollupBytes: 0 });
});
